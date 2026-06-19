-- ============================================================
-- Myo Famille 6 — 17 dims musculaires (Phase 0)
-- Statut : APPLIQUÉE en production (Phase 0 ✅)
-- Source de référence : .claude/rules/database.md
-- ============================================================

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
