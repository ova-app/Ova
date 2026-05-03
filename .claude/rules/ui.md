# rules/ui.md

## Thème
ThemeContext dark/light — persistance AsyncStorage. Source : `constants/theme.ts` (`Colors.ts` vide, ne pas utiliser).

| Token | Sombre | Clair |
|---|---|---|
| background | #1C1C1E | #FFFFFF |
| backgroundSecondary | #2C2C2E | #F5F5F5 |
| textPrimary | #FFFFFF | #1C1C1E |
| textSecondary | #8E8E93 | #666666 |
| separator | #3A3A3C | #E5E5E5 |
| accent | #D85A30 | #D85A30 |
| prGold | #FAC775 | — |
| prAmber | #FAC775 | — |
| prPurple | #9B59B6 | — |

## Icônes PR
| Type | Icône | Couleur |
|---|---|---|
| pr_charge | Zap | #FAC775 |
| pr_serie | Flame | #D85A30 |
| pr_exercice | Flame | #9B59B6 |
| pr_seance | Trophy | #FAC775 |

Podium : déclinaison de couleurs uniquement — pas d'addition d'icônes.

## WheelPicker — règles impératives
- `readValue(y)` : lit valeur uniquement — jamais `scrollTo` après scroll utilisateur
- `snapToInterval={ITEM_HEIGHT}` natif — pas de JS
- Pattern `hasMomentum` : `onScrollEndDrag` ne snap que sans momentum, `onMomentumScrollEnd` prend le relais
- `weightValues` mémoïsé `useMemo([equipment_type])`
- `REPS_VALUES` = 1..50 constante module
- `useEffect([values])` : scroll programmatique au changement d'exercice/équipement uniquement
- Timer : flag `isUserScroll` empêche rescroll après interaction utilisateur (laisse presets rescroller)

## Bibliothèque — règles
- Chips filtres : `View flexWrap:'wrap'` — pas `ScrollView` horizontal
- Recherche insensible accents via `normalize()` NFD
- En-têtes sections : `backgroundSecondary` + `borderLeft accent` + `textPrimary`

## Picker poids — granulométrie
| Équipement | Pas | Plage |
|---|---|---|
| Haltères | 2 kg | 2→60 kg |
| Poulie/Machine | 2,5 kg | 2,5→200 kg |
| Barre | 20kg + disques ×2 | 20→~220 kg |
| Poids du corps | Reps only | — |
| Kettlebell | 4 kg | 4→48 kg |
