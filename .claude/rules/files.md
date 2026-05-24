# rules/files.md

## Structure du repo
```
orava/
├── mobile_app/          — tout le code (voir ci-dessous)
├── design/              — assets design AVANT intégration dans le code
│   ├── myo/
│   │   ├── prompts.md           — prompts Midjourney + direction retenue
│   │   ├── candidates/          — 3 images candidates retenues (JPG/PNG)
│   │   └── spline-export/       — code Three.js exporté depuis Spline
│   ├── system/
│   │   ├── figma.md             — lien Figma + tokens validés (copie offline)
│   │   └── inspirations.md      — refs Whoop/Linear/TeamLab + notes
│   ├── sounds/                  — fichiers WAV bruts ElevenLabs (→ assets/sounds/)
│   └── animations/              — fichiers .riv Rive (→ assets/animations/)
├── rapport.md           — état du projet + stratégie
└── Orava___Master_Plan_v4.md    — source de vérité produit
```

## Règle design/ → mobile_app/assets/
- Sons WAV/MP3 : `design/sounds/` → convertir → `mobile_app/assets/sounds/`
- Animations : `design/animations/*.riv` → `mobile_app/assets/animations/`
- Images Myo candidates : `design/myo/candidates/` — référence uniquement, pas dans assets/

## Racine du code
Tout le code est dans `mobile_app/`. Les chemins ci-dessous sont relatifs à `mobile_app/`.

## Structure actuelle (v1 opérationnel)

```
app/
├── _layout.tsx              — guard auth + WorkoutProvider + ThemeProvider + StatusBar
├── index.tsx                — splash animé → redirect /auth/login
├── auth/                    — login.tsx · register.tsx
├── (tabs)/
│   ├── _layout.tsx          — tabs + FAB central → /workout/session
│   ├── feed.tsx             — timeline sociale (likes + commentaires + photo_url + Myo fractal SVG)
│   ├── history.tsx          — SectionList antichronologique par mois
│   ├── library.tsx          — 113+ exos, SectionList par muscle, filtres chips, normalize NFD
│   ├── profile.tsx          — stats mois, PRs top 20, déconnexion
│   └── start.tsx            — placeholder FAB → /workout/session
├── workout/
│   ├── session.tsx          — log séance, WheelPicker, flash PR 🥇🥈🥉, swipe delete
│   ├── timer.tsx            — anneau SVG Figma (arc jaune SVG), -15/skip/+15, auto-start, AppState
│   ├── summary.tsx          — résumé + nom auto + PRs + is_public + photo + géoloc + save Supabase
│   │                          + computeAndSaveMetrics() → workout_metrics (best-effort)
│   └── myo-orb.tsx          — Myo 3D : Three.js + expo-gl, IcosahedronGeometry, MeshPhongMaterial
├── history/[id].tsx         — détail séance + photo_url + barres muscles + badges PR
├── exercise/[id].tsx        — fiche exercice + barres musculaires (primary/secondary/stabilizer)
├── analytics.tsx            — stats complètes, charts View RN (PAS Victory Native)
├── prs.tsx                  — Armurerie : podium Or/Argent/Bronze par exercice
├── edit-profile.tsx         — username + full_name + date_naissance + poids → body_metrics
└── settings.tsx             — kg/lbs, dark/light, vibration, timer défaut, visibilité séances

context/
├── WorkoutContext.tsx       — machine d'état séance + détection PR temps réel
└── ThemeContext.tsx         — dark/light, persistance AsyncStorage

lib/
├── supabase.ts              — client Supabase (SecureStore chunks 1800b)
├── myo.ts                   — calcul signature Myo 41 dims, saveMyoSignature()
├── db.ts                    — SQLite local : initDB(), insertLocalSet(), insertLocalSession()
├── storage.ts               — MMKV instance unique (id: 'orava-workout')
├── analytics.ts             — PostHog EU + Events const (22 événements taxonomie)
└── utils.ts                 — formatVolume(n) → "12 450" (espace milliers)

constants/theme.ts           — source couleurs dark/light
constants/Colors.ts          — VIDE — ne pas utiliser
types/index.ts               — VIDE — types inline dans chaque fichier
components/                  — VIDE — ne pas peupler

__tests__/                   — tests unitaires Jest (logique pure uniquement, pas d'UI)
├── computePodium.test.ts    — 16 tests computePodium gold/silver/bronze/null
├── theme.test.ts            — 28 tests tokens dark/light/spacing/radius/typo
├── formatVolume.test.ts     — 16 tests formatage milliers
├── workoutState.test.ts     — 10 tests fonctions pures WorkoutContext
├── supabase.test.ts         — 11 tests avec mock Supabase
└── myoDims.test.ts          — 39 tests FASCICLE_DIM, MUSCLE_DIM, computeMuscleDims
```

## Fichiers à créer (v4)

| Fichier | Phase | Description |
|---|---|---|
| `app/workout/ghost.ts` | Phase 1 | `getGhostReference(exerciseId, limitDays)` → SQLite |
| `lib/predictor.ts` | Phase 2 | Régression linéaire pondérée on-device → SQLite |
| `app/onboarding/` | Phase 1 | 2 écrans max, < 60s à la 1re série |
| `app/paywall.tsx` | Phase 2 | Paywall Pro — RevenueCat, A/B PostHog |
| `app/athletic-dna.tsx` | Phase 3 | ADN Athlétique — Skia, 6 dimensions |

## Règles de structure
- Jamais créer de dossier hors spec sans validation
- Nommage fichiers : kebab-case.tsx
- Types : inline dans le fichier qui les utilise — jamais dans types/index.ts
- `components/` reste vide — UI inline dans les screens

## Bug fix — historique corrections

| Fichier | Problème | Statut |
|---|---|---|
| `app/workout/summary.tsx` | `isPublic` initialisé à `true` | ✅ Corrigé (24/05/2026) |
| `app/auth/login.tsx` | Couleurs hardcodées, pas `useTheme()` | ✅ Corrigé (24/05/2026) |
| `package.json` | `@react-three/fiber` installé, non utilisé pour Myo | Garder (pas de risque) |
| Supabase JOIN casts | `as { }` sans type guard → TS2352 dans profile, history/[id], exercise/[id], prs | ✅ Corrigé (24/05/2026) |

## Comportement documenté — computePodium
`computePodium(value, top3)` utilise des comparaisons strictes `>`. Égaler `pr1` ne donne pas gold mais silver (si pr2 existe). Comportement voulu à confirmer avec le produit.
