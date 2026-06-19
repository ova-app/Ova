# 4 — Architecture du code

Comment le code est organisé, comment l'app démarre, et comment on navigue entre
les écrans. Tout est dans `mobile_app/`.

> Référence complète de l'arborescence : [`.claude/rules/files.md`](../.claude/rules/files.md).

---

## Vue d'ensemble des dossiers

```
mobile_app/
├── app/            ← TOUS les écrans (1 fichier = 1 écran, voir « navigation »)
├── context/        ← état global partagé (séance en cours, thème)
├── lib/            ← la logique « pure » non-visuelle (DB, Myo, prédiction…)
├── constants/      ← le design system (theme.ts) + recettes Figma
├── components/     ← composants réutilisables purs (quasi vide — voir règle)
├── types/          ← VIDE volontairement (les types sont inline)
├── __tests__/      ← les tests Jest (logique pure)
└── assets/         ← images, polices, sons, icônes
```

### La séparation mentale à retenir

- **`app/`** = ce que l'utilisateur **voit** (les écrans, l'UI).
- **`context/`** = l'**état vivant** partagé entre écrans (ex. : la séance en cours).
- **`lib/`** = la **logique métier** qui ne dépend pas de l'affichage (calculs, accès
  aux bases). C'est ici qu'on teste.
- **`constants/theme.ts`** = la **seule** source des couleurs/tailles/animations.

> 📏 **Règle stricte** : `components/` est réservé aux composants **réutilisables et purs**
> (pas de hooks, pas de Context). Aujourd'hui il ne contient que `RulerPicker.tsx`.
> L'UI vit **inline dans les écrans**, pas découpée en mille petits composants. Ne crée
> pas de composant partagé sans raison forte.

---

## La navigation : « file-based routing »

Avec **Expo Router**, **l'arborescence de `app/` EST la navigation**. Pas de fichier de
routes à maintenir : tu crées un fichier, il devient un écran.

```
app/
├── _layout.tsx          → l'enveloppe racine (providers, voir plus bas)
├── index.tsx            → écran d'accueil (route « / ») : splash → redirige vers login
├── auth/
│   ├── login.tsx        → route « /auth/login »
│   └── register.tsx     → route « /auth/register »
├── (tabs)/              → les parenthèses = un GROUPE (n'apparaît pas dans l'URL)
│   ├── _layout.tsx      → définit la barre d'onglets (3 onglets)
│   ├── feed.tsx         → onglet 1 : le fil social
│   ├── library.tsx      → onglet 2 : la bibliothèque d'exercices
│   ├── start.tsx        → le bouton central (+) → démarre une séance
│   ├── history.tsx      → l'historique des séances
│   └── profile.tsx      → le profil
├── workout/
│   ├── session.tsx      → l'écran de séance active (logger les séries)
│   ├── timer.tsx        → le timer de repos
│   ├── summary.tsx      → le résumé + sauvegarde de la séance
│   ├── wheel-picker-modal.tsx → la modale de saisie (poids/reps/RPE)
│   ├── myo-orb.tsx      → l'orbe 3D Myo
│   └── myo-chart.tsx    → les charts Myo 2D
├── feed/[id].tsx        → détail d'une activité ([id] = paramètre dynamique)
├── history/[id].tsx     → détail d'une séance
├── exercise/[id].tsx    → fiche d'un exercice
├── analytics.tsx        → stats détaillées + prédictions
├── prs.tsx              → « l'Armurerie » : tes records par exercice
├── edit-profile.tsx     → édition du profil
├── settings.tsx         → réglages (kg/lbs, vibration, visibilité…)
├── myo-glossary.tsx     → glossaire des 8 familles Myo
└── chat.tsx             → placeholder chatbot (Phase 2)
```

Conventions à connaître :
- **`_layout.tsx`** : une enveloppe partagée par tous les écrans d'un dossier.
- **`(parenthèses)`** : un **groupe de routes** — sert à appliquer un layout commun
  (ex. la tab bar) **sans** ajouter de segment dans l'URL.
- **`[id].tsx`** : une **route dynamique** — `id` est lu dans l'écran via `useLocalSearchParams()`.

---

## Le démarrage de l'app (`app/_layout.tsx`)

C'est **le point d'entrée**. Quand l'app se lance, ce fichier :

1. **Empêche le splash de disparaître** (`preventAutoHideAsync`) tant que tout n'est pas prêt.
2. **Charge les polices** (Barlow, JetBrains Mono…).
3. **Initialise les données locales** (avant tout le reste) :
   - `hydrateStorage()` → recharge le cache (brouillon de séance…) depuis le disque,
   - `initDB()` → crée les tables SQLite locales si absentes,
   - `backfillLocalFromSupabase()` → réamorce SQLite depuis Supabase s'il est vide (non bloquant).
