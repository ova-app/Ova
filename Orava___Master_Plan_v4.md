# Orava : Master Plan & Architecture de Référence — v4.0

Ce document est le **référentiel unique (Single Source of Truth)** du projet Orava. Il couvre la vision stratégique, l'architecture technique, la feuille de route, le découpage en tâches précises, le workflow outils & IA, et les sources d'inspiration design. Toute décision technique ou esthétique doit s'y conformer.

---

## 1. Vision Stratégique et Positionnement

Orava n'est pas un simple utilitaire de fitness, c'est un **écosystème lifestyle premium** axé sur la donnée et l'esthétique. L'objectif est de fournir une interface d'une simplicité absolue (Progressive Disclosure) dissimulant une profondeur analytique de haut niveau. L'expérience doit générer un effet "Wow" continu par sa fluidité, l'absence de bugs (frictionless) et la beauté de sa visualisation de données (Myo 3D).

**Proposition de valeur en une phrase :**
> *Orava transforme chaque séance en une œuvre de données — la seule app de fitness qui vous connaît mieux que vous-même.*

**Les quatre piliers de différenciation d'Orava :**
1. **Le Myo 3D** — une signature visuelle unique et partageable par séance.
2. **Le Mode Fantôme** — s'entraîner contre la meilleure version de soi-même, en temps réel.
3. **Le Moteur Prédictif** — Orava annonce vos futurs records avant qu'ils arrivent.
4. **L'ADN Athlétique** — une empreinte algorithmique personnelle qui devient votre identité sportive portable.

Ces quatre piliers se renforcent mutuellement : le Myo rend l'app belle, le Fantôme la rend addictive, le Prédictif la rend virale, l'ADN la rend indispensable et irremplaçable.

---

## 2. Analyse Concurrentielle

| Concurrent | Point fort | Faiblesse exploitable par Orava |
| :--- | :--- | :--- |
| **Strong / Hevy** | Tracking solide, communauté engagée | UX générique, zéro esthétique, données plates, aucune prédiction |
| **Whoop / Garmin** | Données biométriques riches | Nécessite hardware, pas de focus musculation, pas de social |
| **MyFitnessPal** | Base nutrition massive | Aucune connexion effort ↔ nutrition, UX datée |
| **Strava** | Réseau social fitness puissant | Exclusivement cardio/outdoor, pas de salle |

**Le vide qu'Orava occupe :** aucun acteur ne combine (1) tracking musculation frictionless, (2) visualisation de données belle et partageable, (3) intelligence prédictive personnalisée, (4) identité sportive portable.

**Avantage défensif à construire :**
- Court terme (0–6 mois) : le Myo 3D et le Mode Fantôme créent une expérience immédiatement différente.
- Moyen terme (6–18 mois) : le Moteur Prédictif crée une relation émotionnelle unique avec l'app.
- Long terme (18 mois+) : l'ADN Athlétique crée un switching cost irrationnel — quitter Orava signifie perdre son identité sportive accumulée.

---

## 3. Modèle de Monétisation

### 3.1. Structure tarifaire

