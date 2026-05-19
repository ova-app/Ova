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

## Myo 3D (myo-orb.tsx) — v1 opérationnel avec interaction, v2 Phase 2

Topographie polaire data-driven. 41 dims → 8 familles × sous-variables → relief 3D interactif. Three.js + expo-gl.

### Architecture
- **GLView** (expo-gl) → Three.js WebGLRenderer avec canvas proxy (voir rules/stack.md)
- **Géométrie** : `LineSegments` — grille polaire N_RINGS(42) × N_SEGS(140) + N_SPOKES(26) rayons
- **Matériau** : `LineBasicMaterial` — `vertexColors: true` (séance) / couleur unie bleu (historique)
- **2 terrains** : séance (dessus, coloré par secteur) + historique (dessous, bleu uni atténué H_BOT)
- **Socle** : 3 anneaux concentriques + ticks radiaux

### getH — formule hauteur en (r, theta)
```
pour chaque DimConfig (41 configs précalculées, séquence nombre d'or) :
  angGauss = exp(-da²/2σ²) × (1 + 0.38×cos(harmN×theta))  // Gaussienne × harmonique
  rad      = (1 - |rn - rPeak| / rWidth)^2.5               // tente pointue
  h       += val × angGauss × rad
h *= maxH × edgeAttenuation   // atténuation bords (pas de normalisation forcée)
```
DimConfig précalculé une fois (IIFE module) — zéro coût runtime.

### 8 familles et couleurs
| # | Famille | Couleur |
|---|---|---|
| 0 | VOLUME | #f97316 |
| 1 | INTENSITÉ | #ef4444 |
| 2 | STRUCTURE | #8b5cf6 |
| 3 | RÉCUP | #06b6d4 |
| 4 | PERF | #fac775 |
| 5 | RÉGULARITÉ | #22c55e |
| 6 | MUSCLES | #ec4899 |
| 7 | TEMPS | #3b82f6 |

### Interaction — règles critiques

**INTERDIT** : `<Html>` de `@react-three/drei` — crash expo-gl. Tout overlay = `View` RN absolue.

**Ordre des couches (z-index)**
1. `GLView` — canvas WebGL
2. `View pointerEvents="none"` — étiquettes flottantes + panneau détail
3. `View` vide avec `{...panResponder.panHandlers}` — capture tous les taps

**Touch → secteur (raycasting JS pur, pas de raycasting sur LineSegments)**
```
raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera)
ray.intersectPlane(Y=0, hit)                         // intersection plan de base
worldAngle = atan2(hit.z, hit.x)
localAngle = (worldAngle + sceneRotY + N×2π) % 2π   // inverse rotation scène
fi         = floor(localAngle / SECTOR_ANG) % 8
dist > MAX_R × 1.15 → désélection + reprise auto-rotation
```

**Étiquettes 3D→2D**
- `useMemo([sessionValues])` : positions 3D = pic de chaque secteur (scan 20×8 = 160 points)
- `setInterval` 67ms (15fps) hors du GL thread :
  1. `tmpW.copy(p).applyEuler(euler)` — rotation scène
  2. `tmpV.copy(tmpW).applyMatrix4(cam.matrixWorldInverse)` — espace caméra
  3. `if (viewPos.z > -0.1) → visible: false` — derrière caméra
  4. `tmpW.project(cam)` → NDC → coordonnées écran
- Vecteurs `tmpW`/`tmpV` alloués **une fois** hors du callback (zéro GC)

**Rotation caméra sur tap**
```
sA           = fi × SECTOR_ANG + SECTOR_ANG/2
targetRotY   = sA - PI/2     // world angle = sA - R = PI/2 quand R = sA - PI/2
// tick : diff = (target - current) normalisé [-PI,PI], scene.rotation.y += diff × 0.05
```

### Auto-rotation
RAF 30fps (`now - last >= 33ms`). `autoRotateRef = true` → `scene.rotation.y += 0.003`.
Sur tap secteur : `autoRotateRef = false`, interpolation vers `targetRotY`.
Sur désélection : `autoRotateRef = true`, rotation libre reprend depuis la position courante.
`sceneRotYRef` mis à jour chaque tick (partagé avec le setInterval des labels).

### Score (header)
Arc SVG 240°. Couleur : ≥66→`#FAC775` / ≥33→`#D85A30` / <33→`#8E8E93`.

### Pipeline données
Props : `sessionValues: number[][]` (8 familles × ~5-6 sous-variables, normalisées [0,1]).
Source réelle : `myo_signatures.raw_*` → normaliser → passer en prop depuis summary.tsx.
Mock fourni jusqu'au câblage des données réelles.

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
