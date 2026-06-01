import { supabase } from './supabase'

type SlotHoraire = 'matin' | 'apres_midi' | 'soir' | 'nuit'

// ─── 41 dimensions — 1 par champ WorkoutMetricsData ──────────────────────────

interface MyoRaw {
  // core (colonnes individuelles)
  volume_kg: number
  densite: number
  nb_series: number
  recuperation: number
  nb_pr: number
  streak: number
  // extended → z_extended JSONB
  volume_max_par_exercice: number          // max(volume_par_exercice_kg)
  volume_max_serie_kg: number
  mean_volume_max_serie_par_ex: number     // mean(volume_max_serie_par_exercice_kg)
  poids_max_kg: number
  mean_poids_max_par_ex: number            // mean(poids_max_par_exercice_kg)
  charge_relative: number
  std_charge_relative_par_ex: number       // std(charge_relative_par_exercice) — consistance intensité
  nb_exercices: number
  nb_series_par_ex_moy: number
  max_nb_series_par_ex: number             // max(nb_series_par_exercice)
  duree_sec: number
  temps_repos_total_sec: number
  temps_repos_moy_sec: number
  std_temps_repos_par_ex: number           // std(temps_repos_moyen_par_exercice_sec) — consistance repos
  temps_actif_sec: number
  ratio_actif: number
  heure_debut_h: number                    // heure float 0–23
  slot_horaire_num: number                 // matin=0 apres_midi=1 soir=2 nuit=3
  max_1rm_kg: number
  nb_exercices_avec_pr: number             // count(pr_par_exercice === true)
  nb_muscles: number
  hhi_muscles: number                      // Σ(vol_i/total)² — concentration musculaire
  share_dominant: number                   // vol[dominant]/total — spécialisation 0–1
  poids_corps_kg: number
  age_ans: number                          // toujours z vs population (std≈0 personnelle)
  temps_depuis_sec: number
  mean_evolution_volume: number
  mean_evolution_1rm: number
  volume_7j_kg: number
  volume_total_30j_kg: number              // sum(volume_par_muscle_30j_kg)
  volume_total_90j_kg: number              // sum(volume_par_muscle_90j_kg)
  evolution_repos_moy_sec: number
  nb_seances_30j: number
  frequence_hebdo: number
  max_freq_muscle_7j: number
}

interface Baselines { n: number; mean: MyoRaw; std: MyoRaw }

// ─── Fallback population ──────────────────────────────────────────────────────

const POP_MEAN: MyoRaw = {
  volume_kg: 5000, densite: 80, nb_series: 20, recuperation: 55, nb_pr: 1, streak: 3,
  volume_max_par_exercice: 2000, volume_max_serie_kg: 500, mean_volume_max_serie_par_ex: 400,
  poids_max_kg: 80, mean_poids_max_par_ex: 60, charge_relative: 65, std_charge_relative_par_ex: 10,
  nb_exercices: 5, nb_series_par_ex_moy: 4, max_nb_series_par_ex: 6,
  duree_sec: 3600, temps_repos_total_sec: 1800, temps_repos_moy_sec: 120, std_temps_repos_par_ex: 30,
  temps_actif_sec: 1800, ratio_actif: 0.5, heure_debut_h: 18, slot_horaire_num: 2,
  max_1rm_kg: 100, nb_exercices_avec_pr: 1, nb_muscles: 4, hhi_muscles: 0.35, share_dominant: 0.40,
  poids_corps_kg: 75, age_ans: 28, temps_depuis_sec: 259200,
  mean_evolution_volume: 0, mean_evolution_1rm: 0,
  volume_7j_kg: 10000, volume_total_30j_kg: 40000, volume_total_90j_kg: 120000,
  evolution_repos_moy_sec: 0, nb_seances_30j: 8, frequence_hebdo: 3, max_freq_muscle_7j: 2,
}

