/**
 * myo.ts — computeSessionScore (ORA-086).
 *
 * Le score séance doit DISCRIMINER : 50 = séance type perso, >50 au-dessus,
 * <50 en-dessous. L'ancien score (moyenne de ~41 z) était figé ~50 : on vérifie
 * ici qu'une séance moyenne donne 50 et qu'une bonne/mauvaise séance s'en écarte.
 */

// Mock Supabase — myo.ts l'importe mais computeSessionScore ne l'utilise pas
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: { getUser: jest.fn() },
  },
}))

import { computeSessionScore } from '../lib/myo'

const Z0 = {
  volume_kg: 0,
  densite: 0,
  charge_relative: 0,
  nb_pr: 0,
  mean_evolution_1rm: 0,
}

describe('computeSessionScore', () => {
  it('séance dans la norme (tous z = 0) → 50', () => {
    expect(computeSessionScore(Z0)).toBe(50)
  })

  it('grosse séance (effort + output bien au-dessus) → > 66', () => {
    const score = computeSessionScore({
      volume_kg: 2,
      densite: 2,
      charge_relative: 2,
      nb_pr: 2,
      mean_evolution_1rm: 2,
    })
    expect(score).toBeGreaterThan(66)
  })

  it('jour léger (tout en-dessous de la norme) → < 33', () => {
    const score = computeSessionScore({
      volume_kg: -2,
      densite: -2,
      charge_relative: -2,
      nb_pr: -2,
      mean_evolution_1rm: -2,
    })
    expect(score).toBeLessThan(33)
  })

  it('borné dans [0, 100] même au-delà de ±2.5σ', () => {
    const hi = computeSessionScore({
      volume_kg: 3,
      densite: 3,
      charge_relative: 3,
      nb_pr: 3,
      mean_evolution_1rm: 3,
    })
    const lo = computeSessionScore({
      volume_kg: -3,
      densite: -3,
      charge_relative: -3,
      nb_pr: -3,
      mean_evolution_1rm: -3,
    })
    expect(hi).toBe(100)
    expect(lo).toBe(0)
  })

  it('discrimine : un PR seul (output) déplace le score au-dessus de 50', () => {
    const score = computeSessionScore({ ...Z0, nb_pr: 2, mean_evolution_1rm: 2 })
    expect(score).toBeGreaterThan(50)
  })

  it('pondération effort (0.6) > output (0.4) : effort pèse plus à amplitude égale', () => {
    const effortOnly = computeSessionScore({ ...Z0, volume_kg: 1, densite: 1, charge_relative: 1 })
    const outputOnly = computeSessionScore({ ...Z0, nb_pr: 1, mean_evolution_1rm: 1 })
    expect(effortOnly - 50).toBeGreaterThan(outputOnly - 50)
  })
})
