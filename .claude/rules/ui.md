# rules/ui.md

## IMPORTANT — Design System
**Aucun écran ne se code avant que les maquettes Figma soient validées.**
Les tokens ci-dessous sont des **noms de référence** — les valeurs viennent du Design System Figma à créer en Phase 0.
v1 colors (`constants/theme.ts`) sont une base temporaire, remplacées en Phase 0.

---

## Manifeste Design Orava — 10 contraintes non-négociables

```
1. Contrainte radicale       : Orange. Pas de border visible. 60 FPS.
2. 1-3-9 par screen          : 1 hero (100%), 3 context (30%), 9 detail (10%). Jamais 2 éléments à 100%.
3. Reveal architecture       : Myo = récompense à 800ms. Rien de précieux n'arrive immédiatement.
4. Spring = langue           : bouncy (damping 12) pour joies. Snappy (damping 20) pour contrôle. Jamais linear.
5. Densité contextuelle      : session = zen (3 infos). summary = riche. feed = dense.
6. Friction zéro / résistance: log set = 0 friction. delete exercice = 1 résistance intentionnelle.
7. Couleur = information     : vert/rouge = gain/perte UNIQUEMENT. Accent = 1 fois par screen max.
8. Two Modes                 : séance active = autre UI. Touch targets XXL, police +4px, 3 infos max.
9. Détails invisibles        : jamais #000 pur. Shadows faibles. Borders quasi-invisibles.
10. Première interaction     : logger un set = moment le plus important de l'app. Doit être parfait.
```

---

## Tokens couleurs (`constants/theme.ts`)

```typescript
// FONDS — jamais #000 pur, jamais #FFF pur
background:          '#0A0A0F'  // noir + tinte froide
backgroundSecondary: '#12121A'  // elevation 1 — cards, surfaces
backgroundTertiary:  '#1A1A24'  // elevation 2 — modals, drawers
separator:  'rgba(255,255,255,0.06)'   // présent mais invisible
border:     'rgba(255,255,255,0.10)'

// TEXTE
textPrimary:   '#F0F0F5'   // blanc chaud — jamais #FFF
textSecondary: '#7A7A8C'   // ~52% brightness
textTertiary:  '#4A4A5A'   // placeholders, labels off

// ACCENT — UN SEUL, partout pareil
accent: '#FFDD00'           // jaune électrique signature Orava
// Contraste maximal sur fond #0A0A0F — unique dans l'espace fitness
// Apparaît UNIQUEMENT sur : CTA primaire, PR actif, métrique hero
// Jamais décoratif. Jamais deux fois dans le même composant.
// ⚠️ Différent de prGold (#FAC775) — le gold est chaud/ambre, l'accent est froid/électrique

// PR PODIUM — immuables
prGold:   '#FAC775'
prSilver: '#C0C0C0'
prBronze: '#CD7F32'

// ÉTATS SÉMANTIQUES — vert/rouge réservés gain/perte/succès/erreur
success: '#00E673'
error:   '#FF3B30'
warning: '#FFD60A'
```

Source : `constants/theme.ts` — ThemeContext dark/light, persistance AsyncStorage. `Colors.ts` vide, ne pas utiliser.

---

## Icônes PR (Lucide React Native — ne pas changer)

| Type | Icône | Couleur |
|---|---|---|
| pr_charge | Zap | prGold |
| pr_serie | Flame | accent |
| pr_exercice | Dumbbell | #9B59B6 |
| pr_seance | Trophy | prGold |

Podium : déclinaison de couleurs uniquement — pas d'addition d'icônes.

---

## Typographie

