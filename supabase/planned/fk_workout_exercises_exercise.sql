-- FK manquante : workout_exercises.exercise_id → exercises.id
--
-- Problème : PostgREST refuse l'embed `exercises!inner(name_fr)` avec PGRST200
-- (« Could not find a relationship between 'workout_exercises' and 'exercises' »)
-- car AUCUNE contrainte de clé étrangère ne relie workout_exercises.exercise_id
-- à exercises.id. Tout `select` imbriquant `exercises(...)` échoue donc en bloc →
-- le détail des exos/séries est vide partout (feed/[id], history/[id], etc.).
--
-- Côté client, feed/[id].tsx a été basculé sur une requête de noms SÉPARÉE (ne
-- dépend plus de la FK). Cette migration rétablit la FK pour : (1) réautoriser
-- l'embed PostgREST (history/[id].tsx l'utilise encore), (2) garantir l'intégrité
-- référentielle (pas d'exercise_id orphelin).
--
-- ⚠️ À APPLIQUER APRÈS REVUE (migration `planned/`, non jouée par le CLI).
--    1. Lancer le DIAGNOSTIC ci-dessous : s'il renvoie des lignes, il existe des
--       workout_exercises.exercise_id absents de exercises → la FK échouera.
--       Nettoyer/corriger ces lignes AVANT d'ajouter la contrainte.
--    2. Le NOTIFY recharge le cache de schéma PostgREST (sinon l'embed reste KO
--       jusqu'au prochain reload).
-- Idempotent : IF NOT EXISTS sur la contrainte.

-- ─── DIAGNOSTIC orphelins (lancer AVANT) ──────────────────────────────────────
--   SELECT we.id, we.exercise_id
--   FROM public.workout_exercises we
--   LEFT JOIN public.exercises e ON e.id = we.exercise_id
--   WHERE we.exercise_id IS NOT NULL AND e.id IS NULL;

-- ─── Ajout de la FK ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workout_exercises_exercise_id_fkey'
      AND conrelid = 'public.workout_exercises'::regclass
  ) THEN
    ALTER TABLE public.workout_exercises
      ADD CONSTRAINT workout_exercises_exercise_id_fkey
      FOREIGN KEY (exercise_id) REFERENCES public.exercises(id);
  END IF;
END $$;

-- ─── Recharger le cache de schéma PostgREST ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