const POP_STD: MyoRaw = {
  volume_kg: 3000, densite: 40, nb_series: 8, recuperation: 20, nb_pr: 1.5, streak: 2.5,
  volume_max_par_exercice: 1000, volume_max_serie_kg: 300, mean_volume_max_serie_par_ex: 250,
  poids_max_kg: 40, mean_poids_max_par_ex: 30, charge_relative: 15, std_charge_relative_par_ex: 8,
  nb_exercices: 2, nb_series_par_ex_moy: 2, max_nb_series_par_ex: 3,
  duree_sec: 1800, temps_repos_total_sec: 900, temps_repos_moy_sec: 60, std_temps_repos_par_ex: 20,
  temps_actif_sec: 900, ratio_actif: 0.2, heure_debut_h: 4, slot_horaire_num: 1,
  max_1rm_kg: 50, nb_exercices_avec_pr: 1.5, nb_muscles: 2, hhi_muscles: 0.15, share_dominant: 0.2,
  poids_corps_kg: 15, age_ans: 8, temps_depuis_sec: 172800,
  mean_evolution_volume: 1000, mean_evolution_1rm: 10,
  volume_7j_kg: 5000, volume_total_30j_kg: 20000, volume_total_90j_kg: 60000,
  evolution_repos_moy_sec: 30, nb_seances_30j: 4, frequence_hebdo: 1.5, max_freq_muscle_7j: 1.5,
}

const DIM_LABELS: Record<keyof MyoRaw, string> = {
  volume_kg: 'volume', densite: 'intensité', nb_series: 'structure',
  recuperation: 'récupération', nb_pr: 'performance', streak: 'régularité',
  volume_max_par_exercice: 'volume max exercice', volume_max_serie_kg: 'volume max série',
  mean_volume_max_serie_par_ex: 'vol. max série moy/ex', poids_max_kg: 'force max',
  mean_poids_max_par_ex: 'force moy/ex', charge_relative: 'charge relative',
  std_charge_relative_par_ex: 'consistance intensité', nb_exercices: 'diversité',
  nb_series_par_ex_moy: 'séries/exercice', max_nb_series_par_ex: 'max séries/ex',
  duree_sec: 'durée', temps_repos_total_sec: 'repos total', temps_repos_moy_sec: 'repos moyen',
  std_temps_repos_par_ex: 'consistance repos', temps_actif_sec: 'temps actif',
  ratio_actif: 'ratio actif', heure_debut_h: 'heure début', slot_horaire_num: 'créneau',
  max_1rm_kg: '1RM max', nb_exercices_avec_pr: 'exercices avec PR', nb_muscles: 'muscles',
  hhi_muscles: 'concentration musculaire', share_dominant: 'dominance musculaire',
  poids_corps_kg: 'poids corps', age_ans: 'âge', temps_depuis_sec: 'fraîcheur',
  mean_evolution_volume: 'progression volume', mean_evolution_1rm: 'progression 1RM',
  volume_7j_kg: 'charge 7j', volume_total_30j_kg: 'charge 30j', volume_total_90j_kg: 'charge 90j',
  evolution_repos_moy_sec: 'évol. repos', nb_seances_30j: 'fréquence 30j',
  frequence_hebdo: 'fréquence hebdo', max_freq_muscle_7j: 'fréq. musculaire',
}

const SLOT_MAP: Record<SlotHoraire, number> = { matin: 0, apres_midi: 1, soir: 2, nuit: 3 }
const CORE_KEYS = new Set<keyof MyoRaw>(['volume_kg', 'densite', 'nb_series', 'recuperation', 'nb_pr', 'streak'])

// ─── Famille 6 — 17 dims musculaires ─────────────────────────────────────────

export const MUSCLE_17_LABELS: string[] = [
  'Pec claviculaire', 'Pec sternal',
  'Deltoïde ant.', 'Deltoïde médial', 'Deltoïde post.',
  'Grand dorsal', 'Trapèze', 'Grand rond', 'Rhomboïdes', 'Érecteurs rachis',
  'Biceps', 'Triceps',
  'Quadriceps', 'Ischio-jambiers', 'Fessiers', 'Mollets', 'Core',
]

