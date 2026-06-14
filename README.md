# Orava

App mobile de suivi de musculation — React Native (Expo) + Supabase.
Signature **Myo** (relief 3D data-driven), Mode Fantôme, Moteur Prédictif, feed social.

> Source de vérité produit : [`Orava___Master_Plan_v4.md`](./Orava___Master_Plan_v4.md)
> Audit technique + dette priorisée : [`BACKLOG.md`](./BACKLOG.md)
> Règles de dev (archi, DB, UI, workout, myo, stack) : [`.claude/rules/`](./.claude/rules/)

---

## Structure du repo

```
orava/
├── mobile_app/          — tout le code (Expo / React Native / TypeScript)
├── design/              — assets design avant intégration (Figma, Myo, sons, anims)
├── .github/workflows/   — CI (lint + types + tests) + build EAS
├── Orava___Master_Plan_v4.md — vision produit
└── BACKLOG.md           — audit + tickets ORA-xxx
```

Tout le code vit dans `mobile_app/`. Les commandes ci-dessous se lancent **depuis `mobile_app/`**.

---

## Prérequis

- **Node 20** (voir [`mobile_app/.nvmrc`](./mobile_app/.nvmrc) — `nvm use`)
- npm 10+
- Compte [Expo](https://expo.dev) (pour lancer l'app via Expo Go / dev client)
- Accès au projet Supabase Orava (demander les clés au propriétaire — voir Config ci-dessous)
- App **Expo Go** sur ton téléphone, ou un simulateur iOS / émulateur Android

---

## Installation

```bash
git clone <repo-url>
cd orava/mobile_app

npm install            # .npmrc force déjà legacy-peer-deps
cp .env.example .env   # puis remplir les valeurs (voir Config)
```

`npm install` configure aussi les hooks Git (Husky) via le script `prepare`.

---

## Config — variables d'environnement

Copier [`mobile_app/.env.example`](./mobile_app/.env.example) → `mobile_app/.env` et remplir :

| Variable | Rôle | Où la trouver |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL projet Supabase | Dashboard Supabase → Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Clé publique (RLS) | idem |
| `EXPO_PUBLIC_POSTHOG_KEY` | Analytics PostHog | Dashboard PostHog |
| `EXPO_PUBLIC_POSTHOG_HOST` | `https://eu.i.posthog.com` | constant |

⚠️ **`.env` n'est jamais commité** (gitignored).
⚠️ **La clé `service_role` ne va JAMAIS dans l'app mobile** — elle bypass toute la RLS. Réservée à un usage serveur/admin hors de ce dossier.
Les clés se transmettent **hors du repo** (1Password / message privé), jamais dans un commit.

---

## Lancer l'app

```bash
npm start          # Metro + QR code (Expo Go)
npm run ios        # simulateur iOS
npm run android    # émulateur Android
```

---

## Qualité — à lancer avant de pousser

```bash
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (TypeScript strict, zéro erreur attendue)
npm test           # Jest — 195 tests de logique pure
```

Un **hook pre-commit** (Husky) lance automatiquement `lint-staged + tsc + tests` à chaque commit.
La **CI** rejoue lint + types + tests sur chaque PR — voir [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Contribuer

Workflow de branches, conventions de commit et règles de PR : **[CONTRIBUTING.md](./CONTRIBUTING.md)**.

Règles de code détaillées (à lire au besoin) : [`.claude/rules/`](./.claude/rules/) — indexées dans [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).
