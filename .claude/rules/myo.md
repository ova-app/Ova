# rules/myo.md

## Myo — 53 dimensions, 8 familles

Source réelle : `myo_signatures.raw_*` → normalisé [0,1] via `baseline_*` (mean/std) → prop `sessionValues` depuis `summary.tsx`.
**Actuellement : mock data (`MOCK_SESSION` dans `myo-orb.tsx`) — câblage réel non fait.**

Scores affichés 0→100 = `Math.round(val × 100)` où `val ∈ [0,1]`.

---

## Famille 0 — VOLUME `#f97316` (6 dims)
Quantité de travail produite dans la séance.

| Dim | Nom | Source |
|---|---|---|
| 0 | Vol. total | Σ (poids × reps) tous sets |
| 1 | Vol. sets | Nombre total de sets effectués |
| 2 | Vol./rep | Vol. total / Σ reps |
| 3 | Vol./set | Vol. total / nb sets |
| 4 | Tendance | Δ volume vs séances précédentes (rolling) |
| 5 | Densité | Vol. total / durée_sec |

z-score Supabase : `myo_signatures.z_volume`

---

## Famille 1 — CHARGE `#ef4444` (3 dims réelles + 2 à câbler)
Lourdeur et densité du travail — **charge réelle soulevée, pas l'effort perçu**.
⚠️ Renommée « INTENSITÉ » → « CHARGE » (ORA-087) : le RPE n'est jamais persisté
(colonne `workout_sets.rpe` existe mais le client le jette avant le save — picker → state → RPC).
La colonne DB reste `myo_signatures.z_intensite` (pas de migration) ; `z_intensite = z(densité)`.

| Dim | Nom | Source |
|---|---|---|
| 0 | Densité | Volume (poids × reps) / durée séance (= `z_intensite`) |
| 1 | Charge rel. | Poids utilisé / 1RM Epley estimé (% du max) |
| 2 | — | placeholder `0` (à câbler — ORA-088) |
| 3 | Poids max | Charge absolue la plus lourde de la séance |
| 4 | — | placeholder `0` (à câbler — ORA-088) |

> Pour faire de cette famille une vraie mesure d'effort perçu (RPE) : ORA-087 option B (migration RPC `create_workout` + `WorkoutSet.rpe`).

z-score Supabase : `myo_signatures.z_intensite`

---

## Famille 2 — STRUCTURE `#8b5cf6` (5 dims)
Organisation logique de la séance.

| Dim | Nom | Source |
|---|---|---|
| 0 | Nb exercices | COUNT DISTINCT `exercise_id` |
| 1 | Sets/exercice | nb sets / nb exercices |
| 2 | Variété | Diversité des groupes musculaires ciblés |
| 3 | Score struct. | Cohérence enchaînement (push/pull/legs) |
| 4 | Rég. repos | 1 − (σ rest_seconds / μ rest_seconds) |

z-score Supabase : `myo_signatures.z_structure`

---

## Famille 3 — RÉCUP `#06b6d4` (5 dims)
Qualité de la récupération intra-séance.

| Dim | Nom | Source |
|---|---|---|
| 0 | Repos moy. | `workouts.avg_rest_seconds` |
| 1 | Var. repos | σ `workout_sets.rest_seconds` |
| 2 | Complétion | % sets complétés sans abandon |
| 3 | Qualité repos | Adéquation repos / intensité du set précédent |
| 4 | Récup. est. | `workout_metrics.data.score_recuperation_estime` (0-100) |

z-score Supabase : `myo_signatures.z_recovery`

---

## Famille 4 — PERF `#fac775` (5 dims)
Réalisations de performance dans la séance.

| Dim | Nom | Source |
|---|---|---|
| 0 | Nb PRs | COUNT `workout_sets.is_pr = true` |
| 1 | Amp. PRs | Δ% moyen record précédent → nouveau record |
| 2 | Force rel. | Poids max / `workouts.poids_corps_kg` |
| 3 | Prog. 1RM | Δ 1RM Epley vs séance précédente même exercice |
| 4 | Constance perf. | Stabilité des performances entre les sets d'un même exercice |

z-score Supabase : `myo_signatures.z_performance`

---

## Famille 5 — RÉGULARITÉ `#22c55e` (5 dims)
Discipline d'entraînement sur la durée (contexte multi-séances).

| Dim | Nom | Source |
|---|---|---|
| 0 | Fréquence | Séances / semaine rolling 4 semaines |
| 1 | Streak | `workout_metrics.data.streak_semaines` |
| 2 | Var. séances | σ volume séance à séance (rolling) |
| 3 | Planning | Régularité créneaux horaires / jours de la semaine |
| 4 | Régularité | Score composite des 4 précédentes |

