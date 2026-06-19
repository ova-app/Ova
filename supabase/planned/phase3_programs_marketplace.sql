-- ============================================================
-- [PLANIFIÉE — Phase 3] Marketplace programmes
-- NON appliquée. Déplacer dans ../migrations/ avec un préfixe timestamp
-- le jour où on l'implémente.
-- ============================================================

CREATE TABLE programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
