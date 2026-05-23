import { Stack, useNavigationContainerRef } from 'expo-router'
import { PostHogProvider } from 'posthog-react-native'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { useFonts } from 'expo-font'
import {
  Barlow_400Regular,
  Barlow_500Medium,
  Barlow_700Bold,
  Barlow_800ExtraBold,
  Barlow_900Black,
} from '@expo-google-fonts/barlow'
import { BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed'
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  const navigationRef = useNavigationContainerRef()

  const [fontsLoaded, fontError] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_700Bold,
    Barlow_800ExtraBold,
    Barlow_900Black,
    BarlowCondensed_700Bold,
    JetBrainsMono_500Medium,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <PostHogProvider
      apiKey={process.env.EXPO_PUBLIC_POSTHOG_KEY ?? ''}
      options={{ host: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com' }}
      autocapture={{
        captureScreens: true,
        navigationRef,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </PostHogProvider>
  )
}