import 'react-native-get-random-values'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

// Polyfill crypto.randomUUID pour Supabase
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = function() {
    const bytes = new Uint8Array(16)
    global.crypto.getRandomValues(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    return [
      bytes.slice(0, 4),
      bytes.slice(4, 6),
      bytes.slice(6, 8),
      bytes.slice(8, 10),
      bytes.slice(10, 16),
    ]
      .map(b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''))
      .join('-')
  }
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

// Fragmente les valeurs trop grandes pour SecureStore
const ExpoSecureStoreAdapter = {
  getItem: async (key: string) => {
    const chunks: string[] = []
    let i = 0
    while (true) {
      const chunk = await SecureStore.getItemAsync(`${key}.${i}`)
      if (chunk === null) break
      chunks.push(chunk)
      i++
    }
    return chunks.length > 0 ? chunks.join('') : null
  },
  setItem: async (key: string, value: string) => {
    const chunkSize = 1800
    const chunks = value.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || []
    await Promise.all(chunks.map((chunk, i) =>
      SecureStore.setItemAsync(`${key}.${i}`, chunk)
    ))
  },
  removeItem: async (key: string) => {
    let i = 0
    while (true) {
      const exists = await SecureStore.getItemAsync(`${key}.${i}`)
      if (exists === null) break
      await SecureStore.deleteItemAsync(`${key}.${i}`)
      i++
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})