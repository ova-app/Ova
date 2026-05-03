# rules/stack.md

## Stack complète
- React Native + Expo (TypeScript strict) + Expo Router (`app/`)
- Supabase : PostgreSQL + Auth + RLS (projet ORAVA, région Frankfurt)
- Auth storage : expo-secure-store — adaptateur custom chunks 1800 bytes
- Icônes : Lucide React Native
- Git : `main` stable · `dev` travail · `feat/xxx` par feature

## Config Supabase
- `lib/supabase.ts` : client (SecureStore fragmenté 1800b, autoRefreshToken)
- Trigger `on_auth_user_created` → crée `public.users`