z-score Supabase : `myo_signatures.z_regularite`

---

## Famille 6 — MUSCLES `#ec4899` (17 dims)
Volume d'entraînement par muscle et faisceau durant la séance, normalisé vs population (Phase 0) puis rolling personnel (Phase 1).

**Formule par dim :**
```
vol_dim_i = Σ_sets ( weight_kg × reps × activation_pct / 100 )
```
Rôles inclus : `primary` + `secondary`. `stabilizer` exclu.
Source : `exercise_muscles.muscle` + `exercise_muscles.fascicle` (snake_case français).
Stockage : `myo_signatures.z_extended.muscles` (array[17]) + `z_extended.muscles_raw` (array[17] volumes bruts).

---

| Dim | Nom | `exercise_muscles.muscle` | `exercise_muscles.fascicle` |
|---|---|---|---|
| 0 | Pec claviculaire | `grand_pectoral` | `faisceau_claviculaire` |
| 1 | Pec sternal | `grand_pectoral` | `faisceau_sternal` · `faisceau_abdominal` |
| 2 | Deltoïde ant. | `deltoide` | `faisceau_anterieur` |
| 3 | Deltoïde médial | `deltoide` | `faisceau_median` |
| 4 | Deltoïde post. | `deltoide` | `faisceau_posterieur` |
| 5 | Grand dorsal | `grand_dorsal` | toutes |
| 6 | Trapèze | `trapeze` | toutes |
| 7 | Grand rond | `grand_rond` | toutes |
| 8 | Rhomboïdes | `rhomboide` | toutes |
| 9 | Érecteurs rachis | `erecteurs_rachis` | toutes |
| 10 | Biceps | `biceps` | toutes |
| 11 | Triceps | `triceps` | toutes |
| 12 | Quadriceps | `quadriceps` | toutes |
| 13 | Ischio-jambiers | `ischio_jambiers` | toutes |
| 14 | Fessiers | `fessier_maximus` · `fessier_median` · `fessier_minimus` | toutes |
| 15 | Mollets | `mollets` | toutes |
| 16 | Core | `abdominaux` | toutes |

> Règle dims 0-4 : `fascicle = NULL` → set ignoré (pas de fallback).
> Muscles non mappés (adducteurs, avant_bras, brachial, serratus, etc.) → contribution 0, invisible dans l'orbe.

---

### Implémentation `myo.ts` — état actuel (Phase 0)

Constantes statiques dans `myo.ts` : `FASCICLE_DIM`, `MUSCLE_DIM`, `MUSCLE_POP_MEAN`, `MUSCLE_POP_STD`.
La fonction `computeMuscleDims(setsByExercise, emRows)` accumule les volumes par dim.
`saveMyoSignature` query `exercise_muscles` + stocke dans `z_extended.muscles` + `z_extended.muscles_raw`.

Nouveau champ `SaveMyoParams.setsByExercise` : `Record<exerciseId, Array<{weight_kg, reps}>>` — passé depuis `summary.tsx`.

**Phase 1** : remplacer `MUSCLE_POP_MEAN/STD` par rolling personnel depuis `myo_signatures.z_extended.muscles_raw`.

### Impact myo-orb.tsx

- `DimConfig` IIFE : 41 → 53 entrées totales.
- Secteur 6 = 17 dims sur 45° d'arc → sigma ~3.4× plus serré que les familles à 5 dims → **crête dense** caractéristique.
- `MOCK_SESSION[6]` : array de 17 valeurs `[0,1]`.

---

## Famille 7 — TEMPS `#3b82f6` (5 dims)
Gestion du temps et efficacité de la séance.

| Dim | Nom | Source |
|---|---|---|
| 0 | Durée | `workouts.duration_sec` |
| 1 | Tempo | Cadence d'enchaînement — durée / nb transitions |
| 2 | Densité | Temps actif (sets) / durée totale |
| 3 | Efficacité | Vol. total / duration_sec (kg·reps par seconde) |
| 4 | Timing | Créneau horaire vs profil circadien utilisateur (`started_at`) |

z-score Supabase : `myo_signatures.z_extended` (clé `temps`)

---

## Câblage réel (non fait — Phase 1)

```typescript
// summary.tsx — après save Supabase
const sig = await saveMyoSignature(workoutId, workoutData)
// sig.raw_* → normaliser → sessionValues[8][5-6] (famille 6 = 17 dims)
// passer en prop à <MyoOrb sessionValues={sessionValues} />
```

Ordre des familles dans `sessionValues` : index = numéro famille ci-dessus (0→VOLUME … 7→TEMPS).
`averageValues` : même structure, moyenne rolling des N dernières séances (depuis `myo_signatures`).