```typescript
// Règle absolue : tabular-nums sur TOUT chiffre qui change
// Règle : tracking négatif au-dessus de 20px, positif en-dessous de 13px
// Règle : max 2 font-weights dans le même composant
// Règle : max 4-5 tailles actives sur toute l'app

hero:     { fontSize: 56, fontWeight: '900', letterSpacing: -1.5, lineHeight: 60 }
// → Volume total, score Myo, poids max PR, métrique principale session

display:  { fontSize: 40, fontWeight: '800', letterSpacing: -1.0, lineHeight: 44 }
// → WheelPicker poids, PR principal

title:    { fontSize: 24, fontWeight: '700', letterSpacing: -0.3, lineHeight: 30 }
// → Nom exercice, titre screen

subtitle: { fontSize: 18, fontWeight: '600', letterSpacing: -0.2, lineHeight: 24 }
// → Sections, en-têtes cards

body:     { fontSize: 15, fontWeight: '400', letterSpacing: 0,    lineHeight: 22 }
caption:  { fontSize: 12, fontWeight: '500', letterSpacing: 0.4,  lineHeight: 16 }
// → Labels — TOUJOURS UPPERCASE

mono:     { fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], letterSpacing: 0 }
// → Timers, compteurs, tout ce qui change numériquement
```

---

## Spacing — grille 8pt stricte

```typescript
space1: 4    // micro-gap inline
space2: 8    // gap éléments liés
space3: 12   // padding dense (listes)
space4: 16   // padding standard
space5: 20   // padding confortable
space6: 24   // section padding mobile
space8: 32   // section gap
space10: 40  // breathing room hero
space12: 48  // section break majeur

radiusSm:   8
radiusMd:   12    // cards standard
radiusLg:   16    // cards hero
radiusXl:   24    // modals, bottom sheets
radiusFull: 9999  // pills, badges

// Touch targets — sport, mains en sueur
touchMin:     44   // HIG minimum absolu
touchComfort: 52   // standard Orava
touchHero:    64   // CTA session active
```

---

## Animations — Spring Physics (Reanimated)

```typescript
// PHILOSOPHIE : la durée est intentionnelle
// < 200ms   → feedback immédiat (taps, toggles)
// 200-400ms → transitions standard
// 400-800ms → révélations importantes (PR, summary sections)
// > 800ms   → moments scénarisés (Myo reveal, save séance)

// SPRINGS
springSnappy   = { damping: 20, stiffness: 600 }  // taps, pills, selects
springStandard = { damping: 18, stiffness: 300 }  // transitions pages, cards
springBouncy   = { damping: 12, stiffness: 200 }  // PR celebration, success
springGentle   = { damping: 25, stiffness: 120 }  // WheelPicker, scroll

// TIMINGS
durationFast:     150   // hover, micro-feedback
durationStandard: 250   // transitions UI
durationEmphasis: 400   // PR flash, reveals
durationDramatic: 700   // Myo reveal, session save

// EASINGS
easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1)      // snap net — données, chiffres
easeOutBack = Easing.bezier(0.34, 1.56, 0.64, 1)  // rebond — joie, succès
easeInOutSine = Easing.bezier(0.37, 0, 0.63, 1)   // neutre — transitions

// RÈGLE : zéro linear easing sur éléments UI visibles — jamais
// RÈGLE : réduire toutes durées de 30% si prefers-reduced-motion
```

### Choreography — reveal séquentiel
Plusieurs éléments ne s'animent jamais simultanément. Décalage 50-80ms entre chaque.

```typescript
// Exemple summary screen
// 0ms   → titre
// 80ms  → hero metric
// 160ms → secondary metrics
// 240ms → chart
// 320ms → CTA
```

---

## Glassmorphism v2 (2026 — usage chirurgical)

```typescript
// RÈGLE : max 2-3 éléments glass par screen
// RÈGLE : uniquement sur overlays flottants au-dessus de contenu vivant
// INTERDIT : listes, surfaces statiques, backgrounds principaux

glassCard: {
  backgroundColor: 'rgba(18, 18, 26, 0.75)',
  // iOS : <BlurView blurType="dark" blurAmount={24} />
  borderWidth: 1,
  borderColor: 'rgba(255, 255, 255, 0.08)',
  borderRadius: 24,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.4,
  shadowRadius: 24,
}
// Usages : bottom sheets, label flottant sur Myo, popover PR
// Fallback Android : backgroundColor: '#1A1A24' opaque (BlurView non dispo)
```

