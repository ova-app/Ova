# 3 — La stack expliquée (et pourquoi)

Liste des technos du projet, **avec l'intuition derrière chacune**. Pas besoin de
tout maîtriser pour commencer — reviens ici comme référence.

> La liste exacte des versions est dans [`mobile_app/package.json`](../mobile_app/package.json).
> Les règles d'usage avancées sont dans [`.claude/rules/stack.md`](../.claude/rules/stack.md).

---

## Le socle : faire UNE app pour iOS ET Android

### React
Bibliothèque pour construire des interfaces avec des **composants** (des fonctions qui
renvoient ce qu'il faut afficher). Tu décris **quoi** afficher selon l'état ; React
s'occupe de mettre à jour l'écran. On est sur **React 19**.

### React Native (RN)
React, mais au lieu de produire du HTML pour un navigateur, ça produit des **vraies
vues natives** iOS/Android. Tu écris `<View>`, `<Text>`, `<Pressable>` au lieu de
`<div>`, `<span>`, `<button>`. **Un seul code → deux plateformes.** Version **0.81**.

### Expo
Une **plateforme par-dessus React Native** qui enlève 90 % de la douleur :
- pas besoin de configurer Xcode/Android Studio pour débuter,
- un paquet de modules prêts (`expo-haptics`, `expo-location`, `expo-secure-store`…),
- le rechargement à chaud via **Expo Go**,
- les **builds** dans le cloud via **EAS** (Expo Application Services).

On est sur **Expo 54** (« SDK 54 »). Règle d'or : pour installer une lib native,
utiliser `npx expo install <lib>` (Expo choisit une version compatible).

### Expo Router (v6)
Le système de **navigation**. Sa particularité : **le routing suit l'arborescence de
fichiers** (comme Next.js). Un fichier dans `app/` = un écran ; le chemin du fichier =
l'URL. Détaillé dans [04-architecture.md](./04-architecture.md).

### TypeScript (strict)
JavaScript + un **système de types**. Tu déclares la forme de tes données ; le
compilateur attrape les erreurs **avant** l'exécution. Le projet est en mode **strict** :
- **pas de `any`** (interdit, c'est une erreur ESLint),
- pas de `as unknown as` gratuit,
- `npm run typecheck` doit renvoyer **zéro erreur**.

C'est contraignant au début, mais ça évite une montagne de bugs. Les **types sont
inline** dans chaque fichier (pas de fichier central `types/index.ts` — il est volontairement vide).

---

## Les données et le backend

### Supabase
Le **backend tout-en-un** (alternative open-source à Firebase) basé sur **PostgreSQL** :
- base de données (les 14 tables : users, workouts, sets…),
- **Auth** (inscription/connexion),
- **RLS** (Row Level Security) : des règles SQL qui garantissent qu'un user ne voit
  que ses données. C'est pour ça que l'`anon_key` peut vivre côté client sans danger.
- des **RPC** (fonctions SQL appelables depuis l'app, ex. `create_workout`).

Détaillé dans [06-donnees.md](./06-donnees.md) et [`.claude/rules/database.md`](../.claude/rules/database.md).

### expo-sqlite
Une base **SQLite locale**, sur le téléphone. Sert au **Mode Fantôme** et au **Moteur
Prédictif** : ils lisent l'historique local sans aucun appel réseau. C'est le pilier du
**offline-first**.

### Stockage clé-valeur (`lib/storage.ts`)
Un petit cache mémoire + AsyncStorage avec une API « façon MMKV ». Sert à **sauvegarder
le brouillon de séance en cours** à chaque action (crash-safe). `react-native-mmkv`
est installé mais **pas encore branché** (nécessite une config native EAS).

### expo-secure-store
Le **coffre-fort** du téléphone (Keychain iOS / Keystore Android). Y est stocké le
**token d'authentification** Supabase. Un détail : le token JWT dépasse parfois la limite
de taille, donc un adaptateur custom le **découpe en morceaux de 1800 octets**.

---

## Le visuel (le cœur de l'identité Orava)

### Three.js + expo-gl
Pour la **Myo 3D** (l'orbe qu'on fait tourner). `expo-gl` fournit un contexte WebGL ;
Three.js dessine la géométrie 3D dedans. ⚠️ Plein de **pièges spécifiques** (matériaux,
init synchrone…) documentés dans [`.claude/rules/stack.md`](../.claude/rules/stack.md) —
à lire **avant** de toucher au 3D.

### @shopify/react-native-skia
Moteur de **dessin 2D** très performant. Sert aux **charts Myo 2D** et plus tard à la
carte « ADN Athlétique ». Règle : pour les graphiques, on utilise **Skia ou des `View`
RN** — **jamais Victory Native**.

### react-native-reanimated (+ worklets)
Pour les **animations à 60 FPS**. Les animations tournent sur le thread UI (pas le thread
JS) → fluides même si le JS est occupé. On utilise `useSharedValue` + `withSpring`/`withTiming`,
jamais l'ancienne API `Animated.Value`. Le design impose **des springs, jamais du linéaire**.

### react-native-svg
Dessin vectoriel (le logo Orava, l'anneau du timer, le score Myo…).

### react-native-gesture-handler
Gestion fine des gestes tactiles (swipe, drag du WheelPicker…).

### expo-haptics
Les **vibrations**. Codifiées : tap léger à chaque série, pulse de succès sur un PR or, etc.
La règle : **le haptique suit le visuel**, jamais avant, et c'est désactivable dans les réglages.

### Fonts (@expo-google-fonts/*)
Trois familles : **Barlow** (texte), **Barlow Condensed** (titres), **JetBrains Mono**
(chiffres — toujours en `tabular-nums` pour que les chiffres ne « sautent » pas).

### lucide-react-native
La bibliothèque d'**icônes**.

---

## Mesure & monétisation

### posthog-react-native
**Analytics produit** (région EU). ~22 événements définis dans `lib/analytics.ts` pour
comprendre comment les users utilisent l'app.

### react-native-purchases (RevenueCat) — *Phase 2, pas encore installé*
Gère les **abonnements** (Pro, Coach) sur l'App Store / Play Store.

### rive-react-native, expo-av, expo-notifications — *Phase 2, à venir*
Animations de PR (.riv), sons, et notifications push (« PR prédit dans N jours »).

---

## Outillage (qualité du code)

| Outil | Rôle |
|---|---|
| **ESLint** (v8) | analyse le code, attrape les mauvaises pratiques (`no-explicit-any` = erreur) |
| **Prettier** | formate le code automatiquement (indentation, guillemets…) |
| **Jest** (+ jest-expo) | lance les **tests** (logique pure uniquement, pas d'UI) |
| **Husky** | lance lint + types + tests **à chaque commit** (hook pre-commit) |
| **lint-staged** | n'applique le lint qu'aux fichiers modifiés (rapide) |
| **EAS** | build les vraies apps iOS/Android dans le cloud |
| **GitHub Actions** | la **CI** : rejoue lint + types + tests sur chaque PR |

---

## Carte mentale rapide

```
        TON CODE (TypeScript, dans mobile_app/)
                       │
        ┌──────────────┼─────────────────┐
     React         React Native        Expo Router
   (composants)   (vues natives)      (navigation = fichiers)
                       │
   ┌───────────┬───────┴───────┬──────────────┐
 Visuel       Données        Animations     Mesure
 Three.js     Supabase       Reanimated     PostHog
 Skia         SQLite local   Haptics        (RevenueCat)
 SVG          SecureStore
```

➡️ Suite : [04-architecture.md](./04-architecture.md) — comment le code est rangé.
