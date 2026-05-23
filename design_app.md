# Orava — Design Brief v4

Source de vérité : `Orava___Master_Plan_v4.md`. Ce document est un brief design, pas un spec technique.
Toute décision UI découle des rules `ui.md` + `workout.md` + `files.md`.

---

## Philosophie

> Orava transforme chaque séance en une œuvre de données.

Trois principes qui gouvernent chaque pixel :
- **Progressive Disclosure** — pendant la séance : 3 infos max. Le reste se révèle après.
- **Couleur = information** — vert/rouge = gain/perte uniquement. L'accent `#FFDD00` apparaît une fois par screen max, jamais décoratif.
- **Récompense différée** — le Myo est le trophée. Il n'arrive qu'à 800ms dans le summary. Jamais pendant la séance.

---

## Identité Visuelle

### Palette (dark mode strict — l'accent n'existe que sur fond sombre)

| Token | Valeur | Usage |
|---|---|---|
| `background` | `#0A0A0F` | Fond principal — jamais `#000` pur |
| `backgroundSecondary` | `#12121A` | Cards, surfaces |
| `backgroundTertiary` | `#1A1A24` | Modals, bottom sheets |
| `accent` | `#FFDD00` | CTA primaire, PR actif, métrique hero — 1 fois par screen |
| `textPrimary` | `#F0F0F5` | Corps principal — jamais `#FFF` pur |
| `textSecondary` | `#7A7A8C` | Contexte, sous-titres |
| `textTertiary` | `#4A4A5A` | Labels, placeholders |
| `prGold` | `#FAC775` | PR Or — chaud/ambre, ≠ accent |
| `prSilver` | `#C0C0C0` | PR Argent |
| `prBronze` | `#CD7F32` | PR Bronze |
| `success` | `#00E673` | Gain uniquement |
| `error` | `#FF3B30` | Perte uniquement |
| `separator` | `rgba(255,255,255,0.06)` | Présent mais invisible |

Pas de light mode dans les phases 0–2. Dark mode strict.

### Typographie

5 tailles actives sur toute l'app — jamais plus.

| Rôle | Taille | Poids | Usage |
|---|---|---|---|
| `hero` | 56px / 900 | Volume total, score Myo, poids max PR |
| `display` | 40px / 800 | WheelPicker poids, PR principal |
| `title` | 24px / 700 | Nom exercice, titre screen |
| `subtitle` | 18px / 600 | Sections, en-têtes cards |
| `body` | 15px / 400 | Contenu standard |
| `caption` | 12px / 500 | Labels — UPPERCASE obligatoire |
| `mono` | 14px / 600 | Timers, compteurs — `tabular-nums` |

Règles absolues : tracking négatif au-dessus de 20px. Max 2 font-weights par composant. `tabular-nums` sur tout chiffre qui change.

### Logo

Symbole seul `#FFDD00` sur `#0A0A0F`, sans texte pour l'app icon. Prompts Midjourney dans `design/system/logo-prompts.md`. Jamais inversé (noir sur blanc). Formats : SVG + PNG 1024 + PNG 512 dans `design/system/logo/` avant intégration.

---

## Architecture des Screens

### Flux d'entrée (respecté — ne pas modifier)

```
Splash animé (index.tsx)
  ↓ guard auth (_layout.tsx)
  ↓ non authentifié → /auth/login → /auth/register
  ↓ authentifié → tabs (feed.tsx par défaut)
```

Pas de "lancer directement dans le feed" sans auth. Le guard existe dans `_layout.tsx`.

### Navigation principale — 5 tabs

```
feed      history      [FAB → session]      library      profile
```

FAB central : unique entrée vers `/workout/session`. Touch target 64px minimum.

---

## Screens par densité

### Session active — DENSITÉ ZEN

**Règle absolue : 3 infos max. Timer + Reps + Poids. Rien d'autre.**

- Touch targets **64px** — mains en sueur, gants de salle
- Police +4px vs standard
- WheelPicker poids : snap natif Reanimated, granulométrie par équipement (haltères 2kg, barre charges, poulie 2.5kg, kettlebell 4kg)
- WheelPicker reps : 1→50, snap natif
- **GhostBar** : barre translucide Reanimated, opacity 0.35, couleur neutre — présence silencieuse, non cliquable. Indicateur `↑ +X kg vs meilleure` discret uniquement. Ghost battu → barre vire gold + haptic pulse doux.
- PR flash temps réel : bouncy spring (damping 12, stiffness 200) — jamais linear. Visuel d'abord, haptic à 800ms après.
- Zéro appel réseau. WorkoutContext = RAM + MMKV uniquement. Crash-safe.
- Myo : **absent** de cet écran.

### Timer — DENSITÉ ZEN

**Temps uniquement. Rien d'autre.**

