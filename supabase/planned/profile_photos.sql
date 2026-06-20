-- Photos de profil (vitrine) — photos ajoutées directement au profil, hors séance.
--
-- La vitrine du profil agrège désormais DEUX sources :
--   • workouts.photo_url        — photo prise pendant une séance (déjà existant)
--   • profile_photos (ce fichier) — photo ajoutée à la main depuis la vitrine
--
-- ⚠️ À APPLIQUER À LA MAIN (migration `planned/`, non jouée par le CLI) — SQL Editor
--    du dashboard Supabase. Voir supabase/README.md.
-- Idempotent : ré-applicable sans effet de bord (CREATE … IF NOT EXISTS + DROP/CREATE policies).
-- Storage : réutilise le bucket public `workout-photos` (path `${uid}/profile-<id>.jpg`)
--    → aucune nouvelle policy storage (le préfixe `${uid}/` couvre déjà l'owner).
-- Client : best-effort isolé (lib/profilePhotos.ts) → no-op silencieux tant que la table
--    n'existe pas (même pattern que getManualFeaturedPr).

CREATE TABLE IF NOT EXISTS public.profile_photos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  photo_url  text NOT NULL,
  is_public  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_photos_user
  ON public.profile_photos (user_id, created_at DESC);

ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;

-- Lecture : publique si is_public, sinon owner only (cohérent feed/vitrine + ORA-020).
DROP POLICY IF EXISTS profile_photos_select ON public.profile_photos;
CREATE POLICY profile_photos_select ON public.profile_photos
  FOR SELECT USING (is_public OR auth.uid() = user_id);

-- Écriture : owner strict (insert · update · delete).
DROP POLICY IF EXISTS profile_photos_insert ON public.profile_photos;
CREATE POLICY profile_photos_insert ON public.profile_photos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profile_photos_update ON public.profile_photos;
CREATE POLICY profile_photos_update ON public.profile_photos
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS profile_photos_delete ON public.profile_photos;
CREATE POLICY profile_photos_delete ON public.profile_photos
  FOR DELETE USING (auth.uid() = user_id);
