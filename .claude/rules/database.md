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
muscles           : id, name, muscle_group, body_side, myo_dim(SMALLINT NULL)
                    ⚠️ colonne = muscle_group (pas group) · myo_dim NULL pour pec/delt (résolu par fascicle)
exercises         : id, name_fr, name_en, equipment_type, muscle_group, is_compound(BOOL),
                    description_fr(TEXT NULL), created_at
                    ⚠️ colonnes absentes de la DB : slug, mechanics, force_type, laterality, source, external_id, is_verified, created_by
exercise_muscles  : id, exercise_id, muscle(text), fascicle(text),
                    role(primary|secondary|stabilizer), activation_pct(integer 0-100)
                    ⚠️ pas de muscle_id FK · muscle = snake_case français · fascicle = snake_case français
myo_muscle_dims   : id(SERIAL PK), muscle_text, fascicle_text(NULL=tous faisceaux), myo_dim(0-16), dim_label
                    table de mapping authoritative exercise_muscles → dim Myo famille 6
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

## Référentiel muscles (état réel DB)

### Table `muscles` — 10 entrées
| name | muscle_group | myo_dim |
|---|---|---|
| Chest | chest | NULL (pec — résolu par fascicle) |
| Shoulders | shoulders | NULL (delt — résolu par fascicle) |
| Lats | back | 5 |
| Biceps | arms | 10 |
| Triceps | arms | 11 |
| Quads | legs | 12 |
| Hamstrings | legs | 13 |
| Glutes | legs | 14 |
| Calves | legs | 15 |
| Abs | core | 16 |

### Table `exercises` — valeurs réelles `muscle_group`
⚠️ Valeurs en français dans la DB — différent de `muscles.muscle_group` (anglais).
| muscle_group DB | correspond à |
|---|---|
| `pectoraux` | chest |
| `dos` | back |
| `epaules` | shoulders |
| `biceps` | arms |
| `triceps` | arms |
| `quadriceps` | legs |
| `ischio_jambiers` | legs |
| `fessiers` | legs |
| `mollets` | legs |
| `abdominaux` | core |
| `avant_bras` | — (absent de `muscles`) |

### Table `exercise_muscles` — valeurs réelles `muscle` + `fascicle`
Vocabulaire contrôlé snake_case français. Tout nouvel exercice doit respecter ces valeurs exactes.

| muscle | fascicles existants |
|---|---|
| `grand_pectoral` | `faisceau_claviculaire` · `faisceau_sternal` · `faisceau_abdominal` |
| `deltoide` | `faisceau_anterieur` · `faisceau_median` · `faisceau_posterieur` |
| `grand_dorsal` | `faisceau_inferieur` · `faisceau_superieur` · NULL |
| `trapeze` | `faisceau_inferieur` · `faisceau_moyen` · `faisceau_superieur` |
| `biceps` | `chef_long` · `chef_court` · `brachial` · NULL |
| `triceps` | `chef_long` · `chef_lateral` · `chef_medial` · NULL |
| `quadriceps` | `rectus_femoris` · `vastus_lateralis` · `vastus_medialis` |
| `ischio_jambiers` | `biceps_femoral` · `semi_membraneux` · `semi_tendineux` · NULL |
| `mollets` | `gastrocnemien` · `gastrocnemien_lateral` · `gastrocnemien_medial` · `soleus` |
| `abdominaux` | `obliques_externes` · `obliques_internes` · `rectus_abdominis` · `transverse` |
| `fessier_maximus` | NULL |
| `fessier_median` | NULL |
| `fessier_minimus` | NULL |
| `rhomboide` | NULL |
| `grand_rond` | NULL |
| `erecteurs_rachis` | NULL |
| `serratus_anterieur` | NULL |
| `avant_bras` | `extenseurs_poignet` · `flechisseurs_doigts` · `flechisseurs_poignet` · `palmaire_long` |
| `brachial` | NULL |
| `brachioradial` | NULL |
| `adducteurs` | NULL |
| `iliopsoas` | NULL |
| `infra_epineux` | NULL |
| `elevateur_scapula` | NULL |
| `tenseur_fascia_lata` | NULL |
| `quadratus_lumborum` | NULL |

