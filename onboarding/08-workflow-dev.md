# 8 — Le workflow de développement

Comment on travaille au quotidien : git, commits, garde-fous automatiques, tests, et
**ajouter un écran de A à Z**.

> Référence : [`CONTRIBUTING.md`](../CONTRIBUTING.md) à la racine.

---

## La règle d'or : jamais directement sur `main`

`main` est la branche **stable et protégée**. On n'y pousse **jamais** en direct. Tout
passe par une **Pull Request (PR)** qui doit être **verte** (CI OK) + **relue**.

### Le cycle d'une contribution

```bash
# 1. Partir d'un main à jour
git checkout main && git pull

# 2. Créer une branche dédiée
git checkout -b feat/mon-sujet

# 3. Coder, puis committer (le hook valide automatiquement)
git add .
git commit -m "feat: ajoute l'écran paywall"

# 4. Pousser et ouvrir une PR
git push -u origin feat/mon-sujet
# → ouvrir la PR vers main sur GitHub

# 5. CI verte + 1 review → merge → supprimer la branche
```

### Nommer les branches
```
feat/<sujet>   nouvelle fonctionnalité   (feat/paywall)
fix/<sujet>    correction de bug          (fix/save-double-insert)
chore/<sujet>  dette / outillage          (chore/ci-cache)
docs/<sujet>   documentation              (docs/onboarding)
```

> 💡 **Petites PR.** Pas 2000 lignes d'un coup : reviews rapides, moins de conflits.

---

## Les messages de commit (conventional commits)

Préfixe court qui dit la **nature** du changement :
```
feat:  une nouvelle fonctionnalité
fix:   une correction de bug
chore: outillage, config, dette
docs:  documentation
```
Exemple : `fix: save séance non-transactionnel → RPC create_workout`

---

## Les garde-fous automatiques (tu ne peux pas les éviter)

| Quand | Quoi tourne | Bloquant ? |
|---|---|---|
| **À chaque `git commit`** | Husky : `lint-staged` + `tsc --noEmit` + `npm test` | Oui (en local) |
| **À chaque push / PR vers `main`** | CI GitHub (`.github/workflows/ci.yml`) : `lint` → `typecheck` → `test` | Oui (pour merger) |

> 🚫 **Ne jamais contourner le hook avec `--no-verify`.** Si le hook casse, on corrige la
> cause, on ne la masque pas.

### La CI en détail
Le fichier [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) rejoue, sur une machine
propre, exactement :
```bash
npm ci            # install reproductible
npm run lint      # ESLint
npm run typecheck # tsc --noEmit
npm test -- --ci  # Jest
```
Si l'un échoue, la PR a une **croix rouge ❌** et ne peut pas être mergée. Une **coche
verte ✅** = les trois sont passés.

> Le **build EAS** (compilation des vraies apps) est dans un workflow **séparé**
> (`eas-build.yml`) — il n'est pas dans le garde-fou de merge car plus lent et nécessite
> des secrets.

---

## Les tests

```bash
npm test              # tous les tests, une fois
npm run test:watch    # relance à chaque modif (pendant le dev)
npm run test:coverage # avec le rapport de couverture
```

**Règle** : on teste **uniquement la logique pure** — pas de rendu d'UI, pas de
`@testing-library`. Les fichiers sont dans `__tests__/`. Exemples :
- `computePodium.test.ts` — la logique des PR
- `myoDims.test.ts` — le calcul des dimensions Myo
- `ghost.test.ts` — le Mode Fantôme
- `db.test.ts` — SQLite local

Dans les tests, **Supabase / AsyncStorage / SQLite / MMKV sont toujours mockés** (on ne
tape jamais une vraie base dans un test).

---

## Gérer les PR Dependabot

**Dependabot** ouvre automatiquement des PR pour mettre à jour les dépendances. Règle simple :

- **CI verte ✅** → généralement safe à merger (surtout patch/minor).
- **CI rouge ❌** → **ne pas merger**. Regarder les logs : souvent une mise à jour
  **majeure** (ex. TypeScript 5→6) casse le typecheck ou le lint. À traiter dans une
  branche dédiée, pas en mergeant aveuglément.
- **Les bumps groupés de N paquets** : si rouge, c'est dur à diagnostiquer → préférer les
  traiter un par un.

---

## Ajouter un écran de A à Z (exemple concret)

Imaginons l'écran **paywall** (`app/paywall.tsx`, prévu Phase 2).

```bash
git checkout main && git pull
git checkout -b feat/paywall
```

1. **Lire la maquette Figma** du paywall (PNG dans `design/figma-export/`). Identifier la
   densité (ici : Standard/Riche).
2. **Créer le fichier** `app/paywall.tsx`. Comme il est dans `app/`, il devient
   automatiquement la route `/paywall` (Expo Router). Pas de config de route à écrire.
3. **Coder l'UI inline** dans le fichier (on ne crée pas de composant partagé sans raison).
   - importer les tokens : `import { dark, spacing, typography } from '@/constants/theme'`,
   - **zéro couleur en dur**, espacements sur la grille 8pt, springs pour les animations.
4. **Brancher la logique** : si ça touche les abonnements, passer par `lib/` (ex. un futur
   `lib/purchases.ts`), pas de logique métier dans l'écran.
5. **Naviguer vers l'écran** depuis ailleurs : `router.push('/paywall')`.
6. **Tester la logique pure** ajoutée (s'il y en a) dans `__tests__/`.
7. **Vérifier en local** :
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
8. **Committer, pousser, ouvrir la PR.** Attendre la CI verte + la review.

---

## Quelques rappels qui sauvent

- **Tout se lance depuis `mobile_app/`.**
- **Touche à la base Supabase ?** → documenter la migration dans
  [`.claude/rules/database.md`](../.claude/rules/database.md) **avant** de coder.
- **Branches `archive/*`** = historique figé. On ne les merge pas, on ne les supprime pas,
  on ne branche pas dessus.
- **Aucun secret commité.** `.env` est gitignored.

➡️ Suite : [09-glossaire.md](./09-glossaire.md) — tous les termes du projet.
