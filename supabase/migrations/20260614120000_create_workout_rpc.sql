-- ============================================================
-- RPC create_workout — save séance transactionnel (Vague 1 / ORA-007)
-- Statut : ⚠️ NON ENCORE APPLIQUÉE EN PRODUCTION — à exécuter avant que
--          le save de summary.tsx fonctionne (le client appelle
--          supabase.rpc('create_workout', { payload })).
-- Source de référence : .claude/rules/database.md
--
-- Insère workout + workout_exercises + workout_sets dans UNE transaction
-- (tout ou rien → plus de séance orpheline). SECURITY INVOKER → RLS via
-- auth.uid(). Idempotent : retry avec le même id ne réinsère rien.
-- ============================================================

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
