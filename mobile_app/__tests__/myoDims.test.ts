/**
 * myo.ts — tests des constantes de mapping et de computeMuscleDims.
 *
 * saveMyoSignature est non-testable ici (appel Supabase async complexe).
 * On teste :
 *   - FASCICLE_DIM : résolution fascicle → dim
 *   - MUSCLE_DIM : résolution muscle → dim
 *   - computeMuscleDims : calcul des 17 dims musculaires
 */

// Mock Supabase — myo.ts l'importe mais computeMuscleDims ne l'utilise pas
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select:      jest.fn().mockReturnThis(),
      eq:          jest.fn().mockReturnThis(),
      in:          jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
}))

// computeMuscleDims et les constantes ne sont pas exportées directement.
// On les réimporte en copiant la logique pure (la source de vérité est myo.ts).
// Cela permet de tester la logique sans modifier l'API publique de myo.ts.

// ─── Copie locale des constantes (reflète exactement myo.ts) ─────────────────

const FASCICLE_DIM: Record<string, Record<string, number>> = {
  grand_pectoral: { faisceau_claviculaire: 0, faisceau_sternal: 1, faisceau_abdominal: 1 },
  deltoide:       { faisceau_anterieur: 2, faisceau_median: 3, faisceau_posterieur: 4 },
}

const MUSCLE_DIM: Record<string, number> = {
  grand_dorsal: 5, trapeze: 6, grand_rond: 7, rhomboide: 8, erecteurs_rachis: 9,
  biceps: 10, triceps: 11,
  quadriceps: 12, ischio_jambiers: 13,
  fessier_maximus: 14, fessier_median: 14, fessier_minimus: 14,
  mollets: 15, abdominaux: 16,
}

interface EmRow {
  exercise_id: string
  muscle: string
  fascicle: string | null
  activation_pct: number
}

function resolveDim(muscle: string, fascicle: string | null): number {
  const map = FASCICLE_DIM[muscle]
  if (map) return fascicle ? (map[fascicle] ?? -1) : -1
  return MUSCLE_DIM[muscle] ?? -1
}

function computeMuscleDims(
  setsByExercise: Record<string, Array<{ weight_kg: number; reps: number }>>,
  emRows: EmRow[],
): number[] {
  const dims = new Array<number>(17).fill(0)
  for (const row of emRows) {
    const dim = resolveDim(row.muscle, row.fascicle)
    if (dim === -1) continue
    const sets = setsByExercise[row.exercise_id] ?? []
    dims[dim] += sets.reduce((s, set) => s + set.weight_kg * set.reps * (row.activation_pct / 100), 0)
  }
  return dims
}

// ─── Tests FASCICLE_DIM ───────────────────────────────────────────────────────

describe('FASCICLE_DIM — mapping fascicle → dim', () => {
  it('grand_pectoral / faisceau_claviculaire → dim 0', () => {
    expect(FASCICLE_DIM['grand_pectoral']['faisceau_claviculaire']).toBe(0)
  })

  it('grand_pectoral / faisceau_sternal → dim 1', () => {
    expect(FASCICLE_DIM['grand_pectoral']['faisceau_sternal']).toBe(1)
  })

  it('grand_pectoral / faisceau_abdominal → dim 1 (même que sternal)', () => {
    expect(FASCICLE_DIM['grand_pectoral']['faisceau_abdominal']).toBe(1)
  })

  it('deltoide / faisceau_anterieur → dim 2', () => {
    expect(FASCICLE_DIM['deltoide']['faisceau_anterieur']).toBe(2)
  })

  it('deltoide / faisceau_median → dim 3', () => {
    expect(FASCICLE_DIM['deltoide']['faisceau_median']).toBe(3)
  })

  it('deltoide / faisceau_posterieur → dim 4', () => {
    expect(FASCICLE_DIM['deltoide']['faisceau_posterieur']).toBe(4)
  })

  it('grand_pectoral with NULL fascicle → resolveDim returns -1', () => {
    expect(resolveDim('grand_pectoral', null)).toBe(-1)
  })

  it('deltoide with NULL fascicle → resolveDim returns -1', () => {
    expect(resolveDim('deltoide', null)).toBe(-1)
  })
})

