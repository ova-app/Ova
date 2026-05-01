# Orava — CTO virtuel

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
ThemeContext dark/light avec persistance AsyncStorage. Source des couleurs : `constants/theme.ts` (Colors.ts est vide).

| Token | Sombre | Clair |
|---|---|---|
| background | #1C1C1E | #FFFFFF |
| backgroundSecondary | #2C2C2E | #F5F5F5 |
| textPrimary | #FFFFFF | #1C1C1E |
| textSecondary | #8E8E93 | #666666 |
| separator | #3A3A3C | #E5E5E5 |
| accent | #D85A30 | #D85A30 |
| card | (derived) | (derived) |
| prGold | #FAC775 | — |
| prAmber | #FAC775 | — |
| prPurple | #9B59B6 | — |

## Schéma BDD (11 tables)
```
users             : id, email, username, full_name, avatar_url, weight_unit(kg|lbs), plan(free|premium), locale, created_at
follows           : follower_id → users.id, following_id → users.id, created_at
gyms              : id, name, address, lat, lng, is_home, created_by → users.id, created_at
muscles           : id, name, group, body_side
exercises         : id, name_fr, slug, equipment_type, muscle_group, mechanics, force_type,
                    laterality, source, external_id, is_verified, created_by, created_at
                    ⚠️ 113 exercices manuels — Wger abandonné — NE PAS relancer import-exercises.ts
exercise_muscles  : exercise_id, muscle_id, role(primary|secondary|stabilizer), activation_pct, source, confidence
workouts          : id, user_id, gym_id, title, started_at, ended_at, duration_sec, total_volume_kg,
                    is_public(DEFAULT false), note, lat, lng, avg_rest_seconds, photo_url, location_city
workout_exercises : id, workout_id, exercise_id, order_index, note
workout_sets      : id, workout_exercise_id, set_type(warmup|working|dropset|failure), set_number,
                    reps, weight_kg, rest_seconds, rpe, is_pr, pr_charge, pr_serie, pr_1rm,
                    pr_level(text NULL — 'gold'|'silver'|'bronze'), parent_set_id, is_continuation, logged_at
likes             : user_id, workout_id, created_at
comments          : id, workout_id, user_id, content, created_at
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

## Structure fichiers (état S12 — validé par scan)
```
app/
├── _layout.tsx              — guard auth + WorkoutProvider + ThemeProvider + StatusBar
├── index.tsx                — splash animé → redirect /auth/login
├── auth/
│   ├── _layout.tsx
│   ├── login.tsx            — connexion email/password
│   └── register.tsx         — prénom, username, email, password
├── (tabs)/
│   ├── _layout.tsx          — navbar 5 tabs (Users/Dumbbell/CirclePlus/CalendarDays/CircleUser)
│   ├── feed.tsx             — timeline sociale (likes + commentaires + photo_url)
│   ├── history.tsx          — liste séances par mois (SectionList antichronologique)
│   ├── library.tsx          — 113 exercices, SectionList par muscle,
│   │                          filtres chips équipement + type, badges Poly/gris
│   ├── profile.tsx          — stats mois, PRs top 20, déconnexion
│   └── start.tsx            — placeholder FAB → redirect /workout/session
├── workout/
│   ├── _layout.tsx
│   ├── session.tsx          — log séance, ScrollPicker custom par équipement,
│   │                          confirmation modale avant lancement
│   ├── timer.tsx            — roue custom TimerWheelColumn,
│   │                          auto-start, presets 45s/60s/90s/120s, fix AppState
│   └── summary.tsx          — résumé + nom intelligent auto + bloc PRs battus
│                              + toggle is_public + photo (ImagePicker) + géoloc
│                              + save Supabase (pr_level, rest_seconds inclus)
├── history/
│   ├── _layout.tsx
│   └── [id].tsx             — détail séance + photo_url + barres muscles travaillés
├── exercise/
│   ├── _layout.tsx
│   └── [id].tsx             — fiche exercice + barres musculaires (primary/secondary/stabilizer)
├── analytics.tsx            — stats complètes : résumé, volume/semaine (bar chart custom),
│                              vue musculaire, régularité + mini-calendrier 28j,
│                              progression des charges, top 5 exercices,
│                              déséquilibres Push/Pull/Haut/Bas, compteurs PRs + podium
│                              ⚠️ PAS Victory Native — charts dessinés avec View RN
├── prs.tsx                  — Armurerie des PRs : podium Or/Argent/Bronze par exercice
├── edit-profile.tsx         — modifier username + full_name
└── settings.tsx             — kg/lbs, dark/light, vibration, timer défaut,
                               visibilité séances, modifier profil, supprimer compte
