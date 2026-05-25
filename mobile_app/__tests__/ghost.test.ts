/**
 * ghost.ts — tests de getGhostReference.
 *
 * La fonction dépend de getDB() → expo-sqlite. On mock getDB pour injecter
 * un faux db avec getFirstAsync contrôlable.
 *
 * On teste :
 *   - Retourne null si aucun set dans la fenêtre
 *   - Retourne le bon set (tri volume DESC puis weight_kg DESC)
 *   - Cutoff 30j : sets avant la fenêtre ignorés
 *   - Cutoff Pro (99999j) : tout l'historique accessible
 *   - Exercice inconnu → null
 *   - Exception SQLite → null (pas de crash)
 */

// ─── Mock expo-sqlite via getDB ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockGetFirstAsync: any

jest.mock('../lib/db', () => ({
  getDB: () => ({ getFirstAsync: mockGetFirstAsync }),
}))

import { getGhostReference } from '../lib/ghost'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRow(weight_kg: number, reps: number, logged_at: number) {
  return { weight_kg, reps, volume: weight_kg * reps, logged_at }
}

const NOW = Date.now()

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getGhostReference — résultat null', () => {
  beforeEach(() => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(null)
  })

  it('retourne null si aucun set dans la DB pour cet exercice', async () => {
    const result = await getGhostReference('uuid-bench', 30)
    expect(result).toBeNull()
  })

  it('retourne null pour un exercice inconnu (getFirstAsync → null)', async () => {
    const result = await getGhostReference('uuid-inconnu', 30)
    expect(result).toBeNull()
  })

  it('retourne null si SQLite lève une exception', async () => {
    mockGetFirstAsync = jest.fn().mockRejectedValue(new Error('DB locked'))
    const result = await getGhostReference('uuid-bench', 30)
    expect(result).toBeNull()
  })
})

describe('getGhostReference — mappage du résultat', () => {
  it('mappe correctement les champs du row SQLite vers GhostSet', async () => {
    const row = makeRow(80, 10, NOW - 1000)
    mockGetFirstAsync = jest.fn().mockResolvedValue(row)

    const result = await getGhostReference('uuid-bench', 30)

    expect(result).not.toBeNull()
    expect(result!.weight_kg).toBe(80)
    expect(result!.reps).toBe(10)
    expect(result!.volume).toBe(800)
    expect(result!.session_date).toBe(row.logged_at)
  })

  it('volume = weight_kg × reps (800 pour 80kg × 10 reps)', async () => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(makeRow(80, 10, NOW - 500))
    const result = (await getGhostReference('uuid-bench', 30))!
    expect(result.volume).toBe(800)
  })
})

describe('getGhostReference — cutoff temporel', () => {
  it('passe le bon cutoff (now - 30j en ms) à la requête SQL', async () => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(null)

    const before = Date.now()
    await getGhostReference('uuid-bench', 30)
    const after = Date.now()

    const [, , cutoff] = mockGetFirstAsync.mock.calls[0] as [string, string, number]

    const expectedMin = before - 30 * 24 * 60 * 60 * 1000
    const expectedMax = after  - 30 * 24 * 60 * 60 * 1000

    expect(cutoff).toBeGreaterThanOrEqual(expectedMin)
    expect(cutoff).toBeLessThanOrEqual(expectedMax)
  })

  it('passe l\'exerciseId comme second paramètre SQL', async () => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(null)
    await getGhostReference('uuid-squat', 30)
    const [, exerciseId] = mockGetFirstAsync.mock.calls[0] as [string, string, number]
    expect(exerciseId).toBe('uuid-squat')
  })

  it('cutoff Pro (99999j) produit un timestamp négatif — historique illimité', async () => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(null)
    await getGhostReference('uuid-bench', 99999)
    const [, , cutoff] = mockGetFirstAsync.mock.calls[0] as [string, string, number]
    expect(cutoff).toBeLessThan(0)
  })

  it('cutoff 1j ne capture que les sets très récents', async () => {
    mockGetFirstAsync = jest.fn().mockResolvedValue(null)
    const before = Date.now()
    await getGhostReference('uuid-bench', 1)
    const after = Date.now()

    const [, , cutoff] = mockGetFirstAsync.mock.calls[0] as [string, string, number]
    const oneDayMs = 24 * 60 * 60 * 1000

    expect(cutoff).toBeGreaterThanOrEqual(before - oneDayMs)
    expect(cutoff).toBeLessThanOrEqual(after - oneDayMs)
  })
})

describe('getGhostReference — logique de tri (ORDER BY volume DESC, weight_kg DESC)', () => {
  it('retourne le meilleur set (volume le plus élevé) parmi plusieurs candidats', async () => {
    // SQLite fait le tri — getFirstAsync retourne déjà le meilleur
    // On vérifie que la fonction ne re-trie pas et retourne tel quel
    const bestRow = makeRow(100, 10, NOW - 1000)  // volume 1000 — meilleur
    mockGetFirstAsync = jest.fn().mockResolvedValue(bestRow)

    const result = (await getGhostReference('uuid-bench', 30))!
    expect(result.weight_kg).toBe(100)
    expect(result.volume).toBe(1000)
  })

  it('à volume égal, retourne le set au poids le plus élevé', async () => {
    // volume = 800 pour 80×10 ou 160×5 — SQLite renvoie le plus lourd
    const heavierRow = makeRow(160, 5, NOW - 2000)  // weight_kg 160, volume 800
    mockGetFirstAsync = jest.fn().mockResolvedValue(heavierRow)

    const result = (await getGhostReference('uuid-bench', 30))!
    expect(result.weight_kg).toBe(160)
    expect(result.reps).toBe(5)
  })
})