// Pec + delt : dim résolu par fascicle exact (NULL fascicle → set ignoré)
const FASCICLE_DIM: Record<string, Record<string, number>> = {
  grand_pectoral: { faisceau_claviculaire: 0, faisceau_sternal: 1, faisceau_abdominal: 1 },
  deltoide:       { faisceau_anterieur: 2, faisceau_median: 3, faisceau_posterieur: 4 },
}

// Autres muscles : toutes fascicules groupées dans le même dim
const MUSCLE_DIM: Record<string, number> = {
  grand_dorsal: 5, trapeze: 6, grand_rond: 7, rhomboide: 8, erecteurs_rachis: 9,
  biceps: 10, triceps: 11,
  quadriceps: 12, ischio_jambiers: 13,
  fessier_maximus: 14, fessier_median: 14, fessier_minimus: 14,
  mollets: 15, abdominaux: 16,
}

// Population baselines Phase 0 — remplacés par rolling personal en Phase 1
const MUSCLE_POP_MEAN = [1000, 2000, 800, 600, 400, 2000, 1000, 500, 600, 800, 1000, 1200, 3000, 1500, 2000, 1500, 500]
const MUSCLE_POP_STD  = [800,  1500, 600, 500, 350, 1500, 800,  400, 500, 600, 800,  1000, 2000, 1200, 1500, 1200, 400]

// ─── Hash déterministe ────────────────────────────────────────────────────────

function djb2(s: string): number {
  let h = 5381 >>> 0
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0
  return h
}

// ─── Helpers agrégation ───────────────────────────────────────────────────────

function clampZ(z: number): number {
  return Number.isFinite(z) ? Math.max(-3, Math.min(3, z)) : 0
}

function rVals(obj: Record<string, number> | null | undefined): number[] {
  return Object.values(obj ?? {}).filter(v => Number.isFinite(v))
}

function rValsNN(obj: Record<string, number | null> | null | undefined): number[] {
  return Object.values(obj ?? {}).filter((v): v is number => v !== null && Number.isFinite(v))
}

function rMax(vals: number[]): number { return vals.length ? Math.max(...vals) : 0 }
function rMean(vals: number[]): number {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}
function rStd(vals: number[]): number {
  if (vals.length < 2) return 0
  const m = rMean(vals)
  return Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length)
}
function rSum(vals: number[]): number { return vals.reduce((a, b) => a + b, 0) }
function rCountTrue(obj: Record<string, boolean> | null | undefined): number {
  return Object.values(obj ?? {}).filter(Boolean).length
}
function hhiScore(obj: Record<string, number> | null | undefined, total: number): number {
  if (!total) return 0.25
  return rVals(obj).reduce((s, v) => s + (v / total) ** 2, 0)
}
function parseHour(isoStr: string): number {
  const d = new Date(isoStr)
  return d.getHours() + d.getMinutes() / 60
}

// ─── Muscle dim helpers ───────────────────────────────────────────────────────

function resolveDim(muscle: string, fascicle: string | null): number {
  const map = FASCICLE_DIM[muscle]
  if (map) return fascicle ? (map[fascicle] ?? -1) : -1
  return MUSCLE_DIM[muscle] ?? -1
}

export interface EmRow {
  exercise_id: string
  muscle: string
  fascicle: string | null
  activation_pct: number
}

export function computeMuscleDims(
  setsByExercise: Record<string, Array<{ weight_kg: number; reps: number }>>,
  emRows: EmRow[],
): number[] {
  const dims = new Array<number>(17).fill(0)
  for (const row of emRows) {
    const dim = resolveDim(row.muscle, row.fascicle)
    if (dim === -1) continue
    const sets = setsByExercise[row.exercise_id] ?? []
    dims[dim] += sets.reduce((s, set) => s + set.weight_kg * set.reps * (row.activation_pct / 100), 0)
  }
  return dims
}

// ─── Extraction MyoRaw depuis workout_metrics.data ───────────────────────────

