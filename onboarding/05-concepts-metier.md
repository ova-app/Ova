# 5 — Les concepts métier d'Orava

Les idées propres à l'app. C'est ce qui fait Orava plutôt qu'un énième tracker.
Comprends-les **avant** de coder une feature qui les touche.

> Références détaillées : [`.claude/rules/workout.md`](../.claude/rules/workout.md) (PR,
> Fantôme, Prédictif) et [`.claude/rules/myo.md`](../.claude/rules/myo.md) (les 53 dims).

---

## 🏆 Le système de PR (Personal Records)

Un **PR** = un record personnel. Orava en suit **4 types** à des échelles différentes :

| Type | Échelle | Définition | Stocké dans |
|---|---|---|---|
| **pr_charge** | une série | le poids le plus lourd jamais soulevé sur cet exo | `workout_sets` |
| **pr_serie** | une série | le meilleur `poids × reps` sur une série | `workout_sets` |
| **pr_exercice** | un exercice dans une séance | le volume total de l'exo vs ton historique | `workout_exercises` |
| **pr_seance** | une séance entière | le volume total de la séance vs ton historique | `workouts` |

### Le podium 🥇🥈🥉
Chaque PR n'est pas binaire : c'est un **podium à 3 niveaux**.

- `gold` = nouveau **record absolu**
- `silver` = 2ᵉ meilleure perf de l'histoire
- `bronze` = 3ᵉ
- `null` = pas un PR

### Comment c'est calculé : `computePodium`
La fonction clé (dans `context/WorkoutContext.tsx`) :

```typescript
computePodium(value, top3)
// top3 = { pr1, pr2, pr3 } = tes 3 meilleures perfs historiques
// renvoie 'gold' | 'silver' | 'bronze' | null
```

⚠️ **Subtilité importante** : les comparaisons sont **strictes** (`>`). **Égaler** ton
record ne donne PAS l'or — il faut le **dépasser**. Égaler `pr1` peut donner « silver »
(si `pr2` existe). C'est un comportement **voulu**, documenté, à ne pas « corriger » par erreur.

### Quand ça se déclenche
- **Pendant la séance** (temps réel) : `pr_charge` et `pr_serie` sont calculés dès que
  tu valides une série → flash visuel + vibration (l'or = vibration de succès).
- **Au save** (`summary.tsx`) : `pr_exercice` et `pr_seance` sont calculés sur les totaux.

L'**Armurerie** (`app/prs.tsx`) affiche tes records par exercice façon podium.

---

## 🧬 La Myo — la signature de séance

C'est **l'identité visuelle d'Orava**. À la fin d'une séance, on résume tout ce que tu as
fait en **53 dimensions**, regroupées en **8 familles**. Chaque dimension est un score
normalisé entre 0 et 1 (affiché 0→100).

### Les 8 familles

| # | Famille | Couleur | Ce qu'elle mesure | Nb dims |
|---|---|---|---|---|
| 0 | **VOLUME** | `#f97316` orange | quantité de travail (Σ poids × reps, densité…) | 6 |
| 1 | **INTENSITÉ** | `#ef4444` rouge | effort relatif (RPE, % du 1RM…) | 5 |
| 2 | **STRUCTURE** | `#8b5cf6` violet | organisation de la séance (variété, enchaînement…) | 5 |
| 3 | **RÉCUP** | `#06b6d4` cyan | qualité de récup intra-séance (repos…) | 5 |
| 4 | **PERF** | `#fac775` or | réalisations (nb de PR, force relative…) | 5 |
| 5 | **RÉGULARITÉ** | `#22c55e` vert | discipline sur la durée (fréquence, streak…) | 5 |
| 6 | **MUSCLES** | `#ec4899` rose | volume par muscle/faisceau | **17** |
| 7 | **TEMPS** | `#3b82f6` bleu | gestion du temps (durée, tempo, créneau…) | 5 |

> 6 + 5 + 5 + 5 + 5 + 5 + 17 + 5 = **53 dimensions**.

### La famille 6 (Muscles) — la plus dense
17 dimensions = un muscle/faisceau chacun (pec claviculaire, deltoïde antérieur, biceps,
quadriceps, core…). La formule par dimension :

```
volume_muscle = Σ_séries ( poids × reps × activation_pct / 100 )
```

Le `activation_pct` vient de la table `exercise_muscles` (à quel point un exercice
sollicite chaque muscle). On inclut les rôles `primary` + `secondary`, on **exclut** les
`stabilizer` et les séries d'échauffement (`warmup`).

### Deux visualisations
- **L'orbe 3D** (`app/workout/myo-orb.tsx`) : un relief polaire, 8 secteurs (un par
  famille), qu'on fait tourner et où on tape pour explorer chaque famille. C'est du
  Three.js + expo-gl, plein de subtilités (voir [`.claude/rules/workout.md`](../.claude/rules/workout.md)).
