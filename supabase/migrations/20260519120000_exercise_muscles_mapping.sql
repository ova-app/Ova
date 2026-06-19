-- ============================================================
-- Mise à jour complète exercise_muscles — 113 exercices
-- Seuils : activation >= 20% → primary | 5-19% → secondary | < 5% → stabilizer
-- À coller dans Supabase SQL Editor et exécuter
-- ============================================================

BEGIN;

-- 1. Suppression des entrées existantes pour les exercices du CSV
DELETE FROM exercise_muscles
WHERE exercise_id IN (
  SELECT id FROM exercises WHERE name_fr IN (
    'Développé couché barre','Développé couché haltères','Développé incliné barre',
    'Développé incliné haltères','Développé décliné barre','Développé décliné haltères',
    'Écarté couché haltères','Écarté incliné haltères','Crossover poulie haute',
    'Crossover poulie basse','Pec Deck / Butterfly machine','Pompes prise large',
    'Pompes prise serrée','Dips pectoraux','Développé couché Smith','Pull-over haltère',
    'Soulevé de terre','Soulevé de terre roumain','Tirage barre horizontale',
    'Rowing haltère unilatéral','Tirage vertical barre large','Tirage vertical prise serrée',
    'Tirage horizontal poulie','Tirage poulie basse prise large','Traction prise large pronation',
    'Traction prise serrée supination','Traction prise neutre','Tirage nuque barre',
    'Rowing machine Hammer Strength','Tirage poulie haute un bras','Extension dos à la machine',
    'Good Morning','Shrug barre','Shrug haltères','Développé militaire barre',
    'Développé militaire haltères','Développé Arnold','Élévation latérale haltères',
    'Élévation latérale poulie','Élévation avant haltères','Oiseau haltères','Oiseau poulie',
    'Face Pull poulie','Rowing menton barre','Rowing menton haltères','Développé machine guidée',
    'Élévation latérale machine','Handstand push-up','Curl barre droite','Curl barre EZ',
    'Curl haltères alterné','Curl haltères marteau','Curl incliné haltères',
    'Curl Larry Scott haltères','Curl poulie basse','Curl concentration','Curl machine',
    'Dips triceps','Extension triceps poulie haute','Extension triceps barre droite',
    'Extension nuque barre EZ','Extension nuque haltère','Kick-back haltère',
    'Extension triceps poulie basse','Développé couché prise serrée','Extension triceps machine',
    'Squat barre','Squat goblet','Squat Smith machine','Presse à cuisses',
    'Fente marchée haltères','Fente bulgare haltères','Extension jambes machine',
    'Hack squat machine','Squat sauté poids du corps','Leg press unilatéral',
    'Soulevé de terre jambes tendues','Curl jambes couché machine','Curl jambes assis machine',
    'Curl jambes debout poulie','Hip Thrust barre','Glute Bridge poids du corps',
    'Fente arrière barre','Good Morning haltères','Hip Thrust machine','Abduction hanche machine',
    'Donkey kick poulie','Fente latérale haltères','Squat sumo barre',
    'Hip Thrust haltère unilatéral','Kickback fessiers machine','Mollets debout machine',
    'Mollets assis machine','Mollets debout haltères','Mollets presse à cuisses',
    'Mollets debout poids du corps','Crunch machine','Crunch poulie haute',
    'Relevé de jambes suspendu','Gainage planche','Gainage latéral','Russian Twist',
    'Relevé de buste','Roue abdominale','Mountain Climber','Vacuum abdominal',
    'Rotation buste poulie','Dragon Flag','Curl poignet barre','Extension poignet barre',
    'Curl marteau poulie','Reverse curl barre EZ','Farmer Walk'
  )
);

