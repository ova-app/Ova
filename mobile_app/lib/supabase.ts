import 'react-native-get-random-values'
import { createClient } from '@supabase/supabase-js'
import { ExpoSecureStoreAdapter } from './secureStoreAdapter'

// Polyfill crypto.randomUUID pour Supabase
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = function () {
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
      .map((b) =>
        Array.from(b)
          .map((x) => x.toString(16).padStart(2, '0'))
          .join('')
      )
      .join('-') as unknown as ReturnType<typeof crypto.randomUUID>
  } as typeof crypto.randomUUID
}

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
