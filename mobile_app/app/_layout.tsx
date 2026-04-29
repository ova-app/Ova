import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet } from 'react-native'
import { Stack, router, useSegments } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../lib/supabase'
import { WorkoutProvider } from '../context/WorkoutContext'
import { ThemeProvider, useTheme } from '../context/ThemeContext'

function AppStack() {
  const { themeName } = useTheme()
  return (
    <>
      <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="workout" />
      </Stack>
    </>
  )
}

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const segments = useSegments()

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setInitialized(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!initialized) return
    const inAuthGroup = segments[0] === 'auth'
    if (!session && !inAuthGroup) router.replace('/auth/login')
    else if (session && inAuthGroup) router.replace('/(tabs)/feed')
  }, [session, initialized, segments])

  return (
    <ThemeProvider>
      <WorkoutProvider>
        <AppStack />
        {showSplash && (
          <SplashOverlay
            onDone={() => setShowSplash(false)}
            initialized={initialized}
          />
        )}
      </WorkoutProvider>
    </ThemeProvider>
  )
}

function SplashOverlay({ onDone, initialized }: { onDone: () => void; initialized: boolean }) {
  const containerOpacity = useRef(new Animated.Value(1)).current
  const logoOpacity = useRef(new Animated.Value(0)).current
  const logoScale = useRef(new Animated.Value(0.82)).current
  const taglineOpacity = useRef(new Animated.Value(0)).current
  const firedRef = useRef(false)

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 85, friction: 8, useNativeDriver: true }),
    ]).start()
    Animated.timing(taglineOpacity, { toValue: 1, duration: 400, delay: 400, useNativeDriver: true }).start()
  }, [])

  useEffect(() => {
    if (!initialized || firedRef.current) return
    firedRef.current = true
    const t = setTimeout(() => {
      Animated.timing(containerOpacity, { toValue: 0, duration: 380, useNativeDriver: true })
        .start(onDone)
    }, 650)
    return () => clearTimeout(t)
  }, [initialized])

  return (
    <Animated.View style={[splashStyles.overlay, { opacity: containerOpacity }]}>
      <Animated.Text style={[
        splashStyles.logo,
        { opacity: logoOpacity, transform: [{ scale: logoScale }] },
      ]}>
        Orava
      </Animated.Text>
      <Animated.Text style={[splashStyles.tagline, { opacity: taglineOpacity }]}>
        Forge ta progression
      </Animated.Text>
    </Animated.View>
  )
}

const splashStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1C1C1E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 999,
  },
  logo: {
    color: '#D85A30',
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1.5,
  },
  tagline: {
    color: '#8E8E93',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D85A30',
  },
})