---

## Couleur contextuelle — état encodé visuellement

```typescript
// La couleur encode l'état — jamais purement décorative

deltaColor = (pct: number) =>
  pct >  0.05 ? '#00E673' :   // +5% → vert
  pct < -0.05 ? '#FF3B30' :   // -5% → rouge
               '#7A7A8C'       // stable → gris

myoScoreColor = (score: number) =>
  score >= 66 ? '#FAC775' :   // or — performance
  score >= 33 ? '#FF6B00' :   // orange — moyen
               '#8E8E93'       // gris — faible

// RÈGLE : vert et rouge = gain/perte/succès/erreur UNIQUEMENT
// RÈGLE : accent (#FF6B00) n'encode jamais success/failure — il reste action neutre
```

---

## Density par screen

| Screen | Densité | Règle |
|---|---|---|
| `session.tsx` active | **Zen** | Timer + Reps + Poids + Ghost uniquement |
| `timer.tsx` | **Zen** | Temps uniquement — rien d'autre |
| `summary.tsx` | **Riche** | Reveal progressif, tout dévoilé par sections |
| `feed.tsx` | **Dense** | Teaser → tap → détail |
| `history.tsx` | **Dense** | Liste rows 64px, padding 12px |
| `library.tsx` | **Dense** | Chips filtres, SectionList compressé |
| `myo-orb.tsx` reveal | **Zen** | Orb centré, rien ne concurrence à 800ms |

---

## Haptique — taxonomie complète (Phase 1 — `expo-haptics`)

```typescript
tap()            → ImpactFeedbackStyle.Light    // chaque log set, navigate
select()         → ImpactFeedbackStyle.Medium   // sélection exercice, snap WheelPicker
prBronzeSilver() → ImpactFeedbackStyle.Medium   // délai 800ms après flash visuel
prGold()         → NotificationFeedbackType.Success  // délai 800ms après flash
ghostBeaten()    → Medium + 120ms pause + Medium     // double pulse
error()          → NotificationFeedbackType.Error
sessionSave()    → NotificationFeedbackType.Success

// RÈGLE : le haptique SUIT le visuel — jamais avant
// RÈGLE : silence absolu pendant Myo reveal (le visuel suffit)
// RÈGLE : opt-outable dans settings (users en réunion)
// RÈGLE : pas de haptique sur actions destructives sans confirmation préalable
```

---

## Reanimated — règles impératives

- `useSharedValue` + `withSpring` / `withTiming` — jamais `Animated.Value`
- Worklets : toute fonction dans un worklet = décorée `'worklet'`
- Gestionnaires geste : `Gesture` API (nouvelle) — jamais `useAnimatedGestureHandler` (déprécié)
- Jamais de `setState` dans un worklet

---

## WheelPicker — règles comportementales (Phase 1)

- Snap natif — pas de JS pour le snap
- Momentum scroll : `onScrollEndDrag` (sans momentum) + `onMomentumScrollEnd`
- Valeurs mémoïsées `useMemo([equipment_type])`
- `REPS_VALUES` = 1..50 constante module
- Scroll programmatique uniquement au changement d'exercice/équipement
- **GhostBar intégrée** : barre translucide Reanimated, opacity 0.35, valeur ghost

### Granulométrie poids (fixe — ne pas modifier)

| Équipement | Pas | Plage |
|---|---|---|
| Haltères | 2 kg | 2→60 kg |
| Poulie/Machine | 2,5 kg | 2,5→200 kg |
| Barre | 20kg + disques ×2 | 20→~220 kg |
| Poids du corps | Reps only | — |
| Kettlebell | 4 kg | 4→48 kg |

---

## Skia (Phase 2)

