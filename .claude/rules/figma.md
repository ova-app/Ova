# rules/figma.md

## Rôle de cette rule
Protocole d'intégration des exports Figma Make → code React Native.
Lire cette rule avant tout travail impliquant des assets design ou une mise à jour de `constants/theme.ts`.

---

## Structure réelle des exports Figma (état 24/05/2026)

⚠️ La structure réelle diffère du plan initial. Les screens sont numérotés, pas nommés.

```
design/figma-export/
├── orava_logo.png                      — logo définitif (cercle jaune + losange noir)
└── Orava_design_figma/
    ├── index.html                      — Design System interactif (Colors/Typography/Spacing/Radius)
    └── screens/                        — 33 PNGs numérotés 1.png → 33.png
        ├── 1.png    session active (WheelPicker)
        ├── 2.png    summary séance
        ├── 3.png    composants PR (active state)   ← states référence
        ├── 4.png    feed
        ├── 5.png    historique liste
        ├── 6.png    profil
        ├── 7.png    timer
        ├── 8.png    auth login + register (côte à côte)
        ├── 9.png    détail séance (history/[id])
        ├── 10.png   détail exercice (exercise/[id])
        ├── 11.png   modal "Ajouter un exercice" + session
        ├── 12.png   toasts PR overlay
        ├── 14.png   splash / loading
        ├── 16.png   états input (référence)
        ├── 17.png   édition profil
        ├── 18.png   états vides (feed / history / library)
        ├── 19.png   skeleton screens
        ├── 22.png   états toggles (référence)
        ├── 23.png   états sélection exercice (référence)
        ├── 25.png   design system logo — déclinaisons
        ├── 26.png   design system — intro + backgrounds
        ├── 27.png   design system — accent + text + PR colors
        ├── 28.png   design system — status + typography intro
        ├── 29-30.png design system — type scale détaillée
        ├── 31-32.png design system — spacing 8pt grid
        └── 33.png   design system — border radius scale
```

**Pas de tokens.json** — les tokens sont dans l'HTML interactif. Les valeurs sont déjà dans `constants/theme.ts` (vérifié 24/05/2026 : correspondance exacte).

---

## Workflow d'intégration — ordre obligatoire

### 1. Tokens → `constants/theme.ts`

Pas de tokens.json. Lire les PNGs du design system (26.png → 33.png) pour vérifier les valeurs.
**Ne modifier `theme.ts` que si une valeur diffère.** Vérifié 24/05/2026 — correspondance exacte confirmée.

Valeurs clés confirmées Figma → theme.ts :
| Token Figma | Valeur | theme.ts key |
|---|---|---|
| BACKGROUND | `#0A0A0F` | `dark.background` |
| BACKGROUNDSECONDARY | `#12121A` | `dark.backgroundSecondary` |
| BACKGROUNDTERTIARY | `#1A1A24` | `dark.backgroundTertiary` |
| ACCENT | `#FFDD00` | `dark.accent` |
| TEXTPRIMARY | `#F0F0F5` | `dark.textPrimary` |
| TEXTSECONDARY | `#7A7A8C` | `dark.textSecondary` |
| TEXTTERTIARY | `#4A4A5A` | `dark.textTertiary` |
| PRGOLD | `#FAC775` | `dark.prGold` |
| PRSILVER | `#C0C0C0` | `dark.prSilver` |
| PRBRONZE | `#CD7F32` | `dark.prBronze` |

⚠️ `theme.ts` a une section `light` — ne pas la supprimer même si Figma n'a que le dark mode (Phases 0-2).

### 2. Logo → assets

Logo définitif : `design/figma-export/orava_logo.png` (cercle jaune, losange noir intérieur).
À vectoriser par le designer avant intégration dans les assets.

Implémentation code (en attendant le SVG vectoriel) :
```tsx
// Cercle jaune 48px + losange noir 16px intérieur
<View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
  <View style={{ width: 16, height: 16, backgroundColor: colors.background, transform: [{ rotate: '45deg' }] }} />
</View>
```

Quand le SVG est prêt :
```
design/figma-export/orava_logo.svg  → mobile_app/assets/icon.png (export PNG 1024px)
                                    → mobile_app/assets/adaptive-icon.png (512px)
                                    → mobile_app/assets/splash.png
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

## Correspondance Figma → fichiers code (numéros réels)

| PNG | Fichier cible | Densité | Statut |
|---|---|---|---|
| `1.png` | `app/workout/session.tsx` | Zen | ✅ Reinventé (25/05) — timer header + WheelPickerModal |
| `2.png` | `app/workout/summary.tsx` | Riche | ✅ + animation volume défilant (25/05) |
| `7.png` | `app/workout/timer.tsx` | Zen | ✅ Implémenté |
| `4.png` | `app/(tabs)/feed.tsx` | Dense | ✅ + likes fix + lieu séance + greeting animé (25/05) |
| `5.png` | `app/(tabs)/history.tsx` | Dense | ✅ Implémenté |
| `9.png` | `app/history/[id].tsx` | Dense | ✅ Implémenté |
| `11.png` | `app/(tabs)/library.tsx` (référence) | Dense | ✅ Implémenté |
| `10.png` | `app/exercise/[id].tsx` | Standard | ✅ Implémenté |
| `6.png` | `app/(tabs)/profile.tsx` | Standard | ✅ Implémenté |
| `16.png` | `app/settings.tsx` (référence) | Standard | ✅ Implémenté |
| `17.png` | `app/edit-profile.tsx` | Standard | ✅ Implémenté |
| `14.png` | `app/index.tsx` | Zen | ✅ Implémenté |
| `8.png` | `app/auth/login.tsx` + `register.tsx` | Standard | ✅ Implémenté |
| — | `app/prs.tsx` | Standard | ⏳ À faire |
| — | `app/onboarding/` | Zen | ✅ Implémenté (Phase 1) |
| — | `app/feed/[id].tsx` | Riche | ✅ Créé (25/05) — Myo 80% + photos + recap + comments |
| — | `app/chat.tsx` | Zen | ✅ Placeholder (Phase 2 design à faire) |

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
