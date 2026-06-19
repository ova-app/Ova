# 7 — Le Design System

Orava a une identité visuelle **forte et stricte**. Ce n'est pas négociable : le design
EST le produit. Avant de coder le moindre écran, tu respectes ces règles.

> Référence complète (tous les tokens, anti-patterns, haptique) : [`.claude/rules/ui.md`](../.claude/rules/ui.md).
> Intégration des maquettes Figma : [`.claude/rules/figma.md`](../.claude/rules/figma.md).

---

## La règle n°1 : rien sans maquette

**Aucun écran ne se code avant que sa maquette Figma soit validée.** Les maquettes
(exports PNG numérotés) sont dans `design/figma-export/screens/`. Avant de coder un écran,
on **lit le PNG** correspondant pour relever la mise en page exacte.

---

## L'unique source de vérité : `constants/theme.ts`

**Toutes** les couleurs, tailles, espacements et animations viennent de ce fichier.
**Zéro valeur hardcodée** dans les écrans. Si tu écris `color: '#FFDD00'` en dur dans un
écran, c'est un bug.

```typescript
import { dark, spacing, typography, radius } from '@/constants/theme'
// puis : color: dark.accent, padding: spacing.s4, ...typography.title
```

---

## Les couleurs

### Les fonds — jamais de noir pur
```
background:          #0A0A0F   (noir avec une teinte froide)
backgroundSecondary: #12121A   (cards, surfaces)
backgroundTertiary:  #1A1A24   (modales, drawers)
```

### Le texte — jamais de blanc pur
```
textPrimary:   #F0F0F5   (blanc chaud)
textSecondary: #7A7A8C   (~52% de luminosité)
textTertiary:  #4A4A5A   (placeholders)
```

### L'accent — UN SEUL, partout pareil
```
accent: #FFDD00   ← le jaune électrique signature Orava
```
Règles d'usage de l'accent :
- Il apparaît **uniquement** sur : le CTA principal, un PR actif, la métrique « hero ».
- **Jamais deux fois** dans le même composant. Jamais décoratif.
- **Jamais sur fond clair** (illisible) — réservé au dark.

### Les couleurs de PR (immuables)
```
prGold: #FAC775   prSilver: #C0C0C0   prBronze: #CD7F32
```
> ⚠️ `prGold` (#FAC775, ambre chaud) **≠** `accent` (#FFDD00, jaune froid). Ne pas confondre.

### Les couleurs sémantiques — sens strict
```
success: #00E673 (vert)   error: #FF3B30 (rouge)   warning: #FFD60A
```
**Le vert et le rouge signifient gain/perte/succès/erreur — UNIQUEMENT.** Jamais décoratifs.
**La couleur est une information.**

---

## La typographie

- Police texte : **Barlow**. Titres : **Barlow Condensed**. Chiffres : **JetBrains Mono**.
- **Règle absolue** : `tabular-nums` (`fontVariant: ['tabular-nums']`) sur **tout chiffre
  qui change** (timers, compteurs, poids) — sinon les chiffres « sautent » en largeur.
- Échelle de tailles (extraits) : `hero` 56px, `display` 40px, `title` 24px, `body` 15px,
  `caption` 12px (toujours UPPERCASE). Max **4-5 tailles** sur toute l'app.
- Les labels en majuscules : **uniquement** ≤ 13px.

---

## L'espacement — grille 8pt stricte

Tous les espacements sont des multiples de 4/8. **Jamais de valeur arbitraire.**
```
s1=4  s2=8  s3=12  s4=16  s5=20  s6=24  s8=32  s10=40  s12=48
radius: sm=8  md=12  lg=16  xl=24  full=9999
```
Les **touch targets** (zones tappables), pensées pour des mains en sueur :
```
touchMin=44   touchComfort=52 (standard)   touchHero=64 (session active)
```

---

## Les animations — des ressorts, jamais du linéaire

L'animation est un **langage** dans Orava. Règles :
- **Spring (ressort) sur toute réponse à un geste.** **Zéro easing linéaire** sur un
  élément visible. Jamais.
- Le type de ressort encode l'intention :
  - `springBouncy` (rebond) → les joies (célébration de PR, succès)
  - `springSnappy` (vif) → le contrôle (taps, sélections)
  - `springGentle` (doux) → le WheelPicker
- La **durée est intentionnelle** : <200ms feedback immédiat ; 400-800ms révélations
  importantes (PR, summary) ; >800ms moments scénarisés (révélation Myo).
- **Chorégraphie** : plusieurs éléments ne s'animent jamais en même temps — décalage de
  50-80ms entre chacun.
- **60 FPS partout** — non négociable. On benchmarke sur Pixel 6a + iPhone 12.

> Implémentation : `react-native-reanimated` (`useSharedValue` + `withSpring`/`withTiming`).
> Jamais l'ancienne API `Animated.Value`. Jamais de `setState` dans un worklet.

---

## La densité par écran

Tous les écrans n'ont pas la même densité d'information :

| Écran | Densité | Principe |
|---|---|---|
| `session.tsx` (séance active) | **Zen** | Timer + Reps + Poids + Ghost. Rien d'autre. |
| `timer.tsx` | **Zen** | Le temps, uniquement. |
| `summary.tsx` | **Riche** | Révélation progressive, tout dévoilé par sections. |
| `feed.tsx` | **Dense** | Teaser → tap → détail. |
| `history.tsx` / `library.tsx` | **Dense** | Listes compactes. |

Le principe **« Two Modes »** : la séance active est une **UI à part** — touch targets
XXL, police +4px, **3 infos max** à l'écran. C'est le moment le plus important de l'app.

---

## La règle « 1-3-9 »

Sur chaque écran, une hiérarchie claire : **1** élément hero (100% d'attention),
**3** éléments de contexte (~30%), **9** détails (~10%). **Jamais deux éléments à 100%.**
La hiérarchie se fait par **l'espacement et la couleur de fond**, **pas par des bordures**.

---

## Les anti-patterns (à NE jamais faire)

```
✗ Couleur en dur dans un écran (toujours via theme.ts)
✗ fontSize / spacing arbitraire (toujours les tokens)
✗ Easing linéaire sur un élément visible
✗ Plus de 2 couleurs dans un composant (hors podium PR)
✗ Bordure visible ET ombre sur la même card (choisir l'un)
✗ #000 pur ou #FFF pur
✗ Accent (#FFDD00) sur fond clair
✗ Victory Native pour les charts (→ Skia ou View RN)
✗ setState dans un worklet Reanimated
✗ Spinners (→ skeleton screens à la place)
```

---

## Checklist avant de coder un écran

```
□ Maquette Figma (PNG) lue
□ Densité identifiée (Zen / Dense / Riche / Standard)
□ Toutes les couleurs viennent de theme.ts (zéro hardcode)
□ Tokens de typo utilisés (pas de fontSize inline)
□ Espacements sur la grille 8pt
□ Touch targets respectés (44 / 52 / 64)
□ tabular-nums sur tout chiffre variable
□ Springs only, zéro linéaire
□ Skeleton prévu si l'écran fetch du réseau
```

➡️ Suite : [08-workflow-dev.md](./08-workflow-dev.md) — git, CI, et ajouter un écran.
