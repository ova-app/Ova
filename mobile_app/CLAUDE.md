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
                    is_public(DEFAULT false), note, lat, lng, avg_rest_seconds, photo_url, location_city,
                    pr_seance(text NULL — 'gold'|'silver'|'bronze')
workout_exercises : id, workout_id, exercise_id, order_index, note,
                    pr_exercice(text NULL — 'gold'|'silver'|'bronze')
workout_sets      : id, workout_exercise_id, set_type(warmup|working|dropset|failure), set_number,
                    reps, weight_kg, rest_seconds, rpe, is_pr,
                    pr_charge(text NULL — 'gold'|'silver'|'bronze'),
                    pr_serie(text NULL — 'gold'|'silver'|'bronze'),
                    parent_set_id, is_continuation, logged_at
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

## Structure fichiers (état S14 — validé par scan)
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
│   │                          icônes PR : Zap(charge) Flame(série) Trophy(pr_seance)
│   ├── history.tsx          — liste séances par mois (SectionList antichronologique)
│   │                          icônes PR : Zap(charge) Flame(série) Trophy(pr_seance)
│   ├── library.tsx          — 113 exercices, SectionList par muscle,
│   │                          filtres chips équipement + type, badges Poly/gris
│   │                          chips en View flexWrap:'wrap' (pas ScrollView horizontal)
│   │                          recherche insensible aux accents via normalize() (NFD)
│   │                          en-têtes sections : backgroundSecondary + borderLeft accent + textPrimary
│   ├── profile.tsx          — stats mois, PRs top 20, déconnexion
│   └── start.tsx            — placeholder FAB → redirect /workout/session
├── workout/
│   ├── _layout.tsx
│   ├── session.tsx          — log séance, WheelPicker (poids + reps) par équipement,
│   │                          flash PR avec niveau 🥇🥈🥉 pour charge et série
│   ├── timer.tsx            — roue custom TimerWheelColumn (ScrollView),
│   │                          auto-start, presets 45s/60s/90s/120s/3min, fix AppState
│   └── summary.tsx          — résumé + nom intelligent auto + bloc PRs battus (4 types)
│                              + toggle is_public + photo (ImagePicker) + géoloc
│                              + save Supabase (pr_charge/pr_serie/pr_exercice/pr_seance)
│                              pr_exercice calculé par exercice, pr_seance chargé async
├── history/
│   ├── _layout.tsx
│   └── [id].tsx             — détail séance + photo_url + barres muscles travaillés
│                              badges Zap+Flame par set avec niveau podium
├── exercise/
│   ├── _layout.tsx
│   └── [id].tsx             — fiche exercice + barres musculaires (primary/secondary/stabilizer)
├── analytics.tsx            — stats complètes : résumé, volume/semaine (bar chart custom),
│                              vue musculaire, régularité + mini-calendrier 28j,
│                              progression des charges, top 5 exercices,
│                              déséquilibres Push/Pull/Haut/Bas,
│                              PRs par type (charge/série/exercice/séance) avec 🥇🥈🥉
│                              ⚠️ PAS Victory Native — charts dessinés avec View RN
├── prs.tsx                  — Armurerie des PRs : podium Or/Argent/Bronze par exercice
│                              basé sur pr_charge (poids), 1 card par exercice
├── edit-profile.tsx         — modifier username + full_name
└── settings.tsx             — kg/lbs, dark/light, vibration, timer défaut,
                               visibilité séances, modifier profil, supprimer compte,
                               "Comment ça marche" avec 4 types PR + analytics détaillés
