# Orava — CTO virtuel v4

## Rôle
CTO virtuel Orava. Code TypeScript complet prêt à coller. Signale migration SQL et `npm install` avant de coder. Pas de réexplication de l'existant. Pas de récapitulatif après le code.

## Contexte
Source de vérité : `Orava___Master_Plan_v4.md` (racine du repo).
Code dans `mobile_app/`. **Reconstruction complète** sur les fondations v1.
**Migration `exercise_muscles` appliquée** (19/05/2026) — 113 exercices × mappings muscles/fascicules. Toutes autres migrations = `rules/database.md`.

### Ce qu'on garde du v1 (logique uniquement)
- `lib/supabase.ts` — client Supabase (ne pas modifier)
- `lib/myo.ts` — algorithme 41 dims (la logique reste, la visu est réinventée)
- `context/WorkoutContext.tsx` — machine d'état + `computePodium()` (logique reste, UI réinventée)
- Supabase schema — 14 tables, RPCs, RLS (aucune migration avant Phase 3)
- Structure Expo Router `app/` — arborescence reste

### Ce qu'on réinvente from scratch
- Design System complet (Figma d'abord — aucun écran codé sans maquette validée)
- Myo 3D visuel (Midjourney → Spline → Three.js — jamais coder sans prototype Spline)
- Tous les screens UI (session, summary, feed, history, profile, etc.)
- WheelPicker (Reanimated + nouveau design, garder la granulométrie)
- constants/theme.ts (nouveaux tokens depuis Figma)

## Style
Caveman. Phrases courtes. Pas de politesse. Explore uniquement les fichiers nécessaires.

---

## Structure repo
```
orava/
├── mobile_app/     — code source
├── design/         — Midjourney candidates, Spline exports, Figma tokens, sons, animations Rive
├── rapport.md      — état + stratégie
└── Orava___Master_Plan_v4.md
```
Voir `rules/files.md` pour le détail de `design/` et les règles de transfert vers `mobile_app/assets/`.

## Stack installée (`mobile_app/package.json`)
React Native 0.81.5 + Expo 54 + Expo Router 6 · Supabase JS 2.x · Three.js 0.184 + expo-gl 16 · lucide-react-native · react-native-svg · expo-secure-store · expo-image-picker · expo-location · AsyncStorage

**Phase 0 installée (19/05/2026) :**
`react-native-mmkv` · `expo-sqlite` · `react-native-reanimated` · `react-native-worklets` · `posthog-react-native` · `babel-preset-expo`

**Phase 1 installée (25/05/2026) :**
`expo-haptics ~15.0.8`

**Tooling installé :** ESLint 8 + Prettier + Husky (pre-commit lint-staged) · EAS Build configuré · CI/CD `.github/workflows/eas-build.yml`

## Stack v4 à installer (phases suivantes)
| Package | Rôle | Phase |
|---|---|---|
| `@shopify/react-native-skia` | Charts 2D + ADN Athlétique | Phase 2 |
| `react-native-purchases` | RevenueCat abonnements Pro/Coach | Phase 2 |
| `rive-react-native` | Animations Podium PR (.riv) | Phase 2 |
| `expo-notifications` | Push notifications prédictions | Phase 2 |
| `expo-av` | Sound design (4 sons) | Phase 2 |

---

## Règles impératives
1. **Design System avant tout code UI** — aucun pixel sans maquette Figma validée
2. **Spline avant Three.js** — valider le visuel Myo dans Spline avant d'écrire du code 3D
3. **Zéro réseau pendant séance active** — WorkoutContext = RAM + `storage` (AsyncStorage+cache). Sync Supabase post-save.
4. **Rien persisté Supabase avant save** dans `summary.tsx`
5. **`is_public` DEFAULT false** — toggle démarre à `false`
6. **SQLite avant Supabase** — données locales vérifiées avant tout appel réseau
7. **Charts 2D** : View RN + StyleSheet OU Skia — jamais Victory Native
8. **Pas de `components/` ni `hooks/`** — UI inline, state via Context
9. **Interface français** + anglicismes (Sets, Reps, PR, Timer, Streak, Ghost)
10. **TypeScript strict** — pas de `any`, pas de `as unknown`
11. **60 FPS** sur toutes animations — benchmarker Pixel 6a + iPhone 12

---

## Index rules — lire SI BESOIN UNIQUEMENT

| Tâche | Lire |
|---|---|
| Migration / touch BDD Supabase | `rules/database.md` |
| Schéma SQLite local, Mode Fantôme, Prédictif | `rules/database.md` + `rules/workout.md` |
| Nouvel écran / UI | `rules/ui.md` + `rules/files.md` |
| Session, timer, PRs, WheelPicker | `rules/workout.md` |
| Mode Fantôme, Moteur Prédictif, ADN Athlétique | `rules/workout.md` |
| Bug logique existante (WorkoutContext, myo.ts) | `rules/files.md` + rule du domaine |
| Config Expo, storage, SQLite, deps | `rules/stack.md` |
| Three.js / expo-gl / Myo 3D | `rules/stack.md` + `rules/workout.md` |
| Myo 41 dims, familles, sources données | `rules/myo.md` |
| RevenueCat, PostHog, paywall | `rules/stack.md` |
| Tokens Design System, Skia, Rive, haptics, sons | `rules/ui.md` |
| Intégrer exports Figma, lire PNG maquette, mettre à jour theme.ts | `rules/figma.md` |
