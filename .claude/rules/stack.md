# rules/stack.md

## Stack installée
- React Native 0.81.5 + Expo 54 (TypeScript strict) + Expo Router 6 (`mobile_app/app/`)
- Supabase : PostgreSQL + Auth + RLS (projet ORAVA, région Frankfurt eu-central-1)
- Auth storage : expo-secure-store — adaptateur custom chunks 1800 bytes (JWT > 2048b)
- Icônes : Lucide React Native
- 3D Myo : `three` 0.184 + `@types/three` + `expo-gl` 16 (installés via `--legacy-peer-deps`)
- Git : `main` stable · `dev` travail · `feat/xxx` par feature

## Tests (installé 24/05/2026)
- `jest@29.7` + `jest-expo@56` + `@types/jest` (avec `--legacy-peer-deps`)
- Config dans `mobile_app/package.json` section `"jest"` (preset `jest-expo`)
- Scripts : `npm test` · `npm run test:watch` · `npm run test:coverage`
- Dossier : `mobile_app/__tests__/` — 120 tests, tous verts
- Règle : tests logique pure uniquement — pas de render, pas de @testing-library
- Mocks : Supabase, AsyncStorage, MMKV, SQLite toujours mockés dans les tests

## Stack v4 à installer avant de coder les features associées
Toujours lancer avec `--legacy-peer-deps` dans `mobile_app/`.

```bash
# Phase 0 — fondations
npx expo install react-native-mmkv expo-sqlite
npx expo install react-native-reanimated posthog-react-native --legacy-peer-deps

# Phase 1
npx expo install expo-haptics

# Phase 2
npx expo install @shopify/react-native-skia react-native-purchases --legacy-peer-deps
npx expo install rive-react-native expo-notifications expo-av --legacy-peer-deps
```

---

## Config Supabase
- `mobile_app/lib/supabase.ts` : client (SecureStore fragmenté 1800b, autoRefreshToken true)
- Trigger `on_auth_user_created` → crée `public.users` automatiquement
- **Aucune migration effectuée** — tout changement DB = signaler avant de coder

## Storage — config réelle (Phase 0)
`react-native-mmkv` est installé mais **non utilisé** — `lib/storage.ts` implémente un cache mémoire (`Map`) + AsyncStorage comme backend de persistance, avec une API compatible MMKV (`set`, `getString`, `getNumber`, `delete`).
La fonction `hydrateStorage()` doit être appelée au démarrage de l'app pour recharger le cache depuis AsyncStorage.
WorkoutContext utilise `storage` pour snapshot temps réel de la séance en cours.
Pattern : sérialiser l'état en JSON, clé `workout_session_draft`.
Réhydrater au mount si `status !== 'idle'` dans le store.

⚠️ Ne pas remplacer par `new MMKV({id})` sans valider la configuration native EAS Build.

## SQLite — schéma local (Phase 0)
Fichier : `mobile_app/lib/db.ts`
```sql
-- Sessions locales (source Fantôme + Prédictif)
CREATE TABLE IF NOT EXISTS local_sets (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  volume REAL,  -- weight_kg * reps
  session_id TEXT NOT NULL,
  logged_at INTEGER NOT NULL  -- UNIX timestamp ms
);

CREATE TABLE IF NOT EXISTS local_sessions (
  id TEXT NOT NULL,           -- = workout_id Supabase (synchronisé post-save)
  total_volume_kg REAL,
  logged_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sets_exercise ON local_sets(exercise_id, logged_at DESC);
```
Règle : insérer dans SQLite EN MÊME TEMPS que le save Supabase dans summary.tsx.

## Reanimated — règles
- Installer : `npx expo install react-native-reanimated` puis ajouter plugin dans `babel.config.js`
- Worklets : toute fonction appelée dans un worklet doit être décorée `'worklet'`
- Jamais d'API obsolète (ex: `Value`, `timing`) — utiliser `useSharedValue` + `withSpring`/`withTiming`
- Si incertain sur une API : demander la doc — ne pas inventer

## PostHog — config (Phase 0)
```typescript
// mobile_app/lib/analytics.ts
import PostHog from 'posthog-react-native'
export const posthog = new PostHog('POSTHOG_KEY', { host: 'https://eu.posthog.com' })
```
20 événements taxonomie définis à créer avec le Plan v4 §8.

## RevenueCat — config (Phase 2)
- `react-native-purchases` via EAS Build (native module)
- Produits : `orava_pro_monthly`, `orava_pro_yearly`, `orava_coach_monthly`
- Feature flag PostHog contrôle le timing paywall (après 1re vs 3e séance)

## expo-gl + Three.js — règles critiques
- `onContextCreate` doit être **synchrone** — expo-gl ignore toute Promise (async → black screen)
- Canvas proxy : NE PAS inclure `getContext` — passer uniquement `{ width, height, style:{}, clientWidth, clientHeight, addEventListener:()=>{}, removeEventListener:()=>{} }`
- Matériaux : **MeshPhongMaterial** uniquement — `MeshPhysicalMaterial` requiert WebGL2, non dispo dans expo-gl (GLES2/WebGL1) → black screen
- Appeler `gl.endFrameEXP()` après chaque `renderer.render(scene, camera)`
- `renderer.setSize(W, H, false)` + `setPixelRatio(1)` — ne pas laisser Three.js resize le canvas
- Dynamic imports (`three/examples/jsm/`) : **incompatibles** avec Metro — ne pas utiliser
- `@react-three/fiber` installé mais non utilisé pour Myo — Three.js raw + expo-gl uniquement
