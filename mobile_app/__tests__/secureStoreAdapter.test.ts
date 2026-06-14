/**
 * lib/secureStoreAdapter.ts — adaptateur de stockage fragmenté pour Supabase auth.
 *
 * expo-secure-store est mocké par un magasin clé→valeur en mémoire. On teste :
 *   - round-trip d'une valeur courte (1 chunk) et longue (>1800b → plusieurs chunks)
 *   - getItem retourne null si rien n'est stocké
 *   - ORA-060 : setItem purge les chunks orphelins d'une valeur antérieure plus longue
 *   - removeItem efface tous les chunks
 */

const mockMem = new Map<string, string>()

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => (mockMem.has(k) ? mockMem.get(k)! : null)),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockMem.set(k, v)
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockMem.delete(k)
  }),
}))

import { ExpoSecureStoreAdapter } from '../lib/secureStoreAdapter'

beforeEach(() => {
  mockMem.clear()
  jest.clearAllMocks()
})

describe('ExpoSecureStoreAdapter — round-trip', () => {
  it('stocke et relit une valeur courte (1 chunk)', async () => {
    await ExpoSecureStoreAdapter.setItem('auth', 'hello')
    expect(mockMem.get('auth.0')).toBe('hello')
    expect(await ExpoSecureStoreAdapter.getItem('auth')).toBe('hello')
  })

  it('fragmente une valeur > 1800 bytes en plusieurs chunks et la reconstitue', async () => {
    const long = 'x'.repeat(4000) // 3 chunks : 1800 + 1800 + 400
    await ExpoSecureStoreAdapter.setItem('auth', long)
    expect(mockMem.has('auth.0')).toBe(true)
    expect(mockMem.has('auth.1')).toBe(true)
    expect(mockMem.has('auth.2')).toBe(true)
    expect(mockMem.has('auth.3')).toBe(false)
    expect(await ExpoSecureStoreAdapter.getItem('auth')).toBe(long)
  })

  it('getItem retourne null si rien stocké', async () => {
    expect(await ExpoSecureStoreAdapter.getItem('absent')).toBeNull()
  })
})

describe('ExpoSecureStoreAdapter — purge chunks orphelins (ORA-060)', () => {
  it("efface les chunks d'une valeur antérieure plus longue (pas de token corrompu)", async () => {
    const long = 'y'.repeat(5400) // 3 chunks
    await ExpoSecureStoreAdapter.setItem('auth', long)
    expect(mockMem.has('auth.2')).toBe(true)

    // Nouvelle valeur plus courte → 1 chunk. Les anciens .1 / .2 doivent disparaître.
    await ExpoSecureStoreAdapter.setItem('auth', 'short')
    expect(mockMem.has('auth.0')).toBe(true)
    expect(mockMem.has('auth.1')).toBe(false)
    expect(mockMem.has('auth.2')).toBe(false)

    // getItem ne doit relire QUE la nouvelle valeur, sans concaténer d'orphelins.
    expect(await ExpoSecureStoreAdapter.getItem('auth')).toBe('short')
  })
})

describe('ExpoSecureStoreAdapter — removeItem', () => {
  it('efface tous les chunks', async () => {
    await ExpoSecureStoreAdapter.setItem('auth', 'z'.repeat(3700)) // 3 chunks
    await ExpoSecureStoreAdapter.removeItem('auth')
    expect(mockMem.size).toBe(0)
    expect(await ExpoSecureStoreAdapter.getItem('auth')).toBeNull()
  })
})
