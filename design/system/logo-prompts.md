# Orava — Prompts Logo Midjourney

Accent : `#FFDD00` (jaune électrique) sur fond `#0A0A0F` (noir profond).
Univers : fitness premium, data-driven, athlètes sérieux 25-35 ans, dark-first.

---

## Prompt 1 — Symbole O + Orbe Myo (recommandé)

```
Minimalist logo design for a premium fitness app called ORAVA, single letter "O" symbol,
the O contains a subtle 3D topographic relief sphere inside, as if the letter itself is an orb,
electric yellow #FFDD00 on pure black background, clean vector mark,
bold geometric sans-serif wordmark "ORAVA" beside it, condensed heavy weight,
ultra-minimal, no gradients, no shadows, no decoration,
style of Linear app, Trade Republic, WHOOP branding,
flat design, professional sports tech brand identity,
--ar 3:1 --style raw --v 6.1 --q 2
```

---

## Prompt 2 — Symbole géométrique seul (app icon focus)

```
Minimalist app icon logo for premium fitness tracking app ORAVA,
abstract geometric mark combining upward triangle and circle,
suggesting athletic peak performance and data visualization,
electric yellow #FFDD00 symbol on deep black #0A0A0F square,
ultra-clean vector, single color, bold strokes, no gradients,
inspired by Nike, Linear, Trade Republic visual identity,
designed to work at 64x64px as an app icon,
professional sports tech branding, 2026 design trends,
--ar 1:1 --style raw --v 6.1 --q 2
```

---

## Prompt 3 — Wordmark typographique pur

```
Premium wordmark logo "ORAVA" for elite fitness tracking app,
custom bold condensed sans-serif lettering, slightly geometric,
electric yellow #FFDD00 letters on black background,
tight letter-spacing, strong weight 800-900, modern athletic feel,
no symbol, the typography is the identity,
inspired by Supreme, Nike, Porsche wordmarks,
clean vector, professional sports brand, minimalist 2026 aesthetic,
--ar 4:1 --style raw --v 6.1 --q 2
```

---

## Prompt 4 — Forme organique / énergie physique

```
Minimalist logo for fitness app ORAVA, abstract organic mark
suggesting muscular topography and athletic energy,
a single fluid bold shape evoking a mountain peak or muscle fiber cross-section,
electric yellow #FFDD00 on black, no gradients, clean vector,
bold geometric construction with organic curves,
premium sports tech aesthetic, 2026 minimalism,
paired with clean bold condensed wordmark "ORAVA",
style of Strava, WHOOP, Apple Fitness redesigned for 2026,
--ar 3:1 --style raw --v 6.1 --q 2
```

---

## Prompt 5 — Variations couleur (pour tester le contraste)

```
Logo variations for fitness app ORAVA on dark backgrounds,
same minimal geometric mark in 4 color versions:
electric yellow, pure white, light gray, deep charcoal,
all on #0A0A0F black background,
showing brand color system and contrast hierarchy,
clean vector marks, professional brand sheet layout,
--ar 2:1 --style raw --v 6.1 --q 2
```

---

## Notes d'itération

Après génération :
1. Sélectionner 3 candidats dans `design/system/logo/candidates/`
2. Tester chaque candidat à 64×64px (app icon) — si illisible à cette taille, éliminer
3. Tester sur fond `#0A0A0F` ET sur fond blanc (pour les contextes print/web)
4. Valider en réunion → exporter SVG → `design/system/logo/final/`
5. Intégrer dans `mobile_app/assets/` seulement après validation

**Critère d'élimination immédiate :**
- Fonctionne pas à 64×64px
- Plus de 2 couleurs dans le symbole
- Trop proche de Strava, WHOOP ou Nike (confusion de marque)