- **Les charts 2D** (`app/workout/myo-chart.tsx`) : en Skia, un sélecteur de famille +
  radar/barres. Plus lisible, utilisé dans le détail d'activité du feed.

### ⚠️ État actuel : données mockées
Le câblage **données réelles → orbe** n'est pas encore fait : l'orbe affiche un
`MOCK_SESSION`. La logique de calcul (`lib/myo.ts`, `saveMyoSignature`) existe et
écrit dans Supabase, mais le branchement visuel reste à finir (Phase 1/2).

### La règle UX : la Myo est une RÉCOMPENSE
Elle n'apparaît **jamais pendant la séance**, seulement à la fin (révélation à ~800 ms).
« Rien de précieux n'arrive immédiatement. »

---

## 👻 Le Mode Fantôme (`lib/ghost.ts`)

Pendant que tu logges un exercice, l'app affiche discrètement ta **meilleure performance
passée** sur ce même exercice — « le fantôme ». Tu te bats contre ton ancien toi.

```typescript
getGhostReference(exerciseId, limitDays)
// cherche dans SQLite local le MEILLEUR set (max volume, puis max poids)
// sur la fenêtre de temps donnée. Renvoie null si 1re fois sur l'exo.
```

- **Source = SQLite local uniquement.** Zéro Supabase (cohérent avec « zéro réseau en séance »).
- **Free** : fenêtre de 30 jours. **Pro** : illimité (`limitDays = 99999`).
- **UX** : barre translucide (opacité 0.35) sur le WheelPicker, indicateur discret
  `↑ +X kg vs meilleure`. Si tu bats le fantôme → la barre vire or + double pulse haptique.
- **Règle d'or** : le Fantôme est une **présence, pas une interruption**. Silencieux,
  non cliquable pendant la séance.

---

## 🔮 Le Moteur Prédictif (`lib/predictor.ts`)

À partir de ton historique local, l'app prédit ton prochain record :

```typescript
computePrediction(exerciseId): Prediction | null
// { predictedPR, daysUntilPR, confidence, delta }
```

Comment ça marche (vulgarisé) :
1. Récupère les **90 derniers jours** de séries (SQLite) pour cet exercice.
2. **Pondère** les séances : récentes = poids fort, anciennes = poids faible (décroissance).
3. Fait une **régression linéaire** sur `(date, poids)` → une tendance.
4. **Extrapole** jusqu'à dépasser ton record actuel → « dans N jours ».
5. Si la **confiance < 60 %** → renvoie `null` (on ne montre pas une fausse prédiction).

- **100 % sur le téléphone**, en arrière-plan après le save (non bloquant).
- **Règle UX** : afficher l'incertitude, **jamais de fausse précision**.

---

## 🧬 L'ADN Athlétique (Phase 3 — pas encore codé)

Une **carte unique par utilisateur** (générée en Skia, déterministe à partir du userId),
résumant 6 dimensions long-terme : profil de force, signature de volume, style de
progression, régularité, vitesse de récup, empreinte temporelle. Visible après **20 séances**.
Free = 2 dimensions, Pro = complet. C'est un objectif futur, mentionné pour contexte.

---

## En résumé : pourquoi ces concepts comptent

Toutes ces features partagent **la même philosophie** : l'app **observe et révèle**,
elle n'impose rien. Elle utilise **tes propres données** (local d'abord) pour te
renvoyer une image de toi plus riche que ce que tu pourrais calculer seul. Garde ce fil
rouge quand tu touches à ces parties.

➡️ Suite : [06-donnees.md](./06-donnees.md) — où vivent réellement les données.
