-- ============================================================
-- ORAVA — Session 07 — Correctifs RLS & index
-- À appliquer dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. RLS workouts SELECT
--    Chaque utilisateur voit ses propres séances + les séances publiques
CREATE POLICY "workouts_select"
  ON workouts FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_public = true);

-- 2. RLS likes INSERT
--    Un utilisateur ne peut liker qu'en son propre nom
CREATE POLICY "likes_insert"
  ON likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. RLS likes DELETE
--    Un utilisateur ne peut supprimer que ses propres likes
CREATE POLICY "likes_delete"
  ON likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 4. Index feed (performance)
--    Accélère la query du feed sur les séances publiques récentes
CREATE INDEX IF NOT EXISTS idx_workouts_feed
  ON workouts(started_at DESC)
  WHERE is_public = true;