function extractRaw(d: any, popMean: MyoRaw): MyoRaw {
  const volTotal: number = d?.volume_total_kg ?? 0
  const dominant: string | null = d?.muscle_primaire_dominant ?? null
  return {
    volume_kg: volTotal,
    densite: d?.densite_kg_par_min ?? 0,
    nb_series: d?.nb_series_total ?? 0,
    recuperation: d?.score_recuperation_estime ?? 50,
    nb_pr: d?.nb_pr_seance ?? 0,
    streak: d?.streak_semaines_actives ?? 0,
    volume_max_par_exercice: rMax(rVals(d?.volume_par_exercice_kg)),
    volume_max_serie_kg: d?.volume_max_serie_kg ?? 0,
    mean_volume_max_serie_par_ex: rMean(rVals(d?.volume_max_serie_par_exercice_kg)),
    poids_max_kg: d?.poids_max_seance_kg ?? 0,
    mean_poids_max_par_ex: rMean(rVals(d?.poids_max_par_exercice_kg)),
    charge_relative: d?.charge_relative_seance ?? 65,
    std_charge_relative_par_ex: rStd(rValsNN(d?.charge_relative_par_exercice)),
    nb_exercices: d?.nb_exercices ?? 0,
    nb_series_par_ex_moy: d?.nb_series_par_exercise_moy ?? 0,
    max_nb_series_par_ex: rMax(rVals(d?.nb_series_par_exercice)),
    duree_sec: d?.duree_totale_seance ?? 0,
    temps_repos_total_sec: d?.temps_repos_total_sec ?? 0,
    temps_repos_moy_sec: d?.temps_repos_moyen_seance_sec ?? 120,
    std_temps_repos_par_ex: rStd(rValsNN(d?.temps_repos_moyen_par_exercice_sec)),
    temps_actif_sec: d?.temps_actif_sec ?? 0,
    ratio_actif: d?.ratio_actif_repos ?? 0.5,
    heure_debut_h: d?.heure_debut ? parseHour(d.heure_debut) : 18,
    slot_horaire_num: d?.slot_horaire != null ? (SLOT_MAP[d.slot_horaire as SlotHoraire] ?? 2) : 2,
    max_1rm_kg: rMax(rVals(d?.estimated_1rm_par_exercice_kg)),
    nb_exercices_avec_pr: rCountTrue(d?.pr_par_exercice),
    nb_muscles: (d?.muscles_sollicites ?? []).length,
    hhi_muscles: hhiScore(d?.volume_par_muscle_kg, volTotal),
    share_dominant: dominant && volTotal > 0 ? ((d?.volume_par_muscle_kg?.[dominant] ?? 0) / volTotal) : 0,
    poids_corps_kg: d?.poids_corps_kg ?? popMean.poids_corps_kg,
    age_ans: d?.age_ans ?? popMean.age_ans,
    temps_depuis_sec: d?.temps_depuis_derniere_seance_sec ?? 259200,
    mean_evolution_volume: rMean(rValsNN(d?.evolution_volume_par_exercice)),
    mean_evolution_1rm: rMean(rValsNN(d?.evolution_1rm_par_exercice)),
    volume_7j_kg: d?.volume_7_derniers_jours_kg ?? 0,
    volume_total_30j_kg: rSum(rVals(d?.volume_par_muscle_30j_kg)),
    volume_total_90j_kg: rSum(rVals(d?.volume_par_muscle_90j_kg)),
    evolution_repos_moy_sec: d?.evolution_repos_moyen_seance_sec ?? 0,
    nb_seances_30j: d?.nb_seances_30_derniers_jours ?? 0,
    frequence_hebdo: d?.frequence_hebdo_moyenne ?? 0,
    max_freq_muscle_7j: rMax(rVals(d?.frequence_sollicitation_par_muscle_7j)),
  }
}

// ─── Baselines ────────────────────────────────────────────────────────────────

