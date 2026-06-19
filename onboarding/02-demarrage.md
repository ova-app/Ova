# 2 — Démarrer : de zéro à l'app sur ton téléphone

Objectif : avoir l'app qui tourne sur ton téléphone en ~30 min. On part du
principe que tu n'as **rien** d'installé.

> Toutes les commandes se lancent **depuis le dossier `mobile_app/`**, sauf mention contraire.

---

## Étape 0 — Le vocabulaire de l'outillage

Avant d'installer, comprends ce que tu installes :

- **Node.js** : le moteur qui exécute du JavaScript hors d'un navigateur. Indispensable
  pour les outils de dev (Metro, Expo, les tests…). On utilise **Node 20** précisément
  (fichier [`mobile_app/.nvmrc`](../mobile_app/.nvmrc)).
- **npm** : le gestionnaire de paquets (installé avec Node). Il télécharge les
  librairies listées dans `package.json` dans un dossier `node_modules/`.
- **Expo** : une surcouche de React Native qui simplifie ÉNORMÉMENT le dev mobile
  (pas besoin de Xcode/Android Studio au début). Voir [03](./03-la-stack-expliquee.md).
- **Expo Go** : une app gratuite à installer sur ton téléphone. Elle charge ton code
  via un QR code — tu vois tes changements en direct, sans rien compiler.

---

## Étape 1 — Installer Node 20

### Recommandé : avec un gestionnaire de versions
Cela permet d'avoir exactement Node 20 sans casser d'autres projets.

- **Windows** : installe [nvm-windows](https://github.com/coreybutler/nvm-windows/releases), puis :
  ```powershell
  nvm install 20
  nvm use 20
  ```
- **Mac / Linux** : installe [nvm](https://github.com/nvm-sh/nvm), puis depuis `mobile_app/` :
  ```bash
  nvm use      # lit le .nvmrc → installe/active Node 20
  ```

### Vérifier
```bash
node --version   # doit afficher v20.x.x
npm --version    # 10.x ou +
```

---

## Étape 2 — Récupérer le code

```bash
git clone <url-du-repo>
cd orava/mobile_app
```

> Le repo est sur l'organisation GitHub **`ova-app`**. Demande l'accès si tu ne l'as pas.

---

## Étape 3 — Installer les dépendances

```bash
npm install
```

Ça lit `package.json`, télécharge tout dans `node_modules/` (gros dossier, jamais commité),
et configure les **hooks Git** (via le script `prepare` → Husky, voir [08](./08-workflow-dev.md)).

> ℹ️ Un fichier `.npmrc` force déjà l'option `legacy-peer-deps`. C'est normal : certaines
> libs (Three.js, Skia…) déclarent des versions de pairs très strictes qu'on contourne
> volontairement. Si tu installes une **nouvelle** lib, fais-le avec
> `npx expo install <lib>` (Expo choisit la version compatible avec Expo 54).

---

## Étape 4 — Configurer les variables d'environnement

L'app a besoin de clés (Supabase, PostHog) pour fonctionner. Elles **ne sont pas
dans le repo** (secrets).

```bash
cp .env.example .env
```

Puis ouvre `.env` et remplis les vraies valeurs :

| Variable | Rôle | Où la trouver |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL du projet Supabase | Dashboard Supabase → Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (sûre côté client, protégée par la RLS) | idem |
| `EXPO_PUBLIC_POSTHOG_KEY` | Analytics | Dashboard PostHog |
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` | constante |

> 🔑 **Les clés se demandent au propriétaire** (1Password / message privé). Jamais dans un commit.
>
> 🚨 **JAMAIS la clé `service_role` dans l'app.** Elle contourne toute la sécurité (RLS).
> Elle n'a rien à faire dans `mobile_app/`. Le `.env.example` le rappelle.
>
> Le préfixe `EXPO_PUBLIC_` veut dire que la variable est **embarquée dans le bundle**
> et donc visible par n'importe qui. C'est OK pour l'`anon_key` (faite pour ça), JAMAIS
> pour un secret.

---

## Étape 5 — Lancer l'app

```bash
npm start
```

Un QR code s'affiche dans le terminal. Ensuite :

- **Sur téléphone (le plus simple)** : installe **Expo Go** ([iOS](https://apps.apple.com/app/expo-go/id982107779) /
  [Android](https://play.google.com/store/apps/details?id=host.exp.exponent)), ouvre-la,
  scanne le QR code. L'app se charge. Modifie un fichier → l'écran se met à jour tout seul
  (hot reload).
- **Sur simulateur** :
  ```bash
  npm run ios       # simulateur iOS (Mac uniquement, Xcode requis)
  npm run android   # émulateur Android (Android Studio requis)
  ```

> ⚠️ Certaines fonctionnalités utilisent du **code natif** (3D Myo via expo-gl, MMKV…).
> Elles marchent dans Expo Go pour la plupart, mais pour un test fidèle (ou RevenueCat,
> Rive…), il faut un **development build** EAS — pas nécessaire pour débuter.

---

## Étape 6 — Vérifier que tu peux contribuer

Avant même de coder, lance les 3 garde-fous (ils doivent tous passer) :

```bash
npm run lint        # style + règles de code (ESLint)
npm run typecheck   # types TypeScript (tsc --noEmit) — zéro erreur attendue
npm test            # tests de logique pure (Jest)
```

Si les trois sont verts, ton environnement est bon. Ces mêmes commandes tournent
automatiquement à chaque commit (Husky) et sur chaque PR (CI GitHub).

---

## Problèmes fréquents

| Symptôme | Cause probable | Solution |
|---|---|---|
| `npm install` échoue sur des peer deps | option manquante | vérifier que `.npmrc` contient `legacy-peer-deps=true` |
| Écran blanc au lancement | `.env` mal rempli / clés absentes | revérifier l'étape 4 |
| Mauvaise version de Node | Node ≠ 20 | `nvm use` dans `mobile_app/` |
| Le QR code ne charge pas | téléphone et PC pas sur le même réseau Wi-Fi | même réseau, ou mode tunnel `npx expo start --tunnel` |
| L'orbe 3D Myo est noir | expo-gl mal initialisé | voir les règles strictes dans [`.claude/rules/stack.md`](../.claude/rules/stack.md) |

➡️ Suite : [03-la-stack-expliquee.md](./03-la-stack-expliquee.md) — comprendre les technos.
