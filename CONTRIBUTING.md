# Contribuer à Orava

À deux sur le repo, une règle simple : **on ne pousse jamais directement sur `main`**. Tout passe par une PR qui doit être verte.

---

## Workflow de branches

```
main          ← branche stable, protégée. Mergée uniquement via PR.
feat/<sujet>  ← nouvelle feature      (ex: feat/paywall)
fix/<sujet>   ← correction de bug      (ex: fix/save-double-insert)
chore/<sujet> ← dette / outillage      (ex: chore/ci-cache)
```

1. Partir de `main` à jour :
   ```bash
   git checkout main && git pull
   git checkout -b feat/mon-sujet
   ```
2. Coder, committer (le hook pre-commit valide lint + types + tests).
3. Pousser la branche et ouvrir une **Pull Request** vers `main`.
4. La CI doit être **verte** (lint + types + tests) + **1 review** avant merge.
5. Merge → supprimer la branche.

> Ne pas accumuler 2 000 lignes par PR. Petites PR = reviews rapides = moins de conflits.

---

## Messages de commit

Préfixe court type _conventional commits_ :

```
feat: paywall RevenueCat
fix: save séance non-transactionnel → RPC create_workout
chore: ajoute job CI lint+types+tests
docs: README onboarding
```

---

## Garde-fous automatiques

| Quand | Quoi | Bloquant ? |
|---|---|---|
| `git commit` | Husky : `lint-staged` + `tsc --noEmit` + `npm test` | Oui (local) |
| Push / PR vers `main` | CI GitHub : `lint` → `typecheck` → `test` | Oui (merge) |

⚠️ **Ne jamais contourner le hook** avec `--no-verify`. Si le hook casse, on corrige la cause.

---

## Règles à ne pas violer

- **Aucun secret commité.** `.env` est gitignored. Les clés se partagent hors du repo. La clé `service_role` ne va jamais dans `mobile_app/`.
- **TypeScript strict** — pas de `any`, pas de `as unknown as` gratuit. `no-explicit-any` est en `error`.
- **Tests verts** avant de pousser (`npm test`).
- Conventions produit/archi/UI : voir [`.claude/rules/`](./.claude/rules/) (indexées dans [`.claude/CLAUDE.md`](./.claude/CLAUDE.md)).
- Touche à la base Supabase ? → documenter la migration dans [`.claude/rules/database.md`](./.claude/rules/database.md) **avant** de coder, et l'appliquer côté Supabase.

---

## Branches d'archive

`archive/*` = historique figé (anciennes versions). **Ne pas merger, ne pas supprimer.** On ne branche jamais dessus pour du nouveau travail.