async function fetchBaselines(userId: string, beforeIso: string): Promise<Baselines> {
  const { data: wIds } = await supabase
    .from('workouts')
    .select('id')
    .eq('user_id', userId)
    .lt('started_at', beforeIso)
    .order('started_at', { ascending: false })
    .limit(30)

  if (!wIds?.length) return { n: 0, mean: { ...POP_MEAN }, std: { ...POP_STD } }

  const { data: mData } = await supabase
    .from('workout_metrics')
    .select('data')
    .in('workout_id', (wIds as any[]).map((w: any) => w.id))

  const rows: MyoRaw[] = ((mData ?? []) as any[])
    .map((r: any) => extractRaw(r.data, POP_MEAN))
    .filter((r: MyoRaw) => r.volume_kg > 0)

  if (rows.length < 5) return { n: rows.length, mean: { ...POP_MEAN }, std: { ...POP_STD } }

  const keys = Object.keys(POP_MEAN) as (keyof MyoRaw)[]
  const mean = {} as MyoRaw
  const std = {} as MyoRaw
  for (const k of keys) {
    const vals = rows.map(r => r[k])
    const m = vals.reduce((a, b) => a + b, 0) / vals.length
    mean[k] = m
    std[k] = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1
  }

  // age_ans : toujours comparé à la population (std personnelle ≈ 0)
  mean.age_ans = POP_MEAN.age_ans
  std.age_ans = POP_STD.age_ans

  return { n: rows.length, mean, std }
}

// ─── API publique ─────────────────────────────────────────────────────────────

export interface LocalSessionMetrics {
  volume_kg: number
  densite: number
  nb_series: number
  nb_exercices: number
  nb_pr: number
  streak: number
  frequence_hebdo: number
  nb_seances_30j: number
  duree_sec: number
  temps_repos_moy_sec: number
  ratio_actif: number
  poids_max_kg: number
  charge_relative: number
  muscleDims?: number[]
}

// Calcul synchrone des sessionValues depuis les métriques locales (population baselines).
// Utilisé pour le preview dans summary.tsx avant le save Supabase.
export function computeSessionValues(m: LocalSessionMetrics): number[][] {
  const zn = (v: number, k: keyof MyoRaw) =>
    clampZ((v - POP_MEAN[k]) / (POP_STD[k] || 1))
  const norm = (z: number) => (z + 3) / 6

  return [
    [zn(m.volume_kg, 'volume_kg'), zn(m.nb_series, 'nb_series'), 0, 0, 0, zn(m.densite, 'densite')].map(norm),
    [zn(m.densite, 'densite'), zn(m.charge_relative, 'charge_relative'), 0, zn(m.poids_max_kg, 'poids_max_kg'), 0].map(norm),
    [zn(m.nb_series, 'nb_series'), zn(m.nb_exercices, 'nb_exercices'), 0, 0, 0].map(norm),
    [zn(m.temps_repos_moy_sec, 'temps_repos_moy_sec'), 0, zn(m.ratio_actif, 'ratio_actif'), 0, 0].map(norm),
    [zn(m.nb_pr, 'nb_pr'), 0, 0, 0, 0].map(norm),
    [zn(m.streak, 'streak'), zn(m.frequence_hebdo, 'frequence_hebdo'), zn(m.nb_seances_30j, 'nb_seances_30j'), 0, 0].map(norm),
    (m.muscleDims ?? new Array(17).fill(0)).map((v: number, i: number) =>
      v === 0 ? 0 : norm(clampZ((v - MUSCLE_POP_MEAN[i]) / (MUSCLE_POP_STD[i] || 1)))
    ),
    [zn(m.duree_sec, 'duree_sec'), 0, zn(m.ratio_actif, 'ratio_actif'), zn(m.densite, 'densite'), 0].map(norm),
  ]
}