4. **Cache le splash** une fois polices + données prêtes.
5. **Monte les fournisseurs (« providers »)**, du plus externe au plus interne :

```
<ErrorBoundary>            ← attrape les crashs de rendu → écran de repli (pas d'écran blanc)
  <PostHogProvider>        ← analytics (capture les écrans visités)
    <GestureHandlerRootView>  ← gestes tactiles
      <ThemeProvider>      ← couleurs dark/light
        <WorkoutProvider>  ← l'état de la séance en cours
          <Stack>          ← la pile de navigation Expo Router
```

> 💡 Un **« provider »** est un composant qui rend une donnée disponible à tous ses
> enfants via le **Context** React. Concrètement : n'importe quel écran peut lire la
> séance en cours sans qu'on lui passe l'info de parent en parent.

---

## L'état global (`context/`)

### `WorkoutContext.tsx` — le cerveau de la séance
C'est **la pièce la plus importante** du code. Une **machine d'état** qui gère toute
une séance de musculation en mémoire :

- **`status`** : `idle` (rien) → `active` (séance en cours) → `done` (terminée).
- **`exercises`** : la liste des exercices avec leurs séries.
- **`elapsedSeconds`**, **`currentIndex`**, `startedAt`…
- des actions : `startWorkout`, `addExercise`, `validateSet`, `removeExercise`, `finishWorkout`…
- la **détection de PR en temps réel** : quand tu valides une série, ça calcule
  immédiatement si c'est un record (via `computePodium`).
- un **snapshot** sauvegardé en local à chaque mutation → si l'app crashe en pleine
  séance, rien n'est perdu.

> ⚠️ On **garde la logique de ce fichier telle quelle** (héritée du v1, éprouvée). On
> réinvente l'UI autour, pas le moteur. Pareil pour `lib/myo.ts`.

### `ThemeContext.tsx`
Gère le mode sombre/clair et le persiste. (En pratique l'app est dark-only Phases 0-2,
mais l'infra light existe — ne pas la supprimer.)

---

## La logique métier (`lib/`)

| Fichier | Rôle |
|---|---|
| `supabase.ts` | le **client Supabase** (auth + requêtes). Ne pas modifier sans raison. |
| `myo.ts` | le **calcul de la signature Myo** (53 dims) + `saveMyoSignature()` |
| `db.ts` | **SQLite local** : `initDB()`, insertion de séries/séances, lectures Fantôme/PR |
| `storage.ts` | cache clé-valeur (brouillon de séance, réglages) |
| `ghost.ts` | **Mode Fantôme** : `getGhostReference()` lit le meilleur set passé (SQLite) |
| `predictor.ts` | **Moteur Prédictif** : régression linéaire sur le téléphone |
| `analytics.ts` | PostHog + la liste des événements |
| `utils.ts`, `weights.ts`, `muscles.ts` | helpers (formatage, granulométrie poids, muscles) |
| `hooks/` | des **hooks de données** par écran (`useFeedData`, `useHistoryData`…) qui isolent les requêtes Supabase de l'UI |

> 🧪 Tout ce qui est dans `lib/` (logique pure) est **testable** et **testé** dans
> `__tests__/`. C'est la règle : on teste la logique, pas l'affichage.

---

## Le fil conducteur d'une séance (pour relier tout ça)

```
1. (tabs)/start.tsx       → l'utilisateur tape le bouton (+)
2. WorkoutContext         → startWorkout() : status = 'active'
3. workout/session.tsx    → il ajoute des exercices, logge des séries
        │ chaque série validée → validateSet() → détection PR + snapshot local
4. workout/timer.tsx      → repos entre les séries
5. workout/summary.tsx    → il termine : nom auto, photo, public/privé
        │ save → RPC Supabase create_workout (transactionnel)
        │ puis SQLite local, métriques, signature Myo (tout best-effort, non bloquant)
6. workout/myo-orb.tsx    → la Myo se révèle : la récompense
```

Le **« zéro réseau pendant la séance »** est central : étapes 1→4 = 100 % en mémoire +
local. Le réseau (Supabase) n'arrive **qu'à l'étape 5**, après le save. Détaillé dans
[06-donnees.md](./06-donnees.md).

➡️ Suite : [05-concepts-metier.md](./05-concepts-metier.md) — Myo, PR, Fantôme, Prédictif.
