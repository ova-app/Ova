# rules/ui.md

## IMPORTANT — Design System
**Aucun écran ne se code avant que les maquettes Figma soient validées.**
Les tokens ci-dessous sont des **noms de référence** — les valeurs viennent du Design System Figma à créer en Phase 0.
v1 colors (`constants/theme.ts`) sont une base temporaire, remplacées en Phase 0.

## Tokens thème (à définir dans Figma, noms fixes dans le code)
```
background · backgroundSecondary · backgroundTertiary
textPrimary · textSecondary · textTertiary
separator · border
accent        — orange signature Orava
prGold        — #FAC775 (fixe, identité PR)
prSilver      — #C0C0C0 (fixe)
prBronze      — #CD7F32 (fixe)
success · error · warning
```

Source : `constants/theme.ts` — ThemeContext dark/light, persistance AsyncStorage. `Colors.ts` vide, ne pas utiliser.

## Icônes PR (Lucide React Native — ne pas changer)
| Type | Icône | Couleur |
|---|---|---|
| pr_charge | Zap | prGold |
| pr_serie | Flame | accent |
| pr_exercice | Dumbbell | #9B59B6 |
| pr_seance | Trophy | prGold |

Podium : déclinaison de couleurs uniquement — pas d'addition d'icônes.

---

## WheelPicker — règles comportementales (implémentation Reanimated Phase 1)
La granulométrie est fixe (garder du v1). L'implémentation est réinventée avec Reanimated.

- Snap natif — pas de JS pour le snap
- Momentum scroll géré : `onScrollEndDrag` (sans momentum) + `onMomentumScrollEnd`
- Valeurs mémoïsées `useMemo([equipment_type])`
- `REPS_VALUES` = 1..50 constante module
- Scroll programmatique uniquement au changement d'exercice/équipement
- **GhostBar intégrée** : barre translucide Reanimated, opacity 0.35, valeur ghost

## Picker poids — granulométrie (fixe, du v1)
| Équipement | Pas | Plage |
|---|---|---|
| Haltères | 2 kg | 2→60 kg |
| Poulie/Machine | 2,5 kg | 2,5→200 kg |
| Barre | 20kg + disques ×2 | 20→~220 kg |
| Poids du corps | Reps only | — |
| Kettlebell | 4 kg | 4→48 kg |

## Bibliothèque — règles
- Chips filtres : `View flexWrap:'wrap'` — pas `ScrollView` horizontal
- Recherche insensible accents via `normalize()` NFD

---

## Reanimated (Phase 0 — installer avant tout)
- `useSharedValue` + `withSpring` / `withTiming` — jamais l'ancienne API `Animated.Value`
- Worklets : toute fonction dans un worklet = décorée `'worklet'`
- Gestionnaires geste : `useAnimatedGestureHandler` ou `Gesture` API
- Jamais de `setState` dans un worklet

## Skia (Phase 2)
- Charts 2D analytiques → `Path` + `Canvas` Skia
- Carte ADN Athlétique → `Path` déterministe seedé par userId (djb2)
- Export Stories : `makeImageSnapshot()` → Share Sheet
- Skia et expo-gl GLView **coexistent mais séparément** — pas de Skia dans une GLView

## Rive (Phase 2)
- 3 animations : PR Bronze (0.8s), PR Argent (1.2s), PR Or (2s + loop décroissant)
- Fichiers `.riv` < 200 KB chacun dans `assets/animations/`
- Déclenché par événement PR dans WorkoutContext
- Ne pas utiliser Lottie

## Haptics (Phase 1 — `expo-haptics`)
| Événement | Pattern |
|---|---|
| Fin de série | `ImpactFeedbackStyle.Light` |
| PR Bronze/Argent | `ImpactFeedbackStyle.Medium` |
| PR Or | `NotificationFeedbackType.Success` |
| Fantôme battu | `ImpactFeedbackStyle.Medium` × 2 |

## Sound Design (Phase 2 — `expo-av`)
4 sons MP3 < 50 KB dans `assets/sounds/` :
- `serie_end.mp3` — validation série
- `pr_bronze.mp3` — PR bronze/argent
- `pr_gold.mp3` — PR or
- `myo_reveal.mp3` — révélation Myo en summary

`Audio.setAudioModeAsync({ playsInSilentModeIOS: false })` — respecter mode silencieux.

## UX Guidelines (Master Plan v4 §12)
- **N°1** : Progressive Disclosure — pendant séance : Timer + Reps + Poids uniquement. Ghost = seule exception.
- **N°2** : Zéro saisie inutile — pré-remplissage auto, l'utilisateur valide d'un tap.
- **N°4** : Myo = récompense finale — jamais pendant la séance.
- **N°5** : Export Stories 9:16 natif Pro — sans watermark agressif.
- **N°6** : Onboarding < 60 secondes de l'install à la 1re série.
- **N°7** : Ghost silencieux — présence, pas interruption.
