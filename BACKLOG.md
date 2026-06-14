# BACKLOG — Audit Orava

> Audit multi-experts (architecture, sécurité/RGPD, performance, data/offline, design-system/a11y, tests/devops/produit).
> Lecture seule du code à date. Chaque ticket cite `fichier:ligne` réel.
> Barème : note pour une ambition **valorisation type Strava**, pas pour un MVP de hackathon.

## Note globale : **7 / 20**

Fondations réelles et ambition crédible (Myo câblé sur vraies données, social fonctionnel, onboarding < 60 s, 175 tests de logique pure propres), mais **12 défauts bloquants** interdisent un lancement public : non-conformité RGPD + suppression de compte absente (rejet Apple garanti), aucune monétisation branchée, deux features cœur mortes (predictor, snapshot crash-safe), save non transactionnel, chaîne de release non fiable, zéro monitoring prod.

### Sous-notes par dimension

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

## ⚑ Plan de correction — phase DÉVELOPPEMENT (priorité actuelle)

> **L'app est encore en développement.** Tout ce qui relève du **release / scaling / conformité store** est volontairement reporté (voir « Reporté » en bas). Logique des vagues : corriger d'abord ce qui **corrompt les données** et **fait grossir la dette** avant d'empiler des features dessus.
>
> ⚠️ La numérotation P0/P1/P2 ci-dessous reste un classement de **gravité absolue** (pour le jour du lancement). Les **vagues** ci-dessous sont l'**ordre d'exécution recommandé en phase dev** — elles ne suivent pas l'ordre P0→P2.

### Vague 0 — Hygiène dev (~½ journée, EN PREMIER) — ✅ FAITE (14/06/2026)
On développe à l'aveugle tant que ce n'est pas fait.
- ✅ **ORA-009** — `tsc --noEmit` au vert (`GRAD` typé dans `myo-orb.tsx`). Vérifié exit 0.
- ✅ **ORA-008 (local)** — pre-commit Husky (`mobile_app/.husky/pre-commit`) : `lint-staged` → `tsc --noEmit` → `npm test`. `core.hooksPath` pointé via script `prepare`.
- ✅ **ORA-012** — Error Boundary racine (`_layout.tsx` — `getDerivedStateFromError` + `componentDidCatch` → `console.error`).
- ✅ **ORA-011 (dev)** — les `catch` du chemin de save (`summary.tsx`) loguent désormais via `console.error('[summary] …', e)`. Pas de Sentry à ce stade.
- ✅ **ORA-071** — `tsc_out.txt` + artefacts dev (`apply_fix.py`, `to_be_fixed.md`, `Priorites.md`, `design_app.md`) supprimés.

### Vague 1 — Bugs de fondation data (LA priorité) — ✅ FAITE (14/06/2026)
Ces bugs faussent silencieusement tout ce qu'on construira au-dessus (Myo, ghost, predictor, futur ADN). Chaque jour de dev en plus = plus de données corrompues.
- ✅ **ORA-007** — save transactionnel via RPC `create_workout` + `workoutId` idempotent (ref) + SQLite inséré **après** succès Supabase (best-effort). ⚠️ **Migration à appliquer** : `create_workout(payload jsonb)` en fin de `rules/database.md`.
- ✅ **ORA-006** — `_layout.tsx` await `hydrateStorage()` avant montage provider + réhydratation `status/exercises/startedAt/elapsedSeconds` du draft au mount de `WorkoutProvider`.
- ✅ **ORA-025** — `raw 0 → dim 0` + garde `|| 1` au dénominateur ; 3 chemins (preview / retour save / relue signature) alignés.
- ✅ **ORA-005** — `computeConfidence` = somme pondérée (exportée) + 9 tests unitaires.
- ✅ **ORA-024 + ORA-027** — `backfillLocalFromSupabase()` (réamorce SQLite si vide, lancé au boot) + top3 PR via `getExercisePrTop3()` SQLite (zéro réseau séance, offline-safe).

> tsc vert, 195 tests verts (12 suites). Mock global AsyncStorage + expo-sqlite ajouté (`jest.setup.js`).