Muscles non mappés en Myo (pas de dim) : `serratus_anterieur`, `avant_bras`, `brachial`, `brachioradial`, `adducteurs`, `iliopsoas`, `infra_epineux`, `elevateur_scapula`, `tenseur_fascia_lata`, `quadratus_lumborum`.

---

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

> 📦 **SQL exécutable** : ces blocs sont désormais versionnés en fichiers dans
> [`supabase/migrations/`](../../supabase/migrations/) (appliquées) et
> [`supabase/planned/`](../../supabase/planned/) (futures). Voir
> [`supabase/README.md`](../../supabase/README.md) pour l'état et le workflow CLI.
> Cette section reste la **référence documentée** — garder les deux synchronisés.

### [Phase 0] Myo Famille 6 — 17 dims musculaires
```sql
-- 1. Corriger muscle_group incorrects
UPDATE muscles SET muscle_group = 'legs'  WHERE name = 'Hamstrings';
UPDATE muscles SET muscle_group = 'legs'  WHERE name = 'Quads';
UPDATE muscles SET muscle_group = 'core'  WHERE name = 'Abs';
UPDATE muscles SET muscle_group = 'legs'  WHERE name = 'Calves';
UPDATE muscles SET muscle_group = 'back'  WHERE name = 'Lats';
UPDATE muscles SET muscle_group = 'arms'  WHERE name = 'Biceps';

-- 2. Ajouter myo_dim à muscles (NULL = résolution par fascicle dans myo_muscle_dims)
ALTER TABLE muscles ADD COLUMN IF NOT EXISTS myo_dim SMALLINT NULL;
UPDATE muscles SET myo_dim = NULL WHERE name IN ('Chest', 'Shoulders');
UPDATE muscles SET myo_dim = 5  WHERE name = 'Lats';
UPDATE muscles SET myo_dim = 10 WHERE name = 'Biceps';
UPDATE muscles SET myo_dim = 11 WHERE name = 'Triceps';
UPDATE muscles SET myo_dim = 12 WHERE name = 'Quads';
UPDATE muscles SET myo_dim = 13 WHERE name = 'Hamstrings';
UPDATE muscles SET myo_dim = 14 WHERE name = 'Glutes';
UPDATE muscles SET myo_dim = 15 WHERE name = 'Calves';
UPDATE muscles SET myo_dim = 16 WHERE name = 'Abs';

-- 3. Table de mapping authoritative
CREATE TABLE IF NOT EXISTS myo_muscle_dims (
  id            SERIAL PRIMARY KEY,
  muscle_text   TEXT     NOT NULL,
  fascicle_text TEXT,
  myo_dim       SMALLINT NOT NULL,
  dim_label     TEXT     NOT NULL,
  UNIQUE (muscle_text, fascicle_text)
);

-- 4. Peupler le mapping (17 dims, index 0-16)
INSERT INTO myo_muscle_dims (muscle_text, fascicle_text, myo_dim, dim_label) VALUES
  -- Pectoraux (fascicle requis)
  ('grand_pectoral', 'faisceau_claviculaire', 0,  'Pec claviculaire'),
  ('grand_pectoral', 'faisceau_sternal',      1,  'Pec sternal'),
  ('grand_pectoral', 'faisceau_abdominal',    1,  'Pec sternal'),
  -- Deltoïdes (fascicle requis)
  ('deltoide', 'faisceau_anterieur',          2,  'Deltoïde ant.'),
  ('deltoide', 'faisceau_median',             3,  'Deltoïde médial'),
  ('deltoide', 'faisceau_posterieur',         4,  'Deltoïde post.'),
  -- Dos (toutes fascicules)
  ('grand_dorsal',     NULL, 5,  'Grand dorsal'),
  ('trapeze',          NULL, 6,  'Trapèze'),
  ('grand_rond',       NULL, 7,  'Grand rond'),
  ('rhomboide',        NULL, 8,  'Rhomboïdes'),
  ('erecteurs_rachis', NULL, 9,  'Érecteurs rachis'),
  -- Bras
  ('biceps',           NULL, 10, 'Biceps'),
  ('triceps',          NULL, 11, 'Triceps'),
  -- Jambes
  ('quadriceps',       NULL, 12, 'Quadriceps'),
  ('ischio_jambiers',  NULL, 13, 'Ischio-jambiers'),
  ('fessier_maximus',  NULL, 14, 'Fessiers'),
  ('fessier_median',   NULL, 14, 'Fessiers'),
  ('fessier_minimus',  NULL, 14, 'Fessiers'),
  ('mollets',          NULL, 15, 'Mollets'),
  -- Core
  ('abdominaux',       NULL, 16, 'Core')
ON CONFLICT DO NOTHING;
```

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