context/
├── WorkoutContext.tsx        — status(idle|active|done), startedAt, exercises,
│                              currentIndex, elapsedSeconds
│                              PR types : pr_charge, pr_serie, pr_1rm (booleans)
│                              pr_level : 'gold'|'silver'|'bronze'|null (top-3 poids historiques)
│                              rest_seconds : delta ms depuis dernier set validé (global workout)
│                              Epley 1RM : w × (1 + r/30)
└── ThemeContext.tsx          — dark/light + persistance AsyncStorage
lib/supabase.ts              — client Supabase (SecureStore fragmenté chunks 1800b, autoRefreshToken)
constants/theme.ts           — dark/light objets + ThemeName + ThemeColors types
constants/Colors.ts          — VIDE (ne pas utiliser)
types/index.ts               — VIDE (types définis inline dans chaque fichier)
components/                  — VIDE (pas de composants partagés)
scripts/import-exercises.ts  — ⚠️ NE PAS RELANCER — remplacé par orava_exercises_bdd.sql (S10)
```

## Système PR (implémenté S11/S12)
| Type | Définition | Icône | Couleur |
|---|---|---|---|
| PR Charge (`pr_charge`) | Poids max toutes reps | Zap | #FFD700 Or |
| PR Série (`pr_serie`) | Max (poids × reps) sur 1 set | Flame | #D85A30 Orange |
| PR 1RM estimé (`pr_1rm`) | Epley : w × (1 + r/30) | Trophy | #FAC775 Ambre |
| Podium (`pr_level`) | Top-3 poids historiques → gold/silver/bronze | 🥇🥈🥉 | Or/Argent/Bronze |

`prs.tsx` = Armurerie : 1 card par exercice, 3 médailles avec poids × reps + date.

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
| S11 | Fix picker poids, timer réécrit, photos feed/détail, muscles détail | ✅ |
| S12 | Migration pr_level/rest_seconds, PRs podium, analytics complet, nom séance auto, photos summary | ✅ |
| S13 | À définir | 🔄 À venir |

## Priorités S13
- Swipe modifier/supprimer série (non implémenté — le code existe mais buggué)
- Photo de profil (bucket Supabase `profiles` + avatar_url)
- Library — filtre groupe musculaire en plus des filtres équipement
- Settings — timer par défaut (lire/écrire depuis AsyncStorage dans timer.tsx)
- Géolocalisation auto (location_city) — déjà dans summary.tsx, vérifier le save Supabase
- "Comment ça marche" — onglet ou modale onboarding
- Follows — améliorer UX recherche utilisateurs / suggestions
- Changer la roue car elle ne fonctionne pas
- On ne voit pas les photos des seances dans le feed
- Calculer proprement le mapping musculaire des séances
- Détailler ce qu'il y a dans les analytics
- Bug dans l'affichage des catégories de la bibliothèque
- Recherche non exhaustive pour les exos

## Règles impératives
- Poids toujours en kg en base — conversion kg/lbs à l'affichage uniquement
- `duration_sec` (integer) — confirmé ✅, jamais `duration_seconds`
- `is_public` DEFAULT false — toggle dans summary.tsx
- Aucune donnée persistée avant save dans summary.tsx — tout vit dans WorkoutContext
- Trigger `on_auth_user_created` crée public.users automatiquement
- Ne jamais relancer `scripts/import-exercises.ts` ni `orava_exercises_bdd.sql`
- Commits : `feat/fix/chore: description courte`
- Interface en français — anglicismes conservés : Sets, Reps, PR, Timer, Streak
- Charts : PAS Victory Native — utiliser View RN + StyleSheet (pattern déjà en place dans analytics.tsx)
- Pas de dossier `components/` ni `hooks/` — UI inline dans les screens, state via Context
