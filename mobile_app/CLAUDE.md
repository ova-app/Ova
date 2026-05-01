# Orava — CTO virtuel

## ⚠️ Instruction de démarrage S12
Ce fichier peut être incomplet : S11 a été réalisée dans Claude Code sans recap exhaustif.
**Avant de coder, scanne le codebase** (`app/`, `context/`, `lib/`, `constants/`) pour détecter ce qui existe réellement, puis corrige silencieusement ce CLAUDE.md si nécessaire.

---

## Rôle
Tu es le CTO virtuel d'Orava. Produis du code TypeScript complet prêt à coller, sans réexpliquer l'existant. Signale toute migration SQL avant de coder.

## Stack
- React Native + Expo (TypeScript strict) + Expo Router (`app/`)
- Supabase : PostgreSQL + Auth + RLS (projet ORAVA, région Frankfurt)
- Auth storage : expo-secure-store — adaptateur custom chunks 1800 bytes (JWT > 2048b)
- Git : branche `main` stable · `dev` travail · `feat/xxx` par feature
- Icônes : Lucide React Native
- Couleurs : orange `#D85A30` · ambre `#FAC775`/`#412402` · fond `#1C1C1E` (dark) / `#FFFFFF` (light) · texte `#FFFFFF` / `#1C1C1E`

## Thème
ThemeContext dark/light avec persistance AsyncStorage.
| Token | Sombre | Clair |
|---|---|---|
| background | #1C1C1E | #FFFFFF |
| backgroundSecondary | #2C2C2E | #F5F5F5 |
| textPrimary | #FFFFFF | #1C1C1E |
| textSecondary | #8E8E93 | #666666 |
| separator | #3A3A3C | #E5E5E5 |
| accent | #D85A30 | #D85A30 |

## Schéma BDD (11 tables + colonnes S10/S11 à confirmer)
```
users             : id, email, username, full_name, avatar_url, weight_unit(kg|lbs), plan(free|premium), locale, created_at
follows           : follower_id → users.id, following_id → users.id, created_at
gyms              : id, name, address, lat, lng, is_home, created_by → users.id, created_at
muscles           : id, name, group, body_side
exercises         : id, name, slug, equipment, mechanics, force_type, laterality, source, external_id, is_verified, created_by, created_at
                    ⚠️ 113 exercices manuels (S10) — Wger abandonné
exercise_muscles  : exercise_id, muscle_id, role(primary|secondary|stabilizer), activation_pct, source, confidence
workouts          : id, user_id, gym_id, title, started_at, ended_at, duration_sec, total_volume_kg, is_public(DEFAULT false), note, lat, lng
                    + avg_rest_seconds — ⚠️ migration S12 à confirmer
workout_exercises : id, workout_id, exercise_id, order_index, note
workout_sets      : id, workout_exercise_id, set_type(warmup|working|dropset|failure), set_number, reps, weight_kg, rest_sec, rpe, is_pr, pr_level(text NULL), parent_set_id, is_continuation, logged_at
                    + rest_seconds — ⚠️ migration S12 à confirmer
likes             : user_id, workout_id, created_at
comments          : id, workout_id, user_id, content, created_at
```

### Migrations S12 à appliquer en premier
```sql
-- Débloque PRs niveaux + temps de repos
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS pr_level text NULL; -- 'gold'|'silver'|'bronze'
ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS rest_seconds integer NULL;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS avg_rest_seconds integer NULL;
```

### RLS appliquées (S07)
```sql
-- workouts : ses séances + séances publiques
USING (user_id = auth.uid() OR is_public = true)
-- workout_exercises + workout_sets : via workout_id parent
-- likes : INSERT CHECK (user_id = auth.uid()) · DELETE/SELECT classiques
-- exercises + exercise_muscles : RLS désactivée (données publiques)
```

### Index + Trigger Supabase (S07)
```sql
CREATE INDEX idx_workouts_feed ON workouts(started_at DESC) WHERE is_public = true;
CREATE INDEX idx_workouts_user_date ON workouts(user_id, started_at DESC);
-- trg_update_volume → recalcul total_volume_kg sur INSERT/UPDATE/DELETE workout_sets
```

