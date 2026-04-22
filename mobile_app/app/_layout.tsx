import { useEffect, useState } from 'react'
import { Stack, router, useSegments } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const segments = useSegments()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setInitialized(true)
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!initialized) return

    const inAuthGroup = segments[0] === 'auth'

    if (!session && !inAuthGroup) {
      router.replace('/auth/login')
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)/feed')
    }
  }, [session, initialized, segments])

  if (!initialized) return null

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="auth" />
    </Stack>
  )
}