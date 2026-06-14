/**
 * lib/db.ts — tests des fonctions pures SQLite.
 *
 * expo-sqlite est mocké. On teste :
 *   - insertLocalSet : calcul volume = weight_kg × reps, params SQL corrects
 *   - insertLocalSession : params SQL corrects
 *   - getLastLocalSet : retourne { weight_kg, reps } ou null
 *   - getDB() avant initDB() → throw
 */

// ─── Mock expo-sqlite ─────────────────────────────────────────────────────────

let mockRunAsync: jest.Mock
let mockGetFirstAsync: jest.Mock
let mockExecAsync: jest.Mock
let mockOpenDatabaseAsync: jest.Mock

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: (...args: unknown[]) => mockOpenDatabaseAsync(...args),
}))

// ─── Imports après mock ───────────────────────────────────────────────────────

import { initDB, insertLocalSet, insertLocalSession, getLastLocalSet } from '../lib/db'

// ─── Reset DB singleton entre tests ──────────────────────────────────────────

beforeEach(async () => {
  mockRunAsync = jest.fn().mockResolvedValue(undefined)
  mockGetFirstAsync = jest.fn().mockResolvedValue(null)
  mockExecAsync = jest.fn().mockResolvedValue(undefined)
  mockOpenDatabaseAsync = jest.fn().mockResolvedValue({
    execAsync: mockExecAsync,
    runAsync: mockRunAsync,
    getFirstAsync: mockGetFirstAsync,
  })

  // Réinitialiser le singleton _db entre chaque test
  jest.resetModules()
})

// ─── getDB avant initDB ───────────────────────────────────────────────────────

describe('getDB — protection singleton', () => {
  it('throw si appelé avant initDB()', async () => {
    // Importer une version fraîche du module (pas encore initialisé)
    jest.isolateModules(() => {
      jest.mock('expo-sqlite', () => ({
        openDatabaseAsync: () => mockOpenDatabaseAsync(),
      }))
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getDB } = require('../lib/db') as typeof import('../lib/db')
      expect(() => getDB()).toThrow('DB not initialized')
    })
  })
})

// ─── initDB — schéma & versioning (ORA-061 / ORA-062) ─────────────────────────

describe('initDB — schéma & migration', () => {
  it('crée local_sessions avec PRIMARY KEY (ORA-062)', async () => {
    await initDB()
    const execSql = (mockExecAsync.mock.calls as unknown[][]).map((c) => c[0] as string).join('\n')
    expect(execSql).toMatch(/local_sessions[\s\S]*id TEXT PRIMARY KEY/)
  })

  it('lit puis écrit PRAGMA user_version (ORA-061)', async () => {
    await initDB()
    expect(mockGetFirstAsync).toHaveBeenCalledWith('PRAGMA user_version')
    const execSql = (mockExecAsync.mock.calls as unknown[][]).map((c) => c[0] as string).join('\n')
    expect(execSql).toMatch(/PRAGMA user_version =/)
  })

  it('reconstruit local_sessions en migration v1 si base < v1', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ user_version: 0 })
    await initDB()
    const execSql = (mockExecAsync.mock.calls as unknown[][]).map((c) => c[0] as string).join('\n')
    expect(execSql).toMatch(/local_sessions_v1/)
    expect(execSql).toMatch(/RENAME TO local_sessions/)
  })

  it('ne re-migre pas une base déjà en v1', async () => {
    mockGetFirstAsync.mockResolvedValueOnce({ user_version: 1 })
    await initDB()
    const execSql = (mockExecAsync.mock.calls as unknown[][]).map((c) => c[0] as string).join('\n')
    expect(execSql).not.toMatch(/local_sessions_v1/)
  })
})

// ─── insertLocalSet ───────────────────────────────────────────────────────────

