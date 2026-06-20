# BACKLOG — Audit Orava

> Audit multi-experts (architecture, sécurité/RGPD, performance, data/offline, design-system/a11y, tests/devops/produit).
> Lecture seule du code à date. Chaque ticket cite `fichier:ligne` réel.
> Barème : note pour une ambition **valorisation type Strava**, pas pour un MVP de hackathon.

---

## État au 19/06/2026 — phase développement terminée

Vagues 0 → 1 → 2 + cœur de la Definition of Done faites. **20 tickets faits ont été retirés** de ce backlog (trace : journal daté dans « Plan de correction » ci-dessous ; détail dans l'historique git). Les blockers qui *corrompaient les données* (predictor mort, snapshot crash-safe factice, save non transactionnel, normalisation Myo divergente) sont résolus.

**Reste à faire :**
- **Dev** : `ORA-026` (baseline Myo encore mockée — le moat) · `ORA-038` (a11y retrofit — **session + library faits le 20/06**, reste `feed`).
- **Pré-lancement** : conformité/RGPD, monétisation, sécurité prod, perf scaling, i18n, tests e2e — catalogue P0/P1/P2 ci-dessous.

---

## Note globale (audit initial) : **7 / 20**

> Snapshot à la date de l'audit. Les défauts « data/offline » et « robustesse » ont depuis été corrigés en phase dev ; les blockers restants sont surtout conformité store + monétisation (non encore branchés).

### Sous-notes par dimension (audit initial)

| Dimension | Note | Verdict |
|---|---|---|
| Architecture & qualité de code | 8,5/20 | God-objects + duplication massive + ~40 `any`/`as` |
| Sécurité & conformité RGPD | 6,5/20 | service_role exposée + zéro dispositif RGPD |
| Performance & rendu | 12/20 | Socle sain mais feed (écran le plus chaud) sous-optimisé |
| Robustesse data / offline | 6/20 | Crash-safe factice + predictor mort + save non atomique |
| Design System interne | 13/20 | Grammaire respectée, 85 couleurs hardcodées en dérive |
| Accessibilité & i18n | 5/20 | a11y absente des écrans cœur, aucune i18n |
| Tests & QA | 6/20 | 0 % composant/intégration/e2e |
| DevOps & Release | 4/20 | CI sans tests/tsc, builds EAS cassés, pas de monitoring |
| Produit & Business | 7/20 | Différenciation réelle, mais ni revenu ni rétention branchés |

---

## ⚑ Plan de correction — phase DÉVELOPPEMENT — ✅ TERMINÉE

> Journal daté du travail dev. Logique des vagues : corriger d'abord ce qui **corrompt les données** et **fait grossir la dette** avant d'empiler des features.

### Vague 0 — Hygiène dev — ✅ FAITE (19/06/2026)
- ✅ **ORA-009** — `tsc --noEmit` au vert.
- ✅ **ORA-008 (local)** — `tsc --noEmit` + `npm test` en pre-commit Husky (`.husky/pre-commit` : lint-staged → tsc → test).
- ✅ **ORA-012** — Error Boundary racine dans `_layout.tsx` (écran de repli + `console.error`).
- ✅ **ORA-011 (dev)** — catch muets dé-silencés : chemin de save `summary.tsx` (`console.error`) + `storage.ts` `hydrateStorage` (critique crash-safe) + cache prédictions `useAnalyticsData`.
- ✅ **ORA-071** — artefacts dev supprimés (`tsc_out.txt`, `apply_fix.py`, `to_be_fixed.md`, `Priorites.md`, `design_app.md`).
- ✅ **ORA-033** — 5 `useAnimatedStyle` inlinés dans `summary.tsx` (plus de helper-hook `makeRevealStyle` ; 0 violation `rules-of-hooks`).
- ✅ **ORA-031** — agrégation muscles O(n×m) → O(n+m) par pré-indexation `Map` (`useAnalyticsData.ts` + `feed/[id].tsx`).

### Vague 1 — Bugs de fondation data — ✅ FAITE (14/06/2026)
- ✅ **ORA-007** — save transactionnel via RPC `create_workout` + `workoutId` idempotent (ref) + SQLite inséré **après** succès Supabase (best-effort). Migration `create_workout(payload jsonb)` **appliquée** (cf. `rules/database.md`).
- ✅ **ORA-006** — `_layout.tsx` await `hydrateStorage()` avant le provider + réhydratation `status/exercises/startedAt/elapsedSeconds` du draft au mount.
- ✅ **ORA-025** — `raw 0 → dim 0` + garde `|| 1` au dénominateur ; 3 chemins alignés (preview / retour save / signature relue).
- ✅ **ORA-005** — `computeConfidence` = somme pondérée (exportée) + 9 tests unitaires.
- ✅ **ORA-024 + ORA-027** — `backfillLocalFromSupabase()` (réamorce SQLite si vide au boot) + top3 PR via `getExercisePrTop3()` SQLite (zéro réseau séance, offline-safe).

### Vague 2 — Dette archi — ✅ FAITE (14/06/2026)
- ✅ **ORA-035** — helpers centralisés : `lib/muscles.ts`, `lib/weights.ts`, `lib/utils.ts`. 11 fichiers migrés + tests.
- ✅ **ORA-036** — `no-explicit-any: error`, **0 occurrence** restante ; jointures Supabase typées.
- ✅ **ORA-034** — couche data extraite en hooks `lib/hooks/` pour les 6 écrans actifs.

### Bonus perf — ✅ FAIT (14/06/2026)
- ✅ **ORA-028/029** — `React.memo(FeedItem)` + `renderItem`/`keyExtractor` `useCallback` + FlatList tunée (`removeClippedSubviews`, `initialNumToRender/maxToRenderPerBatch=4`, `windowSize=7`).

### Dette sécurité / data — lot du 19/06/2026 — ✅ FAIT
- ✅ **ORA-060** — adapter SecureStore : purge des chunks orphelins après `setItem` (boucle `deleteItemAsync` au-delà du nouveau nombre de fragments).
- ✅ **ORA-061** — `initDB` versionné via `PRAGMA user_version` (`SCHEMA_VERSION`) → migrations locales rejouables.
- ✅ **ORA-062** — `local_sessions` migrée en `id TEXT PRIMARY KEY` (rebuild conditionnel des installs antérieures via la migration v1). Doc `rules/database.md` + `rules/stack.md` synchronisées.
- ✅ **ORA-041** — `timer.tsx` : `Vibration.vibrate(400)` brut → `Haptics.notificationAsync(Success)` gardé par le toggle `settings_vibration` (même source que session.tsx). Supprime aussi le dernier `catch (_)` muet du repo.

### Devops / CI — lot du 19/06/2026 — ✅ FAIT
- ✅ **ORA-008 (CI)** — `.github/workflows/ci.yml` lance lint + `tsc --noEmit` + tests sur push/PR `main` (gate de merge). Déjà en place (vérifié 19/06).
- ✅ **ORA-070** — `.nvmrc` (20) + `engines` (node >=20) + `dependabot.yml` (npm + github-actions) déjà présents ; `buildNumber`/`versionCode` retirés d'`app.json` (source = `appVersionSource: remote`) ; **CodeQL** ajouté (`.github/workflows/codeql.yml`, SAST JS/TS).
- ✅ **ORA-044** — plafond `--max-warnings` ratcheté 400 → **231** (= total actuel, 0 erreur) → toute régression de warning casse la CI. *Résiduel :* descente vers 0 = nettoyage `no-inline-styles` + `exhaustive-deps` (gros, à faire au fil de l'eau).

### Dette code / DS — lot du 19/06/2026 — ✅ EN COURS
- ✅ **ORA-068** — `lib/logger.ts` centralisé (`log.error/warn/info`, conditionné `__DEV__`, ancre unique pour Sentry en ORA-011). Tous les `console.*` du code app migrés (8 fichiers). Script Node `generate-logo-assets.js` laissé en `console` (hors app).
- ✅ **ORA-067** — `Dimensions.get('window')` hoisté en const module `SCREEN_WIDTH` (app portrait-locked) → plus de calcul par render (SkeletonCard + FeedItem) ; `fetchFeed` au focus gardé par un TTL 20s (anti-martèlement Supabase aller-retour tabs). *Résiduel assumé :* 7 polices bloquantes au démarrage gardées (évite le FOUT — tradeoff voulu).
- ✅ **ORA-066** — exception `Easing.linear` documentée aux 2 spinners à rotation continue (`index.tsx`, `feed.tsx`) : vitesse constante voulue, un ease pulserait.
- ✅ **ORA-023** — `maxLength={500}` sur l'input commentaire (`feed.tsx`) ; volet DB en migration planifiée `supabase/planned/ora023_comment_length_check.sql` (CHECK ≤500, idempotent) **à appliquer**.
- 🟡 **ORA-065** — token `typography.micro` (10px) ajouté + 1er site migré (feed). *Résiduel :* migration des ~50 `fontSize 9/10/11` restants au fil de l'eau (beaucoup sont des labels Skia numériques ou des layouts tunés → vérif visuelle requise) ; idem spacing off-grid (`gap:5/6`).

### Definition of Done — 🟡 cœur fait, a11y restant
- ✅ **ORA-040** — tokens couleurs ajoutés (`avatarColors`, `scrim`, `score`…) + hex remplacés dans feed / feed[id] / summary. *Résiduel non bloquant* : blancs alpha décoratifs des charts Skia (dark-only) non tokenisés.
- ✅ **ORA-037** — likes (détail + feed) persistés Supabase + revert sur erreur.
- 🟡 **ORA-038** — a11y : `feed/[id]` (bouton like) + **`session.tsx` et `library.tsx` faits le 20/06** (role + label + state sur 100 % des touchables du chemin de log). **Reste** : `feed.tsx` (~31 touchables). *Résiduel connu :* la suppression de série par swipe n'a pas encore d'alternative `accessibilityActions` (le bouton corbeille existe mais derrière le geste).

### Sécurité / gating / a11y — lot du 20/06/2026 — ✅ FAIT
- ✅ **ORA-063** — `lib/plan.ts` : cache RAM du plan (`cacheUserPlan`/`getCachedPlan`/`ghostLimitDays`), alimenté aux écrans profil (`useProfileData`) + settings, réhydraté au boot. `session.tsx` lit `ghostLimitDays()` (Free 30 j / Pro 99999) → **zéro réseau séance** (règle #3). 8 tests `plan.test.ts`.
- 🟡 **ORA-038 (partiel)** — a11y `session.tsx` + `library.tsx` (cf. DoD ci-dessus).
- 🟡 **ORA-020** — migration `supabase/planned/ora020_rls_write_hardening.sql` écrite : policies d'écriture STRICTES (`WITH CHECK`/`USING` = `auth.uid()` propriétaire) sur 11 tables, purge dynamique des policies d'écriture pré-existantes, SELECT non touché, signal des `FOR ALL`. **À appliquer après revue** (diagnostic `pg_policies` inclus dans le fichier) — voir `supabase/README.md`.

### Reporté (post-développement, avant lancement)
RevenueCat (ORA-010), suppression compte (ORA-001), RGPD UI (ORA-003), service_role (ORA-002), push (ORA-042), i18n (ORA-039), OTA (ORA-043), EAS secrets / CI (ORA-004 / ORA-008-CI), pagination feed (ORA-030), Sentry / monitoring prod (ORA-011-prod), conformité store (ORA-072), Apple Sign-In (ORA-046).

---

## P0 — BLOQUANTS (gravité absolue — pour le jour du lancement)

### ORA-001 · [CONFORMITÉ] Suppression de compte absente → rejet Apple garanti
`profile.tsx:671`, `settings.tsx:316-340` — Seul `signOut` existe, aucun flux d'effacement. Apple Guideline 5.1.1(v) l'exige depuis juin 2022 pour toute app à création de compte. **Rejet automatique au review.**
**Action :** RPC Supabase `delete_account()` (efface users/workouts/workout_*/body_metrics/myo_signatures + photos Storage) + écran dédié dans settings.

### ORA-002 · [SÉCURITÉ] Clé `SUPABASE_SERVICE_ROLE_KEY` dans le `.env` de l'app cliente
`mobile_app/.env:4` — Clé admin qui **bypasse toute la RLS**, présente dans le dossier d'une app cliente. A déjà transité dans `scripts/import-exercises.ts` (commité puis supprimé, commit `a930629`). `.env` non tracké (bon), mais une faute de frappe `EXPO_PUBLIC_…` la publierait à tous les users.
**Action :** **révoquer + régénérer** la clé immédiatement (la considérer comme fuitée), la sortir du dossier mobile, la réserver à un backend / EAS Secret serveur.

### ORA-003 · [CONFORMITÉ RGPD] Aucun consentement, politique, export ni opt-in analytics — données de santé (art. 9)
`auth/register.tsx:89-116` (création sans consentement ni lien politique), `_layout.tsx:47-53` (PostHog `autocapture: captureScreens` actif dès le lancement, sans opt-in), 0 occurrence de `privacy/consent/gdpr/export`. Traitement de données de santé en catégorie spéciale sans base légale.
**Action :** politique de confidentialité + consentement explicite à l'inscription (mention santé) ; gater PostHog derrière opt-in (`posthog.optOut()` par défaut) + toggle settings ; export JSON (portabilité art. 20).

### ORA-004 · [DEVOPS] Builds EAS cassés — `EXPO_PUBLIC_*` non injectés en CI
`eas.json` (aucune clé `env`), `.github/workflows/eas-build.yml` (ne passe que `EXPO_TOKEN`), `.env` gitignored donc absent du runner. → Build cloud avec `EXPO_PUBLIC_SUPABASE_URL = undefined` = **écran blanc / crash auth**. « Marche en local » uniquement car `.env` est sur le poste dev.
**Action :** `eas secret:create` pour chaque `EXPO_PUBLIC_*` et chaque profil (preview/production).

### ORA-010 · [PRODUIT] Aucune monétisation branchée — revenu = 0
`react-native-purchases` absent de `package.json`, `app/paywall.tsx` inexistant, `users.plan` jamais lu pour gater une feature (le Mode Fantôme « Pro illimité » n'est jamais distingué à l'exécution).
**Action :** intégrer RevenueCat + paywall + gating réel sur `plan` (produits `orava_pro_monthly/yearly`, `orava_coach_monthly`).

### ORA-011 · [DEVOPS] Zéro monitoring d'erreurs en prod (volet Sentry)
`@sentry/react-native` absent → échecs invisibles en prod, impossible de savoir qu'un % d'utilisateurs perd ses séances.
> ✅ Volet **dev** fait (ORA-011-dev : catch du chemin de save + storage/hydrate + cache prédictions dé-silencés en `console.error`). Reste le monitoring prod.
**Action :** `@sentry/react-native` + brancher les `catch` critiques dessus (PostHog est déjà présent).

---

## P1 — MAJEURS (à corriger avant scaling / mise en avant produit)

### Sécurité & données

- 🟡 **ORA-020 · [SÉCURITÉ] RLS = seule barrière sur toutes les écritures client.** `feed.tsx:2058,919,626`, `edit-profile.tsx:241`, `summary.tsx:756` — `user_id` fourni par le client sur tous les INSERT ; `delete comment` filtré par `id` seul (`feed.tsx:640`). Non vérifiable dans le repo (SQL DB). **Action :** auditer/durcir RLS sur chaque table en écriture (`WITH CHECK (auth.uid() = user_id)` INSERT, `USING` UPDATE/DELETE). → **migration écrite** `supabase/planned/ora020_rls_write_hardening.sql` (11 tables, purge des policies d'écriture pré-existantes, SELECT préservé). **À APPLIQUER APRÈS REVUE** du diagnostic `pg_policies` (manuel — pas de DB dans le repo).
- **ORA-021 · [SÉCURITÉ] Buckets Storage publics + URLs devinables.** `edit-profile.tsx:87`, `summary.tsx:773` — `getPublicUrl()` sur `${user.id}/…` ; photo de séance accessible même si `is_public=false`. **Action :** buckets privés + `createSignedUrl()` ; aligner la visibilité photo sur `is_public` ; policies Storage `${auth.uid()}/`.
- **ORA-022 · [SÉCURITÉ] Données de santé en clair dans AsyncStorage.** `lib/storage.ts:9`, `session.tsx:187` — `snapshotToMMKV()` (nom trompeur, MMKV non utilisé) persiste le brouillon de séance en clair ; idem `predictions_cache`. **Action :** chiffrer au repos (MMKV `encryptionKey` ou SecureStore) ; renommer.

### Data / offline

- **ORA-026 · [DATA/PRODUIT] Baseline Myo encore mockée (Phase 1 non faite).** `lib/myo.ts:134-135` (`MUSCLE_POP_MEAN/STD` population codés en dur au lieu du rolling personnel), `myo-orb.tsx:462` (`MOCK_AVERAGE` overlay « ta moyenne » factice). Le Myo affiche de vraies valeurs séance mais sa normalisation et sa comparaison historique sont fictives — or c'est le **moat produit**. **Action :** rolling personnel depuis `myo_signatures.z_extended.muscles_raw` ; supprimer `MOCK_AVERAGE`. *(Choix de design à trancher : taille de la fenêtre rolling, seuil min de séances, fallback avant N séances.)*

### Performance

- **ORA-030 · [PERF/SCALABILITÉ] Feed = 8 requêtes/chargement, `limit(50)` sans pagination, agrégats client.** `feed.tsx:1864-1887` — pattern N+1 agrégé en JS, plafonné à 50 items non scrollables, recalculé à chaque focus. Coûts Supabase explosifs à l'échelle. **Action :** RPC `get_feed(cursor)` paginée + agrégats PR/likes côté DB (vues matérialisées / Edge Functions).
- **ORA-032 · [PERF] Upload photo sans resize + images sans cache.** `summary.tsx:764-776` (blob multi-Mo en RAM, pas de resize) ; `<Image>` RN partout (pas de cache disque, re-téléchargement). **Action :** `expo-image-manipulator` (resize ~1080px) + `expo-image` pour toutes les `source={{uri}}`.

### Accessibilité, i18n & DS

- **ORA-038 · [A11Y] Couverture a11y quasi nulle sur les écrans cœur.** 🟡 *En cours : `feed/[id]` (like) + **`session.tsx` et `library.tsx` faits le 20/06** (role + label + `accessibilityState` sur tous les touchables du chemin de log : pickers poids/reps, LOG SET, tabs exercices, chips, favoris, recherche).* Restait 332 touchables, ~89 props d'a11y concentrées sur auth/settings/edit-profile. **Reste :** `feed.tsx` (31), `feed/[id].tsx` (40 restants), `profile.tsx` (23) + alternative `accessibilityActions` au swipe-delete de série. **Action :** `accessibilityRole` + `accessibilityLabel` sur 100 % des touchables, priorité feed.
- **ORA-039 · [I18N] Aucune infrastructure i18n.** Pas de `expo-localization`/`i18next` ; 100 % FR hardcodé ; `users.locale` inutilisé. Internationalisation impossible sans refactor — bloquant pour scaler comme Strava. **Action :** `i18next` + `expo-localization`, externaliser les strings, brancher `users.locale`.

### Produit & tests

- **ORA-042 · [PRODUIT] Aucune boucle de ré-engagement.** `expo-notifications` absent → pas de push (« PR prédit », « streak en danger ») ; partage Stories 9:16 annoncé non codé ; pas de deep links de partage. Rétention J30 plancher. **Action :** push + export Stories (`makeImageSnapshot` + Share Sheet) + deep links.
- **ORA-043 · [DEVOPS] Pas d'OTA (`expo-updates` absent).** Chaque hotfix passe par les stores (24-72 h). **Action :** `expo-updates` + channels EAS (déjà configurés).
- **ORA-045 · [TESTS] 0 % composant / intégration / e2e.** `__tests__/` = tests de logique pure, dont certains **recopient** la fonction testée (`prsBuildPodium.test.ts:12-127`, `sessionUx.test.ts:34-58`) → testent une copie, pas le prod. `@testing-library/react-native`, Detox/Maestro absents. **Action :** render tests sur session/summary + smoke e2e Maestro (login → log set → save) ; tester le code importé.
- **ORA-046 · [PRODUIT] Apple/Google Sign-In absents.** Seul email/password. Attendu sur une app sociale grand public. **Action :** ajouter Apple Sign In (obligatoire dès qu'un autre social login existe).

---

## P2 — MINEURS / DETTE

- ✅ **ORA-063 · [DATA] Ghost codé en dur à 30 j.** `session.tsx` lit désormais `ghostLimitDays()` (`lib/plan.ts`) → Free 30 j / Pro 99999. Plan caché en RAM (alimenté profil/settings, réhydraté au boot) = zéro réseau pendant la séance. Fait le 20/06/2026.
- **ORA-064 · [A11Y] Contraste `textTertiary` 2,6:1 < WCAG AA.** `#4A4A5A` sur `#0A0A0F`, utilisé 143× dont du contenu réel (`library.tsx:417`). **Action :** réserver au décoratif ou éclaircir le token. **⛔ Décision design requise** : `textTertiary` est un token Figma validé — l'éclaircir change toute la hiérarchie « off » de l'app. À trancher avec le designer (éclaircir le token vs le réserver au décoratif + nouveau token AA pour le contenu). Non modifié unilatéralement (règle #1 — autorité Figma).
- **ORA-069 · [SÉCURITÉ] Politique mot de passe faible.** `register.tsx:82-83` — min 8, aucune autre exigence. **Action :** activer la protection « leaked password » Supabase (HIBP).
- **ORA-072 · [PRODUIT/CONFORMITÉ] App Privacy labels + compte de test à préparer.** Pour le review Apple/Google : déclarer collecte santé/localisation/photos, fournir un compte de test.

---

## Points positifs vérifiés (à préserver)

- Résidence EU (Supabase Frankfurt + PostHog `eu.i.posthog.com`), tokens en SecureStore, requêtes paramétrées (**aucune injection SQL** — vérifié), `is_public` DEFAULT `false`, **aucune coordonnée lat/lng précise écrite** (seule `location_city`).
- Conformité expo-gl exemplaire (`onContextCreate` synchrone, `MeshPhongMaterial`, `endFrameEXP`, `setPixelRatio(1)`), batching Supabase via `Promise.all` quasi partout, cleanup Reanimated rigoureux, paths Skia majoritairement memoïsés, `getItemLayout` sur le WheelPicker.
- Tests de logique pure honnêtes (cas limites sérieux, aucun `.only`/`.skip`) — 195 verts (12 suites) au 19/06/2026.
- Myo **câblé sur vraies données** côté `summary.tsx` et `feed/[id].tsx` — seule la baseline reste mockée (cf. ORA-026).
- Onboarding < 60 s tenu (`onboarding/first-set.tsx` précharge un exo et démarre direct).

### Faux positifs écartés (vérifiés pendant l'audit)

- `crypto.randomUUID()` : **polyfillé** dans `supabase.ts:6-22` (+ `react-native-get-random-values`) → `summary.tsx` ne crashera pas. Non-problème.
- « Log d'un set avant chargement des top3 » : `addExercise` n'ajoute l'exercice au state (`WorkoutContext.tsx:217`) **qu'après** le `await` → la carte n'existe pas avant. Race inexistante.

---

## Séquencement

**Phase développement** → ✅ terminée (Vague 0 → 1 → 2 + cœur DoD). Reste 2 items dev : **ORA-026** (baseline Myo — moat) puis **ORA-038** (a11y retrofit).

**Phase pré-lancement** — ordre indicatif :
1. **Conformité/sécurité (déblocage store)** : ORA-001, 002, 003, 072 + ORA-021/022.
2. **Fiabilité release** : ORA-004, 008 (CI), 011 (Sentry/monitoring prod), 043.
3. **Monétisation + rétention** : ORA-010, 042, 046.
4. **Perf feed + scaling** : ORA-030 (+ ORA-032 images).
5. **a11y + i18n (rétrofit du legacy)** : ORA-038, 039.
6. **Dette continue** : P2 restant.
