# rules/files.md

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
│   ├── timer.tsx            — TimerWheelColumn custom, auto-start, presets, fix AppState
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
├── db.ts                    — [À CRÉER Phase 0] SQLite local (Fantôme + Prédictif)
└── storage.ts               — [À CRÉER Phase 0] MMKV instance

constants/theme.ts           — source couleurs dark/light
constants/Colors.ts          — VIDE — ne pas utiliser
types/index.ts               — VIDE — types inline dans chaque fichier
components/                  — VIDE — ne pas peupler
```

## Fichiers à créer (v4)

| Fichier | Phase | Description |
|---|---|---|
| `lib/db.ts` | Phase 0 | Init SQLite, helpers `insertLocalSet()`, `insertLocalSession()` |
| `lib/storage.ts` | Phase 0 | Instance MMKV unique exportée |
| `lib/analytics.ts` | Phase 0 | Instance PostHog exportée |
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

## Bug fix — incohérences v1 à corriger

| Fichier | Problème | Fix |
|---|---|---|
| `app/workout/summary.tsx` | `isPublic` initialisé à `true` | Passer à `false` |
| `package.json` | `@react-three/fiber` installé, non utilisé pour Myo | Garder (pas de risque) |
| `app/auth/login.tsx` | Couleurs hardcodées, pas `useTheme()` | Corriger au passage |