describe('insertLocalSet', () => {
  beforeEach(async () => {
    await initDB()
  })

  it('appelle runAsync avec INSERT OR REPLACE', async () => {
    await insertLocalSet({
      id: 'set-1',
      exercise_id: 'ex-bench',
      weight_kg: 80,
      reps: 10,
      session_id: 'session-1',
      logged_at: 1_700_000_000_000,
    })
    expect(mockRunAsync).toHaveBeenCalled()
    const [sql] = mockRunAsync.mock.calls[0] as [string, ...unknown[]]
    expect(sql).toMatch(/INSERT OR REPLACE/i)
  })

  it('calcule volume = weight_kg × reps (80 × 10 = 800)', async () => {
    await insertLocalSet({
      id: 'set-2',
      exercise_id: 'ex-bench',
      weight_kg: 80,
      reps: 10,
      session_id: 'session-1',
      logged_at: 1_700_000_000_000,
    })
    const params = mockRunAsync.mock.calls[0] as unknown[]
    // params[0] = sql, params[1..] = valeurs bindées
    expect(params).toContain(800) // volume = 80 × 10
  })

  it('calcule volume = weight_kg × reps (100 × 5 = 500)', async () => {
    await insertLocalSet({
      id: 'set-3',
      exercise_id: 'ex-squat',
      weight_kg: 100,
      reps: 5,
      session_id: 'session-2',
      logged_at: 1_700_000_000_001,
    })
    const params = mockRunAsync.mock.calls[0] as unknown[]
    expect(params).toContain(500) // volume = 100 × 5
  })

  it('passe id, exercise_id, weight_kg, reps, session_id, logged_at dans les params', async () => {
    const input = {
      id: 'set-abc',
      exercise_id: 'ex-curl',
      weight_kg: 20,
      reps: 12,
      session_id: 'session-99',
      logged_at: 1_700_000_000_999,
    }
    await insertLocalSet(input)
    const params = mockRunAsync.mock.calls[0] as unknown[]
    expect(params).toContain('set-abc')
    expect(params).toContain('ex-curl')
    expect(params).toContain(20)
    expect(params).toContain(12)
    expect(params).toContain(240) // volume = 20 × 12
    expect(params).toContain('session-99')
    expect(params).toContain(1_700_000_000_999)
  })

  it('volume = 0 pour weight_kg = 0 (set vide)', async () => {
    await insertLocalSet({
      id: 'set-empty',
      exercise_id: 'ex-bench',
      weight_kg: 0,
      reps: 10,
      session_id: 'session-1',
      logged_at: 1_700_000_000_000,
    })
    const params = mockRunAsync.mock.calls[0] as unknown[]
    expect(params).toContain(0)
  })

  it('volume = 0 pour reps = 0', async () => {
    await insertLocalSet({
      id: 'set-zero-reps',
      exercise_id: 'ex-bench',
      weight_kg: 80,
      reps: 0,
      session_id: 'session-1',
      logged_at: 1_700_000_000_000,
    })
    const params = mockRunAsync.mock.calls[0] as unknown[]
    expect(params).toContain(0)
  })
})

// ─── insertLocalSession ───────────────────────────────────────────────────────

describe('insertLocalSession', () => {
  beforeEach(async () => {
    await initDB()
  })

  it('appelle runAsync avec INSERT OR REPLACE', async () => {
    await insertLocalSession({
      id: 'session-1',
      total_volume_kg: 12450,
      logged_at: 1_700_000_000_000,
    })
    expect(mockRunAsync).toHaveBeenCalled()
    const [sql] = mockRunAsync.mock.calls[0] as [string, ...unknown[]]
    expect(sql).toMatch(/INSERT OR REPLACE/i)
  })

  it('passe id, total_volume_kg, logged_at dans les params', async () => {
    await insertLocalSession({
      id: 'session-xyz',
      total_volume_kg: 5000,
      logged_at: 1_700_000_000_001,
    })
    const params = mockRunAsync.mock.calls[0] as unknown[]
    expect(params).toContain('session-xyz')
    expect(params).toContain(5000)
    expect(params).toContain(1_700_000_000_001)
  })
})

// ─── getLastLocalSet ──────────────────────────────────────────────────────────

describe('getLastLocalSet', () => {
  beforeEach(async () => {
    await initDB()
    // initDB lit `PRAGMA user_version` (migrate) → on repart d'un historique propre
    // pour que mock.calls[0] soit bien la requête getLastLocalSet.
    mockGetFirstAsync.mockClear()
  })

  it('retourne null si aucun set pour cet exercice', async () => {
    mockGetFirstAsync.mockResolvedValue(null)
    const result = await getLastLocalSet('ex-inconnu')
    expect(result).toBeNull()
  })

  it('retourne { weight_kg, reps } si un set existe', async () => {
    mockGetFirstAsync.mockResolvedValue({ weight_kg: 80, reps: 10 })
    const result = await getLastLocalSet('ex-bench')
    expect(result).toEqual({ weight_kg: 80, reps: 10 })
  })

  it('retourne null si getFirstAsync retourne undefined (edge case driver)', async () => {
    mockGetFirstAsync.mockResolvedValue(undefined)
    const result = await getLastLocalSet('ex-bench')
    expect(result).toBeNull()
  })

  it('retourne null si SQLite lève une exception', async () => {
    mockGetFirstAsync.mockRejectedValue(new Error('DB error'))
    const result = await getLastLocalSet('ex-bench')
    expect(result).toBeNull()
  })

  it('utilise ORDER BY logged_at DESC dans la requête', async () => {
    mockGetFirstAsync.mockResolvedValue(null)
    await getLastLocalSet('ex-bench')
    const [sql] = mockGetFirstAsync.mock.calls[0] as [string, ...unknown[]]
    expect(sql).toMatch(/ORDER BY logged_at DESC/i)
  })

  it("passe l'exerciseId comme paramètre SQL", async () => {
    mockGetFirstAsync.mockResolvedValue(null)
    await getLastLocalSet('ex-squat')
    const params = mockGetFirstAsync.mock.calls[0] as unknown[]
    expect(params).toContain('ex-squat')
  })
})
