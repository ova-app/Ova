-- ============================================================
-- [PLANIFIÉE — Phase 3] ADN Athlétique
-- NON appliquée. Déplacer dans ../migrations/ avec un préfixe timestamp
-- le jour où on l'implémente.
-- ============================================================

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
