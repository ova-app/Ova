import AsyncStorage from '@react-native-async-storage/async-storage'

const PREFIX = 'orava-workout:'
const cache = new Map<string, string>()

export const storage = {
  set(key: string, value: string): void {
    cache.set(key, value)
    AsyncStorage.setItem(PREFIX + key, value).catch(() => {})
  },
  getString(key: string): string | undefined {
    return cache.get(key)
  },
  getNumber(key: string): number | undefined {
    const v = cache.get(key)
    if (v === undefined) return undefined
    const n = Number(v)
    return isNaN(n) ? undefined : n
  },
  setNumber(key: string, value: number): void {
    this.set(key, String(value))
  },
  delete(key: string): void {
    cache.delete(key)
    AsyncStorage.removeItem(PREFIX + key).catch(() => {})
  },
}

export async function hydrateStorage(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    const ours = keys.filter(k => k.startsWith(PREFIX))
    if (ours.length === 0) return
    const pairs = await AsyncStorage.multiGet(ours)
    for (const [k, v] of pairs) {
      if (v !== null) cache.set(k.slice(PREFIX.length), v)
    }
  } catch (_) {}
}