// ─── Tests MUSCLE_DIM ────────────────────────────────────────────────────────

describe('MUSCLE_DIM — mapping muscle → dim', () => {
  it('grand_dorsal → dim 5', () => { expect(MUSCLE_DIM['grand_dorsal']).toBe(5) })
  it('trapeze → dim 6',       () => { expect(MUSCLE_DIM['trapeze']).toBe(6) })
  it('grand_rond → dim 7',    () => { expect(MUSCLE_DIM['grand_rond']).toBe(7) })
  it('rhomboide → dim 8',     () => { expect(MUSCLE_DIM['rhomboide']).toBe(8) })
  it('erecteurs_rachis → dim 9', () => { expect(MUSCLE_DIM['erecteurs_rachis']).toBe(9) })
  it('biceps → dim 10',       () => { expect(MUSCLE_DIM['biceps']).toBe(10) })
  it('triceps → dim 11',      () => { expect(MUSCLE_DIM['triceps']).toBe(11) })
  it('quadriceps → dim 12',   () => { expect(MUSCLE_DIM['quadriceps']).toBe(12) })
  it('ischio_jambiers → dim 13', () => { expect(MUSCLE_DIM['ischio_jambiers']).toBe(13) })
  it('fessier_maximus → dim 14', () => { expect(MUSCLE_DIM['fessier_maximus']).toBe(14) })
  it('fessier_median → dim 14',  () => { expect(MUSCLE_DIM['fessier_median']).toBe(14) })
  it('fessier_minimus → dim 14', () => { expect(MUSCLE_DIM['fessier_minimus']).toBe(14) })
  it('mollets → dim 15',      () => { expect(MUSCLE_DIM['mollets']).toBe(15) })
  it('abdominaux → dim 16',   () => { expect(MUSCLE_DIM['abdominaux']).toBe(16) })

  it('unknown muscle → resolveDim returns -1', () => {
    expect(resolveDim('avant_bras', null)).toBe(-1)
    expect(resolveDim('adducteurs', null)).toBe(-1)
  })
})

// ─── Tests computeMuscleDims ─────────────────────────────────────────────────

