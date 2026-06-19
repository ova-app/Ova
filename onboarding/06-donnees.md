# 6 — Les données : où elles vivent et comment elles circulent

Orava jongle avec **deux bases** : une dans le cloud (Supabase) et une sur le téléphone
(SQLite). Comprendre **qui sert à quoi** est essentiel.

> Schéma complet des tables, RPC, migrations : [`.claude/rules/database.md`](../.claude/rules/database.md).

---

## La philosophie : « offline-first » et « zéro réseau en séance »

Deux règles non négociables :

1. **Pendant une séance active, AUCUN appel réseau.** Tout est en RAM + stockage local.
   Pourquoi ? À la salle, le réseau est mauvais, et une latence en plein log de série
   casserait l'expérience la plus critique de l'app.
2. **Rien n'est persisté dans Supabase avant le « save »** (écran `summary.tsx`). Tant
   que tu n'as pas validé ta séance, elle n'existe que sur ton téléphone.

Conséquence : le **local est la source de vérité pendant la séance**, le cloud prend le
relais **après**.

---

## Les 3 couches de stockage

| Couche | Techno | Contient | Quand |
|---|---|---|---|
| **Cache clé-valeur** | `lib/storage.ts` (AsyncStorage + mémoire) | brouillon de séance, réglages | en continu, crash-safe |
| **Base locale** | SQLite (`lib/db.ts`) | historique des séries/séances (pour Fantôme + Prédictif) | écrit au save, lu hors ligne |
| **Cloud** | Supabase (PostgreSQL) | **toutes** les données : users, séances, feed social, signatures Myo | après le save |
| **Coffre-fort** | expo-secure-store | le token d'auth (chiffré) | à la connexion |

---

## Supabase — le backend

C'est un **PostgreSQL managé** avec authentification, sécurité par ligne (RLS) et
fonctions SQL. **14 tables** au total. Les principales :

```
users              → comptes (email, username, plan free/premium, unité kg/lbs…)
workouts           → une séance (durée, volume total, public/privé, lieu, PR séance…)
workout_exercises  → un exercice dans une séance (ordre, PR exercice…)
workout_sets       → une série (poids, reps, RPE, type, PR charge/série…)
exercises          → le catalogue (113+ exercices : nom FR/EN, groupe musculaire…)
exercise_muscles   → quel exercice sollicite quel muscle, à quel % (pour la Myo)
muscles            → les 10 muscles de référence + leur dimension Myo
myo_signatures     → la signature Myo calculée par séance (les 53 dims)
body_metrics       → suivi du poids de corps dans le temps
follows / likes / comments → la couche sociale (feed)
gyms               → les salles
workout_metrics    → métriques calculées par séance (JSON)
```

### La sécurité : RLS (Row Level Security)
Des règles SQL garantissent qu'un user ne lit/écrit **que ses propres lignes**. C'est ce
qui permet à l'app cliente d'utiliser l'`anon_key` sans danger : même avec la clé, la
base refuse de renvoyer les données d'autrui. **C'est pour ça que la clé `service_role`
(qui ignore la RLS) ne doit JAMAIS être dans l'app.**

### Les RPC (fonctions appelables)
Des fonctions SQL qu'on appelle depuis l'app comme une API. La plus importante :
**`create_workout(payload)`** — enregistre une séance entière (workout + exercices + séries)
en **une seule transaction** (tout ou rien). Avantages :
- pas de séance « à moitié sauvegardée » si le réseau coupe ;
- **idempotente** : relancer avec le même `id` ne crée pas de doublon (protège contre le double-save).

> ⚠️ Cette RPC doit être **appliquée côté Supabase** pour que le save fonctionne (le code
> client l'appelle déjà). C'est un point de vigilance noté dans le backlog.

---

## SQLite local (`lib/db.ts`) — le moteur du hors-ligne

Une petite base sur le téléphone, **2 tables** :

```sql
local_sets      → chaque série loggée (exercice, poids, reps, volume, date)
local_sessions  → chaque séance (id = workout_id Supabase, volume total, date)
```

- **Alimentée en même temps que le save Supabase** (dans `summary.tsx`).
- **Lue exclusivement** par le **Mode Fantôme** (`lib/ghost.ts`) et le **Moteur Prédictif**
  (`lib/predictor.ts`) — deux features qui doivent marcher sans réseau.
- Un **backfill** (`backfillLocalFromSupabase`) la réamorce depuis le cloud si elle est
  vide (ex. nouvelle installation) — lancé au démarrage, non bloquant.

---

## Le flux de sauvegarde d'une séance (étape par étape)

C'est le moment où le local rejoint le cloud. Dans `app/workout/summary.tsx`, au save :

```
1. (pendant la séance) tout est en RAM + cache storage (crash-safe)
        │
2. l'utilisateur valide le résumé (nom, photo, public/privé)
        │
3. ── APPEL RÉSEAU N°1 (le seul bloquant) ──────────────────
   supabase.rpc('create_workout', payload)   → transaction tout-ou-rien
        │  (idempotent : un retry ne double pas)
        ▼
4. ── tout le reste est « best-effort », JAMAIS bloquant ───
   ├─ insertion dans SQLite local (local_sets, local_sessions)
   ├─ workout_metrics (métriques calculées, JSON)
   ├─ saveMyoSignature() (la signature Myo des 53 dims)
   └─ upload de la photo
        │
5. computePrediction() en arrière-plan (prédiction du prochain PR)
```

Le mot **« best-effort »** est clé : si l'upload photo échoue, la séance est quand même
sauvegardée. **Seule la RPC `create_workout` peut faire échouer le save.** Tout le reste
peut rater silencieusement sans casser l'essentiel.

---

## Règle absolue avant de toucher à la base

> **Toute modification du schéma Supabase doit être documentée dans
> [`.claude/rules/database.md`](../.claude/rules/database.md) AVANT de coder, et appliquée
> côté Supabase.** Les migrations SQL versionnées vivent dans
> [`supabase/migrations/`](../supabase/migrations/) (appliquées) et `supabase/planned/` (futures).

Pourquoi si strict ? Parce qu'une migration mal pensée casse les données de **vrais
utilisateurs**, et qu'à deux sur le repo, la base doit rester un contrat clair et partagé.

### Détails à connaître (pièges réels)
- La table de muscles utilise la colonne **`muscle_group`** (pas `group`).
- Les `muscle_group` dans `exercises` sont **en français** (`pectoraux`, `dos`…), alors
  que dans `muscles` ils sont **en anglais** (`chest`, `back`…). Attention au mapping.
- `exercise_muscles.activation_pct` est sur une échelle **0-100** (pas 0-1).
- `is_public` démarre **toujours à `false`** (une séance est privée par défaut).

➡️ Suite : [07-design-system.md](./07-design-system.md) — les règles visuelles.
