import * as SQLite from 'expo-sqlite'
import { log } from './logger'

let _db: SQLite.SQLiteDatabase | null = null

export function getDB(): SQLite.SQLiteDatabase {
  if (!_db) throw new Error('DB not initialized — appeler initDB() au démarrage')
  return _db
}

// Version courante du schéma SQLite local. Incrémenter à chaque migration ci-dessous (ORA-061).
const SCHEMA_VERSION = 1

export async function initDB(): Promise<void> {
  const db = await SQLite.openDatabaseAsync('ova.db')
  _db = db
  // Schéma de base — idempotent. local_sessions a désormais une PRIMARY KEY (ORA-062) :
  // sur une install neuve la table est directement correcte ; les installs existantes
  // (ancienne table sans PK) sont reconstruites par la migration versionnée plus bas.
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS local_sets (
      id TEXT PRIMARY KEY,
      exercise_id TEXT NOT NULL,
      weight_kg REAL,
      reps INTEGER,
      volume REAL,
      session_id TEXT NOT NULL,
      logged_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_sessions (
      id TEXT PRIMARY KEY,
      total_volume_kg REAL,
      logged_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sets_exercise ON local_sets(exercise_id, logged_at DESC);
  `)

  // ─── Migrations versionnées (ORA-061) ───────────────────────────────────────
  // PRAGMA user_version persiste un entier dans le fichier DB → migrations rejouables
  // sans risque. CREATE IF NOT EXISTS étant no-op sur base existante, les changements
  // de schéma d'une table déjà créée DOIVENT passer par ici.
  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
  const version = versionRow?.user_version ?? 0

  if (version < 1) {
    // ORA-062 — l'ancienne local_sessions (id TEXT NOT NULL, sans PK) laisse INSERT OR REPLACE
    // se comporter comme un INSERT → doublons au retry. On la reconstruit avec PRIMARY KEY si
    // son schéma ne la contient pas (les doublons existants sont dédupliqués par INSERT OR REPLACE).
    const schemaRow = await db.getFirstAsync<{ sql: string | null }>(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'local_sessions'`
    )
    const sql = schemaRow?.sql ?? ''
    if (sql && !/PRIMARY KEY/i.test(sql)) {
      await db.execAsync(`
        CREATE TABLE local_sessions_new (
          id TEXT PRIMARY KEY,
          total_volume_kg REAL,
          logged_at INTEGER NOT NULL
        );
        INSERT OR REPLACE INTO local_sessions_new (id, total_volume_kg, logged_at)
          SELECT id, total_volume_kg, logged_at FROM local_sessions;
        DROP TABLE local_sessions;
        ALTER TABLE local_sessions_new RENAME TO local_sessions;
      `)
    }
  }

  if (version < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`)
  }
}

export async function insertLocalSet(params: {
  id: string
  exercise_id: string
  weight_kg: number
  reps: number
  session_id: string
  logged_at: number
}): Promise<void> {
  const db = getDB()
  await db.runAsync(
    `INSERT OR REPLACE INTO local_sets (id, exercise_id, weight_kg, reps, volume, session_id, logged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params.id,
    params.exercise_id,
    params.weight_kg,
    params.reps,
    params.weight_kg * params.reps,
    params.session_id,
    params.logged_at
  )
}

export async function insertLocalSession(params: {
  id: string
  total_volume_kg: number
  logged_at: number
}): Promise<void> {
  const db = getDB()
  await db.runAsync(
    `INSERT OR REPLACE INTO local_sessions (id, total_volume_kg, logged_at) VALUES (?, ?, ?)`,
    params.id,
    params.total_volume_kg,
    params.logged_at
  )
}

export async function getLastLocalSet(
  exerciseId: string
): Promise<{ weight_kg: number; reps: number } | null> {
  try {
    const db = getDB()
    const row = await db.getFirstAsync<{ weight_kg: number; reps: number }>(
      `SELECT weight_kg, reps FROM local_sets
       WHERE exercise_id = ?
       ORDER BY logged_at DESC
       LIMIT 1`,
      exerciseId
    )
    return row ?? null
  } catch {
    return null
  }
}

// ─── Top3 PR par exercice — SQLite uniquement (ORA-027) ───────────────────────
// Remplace l'ancien appel Supabase de WorkoutContext.addExercise : zéro réseau pendant
// la séance (règle #3) + fonctionne offline (SQLite réamorcé par backfillLocalFromSupabase).

export type Top3 = { pr1: number; pr2: number | null; pr3: number | null }
export interface PrTop3 {
  charge: Top3
  serie: Top3
  exercice: Top3
}

function toTop3(values: number[]): Top3 {
  return { pr1: values[0] ?? 0, pr2: values[1] ?? null, pr3: values[2] ?? null }
}

export async function getExercisePrTop3(exerciseId: string): Promise<PrTop3> {
  const empty: Top3 = { pr1: 0, pr2: null, pr3: null }
  try {
    const db = getDB()
    // charge = poids distincts ; serie = volume (poids×reps) distinct ; exercice = volume total/séance distinct
    const charge = await db.getAllAsync<{ v: number }>(
      `SELECT DISTINCT weight_kg AS v FROM local_sets
       WHERE exercise_id = ? AND weight_kg > 0 AND reps > 0
       ORDER BY v DESC LIMIT 3`,
      exerciseId
    )
    const serie = await db.getAllAsync<{ v: number }>(
      `SELECT DISTINCT volume AS v FROM local_sets
       WHERE exercise_id = ? AND weight_kg > 0 AND reps > 0
       ORDER BY v DESC LIMIT 3`,
      exerciseId
    )
    const exercice = await db.getAllAsync<{ v: number }>(
      `SELECT DISTINCT v FROM (
         SELECT SUM(volume) AS v FROM local_sets
         WHERE exercise_id = ? AND weight_kg > 0 AND reps > 0
         GROUP BY session_id
       ) ORDER BY v DESC LIMIT 3`,
      exerciseId
    )
    return {
      charge: toTop3(charge.map((r) => r.v)),
      serie: toTop3(serie.map((r) => r.v)),
      exercice: toTop3(exercice.map((r) => r.v)),
    }
  } catch {
    return { charge: empty, serie: empty, exercice: empty }
  }
}

// ─── Backfill SQLite depuis Supabase (ORA-024) ────────────────────────────────
// Après réinstall / nouvel appareil / clear data, local_sets est vide alors que
// Supabase est plein → ghost + predictor + top3 PR silencieusement HS. On réamorce
// au 1er lancement post-auth SI les tables locales sont vides. Idempotent : ne fait
// rien si déjà peuplé (un save normal alimente SQLite, donc backfill ne re-tourne pas).

// Supabase renvoie les jointures to-one tantôt en objet, tantôt en tableau selon le cas →
// on normalise via firstOf().
interface BackfillWorkout {
  started_at: string | null
}
interface BackfillWE {
  exercise_id: string
  workout_id: string
  workouts: BackfillWorkout | BackfillWorkout[] | null
}
interface BackfillSetRow {
  id: string
  weight_kg: number | null
  reps: number | null
  logged_at: string | null
  set_type: string | null
  workout_exercises: BackfillWE | BackfillWE[] | null
}

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

// Garde anti-concurrence + handle attendable (cause 3). Le backfill est déclenché au boot
// ET sur SIGNED_IN (cf. _layout.tsx) → sans garde, deux exécutions concurrentes ; avec garde,
// les appelants partagent la même promesse. addExercise peut attendre `whenBackfillSettled()`
// pour ne pas lire un top3 vide pendant qu'un backfill de boot est encore en cours.
let backfillInFlight: Promise<void> | null = null

export function whenBackfillSettled(): Promise<void> {
  return backfillInFlight ?? Promise.resolve()
}

export function backfillLocalFromSupabase(): Promise<void> {
  if (backfillInFlight) return backfillInFlight
  backfillInFlight = runBackfill().finally(() => {
    backfillInFlight = null
  })
  return backfillInFlight
}

async function runBackfill(): Promise<void> {
  try {
    const db = getDB()
    const countRow = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM local_sets`)
    if ((countRow?.n ?? 0) > 0) return // déjà peuplé → rien à faire

    // Import paresseux : garde db.ts chargeable sans le client Supabase (tests, démarrage léger).
    const { supabase } = await import('./supabase')
    // getSession() lit la session stockée (SecureStore) sans réseau → fiable dès le boot,
    // contrairement à getUser() qui peut renvoyer null tant que le token n'est pas rafraîchi (cause 3).
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    const { data: setData } = await supabase
      .from('workout_sets')
      .select(
        `
        id, weight_kg, reps, logged_at, set_type,
        workout_exercises!inner (
          exercise_id, workout_id,
          workouts!inner ( user_id, started_at )
        )
      `
      )
      .eq('workout_exercises.workouts.user_id', user.id)
      .eq('set_type', 'working')

    const rows = (setData ?? []) as BackfillSetRow[]

    const { data: workoutData } = await supabase
      .from('workouts')
      .select('id, total_volume_kg, started_at')
      .eq('user_id', user.id)

    const workouts = (workoutData ?? []) as {
      id: string
      total_volume_kg: number | null
      started_at: string | null
    }[]

    if (rows.length === 0 && workouts.length === 0) return

    await db.withTransactionAsync(async () => {
      for (const r of rows) {
        const we = firstOf(r.workout_exercises)
        if (!we) continue
        const w = firstOf(we.workouts)
        const weight = r.weight_kg ?? 0
        const reps = r.reps ?? 0
        if (weight <= 0 || reps <= 0) continue
        const loggedAt = r.logged_at
          ? new Date(r.logged_at).getTime()
          : w?.started_at
            ? new Date(w.started_at).getTime()
            : Date.now()
        await db.runAsync(
          `INSERT OR REPLACE INTO local_sets (id, exercise_id, weight_kg, reps, volume, session_id, logged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          r.id,
          we.exercise_id,
          weight,
          reps,
          weight * reps,
          we.workout_id,
          loggedAt
        )
      }
      for (const w of workouts) {
        await db.runAsync(
          `INSERT OR REPLACE INTO local_sessions (id, total_volume_kg, logged_at) VALUES (?, ?, ?)`,
          w.id,
          w.total_volume_kg ?? 0,
          w.started_at ? new Date(w.started_at).getTime() : Date.now()
        )
      }
    })
  } catch (e) {
    // Best-effort — l'absence de backfill n'est pas bloquante (ghost/predictor/top3 PR reprendront
    // au prochain save). On log au lieu d'avaler en silence (cause 3 : échec backfill = PRs muets).
    log.error('[db] backfillLocalFromSupabase', e)
  }
}
