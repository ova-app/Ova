# Rapport — Orava v1 → v4 : État, Tri, Stratégie

---

## 1. Situation actuelle

### Ce qui existe dans le repo v1

| Module | Type | État |
|---|---|---|
| Supabase schema (14 tables + RPCs) | Infrastructure | ✅ Solide — aucune migration à faire |
| lib/supabase.ts | Infrastructure | ✅ Garder tel quel |
| lib/myo.ts — algorithme 41 dims | Logique métier | ✅ Garder la **logique** — la visu est réinventée |
| WorkoutContext — machine d'état + PR | Logique métier | ✅ Garder la **logique** — UI réinventée |
| context/ThemeContext.tsx | Architecture | ✅ Garder la structure — nouveaux tokens |
| Expo Router structure (`app/`) | Architecture | ✅ Garder |
| Auth flow (Supabase Auth) | Infrastructure | ✅ Garder — ajouter Apple + Google |
| Tous les écrans UI | Interface | ❌ Réinventer sur nouveau Design System |
| Myo 3D visuel (orb.tsx) | Interface 3D | ❌ Réinventer — nouvelle direction Midjourney → Spline |
| WheelPicker implémentation | UI component | ❌ Réinventer avec Reanimated + nouveau design |
| feed, history, session, summary UI | Interface | ❌ Réinventer sur nouveau Design System |
| constants/theme.ts (couleurs v1) | Design | ❌ Remplacer par tokens Design System Figma |

**Bilan :** on repart des fondations, pas du v1. Le code v1 est une **référence de logique**, pas une base à préserver.

---

## 2. Ce qu'on garde — les fondations invisibles

### Garder sans toucher
- **Supabase schema** — 14 tables, RPCs, RLS. Solide, aucune migration nécessaire avant Phase 3.
- **lib/supabase.ts** — client + SecureStore chunks 1800b. Parfait.
- **lib/myo.ts** — les 41 dimensions, le z-score, la baseline, le hash, `saveMyoSignature()`. L'algorithme reste. Seule la visualisation change.
- **WorkoutContext logique** — machine d'état (idle→active→done), `computePodium()`, détection PR 4D, chargement top-3. Tout ça est correct et réutilisable.
- **Expo Router structure** — `app/` avec tabs, workout stack, auth. L'arborescence reste.

### Garder en adaptant
- **ThemeContext** — structure ok, tokens couleurs remplacés par ceux du Design System Figma.
- **Auth flow** — email/password reste, ajouter Apple Sign In + Google OAuth (obligatoire App Store).

---

## 3. Ce qu'on réinvente from scratch

### Design System — à faire AVANT tout code UI
Aucun écran ne se code avant que le Design System Figma soit validé.
- Palette couleurs (dark/light) — s'inspirer de Whoop pour la hiérarchie
- Typographie (2 familles, 4 tailles)
- Border-radius, spacing grid, tokens composants
- Utiliser **Figma Make** pour un premier jet des 5 écrans principaux
- Nommer les composants Figma identiquement au code

### Myo 3D visuel — direction Midjourney → Spline → Three.js
La logique (`lib/myo.ts`) est préservée. Le rendu visuel repart de zéro.
1. **Midjourney** : 30–50 variations de la forme, trouver la direction céramique
2. **Spline** : prototype 3D en 2–4h, valider matériaux + éclairages AVANT d'écrire du Three.js
3. **Three.js + expo-gl** : adapter le code Spline exporté (voir `rules/stack.md`)
4. Règle : 5 variables visuellement parfaites AVANT d'ajouter les 36 suivantes

### Tous les écrans — UI from zero sur le Design System
session.tsx, summary.tsx, feed.tsx, history, profile, library, prs, analytics, settings, edit-profile, timer.
La logique métier du v1 est une référence à lire avant de recoder. L'UI est une page blanche.

### WheelPicker — Reanimated + nouveau design
La granulométrie (haltères 2kg, barre 20kg + disques, etc.) est correcte → garder.
L'implémentation ScrollView native → recoder en **Reanimated** 60 FPS + nouveau design.
GhostBar intégrée dès la v1 du nouveau picker.

---

## 4. Ce qu'on ne fait pas

- Garder le moindre pixel du v1 pour "gagner du temps" — le Design System prime sur tout
- Coder un écran avant que son maquette Figma soit validée
- Coder le Myo 3D sans avoir prototypé dans Spline d'abord
- Installer Victory Native
- Peupler `components/` ou `hooks/`

