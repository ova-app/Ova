-- ============================================================
-- ORAVA — Session 10 — Fix permissions + nouvelles colonnes
-- À appliquer dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── SCHEMA USAGE ────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- ─── EXERCISES & EXERCISE_MUSCLES ────────────────────────────
-- Données de référence publiques : RLS désactivé, lecture libre

GRANT SELECT ON exercises        TO authenticated, anon;
GRANT SELECT ON exercise_muscles TO authenticated, anon;

ALTER TABLE exercises        DISABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_muscles DISABLE ROW LEVEL SECURITY;

-- ─── WORKOUT TABLES — re-grant (après migration schéma) ──────

GRANT SELECT, INSERT, UPDATE, DELETE ON workouts          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON workout_sets      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON likes             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON comments          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON users             TO authenticated;
GRANT SELECT                          ON gyms             TO authenticated;

-- ─── NOUVELLES COLONNES PR SUR WORKOUT_SETS ──────────────────

ALTER TABLE workout_sets
  ADD COLUMN IF NOT EXISTS pr_charge boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pr_serie  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pr_1rm    boolean DEFAULT false;

-- ─── VÉRIFICATION ────────────────────────────────────────────
-- Après exécution, lancer ces deux requêtes pour valider :
--
--   SELECT COUNT(*) FROM exercises;
--   → doit retourner > 0 si des exercices ont été seedés
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'workout_sets'
--   AND column_name IN ('pr_charge','pr_serie','pr_1rm');
--   → doit retourner 3 lignes