### Vague 2 — Dette archi (le plus rentable à faire tôt) — ✅ FAITE (14/06/2026)
Coût qui double tous les 2 mois : chaque nouvel écran recopie le pattern.
- ✅ **ORA-035** — centralisé : `lib/muscles.ts` (3 référentiels muscles + `muscleGroupLabel`), `lib/weights.ts` (`REPS_VALUES` + `getWeightValues`), `lib/utils.ts` (`formatVolume`/`formatVolumeKg`/`formatDuration`/`epley1RM`). 11 fichiers migrés + 11 tests (`utilsHelpers.test.ts`). Note : `GhostCompareBar` (session) ≠ `GhostWeightBar` (wheel-picker) = 2 composants distincts → faux positif, non fusionnés.
- ✅ **ORA-036** — `no-explicit-any: error` actif, **0 occurrence** restante. Jointures Supabase typées via interfaces + `as unknown as` (prs, myo, analytics, profile, history) ; JSONB `workout_metrics.data` → interface `MetricsData`.
- ✅ **ORA-034** — couche data extraite en hooks `lib/hooks/` pour les 6 écrans actifs : `useHistoryData`, `useAnalyticsData`, `useProfileData` + **`useFeedData`** (fetch timeline + KPIs mois + `handleLike` optimiste avec revert), **`useSummaryData`** (sessionValues Myo + enrichissement muscles + historique volume ; save pipeline laissé dans l'écran car couplé UI), **`useExerciseLibrary`** (bibliothèque modale session : fetch + recherche/filtre + sections ; `MUSCLE_LABELS` coarse + `normalizeNFD` + `ExerciseRow` déplacés dans le hook).

> tsc vert · 195 tests verts (12 suites) · ESLint `no-explicit-any` = 0. (Erreurs ESLint préexistantes hors Vague 2 : `rules-of-hooks` ×8 = ORA-033, `no-require-imports` ×5.)

### Definition of Done (au fil de l'eau, pas un sprint) — 🟡 EN COURS (14/06/2026)
À intégrer dès les **nouveaux** écrans — moins cher inline que rétrofité.
- ✅ **ORA-040** — tokens ajoutés dans `theme.ts` : `avatarColors`, `scrim`, `scrimStrong`, `score` (high/mid/low). Hex remplacés dans feed.tsx (palette avatar, PR `dark.pr*`, voiles modals, `#fff`→`dark.textPrimary`), feed/[id].tsx (échelle score, `error`, scrims), summary.tsx (MuscleBar + sparkline `accent`/`background`/`textPrimary`). **Reste** : blancs alpha décoratifs des Skia charts dark-only (rgba(255,255,255,…)/rgba(26,26,36,…)) — non tokenisés (nécessiteraient des tokens alpha dédiés).
- 🟡 **ORA-038** — `accessibilityRole/Label` ajoutés en passant (bouton like feed/[id]). Reste le rétrofit session/feed/library.
- ✅ **ORA-037** — like détail (`feed/[id].tsx`) persisté (insert/delete Supabase) + revert sur erreur ; `handleLike` du feed (`useFeedData`) idem avec revert.

### Bonus perf (remonté en Vague 2 car feed = écran de test quotidien) — ✅ FAIT (14/06/2026)
- ✅ **ORA-028/029** — `React.memo(FeedItem)` + `renderItem`/`keyExtractor` via `useCallback` + FlatList tunée (`removeClippedSubviews`, `initialNumToRender=4`, `maxToRenderPerBatch=4`, `windowSize=7`). Limite drastiquement le nombre de `MyoChart` Skia montés simultanément ; les cartes hors-viewport sont démontées (stoppe aussi leurs animations `withRepeat(-1)`). Miniature statique `makeImageSnapshot` non retenue (le tuning FlatList suffit).

### Vague 3 — Robustesse data/offline + hygiène (low-risk, 100 % testé) — ✅ FAITE (14/06/2026)
Items dev-phase bien bornés, chacun vérifié par `tsc` + tests + lint verts. Hors périmètre « Reporté ».
- ✅ **ORA-060** — `ExpoSecureStoreAdapter` extrait dans `lib/secureStoreAdapter.ts` (testable isolément). **Bug corrigé** : sur un JWT plus court, `setItem` n'effaçait pas les chunks `${key}.${n}` d'une valeur antérieure → `getItem` re-concaténait des fragments périmés (**token corrompu**, pas juste résiduel). `setItem` purge désormais via `deleteChunksFrom(key, chunks.length)`. +5 tests (round-trip multi-chunks + purge orphelins + removeItem).
- ✅ **ORA-061** — versioning du schéma SQLite : `migrate()` via `PRAGMA user_version` (`SCHEMA_VERSION = 1`) dans `db.ts`. `CREATE IF NOT EXISTS` ne touchant pas une base existante, toute future évolution passe par un bloc `if (version < N)` idempotent.
- ✅ **ORA-062** — `local_sessions` reconstruit avec `id TEXT PRIMARY KEY` (migration v1, dédup `ORDER BY logged_at ASC` + `INSERT OR REPLACE`) → fin des doublons de séances (ghost/predictor ne comptent plus 2×). +4 tests migration. `rules/database.md` + `rules/stack.md` mis à jour.
- ✅ **ORA-063** — Mode Fantôme borné par le plan : `getGhostReference(id, plan === 'premium' ? 99999 : 30)`. Plan caché localement (`AsyncStorage 'user_plan'`, alimenté par `useProfileData` + `settings.tsx`) → lu dans `session.tsx` **sans réseau** (règle #3).
- ✅ **ORA-041** — helper haptique central `lib/haptics.ts` (taxonomie `rules/ui.md` + gating `settings_vibration` via cache mémoire). `timer.tsx` route `Vibration.vibrate(400)` brut → `timerDone()` (respecte le toggle) + `refreshHapticsSetting()` au montage. +8 tests (chaque helper, double-pulse ghost, gating). **Reste** : migrer `session.tsx` vers le helper (dédup, non bloquant).
- ✅ **ORA-033** (déjà fait) — les 5 `useAnimatedStyle` de `summary.tsx` sont inlinés (`style0…style4`), plus de hook dans un helper. Plus aucune erreur ESLint `rules-of-hooks`.
- 🟡 **ORA-044** (ratchet) — plafond lint `--max-warnings 400 → 236 → 232` (script `lint` + `lint-staged`, CI via `npm run lint`). 0 erreur, 232 warnings résiduels (majorité `react-native/no-inline-styles`). Objectif 0 reste post-dev.

> tsc vert · **252 tests verts (17 suites, +17 cette vague)** · coverage thresholds OK · lint 232/232.

### Reporté (post-développement, avant lancement)
RevenueCat (ORA-010), suppression compte (ORA-001), RGPD UI (ORA-003), service_role (ORA-002), push (ORA-042), i18n (ORA-039), OTA (ORA-043), EAS secrets/CI (ORA-004/008-CI), pagination feed (ORA-030), Sentry (ORA-011-prod), conformité store (ORA-072), Apple Sign-In (ORA-046).
**Exception :** perf feed (ORA-028/029) à remonter en Vague 2 **si** le feed est l'écran de test quotidien.

---

## P0 — BLOQUANTS (gravité absolue — pour le jour du lancement, cf. vagues ci-dessus pour l'ordre dev)

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

### ORA-005 · [DATA/BUG] Moteur Prédictif 100 % mort — formule de confiance erronée
`lib/predictor.ts:82` — `return r2 * 0.55 * pointsFactor * 0.25 * freqFactor * 0.20 * fatigueFactor` : les poids sont **multipliés** au lieu d'être sommés. Max théorique = `0,55 × 0,25 × 0,20 = 0,0275`, seuil `MIN_CONFIDENCE = 0,6` → `computePrediction` retourne **toujours `null`**. Feature affichée dans `analytics.tsx:312-316`.
**Action :** somme pondérée `(r2*0.55 + pointsFactor*0.25 + freqFactor*0.20) * fatigueFactor` (max 1.0), recalibrer le seuil, + test unitaire sur `computeConfidence`.

### ORA-006 · [DATA/BUG] Snapshot séance jamais relu → « crash-safe » factice
`context/WorkoutContext.tsx:112` (init `status='idle'`, aucune lecture du draft), `session.tsx:187-196` (écriture seule), `_layout.tsx:37` (`hydrateStorage()` non `await`). Le draft `workout_session_draft` est écrit à chaque mutation mais **jamais réhydraté** → toute séance en cours est perdue au moindre crash/kill iOS. La mention CLAUDE.md « Snapshot MMKV → crash-safe ✅ » est fausse.
**Action :** `await hydrateStorage()` avant de monter `WorkoutProvider` ; au mount, restaurer `status/exercises/startedAt` depuis le draft si présent ; recalculer `elapsedSeconds`.

### ORA-007 · [DATA/BUG] Save séance non transactionnel et non idempotent
`summary.tsx:753` (`workoutId = crypto.randomUUID()` régénéré à chaque tentative), `summary.tsx:756-807` (N inserts séquentiels `throw` sans rollback, `insertLocalSet` entrelacé dans la boucle). Échec au 3ᵉ exo → workout orphelin/partiel côté Supabase + sets du 1ᵉ exo déjà en SQLite. Retry → **double insertion SQLite** (nouvel `id`) → ghost/predictor comptent la séance 2×.
**Action :** RPC Postgres transactionnelle `create_workout(payload jsonb)` ; générer `workoutId` une seule fois (idempotence) ; n'insérer en SQLite **qu'après** succès complet Supabase.

### ORA-008 · [DEVOPS] CI ne lance ni les tests ni `tsc`
`.github/workflows/eas-build.yml` — Steps = `npm ci` → `npm run lint` → `eas build`. 175 tests existants ne gardent rien ; `tsc` jamais exécuté.
**Action :** ajouter `npx tsc --noEmit` + `npm test` **avant** le build EAS, bloquants au merge.

### ORA-009 · [CODE/BUG] `tsc --noEmit` échoue — garantie « TS strict » fausse
`app/workout/myo-orb.tsx:242` — `error TS2322` : tableau `GRAD` en `as const` inféré comme union de 3 tuples distincts → `lo = GRAD[k]` non assignable. **Vérifié : `tsc --noEmit` exit 2.** Non détecté car CI ne lance pas tsc (cf. ORA-008). L'EAS build passe quand même (Babel strippe les types) mais le strict est rompu.
**Action :** typer `const GRAD: readonly { t: number; rgb: readonly number[] }[]`. Supprimer l'artefact périmé `mobile_app/tsc_out.txt` (pointe vers une autre erreur déjà corrigée → trompeur).

### ORA-010 · [PRODUIT] Aucune monétisation branchée — revenu = 0
`react-native-purchases` absent de `package.json`, `app/paywall.tsx` inexistant, `users.plan` jamais lu pour gater une feature (le Mode Fantôme « Pro illimité » n'est jamais distingué à l'exécution).
**Action :** intégrer RevenueCat + paywall + gating réel sur `plan` (produits `orava_pro_monthly/yearly`, `orava_coach_monthly`).

### ORA-011 · [DEVOPS] Zéro monitoring d'erreurs en prod + catch silencieux
`@sentry/react-native` absent. ~30 `catch (_) {}` muets sur le chemin de save : `summary.tsx:712,719,731,776,830,855` (upload photo, `workout_metrics`, `saveMyoSignature`). Échecs invisibles en prod → impossible de savoir qu'un % d'utilisateurs perd ses séances.
**Action :** `@sentry/react-native` + remonter au minimum les `catch` du chemin de save (PostHog est déjà présent).

### ORA-012 · [CODE] Aucune Error Boundary dans toute l'app
`app/_layout.tsx` — Aucune `ErrorBoundary`/`componentDidCatch`. Une exception de rendu (cast `as` faux, WebGL) crashe l'app entière en écran blanc, sans capture.
**Action :** Error Boundary racine + écran de repli + capture Sentry.

---

## P1 — MAJEURS (à corriger avant scaling / mise en avant produit)

### Sécurité & données

- **ORA-020 · [SÉCURITÉ] RLS = seule barrière sur toutes les écritures client.** `feed.tsx:2058,919,626`, `edit-profile.tsx:241`, `summary.tsx:756` — `user_id` fourni par le client sur tous les INSERT ; `delete comment` filtré par `id` seul (`feed.tsx:640`). Non vérifiable dans le repo (SQL DB). **Action :** auditer/durcir RLS sur chaque table en écriture (`WITH CHECK (auth.uid() = user_id)` INSERT, `USING` UPDATE/DELETE).
- **ORA-021 · [SÉCURITÉ] Buckets Storage publics + URLs devinables.** `edit-profile.tsx:87`, `summary.tsx:773` — `getPublicUrl()` sur `${user.id}/…` ; photo de séance accessible même si `is_public=false`. **Action :** buckets privés + `createSignedUrl()` ; aligner la visibilité photo sur `is_public` ; policies Storage `${auth.uid()}/`.
- **ORA-022 · [SÉCURITÉ] Données de santé en clair dans AsyncStorage.** `lib/storage.ts:9`, `session.tsx:187` — `snapshotToMMKV()` (nom trompeur, MMKV non utilisé) persiste le brouillon de séance en clair ; idem `predictions_cache`. **Action :** chiffrer au repos (MMKV `encryptionKey` ou SecureStore) ; renommer.
- **ORA-023 · [SÉCURITÉ] Champ commentaire sans `maxLength`.** `feed.tsx:753,626` — input et INSERT non bornés (abus/DoS stockage ; pas de XSS car `<Text>` RN). **Action :** `maxLength={500}` + `CHECK (char_length(content) <= 500)` DB.

### Data / offline

- **ORA-024 · [DATA] SQLite jamais réamorcé depuis Supabase.** `lib/ghost.ts:24`, `lib/predictor.ts:94`, `summary.tsx:798` — `local_sets`/`local_sessions` alimentés uniquement au save. Après réinstall / nouvel appareil / clear data → SQLite vide alors que Supabase est plein → **ghost + predictor silencieusement HS** pendant des semaines. **Action :** backfill au 1ᵉʳ `initDB` post-auth depuis `workout_sets`/`workouts` si tables locales vides.
- **ORA-025 · [DATA] Famille 6 Myo : normalisation divergente preview vs persistance.** `lib/myo.ts:516-518` (persistance z-score même `v===0`, sans `|| 1`) vs `:334-335` (preview `v===0 ? 0`). Un muscle non travaillé est stocké à z ≈ −1,25 → signature affichée (summary) ≠ relue (feed/[id]). **Action :** aligner « raw 0 → dim 0 » à la persistance + garde `|| 1` au dénominateur.
- **ORA-026 · [DATA/PRODUIT] Baseline Myo encore mockée (Phase 1 non faite).** `lib/myo.ts:134-135` (`MUSCLE_POP_MEAN/STD` population codés en dur au lieu du rolling personnel), `myo-orb.tsx:462` (`MOCK_AVERAGE` overlay « ta moyenne » factice). Le Myo affiche de vraies valeurs séance mais sa normalisation et sa comparaison historique sont fictives — or c'est le **moat produit**. **Action :** rolling personnel depuis `myo_signatures.z_extended.muscles_raw` ; supprimer `MOCK_AVERAGE`.
- **ORA-027 · [DATA] Réseau pendant séance active + PR manqué offline.** `WorkoutContext.tsx:162-176` — `addExercise` fait un appel Supabase (viole règle #3 « zéro réseau pendant séance ») ; si l'appel échoue (offline), `pr_top3_*` reste vide → vrai PR non détecté pour la séance (silencieux). **Action :** précharger les top3 en début de séance / depuis SQLite ; recalculer `pr_charge`/`pr_serie` au save (actuellement figés).

### Performance

- **ORA-028 · [PERF] `MyoChart` Skia complet monté dans chaque cellule du feed.** `feed.tsx:1031-1040` — composant Skia de 728 lignes (≈10 `useMemo`, `<Canvas>` GPU) × jusqu'à 50 workouts, `FlatList` non tunée. Scroll de l'écran le plus chaud < 60 FPS sur Pixel 6a. **Action :** miniature statique (`makeImageSnapshot` caché) ou Myo réservé au détail ; `FlatList` `initialNumToRender/maxToRenderPerBatch/windowSize/removeClippedSubviews`.
- **ORA-029 · [PERF] `FeedItem` non mémoïsé + animation infinie par carte.** `feed.tsx:799` (pas de `React.memo`, `renderItem` closure inline `:2179`), `PRSkiaChip` `withRepeat(-1)` `:254-276`. `React.memo` utilisé **nulle part** dans l'app. **Action :** `React.memo(FeedItem)` + `useCallback(renderItem)` + suspendre le shimmer hors-viewport.
- **ORA-030 · [PERF/SCALABILITÉ] Feed = 8 requêtes/chargement, `limit(50)` sans pagination, agrégats client.** `feed.tsx:1864-1887` — pattern N+1 agrégé en JS, plafonné à 50 items non scrollables, recalculé à chaque focus. Coûts Supabase explosifs à l'échelle. **Action :** RPC `get_feed(cursor)` paginée + agrégats PR/likes côté DB (vues matérialisées / Edge Functions).
- **ORA-031 · [PERF] Agrégation muscles O(n×m).** `analytics.tsx:230-240`, `feed/[id].tsx:726-734` — `.filter` complet imbriqué dans une boucle. **Action :** pré-indexer en `Map<exercise_id, rows[]>`.
- **ORA-032 · [PERF] Upload photo sans resize + images sans cache.** `summary.tsx:764-776` (blob multi-Mo en RAM, pas de resize) ; `<Image>` RN partout (pas de cache disque, re-téléchargement). **Action :** `expo-image-manipulator` (resize ~1080px) + `expo-image` pour toutes les `source={{uri}}`.
- ✅ **ORA-033 · [PERF/CODE] `useAnimatedStyle` appelé dans un helper.** ~~`summary.tsx:560-570`~~ → **FAIT** : `makeRevealStyle` supprimé, 5 `useAnimatedStyle` inlinés (`style0…style4`). Plus aucune erreur ESLint `rules-of-hooks`.

### Architecture & code

- **ORA-034 · [ARCHI] 6 god-objects (~9 300 lignes) data+métier+UI mêlés.** `feed.tsx` (2435), `feed/[id].tsx` (1795), `summary.tsx` (1640), `session.tsx` (1596), `profile.tsx` (1235), `analytics.tsx` (995). **Action :** sortir la data en hooks `lib/hooks/`, les sous-composants en fichiers co-localisés (`_components/`), sans toucher la règle `components/`.
- **ORA-035 · [ARCHI] Duplication massive de helpers.** `formatVolume` (utils.ts existe mais ré-déclaré dans feed/feed[id]/history[id]/history), `formatDuration` ×6, `MUSCLE_LABEL_MAP` ×6 (`analytics:53`, `exercise/[id]:55`, `history/[id]:136`, `feed/[id]:190`, `prs:65`, `session:155`), `epley1RM` ×2 (`predictor:18`, `summary:275`), tables de poids/`REPS_VALUES` ×2 (`session` vs `wheel-picker-modal`), GhostBar ×2. **Action :** centraliser dans `lib/` et importer.
- **ORA-036 · [CODE] ~40 violations TypeScript strict.** `prs.tsx:518,539,553,559,591` (`as any` ×5), `feed.tsx:828,855,873,1862…` (`as unknown as` ×9), `myo.ts:212,276-279` (`any`), `feed/[id].tsx:117` (`[key:string]: any`), `supabase.ts:20-21`. ESLint `no-explicit-any: warn`. **Action :** typer les jointures Supabase ; passer `no-explicit-any` en `error`.
- **ORA-037 · [BUG] Like de l'écran détail non persisté.** `feed/[id].tsx:1087` — `onPress={() => setHasLiked(!hasLiked)}` sans appel Supabase → like cosmétique perdu au reload. `handleCommentLike` (`feed.tsx:895`) : optimistic sans try/catch ni revert. **Action :** persister + revert sur erreur.

### Accessibilité, i18n & DS

- **ORA-038 · [A11Y] Couverture a11y quasi nulle sur les écrans cœur.** 332 touchables, ~89 props d'a11y concentrées sur auth/settings/edit-profile. **Zéro** label sur `session.tsx` (47), `feed.tsx` (31), `feed/[id].tsx` (40), `library.tsx` (14), `profile.tsx` (23). Logger une série en VoiceOver/TalkBack = impossible. **Action :** `accessibilityRole` + `accessibilityLabel` sur 100 % des touchables, priorité session/feed/library.
- **ORA-039 · [I18N] Aucune infrastructure i18n.** Pas de `expo-localization`/`i18next` ; 100 % FR hardcodé ; `users.locale` inutilisé. Internationalisation impossible sans refactor — bloquant pour scaler comme Strava. **Action :** `i18next` + `expo-localization`, externaliser les strings, brancher `users.locale`.
- **ORA-040 · [DS] 85 couleurs hardcodées → light mode cassé.** `feed.tsx` (15), `feed/[id].tsx` (11), `summary.tsx` (8 hex + 8 rgba), palette `AVATAR_COLORS` inventée (`feed.tsx:122-131`), tokens PR redéfinis en dur (`feed.tsx:190-196`, `summary.tsx:201`), `#fff`/`#000` purs (`feed.tsx:1094`, `session.tsx:288`). ThemeContext OK mais ces hex ne réagissent pas au thème. **Action :** tokeniser dans `theme.ts` (ajouter `dataViz[]`, `scrim`, `micro`) ; remplacer par `colors.*`.
- ✅ **ORA-041 · [DS] `Vibration.vibrate(400)` brut contourne le toggle settings.** ~~`timer.tsx:96`~~ → **FAIT (14/06)** : helper central `lib/haptics.ts` (taxonomie `rules/ui.md` + gating `settings_vibration`), `timer.tsx` appelle `timerDone()` + `refreshHapticsSetting()`. 8 tests.

### Produit & tests

- **ORA-042 · [PRODUIT] Aucune boucle de ré-engagement.** `expo-notifications` absent → pas de push (« PR prédit », « streak en danger ») ; partage Stories 9:16 annoncé non codé ; pas de deep links de partage. Rétention J30 plancher. **Action :** push + export Stories (`makeImageSnapshot` + Share Sheet) + deep links.
- **ORA-043 · [DEVOPS] Pas d'OTA (`expo-updates` absent).** Chaque hotfix passe par les stores (24-72 h). **Action :** `expo-updates` + channels EAS (déjà configurés).
- 🟡 **ORA-044 · [DEVOPS] Lint CI tolère 400 warnings.** `--max-warnings 400 → 236 → 232` (ratchet : tout nouveau warning bloque) ; `no-explicit-any` déjà passé en `error` (Vague 2). **Reste** : descendre vers 0 (232 résiduels, surtout `react-native/no-inline-styles`) + `no-empty`/`no-constant-condition` en `error`.
- **ORA-045 · [TESTS] 0 % composant / intégration / e2e.** `__tests__/` = 175 tests de logique pure, dont certains **recopient** la fonction testée (`prsBuildPodium.test.ts:12-127`, `sessionUx.test.ts:34-58`) → testent une copie, pas le prod. `@testing-library/react-native`, Detox/Maestro absents. Aucun des bugs P0 (ORA-005/006/007) n'est couvert. **Action :** render tests sur session/summary + smoke e2e Maestro (login → log set → save) ; tester le code importé.
- **ORA-046 · [PRODUIT] Apple/Google Sign-In absents.** Seul email/password. Attendu sur une app sociale grand public. **Action :** ajouter Apple Sign In (obligatoire dès qu'un autre social login existe).

---

## P2 — MINEURS / DETTE

- ✅ **ORA-060 · [SÉCURITÉ] Adapter SecureStore ne purge pas les chunks orphelins.** ~~`supabase.ts:40-46`~~ → **FAIT (14/06)** : adaptateur extrait dans `lib/secureStoreAdapter.ts`, `setItem` purge via `deleteChunksFrom(key, chunks.length)`. Gravité réévaluée : sans purge, `getItem` re-concaténait les fragments d'un JWT précédent plus long → **token corrompu**. 5 tests.
- ✅ **ORA-061 · [DATA] `initDB` sans versioning.** ~~`db.ts:10-33`~~ → **FAIT (14/06)** : `migrate()` via `PRAGMA user_version` (`SCHEMA_VERSION = 1`) + migrations incrémentales idempotentes.
- ✅ **ORA-062 · [DATA] `local_sessions` sans PRIMARY KEY.** ~~`db.ts:26`~~ → **FAIT (14/06)** : `id TEXT PRIMARY KEY` + migration v1 reconstruit la table en dédupliquant. 4 tests.
- ✅ **ORA-063 · [DATA] Ghost codé en dur à 30 j.** ~~`session.tsx:820`~~ → **FAIT (14/06)** : `plan === 'premium' ? 99999 : 30`, plan caché localement (`'user_plan'` AsyncStorage) → zéro réseau en séance.
- **ORA-064 · [A11Y] Contraste `textTertiary` 2,6:1 < WCAG AA.** `#4A4A5A` sur `#0A0A0F`, utilisé 143× dont du contenu réel (`library.tsx:417`). **Action :** réserver au décoratif ou éclaircir le token.
- **ORA-065 · [DS] `fontSize` inline 9-11px hors échelle DS + spacing off-grid sporadique.** ~40 micro-textes < `caption` (12px) ; `gap:5/6`, `padding:3` épars. **Action :** token `micro` (10px) ; mapper sur `spacing.s*`.
- **ORA-066 · [DS] `Easing.linear` sur loaders.** `index.tsx:42`, `feed.tsx:1732` — rotations continues (convention OK mais règle DS absolue). **Action :** documenter l'exception ou `withRepeat` sans easing perceptible.
- **ORA-067 · [PERF] Micro-coûts render.** `Dimensions.get('window')` à chaque render (`feed.tsx:802,418`) ; `fetchFeed` relancé à chaque focus (`feed.tsx:1998`) ; 7 polices bloquantes au démarrage (`_layout.tsx:44`). **Action :** constantes module / cache TTL court.
- **ORA-068 · [CODE] ~11 `console.*` résiduels.** `myo.ts`, `prs.tsx` (4), `feed.tsx` (4)… **Action :** logger centralisé conditionné `__DEV__` → PostHog/Sentry.
- **ORA-069 · [SÉCURITÉ] Politique mot de passe faible.** `register.tsx:82-83` — min 8, aucune autre exigence. **Action :** activer la protection « leaked password » Supabase (HIBP).
- **ORA-070 · [DEVOPS] Versioning `app.json` vs `eas.json` ambigu + pas de `.nvmrc`/`engines`/Dependabot/SAST.** `app.json` fige `buildNumber/versionCode` alors que source = `remote`. **Action :** retirer ces clés d'`app.json` ; `.nvmrc` + `engines` ; activer Dependabot + `npm audit`/CodeQL.
- **ORA-071 · [DETTE] Artefacts de dev dans le repo.** `apply_fix.py`, `to_be_fixed.md`, `Priorites.md`, `design_app.md` (racine), `mobile_app/tsc_out.txt` (périmé). **Action :** nettoyer avant due diligence.
- **ORA-072 · [PRODUIT/CONFORMITÉ] App Privacy labels + compte de test à préparer.** Pour le review Apple/Google : déclarer collecte santé/localisation/photos, fournir un compte de test.

---

## Points positifs vérifiés (à préserver)

- Résidence EU (Supabase Frankfurt + PostHog `eu.i.posthog.com`), tokens en SecureStore, requêtes paramétrées (**aucune injection SQL** — vérifié), `is_public` DEFAULT `false`, **aucune coordonnée lat/lng précise écrite** (seule `location_city`).
- Conformité expo-gl exemplaire (`onContextCreate` synchrone, `MeshPhongMaterial`, `endFrameEXP`, `setPixelRatio(1)`), batching Supabase via `Promise.all` quasi partout, cleanup Reanimated rigoureux, paths Skia majoritairement memoïsés, `getItemLayout` sur le WheelPicker.
- 175 tests de logique pure honnêtes (cas limites sérieux, aucun `.only`/`.skip`).
- Myo **câblé sur vraies données** côté `summary.tsx` et `feed/[id].tsx` (≠ ce qu'indique la doc) — seule la baseline reste mockée (cf. ORA-026).
- Onboarding < 60 s tenu (`onboarding/first-set.tsx` précharge un exo et démarre direct).

### Faux positifs écartés (vérifiés pendant l'audit)

- `crypto.randomUUID()` : **polyfillé** dans `supabase.ts:6-22` (+ `react-native-get-random-values`) → `summary.tsx` ne crashera pas. Non-problème.
- « Log d'un set avant chargement des top3 » : `addExercise` n'ajoute l'exercice au state (`WorkoutContext.tsx:217`) **qu'après** le `await` → la carte n'existe pas avant. Race inexistante (le vrai risque restant = PR manqué offline, cf. ORA-027).
- `tsc_out.txt` indiquait une erreur `session.tsx(176,5)` : **déjà corrigée**, artefact périmé. La seule erreur tsc réelle est `myo-orb.tsx:242` (ORA-009).

---

## Séquencement

**Phase développement (maintenant)** → voir **⚑ Plan de correction — phase DÉVELOPPEMENT** en haut du document (Vague 0 → 1 → 2 + Definition of Done).

**Phase pré-lancement (plus tard)** — ordre indicatif une fois le dev stabilisé :
1. **Conformité/sécurité (déblocage store)** : ORA-001, 002, 003, 072 + ORA-021/022.
2. **Fiabilité release** : ORA-004, 008 (CI), 011 (Sentry), 043.
3. **Monétisation + rétention** : ORA-010, 042, 046.
4. **Perf feed + scaling** : ORA-028/029/030.
5. **a11y + i18n (rétrofit du legacy)** : ORA-038, 039.
6. **Dette continue** : P2 restant.