// Reconstruit sessionValues depuis une ligne myo_signatures (pour feed/[id].tsx et analytics)
export function sessionValuesFromSignature(row: {
  z_volume: number; z_intensite: number; z_structure: number
  z_recovery: number; z_performance: number; z_regularite: number
  z_extended: Record<string, unknown>
}): number[][] {
  const norm = (z: number) => (z + 3) / 6
  const ze = row.z_extended ?? {}
  const g = (k: string): number => {
    const v = ze[k]
    return typeof v === 'number' ? v : 0
  }

  const muscleDimsRaw = Array.isArray(ze['muscles_raw'])
    ? (ze['muscles_raw'] as number[])
    : new Array(17).fill(1)
  const muscleDimsZ = Array.isArray(ze['muscles'])
    ? (ze['muscles'] as number[])
    : new Array(17).fill(0)

  return [
    [row.z_volume, g('nb_series'), 0, 0, 0, row.z_intensite].map(norm),
    [row.z_intensite, g('charge_relative'), 0, g('poids_max_kg'), 0].map(norm),
    [row.z_structure, g('nb_exercices'), g('nb_series_par_ex_moy'), 0, g('hhi_muscles')].map(norm),
    [row.z_recovery, g('temps_repos_moy_sec'), g('std_temps_repos_par_ex'), g('ratio_actif'), 0].map(norm),
    [row.z_performance, g('nb_exercices_avec_pr'), g('max_1rm_kg'), g('mean_evolution_1rm'), 0].map(norm),
    [row.z_regularite, g('frequence_hebdo'), g('nb_seances_30j'), g('max_freq_muscle_7j'), 0].map(norm),
    muscleDimsZ.map((z, i) => muscleDimsRaw[i] === 0 ? 0 : norm(z)),
    [g('duree_sec'), g('temps_repos_total_sec'), g('ratio_actif'), row.z_intensite, g('slot_horaire_num')].map(norm),
  ]
}

export interface SaveMyoParams {
  userId: string
  workoutId: string
  startedAtIso: string
  // scalaires directs
  volume_total_kg: number
  densite_kg_par_min: number
  nb_series_total: number
  score_recuperation_estime: number | null
  nb_pr_seance: number
  streak_semaines_actives: number
  volume_max_serie_kg: number
  poids_max_seance_kg: number
  charge_relative_seance: number | null
  nb_exercices: number
  nb_series_par_exercise_moy: number
  duree_totale_seance: number
  temps_repos_total_sec: number
  temps_repos_moyen_seance_sec: number | null
  temps_actif_sec: number
  ratio_actif_repos: number | null
  heure_debut: string
  slot_horaire: SlotHoraire
  muscle_primaire_dominant: string | null
  poids_corps_kg: number | null
  age_ans: number | null
  temps_depuis_derniere_seance_sec: number | null
  volume_7_derniers_jours_kg: number
  evolution_repos_moyen_seance_sec: number | null
  nb_seances_30_derniers_jours: number
  frequence_hebdo_moyenne: number
  // Records
  volume_par_exercice_kg: Record<string, number>
  volume_max_serie_par_exercice_kg: Record<string, number>
  poids_max_par_exercice_kg: Record<string, number>
  charge_relative_par_exercice: Record<string, number | null>
  nb_series_par_exercice: Record<string, number>
  temps_repos_moyen_par_exercice_sec: Record<string, number | null>
  estimated_1rm_par_exercice_kg: Record<string, number>
  pr_par_exercice: Record<string, boolean>
  volume_par_muscle_kg: Record<string, number>
  evolution_volume_par_exercice: Record<string, number | null>
  evolution_1rm_par_exercice: Record<string, number | null>
  volume_par_muscle_30j_kg: Record<string, number>
  volume_par_muscle_90j_kg: Record<string, number>
  frequence_sollicitation_par_muscle_7j: Record<string, number>
  // tableau
  muscles_sollicites: Array<{ muscle_id: string; muscle_group: string; volume_kg: number }>
  // famille 6 — 17 dims musculaires
  setsByExercise: Record<string, Array<{ weight_kg: number; reps: number }>>
}