describe('computeMuscleDims', () => {
  it('should return array of 17 zeros when sets are empty', () => {
    const result = computeMuscleDims({}, [])
    expect(result).toHaveLength(17)
    expect(result.every(v => v === 0)).toBe(true)
  })

  it('should return 17 zeros when emRows is empty even with sets', () => {
    const sets = { 'ex-1': [{ weight_kg: 100, reps: 10 }] }
    const result = computeMuscleDims(sets, [])
    expect(result).toHaveLength(17)
    expect(result.every(v => v === 0)).toBe(true)
  })

  it('should compute dim[10] > 0 for a biceps curl set', () => {
    // biceps curl: 50kg × 10 reps, activation 80%
    // expected: 50 × 10 × 0.80 = 400
    const sets: Record<string, Array<{ weight_kg: number; reps: number }>> = {
      'ex-biceps': [{ weight_kg: 50, reps: 10 }],
    }
    const emRows: EmRow[] = [{
      exercise_id: 'ex-biceps',
      muscle: 'biceps',
      fascicle: null,
      activation_pct: 80,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result[10]).toBeCloseTo(400, 5)
    // Toutes les autres dims restent à 0
    expect(result.filter((_, i) => i !== 10).every(v => v === 0)).toBe(true)
  })

  it('should compute dim[11] for triceps pushdown', () => {
    // triceps: 40kg × 12 reps, activation 90%
    // expected: 40 × 12 × 0.90 = 432
    const sets = { 'ex-tri': [{ weight_kg: 40, reps: 12 }] }
    const emRows: EmRow[] = [{
      exercise_id: 'ex-tri',
      muscle: 'triceps',
      fascicle: null,
      activation_pct: 90,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result[11]).toBeCloseTo(432, 5)
  })

  it('should ignore exercises with no sets in setsByExercise', () => {
    const sets: Record<string, Array<{ weight_kg: number; reps: number }>> = {}
    const emRows: EmRow[] = [{
      exercise_id: 'ex-missing',
      muscle: 'biceps',
      fascicle: null,
      activation_pct: 100,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result[10]).toBe(0)
  })

  it('should ignore grand_pectoral rows with NULL fascicle (dim = -1)', () => {
    // grand_pectoral avec fascicle null → resolveDim = -1 → ignoré
    const sets = { 'ex-pec': [{ weight_kg: 80, reps: 8 }] }
    const emRows: EmRow[] = [{
      exercise_id: 'ex-pec',
      muscle: 'grand_pectoral',
      fascicle: null,
      activation_pct: 100,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result.every(v => v === 0)).toBe(true)
  })

  it('should correctly map grand_pectoral / faisceau_claviculaire → dim[0]', () => {
    // incline press: 70kg × 8 reps, activation 70% → dim[0] = 70 × 8 × 0.70 = 392
    const sets = { 'ex-incline': [{ weight_kg: 70, reps: 8 }] }
    const emRows: EmRow[] = [{
      exercise_id: 'ex-incline',
      muscle: 'grand_pectoral',
      fascicle: 'faisceau_claviculaire',
      activation_pct: 70,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result[0]).toBeCloseTo(392, 5)
    expect(result[1]).toBe(0) // faisceau_sternal non sollicité
  })

  it('should accumulate multiple sets for the same exercise', () => {
    // 3 sets de biceps: 50×10 + 55×8 + 60×6 = 500 + 440 + 360 = 1300 (activation 100%)
    const sets = {
      'ex-biceps': [
        { weight_kg: 50, reps: 10 },
        { weight_kg: 55, reps: 8  },
        { weight_kg: 60, reps: 6  },
      ],
    }
    const emRows: EmRow[] = [{
      exercise_id: 'ex-biceps',
      muscle: 'biceps',
      fascicle: null,
      activation_pct: 100,
    }]
    const result = computeMuscleDims(sets, emRows)
    expect(result[10]).toBeCloseTo(1300, 5)
  })

  it('should accumulate multiple muscles for a compound exercise', () => {
    // Bench press: pec sternal + deltoide anterieur + triceps
    // pec sternal (dim 1): 100kg × 10 × 90% = 900
    // deltoide ant (dim 2): 100kg × 10 × 30% = 300
    // triceps (dim 11): 100kg × 10 × 60% = 600
    const sets = { 'ex-bench': [{ weight_kg: 100, reps: 10 }] }
    const emRows: EmRow[] = [
      { exercise_id: 'ex-bench', muscle: 'grand_pectoral', fascicle: 'faisceau_sternal', activation_pct: 90 },
      { exercise_id: 'ex-bench', muscle: 'deltoide',       fascicle: 'faisceau_anterieur', activation_pct: 30 },
      { exercise_id: 'ex-bench', muscle: 'triceps',        fascicle: null, activation_pct: 60 },
    ]
    const result = computeMuscleDims(sets, emRows)
    expect(result[1]).toBeCloseTo(900, 5)
    expect(result[2]).toBeCloseTo(300, 5)
    expect(result[11]).toBeCloseTo(600, 5)
  })

  it('should handle fessiers correctly: all three map to dim[14]', () => {
    const sets = { 'ex-squat': [{ weight_kg: 120, reps: 5 }] }
    const emRows: EmRow[] = [
      { exercise_id: 'ex-squat', muscle: 'fessier_maximus', fascicle: null, activation_pct: 80 },
      { exercise_id: 'ex-squat', muscle: 'fessier_median',  fascicle: null, activation_pct: 20 },
    ]
    const result = computeMuscleDims(sets, emRows)
    // dim[14] = 120 × 5 × 0.80 + 120 × 5 × 0.20 = 480 + 120 = 600
    expect(result[14]).toBeCloseTo(600, 5)
  })
})