- Charts 2D analytiques → `Path` + `Canvas` Skia
- Carte ADN Athlétique → `Path` déterministe seedé par userId (djb2)
- Export Stories : `makeImageSnapshot()` → Share Sheet
- Skia et expo-gl GLView **coexistent mais séparément** — jamais de Skia dans une GLView

---

## Rive (Phase 2)

- 3 animations : PR Bronze (0.8s), PR Argent (1.2s), PR Or (2s + loop décroissant)
- Fichiers `.riv` < 200 KB dans `assets/animations/`
- Déclenché par événement PR dans WorkoutContext
- Ne pas utiliser Lottie

---

## Sound Design (Phase 2 — `expo-av`)

4 sons MP3 < 50 KB dans `assets/sounds/` :
- `serie_end.mp3` — validation série
- `pr_bronze.mp3` — PR bronze/argent
- `pr_gold.mp3` — PR or
- `myo_reveal.mp3` — révélation Myo en summary

`Audio.setAudioModeAsync({ playsInSilentModeIOS: false })` — respecter mode silencieux.

---

## Logo Orava — directives

**Design validé (25/05/2026)** : bullseye 3 couches — cercle jaune extérieur + cercle noir intermédiaire + point jaune central. Source : `image-3.png` racine repo.

Implémentation code (utilisée partout) :
```tsx
// Cercle jaune 48px + cercle noir 22px + dot jaune 8px
<View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent }} />
  </View>
</View>
```

Règles d'usage :
- App icon : symbole seul sur fond `#0A0A0F`, sans texte
- Wordmark : symbole + "ORAVA" en typo bold condensed
- Couleur symbole : `#FFDD00` sur fond noir — jamais inversé (noir sur blanc)
- Interactif dans header feed → `/chat` (tap)
- Non-cliquable pendant séance active
- Formats à exporter : SVG + PNG 1024×1024 + PNG 512×512
- Placer dans `design/system/logo/` avant intégration dans `mobile_app/assets/`

---

## Bibliothèque — règles

- Chips filtres : `View flexWrap:'wrap'` — pas `ScrollView` horizontal
- Recherche insensible accents via `normalize()` NFD

---

## UX Guidelines (Master Plan v4 §12)

- **N°1** : Progressive Disclosure — pendant séance : Timer + Reps + Poids uniquement. Ghost = seule exception.
- **N°2** : Zéro saisie inutile — pré-remplissage auto, l'utilisateur valide d'un tap.
- **N°4** : Myo = récompense finale — jamais pendant la séance.
- **N°5** : Export Stories 9:16 natif Pro — sans watermark agressif.
- **N°6** : Onboarding < 60 secondes de l'install à la 1re série.
- **N°7** : Ghost silencieux — présence, pas interruption.

---

## Anti-patterns — règles dures

```
FAIRE
✓ 1 seul accent coloré — monochromatic autour
✓ Fond avec tinte froide (jamais #000 pur, jamais #FFF pur)
✓ tabular-nums sur tout chiffre animé ou variable
✓ Touch targets 52px minimum, 64px en session active
✓ Spring sur toute réponse à un geste utilisateur
✓ Skeleton screens à la place des spinners
✓ Hiérarchie par spacing + surface color — pas par borders
✓ Séparation par couleur de fond — jamais par ligne visible
✓ Choreography 50-80ms entre éléments d'un même reveal

NE PAS FAIRE
✗ Gradients décoratifs sur surfaces statiques
✗ Shadows elevation > shadowRadius 16
✗ Linear easing sur éléments visibles — jamais
✗ Plus de 2 couleurs dans un composant (hors PR podium)
✗ Border visible ET shadow sur la même card — choisir un seul
✗ Uppercase sur texte > 13px
✗ Plus de 5 items en bottom tab
✗ Scroll indicators visibles sur listes
✗ Accent (#FFDD00) sur fond clair — illisible, réservé dark uniquement
✗ Glass sur surfaces statiques ou listes
✗ setState dans un worklet Reanimated
✗ Victory Native pour les charts
```
