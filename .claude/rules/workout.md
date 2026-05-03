# rules/workout.md

## Système PR — 4 types × podium 3 niveaux

| Type | Échelle | Définition | Stockage |
|---|---|---|---|
| pr_charge | Set | Poids le plus lourd toutes séances | workout_sets |
| pr_serie | Set | Max(poids × reps) sur 1 set | workout_sets |
| pr_exercice | Exercice/séance | Volume total exercice vs historique | workout_exercises |
| pr_seance | Séance | Volume total séance vs historique | workouts |

Podium : `gold` = nouveau record absolu · `silver` = 2e · `bronze` = 3e · `null` = pas de PR.

`is_pr` (boolean) = `pr_charge IS NOT NULL OR pr_serie IS NOT NULL`

## WorkoutContext
- `status` : idle | active | done
- `startedAt`, `exercises`, `currentIndex`, `elapsedSeconds`
- PR : `pr_charge`/`pr_serie` = `PrLevel` (text null|gold|silver|bronze)
- 3 top-3 chargés par `addExercise` : `pr_top3_charge`, `pr_top3_serie`, `pr_top3_exercice`
- `computePodium(value, top3)` exporté — utilisé dans `summary.tsx`
- `rest_seconds` : delta ms depuis dernier set validé (global workout)

## Calcul au save (summary.tsx)
- `pr_exercice` : `computePodium(Σ poids×reps des sets, ex.pr_top3_exercice)` → `workout_exercises`
- `pr_seance` : `computePodium(volume total séance, seanceTop3)` — top-3 chargé depuis `workouts.total_volume_kg` → `workouts`

## Chargement dans addExercise
- `pr_top3_charge` : top-3 poids distincts
- `pr_top3_serie` : top-3 valeurs (poids × reps) distinctes
- `pr_top3_exercice` : top-3 volumes d'exercice par séance (groupés par workout_id en JS)

## Armurerie (prs.tsx)
Podium pr_charge (poids) par exercice. 1 card par exercice.

## Auth storage
expo-secure-store — adaptateur custom chunks 1800 bytes (JWT > 2048b).
