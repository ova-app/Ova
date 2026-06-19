# Onboarding Orava 🟡

Bienvenue. Ce dossier explique le projet **de zéro**, comme si tu n'avais jamais
touché ni au code, ni à React Native, ni à Supabase. Lis dans l'ordre.

> Objectif : qu'un nouveau dev (ou le futur associé) puisse comprendre,
> installer, lancer et modifier l'app **sans avoir à demander**.

---

## Parcours de lecture

| # | Fichier | Ce que tu y apprends | Temps |
|---|---|---|---|
| 1 | [01-cest-quoi-orava.md](./01-cest-quoi-orava.md) | Le produit : à quoi sert l'app, pour qui, ses idées fortes | 10 min |
| 2 | [02-demarrage.md](./02-demarrage.md) | Installer Node, cloner, configurer, **lancer l'app sur ton téléphone** | 30 min |
| 3 | [03-la-stack-expliquee.md](./03-la-stack-expliquee.md) | Chaque techno (React Native, Expo, Supabase…) et **pourquoi** elle est là | 25 min |
| 4 | [04-architecture.md](./04-architecture.md) | Comment le code est rangé, le démarrage de l'app, la navigation | 25 min |
| 5 | [05-concepts-metier.md](./05-concepts-metier.md) | Les idées propres à Orava : Myo, PR, Mode Fantôme, Prédictif | 30 min |
| 6 | [06-donnees.md](./06-donnees.md) | Où vivent les données : Supabase, SQLite local, le « offline-first » | 25 min |
| 7 | [07-design-system.md](./07-design-system.md) | Les règles visuelles : couleurs, typo, animations, densité | 20 min |
| 8 | [08-workflow-dev.md](./08-workflow-dev.md) | Git, commits, hooks, CI, tests, **ajouter un écran de A à Z** | 25 min |
| 9 | [09-glossaire.md](./09-glossaire.md) | Tous les termes (anglicismes, muscles, abréviations) | référence |

---

## Les 5 choses à retenir avant de coder

1. **Tout le code est dans `mobile_app/`.** Les commandes se lancent depuis là.
2. **On ne pousse jamais sur `main`.** On crée une branche, on ouvre une PR, la CI doit être verte. → [08-workflow-dev.md](./08-workflow-dev.md)
3. **L'app est dark-only et jaune (#FFDD00).** Pas de pixel sans respecter le design system. → [07-design-system.md](./07-design-system.md)
4. **Pas de réseau pendant une séance.** On écrit en mémoire + local, on synchronise Supabase **après** le save. → [06-donnees.md](./06-donnees.md)
5. **TypeScript strict.** Pas de `any`. La CI refuse le code mal typé.

---

## Les autres docs du repo (à connaître)

Ces fichiers existent déjà à la racine — l'onboarding les complète, il ne les remplace pas :

- **[`README.md`](../README.md)** — résumé express + commandes.
- **[`CONTRIBUTING.md`](../CONTRIBUTING.md)** — règles de contribution (branches, commits, PR).
- **[`Orava___Master_Plan_v4.md`](../Orava___Master_Plan_v4.md)** — **la source de vérité produit**. Vision, phases, features.
- **[`BACKLOG.md`](../BACKLOG.md)** — la dette technique et les tickets `ORA-xxx` priorisés.
- **[`.claude/rules/`](../.claude/rules/)** — les **règles techniques détaillées** (database, ui, workout, myo, stack, files, figma). C'est la doc de référence « avancée ». L'onboarding est la version « débutant » ; les rules sont la version « je code une feature précise ».

> En cas de doute entre l'onboarding et une rule : **la rule fait foi** (elle est tenue à jour au fil du code).
