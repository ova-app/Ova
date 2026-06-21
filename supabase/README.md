# Base de données Supabase — Orava

Projet Supabase : **ORAVA** (région Frankfurt `eu-central-1`).
Référence schéma complète (14 tables, RPCs, RLS, vocabulaire contrôlé) :
[`.claude/rules/database.md`](../.claude/rules/database.md).

---

## ⚠️ État de la reproductibilité (à lire)

Le schéma de base (14 tables + RPCs `get_*`) a été créé **manuellement dans le
dashboard Supabase** à l'époque du v1 — il **n'existe pas encore de dump baseline**.
Conséquence : `supabase db reset` sur une base vide **ne reconstruit pas** tout le
schéma à partir de ce dossier tant que le baseline n'est pas généré (voir plus bas).

Les fichiers de `migrations/` ci-dessous sont les **changements incrémentaux documentés**.

| Migration | Contenu | Statut prod |
|---|---|---|
| `20260519120000_exercise_muscles_mapping.sql` | 113 exercices × mappings muscles/fascicules | ✅ appliquée |
| `20260519130000_myo_famille6_dims.sql` | Myo Famille 6 — 17 dims + `myo_muscle_dims` | ✅ appliquée |
| `20260614120000_create_workout_rpc.sql` | RPC transactionnelle `create_workout` | ⚠️ **NON appliquée** |
| ORA-082 à ORA-085 (appliquées hors `migrations/`, SQL Editor manuel) | `claims.scope` étendu (week/month/custom) · `claim_likes` + `claim_comments` · `users.featured_photo` · `users.bio` | ✅ appliquées (21/06/2026) |

> `planned/` = migrations **rédigées mais non encore appliquées** — **pas** dans
> `migrations/`, donc jamais exécutées par le CLI. Les déplacer dans `migrations/`
> (avec préfixe timestamp) le jour de leur application.

| Planned | Contenu | À faire |
|---|---|---|
| `ora020_rls_write_hardening.sql` | Durcissement RLS écritures (11 tables, WITH CHECK/USING) | ⚠️ **À appliquer APRÈS revue** du diagnostic `pg_policies` (en bas du fichier) |
| `ora023_comment_length_check.sql` | CHECK `comments.content` ≤ 500 | ⚠️ À appliquer |
| `claims_and_featured_pr.sql` | `users.featured_pr` (jsonb) + tables `claims` + `claim_votes` (+RLS) — vitrine sociale du profil (called-shot + PR vedette) | ⚠️ **À appliquer** (client déjà codé : profil/feed/summary) |
| `profile_name_fields.sql` | `users.first_name` + `last_name` + `name_display` — nom décomposé (prénom/nom) + préférence d'affichage profil. Backfill du `full_name` existant | ⚠️ **À appliquer** (client déjà codé : edit-profile/profile, lecture/écriture isolée no-op pré-migration) |
| `ora077_resolve_claims_cron.sql` | Cron horaire `resolve_overdue_claims()` — expiration serveur des claims (ORA-077) | ⚠️ À appliquer **après** `claims_and_featured_pr.sql` (active pg_cron) |
| `phase3_athletic_dna.sql` · `phase3_programs_marketplace.sql` | Phase 3 (ADN, marketplace) | ⏳ à l'implémentation |

---

## Appliquer la migration en attente

`create_workout` doit être appliquée pour que le save de séance fonctionne.
Le plus simple aujourd'hui : copier le contenu de
`migrations/20260614120000_create_workout_rpc.sql` dans le **SQL Editor** du
dashboard Supabase et exécuter.

---

## Mettre en place un workflow reproductible (recommandé)

Une seule fois, pour que la base soit reconstructible et que les futures
migrations passent par le CLI :

```bash
# 1. Installer le CLI Supabase
winget install Supabase.CLI        # Windows
#   ou : scoop install supabase / brew install supabase/tap/supabase

# 2. Se connecter + lier le projet distant (ref dans l'URL du dashboard)
supabase login
supabase link --project-ref <PROJECT_REF>

# 3. Générer le BASELINE depuis la base de prod (capture les 14 tables + RPCs
#    créés à la main). Le préfixe 00000000000000 le fait passer en premier.
supabase db dump --schema public -f supabase/migrations/00000000000000_baseline.sql

# 4. Marquer les migrations déjà appliquées comme telles (évite de les rejouer)
supabase migration repair --status applied 20260519120000
supabase migration repair --status applied 20260519130000
```

Après ça :
```bash
supabase db push      # applique les migrations en attente (create_workout) sur le distant
supabase db reset     # reconstruit une base locale identique (dev)
supabase migration new <nom>   # créer une nouvelle migration
```

---

## Edge Functions

| Fonction | Rôle | Statut |
|---|---|---|
| `functions/resolve-claims/` | Expiration serveur des claims + futur hook push (ORA-077 / ORA-078). Alternative **extensible** au cron SQL `ora077_resolve_claims_cron.sql` — n'en déployer qu'**un** des deux. | ⚠️ Non déployée (`supabase functions deploy resolve-claims`) |

> `SERVICE_ROLE` est injecté à l'exécution par Supabase — **jamais** dans le repo (cf. règle ci-dessous).

---

## Règle d'équipe

- **Toute modif de schéma = un fichier dans `migrations/`** (jamais uniquement dans le dashboard).
- Documenter la migration dans `.claude/rules/database.md` **avant** de coder le client.
- Ne jamais éditer une migration déjà appliquée — en créer une nouvelle.
- Clé `service_role` : **jamais** dans le repo ni dans l'app mobile.
