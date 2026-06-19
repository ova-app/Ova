# 9 — Glossaire

Tous les termes du projet, dans l'ordre alphabétique. À garder ouvert quand tu lis le code.

---

## Termes produit (Orava)

| Terme | Définition |
|---|---|
| **ADN Athlétique** | Carte unique par user (Phase 3), 6 dimensions long-terme. Visible après 20 séances. |
| **Armurerie** | L'écran `prs.tsx` : tes records par exercice, façon podium. |
| **Famille (Myo)** | Un des 8 groupes de dimensions de la Myo (Volume, Intensité, …). |
| **Ghost / Mode Fantôme** | Ta meilleure perf passée affichée pendant que tu logges. Source SQLite locale. |
| **Hero** | L'élément principal d'un écran (règle 1-3-9), ou la plus grande taille de typo (56px). |
| **Myo** | La signature de séance : 53 dimensions / 8 familles, montrée en orbe 3D + charts 2D. |
| **Orbe** | La visualisation 3D de la Myo (`myo-orb.tsx`), relief polaire à 8 secteurs. |
| **Podium** | Le niveau d'un PR : `gold` / `silver` / `bronze` / `null`. |
| **PR** | *Personal Record*. 4 types : charge, série, exercice, séance. |
| **Prédictif (Moteur)** | `lib/predictor.ts` : prédit ton prochain PR par régression, sur le téléphone. |
| **Reveal** | La révélation scénarisée (ex. la Myo à ~800ms) — « rien de précieux n'arrive tout de suite ». |
| **Streak** | Le nombre de semaines consécutives d'entraînement. |
| **v1 / v4** | v1 = ancienne version dont on garde la logique. v4 = reconstruction visuelle actuelle. |

---

## Termes musculation

| Terme | Définition |
|---|---|
| **1RM** | *One-Rep Max* : le poids max théorique sur 1 répétition. Estimé via la formule d'Epley. |
| **Activation (%)** | À quel point un exercice sollicite un muscle (table `exercise_muscles`, échelle 0-100). |
| **Dropset** | Une série où on baisse le poids pour continuer après l'échec. |
| **Faisceau (fascicle)** | Une sous-partie d'un muscle (ex. le deltoïde a 3 faisceaux : antérieur, médian, postérieur). |
| **Reps** | Répétitions (nombre de mouvements dans une série). |
| **RPE** | *Rate of Perceived Exertion* : effort ressenti, échelle ~6→10. |
| **Set / Série** | Un ensemble de répétitions enchaînées. |
| **Volume** | `poids × reps`, sommé. La mesure de quantité de travail. |
| **Warmup** | Série d'échauffement. **Exclue** des calculs Myo (activation calibrée pour les working sets). |
| **Working set** | Une série « réelle » (par opposition à l'échauffement). |

---

## Termes techniques

| Terme | Définition |
|---|---|
| **AsyncStorage** | Stockage clé-valeur persistant de React Native (utilisé par `lib/storage.ts`). |
| **best-effort** | Une opération qui peut échouer sans casser le reste (ex. upload photo au save). |
| **CI** | *Continuous Integration* : GitHub rejoue lint + types + tests sur chaque PR. |
| **Context (React)** | Mécanisme pour partager une donnée à tout un arbre de composants (ex. `WorkoutContext`). |
| **CTA** | *Call To Action* : le bouton d'action principal d'un écran. |
| **Dependabot** | Bot GitHub qui ouvre des PR pour mettre à jour les dépendances. |
| **EAS** | *Expo Application Services* : build les vraies apps iOS/Android dans le cloud. |
| **Expo** | Plateforme par-dessus React Native qui simplifie le dev mobile. |
| **Expo Go** | App mobile qui charge ton code via QR code (dev rapide). |
| **Expo Router** | Navigation basée sur les fichiers (`app/` = les routes). |
| **Hook (React)** | Fonction `use…` qui ajoute un comportement à un composant (état, effet, données…). |
| **Husky** | Lance les garde-fous (lint + types + tests) à chaque `git commit`. |
| **Idempotent** | Une opération qu'on peut relancer sans effet en double (ex. la RPC `create_workout`). |
| **Migration** | Un script SQL qui modifie le schéma de la base. À documenter avant de coder. |
| **MMKV** | Stockage clé-valeur natif très rapide. Installé mais pas encore branché. |
| **Mock** | Une fausse version d'une dépendance utilisée dans les tests (ex. Supabase mocké). |
| **PostHog** | Outil d'analytics produit (région EU). |
| **Provider** | Composant qui fournit une donnée de Context à ses enfants (`WorkoutProvider`…). |
| **RLS** | *Row Level Security* : règles SQL Supabase qui isolent les données par utilisateur. |
| **RPC** | *Remote Procedure Call* : une fonction SQL Supabase appelée depuis l'app. |
| **Reanimated** | Bibliothèque d'animations 60 FPS (thread UI). |
| **Skia** | Moteur de dessin 2D (charts Myo, ADN). |
| **Skeleton screen** | Un écran « squelette » affiché pendant un chargement (à la place d'un spinner). |
| **Spring** | Animation à ressort (physique) — le standard Orava, jamais de linéaire. |
| **SQLite** | Base de données locale sur le téléphone (`lib/db.ts`). |
| **Supabase** | Le backend : PostgreSQL + Auth + RLS + RPC. |
| **tabular-nums** | Variante de police où chaque chiffre a la même largeur (chiffres qui ne sautent pas). |
| **Three.js** | Bibliothèque 3D (l'orbe Myo via expo-gl). |
| **Token (design)** | Une valeur du design system (couleur, espacement…) dans `theme.ts`. |
| **Token (auth)** | Le JWT d'authentification, stocké chiffré dans expo-secure-store. |
| **Worklet** | Une fonction Reanimated qui tourne sur le thread UI (décorée `'worklet'`). |

---

## Conventions de nommage

| Convention | Exemple | Où |
|---|---|---|
| **kebab-case** | `wheel-picker-modal.tsx` | noms de fichiers |
| **PascalCase** | `WorkoutContext`, `RulerPicker` | composants, types |
| **camelCase** | `computePodium`, `getGhostReference` | fonctions, variables |
| **snake_case** | `grand_pectoral`, `faisceau_sternal`, `weight_kg` | colonnes DB & vocabulaire muscles (français) |

> ℹ️ L'interface est en **français**, mais on garde les **anglicismes du fitness**
> (Sets, Reps, PR, Timer, Streak, Ghost) — ils font partie du langage du milieu.

---

⬅️ Retour à l'[index](./README.md).
