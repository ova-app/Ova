# 1 — C'est quoi Orava ?

## En une phrase

Orava est une **application mobile de suivi de musculation** : tu logges tes
séances (exercices, séries, poids, répétitions), et l'app transforme ces données
brutes en **visualisations et insights** qu'aucune autre app fitness ne propose.

C'est une app **iOS + Android**, écrite une seule fois en React Native (voir
[03-la-stack-expliquee.md](./03-la-stack-expliquee.md)).

---

## Le problème qu'on résout

Les apps de musculation existantes (Strong, Hevy…) sont des **tableurs déguisés** :
tu notes tes séries, tu vois des graphiques de progression. C'est utile mais froid.

Orava parie sur **trois choses** :

1. **Logger une série doit être instantané et plaisant** — c'est l'action la plus
   répétée de l'app, elle doit être parfaite (zéro friction, retour haptique, design soigné).
2. **Tes données méritent une vraie signature visuelle** — la **Myo** (voir plus bas),
   un relief 3D unique qui résume ta séance.
3. **L'app doit te connaître mieux que toi** — Mode Fantôme (te comparer à ton
   meilleur toi passé) et Moteur Prédictif (« tu battras ton record dans ~9 jours »).

---

## Les 4 idées fortes (le vocabulaire à connaître)

Tu croiseras ces mots partout dans le code. Ils sont détaillés dans
[05-concepts-metier.md](./05-concepts-metier.md), mais voici l'intuition :

### 🧬 La Myo (la signature)
À la fin d'une séance, l'app calcule une **signature de 53 dimensions** réparties en
**8 familles** (Volume, Intensité, Structure, Récup, Perf, Régularité, Muscles, Temps).
Ces chiffres sont affichés comme un **relief 3D** (un « orbe » qu'on fait tourner) et
comme des **graphiques 2D**. C'est la récompense visuelle de ta séance.

### 🏆 Les PR (Personal Records)
Un **PR** = un record personnel. Orava en suit **4 types** (record de charge, de série,
d'exercice, de séance) et chacun a un **podium** : 🥇 or / 🥈 argent / 🥉 bronze.
Battre un record déclenche un flash visuel + une vibration.

### 👻 Le Mode Fantôme
Pendant que tu logges, l'app affiche discrètement ta **meilleure performance passée**
sur le même exercice (« le fantôme »). Tu te bats contre toi-même, sans interruption.

### 🔮 Le Moteur Prédictif
À partir de ton historique, l'app calcule une **prédiction** : « PR probable dans N jours,
confiance X % ». Calcul fait **sur le téléphone**, pas sur un serveur.

---

## Pour qui ?

- **Pratiquants de musculation** sérieux qui logent déjà leurs séances ailleurs.
- Modèle **freemium** : une version gratuite + un abonnement **Pro** (RevenueCat, prévu Phase 2)
  qui débloque des fonctionnalités (Mode Fantôme illimité, ADN Athlétique complet, export Stories…).

---

## Où en est le projet ? (les « Phases »)

Le développement est découpé en phases. La **source de vérité** est
[`Orava___Master_Plan_v4.md`](../Orava___Master_Plan_v4.md). État résumé (juin 2026) :

| Phase | Contenu | État |
|---|---|---|
| **Phase 0** | Fondations : stockage local, SQLite, analytics, Myo famille muscles | ✅ Fait |
| **Phase 1** | MVP : design system Figma, Mode Fantôme, haptique, onboarding utilisateur | ✅ Fait |
| **Phase 2** | Charts Skia, fonts, Moteur Prédictif, (à venir : paywall, sons, animations Rive) | 🚧 En cours |
| **Phase 3** | ADN Athlétique, marketplace de programmes coachs | ⏳ Plus tard |

> ⚠️ Vocabulaire : « v1 » désigne l'ancienne version dont on garde **la logique**
> (algorithme Myo, machine d'état des séances, schéma Supabase) ; « v4 » est la
> **reconstruction visuelle complète** par-dessus ces fondations.

---

## Important : l'app n'est PAS une app de coaching

Orava **ne dit pas** quoi faire à la salle. Elle **observe, mesure et révèle**.
Pas de programme imposé, pas de « fais 3×10 ». Le produit est un **miroir intelligent**,
pas un coach. Garde ça en tête quand tu proposes des features.

➡️ Suite : [02-demarrage.md](./02-demarrage.md) — installer et lancer l'app.
