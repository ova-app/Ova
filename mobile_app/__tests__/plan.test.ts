/**
 * plan.ts — cache du plan utilisateur + fenêtre Mode Fantôme (ORA-063).
 *
 * `storage` (lib/storage.ts) tient un cache Map synchrone en plus d'AsyncStorage
 * (mocké globalement dans jest.setup.js). cacheUserPlan() écrit la Map
 * immédiatement → getCachedPlan()/ghostLimitDays() la relisent en synchrone.
 *
 * On teste :
 *   - Normalisation : seul 'premium' donne premium ; tout le reste → 'free'
 *   - ghostLimitDays : Free = 30 j, Pro = 99999 j
 *   - Défaut (rien en cache) = 'free' / 30 j (fallback le moins permissif)
 */

import { cacheUserPlan, getCachedPlan, ghostLimitDays } from '../lib/plan'
import { storage } from '../lib/storage'

describe('plan — normalisation cacheUserPlan / getCachedPlan', () => {
  it("'premium' → premium", () => {
    cacheUserPlan('premium')
    expect(getCachedPlan()).toBe('premium')
  })

  it("'free' → free", () => {
    cacheUserPlan('free')
    expect(getCachedPlan()).toBe('free')
  })

  it('undefined → free', () => {
    cacheUserPlan(undefined)
    expect(getCachedPlan()).toBe('free')
  })

  it('null → free', () => {
    cacheUserPlan(null)
    expect(getCachedPlan()).toBe('free')
  })

  it('valeur inconnue → free (whitelist stricte sur premium)', () => {
    cacheUserPlan('coach')
    expect(getCachedPlan()).toBe('free')
  })
})

describe('plan — ghostLimitDays', () => {
  it('Pro = 99999 jours (illimité)', () => {
    cacheUserPlan('premium')
    expect(ghostLimitDays()).toBe(99999)
  })

  it('Free = 30 jours', () => {
    cacheUserPlan('free')
    expect(ghostLimitDays()).toBe(30)
  })
})

describe('plan — défaut sans cache', () => {
  it("aucune valeur en cache → 'free' / 30 j (fallback le moins permissif)", () => {
    storage.delete('user_plan')
    expect(getCachedPlan()).toBe('free')
    expect(ghostLimitDays()).toBe(30)
  })
})