-- 2. Insertion des nouveaux mappings
INSERT INTO exercise_muscles (exercise_id, muscle, fascicle, role, activation_pct)
SELECT e.id, v.muscle, v.fascicle, v.role::text, v.activation_pct
FROM exercises e
INNER JOIN (VALUES
  -- ── PECTORAUX ───────────────────────────────────────────────────────────────
  -- Développé couché barre
  ('Développé couché barre','grand_pectoral','faisceau_sternal','primary',45),
  ('Développé couché barre','deltoide','faisceau_anterieur','primary',20),
  ('Développé couché barre','grand_pectoral','faisceau_claviculaire','secondary',15),
  ('Développé couché barre','grand_pectoral','faisceau_abdominal','secondary',5),
  ('Développé couché barre','triceps','chef_lateral','secondary',5),
  ('Développé couché barre','triceps','chef_medial','secondary',5),
  ('Développé couché barre','triceps','chef_long','secondary',5),
  -- Développé couché haltères
  ('Développé couché haltères','grand_pectoral','faisceau_sternal','primary',50),
  ('Développé couché haltères','grand_pectoral','faisceau_claviculaire','secondary',15),
  ('Développé couché haltères','grand_pectoral','faisceau_abdominal','secondary',5),
  ('Développé couché haltères','deltoide','faisceau_anterieur','secondary',15),
  ('Développé couché haltères','triceps','chef_lateral','secondary',5),
  ('Développé couché haltères','triceps','chef_medial','secondary',5),
  ('Développé couché haltères','triceps','chef_long','secondary',5),
  -- Développé incliné barre
  ('Développé incliné barre','grand_pectoral','faisceau_claviculaire','primary',45),
  ('Développé incliné barre','deltoide','faisceau_anterieur','primary',25),
  ('Développé incliné barre','grand_pectoral','faisceau_sternal','primary',20),
  ('Développé incliné barre','triceps','chef_lateral','secondary',5),
  ('Développé incliné barre','triceps','chef_medial','secondary',5),
  -- Développé incliné haltères
  ('Développé incliné haltères','grand_pectoral','faisceau_claviculaire','primary',50),
  ('Développé incliné haltères','grand_pectoral','faisceau_sternal','primary',20),
  ('Développé incliné haltères','deltoide','faisceau_anterieur','primary',20),
  ('Développé incliné haltères','triceps','chef_lateral','secondary',5),
  ('Développé incliné haltères','triceps','chef_medial','secondary',5),
  -- Développé décliné barre
  ('Développé décliné barre','grand_pectoral','faisceau_abdominal','primary',40),
  ('Développé décliné barre','grand_pectoral','faisceau_sternal','primary',30),
  ('Développé décliné barre','deltoide','faisceau_anterieur','secondary',15),
  ('Développé décliné barre','triceps','chef_lateral','secondary',5),
  ('Développé décliné barre','triceps','chef_medial','secondary',5),
  ('Développé décliné barre','triceps','chef_long','secondary',5),
  -- Développé décliné haltères
  ('Développé décliné haltères','grand_pectoral','faisceau_abdominal','primary',45),
  ('Développé décliné haltères','grand_pectoral','faisceau_sternal','primary',30),
  ('Développé décliné haltères','deltoide','faisceau_anterieur','secondary',10),
  ('Développé décliné haltères','triceps','chef_lateral','secondary',5),
  ('Développé décliné haltères','triceps','chef_medial','secondary',5),
  ('Développé décliné haltères','triceps','chef_long','secondary',5),
  -- Écarté couché haltères
  ('Écarté couché haltères','grand_pectoral','faisceau_sternal','primary',50),
  ('Écarté couché haltères','grand_pectoral','faisceau_claviculaire','primary',20),
  ('Écarté couché haltères','deltoide','faisceau_anterieur','primary',20),
  ('Écarté couché haltères','grand_pectoral','faisceau_abdominal','secondary',10),
  -- Écarté incliné haltères
  ('Écarté incliné haltères','grand_pectoral','faisceau_claviculaire','primary',60),
  ('Écarté incliné haltères','grand_pectoral','faisceau_sternal','primary',20),
  ('Écarté incliné haltères','deltoide','faisceau_anterieur','primary',20),
  -- Crossover poulie haute
  ('Crossover poulie haute','grand_pectoral','faisceau_abdominal','primary',50),
  ('Crossover poulie haute','grand_pectoral','faisceau_sternal','primary',30),
  ('Crossover poulie haute','deltoide','faisceau_anterieur','primary',20),
  -- Crossover poulie basse
  ('Crossover poulie basse','grand_pectoral','faisceau_claviculaire','primary',60),
  ('Crossover poulie basse','grand_pectoral','faisceau_sternal','primary',20),
  ('Crossover poulie basse','deltoide','faisceau_anterieur','primary',20),
  -- Pec Deck / Butterfly machine
  ('Pec Deck / Butterfly machine','grand_pectoral','faisceau_sternal','primary',50),
  ('Pec Deck / Butterfly machine','grand_pectoral','faisceau_claviculaire','primary',20),
  ('Pec Deck / Butterfly machine','deltoide','faisceau_anterieur','primary',20),
  ('Pec Deck / Butterfly machine','grand_pectoral','faisceau_abdominal','secondary',10),
  -- Pompes prise large
  ('Pompes prise large','grand_pectoral','faisceau_sternal','primary',45),
  ('Pompes prise large','grand_pectoral','faisceau_claviculaire','secondary',15),
  ('Pompes prise large','deltoide','faisceau_anterieur','secondary',15),
  ('Pompes prise large','triceps','chef_lateral','secondary',10),
  ('Pompes prise large','triceps','chef_medial','secondary',10),
  ('Pompes prise large','grand_pectoral','faisceau_abdominal','secondary',5),
  -- Pompes prise serrée
  ('Pompes prise serrée','triceps','chef_lateral','primary',25),
  ('Pompes prise serrée','triceps','chef_medial','primary',25),
  ('Pompes prise serrée','grand_pectoral','faisceau_sternal','primary',25),
  ('Pompes prise serrée','deltoide','faisceau_anterieur','secondary',15),
  ('Pompes prise serrée','triceps','chef_long','secondary',10),
  -- Dips pectoraux
  ('Dips pectoraux','grand_pectoral','faisceau_abdominal','primary',40),
  ('Dips pectoraux','grand_pectoral','faisceau_sternal','primary',20),
  ('Dips pectoraux','triceps','chef_lateral','secondary',15),
  ('Dips pectoraux','triceps','chef_medial','secondary',15),
  ('Dips pectoraux','deltoide','faisceau_anterieur','secondary',10),
  -- Développé couché Smith
  ('Développé couché Smith','grand_pectoral','faisceau_sternal','primary',45),
  ('Développé couché Smith','deltoide','faisceau_anterieur','primary',25),
  ('Développé couché Smith','grand_pectoral','faisceau_claviculaire','secondary',15),
  ('Développé couché Smith','grand_pectoral','faisceau_abdominal','secondary',5),
  ('Développé couché Smith','triceps','chef_lateral','secondary',5),
  ('Développé couché Smith','triceps','chef_medial','secondary',5),
  -- Pull-over haltère
  ('Pull-over haltère','grand_dorsal','faisceau_inferieur','primary',30),
  ('Pull-over haltère','grand_pectoral','faisceau_sternal','primary',20),
  ('Pull-over haltère','serratus_anterieur',NULL,'primary',20),
  ('Pull-over haltère','triceps','chef_long','primary',20),
  ('Pull-over haltère','grand_dorsal','faisceau_superieur','secondary',10),

  -- ── DOS ─────────────────────────────────────────────────────────────────────
  -- Soulevé de terre
  ('Soulevé de terre','erecteurs_rachis',NULL,'primary',30),
  ('Soulevé de terre','fessier_maximus',NULL,'primary',25),
  ('Soulevé de terre','ischio_jambiers','biceps_femoral','secondary',10),
  ('Soulevé de terre','avant_bras','flechisseurs_doigts','secondary',10),
  ('Soulevé de terre','ischio_jambiers','semi_tendineux','secondary',5),
  ('Soulevé de terre','ischio_jambiers','semi_membraneux','secondary',5),
  ('Soulevé de terre','grand_dorsal','faisceau_inferieur','secondary',5),
  ('Soulevé de terre','trapeze','faisceau_moyen','secondary',5),
  ('Soulevé de terre','trapeze','faisceau_superieur','secondary',5),
  -- Soulevé de terre roumain
  ('Soulevé de terre roumain','fessier_maximus',NULL,'primary',30),
  ('Soulevé de terre roumain','erecteurs_rachis',NULL,'primary',20),
  ('Soulevé de terre roumain','ischio_jambiers','biceps_femoral','primary',20),
  ('Soulevé de terre roumain','ischio_jambiers','semi_tendineux','secondary',15),
  ('Soulevé de terre roumain','ischio_jambiers','semi_membraneux','secondary',10),
  ('Soulevé de terre roumain','avant_bras','flechisseurs_doigts','secondary',5),
  -- Tirage barre horizontale
  ('Tirage barre horizontale','grand_dorsal','faisceau_inferieur','primary',20),
  ('Tirage barre horizontale','grand_dorsal','faisceau_superieur','primary',20),
  ('Tirage barre horizontale','rhomboide',NULL,'secondary',15),
  ('Tirage barre horizontale','trapeze','faisceau_moyen','secondary',15),
  ('Tirage barre horizontale','erecteurs_rachis',NULL,'secondary',10),
  ('Tirage barre horizontale','deltoide','faisceau_posterieur','secondary',10),
  ('Tirage barre horizontale','biceps','chef_court','secondary',5),
  ('Tirage barre horizontale','biceps','chef_long','secondary',5),
  -- Rowing haltère unilatéral
  ('Rowing haltère unilatéral','grand_dorsal','faisceau_inferieur','primary',25),
  ('Rowing haltère unilatéral','grand_dorsal','faisceau_superieur','primary',20),
  ('Rowing haltère unilatéral','rhomboide',NULL,'secondary',15),
  ('Rowing haltère unilatéral','trapeze','faisceau_moyen','secondary',10),
  ('Rowing haltère unilatéral','deltoide','faisceau_posterieur','secondary',10),
  ('Rowing haltère unilatéral','biceps','chef_court','secondary',10),
  ('Rowing haltère unilatéral','biceps','chef_long','secondary',10),
  -- Tirage vertical barre large
  ('Tirage vertical barre large','grand_dorsal','faisceau_superieur','primary',40),
  ('Tirage vertical barre large','grand_dorsal','faisceau_inferieur','primary',20),
  ('Tirage vertical barre large','brachial',NULL,'secondary',10),
  ('Tirage vertical barre large','biceps','chef_court','secondary',10),
  ('Tirage vertical barre large','grand_rond',NULL,'secondary',10),
  ('Tirage vertical barre large','trapeze','faisceau_inferieur','secondary',10),
  -- Tirage vertical prise serrée
  ('Tirage vertical prise serrée','grand_dorsal','faisceau_inferieur','primary',45),
  ('Tirage vertical prise serrée','grand_dorsal','faisceau_superieur','secondary',15),
  ('Tirage vertical prise serrée','biceps','chef_long','secondary',15),
  ('Tirage vertical prise serrée','biceps','chef_court','secondary',10),
  ('Tirage vertical prise serrée','brachial',NULL,'secondary',10),
  ('Tirage vertical prise serrée','rhomboide',NULL,'secondary',5),
  -- Tirage horizontal poulie
  ('Tirage horizontal poulie','grand_dorsal','faisceau_inferieur','primary',25),
  ('Tirage horizontal poulie','rhomboide',NULL,'primary',20),
  ('Tirage horizontal poulie','trapeze','faisceau_moyen','secondary',15),
  ('Tirage horizontal poulie','grand_dorsal','faisceau_superieur','secondary',10),
  ('Tirage horizontal poulie','deltoide','faisceau_posterieur','secondary',10),
  ('Tirage horizontal poulie','biceps','chef_court','secondary',10),
  ('Tirage horizontal poulie','biceps','chef_long','secondary',10),
  -- Tirage poulie basse prise large
  ('Tirage poulie basse prise large','grand_dorsal','faisceau_superieur','primary',30),
  ('Tirage poulie basse prise large','rhomboide',NULL,'primary',20),
  ('Tirage poulie basse prise large','trapeze','faisceau_moyen','primary',20),
  ('Tirage poulie basse prise large','deltoide','faisceau_posterieur','secondary',15),
  ('Tirage poulie basse prise large','biceps','chef_court','secondary',15),
  -- Traction prise large pronation
  ('Traction prise large pronation','grand_dorsal','faisceau_superieur','primary',45),
  ('Traction prise large pronation','grand_dorsal','faisceau_inferieur','secondary',15),
  ('Traction prise large pronation','grand_rond',NULL,'secondary',15),
  ('Traction prise large pronation','biceps','chef_court','secondary',10),
  ('Traction prise large pronation','brachial',NULL,'secondary',10),
  ('Traction prise large pronation','trapeze','faisceau_inferieur','secondary',5),
  -- Traction prise serrée supination
  ('Traction prise serrée supination','grand_dorsal','faisceau_inferieur','primary',35),
  ('Traction prise serrée supination','biceps','chef_long','primary',25),
  ('Traction prise serrée supination','biceps','chef_court','secondary',15),
  ('Traction prise serrée supination','grand_dorsal','faisceau_superieur','secondary',10),
  ('Traction prise serrée supination','brachial',NULL,'secondary',10),
  ('Traction prise serrée supination','deltoide','faisceau_posterieur','secondary',5),
  -- Traction prise neutre
  ('Traction prise neutre','grand_dorsal','faisceau_inferieur','primary',40),
  ('Traction prise neutre','brachial',NULL,'primary',20),
  ('Traction prise neutre','biceps','chef_long','secondary',15),
  ('Traction prise neutre','biceps','chef_court','secondary',10),
  ('Traction prise neutre','grand_dorsal','faisceau_superieur','secondary',10),
  ('Traction prise neutre','grand_rond',NULL,'secondary',5),
  -- Tirage nuque barre
  ('Tirage nuque barre','grand_dorsal','faisceau_superieur','primary',45),
  ('Tirage nuque barre','grand_dorsal','faisceau_inferieur','secondary',15),
  ('Tirage nuque barre','grand_rond',NULL,'secondary',15),
  ('Tirage nuque barre','rhomboide',NULL,'secondary',10),
  ('Tirage nuque barre','biceps','chef_court','secondary',10),
  ('Tirage nuque barre','brachial',NULL,'secondary',5),
  -- Rowing machine Hammer Strength
  ('Rowing machine Hammer Strength','grand_dorsal','faisceau_inferieur','primary',30),
  ('Rowing machine Hammer Strength','grand_dorsal','faisceau_superieur','primary',20),
  ('Rowing machine Hammer Strength','trapeze','faisceau_moyen','secondary',15),
  ('Rowing machine Hammer Strength','rhomboide',NULL,'secondary',15),
  ('Rowing machine Hammer Strength','deltoide','faisceau_posterieur','secondary',10),
  ('Rowing machine Hammer Strength','biceps','chef_court','secondary',10),
  -- Tirage poulie haute un bras
  ('Tirage poulie haute un bras','grand_dorsal','faisceau_inferieur','primary',45),
  ('Tirage poulie haute un bras','grand_dorsal','faisceau_superieur','primary',25),
  ('Tirage poulie haute un bras','biceps','chef_court','secondary',10),
  ('Tirage poulie haute un bras','grand_rond',NULL,'secondary',10),
  ('Tirage poulie haute un bras','brachial',NULL,'secondary',10),
  -- Extension dos à la machine
  ('Extension dos à la machine','erecteurs_rachis',NULL,'primary',60),
  ('Extension dos à la machine','fessier_maximus',NULL,'primary',25),
  ('Extension dos à la machine','ischio_jambiers','biceps_femoral','secondary',5),
  ('Extension dos à la machine','ischio_jambiers','semi_tendineux','secondary',5),
  ('Extension dos à la machine','ischio_jambiers','semi_membraneux','secondary',5),
  -- Good Morning
  ('Good Morning','erecteurs_rachis',NULL,'primary',40),
  ('Good Morning','fessier_maximus',NULL,'primary',30),
  ('Good Morning','ischio_jambiers','biceps_femoral','secondary',10),
  ('Good Morning','ischio_jambiers','semi_tendineux','secondary',10),
  ('Good Morning','ischio_jambiers','semi_membraneux','secondary',10),
  -- Shrug barre
  ('Shrug barre','trapeze','faisceau_superieur','primary',75),
  ('Shrug barre','trapeze','faisceau_moyen','secondary',10),
  ('Shrug barre','avant_bras','flechisseurs_doigts','secondary',10),
  ('Shrug barre','elevateur_scapula',NULL,'secondary',5),
  -- Shrug haltères
  ('Shrug haltères','trapeze','faisceau_superieur','primary',80),
  ('Shrug haltères','trapeze','faisceau_moyen','secondary',10),
  ('Shrug haltères','avant_bras','flechisseurs_doigts','secondary',5),
  ('Shrug haltères','elevateur_scapula',NULL,'secondary',5),

  -- ── ÉPAULES ─────────────────────────────────────────────────────────────────
  -- Développé militaire barre
  ('Développé militaire barre','deltoide','faisceau_anterieur','primary',40),
  ('Développé militaire barre','deltoide','faisceau_median','primary',20),
  ('Développé militaire barre','trapeze','faisceau_superieur','secondary',15),
  ('Développé militaire barre','triceps','chef_lateral','secondary',10),
  ('Développé militaire barre','triceps','chef_medial','secondary',10),
  ('Développé militaire barre','triceps','chef_long','secondary',5),
  -- Développé militaire haltères
  ('Développé militaire haltères','deltoide','faisceau_anterieur','primary',45),
  ('Développé militaire haltères','deltoide','faisceau_median','primary',25),
  ('Développé militaire haltères','trapeze','faisceau_superieur','secondary',10),
  ('Développé militaire haltères','triceps','chef_lateral','secondary',10),
  ('Développé militaire haltères','triceps','chef_medial','secondary',10),
  -- Développé Arnold
  ('Développé Arnold','deltoide','faisceau_anterieur','primary',40),
  ('Développé Arnold','deltoide','faisceau_median','primary',30),
  ('Développé Arnold','trapeze','faisceau_superieur','secondary',10),
  ('Développé Arnold','triceps','chef_lateral','secondary',10),
  ('Développé Arnold','triceps','chef_medial','secondary',10),
  -- Élévation latérale haltères
  ('Élévation latérale haltères','deltoide','faisceau_median','primary',75),
  ('Élévation latérale haltères','trapeze','faisceau_superieur','secondary',15),
  ('Élévation latérale haltères','deltoide','faisceau_anterieur','secondary',10),
  -- Élévation latérale poulie
  ('Élévation latérale poulie','deltoide','faisceau_median','primary',80),
  ('Élévation latérale poulie','trapeze','faisceau_superieur','secondary',15),
  ('Élévation latérale poulie','deltoide','faisceau_anterieur','secondary',5),
  -- Élévation avant haltères
  ('Élévation avant haltères','deltoide','faisceau_anterieur','primary',80),
  ('Élévation avant haltères','deltoide','faisceau_median','secondary',10),
  ('Élévation avant haltères','grand_pectoral','faisceau_claviculaire','secondary',10),
  -- Oiseau haltères
  ('Oiseau haltères','deltoide','faisceau_posterieur','primary',60),
  ('Oiseau haltères','rhomboide',NULL,'primary',20),
  ('Oiseau haltères','trapeze','faisceau_moyen','primary',20),
  -- Oiseau poulie
  ('Oiseau poulie','deltoide','faisceau_posterieur','primary',65),
  ('Oiseau poulie','trapeze','faisceau_moyen','primary',20),
  ('Oiseau poulie','rhomboide',NULL,'secondary',15),
  -- Face Pull poulie
  ('Face Pull poulie','deltoide','faisceau_posterieur','primary',40),
  ('Face Pull poulie','rhomboide',NULL,'primary',20),
  ('Face Pull poulie','infra_epineux',NULL,'secondary',15),
  ('Face Pull poulie','trapeze','faisceau_moyen','secondary',15),
  ('Face Pull poulie','biceps','chef_court','secondary',10),
  -- Rowing menton barre
  ('Rowing menton barre','deltoide','faisceau_median','primary',40),
  ('Rowing menton barre','trapeze','faisceau_superieur','primary',30),
  ('Rowing menton barre','deltoide','faisceau_anterieur','primary',20),
  ('Rowing menton barre','biceps','chef_court','secondary',10),
  -- Rowing menton haltères
  ('Rowing menton haltères','deltoide','faisceau_median','primary',45),
  ('Rowing menton haltères','trapeze','faisceau_superieur','primary',30),
  ('Rowing menton haltères','deltoide','faisceau_anterieur','secondary',15),
  ('Rowing menton haltères','biceps','chef_court','secondary',10),
  -- Développé machine guidée
  ('Développé machine guidée','deltoide','faisceau_anterieur','primary',45),
  ('Développé machine guidée','deltoide','faisceau_median','primary',25),
  ('Développé machine guidée','triceps','chef_lateral','secondary',15),
  ('Développé machine guidée','triceps','chef_medial','secondary',15),
  -- Élévation latérale machine
  ('Élévation latérale machine','deltoide','faisceau_median','primary',85),
  ('Élévation latérale machine','trapeze','faisceau_superieur','secondary',15),
  -- Handstand push-up
  ('Handstand push-up','deltoide','faisceau_anterieur','primary',40),
  ('Handstand push-up','deltoide','faisceau_median','primary',20),
  ('Handstand push-up','triceps','chef_lateral','secondary',15),
  ('Handstand push-up','triceps','chef_medial','secondary',15),
  ('Handstand push-up','trapeze','faisceau_superieur','secondary',10),

  -- ── BICEPS ──────────────────────────────────────────────────────────────────
  -- Curl barre droite
  ('Curl barre droite','biceps','chef_court','primary',45),
  ('Curl barre droite','biceps','chef_long','primary',40),
  ('Curl barre droite','brachial',NULL,'secondary',10),
  ('Curl barre droite','brachioradial',NULL,'secondary',5),
  -- Curl barre EZ
  ('Curl barre EZ','biceps','chef_long','primary',40),
  ('Curl barre EZ','biceps','chef_court','primary',40),
  ('Curl barre EZ','brachial',NULL,'secondary',10),
  ('Curl barre EZ','brachioradial',NULL,'secondary',10),
  -- Curl haltères alterné
  ('Curl haltères alterné','biceps','chef_court','primary',45),
  ('Curl haltères alterné','biceps','chef_long','primary',45),
  ('Curl haltères alterné','brachial',NULL,'secondary',5),
  ('Curl haltères alterné','brachioradial',NULL,'secondary',5),
  -- Curl haltères marteau
  ('Curl haltères marteau','brachioradial',NULL,'primary',40),
  ('Curl haltères marteau','brachial',NULL,'primary',30),
  ('Curl haltères marteau','biceps','chef_long','primary',20),
  ('Curl haltères marteau','biceps','chef_court','secondary',10),
  -- Curl incliné haltères
  ('Curl incliné haltères','biceps','chef_long','primary',60),
  ('Curl incliné haltères','biceps','chef_court','primary',30),
  ('Curl incliné haltères','brachial',NULL,'secondary',10),
  -- Curl Larry Scott haltères
  ('Curl Larry Scott haltères','biceps','chef_court','primary',60),
  ('Curl Larry Scott haltères','biceps','chef_long','primary',20),
  ('Curl Larry Scott haltères','brachial',NULL,'primary',20),
  -- Curl poulie basse
  ('Curl poulie basse','biceps','chef_court','primary',50),
  ('Curl poulie basse','biceps','chef_long','primary',35),
  ('Curl poulie basse','brachial',NULL,'secondary',10),
  ('Curl poulie basse','brachioradial',NULL,'secondary',5),
  -- Curl concentration
  ('Curl concentration','biceps','chef_court','primary',50),
  ('Curl concentration','biceps','chef_long','primary',30),
  ('Curl concentration','brachial',NULL,'primary',20),
  -- Curl machine
  ('Curl machine','biceps','chef_court','primary',55),
  ('Curl machine','biceps','chef_long','primary',25),
  ('Curl machine','brachial',NULL,'primary',20),

  -- ── TRICEPS ─────────────────────────────────────────────────────────────────
  -- Dips triceps
  ('Dips triceps','triceps','chef_lateral','primary',30),
  ('Dips triceps','triceps','chef_medial','primary',30),
  ('Dips triceps','grand_pectoral','faisceau_sternal','secondary',15),
  ('Dips triceps','deltoide','faisceau_anterieur','secondary',15),
  ('Dips triceps','triceps','chef_long','secondary',10),
  -- Extension triceps poulie haute
  ('Extension triceps poulie haute','triceps','chef_lateral','primary',45),
  ('Extension triceps poulie haute','triceps','chef_medial','primary',40),
  ('Extension triceps poulie haute','triceps','chef_long','secondary',15),
  -- Extension triceps barre droite
  ('Extension triceps barre droite','triceps','chef_medial','primary',45),
  ('Extension triceps barre droite','triceps','chef_lateral','primary',40),
  ('Extension triceps barre droite','triceps','chef_long','secondary',15),
  -- Extension nuque barre EZ
  ('Extension nuque barre EZ','triceps','chef_long','primary',50),
  ('Extension nuque barre EZ','triceps','chef_lateral','primary',30),
  ('Extension nuque barre EZ','triceps','chef_medial','primary',20),
  -- Extension nuque haltère
  ('Extension nuque haltère','triceps','chef_long','primary',65),
  ('Extension nuque haltère','triceps','chef_lateral','primary',20),
  ('Extension nuque haltère','triceps','chef_medial','secondary',15),
  -- Kick-back haltère
  ('Kick-back haltère','triceps','chef_lateral','primary',40),
  ('Kick-back haltère','triceps','chef_medial','primary',40),
  ('Kick-back haltère','triceps','chef_long','primary',20),
  -- Extension triceps poulie basse
  ('Extension triceps poulie basse','triceps','chef_long','primary',60),
  ('Extension triceps poulie basse','triceps','chef_lateral','primary',20),
  ('Extension triceps poulie basse','triceps','chef_medial','primary',20),
  -- Développé couché prise serrée
  ('Développé couché prise serrée','triceps','chef_lateral','primary',25),
  ('Développé couché prise serrée','triceps','chef_medial','primary',25),
  ('Développé couché prise serrée','grand_pectoral','faisceau_sternal','primary',20),
  ('Développé couché prise serrée','deltoide','faisceau_anterieur','primary',20),
  ('Développé couché prise serrée','triceps','chef_long','secondary',10),
  -- Extension triceps machine
  ('Extension triceps machine','triceps','chef_lateral','primary',35),
  ('Extension triceps machine','triceps','chef_medial','primary',35),
  ('Extension triceps machine','triceps','chef_long','primary',30),

  -- ── QUADRICEPS ──────────────────────────────────────────────────────────────
  -- Squat barre
  ('Squat barre','fessier_maximus',NULL,'primary',30),
  ('Squat barre','quadriceps','vastus_lateralis','primary',20),
  ('Squat barre','quadriceps','vastus_medialis','primary',20),
  ('Squat barre','quadriceps','rectus_femoris','secondary',10),
  ('Squat barre','adducteurs',NULL,'secondary',10),
  ('Squat barre','erecteurs_rachis',NULL,'secondary',10),
  -- Squat goblet
  ('Squat goblet','quadriceps','vastus_lateralis','primary',25),
  ('Squat goblet','quadriceps','vastus_medialis','primary',25),
  ('Squat goblet','fessier_maximus',NULL,'primary',20),
  ('Squat goblet','quadriceps','rectus_femoris','secondary',15),
  ('Squat goblet','abdominaux','rectus_abdominis','secondary',15),
  -- Squat Smith machine
  ('Squat Smith machine','fessier_maximus',NULL,'primary',30),
  ('Squat Smith machine','quadriceps','vastus_lateralis','primary',25),
  ('Squat Smith machine','quadriceps','vastus_medialis','primary',25),
  ('Squat Smith machine','quadriceps','rectus_femoris','secondary',10),
  ('Squat Smith machine','adducteurs',NULL,'secondary',10),
  -- Presse à cuisses
  ('Presse à cuisses','quadriceps','vastus_lateralis','primary',25),
  ('Presse à cuisses','quadriceps','vastus_medialis','primary',25),
  ('Presse à cuisses','fessier_maximus',NULL,'primary',25),
  ('Presse à cuisses','quadriceps','rectus_femoris','secondary',15),
  ('Presse à cuisses','adducteurs',NULL,'secondary',10),
  -- Fente marchée haltères
  ('Fente marchée haltères','fessier_maximus',NULL,'primary',40),
  ('Fente marchée haltères','quadriceps','vastus_lateralis','primary',20),
  ('Fente marchée haltères','quadriceps','vastus_medialis','primary',20),
  ('Fente marchée haltères','adducteurs',NULL,'secondary',10),
  ('Fente marchée haltères','ischio_jambiers','biceps_femoral','secondary',5),
  ('Fente marchée haltères','ischio_jambiers','semi_tendineux','secondary',5),
  -- Fente bulgare haltères
  ('Fente bulgare haltères','fessier_maximus',NULL,'primary',45),
  ('Fente bulgare haltères','quadriceps','vastus_lateralis','primary',20),
  ('Fente bulgare haltères','quadriceps','vastus_medialis','primary',20),
  ('Fente bulgare haltères','fessier_median',NULL,'secondary',5),
  ('Fente bulgare haltères','ischio_jambiers','biceps_femoral','secondary',5),
  ('Fente bulgare haltères','ischio_jambiers','semi_tendineux','secondary',5),
  -- Extension jambes machine
  ('Extension jambes machine','quadriceps','rectus_femoris','primary',40),
  ('Extension jambes machine','quadriceps','vastus_lateralis','primary',30),
  ('Extension jambes machine','quadriceps','vastus_medialis','primary',30),
  -- Hack squat machine
  ('Hack squat machine','quadriceps','vastus_lateralis','primary',30),
  ('Hack squat machine','quadriceps','vastus_medialis','primary',30),
  ('Hack squat machine','fessier_maximus',NULL,'primary',20),
  ('Hack squat machine','quadriceps','rectus_femoris','primary',20),
  -- Squat sauté poids du corps
  ('Squat sauté poids du corps','quadriceps','vastus_lateralis','primary',25),
  ('Squat sauté poids du corps','quadriceps','vastus_medialis','primary',25),
  ('Squat sauté poids du corps','fessier_maximus',NULL,'primary',20),
  ('Squat sauté poids du corps','quadriceps','rectus_femoris','secondary',15),
  ('Squat sauté poids du corps','mollets','gastrocnemien_medial','secondary',8),
  ('Squat sauté poids du corps','mollets','gastrocnemien_lateral','secondary',7),
  -- Leg press unilatéral
  ('Leg press unilatéral','quadriceps','vastus_lateralis','primary',25),
  ('Leg press unilatéral','quadriceps','vastus_medialis','primary',25),
  ('Leg press unilatéral','fessier_maximus',NULL,'primary',25),
  ('Leg press unilatéral','quadriceps','rectus_femoris','secondary',15),
  ('Leg press unilatéral','fessier_median',NULL,'secondary',10),

  -- ── ISCHIO-JAMBIERS ─────────────────────────────────────────────────────────
  -- Soulevé de terre jambes tendues
  ('Soulevé de terre jambes tendues','ischio_jambiers','biceps_femoral','primary',25),
  ('Soulevé de terre jambes tendues','fessier_maximus',NULL,'primary',20),
  ('Soulevé de terre jambes tendues','erecteurs_rachis',NULL,'primary',20),
  ('Soulevé de terre jambes tendues','ischio_jambiers','semi_membraneux','secondary',15),
  ('Soulevé de terre jambes tendues','ischio_jambiers','semi_tendineux','secondary',15),
  ('Soulevé de terre jambes tendues','avant_bras','flechisseurs_doigts','secondary',5),
  -- Curl jambes couché machine
  ('Curl jambes couché machine','ischio_jambiers','biceps_femoral','primary',45),
  ('Curl jambes couché machine','ischio_jambiers','semi_tendineux','primary',30),
  ('Curl jambes couché machine','ischio_jambiers','semi_membraneux','primary',25),
  -- Curl jambes assis machine
  ('Curl jambes assis machine','ischio_jambiers','biceps_femoral','primary',45),
  ('Curl jambes assis machine','ischio_jambiers','semi_tendineux','primary',30),
  ('Curl jambes assis machine','ischio_jambiers','semi_membraneux','primary',25),
  -- Curl jambes debout poulie
  ('Curl jambes debout poulie','ischio_jambiers','biceps_femoral','primary',45),
  ('Curl jambes debout poulie','ischio_jambiers','semi_tendineux','primary',30),
  ('Curl jambes debout poulie','ischio_jambiers','semi_membraneux','primary',25),
  -- Hip Thrust barre
  ('Hip Thrust barre','fessier_maximus',NULL,'primary',65),
  ('Hip Thrust barre','ischio_jambiers','biceps_femoral','secondary',10),
  ('Hip Thrust barre','fessier_median',NULL,'secondary',10),
  ('Hip Thrust barre','quadriceps','vastus_medialis','secondary',8),
  ('Hip Thrust barre','quadriceps','vastus_lateralis','secondary',7),
  -- Glute Bridge poids du corps
  ('Glute Bridge poids du corps','fessier_maximus',NULL,'primary',70),
  ('Glute Bridge poids du corps','ischio_jambiers','biceps_femoral','secondary',10),
  ('Glute Bridge poids du corps','fessier_median',NULL,'secondary',10),
  ('Glute Bridge poids du corps','erecteurs_rachis',NULL,'secondary',10),
  -- Fente arrière barre
  ('Fente arrière barre','fessier_maximus',NULL,'primary',45),
  ('Fente arrière barre','quadriceps','vastus_lateralis','primary',20),
  ('Fente arrière barre','quadriceps','vastus_medialis','primary',20),
  ('Fente arrière barre','ischio_jambiers','biceps_femoral','secondary',5),
  ('Fente arrière barre','ischio_jambiers','semi_tendineux','secondary',5),
  ('Fente arrière barre','erecteurs_rachis',NULL,'secondary',5),
  -- Good Morning haltères
  ('Good Morning haltères','erecteurs_rachis',NULL,'primary',40),
  ('Good Morning haltères','fessier_maximus',NULL,'primary',30),
  ('Good Morning haltères','ischio_jambiers','biceps_femoral','secondary',10),
  ('Good Morning haltères','ischio_jambiers','semi_tendineux','secondary',10),
  ('Good Morning haltères','ischio_jambiers','semi_membraneux','secondary',10),

  -- ── FESSIERS ────────────────────────────────────────────────────────────────
  -- Hip Thrust machine
  ('Hip Thrust machine','fessier_maximus',NULL,'primary',70),
  ('Hip Thrust machine','ischio_jambiers','biceps_femoral','secondary',10),
  ('Hip Thrust machine','fessier_median',NULL,'secondary',10),
  ('Hip Thrust machine','quadriceps','vastus_medialis','secondary',5),
  ('Hip Thrust machine','quadriceps','vastus_lateralis','secondary',5),
  -- Abduction hanche machine
  ('Abduction hanche machine','fessier_median',NULL,'primary',70),
  ('Abduction hanche machine','fessier_minimus',NULL,'primary',20),
  ('Abduction hanche machine','tenseur_fascia_lata',NULL,'secondary',10),
  -- Donkey kick poulie
  ('Donkey kick poulie','fessier_maximus',NULL,'primary',80),
  ('Donkey kick poulie','ischio_jambiers','biceps_femoral','primary',20),
  -- Fente latérale haltères
  ('Fente latérale haltères','fessier_maximus',NULL,'primary',30),
  ('Fente latérale haltères','fessier_median',NULL,'primary',20),
  ('Fente latérale haltères','quadriceps','vastus_medialis','primary',20),
  ('Fente latérale haltères','quadriceps','vastus_lateralis','secondary',15),
  ('Fente latérale haltères','adducteurs',NULL,'secondary',15),
  -- Squat sumo barre
  ('Squat sumo barre','fessier_maximus',NULL,'primary',35),
  ('Squat sumo barre','adducteurs',NULL,'primary',25),
  ('Squat sumo barre','quadriceps','vastus_lateralis','secondary',15),
  ('Squat sumo barre','quadriceps','vastus_medialis','secondary',15),
  ('Squat sumo barre','quadriceps','rectus_femoris','secondary',10),
  -- Hip Thrust haltère unilatéral
  ('Hip Thrust haltère unilatéral','fessier_maximus',NULL,'primary',65),
  ('Hip Thrust haltère unilatéral','ischio_jambiers','biceps_femoral','secondary',10),
  ('Hip Thrust haltère unilatéral','fessier_median',NULL,'secondary',10),
  ('Hip Thrust haltère unilatéral','quadriceps','vastus_medialis','secondary',8),
  ('Hip Thrust haltère unilatéral','quadriceps','vastus_lateralis','secondary',7),
  -- Kickback fessiers machine
  ('Kickback fessiers machine','fessier_maximus',NULL,'primary',80),
  ('Kickback fessiers machine','ischio_jambiers','biceps_femoral','primary',20),

  -- ── MOLLETS ─────────────────────────────────────────────────────────────────
  -- Mollets debout machine
  ('Mollets debout machine','mollets','gastrocnemien_medial','primary',45),
  ('Mollets debout machine','mollets','gastrocnemien_lateral','primary',40),
  ('Mollets debout machine','mollets','soleus','secondary',15),
  -- Mollets assis machine
  ('Mollets assis machine','mollets','soleus','primary',70),
  ('Mollets assis machine','mollets','gastrocnemien_medial','secondary',15),
  ('Mollets assis machine','mollets','gastrocnemien_lateral','secondary',15),
  -- Mollets debout haltères
  ('Mollets debout haltères','mollets','gastrocnemien_medial','primary',45),
  ('Mollets debout haltères','mollets','gastrocnemien_lateral','primary',40),
  ('Mollets debout haltères','mollets','soleus','secondary',15),
  -- Mollets presse à cuisses
  ('Mollets presse à cuisses','mollets','gastrocnemien_medial','primary',45),
  ('Mollets presse à cuisses','mollets','gastrocnemien_lateral','primary',40),
  ('Mollets presse à cuisses','mollets','soleus','secondary',15),
  -- Mollets debout poids du corps
  ('Mollets debout poids du corps','mollets','gastrocnemien_medial','primary',45),
  ('Mollets debout poids du corps','mollets','gastrocnemien_lateral','primary',40),
  ('Mollets debout poids du corps','mollets','soleus','secondary',15),

  -- ── ABDOMINAUX ──────────────────────────────────────────────────────────────
  -- Crunch machine
  ('Crunch machine','abdominaux','rectus_abdominis','primary',80),
  ('Crunch machine','abdominaux','obliques_externes','secondary',10),
  ('Crunch machine','abdominaux','obliques_internes','secondary',10),
  -- Crunch poulie haute
  ('Crunch poulie haute','abdominaux','rectus_abdominis','primary',80),
  ('Crunch poulie haute','abdominaux','obliques_externes','secondary',10),
  ('Crunch poulie haute','abdominaux','obliques_internes','secondary',10),
  -- Relevé de jambes suspendu
  ('Relevé de jambes suspendu','abdominaux','rectus_abdominis','primary',50),
  ('Relevé de jambes suspendu','iliopsoas',NULL,'primary',40),
  ('Relevé de jambes suspendu','abdominaux','obliques_externes','secondary',10),
  -- Gainage planche
  ('Gainage planche','abdominaux','rectus_abdominis','primary',40),
  ('Gainage planche','abdominaux','transverse','primary',40),
  ('Gainage planche','abdominaux','obliques_externes','secondary',10),
  ('Gainage planche','abdominaux','obliques_internes','secondary',10),
  -- Gainage latéral
  ('Gainage latéral','abdominaux','obliques_externes','primary',40),
  ('Gainage latéral','abdominaux','obliques_internes','primary',40),
  ('Gainage latéral','abdominaux','transverse','secondary',10),
  ('Gainage latéral','quadratus_lumborum',NULL,'secondary',10),
  -- Russian Twist
  ('Russian Twist','abdominaux','obliques_externes','primary',35),
  ('Russian Twist','abdominaux','obliques_internes','primary',35),
  ('Russian Twist','abdominaux','rectus_abdominis','primary',30),
  -- Relevé de buste
  ('Relevé de buste','abdominaux','rectus_abdominis','primary',60),
  ('Relevé de buste','iliopsoas',NULL,'primary',30),
  ('Relevé de buste','abdominaux','obliques_externes','secondary',10),
  -- Roue abdominale
  ('Roue abdominale','abdominaux','rectus_abdominis','primary',60),
  ('Roue abdominale','abdominaux','transverse','primary',20),
  ('Roue abdominale','grand_dorsal','faisceau_inferieur','secondary',10),
  ('Roue abdominale','triceps','chef_long','secondary',10),
  -- Mountain Climber
  ('Mountain Climber','abdominaux','rectus_abdominis','primary',40),
  ('Mountain Climber','iliopsoas',NULL,'primary',30),
  ('Mountain Climber','abdominaux','obliques_externes','secondary',15),
  ('Mountain Climber','deltoide','faisceau_anterieur','secondary',15),
  -- Vacuum abdominal
  ('Vacuum abdominal','abdominaux','transverse','primary',100),
  -- Rotation buste poulie
  ('Rotation buste poulie','abdominaux','obliques_externes','primary',45),
  ('Rotation buste poulie','abdominaux','obliques_internes','primary',45),
  ('Rotation buste poulie','abdominaux','rectus_abdominis','secondary',10),
  -- Dragon Flag
  ('Dragon Flag','abdominaux','rectus_abdominis','primary',70),
  ('Dragon Flag','abdominaux','transverse','primary',20),
  ('Dragon Flag','iliopsoas',NULL,'secondary',10),

  -- ── AVANT-BRAS ──────────────────────────────────────────────────────────────
  -- Curl poignet barre
  ('Curl poignet barre','avant_bras','flechisseurs_poignet','primary',80),
  ('Curl poignet barre','avant_bras','flechisseurs_doigts','primary',20),
  -- Extension poignet barre
  ('Extension poignet barre','avant_bras','extenseurs_poignet','primary',90),
  ('Extension poignet barre','brachioradial',NULL,'secondary',10),
  -- Curl marteau poulie
  ('Curl marteau poulie','brachioradial',NULL,'primary',45),
  ('Curl marteau poulie','brachial',NULL,'primary',25),
  ('Curl marteau poulie','biceps','chef_long','primary',20),
  ('Curl marteau poulie','biceps','chef_court','secondary',10),
  -- Reverse curl barre EZ
  ('Reverse curl barre EZ','brachioradial',NULL,'primary',50),
  ('Reverse curl barre EZ','brachial',NULL,'primary',30),
  ('Reverse curl barre EZ','avant_bras','extenseurs_poignet','secondary',10),
  ('Reverse curl barre EZ','biceps','chef_long','secondary',10),
  -- Farmer Walk
  ('Farmer Walk','avant_bras','flechisseurs_doigts','primary',50),
  ('Farmer Walk','trapeze','faisceau_superieur','primary',30),
  ('Farmer Walk','deltoide','faisceau_median','secondary',10),
  ('Farmer Walk','erecteurs_rachis',NULL,'secondary',10)

) AS v(exercise_name, muscle, fascicle, role, activation_pct)
ON e.name_fr = v.exercise_name;

COMMIT;

-- Vérification post-insert : total lignes + répartition par rôle
SELECT role, COUNT(*) AS nb_lignes
FROM exercise_muscles
GROUP BY role
ORDER BY role;
