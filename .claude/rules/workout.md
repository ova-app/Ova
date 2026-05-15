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

## WorkoutContext (`context/WorkoutContext.tsx`)
- `status` : idle | active | done
- `startedAt`, `exercises`, `currentIndex`, `elapsedSeconds`
- PR : `pr_charge`/`pr_serie` = `PrLevel` (text null|gold|silver|bronze)
- 3 top-3 chargés par `addExercise` : `pr_top3_charge`, `pr_top3_serie`, `pr_top3_exercice`
- `computePodium(value, top3)` exporté — utilisé dans `summary.tsx`
- `rest_seconds` : delta ms depuis dernier set validé (global workout)
- **[Phase 0]** Ajouter snapshot MMKV à chaque mutation → crash-safe

## Calcul au save (summary.tsx)
- `pr_exercice` : `computePodium(Σ poids×reps des sets, ex.pr_top3_exercice)` → `workout_exercises`
- `pr_seance` : `computePodium(volume total séance, seanceTop3)` — top-3 depuis `workouts.total_volume_kg` → `workouts`
- Après save Supabase : insérer dans SQLite local (`local_sets`, `local_sessions`)

## Chargement dans addExercise
- `pr_top3_charge` : top-3 poids distincts
- `pr_top3_serie` : top-3 valeurs (poids × reps) distinctes
- `pr_top3_exercice` : top-3 volumes d'exercice par séance (groupés par workout_id en JS)

## Armurerie (prs.tsx)
Podium pr_charge (poids) par exercice. 1 card par exercice.

---

## Mode Fantôme v1.0 (`app/workout/ghost.ts`) — Phase 1

**Règle UX N°7** : le Fantôme ne s'impose jamais. Présence silencieuse, non cliquable pendant la séance.

```typescript
// Signature attendue
async function getGhostReference(
  exerciseId: string,
  limitDays: number  // Free=30, Pro=illimité (passer 99999)
): Promise<GhostSet | null>

interface GhostSet {
  weight_kg: number
  reps: number
  volume: number
  session_date: number  // UNIX ms
}
```

Source de données : SQLite `local_sets` uniquement — zéro Supabase.
Requête : meilleur set (max volume, puis max weight à volume égal) pour cet exercice dans la fenêtre.

**Intégration dans session.tsx :**
- Barre fantôme translucide sur WheelPicker (Reanimated, opacity 0.35)
- Indicateur `↑ +X kg vs meilleure` discret sous les pickers
- Animation "fantôme battu" : barre vire gold + `expo-haptics` pulse doux
- Edge cases : 1re séance exercice → ghost = null → pas d'affichage

**Versions :**
- Free : `limitDays = 30`
- Pro : `limitDays = 99999`

---

## Moteur Prédictif v1.0 (`lib/predictor.ts`) — Phase 2

Régression linéaire pondérée on-device. Données SQLite uniquement.

```typescript
interface Prediction {
  exerciseId: string
  exerciseName: string
  predictedPR: number        // poids en kg
  daysUntilPR: number
  confidence: number         // 0-1, afficher si >= 0.6
  delta: number              // kg au-dessus du record actuel
}

function computePrediction(exerciseId: string): Prediction | null
```

**Algorithme :**
1. Récupérer les 90 derniers jours de `local_sets` pour cet exercice
2. Pondérer : séances récentes × 1.0, séances à 90j × 0.3 (décroissance linéaire)
3. Régression sur `(logged_at, weight_kg)` → pente + intercept
4. Extrapoler jusqu'à dépasser le max actuel → `daysUntilPR`
5. Variables contextuelles : volume 7j (fatigue), fréquence récente
6. Seuil d'affichage : confiance < 60 % → retourner null

**Affichage :**
- Card "Prédiction active" sur analytics.tsx ou dashboard
- Notification push via expo-notifications : `"PR prédit dans N jours · confiance X %"`
- Calcul en arrière-plan post-save (non bloquant)

**Règle UX N°8** : afficher l'intervalle d'incertitude — jamais de fausse précision.

---

## Myo 3D (myo-orb.tsx) — v1 opérationnel, v2 Phase 2

Signature multi-dimensionnelle en z-score (41 dims, 8 familles). Visualisation Three.js + expo-gl.

### Architecture
- **GLView** (expo-gl) → Three.js WebGLRenderer avec canvas proxy (voir rules/stack.md)
- **Géométrie** : `IcosahedronGeometry(1.0, 6)` déformée par champ metaball des 8 familles
- **Matériau** : `MeshPhongMaterial` matte white ceramic `#f0ece7`, shininess 12
- **Lumières** : AmbientLight(0xffffff, 0.28) + key (0xfff6ee, 2.4) + fill (0xdde6ff, 0.52) + rim (0xffffff, 1.0) + ground (0xffe8d8, 0.16)
- **Overlay React Native** : labels familles via `THREE.Vector3.project(camera)` + panel détail

### buildBlobGeometry — formule vertex
```
for each vertex (nx,ny,nz normalized):
  field = Σ families: t×0.55 / (d2 + 0.045)   où t=(famZ+3)/6, d2=dist² vers attractor
  scale = 1.0 + min(0.48, field×0.068)
  vertex = (nx,ny,nz) × scale
```
Attractor position famille : `(sin(phi)cos(theta), -cos(phi), sin(phi)sin(theta))`

### 8 familles — GROUPS
volume · intensite · structure · recuperation · performance · regularite · muscles · temps

### Auto-rotation
RAF 30fps (`now - last >= 33ms`), `ryRef += 0.003`. Stop si `isInteract.current = true`.

### Score (header)
Arc SVG 240°. Couleur : ≥66→`#FAC775` / ≥33→`#D85A30` / <33→`#8E8E93`.

### Pipeline données
`myo_signatures` → fetch par `workout_id` → `FamilyNode[]` avec `famZ` → `nodesRef.current` → `buildBlobGeometry`

### Myo v2 (Phase 2) — export Stories 9:16
Capture frame WebGL → PNG partageable via Share Sheet iOS/Android.

---

## ADN Athlétique (`app/athletic-dna.tsx`) — Phase 3

6 dimensions calculées par Edge Function Supabase (hebdomadaire) → table `athletic_dna`.
Visualisation Skia : carte unique par utilisateur, formes géométriques déterministes.

| Dimension | Donnée source |
|---|---|
| Profil de force | Ratios max lifts + percentiles |
| Signature volume | Radar 8 groupes musculaires (workout_metrics) |
| Style progression | Linéaire / ondulant / par blocs (SQLite local) |
| Régularité | Fréquence + variance + streak semaines |
| Vitesse récupération | Deltas avant/après semaines de repos |
| Empreinte temporelle | Heures/jours préférés, circadien |

Seuil d'affichage : **20 séances minimum** → avant : message "ADN en construction".
Free : 2 dimensions visibles, 4 floutées. Pro : ADN complet.

## Auth storage
expo-secure-store — adaptateur custom chunks 1800 bytes (JWT > 2048b).
