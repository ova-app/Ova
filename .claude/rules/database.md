# rules/database.md

## Contexte
**Aucune migration Supabase effectuée depuis v1.** Le schéma ci-dessous est l'état actuel de la DB.
Signaler TOUTE modification avant de coder. Ajouter les migrations SQL en fin de fichier.

---

## 14 tables Supabase (état actuel)

```
users             : id, email, username, full_name, avatar_url, weight_unit(kg|lbs), plan(free|premium),
                    locale, date_naissance(DATE NULL), created_at
follows           : follower_id → users.id, following_id → users.id, created_at
gyms              : id, name, address, lat, lng, is_home, created_by → users.id, created_at
muscles           : id, name, group, body_side
exercises         : id, name_fr, slug, equipment_type, muscle_group, mechanics, force_type,
                    laterality, source, external_id, is_verified, created_by, created_at
exercise_muscles  : exercise_id, muscle_id → muscles.id, muscle(text), fascicle(text),
                    role(primary|secondary|stabilizer), activation_pct(0-100), source, confidence
workouts          : id, user_id, gym_id, title, started_at, ended_at, duration_sec, total_volume_kg,
                    poids_corps_kg(FLOAT NULL — snapshot au save),
                    is_public(DEFAULT false), note, lat, lng, avg_rest_seconds, photo_url, location_city,
                    pr_seance(text NULL — 'gold'|'silver'|'bronze')
workout_exercises : id, workout_id, exercise_id, order_index, note,
                    pr_exercice(text NULL — 'gold'|'silver'|'bronze')
workout_sets      : id, workout_exercise_id, set_type(warmup|working|dropset|failure), set_number,
                    reps, weight_kg, rest_seconds, rpe, is_pr,
                    pr_charge(text NULL — 'gold'|'silver'|'bronze'),
                    pr_serie(text NULL — 'gold'|'silver'|'bronze'),
                    parent_set_id, is_continuation, logged_at
body_metrics      : id, user_id → users.id, weight_kg(FLOAT), measured_at(TIMESTAMPTZ)
workout_metrics   : workout_id(PK) → workouts.id, data(JSONB), computed_at(TIMESTAMPTZ)
likes             : user_id, workout_id, created_at
comments          : id, workout_id, user_id, content, created_at
myo_signatures    : id, user_id → users.id, workout_id → workouts.id, started_at(TIMESTAMPTZ),
                    z_volume, z_intensite, z_structure, z_recovery, z_performance, z_regularite (FLOAT),
                    z_extended(JSONB — muscles + temps + autres familles),
                    score(FLOAT 0-100), hash(TEXT), anomaly(BOOL),
                    raw_* colonnes (valeurs brutes 41 dims), baseline_* colonnes (mean/std utilisés),
                    created_at
```

## RPCs Postgres

```
get_prev_exercise_volumes(p_user_id, p_exercise_ids UUID[], p_before TIMESTAMPTZ)
  → TABLE(exercise_id UUID, volume_kg FLOAT, estimated_1rm_kg FLOAT)

get_muscle_volume_rolling(p_user_id, p_since TIMESTAMPTZ)
  → TABLE(muscle_id UUID, volume_kg FLOAT)

get_muscle_frequency_7j(p_user_id, p_since TIMESTAMPTZ)
  → TABLE(muscle_id UUID, nb_seances BIGINT)
```

## workout_metrics.data — type WorkoutMetricsData (summary.tsx)
Volume, poids max, séries, temps (repos/actif/densité), slot horaire, 1RM Epley,
PRs, muscles (via exercise_muscles + activation_pct), poids_corps snapshot, âge,
temps_depuis_derniere_seance, évolution vs séance précédente, rolling 7/30/90j,
streak semaines, fréquence musculaire 7j, score_recuperation_estime (0-100).

## Rappels critiques
- Trigger `on_auth_user_created` crée `public.users` automatiquement
- `exercise_muscles.activation_pct` = échelle 0-100 (pas 0-1)
- `workout_metrics` insert best-effort dans summary.tsx — jamais bloque le save
- `users.plan` = 'free' | 'premium' — colonne existante, RevenueCat synchronisera en Phase 2

---

## Schéma SQLite local (`mobile_app/lib/db.ts`) — à créer en Phase 0

```sql
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
  id TEXT NOT NULL,
  total_volume_kg REAL,
  logged_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sets_exercise ON local_sets(exercise_id, logged_at DESC);
```

Alimenté en même temps que le save Supabase dans summary.tsx. Utilisé exclusivement par Mode Fantôme et Moteur Prédictif.

---

## Migrations Supabase planifiées (à appliquer quand nécessaire)

### [Phase 3] ADN Athlétique
```sql
CREATE TABLE athletic_dna (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ DEFAULT now(),
  dim_force JSONB,
  dim_volume JSONB,
  dim_progression JSONB,
  dim_regularite JSONB,
  dim_recuperation JSONB,
  dim_tempo JSONB
);
CREATE INDEX ON athletic_dna(user_id, computed_at DESC);
```

### [Phase 3] Marketplace programmes
```sql
CREATE TABLE programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