| Tier | Prix | Ce qui est inclus |
| :--- | :--- | :--- |
| **Orava Free** | Gratuit | Tracking illimité, Myo 3D basique (5 variables), Mode Fantôme (30 jours d'historique), historique 90 jours, feed social en lecture |
| **Orava Pro** | 9,99 €/mois ou 79 €/an | Myo 3D complet (41 variables), Mode Fantôme illimité, Moteur Prédictif complet, historique illimité, analytics avancés, export Stories, feed social complet |
| **Orava Coach** | 24,99 €/mois | Tout Pro + ADN Athlétique partageable avec clients, dashboard multi-athlètes, vente de programmes, analytics agrégés clients |

**Logique des upsells :**
- Free → Pro : Mode Fantôme limité à 30 jours (frustration douce) + Moteur Prédictif verrouillé (l'utilisateur voit "PR prédit dans 3 jours" sans pouvoir y accéder).
- Pro → Coach : l'ADN Athlétique du client partageable en 1 tap est le différenciateur du tier Coach.

### 3.2. Revenus additionnels (Phase 3+)

- **Commission marketplace** : 15 % sur la vente de programmes par les coachs.
- **Pass Orava** : modèle B2B avec les salles partenaires.
- **OravaFeed** : module nutrition inclus en Pro, ou 3,99 €/mois séparément.

### 3.3. Objectifs financiers indicatifs

| Horizon | Utilisateurs actifs | Taux conversion Pro | ARR cible |
| :--- | :--- | :--- | :--- |
| 12 mois (post-launch) | 10 000 | 8 % | ~95 000 € |
| 24 mois | 50 000 | 10 % | ~500 000 € |
| 36 mois | 150 000 | 12 % | ~1 800 000 € |

---

## 4. Ambitions de l'Écosystème

### 4.1. OravaSports — Le Cœur Technologique

- **Tracking Parfait :** WheelPickers intelligents avec pré-remplissage automatique. L'utilisateur valide d'un tap, jamais ne saisit depuis zéro.
- **Le Myo 3D :** Céramique 3D interactive déformée par des variables analytiques (8 familles). MVP : 5 variables. Pro : 41 variables complètes.
- **Système de PR 4D :** Records sur 4 niveaux (Charge, Série, Exercice, Séance) via Podium (Or, Argent, Bronze). Partage natif Stories 9:16.
- **Réseau Social :** Feed communautaire (likes, commentaires, Myo 3D) + marketplace de programmes coachs.
- **Cartographie Premium :** Carte des salles partenaires + Pass Orava cross-salles (Phase 4).

### 4.2. OravaFeed — L'Extension Lifestyle

- Assistant nutritionnel proactif (macros adaptés à l'effort de la semaine).
- Listes de courses dynamiques basées sur les objectifs.
- Module dès la Phase 3, intégration native Phase 4.

### 4.3. Le Mode Fantôme — S'entraîner contre soi-même

**Concept :** pendant la séance, Orava superpose en temps réel la meilleure performance passée sur le même exercice. Compétition uniquement contre soi — psychologiquement plus puissant qu'un leaderboard social, accessible à tous les niveaux.

**Implémentation :** barre translucide secondaire sur le WheelPicker + indicateur discret `↑ +2,5 kg vs meilleure séance`. Si le fantôme est battu sur un exercice : barre vire à l'or + haptic doux. Données 100 % locales (SQLite), disponibles dès la 2e séance.

**Versions :** Free = 30 derniers jours. Pro = historique illimité + sélection manuelle du fantôme de référence.

### 4.4. Le Moteur Prédictif — Orava sait avant vous

**Concept :** régression linéaire pondérée sur les 90 derniers jours de données locales. Annonce les futurs records avant qu'ils arrivent. Notification : *"PR prédit dans 6 jours — probabilité 74 %."* Quand la prédiction se réalise : double célébration PR + validation Orava comme oracle personnel.

**Implémentation :** calcul on-device (aucune donnée réseau), en arrière-plan post-séance. Variables : progression brute kg/reps + fréquence d'entraînement + fatigue accumulée (volume 7 derniers jours). Seuil d'affichage minimum : 60 % de confiance.

**Viralité :** Story automatique "prédiction réalisée" = Myo 3D + carte de prédiction + "Orava l'avait vu". Contenu le plus viral de l'espace fitness.

**Versions :** Free = notification visible, détail verrouillé. Pro = courbes de projection + historique des prédictions.

### 4.5. L'ADN Athlétique — L'empreinte sportive irremplaçable

**Concept :** après 90 jours (ou 20 séances minimum), Orava génère une empreinte algorithmique unique en 6 dimensions capturant le *style* d'athlète, pas juste les chiffres. Devient un CV sportif portable et vérifiable.

**Les 6 dimensions :**
1. Profil de force (ratios bench/squat/deadlift/OHP + percentiles)
2. Signature de volume (radar 8 groupes musculaires)
3. Style de progression (linéaire / ondulante / par blocs)
4. Indice de régularité (fréquence + variance + séries sans interruption)
5. Vitesse de récupération (deltas avant/après semaines de repos)
6. Empreinte temporelle (heures, jours, tempo circadien)

**Visualisation :** carte Skia unique par utilisateur — formes géométriques déterministes. Deux athlètes similaires = ADN visuellement proches mais jamais identiques.

**Switching cost :** après 6 mois, l'ADN est irremplaçable et non exportable. Quitter Orava = perdre son histoire sportive. Le mécanisme de rétention le plus puissant, parce qu'émotionnel.

**Versions :** Free = aperçu 2/6 dimensions floutées. Pro = ADN complet + historique mensuel. Coach = dashboard agrégé de tous les athlètes.

---

## 5. Les "Règles d'Or" de l'Architecture

1. **Zéro Base de Données pendant l'Effort :** WorkoutContext en RAM + MMKV. Sync Supabase uniquement en arrière-plan post-séance. Aucun appel réseau ne bloque l'UI.

2. **Strict Policy des Dossiers :** Architecture `app/` (Expo Router), UI inline, état par Contextes. Zéro dossier poubelle. Revue d'architecture obligatoire avant chaque merge.

3. **Performance Graphique Natively Built :** 2D via Skia/StyleSheet, 3D via `expo-gl` + `MeshPhongMaterial`. Refus des librairies généralistes lourdes.

4. **Règle du Myo Progressif :** 5 variables visuellement parfaites avant d'ajouter les 36 suivantes. Aucune complexité ajoutée si elle dégrade sous 60 FPS.

5. **Offline First par défaut :** dégradation visible, jamais silencieuse. Mode Fantôme, prédictions locales et ADN partiel disponibles hors-ligne.

6. **Intelligence On-Device :** Moteur Prédictif et Mode Fantôme tournent exclusivement sur l'appareil. La confidentialité est une feature.

---

## 6. La Stack Technologique ("L'Armurerie")

| Domaine | Outil / Technologie | Rôle & Justification |
| :--- | :--- | :--- |
| **Front-end & Mobile** | React Native + Expo Router | Navigation native, TypeScript strict, multi-plateforme. |
| **Animation & UI** | Reanimated + Skia | Animations 60 FPS, graphiques analytiques, rendu ADN Athlétique. |
| **Moteur 3D** | Three.js (via expo-gl) | Céramique Myo 3D via algorithmes mathématiques temps réel. |
| **Persistance locale** | MMKV + SQLite (expo-sqlite) | MMKV = état de session ultra-rapide. SQLite = historique structuré (Fantôme, Prédictif). |
| **Intelligence locale** | Régression TypeScript | Moteur Prédictif on-device. TFLite si modèle complexifié. |
| **Backend & BDD** | Supabase (PostgreSQL, Francfort) | Auth, schéma DB, Edge Functions (ADN hebdomadaire). RGPD-compliant. |
| **Paiements** | RevenueCat | Abonnements In-App iOS + Android. Intégré Phase 0 en sandbox. |
| **Analytics** | PostHog (self-hostable, EU) | Funnels, rétention, feature flags, A/B tests paywall. |
| **Animations célébration** | Rive | Animations PR/Podium exportées en `.riv`, runtime React Native. |
| **Design & Gestion** | Figma + Linear | Design System Pixel Perfect. Gestion tâches Big Tech. |

---

## 7. Feuille de Route

### Phase 0 — Fondations invisibles (2 semaines)
Poser toute l'infrastructure avant d'écrire une seule feature visible.

Supabase (Auth + schéma + RLS) · RevenueCat sandbox · PostHog + feature flags · Expo Router structure validée · MMKV + SQLite schéma local · CI/CD GitHub Actions → EAS Build.

### Phase 1 — MVP "Atomic" + Mode Fantôme (7–9 semaines)
Une app de tracking parfaite, addictive dès la 2e séance, zéro réseau pendant l'effort.

WorkoutContext complet · WheelPickers 60 FPS · Pré-remplissage auto · PR 4D · Myo 3D v0.1 (5 variables) · **Mode Fantôme v1.0** · Mode hors-ligne total · Onboarding < 60 secondes.

**Critère de sortie :** un utilisateur beta mentionne spontanément le Mode Fantôme dans son retour après 5 séances.

### Phase 2 — Vernis Premium + Moteur Prédictif (5–7 semaines)
Effet "Waouh" visuel et sensoriel. Monétisation activée. Première boucle virale.

Myo 3D v1.0 (41 variables) · Export Stories 9:16 · **Moteur Prédictif v1.0** · Haptics + Sound Design · Animations Podium (Rive) · Design System complet · Paywall Pro activé · A/B test RevenueCat.

**Critère de sortie :** 100 abonnés Pro. Au moins 1 Story "prédiction réalisée" partagée publiquement.

### Phase 3 — Social, Croissance & ADN Athlétique (9–12 semaines)
Plateforme communautaire. Switching cost émotionnel activé.

Feed social · Marketplace programmes · **ADN Athlétique v1.0** · Moteur Prédictif v1.1 · Système de référencement · OravaFeed module.

**Critère de sortie :** rétention J-30 ≥ 28 %. Au moins 5 coachs actifs sur le tier Coach.

### Phase 4 — L'Écosystème Vertical (12+ semaines)
Devenir l'assistant de vie central du pratiquant.

OravaFeed intégré · Mapbox (carte salles) · Pass Orava B2B · ADN Athlétique v2.0 (percentiles inter-utilisateurs).

---

## 8. Découpage en Tâches Précises

### Phase 0 — 14 tâches (2 semaines)

**Supabase**
- [ ] Créer le projet Supabase (région Francfort eu-central-1)
- [ ] Configurer Auth : magic link + Apple Sign In + Google OAuth
- [ ] Écrire le schéma DB complet (14 tables + relations + indexes)
- [ ] Activer et tester Row Level Security sur toutes les tables

**Expo + Architecture**
- [ ] Init projet Expo avec TypeScript strict + Expo Router v3
- [ ] Définir et documenter la structure de dossiers `app/` (policy stricte)
- [ ] Configurer ESLint + Prettier + Husky (pre-commit hook)
- [ ] Mettre en place CI/CD : GitHub Actions → EAS Build (iOS + Android)

**Persistance locale**
- [ ] Installer et configurer MMKV pour le WorkoutContext en session
- [ ] Définir le schéma SQLite local (tables : sessions, sets, exercises, ghost_refs, predictions)

**SDK tiers**
- [ ] Intégrer RevenueCat : produits Pro + Coach définis, mode sandbox actif
- [ ] Intégrer PostHog : définir la taxonomie des 20 événements clés
- [ ] Configurer les feature flags PostHog (paywall A/B, Prédictif on/off)
- [ ] Valider le hello world sur simulateur iOS + device Android physique

---

### Phase 1 — 28 tâches (7–9 semaines)

**WorkoutContext — moteur de séance**
- [ ] Définir les types TypeScript : `Session`, `Exercise`, `Set`, `RestTimer`, `WorkoutState`
- [ ] Implémenter la machine d'état : `idle → active → rest → done → summary`
- [ ] Persistance MMKV temps réel — crash = zéro perte de données
- [ ] Sync Supabase en arrière-plan post-séance (expo-background-fetch)
- [ ] Détection des PR 4 niveaux : Charge, Série, Exercice, Séance globale

**UI — Écrans de séance**
- [ ] Composant WheelPicker poids (60 FPS, Reanimated, physics iOS native)
- [ ] Composant WheelPicker reps (60 FPS, Reanimated)
- [ ] Pré-remplissage automatique depuis SQLite (dernier poids + reps utilisé)
- [ ] Composant Rest Timer (compte à rebours animé, skip, +30s, −30s)
- [ ] Écran sélection d'exercice (recherche fuzzy, catégories, favoris)
- [ ] Écran résumé de séance (stats, PR détectés, Myo preview)

**Myo 3D v0.1**
- [ ] Setup scène Three.js dans expo-gl (renderer, caméra perspective, éclairage ambiant + directionnel)
- [ ] Définir les 5 variables MVP et leur mapping mathématique → déformation mesh
- [ ] Implémenter le mesh de base (SphereGeometry modifiée + MeshPhongMaterial)
- [ ] Animation de révélation (2–3 secondes, interpolation douce, < 3s total)
- [ ] Benchmark performance : iPhone 12 + Pixel 6a (objectif : 60 FPS stable)

**Mode Fantôme v1.0** *(nouveau)*
- [ ] Requête SQLite `getGhostReference(exerciseId, dateLimit)` : meilleur set sur 30j (Free) / illimité (Pro)
- [ ] Calcul delta en temps réel : poids fantôme vs poids actuel, reps fantôme vs reps actuelles
- [ ] Barre fantôme translucide sur le WheelPicker (Reanimated, opacity 0.4, couleur neutre)
- [ ] Indicateur `↑/↓ +Xkg / −X rép vs meilleure séance` discret en haut d'écran
- [ ] Animation "fantôme battu" : barre vire gold + haptic pulse doux (Taptic Engine)
- [ ] Gestion des edge cases : 1re séance d'un exercice, exercice sans historique suffisant
- [ ] Option de désactivation du Fantôme dans les Paramètres (Règle UX N°7)

**Onboarding**
- [ ] Écran 1 : présentation Orava (valeur en une phrase, animation Myo placeholder)
- [ ] Écran 2 : premier exercice guidé (sélection + 1 série de démonstration)
- [ ] Test du parcours complet : < 60 secondes de l'installation à la 1re série

---

### Phase 2 — 25 tâches (5–7 semaines)

**Myo 3D v1.0**
- [ ] Définir les 36 variables complémentaires et leurs familles analytiques (8 familles complètes)
- [ ] Algorithme de déformation complet : mapping 41 variables → déformation multi-axiale du mesh
- [ ] Affinage visuel : palettes de couleur par intensité de séance, réflexion matériau
- [ ] Export Stories 9:16 : capture frame WebGL → image PNG partageable via Share Sheet iOS/Android

**Moteur Prédictif v1.0** *(nouveau)*
- [ ] Implémenter la régression linéaire pondérée en TypeScript pur (on-device, données SQLite)
- [ ] Pondération temporelle : séances récentes = poids × 1.0, séances à 90j = poids × 0.3
- [ ] Variables contextuelles : fatigue (volume 7j), fréquence récente, historique de repos
- [ ] Job de calcul post-séance via expo-task-manager (arrière-plan, non bloquant)
- [ ] Seuil de confiance : aucun affichage sous 60 %. Intervalle d'incertitude affiché
- [ ] Notification locale push "PR prédit dans N jours · confiance X %" (expo-notifications)
- [ ] Card "Prédiction active" sur le Dashboard : exercice + délai + confiance + delta kg
- [ ] Écran courbe de projection (Skia, Pro uniquement) : données réelles + projection + IC 95 %
- [ ] Générateur de Story "prédiction réalisée" : Myo 3D + carte prédiction + texte auto
- [ ] Tests de précision : simulation sur 50 séances fictives avec progression réaliste

**Haptics & Sound Design**
- [ ] Cartographie des patterns haptiques : 4 niveaux (fin de série / PR Bronze / PR Or / Fantôme battu)
- [ ] Implémentation Taptic Engine iOS (expo-haptics) + Vibration API Android
- [ ] Créer ou sourcer 4 sons via ElevenLabs SFX : fin de série, PR Bronze, PR Or, Myo reveal
- [ ] Intégrer le sound player (expo-av) avec respect du mode silencieux et du volume système

**Design System & Animations**
- [ ] Design System Figma finalisé : dark/light, tokens couleurs/typo/radius, librairie composants
- [ ] Exporter les animations Podium PR (Rive) : Bronze pulse / Argent éclair / Or particules
- [ ] Intégrer les fichiers `.riv` via `rive-react-native` — 3 animations, < 200 KB total
- [ ] Transition Myo reveal : animation de matériau (opaque → céramique réfléchissante, 2–3 sec)

**Monétisation**
- [ ] Construire l'écran paywall Pro (A/B : minimaliste vs feature-list)
- [ ] RevenueCat en production : purchases, restore, gestion erreurs réseau
- [ ] A/B test PostHog : paywall après 1re séance vs après 3e séance

---

### Phase 3 — 20 tâches (9–12 semaines)

**Feed Social**
- [ ] Écran Feed : timeline infinite scroll, pull-to-refresh, Supabase Realtime
- [ ] Publication d'un Myo 3D / PR depuis l'écran résumé de séance
- [ ] Système like + commentaire + repost (optimistic UI, sync Supabase)
- [ ] Écran profil utilisateur : ADN aperçu, stats, programmes publiés

**Marketplace Programmes**
- [ ] Interface création de programme pour les coachs (blocs, exercices, progression)
- [ ] Import 1-clic d'un programme dans sa bibliothèque personnelle
- [ ] Intégration paiement RevenueCat In-App Purchase (commission 15 %)

**ADN Athlétique v1.0** *(nouveau)*
- [ ] Edge Function Supabase : calcul hebdomadaire des 6 dimensions (déclenchée chaque lundi 03h00)
- [ ] Algorithme dimension 1 : profil de force (ratios + calcul percentiles base anonymisée)
- [ ] Algorithme dimension 2 : signature volume (radar 8 groupes musculaires)
- [ ] Algorithmes dimensions 3–6 : style progression + régularité + récupération + tempo circadien
- [ ] Visualisation Skia : carte ADN unique, formes géométriques déterministes par utilisateur
- [ ] Écran ADN complet Pro : 6 dimensions + courbe d'évolution mensuelle (Skia)
- [ ] Dashboard Coach : grille ADN de tous les athlètes + alertes anomalies
- [ ] Export carte ADN en image partageable (format "CV sportif" 1:1 ou 9:16)
- [ ] Message "votre ADN est en construction" si < 20 séances enregistrées

**Croissance**
- [ ] Système de référencement : code d'invitation unique + 1 mois Pro offert par conversion
- [ ] Moteur Prédictif v1.1 : score de précision affiché, ajustement modèle sur données réelles

---

## 9. Stack Outils Créatifs — Workflow par Phase

### 9.1. Vue d'ensemble

| Phase | Outil | Usage précis |
| :--- | :--- | :--- |
| Phase 0 | **Midjourney** | Direction visuelle Myo 3D, mood board céramique |
| Phase 0 | **Figma + Figma Make** | Design System tokens, premiers écrans générés par IA puis ajustés |
| Phase 1 | **v0.dev** | Prototypage composants UI (WheelPicker, écrans) → transposés en React Native |
| Phase 1 | **Spline** | Prototype Myo 3D visual avant Three.js — tester matériaux et éclairage |
| Phase 1 | **VS Code + Cline** | Développement quotidien avec Claude en mode agentique |
| Phase 1 | **Shadertoy** | Références de shaders GLSL pour les effets de matériau du Myo |
| Phase 2 | **Rive** | Animations Podium PR exportées en `.riv` — runtime React Native |
| Phase 2 | **ElevenLabs SFX** | Génération des 4 sons du Design System |
| Phase 3 | **Midjourney + Claude** | Direction visuelle ADN Athlétique + algorithme Skia |

### 9.2. Figma — Design System

**Quand :** avant d'écrire la première ligne de code UI (Phase 0, semaine 2).
**Comment :**
- Créer un fichier `Orava — Design System` avec : palette de couleurs (dark/light), typographie (2 familles, 4 tailles), border-radius tokens, spacing grid.
- Utiliser **Figma Make** (IA intégrée) pour générer un premier jet des 5 écrans principaux : Home, Séance active, Résumé + Myo, Profile, Paywall. Prompt : *"Premium fitness app, dark mode, minimal, data-centric, one primary number per screen"*. Ajuster le résultat — ne pas partir de zéro.
- Chaque composant Figma = un composant React Native. Nommer les composants identiquement dans Figma et dans le code.
- **Ne pas utiliser Figma pour le Myo 3D** — l'outil n'est pas fait pour ça. Le Myo se prototype dans Spline.

### 9.3. Midjourney — Direction visuelle Myo 3D

**Quand :** Phase 0, semaine 1. Avant Spline, avant Three.js.
**Comment :**
Générer 30–50 variations en 2 heures pour trouver la direction. Prompts recommandés :
```
ceramic sculptural 3D form, sports data visualization, parametric deformation,
obsidian and gold material, studio lighting, minimal, dark background --ar 1:1 --v 6
```
```
organic 3D shape, fitness data art, morphing sphere, ceramic glaze,
athletic performance visualization, premium, subtle --ar 1:1 --v 6
```
Sélectionner 3 directions candidates. Montrer ces images à Claude quand tu codes les déformations Three.js — elles servent de référence visuelle pour calibrer les paramètres du shader.

### 9.4. Spline — Prototype Myo 3D

**Quand :** Phase 1, semaines 4–5. Avant d'écrire du code Three.js.
**Comment :**
- Créer la forme de base dans Spline (spline.design) en 2–4 heures.
- Tester les matériaux (céramique, métal, organique), l'éclairage, les déformations.
- Exporter le code Three.js généré par Spline.
- Donner ce code exporté à Claude comme base pour l'adapter à expo-gl — infiniment plus rapide que de partir de zéro.
- **Objectif :** valider que la forme est belle *avant* de passer du temps sur l'algorithme de déformation.

### 9.5. Shadertoy — Références shaders

**Quand :** Phase 1–2, quand les matériaux Three.js ne sont pas convaincants.
**Comment :**
- Chercher sur shadertoy.com : "ceramic", "organic deformation", "iridescent", "parametric mesh".
- Trouver un shader proche du rendu visé.
- Copier le code GLSL dans Claude avec le message : *"Adapte ce shader GLSL pour Three.js avec expo-gl. Je veux l'appliquer comme ShaderMaterial sur mon mesh SphereGeometry."*
- Claude est excellent pour transposer et adapter du code existant — ne jamais lui demander d'inventer un shader de zéro.

### 9.6. Rive — Animations de célébration

**Quand :** Phase 2, semaines 1–2.
**Comment :**
- Créer 3 animations distinctes dans Rive (rive.app) :
  - PR Bronze : pulse simple, couleur bronze, 0.8 secondes.
  - PR Argent : éclair latéral, couleur argent, 1.2 secondes.
  - PR Or : particules explosives, couleur gold, 2 secondes + loop décroissant.
- Exporter en `.riv` (< 200 KB par animation).
- Intégrer via `rive-react-native` — déclenché par l'événement PR dans le WorkoutContext.
- **Ne pas utiliser Lottie** pour ces animations — Rive est plus performant et les animations sont interactives (on peut les interrompre proprement).

### 9.7. ElevenLabs SFX — Sound Design

**Quand :** Phase 2, semaine 2.
**Comment :**
Générer les 4 sons sur elevenlabs.io/sound-effects. Prompts recommandés :
- Fin de série : *"soft satisfying click, premium mobile app, subtle, 0.3 seconds"*
- PR Bronze : *"short chime, achievement, warm metallic, 0.6 seconds"*
- PR Or : *"triumphant premium chime, gold medal moment, resonant, 1 second"*
- Myo reveal : *"deep resonant tone, data crystallizing, premium, 2 seconds fade in"*

Générer 5 variations par son, sélectionner la meilleure. Format WAV, convertir en MP3 (< 50 KB par son) avant intégration via expo-av.

### 9.8. v0.dev — Prototypage composants

**Quand :** Phase 1, semaines 1–3 (en parallèle du développement).
**Comment :**
- Utiliser v0.dev pour générer un premier jet visuel des composants complexes.
- Prompt exemple : *"iOS-style wheel picker component, dark mode, premium fitness app, shows weight in kg, ghost reference value as translucent secondary track"*.
- v0 génère du React/Tailwind — pas du React Native. Utiliser le résultat comme **référence visuelle et logique de layout** uniquement, puis recoder en Reanimated.
- Particulièrement utile pour : WheelPicker, écran résumé de séance, card Prédiction, écran paywall.

---

## 10. Guide d'Utilisation de Claude (VS Code + Cline)

### 10.1. Setup — Extension Cline

Installer dans VS Code :
1. **Cline** (anciennement Claude Dev) — marketplace VS Code. Donne à Claude un accès complet au projet : lecture/écriture fichiers, exécution terminal, lecture des erreurs.
2. **GitHub Copilot** — autocomplétion inline. Coexiste avec Cline sans conflit : Copilot gère le micro (compléter une ligne), Cline gère le macro (implémenter une feature entière).

Configurer Cline avec le modèle `claude-sonnet-4-5` pour les tâches quotidiennes, `claude-opus-4-5` pour les décisions d'architecture complexes.

### 10.2. Le fichier CLAUDE.md — Contexte permanent

Créer à la racine du projet un fichier `CLAUDE.md`. Cline le lit automatiquement au début de chaque session. Contenu recommandé :

```markdown
# Orava — Contexte projet pour Claude

## Stack technique
React Native + Expo Router v3, TypeScript strict (no any), Reanimated 3,
React Native Skia, Three.js via expo-gl, MMKV, expo-sqlite, Supabase,
RevenueCat, PostHog.

## Règles d'architecture absolues
1. ZÉRO appel réseau pendant une séance active.
   WorkoutContext = RAM (MMKV) uniquement pendant l'effort.
   Sync Supabase uniquement en arrière-plan post-séance.
2. Architecture app/ uniquement (Expo Router). Pas de dossiers hors structure.
3. TypeScript strict sur tous les fichiers. Pas de `any`, pas de `as unknown`.
4. 60 FPS minimum sur toutes les animations — benchmarker sur Pixel 6a.
5. Offline First : toute feature réseau doit fonctionner dégradée sans connexion.

## Ce que tu dois toujours faire
- Vérifier si la donnée existe en SQLite local avant tout appel Supabase.
- Proposer les types TypeScript AVANT le code d'implémentation.
- Signaler explicitement si une solution risque de dégrader les FPS.
- Respecter la structure de dossiers app/ — ne jamais créer de dossier hors spec.

## Ce que tu ne dois jamais faire
- Utiliser fetch() ou Supabase client pendant le WorkoutContext actif.
- Créer des fichiers hors du dossier app/ sans validation explicite.
- Utiliser des librairies d'animation non approuvées (uniquement Reanimated + Skia).
- Inventer des APIs Reanimated — toujours demander la doc si incertain.

## Composants existants (ne pas recréer)
- WorkoutContext : context/WorkoutContext.tsx
- WheelPicker : components/WheelPicker.tsx
- MYO3D : components/Myo3D.tsx (expo-gl + Three.js)
- GhostBar : components/GhostBar.tsx (Mode Fantôme)

## Conventions de nommage
- Composants : PascalCase
- Hooks : useXxx
- Types : TXxx ou interface IXxx
- Constantes : SCREAMING_SNAKE_CASE
- Fichiers : kebab-case.tsx
```

### 10.3. Workflow tâche par tâche

Pour chaque tâche du backlog (§8), formuler la demande à Claude en trois parties :

**Template de demande optimal :**
```
CONTEXTE : [fichier(s) existant(s) concerné(s), état actuel]
OBJECTIF : [ce que la fonction/composant doit faire, précisément]
CONTRAINTES : [règles d'architecture à respecter, performances attendues]
```

**Exemple réel — Mode Fantôme :**
```
CONTEXTE : WorkoutContext existe dans context/WorkoutContext.tsx.
SQLite est configuré avec la table `sets` (colonnes: id, exercise_id,
weight, reps, created_at, session_id).

OBJECTIF : Créer une fonction `getGhostReference(exerciseId: string,
limitDays: number): Promise<GhostSet | null>` qui retourne le meilleur
set historique (max weight, puis max reps à weight égal) pour cet exercice
dans les N derniers jours.

CONTRAINTES : Uniquement expo-sqlite, aucun appel Supabase. Retourner null
si aucun historique. TypeScript strict avec le type GhostSet défini dans types/.
```

### 10.4. Ce que Claude fait bien — et comment en tirer parti

| Domaine | Utilisation optimale |
| :--- | :--- |
| **Architecture TypeScript** | Demander les types avant le code. Claude excelle à concevoir les interfaces. |
| **Algorithmes** | Régression Prédictif, mapping Myo 3D, calculs ADN. Donner les formules mathématiques si connues. |
| **Requêtes SQLite** | Donner le schéma exact de la table. Résultat fiable à 95 %. |
| **Logique Supabase** | Auth flows, RLS policies, Edge Functions. Donner le schéma DB. |
| **Transposition de code** | Adapter un shader Shadertoy, transposer v0.dev en RN, adapter du code Three.js. Toujours partir d'un exemple existant. |
| **Debugging** | Donner le message d'erreur complet + le fichier + ce que tu essayais de faire. |

### 10.5. Ce que Claude fait moins bien — et comment compenser

| Domaine | Problème | Solution |
| :--- | :--- | :--- |
| **Reanimated** | APIs changent vite, beaucoup de code obsolète en training | Coller la page de doc officielle dans le message avant chaque tâche Reanimated |
| **Three.js / expo-gl** | Hallucinations sur les APIs bas niveau | Partir d'un code Spline exporté ou d'un shader Shadertoy — jamais de zéro |
| **Comportements natifs iOS/Android subtils** | Différences de plateforme non documentées | Toujours tester sur device physique après chaque tâche native |
| **Design visuel** | Claude ne "voit" pas le résultat | Décrire le visuel souhaité avec une référence (screenshot Whoop, frame Myo Midjourney) |

---

## 11. Sources d'Inspiration Design

### 11.1. Applications mobiles — références directes

**Whoop** *(priorité 1 — étudier en profondeur)*
Le meilleur design système de l'espace fitness. Fond noir, typographie large, données présentées comme du luxe. Leur écran "Recovery Score" est une masterclass : un chiffre, une couleur, une signification immédiate. Ce qu'Orava emprunte : la hiérarchie visuelle des données, ne jamais afficher 10 chiffres quand un seul suffit. Passer 30 minutes à naviguer dans l'app en analysant chaque décision de design.

**Spotify / Spotify Wrapped** *(priorité 1 — référence directe ADN Athlétique)*
La référence mondiale du "data as identity". Wrapped transforme des données d'écoute en objet visuel émotionnel partageable — exactement la philosophie du Myo 3D et de l'ADN Athlétique. Ce qu'Orava emprunte : le moment de révélation, l'animation d'entrée des chiffres, le format Stories viral. Étudier les Wrapped 2022–2024 avant de designer l'ADN.

**Linear** *(priorité 1 — référence micro-animations)*
Le design système le plus admiré des développeurs. Micro-animations sur chaque interaction (transitions 120ms), dark mode natif parfait. Observer l'app elle-même pendant l'utilisation quotidienne de gestion de tâches — chaque clic "répond". C'est le feeling Reanimated qu'Orava doit atteindre sur le WheelPicker et le Mode Fantôme.

**BeReal / Locket Widget** *(priorité 1 — Progressive Disclosure)*
Interface quasi-vide pendant l'action, révélation différée du contenu. Le modèle exact de la Progressive Disclosure d'Orava. L'écran de séance active doit être aussi épuré que l'écran de capture BeReal.

**Streaks** *(priorité 2 — reward loop)*
L'app de suivi d'habitudes la plus belle de l'App Store. Cercles de progression animés, récompenses haptiques soignées. Le feeling "cercle qui se ferme" = ce qu'Orava doit créer à la validation d'une série.

**Robinhood** *(priorité 2 — célébrations et onboarding)*
A rendu la finance belle pour une génération. Célébrations de confettis pour les transactions, onboarding en 2 minutes. Les confettis de Robinhood = les haptics + son de Orava sur un PR Or.

**Carrot Weather / Clime** *(priorité 2 — donnée émotionnelle)*
Transforment une donnée froide (température) en expérience visuelle émotionnelle. Principe que des données fonctionnelles peuvent être belles — exactement ce que fait le Myo 3D.

**Nike Training Club** *(priorité 2 — cohérence de marque fitness)*
La différence entre NTC et une app fitness générique, c'est la cohérence de l'identité visuelle à travers chaque écran. Chaque transition, typo et couleur sent la même marque. Référence directe pour le Design System Orava.

### 11.2. Systèmes design et entreprises

**Apple — iOS natif** *(étude obligatoire)*
Les transitions de l'app Santé, le scroll physics de UIKit, le Taptic Engine sur les WheelPickers de l'alarme — ce sont les standards que l'utilisateur compare inconsciemment à Orava. Le WheelPicker natif de l'alarme iOS est la référence exacte pour les composants poids/reps. Étudier la physique du scroll (friction, snap, momentum) et répliquer précisément en Reanimated.

### 11.3. Art numérique et data viz — référence Myo 3D

**TeamLab** *(priorité 1 — philosophie Myo 3D)*
Studio d'art numérique japonais. Leurs installations (Borderless, Planets) transforment des données humaines (mouvement, lumière, présence) en formes organiques 3D réactives en temps réel. C'est la référence philosophique et visuelle la plus proche du Myo 3D. Regarder "TeamLab Borderless" sur YouTube avant de coder les déformations Three.js — ces vidéos calibrent l'ambition visuelle mieux qu'une maquette Figma.

**Shadertoy.com** *(ressource technique Myo)*
Base de milliers de shaders GLSL commentés. Recherches utiles : "ceramic", "organic deformation", "iridescent sphere", "parametric mesh", "data sculpture". Trouver un shader proche du rendu visé, le donner à Claude pour adaptation expo-gl.

### 11.4. Règles d'application des inspirations

1. **Observer, ne pas copier.** Chaque référence doit déclencher une question : *"Pourquoi ils ont fait ça ? Quel problème ça résout ? Comment adapter ce principe à Orava ?"*
2. **Prioriser le feeling sur le visuel.** Ce qui compte n'est pas que l'app ressemble à Whoop, mais qu'elle procure le même sentiment de qualité et de confiance.
3. **Tester sur des vrais utilisateurs.** Une inspiration valide si des utilisateurs beta réagissent positivement, pas si le designer la trouve belle.
4. **Documenter les décisions.** Pour chaque choix design majeur (couleur, animation, layout), noter quelle inspiration l'a motivé et pourquoi dans les notes Figma.

---

## 12. Directives d'Expérience Utilisateur (UX Guidelines)

```
[RÈGLE N°1] - Divulgation Progressive :
Pendant la séance, masquer TOUT ce qui n'est pas le Timer, les Reps et le Poids.
Le Fantôme est la seule exception : une seule valeur de référence, discrète, non cliquable.
Les analytics se consultent "après" la bataille.
```

```
[RÈGLE N°2] - Zéro Saisie Inutile :
Si une donnée peut être devinée (dernier poids utilisé, durée de repos par défaut),
elle doit être pré-remplie. L'utilisateur valide d'un "Tap", jamais ne tape au clavier.
```

```
[RÈGLE N°3] - Récompense Sensorielle :
Chaque accomplissement (fin de série, PR Or, fantôme battu) engage l'ouïe
(Sound Design sur mesure) et le toucher (Vibration Haptique native).
L'intensité de la récompense est proportionnelle à l'exploit.
```

```
[RÈGLE N°4] - Le Myo comme Récompense Finale :
Le Myo 3D ne s'affiche qu'à la fin de la séance, jamais pendant.
Il doit être perçu comme le "trophée" mérité — pas un dashboard de plus.
Sa génération est animée (2–3 secondes) pour créer un moment de révélation.
```

```
[RÈGLE N°5] - Partage Natif ou Rien :
Tout élément partageable (Myo 3D, PR, prédiction réalisée, ADN Athlétique)
doit être exportable en une image 9:16 Stories-ready, sans watermark agressif en Pro.
Le partage est le canal d'acquisition numéro un — ne jamais le brider.
```

```
[RÈGLE N°6] - L'Onboarding en moins de 60 secondes :
L'utilisateur doit pouvoir démarrer sa première séance en moins de 60 secondes
après installation. Pas de formulaire de profil obligatoire, pas de tutorial forcé.
Les données de profil se collectent progressivement, au bon moment contextuel.
```

```
[RÈGLE N°7] - Le Fantôme est silencieux :
Le Mode Fantôme ne s'impose jamais. Il n'est pas cliquable pendant la séance.
Il ne génère pas de notification pendant l'effort. C'est une présence, pas une interruption.
Si l'utilisateur ne le regarde pas, tant mieux — il travaille.
```

```
[RÈGLE N°8] - La Prédiction est une promesse :
Orava ne prédit que quand il est confiant (seuil minimum : 60 %).
Une prédiction ratée abîme la relation plus qu'une absence de prédiction.
Le modèle doit afficher sa propre incertitude — jamais de fausse précision.
```

---

## 13. Indicateurs de Succès (KPIs)

| Catégorie | KPI | Cible Phase 1 | Cible 6 mois post-launch |
| :--- | :--- | :--- | :--- |
| **Performance** | FPS séance active | ≥ 60 FPS constant | ≥ 60 FPS constant |
| **Performance** | Génération Myo 3D | < 3 secondes | < 2 secondes |
| **Performance** | Calcul Moteur Prédictif | < 5 sec post-séance | < 3 sec post-séance |
| **Rétention** | Day-7 retention | — | > 45 % |
| **Rétention** | Day-30 retention | — | > 28 % |
| **Engagement** | Séances/semaine par MAU | — | > 2,5 |
| **Fantôme** | % séances avec Fantôme actif | — | > 70 % |
| **Fantôme** | % séances où le Fantôme est battu | — | > 35 % |
| **Prédictif** | Taux de précision des prédictions | — | > 65 % |
| **Prédictif** | % prédictions réalisées partagées | — | > 20 % |
| **Monétisation** | Conversion Free → Pro | — | > 8 % |
| **Viral** | Myo 3D partagés / séances complétées | — | > 15 % |
| **ADN** | % utilisateurs ayant consulté leur ADN | — | > 60 % (après 90j) |
| **Qualité** | Crash rate | 0 % (hors-ligne) | < 0,1 % |

---

## 14. Registre des Risques

| Risque | Probabilité | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| **Myo 3D trop complexe pour le MVP** | Haute | Bloquant | Règle du Myo Progressif (§5.4) : 5 variables d'abord, 41 ensuite. Prototype Spline avant Three.js. |
| **Performance 3D insuffisante sur Android mid-range** | Moyenne | Élevé | Benchmark Pixel 6a dès la Phase 1. Fallback Myo 2D (Skia) si < 30 FPS. |
| **Moteur Prédictif — prédictions trop imprécises** | Moyenne | Élevé | Seuil 60 % min. Affichage de l'intervalle d'incertitude. Silence > mauvaise prédiction. |
| **Mode Fantôme perçu comme anxiogène** | Faible | Moyen | Test utilisateur Phase 1 beta. Option désactivation paramètres. Règle UX N°7. |
| **ADN Athlétique — données insuffisantes** | Moyenne | Moyen | Seuil minimum 20 séances (pas 90 jours). Message "ADN en construction" pendant l'attente. |
| **Faible conversion Free → Pro** | Moyenne | Élevé | Moteur Prédictif verrouillé = upsell principal. A/B test timing paywall (Phase 2). |
| **Rétention insuffisante avant réseau social** | Moyenne | Moyen | Mode Fantôme crée une raison de revenir dès la 2e séance. Streaks + notifs intelligentes. |
| **Hallucinations Claude sur Reanimated / Three.js** | Haute | Moyen | Toujours coller la doc officielle dans le prompt. Partir de code existant (Spline, Shadertoy). |
| **Concurrents copiant le Myo 3D** | Faible à terme | Élevé | ADN Athlétique (données accumulées, non exportables) = rempart long terme. Avancer vite. |
| **Coûts Supabase sous-estimés** | Faible | Moyen | Monitorer Edge Function calls (génération ADN hebdomadaire). Compute dédié si > 10k MAU. |