---

## 5. Stratégie d'attaque — ordre strict

### Phase 0 — Fondations (2 semaines) — AUCUN CODE UI

**Semaine 1 — Design et direction visuelle**
- [ ] Midjourney : direction Myo 3D (30–50 variations, 3 candidats)
- [ ] Figma : Design System (palette, typo, tokens, composants)
- [ ] Figma Make : 5 écrans principaux en premier jet IA → ajuster
- [ ] Spline : prototype Myo 3D (matériaux + éclairages)

**Semaine 2 — Infrastructure technique**
- [ ] `npx expo install react-native-mmkv expo-sqlite`
- [ ] `npx expo install react-native-reanimated posthog-react-native --legacy-peer-deps`
- [ ] Créer `lib/storage.ts` (MMKV), `lib/db.ts` (SQLite schema), `lib/analytics.ts` (PostHog)
- [ ] Snapshot MMKV dans WorkoutContext (crash-safe)
- [ ] Apple Sign In + Google OAuth dans Supabase Auth
- [ ] CI/CD GitHub Actions → EAS Build
- [ ] PostHog : taxonomie 20 événements

**Critère de sortie Phase 0 :** Design System figma validé + stack locale installée + CI/CD vert.

---

### Phase 1 — MVP Core + Mode Fantôme (7–9 semaines)

Recoder tous les écrans core sur le nouveau Design System.

**Ordre :**
1. `constants/theme.ts` → nouveaux tokens depuis Figma
2. ThemeContext → mettre à jour les tokens
3. Reécrire auth/ (login + register) sur Design System
4. Reécrire session.tsx (WheelPicker Reanimated + GhostBar)
5. `lib/ghost.ts` → `getGhostReference()` depuis SQLite
6. Reécrire summary.tsx (garder logique save/métriques, refaire UI)
7. Reécrire timer.tsx (Reanimated)
8. Myo 3D v0.1 : adapter code Spline exporté, 5 variables (Three.js + expo-gl)
9. `expo-haptics` → brancher sur validateSet + PR + Ghost battu
10. Onboarding < 60s (2 écrans max)
11. Reécrire tabs (feed, history, library, profile)

**Critère de sortie :** beta user mentionne le Mode Fantôme spontanément après 5 séances.

---

### Phase 2 — Vernis Premium + Prédictif + Monétisation (5–7 semaines)

1. Myo 3D v1.0 : 41 variables complètes (algorithm v1 déjà prêt dans `lib/myo.ts`)
2. Export Stories 9:16 (Skia `makeImageSnapshot`)
3. `lib/predictor.ts` → régression linéaire pondérée on-device
4. Notifications push prédictions (`expo-notifications`)
5. `@shopify/react-native-skia` → charts analytics premium + ADN preview
6. RevenueCat → Paywall Pro + tier Coach
7. `rive-react-native` → animations Podium PR (3 fichiers .riv)
8. Sound design (4 sons ElevenLabs → `expo-av`)

**Critère de sortie :** 100 abonnés Pro. 1 Story "prédiction réalisée" partagée.

---

### Phase 3 — Social + ADN Athlétique (9–12 semaines)

1. Migration Supabase : table `athletic_dna`
2. Edge Function : calcul hebdomadaire 6 dimensions
3. `app/athletic-dna.tsx` → visualisation Skia carte unique
4. Feed social Supabase Realtime + infinite scroll
5. Marketplace programmes + RevenueCat commission
6. Dashboard Coach (tier 24,99€/mois)
7. Système de référencement

---

### Phase 4 — Écosystème (12+ semaines)

OravaFeed · Mapbox salles · Pass Orava B2B · ADN v2 percentiles inter-users.

---

## 6. Règles d'or

1. **Design System avant tout code UI.** Un pixel sans maquette Figma validée = dette.
2. **Spline avant Three.js.** Jamais coder le Myo 3D sans avoir validé le visuel dans Spline d'abord.
3. **Logique v1 = référence à lire, pas à copier.** Relire `WorkoutContext.tsx` et `myo.ts` avant de recoder les équivalents.
4. **SQLite alimenté dès Phase 0.** Fantôme ne marche que si les données locales existent.
5. **Supabase : zéro migration sauvage.** Tout changement DB = documenté dans `rules/database.md` avant le code.
6. **PostHog mesure tout.** Décisions Phase 2+ basées sur données, pas intuitions.
