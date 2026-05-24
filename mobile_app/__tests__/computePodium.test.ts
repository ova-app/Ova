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

import { computePodium } from '../context/WorkoutContext'

describe('computePodium', () => {
  // ─── Cas de base ─────────────────────────────────────────────────────────────

  it('should return gold when value beats pr1', () => {
    expect(computePodium(100, { pr1: 80, pr2: 60, pr3: 40 })).toBe('gold')
  })

  it('should return silver when value beats pr2 but not pr1', () => {
    expect(computePodium(70, { pr1: 80, pr2: 60, pr3: 40 })).toBe('silver')
  })

  it('should return bronze when value beats pr3 but not pr2', () => {
    expect(computePodium(50, { pr1: 80, pr2: 60, pr3: 40 })).toBe('bronze')
  })

  it('should return null when value does not beat any pr', () => {
    expect(computePodium(30, { pr1: 80, pr2: 60, pr3: 40 })).toBeNull()
  })

  // ─── Top3 vide / partiellement rempli ────────────────────────────────────────

  it('should return null when top3 is empty (pr1 = 0)', () => {
    // pr1 <= 0 → null (même si value > 0)
    expect(computePodium(100, { pr1: 0, pr2: null, pr3: null })).toBeNull()
  })

  it('should return null when value is 0', () => {
    expect(computePodium(0, { pr1: 80, pr2: 60, pr3: 40 })).toBeNull()
  })

  it('should return gold when top3 has only pr1 and value beats it', () => {
    expect(computePodium(90, { pr1: 80, pr2: null, pr3: null })).toBe('gold')
  })

  it('should return null when top3 has only pr1 and value does not beat it', () => {
    // pr2 = null → silver branch skipped → bronze branch skipped → null
    expect(computePodium(70, { pr1: 80, pr2: null, pr3: null })).toBeNull()
  })

  it('should return gold when top3 partially filled [X, null, null] and value > X', () => {
    expect(computePodium(50, { pr1: 40, pr2: null, pr3: null })).toBe('gold')
  })

  it('should return silver when pr2 exists and value beats it but not pr1', () => {
    expect(computePodium(75, { pr1: 80, pr2: 60, pr3: null })).toBe('silver')
  })

  it('should return null when pr2 = null and value < pr1', () => {
    // No pr2 to beat → silver branch doesn't apply
    expect(computePodium(50, { pr1: 80, pr2: null, pr3: null })).toBeNull()
  })

  // ─── Égalités — comportement réel de computePodium ──────────────────────────
  // La fonction utilise des comparaisons strictes (value > prN).
  // "égal au pr1" → pas gold (value > pr1 = false) mais silver si value > pr2.
  // C'est voulu : égaler son record n'est pas un "nouveau" record absolu.

  it('should return silver when value equals pr1 but beats pr2', () => {
    // value=80 n'est pas > pr1=80 → pas gold. 80 > 60 → silver.
    expect(computePodium(80, { pr1: 80, pr2: 60, pr3: 40 })).toBe('silver')
  })

  it('should return bronze when value equals pr2 but beats pr3', () => {
    // value=60 n'est pas > pr1=80. 60 n'est pas > pr2=60 → pas silver. 60 > 40 → bronze.
    expect(computePodium(60, { pr1: 80, pr2: 60, pr3: 40 })).toBe('bronze')
  })

  it('should return null when value equals pr3 (no higher rank available)', () => {
    // value=40 n'est pas > 80, ni > 60, ni > 40 → null.
    expect(computePodium(40, { pr1: 80, pr2: 60, pr3: 40 })).toBeNull()
  })

  it('should return null when value equals pr1 and no pr2/pr3 exist', () => {
    // value=80 n'est pas > pr1=80 → pas gold. pr2=null → silver skipped. pr3=null → bronze skipped.
    expect(computePodium(80, { pr1: 80, pr2: null, pr3: null })).toBeNull()
  })

  // ─── Cas dégénérés ───────────────────────────────────────────────────────────

  it('should return null when value = 0 and top3 = [0, 0, 0]', () => {
    // value <= 0 → null
    expect(computePodium(0, { pr1: 0, pr2: 0, pr3: 0 })).toBeNull()
  })

  it('should return null when both value and pr1 are 0', () => {
    expect(computePodium(0, { pr1: 0, pr2: null, pr3: null })).toBeNull()
  })

  it('should handle decimal values correctly', () => {
    expect(computePodium(100.5, { pr1: 100, pr2: 80, pr3: 60 })).toBe('gold')
    expect(computePodium(90.5, { pr1: 100, pr2: 80, pr3: 60 })).toBe('silver')
  })
})
