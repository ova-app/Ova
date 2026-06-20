-- ORA-020 — Durcissement RLS des écritures (INSERT / UPDATE / DELETE).
--
-- Problème (audit) : la RLS est la SEULE barrière côté serveur, et plusieurs
-- écritures la contournent en pratique — `user_id` fourni par le client sur les
-- INSERT (feed/edit-profile/summary), `delete comment` filtré par `id` seul.
-- Un client malveillant peut donc écrire/supprimer au nom d'autrui si les
-- policies actuelles sont permissives.
--
-- Cette migration pose des policies d'écriture STRICTES (auth.uid() = propriétaire,
-- direct ou via la chaîne workout) sur toutes les tables possédées par
-- l'utilisateur, et RETIRE toute policy d'écriture pré-existante — SANS toucher
-- aux policies de LECTURE (SELECT), qui gouvernent la visibilité du feed social
-- (is_public + follows). Réécrire le modèle de lecture à l'aveugle casserait le feed.
--
-- ⚠️ À APPLIQUER APRÈS REVUE (migration `planned/`, non jouée par le CLI).
--    1. Lancer d'abord le DIAGNOSTIC en bas de fichier (SQL Editor) pour lister
--       les policies + l'état RLS actuels.
--    2. Si une policy `FOR ALL` existe sur une table cible, elle couvre AUSSI la
--       lecture : ce script la SIGNALE (RAISE NOTICE) mais ne la supprime pas —
--       à scinder à la main (SELECT séparé + écritures strictes) avant d'appliquer.
--    3. Vérifier que la RLS est déjà ENABLE partout (l'app lit déjà sous RLS) :
--       si une table était sans policy SELECT, ce script ne la fournit pas.
--
-- Idempotent : ré-applicable sans effet de bord (le bloc de purge retire aussi
-- les policies ora020_* du run précédent avant de les recréer).
-- Workflow d'application : voir supabase/README.md.

-- ─── 1. RLS active partout (no-op si déjà activée) ────────────────────────────
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_sets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workout_metrics   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_metrics      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.myo_signatures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gyms              ENABLE ROW LEVEL SECURITY;

-- ─── 2. Purge des policies d'écriture pré-existantes (cmd INSERT/UPDATE/DELETE) ─
--      Les policies SELECT sont conservées. Les policies FOR ALL sont signalées.
DO $$
DECLARE
  t      text;
  r      record;
  tables text[] := ARRAY[
    'users','workouts','workout_exercises','workout_sets','workout_metrics',
    'body_metrics','myo_signatures','likes','comments','follows','gyms'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOR r IN
      SELECT policyname, cmd FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      IF r.cmd IN ('INSERT', 'UPDATE', 'DELETE') THEN
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, t);
      ELSIF r.cmd = 'ALL' THEN
        RAISE NOTICE 'ORA-020: policy FOR ALL "%" sur "%" — couvre aussi la lecture, à scinder/revoir manuellement (non supprimée).', r.policyname, t;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ─── 3. Policies d'écriture strictes ──────────────────────────────────────────

-- users : modification de SON profil uniquement.
-- (INSERT = trigger on_auth_user_created en SECURITY DEFINER ; DELETE = futur RPC
--  delete_account ORA-001 en SECURITY DEFINER → aucune écriture client directe.)
CREATE POLICY ora020_users_update ON public.users
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- workouts : propriété directe via user_id.
CREATE POLICY ora020_workouts_insert ON public.workouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_workouts_update ON public.workouts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_workouts_delete ON public.workouts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- workout_exercises : propriété via le workout parent.
CREATE POLICY ora020_we_insert ON public.workout_exercises
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
CREATE POLICY ora020_we_update ON public.workout_exercises
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
CREATE POLICY ora020_we_delete ON public.workout_exercises
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );

-- workout_sets : propriété via workout_exercise → workout.
CREATE POLICY ora020_ws_insert ON public.workout_sets
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );
CREATE POLICY ora020_ws_update ON public.workout_sets
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );
CREATE POLICY ora020_ws_delete ON public.workout_sets
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.workout_exercises we
      JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.id = workout_exercise_id AND w.user_id = auth.uid()
    )
  );

-- workout_metrics : PK = workout_id, propriété via le workout parent
-- (insert best-effort client depuis summary.tsx).
CREATE POLICY ora020_wm_insert ON public.workout_metrics
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
CREATE POLICY ora020_wm_update ON public.workout_metrics
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );
CREATE POLICY ora020_wm_delete ON public.workout_metrics
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_id AND w.user_id = auth.uid())
  );

-- body_metrics : propriété directe via user_id.
CREATE POLICY ora020_bm_insert ON public.body_metrics
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_bm_update ON public.body_metrics
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_bm_delete ON public.body_metrics
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- myo_signatures : propriété directe via user_id.
CREATE POLICY ora020_myo_insert ON public.myo_signatures
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_myo_update ON public.myo_signatures
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_myo_delete ON public.myo_signatures
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- likes : un user ne pose/retire QUE ses propres likes.
CREATE POLICY ora020_likes_insert ON public.likes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_likes_delete ON public.likes
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- comments : auteur uniquement (corrige le DELETE filtré par id seul).
CREATE POLICY ora020_comments_insert ON public.comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_comments_update ON public.comments
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ora020_comments_delete ON public.comments
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- follows : on ne crée/supprime QUE ses propres relations (follower_id = soi).
CREATE POLICY ora020_follows_insert ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY ora020_follows_delete ON public.follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- gyms : seul le créateur édite/supprime ; lecture publique conservée (SELECT non touché).
CREATE POLICY ora020_gyms_insert ON public.gyms
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY ora020_gyms_update ON public.gyms
  FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE POLICY ora020_gyms_delete ON public.gyms
  FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- ─── DIAGNOSTIC (à lancer AVANT d'appliquer, en lecture seule) ─────────────────
-- État RLS par table :
--   SELECT relname, relrowsecurity, relforcerowsecurity
--   FROM pg_class WHERE relnamespace = 'public'::regnamespace
--     AND relname IN ('users','workouts','workout_exercises','workout_sets',
--       'workout_metrics','body_metrics','myo_signatures','likes','comments',
--       'follows','gyms');
-- Policies existantes (repérer les FOR ALL et les écritures permissives) :
--   SELECT tablename, policyname, cmd, roles, qual, with_check
--   FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, cmd;