### [Vague 1 / ORA-007] Save séance transactionnel — RPC `create_workout`
⚠️ **À APPLIQUER avant que le save de `summary.tsx` fonctionne** (le client appelle désormais `supabase.rpc('create_workout', { payload })` au lieu des N inserts séquentiels).
Insère workout + workout_exercises + workout_sets dans **une seule transaction** (tout ou rien → plus de séance orpheline/partielle). `SECURITY INVOKER` → la RLS s'applique avec `auth.uid()`. Idempotent : un retry avec le même `id` ne réinsère rien (protège contre le double-save / double-comptage SQLite).

```sql
CREATE OR REPLACE FUNCTION public.create_workout(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_workout_id uuid := (payload->>'id')::uuid;
  v_user_id    uuid := auth.uid();
  v_ex   jsonb;
  v_set  jsonb;
  v_we_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Idempotence : retry après commit → ne réinsère pas, renvoie l'id existant
  IF EXISTS (SELECT 1 FROM workouts WHERE id = v_workout_id) THEN
    RETURN v_workout_id;
  END IF;

  INSERT INTO workouts (
    id, user_id, title, started_at, ended_at, duration_sec,
    total_volume_kg, is_public, poids_corps_kg, pr_seance
  ) VALUES (
    v_workout_id, v_user_id,
    payload->>'title',
    (payload->>'started_at')::timestamptz,
    (payload->>'ended_at')::timestamptz,
    (payload->>'duration_sec')::int,
    (payload->>'total_volume_kg')::float,
    COALESCE((payload->>'is_public')::boolean, false),
    NULLIF(payload->>'poids_corps_kg', '')::float,
    NULLIF(payload->>'pr_seance', '')
  );

  FOR v_ex IN SELECT jsonb_array_elements(COALESCE(payload->'exercises', '[]'::jsonb))
  LOOP
    v_we_id := (v_ex->>'id')::uuid;
    INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index, pr_exercice)
    VALUES (
      v_we_id, v_workout_id, (v_ex->>'exercise_id')::uuid,
      (v_ex->>'order_index')::int, NULLIF(v_ex->>'pr_exercice', '')
    );

    FOR v_set IN SELECT jsonb_array_elements(COALESCE(v_ex->'sets', '[]'::jsonb))
    LOOP
      INSERT INTO workout_sets (
        id, workout_exercise_id, set_type, set_number, reps, weight_kg,
        rest_seconds, is_pr, pr_charge, pr_serie, logged_at
      ) VALUES (
        (v_set->>'id')::uuid, v_we_id,
        COALESCE(v_set->>'set_type', 'working'),
        (v_set->>'set_number')::int,
        (v_set->>'reps')::int,
        (v_set->>'weight_kg')::float,
        NULLIF(v_set->>'rest_seconds', '')::int,
        COALESCE((v_set->>'is_pr')::boolean, false),
        NULLIF(v_set->>'pr_charge', ''),
        NULLIF(v_set->>'pr_serie', ''),
        (v_set->>'logged_at')::timestamptz
      );
    END LOOP;
  END LOOP;

  RETURN v_workout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_workout(jsonb) TO authenticated;
```
Le client génère `id` (workout), `exercises[].id` (workout_exercise) et `exercises[].sets[].id` (workout_set) côté app ; `workoutId` est généré **une seule fois** (ref) pour l'idempotence du retry. `workout_metrics`, `saveMyoSignature` et l'upload photo restent best-effort **après** la RPC (jamais bloquants).
