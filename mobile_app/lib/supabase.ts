import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'

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