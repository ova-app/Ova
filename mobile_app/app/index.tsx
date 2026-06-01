import React, { useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Image,
} from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, font } from '@/constants/theme'

// ─── Logo Orava ───────────────────────────────────────────────────────────────

function LogoOrava(): React.JSX.Element {
  return (
    <Image
      source={require('../assets/orava_logo.png')}
      style={{ width: 72, height: 72 }}
      resizeMode="contain"
    />
  )
}

// ─── Spinner — arc jaune animé ────────────────────────────────────────────────

function LoadingSpinner({ color }: { color: string }): React.JSX.Element {
  const rotation = useSharedValue(0)

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    )
  }, [rotation])

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }))

  return (
    <Animated.View
      style={[
        { width: 40, height: 40 },
        spinStyle,
      ]}
    >
      <Svg width={40} height={40} viewBox="0 0 40 40">
        {/* Arc partiel ~270° — de 12h à 9h dans le sens horaire */}
        <Path
          d="M 20,2 A 18,18 0 1 1 2,20"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SplashScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  // ─── Guard auth — logique préservée ───────────────────────────────────────

  useEffect(() => {
    async function checkSession(): Promise<void> {
      const [{ data: { session } }, onboardingDone] = await Promise.all([
        supabase.auth.getSession(),
        AsyncStorage.getItem('onboarding_done'),
      ])

      if (session) {
        router.replace('/(tabs)/feed')
      } else if (!onboardingDone) {
        router.replace('/onboarding')
      } else {
        router.replace('/auth/login')
      }
    }

    void checkSession()
  }, [router])

  const s = buildStyles(colors)

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />
      {/* Groupe logo + wordmark */}
      <View style={s.logoGroup}>
        <LogoOrava />
        <Text style={s.wordmark}>ORAVA</Text>
      </View>

      {/* Spinner séparé en dessous */}
      <View style={s.spinnerWrap}>
        <LoadingSpinner color={colors.accent} />
      </View>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoGroup: {
      alignItems: 'center',
      gap: spacing.s2,
    },
    wordmark: {
      fontSize: 18,
      fontFamily: font.condensedBold,
      color: colors.textPrimary,
      letterSpacing: 4,
    },
    spinnerWrap: {
      marginTop: spacing.s6,
    },
  })
}
