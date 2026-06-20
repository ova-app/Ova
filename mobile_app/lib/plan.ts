// ─── lib/plan.ts — cache du plan utilisateur (offline-safe) ───────────────────
// Le plan ('free' | 'premium') est lu depuis Supabase aux écrans profil/settings,
// puis mis en cache RAM via `storage` (réhydraté au boot par hydrateStorage()).
// Permet de gater une feature PENDANT la séance sans toucher le réseau (règle #3).
// Fallback 'free' tant qu'aucun profil n'a été chargé (sûr : limite la moins permissive).

import { storage } from '@/lib/storage'

export type Plan = 'free' | 'premium'

const KEY = 'user_plan'

export function cacheUserPlan(plan: string | null | undefined): void {
  storage.set(KEY, plan === 'premium' ? 'premium' : 'free')
}

export function getCachedPlan(): Plan {
  return storage.getString(KEY) === 'premium' ? 'premium' : 'free'
}

// ORA-063 — fenêtre Mode Fantôme : Free = 30 jours, Pro = illimité.
export function ghostLimitDays(): number {
  return getCachedPlan() === 'premium' ? 99999 : 30
}
