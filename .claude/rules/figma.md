# rules/figma.md

## Rôle de cette rule
Protocole d'intégration des exports Figma Make → code React Native.
Lire cette rule avant tout travail impliquant des assets design ou une mise à jour de `constants/theme.ts`.

---

## Structure des exports Figma

Quand le zip Figma est téléchargé, le placer dans `design/figma-export/` avec cette structure :

```
design/
└── figma-export/
    ├── tokens.json          — export Tokens Studio (couleurs, typo, spacing)
    ├── screens/             — PNG 390×844 de chaque screen validé
    │   ├── session.png
    │   ├── summary.png
    │   ├── timer.png
    │   ├── feed.png
    │   ├── history-list.png
    │   ├── history-detail.png
    │   ├── library.png
    │   ├── exercise-detail.png
    │   ├── profile.png
    │   ├── prs.png
    │   ├── settings.png
    │   ├── edit-profile.png
    │   ├── splash.png
    │   ├── onboarding-1.png
    │   ├── onboarding-2.png
    │   ├── auth-login.png
    │   └── auth-register.png
    ├── components/          — PNG de chaque composant + ses états
    │   ├── navigation-fab.png
    │   ├── wheel-picker.png
    │   ├── bottom-sheet-exercise.png
    │   ├── pr-flash-gold.png
    │   ├── pr-flash-silver.png
    │   ├── pr-flash-bronze.png
    │   ├── pr-badges.png
    │   ├── myo-detail-panel.png
    │   ├── empty-state-feed.png
    │   ├── empty-state-history.png
    │   ├── empty-state-library.png
    │   ├── skeleton-feed.png
    │   ├── skeleton-summary.png
    │   └── skeleton-library.png
    ├── states/              — PNG des états interactifs
    │   ├── button-states.png
    │   ├── input-states.png
    │   ├── toggle-states.png
    │   └── row-exercise-states.png
    └── logo/                — assets vectoriels du logo
        ├── logo.svg
        ├── icon-1024.png
        ├── icon-512.png
        └── splash-bg.png
```

---

## Workflow d'intégration — ordre obligatoire

### 1. Tokens → `constants/theme.ts`

Si `design/figma-export/tokens.json` existe, le lire et vérifier les deltas vs `constants/theme.ts` actuel.
**Ne modifier `theme.ts` que si une valeur diffère.** Le fichier actuel est déjà aligné sur le Design System.

Format attendu du JSON Tokens Studio :
```json
{
  "color": {
    "background": { "value": "#0A0A0F", "type": "color" },
    "accent": { "value": "#FFDD00", "type": "color" }
  },
  "spacing": {
    "s4": { "value": "16", "type": "spacing" }
  }
}
```

Mapping JSON → `theme.ts` :
| JSON key | theme.ts | Section |
|---|---|---|
| `color.background` | `dark.background` | Colors |
| `color.accent` | `dark.accent` | Colors |
| `color.textPrimary` | `dark.textPrimary` | Colors |
| `spacing.s*` | `spacing.s*` | Spacing |
| `radius.*` | `radius.*` | Radius |
| `typography.hero.*` | `typography.hero` | Typography |

⚠️ `theme.ts` a une section `light` — ne pas la supprimer même si Figma n'a que le dark mode (Phases 0-2).

### 2. Logo → assets

```
design/figma-export/logo/logo.svg        → design/system/logo/logo.svg
design/figma-export/logo/icon-1024.png   → mobile_app/assets/icon.png
design/figma-export/logo/icon-512.png    → mobile_app/assets/adaptive-icon.png
design/figma-export/logo/splash-bg.png  → mobile_app/assets/splash.png
```

Après copie, vérifier `mobile_app/app.json` :
```json
{
  "expo": {
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "backgroundColor": "#0A0A0F"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0A0A0F"
      }
    }
  }
}
```

### 3. Screens → référence visuelle

Les PNG dans `design/figma-export/screens/` servent de **référence visuelle uniquement** — ne pas les copier dans `mobile_app/assets/`.

Avant de coder un screen, lire le PNG correspondant via Read tool pour vérifier la mise en page exacte (spacing, hiérarchie, états).

### 4. Composants → référence visuelle

Même règle. Les PNG dans `design/figma-export/components/` et `states/` sont des specs visuelles.
Lire le PNG du composant avant d'écrire son code inline dans le screen.

---

## Correspondance Figma → fichiers code

| PNG Figma | Fichier cible | Densité |
|---|---|---|
| `session.png` | `app/workout/session.tsx` | Zen |
| `summary.png` | `app/workout/summary.tsx` | Riche |
| `timer.png` | `app/workout/timer.tsx` | Zen |
| `feed.png` | `app/(tabs)/feed.tsx` | Dense |
| `history-list.png` | `app/(tabs)/history.tsx` | Dense |
| `history-detail.png` | `app/history/[id].tsx` | Dense |
| `library.png` | `app/(tabs)/library.tsx` | Dense |
| `exercise-detail.png` | `app/exercise/[id].tsx` | Standard |
| `profile.png` | `app/(tabs)/profile.tsx` | Standard |
| `prs.png` | `app/prs.tsx` | Standard |
| `settings.png` | `app/settings.tsx` | Standard |
| `edit-profile.png` | `app/edit-profile.tsx` | Standard |
| `splash.png` | `app/index.tsx` | Zen |
| `onboarding-1.png` | `app/onboarding/index.tsx` | Zen |
| `onboarding-2.png` | `app/onboarding/first-set.tsx` | Zen |
| `auth-login.png` | `app/auth/login.tsx` | Standard |
| `auth-register.png` | `app/auth/register.tsx` | Standard |

---

## Règles de lecture des PNG

Quand on lit un PNG Figma pour coder :

1. **Identifier la densité** (Zen / Dense / Riche / Standard) → ajuster les touch targets et l'espacement
2. **Compter les éléments** → appliquer la règle 1-3-9 (jamais 2 éléments à 100%)
3. **Relever les couleurs** → vérifier que chaque couleur existe dans `theme.ts` avant d'utiliser une valeur hardcodée
4. **Identifier les états** → lire le PNG `states/` correspondant si un composant interactif est présent
5. **Spacing** → toujours mapper sur la grille 8pt de `spacing` — jamais de valeur arbitraire

---

## Ce qui NE change pas via Figma

- La logique `WorkoutContext.tsx` — aucune modification
- `lib/myo.ts` — aucune modification
- `lib/supabase.ts` — aucune modification
- Le schéma Supabase — voir `rules/database.md`
- L'arborescence `app/` — voir `rules/files.md`

---

## Checklist avant de coder un screen depuis Figma

```
□ PNG Figma lu via Read tool
□ Densité identifiée
□ Couleurs toutes dans theme.ts (aucune valeur hardcodée)
□ Typography tokens utilisés (pas de fontSize inline)
□ Spacing sur grille 8pt (spacing.s* uniquement)
□ Touch targets respectés (44 min, 52 standard, 64 session)
□ États interactifs vérifiés dans states/*.png
□ Zéro linear easing — spring uniquement
□ tabular-nums sur tout chiffre variable
□ Skeleton screen prévu si fetch réseau
```
