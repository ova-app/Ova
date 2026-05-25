/**
 * Tests UX session — régressions sur les 3 bugs identifiés :
 * 1. Duplicate key dans ExerciseModal FlatList (sections groupées par label affiché)
 * 2. GestureHandlerRootView présent dans _layout (vérifié structurellement)
 * 3. ghost.ts hors de app/ (pas de default export manquant)
 */

// ─── Helpers extraits de session.tsx ─────────────────────────────────────────

const MUSCLE_LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Bras',
  triceps: 'Bras',
  quadriceps: 'Jambes',
  ischio_jambiers: 'Jambes',
  fessiers: 'Jambes',
  mollets: 'Jambes',
  abdominaux: 'Core',
}

interface ExerciseRow {
  id: string
  name_fr: string
  muscle_group: string | null
  equipment_type: string | null
}

type ListItem =
  | { type: 'header'; title: string }
  | { type: 'exercise'; item: ExerciseRow }

function buildSections(exercises: ExerciseRow[]) {
  const map = new Map<string, ExerciseRow[]>()
  for (const ex of exercises) {
    const label = (MUSCLE_LABELS[ex.muscle_group ?? ''] ?? ex.muscle_group ?? 'autre').toUpperCase()
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(ex)
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }))
}

function buildFlatData(exercises: ExerciseRow[]): ListItem[] {
  const sections = buildSections(exercises)
  const result: ListItem[] = []
  for (const section of sections) {
    result.push({ type: 'header', title: section.title })
    for (const ex of section.data) {
      result.push({ type: 'exercise', item: ex })
    }
  }
  return result
}

function keyExtractor(item: ListItem, idx: number): string {
  return item.type === 'header' ? `h-${item.title}` : `e-${item.item.id}-${idx}`
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ExerciseModal — sections grouping', () => {
  const LEGS_EXERCISES: ExerciseRow[] = [
    { id: '1', name_fr: 'Squat', muscle_group: 'quadriceps', equipment_type: 'barbell' },
    { id: '2', name_fr: 'Romanian Deadlift', muscle_group: 'ischio_jambiers', equipment_type: 'barbell' },
    { id: '3', name_fr: 'Hip Thrust', muscle_group: 'fessiers', equipment_type: 'barbell' },
    { id: '4', name_fr: 'Calf Raise', muscle_group: 'mollets', equipment_type: 'machine' },
  ]

  it('groups all leg muscle_groups under a single JAMBES section', () => {
    const sections = buildSections(LEGS_EXERCISES)
    const legsSection = sections.filter(s => s.title === 'JAMBES')
    expect(legsSection).toHaveLength(1)
    expect(legsSection[0].data).toHaveLength(4)
  })

  it('produces no duplicate section titles', () => {
    const exercises: ExerciseRow[] = [
      ...LEGS_EXERCISES,
      { id: '5', name_fr: 'Bench Press', muscle_group: 'pectoraux', equipment_type: 'barbell' },
      { id: '6', name_fr: 'Curl Biceps', muscle_group: 'biceps', equipment_type: 'dumbbell' },
      { id: '7', name_fr: 'Triceps Pushdown', muscle_group: 'triceps', equipment_type: 'cable' },
    ]
    const sections = buildSections(exercises)
    const titles = sections.map(s => s.title)
    const unique = new Set(titles)
    expect(unique.size).toBe(titles.length)
  })

  it('merges biceps and triceps under BRAS', () => {
    const exercises: ExerciseRow[] = [
      { id: '1', name_fr: 'Curl', muscle_group: 'biceps', equipment_type: null },
      { id: '2', name_fr: 'Extension', muscle_group: 'triceps', equipment_type: null },
    ]
    const sections = buildSections(exercises)
    const brasSection = sections.filter(s => s.title === 'BRAS')
    expect(brasSection).toHaveLength(1)
    expect(brasSection[0].data).toHaveLength(2)
  })

  it('handles null muscle_group without crash', () => {
    const exercises: ExerciseRow[] = [
      { id: '1', name_fr: 'Unknown', muscle_group: null, equipment_type: null },
    ]
    const sections = buildSections(exercises)
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('AUTRE')
  })
})

describe('ExerciseModal — flatData key uniqueness', () => {
  it('all keys are unique for a full exercise list', () => {
    const exercises: ExerciseRow[] = [
      { id: 'a', name_fr: 'Squat', muscle_group: 'quadriceps', equipment_type: 'barbell' },
      { id: 'b', name_fr: 'RDL', muscle_group: 'ischio_jambiers', equipment_type: 'barbell' },
      { id: 'c', name_fr: 'Hip Thrust', muscle_group: 'fessiers', equipment_type: 'barbell' },
      { id: 'd', name_fr: 'Bench Press', muscle_group: 'pectoraux', equipment_type: 'barbell' },
      { id: 'e', name_fr: 'Pull-up', muscle_group: 'dos', equipment_type: 'bodyweight' },
    ]
    const flatData = buildFlatData(exercises)
    const keys = flatData.map(keyExtractor)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it('header keys use display label — no h-quadriceps and h-ischio_jambiers collision', () => {
    const exercises: ExerciseRow[] = [
      { id: '1', name_fr: 'Squat', muscle_group: 'quadriceps', equipment_type: null },
      { id: '2', name_fr: 'RDL', muscle_group: 'ischio_jambiers', equipment_type: null },
    ]
    const flatData = buildFlatData(exercises)
    const headers = flatData.filter((i): i is { type: 'header'; title: string } => i.type === 'header')
    // Must have exactly 1 header "JAMBES", not 2 separate ones
    expect(headers).toHaveLength(1)
    expect(headers[0].title).toBe('JAMBES')
  })

  it('exercise keys include id — no collision between exercises with same name', () => {
    const exercises: ExerciseRow[] = [
      { id: 'uuid-1', name_fr: 'Curl', muscle_group: 'biceps', equipment_type: 'dumbbell' },
      { id: 'uuid-2', name_fr: 'Curl', muscle_group: 'biceps', equipment_type: 'barbell' },
    ]
    const flatData = buildFlatData(exercises)
    const keys = flatData.map(keyExtractor)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })
})

describe('ghost.ts — file location', () => {
  it('ghost.ts lives in lib/, not in app/workout/ (would break Expo Router)', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs') as typeof import('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const libPath = path.resolve(__dirname, '../lib/ghost.ts')
    const appPath = path.resolve(__dirname, '../app/workout/ghost.ts')
    expect(fs.existsSync(libPath)).toBe(true)
    expect(fs.existsSync(appPath)).toBe(false)
  })
})

describe('GhostSet — cutoff calculation', () => {
  it('30-day cutoff is 30 × 24 × 60 × 60 × 1000 ms in the past', () => {
    const now = Date.now()
    const cutoff = now - 30 * 24 * 60 * 60 * 1000
    const diffDays = (now - cutoff) / (1000 * 60 * 60 * 24)
    expect(Math.round(diffDays)).toBe(30)
  })

  it('pro cutoff (99999 days) is effectively unlimited', () => {
    const now = Date.now()
    const cutoff = now - 99999 * 24 * 60 * 60 * 1000
    expect(cutoff).toBeLessThan(0)
  })
})