export async function saveMyoSignature(p: SaveMyoParams): Promise<number[][] | null> {
  const { data: existing } = await supabase
    .from('myo_signatures')
    .select('workout_id')
    .eq('workout_id', p.workoutId)
    .maybeSingle()
  if (existing) return null

  const volTotal = p.volume_total_kg
  const dominant = p.muscle_primaire_dominant

  const raw: MyoRaw = {
    volume_kg: volTotal,
    densite: p.densite_kg_par_min,
    nb_series: p.nb_series_total,
    recuperation: p.score_recuperation_estime ?? 50,
    nb_pr: p.nb_pr_seance,
    streak: p.streak_semaines_actives,
    volume_max_par_exercice: rMax(rVals(p.volume_par_exercice_kg)),
    volume_max_serie_kg: p.volume_max_serie_kg,
    mean_volume_max_serie_par_ex: rMean(rVals(p.volume_max_serie_par_exercice_kg)),
    poids_max_kg: p.poids_max_seance_kg,
    mean_poids_max_par_ex: rMean(rVals(p.poids_max_par_exercice_kg)),
    charge_relative: p.charge_relative_seance ?? 65,
    std_charge_relative_par_ex: rStd(rValsNN(p.charge_relative_par_exercice)),
    nb_exercices: p.nb_exercices,
    nb_series_par_ex_moy: p.nb_series_par_exercise_moy,
    max_nb_series_par_ex: rMax(rVals(p.nb_series_par_exercice)),
    duree_sec: p.duree_totale_seance,
    temps_repos_total_sec: p.temps_repos_total_sec,
    temps_repos_moy_sec: p.temps_repos_moyen_seance_sec ?? 120,
    std_temps_repos_par_ex: rStd(rValsNN(p.temps_repos_moyen_par_exercice_sec)),
    temps_actif_sec: p.temps_actif_sec,
    ratio_actif: p.ratio_actif_repos ?? 0.5,
    heure_debut_h: parseHour(p.heure_debut),
    slot_horaire_num: SLOT_MAP[p.slot_horaire],
    max_1rm_kg: rMax(rVals(p.estimated_1rm_par_exercice_kg)),
    nb_exercices_avec_pr: rCountTrue(p.pr_par_exercice),
    nb_muscles: p.muscles_sollicites.length,
    hhi_muscles: hhiScore(p.volume_par_muscle_kg, volTotal),
    share_dominant: dominant && volTotal > 0 ? ((p.volume_par_muscle_kg[dominant] ?? 0) / volTotal) : 0,
    poids_corps_kg: p.poids_corps_kg ?? POP_MEAN.poids_corps_kg,
    age_ans: p.age_ans ?? POP_MEAN.age_ans,
    temps_depuis_sec: p.temps_depuis_derniere_seance_sec ?? 259200,
    mean_evolution_volume: rMean(rValsNN(p.evolution_volume_par_exercice)),
    mean_evolution_1rm: rMean(rValsNN(p.evolution_1rm_par_exercice)),
    volume_7j_kg: p.volume_7_derniers_jours_kg,
    volume_total_30j_kg: rSum(rVals(p.volume_par_muscle_30j_kg)),
    volume_total_90j_kg: rSum(rVals(p.volume_par_muscle_90j_kg)),
    evolution_repos_moy_sec: p.evolution_repos_moyen_seance_sec ?? 0,
    nb_seances_30j: p.nb_seances_30_derniers_jours,
    frequence_hebdo: p.frequence_hebdo_moyenne,
    max_freq_muscle_7j: rMax(rVals(p.frequence_sollicitation_par_muscle_7j)),
  }

  const bl = await fetchBaselines(p.userId, p.startedAtIso)

  const keys = Object.keys(POP_MEAN) as (keyof MyoRaw)[]
  const zAll: Record<string, number> = {}
  for (const k of keys) {
    zAll[k] = clampZ((raw[k] - bl.mean[k]) / bl.std[k])
  }

  const z_volume      = zAll.volume_kg
  const z_intensite   = zAll.densite
  const z_structure   = zAll.nb_series
  const z_recovery    = zAll.recuperation
  const z_performance = zAll.nb_pr
  const z_regularite  = zAll.streak

  const z_extended: Record<string, number | number[]> = {}
  const raw_extended: Record<string, number> = {}
  for (const k of keys) {
    if (!CORE_KEYS.has(k)) {
      z_extended[k] = zAll[k]
      raw_extended[k] = raw[k]
    }
  }

  // ─ Famille 6 : 17 dims musculaires ──────────────────────────────────────────
  const exerciseIds = Object.keys(p.setsByExercise)
  if (exerciseIds.length > 0) {
    const { data: emData } = await supabase
      .from('exercise_muscles')
      .select('exercise_id, muscle, fascicle, activation_pct')
      .in('exercise_id', exerciseIds)
      .in('role', ['primary', 'secondary'])

    const emRows = (emData ?? []) as EmRow[]
    const muscleDimsRaw = computeMuscleDims(p.setsByExercise, emRows)
    z_extended['muscles_raw'] = muscleDimsRaw
    z_extended['muscles'] = muscleDimsRaw.map((v, i) =>
      clampZ((v - MUSCLE_POP_MEAN[i]) / MUSCLE_POP_STD[i])
    )
  }

  const allZ = Object.values(zAll)
  const avg = allZ.reduce((a, b) => a + b, 0) / allZ.length
  const score = Math.round(((avg + 3) / 6) * 100)

  const sortedZ = keys.map(k => `${k}:${zAll[k].toFixed(3)}`).join('|')
  const payload = `${p.workoutId}|${sortedZ}|${score}`
  const h1 = djb2(payload).toString(16).padStart(8, '0')
  const h2 = djb2(payload.split('').reverse().join('')).toString(16).padStart(8, '0')
  const hash = `${p.workoutId.replace(/-/g, '').slice(0, 32)}${h1}${h2}`.slice(0, 64)

  const anomalyDims = keys.filter(k => Math.abs(zAll[k]) >= 2.9).map(k => DIM_LABELS[k])

  console.log('[MYO] inserting score=', score, 'dims=', allZ.length, 'hash=', hash.slice(0, 16))
  const { error } = await supabase.from('myo_signatures').insert({
    workout_id: p.workoutId,
    user_id: p.userId,
    raw_volume_kg: raw.volume_kg,
    raw_densite_kg_par_min: raw.densite,
    raw_nb_series: raw.nb_series,
    raw_score_recuperation: raw.recuperation,
    raw_nb_pr: raw.nb_pr,
    raw_streak_semaines: raw.streak,
    raw_extended,
    baseline_n: bl.n,
    baseline_mean: bl.mean,
    baseline_std: bl.std,
    z_volume, z_intensite, z_structure, z_recovery, z_performance, z_regularite,
    z_extended,
    score,
    hash,
    anomaly_detected: anomalyDims.length > 0,
    anomaly_message: anomalyDims.length > 0 ? `Extrême: ${anomalyDims.join(', ')}` : null,
  })
  if (error) { console.error('[MYO] insert error:', error.message, error.code); return null }

  const norm = (z: number) => (z + 3) / 6
  const muscleDimsZ = Array.isArray(z_extended['muscles'])
    ? (z_extended['muscles'] as number[])
    : new Array(17).fill(0)

  return [
    [z_volume, zAll.nb_series, 0, 0, 0, z_intensite].map(norm),
    [z_intensite, zAll.charge_relative, 0, zAll.poids_max_kg, 0].map(norm),
    [z_structure, zAll.nb_exercices, zAll.nb_series_par_ex_moy, 0, zAll.hhi_muscles].map(norm),
    [z_recovery, zAll.temps_repos_moy_sec, zAll.std_temps_repos_par_ex, zAll.ratio_actif, 0].map(norm),
    [z_performance, zAll.nb_exercices_avec_pr, zAll.max_1rm_kg, zAll.mean_evolution_1rm, 0].map(norm),
    [z_regularite, zAll.frequence_hebdo, zAll.nb_seances_30j, zAll.max_freq_muscle_7j, 0].map(norm),
    muscleDimsZ.map(norm),
    [zAll.duree_sec, zAll.temps_repos_total_sec, zAll.ratio_actif, z_intensite, zAll.slot_horaire_num].map(norm),
  ]
}