## Structure fichiers (état S11 — à valider par scan S12)
```
app/
├── _layout.tsx              — guard auth + WorkoutProvider + ThemeProvider + StatusBar
├── index.tsx                — splash animé → redirect /auth/login
├── auth/login.tsx           — connexion email/password
├── auth/register.tsx        — prénom, username, email, password
├── (tabs)/
│   ├── _layout.tsx          — navbar 5 tabs (Users/Dumbbell/CirclePlus/CalendarDays/CircleUser)
│   ├── feed.tsx             — timeline sociale (likes + commentaires + photo_url)
│   ├── history.tsx          — liste séances par mois (SectionList antichronologique)
│   ├── library.tsx          — 113 exercices manuels, SectionList par muscle,
│   │                          filtres chips équipement + type, badges Poly/gris
│   └── profile.tsx          — stats mois, PRs top 20, déconnexion
├── workout/
│   ├── session.tsx          — log séance, ScrollPicker custom par équipement,
│   │                          confirmation modale avant lancement, swipe modifier/supprimer ⚠️ bug S11
│   ├── timer.tsx            — réécrit S11 : roue custom TimerWheelColumn,
│   │                          auto-start, presets 45s/60s/90s/120s, fix AppState
│   └── summary.tsx          — résumé + bloc PRs battus + toggle is_public + save Supabase
├── history/[id].tsx         — détail séance + photo_url + barres muscles travaillés
├── exercise/[id].tsx        — fiche exercice + barres musculaires (primary/secondary/stabilizer)
├── analytics.tsx            — graphes Victory Native (1M/3M/6M/1A/Tout)
│                              muscles, régularité, progression charges, déséquilibres
└── settings.tsx             — kg/lbs, dark/light, vibration, timer défaut,
                               visibilité séances, modifier profil, supprimer compte
context/
├── WorkoutContext.tsx        — status(idle|active|done), startedAt, exercises,
│                              currentIndex, elapsedSeconds
│                              Détection PR : Charge, Série, 1RM (Epley w×(1+r/30))
│                              ⚠️ PR Séance (volume/muscle) et podium or/argent/bronze non implémentés
└── ThemeContext.tsx          — dark/light + persistance AsyncStorage
lib/supabase.ts              — client Supabase (SecureStore fragmenté, autoRefreshToken)
types/index.ts               — types globaux TypeScript
constants/Colors.ts          — palette Orava + tokens thème
scripts/import-exercises.ts  — ⚠️ NE PAS RELANCER — remplacé par orava_exercises_bdd.sql (S10)
```

## Système PR (S10 — podium partiellement implémenté)
| Type | Définition | Icône | Couleur 1er |
|---|---|---|---|
| PR Charge | Poids max toutes reps | Zap | #FFD700 Or |
| PR Série | Max (poids × reps) sur 1 set | Flame | #D85A30 Orange |
| PR 1RM estimé | Epley : w × (1 + r/30) | Trophy | #FFD700 Or |
| PR Séance | Volume max par muscle group | BarChart2 | #9B59B6 Violet — ⚠️ non implémenté |

Podium : Or #FFD700 · Argent #C0C0C0 · Bronze #CD7F32 — ⚠️ non implémenté, bloqué sur migration `pr_level`

## Picker poids — granulométrie (S10)
| Équipement | Pas | Plage |
|---|---|---|
| Haltères | 2 kg | 2 → 60 kg |
| Poulie / Machine | 2,5 kg | 2,5 → 200 kg |
| Barre | 20kg + disques ×2 | 20 → ~220 kg |
| Poids du corps | Reps only | — |
| Kettlebell | 4 kg | 4 → 48 kg |

## Avancement sessions
| Session | Contenu | Statut |
|---|---|---|
| S01 | Vision, Product Brief v2, BDD | ✅ |
| S02 | UX & Wireframes | ✅ |
| S03 | Setup Expo + Supabase + 11 tables | ✅ |
| S04 | Auth complet | ✅ |
| S05 | Bibliothèque Wger (remplacée en S10) | ✅ |
| S06 | Zone entraînement — WorkoutContext, session, timer, summary, FAB | ✅ |
| S07 | Historique + Feed — 7 RLS + 2 index + 1 trigger | ✅ |
| S08 | Config EAS, app.json, eas.json | ✅ |
| S09 | Finalisation MVP — CommentsModal, fix timer AppState | ✅ |
| S10 | BDD 113 exos manuels, ThemeContext, PRs, Analytics, Settings, Splash | ✅ |
| S11 | Fix picker poids, timer réécrit, photos feed/détail, muscles détail, fix prs.tsx | ✅ (Claude Code — recap partiel) |
| S12 | Migration BDD (pr_level, rest_seconds), PRs podium, temps de repos, analytics | 🔄 À venir |

## Priorités S12
- 🔴 Migration BDD `pr_level` + `rest_seconds` + `avg_rest_seconds` (débloque #3 et #5)
- 🔴 PR 3 niveaux Or/Argent/Bronze
- 🔴 Temps de repos inter-séries (WorkoutContext + summary)
- 🟠 Analytics — graphes Victory Native
- 🟡 Splash screen — tap anywhere to enter
- 🟡 Swipe modifier/supprimer série (non implémenté S11)
- 🟡 Photos au log (expo-image-picker)
- 🟡 Photo de profil (bucket profiles + avatar_url)
- 🟡 Armurerie — filtre groupe musculaire + recherche
- 🟢 Nom intelligent de séance (algo dans doc S11)
- 🟢 Onglet "Comment ça marche" (textes dans doc S11)
- 🟢 Voir qui a liké une publication
- 🟢 Géolocalisation auto sur feed

## Règles impératives
- Poids toujours en kg en base — conversion kg/lbs à l'affichage uniquement
- `duration_sec` (integer) — confirmé ✅, jamais `duration_seconds`
- `is_public` DEFAULT false — toggle dans summary.tsx
- Aucune donnée persistée avant save dans summary.tsx — tout vit dans WorkoutContext
- Trigger `on_auth_user_created` crée public.users automatiquement
- Ne jamais relancer `scripts/import-exercises.ts` ni `orava_exercises_bdd.sql`
- Commits : `feat/fix/chore: description courte`
- Interface en français — anglicismes conservés : Sets, Reps, PR, Timer, Streak