context/
├── WorkoutContext.tsx        — status(idle|active|done), startedAt, exercises,
│                              currentIndex, elapsedSeconds
│                              PR : pr_charge/pr_serie = PrLevel (text null|gold|silver|bronze)
│                              3 top-3 chargés par addExercise : charge, serie, exercice
│                              computePodium() exporté et utilisé dans summary.tsx
│                              rest_seconds : delta ms depuis dernier set validé (global workout)
└── ThemeContext.tsx          — dark/light + persistance AsyncStorage
lib/supabase.ts              — client Supabase (SecureStore fragmenté chunks 1800b, autoRefreshToken)
constants/theme.ts           — dark/light objets + ThemeName + ThemeColors types
constants/Colors.ts          — VIDE (ne pas utiliser)
types/index.ts               — VIDE (types définis inline dans chaque fichier)
components/                  — VIDE (pas de composants partagés)
scripts/import-exercises.ts  — ⚠️ NE PAS RELANCER — remplacé par orava_exercises_bdd.sql (S10)
```

## Système PR (redesigné S14)

4 types, chacun avec podium Or/Argent/Bronze (`'gold'|'silver'|'bronze'|null`) :

| Type | Échelle | Définition | Stockage | Icône |
|---|---|---|---|---|
| PR Charge (`pr_charge`) | Set | Poids le plus lourd, toutes séances | `workout_sets` | Zap #FAC775 |
| PR Série (`pr_serie`) | Set | Max(poids × reps) sur 1 set, toutes séances | `workout_sets` | Flame #D85A30 |
| PR Exercice (`pr_exercice`) | Exercice/séance | Volume total exercice dans la séance vs historique | `workout_exercises` | Flame #9B59B6 |
| PR Séance (`pr_seance`) | Séance | Volume total séance vs historique | `workouts` | Trophy #FAC775 |

**Podium** : gold = nouveau record absolu, silver = 2e meilleur, bronze = 3e meilleur.  
Calculé via `computePodium(value, top3)` exporté depuis `WorkoutContext.tsx`.

**Chargement dans `addExercise`** : 3 top-3 historiques chargés depuis Supabase :
- `pr_top3_charge` — top-3 poids distincts
- `pr_top3_serie` — top-3 valeurs (poids × reps) distinctes
- `pr_top3_exercice` — top-3 volumes d'exercice par séance (groupés par workout_id en JS)

**Calcul au save** (dans `summary.tsx`) :
- `pr_exercice` : `computePodium(Σ poids×reps des sets, ex.pr_top3_exercice)` → sauvé dans `workout_exercises`
- `pr_seance` : `computePodium(volume total séance, seanceTop3)` → top-3 chargé depuis `workouts.total_volume_kg`, sauvé dans `workouts`

**Armurerie (`prs.tsx`)** : affiche le podium de charge (pr_charge) par exercice.

`is_pr` (boolean sur workout_sets) = `pr_charge IS NOT NULL OR pr_serie IS NOT NULL`

## Picker poids — granulométrie (S10)
| Équipement | Pas | Plage |
|---|---|---|
| Haltères | 2 kg | 2 → 60 kg |
| Poulie / Machine | 2,5 kg | 2,5 → 200 kg |
| Barre | 20kg + disques ×2 | 20 → ~220 kg |
| Poids du corps | Reps only | — |
| Kettlebell | 4 kg | 4 → 48 kg |

## WheelPicker — pattern (S13)
Composant `WheelPicker` unifié dans `session.tsx`, `TimerWheelColumn` dans `timer.tsx`.
Règles impératives pour ne pas recasser la roue :
- `readValue(y)` lit la valeur uniquement — **ne jamais appeler `scrollTo` après un scroll utilisateur**
- `snapToInterval={ITEM_HEIGHT}` gère le positionnement nativement (pas besoin de JS)
- Pattern `hasMomentum` ref : `onScrollEndDrag` ne snap que si pas de momentum, `onMomentumScrollEnd` prend le relais
- `weightValues` memoïsé avec `useMemo([equipment_type])` — évite de déclencher le `useEffect` à chaque re-render
- `REPS_VALUES` = 1..50 (constante module, jamais recréée)
- `useEffect([values])` : scroll programmatique uniquement au changement d'exercice/équipement, pas après interaction utilisateur
- Timer : flag `isUserScroll` empêche le `useEffect([selected])` de rescroller après que l'utilisateur a scrollé (mais laisse les presets rescroller normalement)

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
| S13 | Réécriture WheelPicker (poids + reps + timer) — fix freeze et tremblement | ✅ |
| S14 | Redesign système PR : 4 types (charge/série/exercice/séance) × podium 3 niveaux, "Comment ça marche" enrichi | ✅ |
| S15 | Fix filtres bibliothèque : View flexWrap wrap à la place de ScrollView horizontal (chips coupées) | ✅ |
| S16 | Bibliothèque — recherche insensible aux accents (normalize NFD) + en-têtes sections plus visibles (fond backgroundSecondary + trait accent + textPrimary) | ✅ |
| S17 | Session — picker exercice aligné sur bibliothèque : chargement one-shot au montage, filtrage local JS, insensible aux accents (normalize NFD), chips groupe musculaire (flexWrap wrap) | ✅ |

## Priorités
- Swipe modifier/supprimer série (non implémenté — le code existe mais buggué)
- Photo de profil (bucket Supabase `profiles` + avatar_url)
- Library — filtre groupe musculaire en plus des filtres équipement
- On ne voit pas les photos des séances dans le feed
- Calculer proprement le mapping musculaire des séances
- Faire une simple déclinaison de couleurs pour le podium, pas de d'addition de deux icones
  

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
