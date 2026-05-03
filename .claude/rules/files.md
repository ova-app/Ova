# rules/files.md

## Structure

```
app/
├── _layout.tsx              — guard auth + WorkoutProvider + ThemeProvider + StatusBar
├── index.tsx                — splash animé → redirect /auth/login
├── auth/                    — login.tsx · register.tsx
├── (tabs)/
│   ├── feed.tsx             — timeline sociale (likes + commentaires + photo_url)
│   ├── history.tsx          — SectionList antichronologique par mois
│   ├── library.tsx          — 113 exos, SectionList par muscle, filtres chips, normalize NFD
│   ├── profile.tsx          — stats mois, PRs top 20, déconnexion
│   └── start.tsx            — placeholder FAB → /workout/session
├── workout/
│   ├── session.tsx          — log séance, WheelPicker, flash PR 🥇🥈🥉
│   ├── timer.tsx            — TimerWheelColumn custom, auto-start, presets, fix AppState
│   └── summary.tsx          — résumé + nom auto + PRs + is_public + photo + géoloc + save Supabase
├── history/[id].tsx         — détail séance + photo_url + barres muscles + badges PR
├── exercise/[id].tsx        — fiche exercice + barres musculaires (primary/secondary/stabilizer)
├── analytics.tsx            — stats complètes, charts View RN (PAS Victory Native)
├── prs.tsx                  — Armurerie PRs : podium Or/Argent/Bronze par exercice
├── edit-profile.tsx         — modifier username + full_name
└── settings.tsx             — kg/lbs, dark/light, vibration, timer défaut, visibilité séances

context/
├── WorkoutContext.tsx
└── ThemeContext.tsx

lib/supabase.ts
constants/theme.ts           — source couleurs
constants/Colors.ts          — VIDE
types/index.ts               — VIDE (types inline dans chaque fichier)
components/                  — VIDE
```
