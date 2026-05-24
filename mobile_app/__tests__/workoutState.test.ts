// WorkoutContext importe supabase → mock requis avant l'import
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
}))

/**
 * WorkoutContext — tests de logique pure.
 *
 * WorkoutProvider est couplé à React (useState, useRef, useEffect) et à Supabase
 * (addExercise fait un appel réseau). On teste uniquement les fonctions pures
 * exportées : computePodium, et les helpers internes extraits via exports.
 *
 * La machine d'état complète (startWorkout → addExercise → validateSet → finishWorkout)
 * est non-testable sans react-test-renderer — elle est couverte par les tests E2E.
 */

import { computePodium } from '../context/WorkoutContext'
import type { PrLevel } from '../context/WorkoutContext'

// ─── computePodium — machine à état des PRs ──────────────────────────────────

describe('computePodium — workout state transitions', () => {
  // Simule l'état initial : pas d'historique → top3 vide
  it('should return null when there is no history (pr1 = 0)', () => {
    const emptyTop3 = { pr1: 0, pr2: null, pr3: null }
    const result = computePodium(150, emptyTop3)
    expect(result).toBeNull()
  })

  // Premier PR enregistré : désormais pr1 > 0, nouvelle valeur bat le record
  it('should return gold on first real record after seed', () => {
    const top3WithPr1 = { pr1: 100, pr2: null, pr3: null }
    expect(computePodium(110, top3WithPr1)).toBe('gold')
  })

  // Séquence complète : gold → silver → bronze → null
  it('should assign correct PR levels across a full top-3', () => {
    const top3 = { pr1: 200, pr2: 180, pr3: 160 }
    const gold:   PrLevel = computePodium(210, top3)
    const silver: PrLevel = computePodium(190, top3)
    const bronze: PrLevel = computePodium(170, top3)
    const none:   PrLevel = computePodium(150, top3)

    expect(gold).toBe('gold')
    expect(silver).toBe('silver')
    expect(bronze).toBe('bronze')
    expect(none).toBeNull()
  })

  // Valeur 0 → jamais de PR (poids 0 = set vide)
  it('should return null for a zero-weight set (invalid set)', () => {
    const top3 = { pr1: 100, pr2: 80, pr3: 60 }
    expect(computePodium(0, top3)).toBeNull()
  })

  // pr_charge = poids brut × 1 ; pr_serie = poids × reps
  it('should correctly evaluate pr_serie volume (weight × reps)', () => {
    // Ex: bench 80kg × 10 reps = 800. Historique max = 750.
    const serieTop3 = { pr1: 750, pr2: 700, pr3: 650 }
    expect(computePodium(800, serieTop3)).toBe('gold')
    expect(computePodium(720, serieTop3)).toBe('silver')
    expect(computePodium(660, serieTop3)).toBe('bronze')
    expect(computePodium(600, serieTop3)).toBeNull()
  })

  // Égalité avec pr1 : comparaison stricte → pas gold. Mais si pr2 existe et value > pr2 → silver.
  it('should return silver when value equals pr1 but beats pr2', () => {
    // value=200 n'est pas > pr1=200 → pas gold. 200 > 180 → silver.
    expect(computePodium(200, { pr1: 200, pr2: 180, pr3: 160 })).toBe('silver')
  })

  // top3 partiellement rempli : seul pr1 existe, pas de pr2/pr3
  it('should handle partial top3 (only pr1 set)', () => {
    const partialTop3 = { pr1: 100, pr2: null, pr3: null }
    // Valeur sous pr1 : aucune branche silver/bronze car pr2/pr3 sont null
    expect(computePodium(90, partialTop3)).toBeNull()
    // Valeur au-dessus : gold
    expect(computePodium(110, partialTop3)).toBe('gold')
  })

  // top3 avec pr1 et pr2 mais pas pr3
  it('should handle partial top3 (pr1 and pr2, no pr3)', () => {
    const top3 = { pr1: 100, pr2: 80, pr3: null }
    expect(computePodium(90, top3)).toBe('silver')
    expect(computePodium(70, top3)).toBeNull() // pr3 = null → bronze branch skipped
    expect(computePodium(110, top3)).toBe('gold')
  })
})

// ─── Types exportés ──────────────────────────────────────────────────────────

describe('PrLevel type', () => {
  it('should only accept gold | silver | bronze | null', () => {
    const levels: PrLevel[] = ['gold', 'silver', 'bronze', null]
    expect(levels).toHaveLength(4)
    expect(levels[0]).toBe('gold')
    expect(levels[3]).toBeNull()
  })
})