- 1 chiffre hero centré. Zéro ornementation.
- Controls : skip, +15s, −15s — discrets, jamais compétitifs avec le temps.
- Auto-start après validation set.

### Summary — DENSITÉ RICHE

Reveal progressif. Sections chorégraphiées, jamais simultanées.

```
0ms   → titre séance (nom auto-généré)
80ms  → métrique hero (volume total)
160ms → métriques secondaires (durée, séries, exercices)
240ms → PRs détectés (podium Or/Argent/Bronze)
320ms → muscles travaillés (barres activation)
800ms → Myo Orb (récompense finale — springBouncy)
```

- `is_public` démarre à **false** — toggle opt-in
- Photo optionnelle, géoloc optionnelle
- Save Supabase déclenché par l'utilisateur uniquement
- Post-save : insert SQLite local + calcul Myo + `workout_metrics` best-effort

### Feed — DENSITÉ DENSE

Timeline sociale. Phase 3 complète, aperçu Phase 1.

- Teaser séance en row 64px → tap → détail
- Myo fractal SVG visible sans tap (résumé uniquement, pas l'orb 3D)
- Likes + commentaires : optimistic UI
- Photo_url si partagée
- Scroll infini, pull-to-refresh

### History — DENSITÉ DENSE

SectionList antichronologique par mois.

- Rows 64px, padding 12px
- Badge PR seance si `pr_seance IS NOT NULL`
- Tap → `history/[id].tsx` : détail complet + barres muscles + badges PR

### Library — DENSITÉ DENSE

113+ exercices, SectionList par muscle.

- Chips filtres : `View flexWrap:'wrap'` — pas ScrollView horizontal
- Recherche insensible accents via `normalize()` NFD
- Tap → `exercise/[id].tsx` : barres musculaires primary/secondary/stabilizer

### Profile — DENSITÉ STANDARD

Portfolio. Donne envie de follow.

- Stats du mois hero
- PRs top 20 (`prs.tsx` accessible depuis ici)
- Myo moyen rolling (historique) — Phase 1
- Bouton déconnexion discret

### Analytics (`analytics.tsx`) — DENSITÉ RICHE

Charts View RN + StyleSheet. **Jamais Victory Native. Jamais.**
Skia en Phase 2 pour les charts avancés.

- Évolution volume rolling 7/30/90j
- Fréquence musculaire
- Progression 1RM par exercice
- Moteur Prédictif card (Phase 2) : "PR prédit dans N jours · confiance X %"

### Myo Orb (`myo-orb.tsx`) — DENSITÉ ZEN AU REVEAL

- Orb centré. Rien ne concurrence à 800ms.
- Silence absolu pendant le reveal — pas d'haptic, pas de son
- Son `myo_reveal.mp3` démarre 200ms avant l'apparition (Phase 2)
- Arc SVG score 240° : ≥66 → `#FAC775` / ≥33 → `#D85A30` / <33 → `#8E8E93`
- Secteurs interactifs : tap → highlight secteur + panneau détail
- Données réelles câblées Phase 1 — mock jusqu'alors

---

## Animations — Spring Physics obligatoires

**Zéro linear easing sur éléments UI visibles. Jamais.**

| Spring | Paramètres | Usage |
|---|---|---|
| `springSnappy` | damping 20, stiffness 600 | Taps, pills, toggles |
| `springStandard` | damping 18, stiffness 300 | Transitions pages, cards |
| `springBouncy` | damping 12, stiffness 200 | PR, success, Myo reveal |
| `springGentle` | damping 25, stiffness 120 | WheelPicker, scroll |

Durées intentionnelles :
- `< 200ms` → feedback immédiat (tap, toggle)
- `200–400ms` → transitions standard
- `400–800ms` → révélations PR, sections summary
- `> 800ms` → Myo reveal, save séance

Choreography : 50–80ms entre chaque élément d'un même reveal. Jamais simultané.

---

## Glassmorphism — usage chirurgical

Max 2–3 éléments glass par screen. Uniquement sur overlays flottants au-dessus de contenu vivant.

Interdit sur : listes, surfaces statiques, backgrounds principaux.

Usages valides : bottom sheets, label flottant sur Myo, popover PR.

Fallback Android : `backgroundColor: '#1A1A24'` opaque (BlurView non dispo).

---

## Haptique & Son — Phase 1/2

### Taxonomie haptique (Phase 1 — `expo-haptics`)

| Event | Pattern | Timing |
|---|---|---|
| Log set | Light impact | Immédiat |
| Navigate | Light impact | Immédiat |
| WheelPicker snap | Medium impact | Au snap |
| Sélection exercice | Medium impact | Immédiat |
| PR Bronze/Argent | Medium impact | 800ms après flash visuel |
| PR Or | Success notification | 800ms après flash visuel |
| Ghost battu | Medium + 120ms + Medium | Double pulse — après animation barre |
| Session save | Success notification | Au confirm save |
| Erreur | Error notification | Immédiat |

Règles : haptique suit le visuel, jamais avant. Silence pendant Myo reveal. Opt-outable dans settings.

### Sound Design (Phase 2 — `expo-av`)

4 sons MP3 < 50 KB dans `assets/sounds/` :

| Fichier | Déclencheur |
|---|---|
| `serie_end.mp3` | Validation set |
| `pr_bronze.mp3` | PR Bronze ou Argent |
| `pr_gold.mp3` | PR Or |
| `myo_reveal.mp3` | Reveal Myo en summary |

`Audio.setAudioModeAsync({ playsInSilentModeIOS: false })` — respecter mode silencieux iOS.

---

## Système PR — 4 types × podium 3 niveaux

| Type | Échelle | Icône | Couleur |
|---|---|---|---|
| `pr_charge` | Set | Zap | `prGold` |
| `pr_serie` | Set | Flame | `accent` |
| `pr_exercice` | Exercice/séance | Dumbbell | `#9B59B6` |
| `pr_seance` | Séance | Trophy | `prGold` |

Podium : `gold` = record absolu · `silver` = 2e · `bronze` = 3e · `null` = pas de PR.

Flash PR : bouncy spring + background éphémère. Icône seule sur screen session — jamais de texte long.

---

## Monétisation — gates visuels

| Feature | Free | Pro |
|---|---|---|
| Myo 3D | 5 variables (mock Phase 1) | 53 variables complètes |
| Mode Fantôme | 30 derniers jours | Historique illimité |
| Moteur Prédictif | Notification verrouillée visible | Courbes + historique prédictions |
| ADN Athlétique | 2/6 dimensions floutées | ADN complet + évolution mensuelle |
| Export Stories | Non | 9:16 sans watermark agressif |
| Historique | 90 jours | Illimité |

Upsell principal : Moteur Prédictif — l'utilisateur voit "PR prédit dans 3 jours" sans pouvoir accéder au détail. Paywall activé Phase 2.

---

## Onboarding (Phase 1)

**< 60 secondes de l'install à la 1re série. Pas de formulaire. Pas de tutorial forcé.**

- Écran 1 : proposition de valeur en une phrase + animation Myo placeholder
- Écran 2 : premier exercice guidé — sélection + 1 série de démonstration
- Données profil (poids, date naissance) collectées progressivement au bon moment contextuel, jamais bloquantes

---

## Features par Phase

| Feature | Phase | Screen |
|---|---|---|
| Tracking séance + PR | Phase 1 | `workout/session.tsx` |
| WheelPicker + GhostBar | Phase 1 | `workout/session.tsx` |
| Mode Fantôme v1.0 | Phase 1 | `workout/ghost.ts` |
| Myo câblé (données réelles) | Phase 1 | `workout/myo-orb.tsx` |
| Onboarding | Phase 1 | `app/onboarding/` |
| Haptics | Phase 1 | global |
| Myo 53 variables complet | Phase 2 | `workout/myo-orb.tsx` |
| Moteur Prédictif | Phase 2 | `lib/predictor.ts` |
| Sound Design | Phase 2 | global |
| Animations Rive PR | Phase 2 | `workout/session.tsx` |
| Paywall Pro | Phase 2 | `app/paywall.tsx` |
| Export Stories 9:16 | Phase 2 | `workout/myo-orb.tsx` |
| Feed social complet | Phase 3 | `(tabs)/feed.tsx` |
| ADN Athlétique | Phase 3 | `app/athletic-dna.tsx` |
| Carte salles + Pass Orava | Phase 4 | non planifié avant Phase 4 |

---

## Anti-patterns — règles dures

```
FAIRE
✓ 1 seul accent coloré — monochromatic autour
✓ Fond avec tinte froide (#0A0A0F)
✓ tabular-nums sur tout chiffre animé
✓ Touch targets 52px min, 64px en session active
✓ Spring sur toute réponse à un geste
✓ Skeleton screens — jamais de spinners
✓ Séparation par couleur de fond — jamais par ligne visible
✓ Choreography 50-80ms entre éléments d'un même reveal

NE PAS FAIRE
✗ Gradients décoratifs sur surfaces statiques
✗ Linear easing sur éléments visibles — jamais
✗ Plus de 2 couleurs dans un composant (hors PR podium)
✗ Border visible ET shadow sur la même card
✗ Uppercase sur texte > 13px
✗ Glass sur listes ou surfaces statiques
✗ Victory Native pour les charts
✗ Appel réseau pendant session active
✗ Myo pendant la séance
✗ Carte salles avant Phase 4
✗ setState dans un worklet Reanimated
```
