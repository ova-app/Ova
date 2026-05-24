import React, { useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, font } from '@/constants/theme'

// ─── Logo Orava — cercle jaune + losange noir intérieur ──────────────────────

function LogoOrava({ accentColor, bgColor }: { accentColor: string; bgColor: string }): React.JSX.Element {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: accentColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Losange intérieur noir */}
      <View
        style={{
          width: 16,
          height: 16,
          backgroundColor: bgColor,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  )
}

// ─── Spinner — arc jaune animé ────────────────────────────────────────────────

function LoadingSpinner({ color }: { color: string }): React.JSX.Element {
  const rotation = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    )
    anim.start()
    return () => anim.stop()
  }, [rotation])

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <Animated.View
      style={{
        width: 40,
        height: 40,
        transform: [{ rotate: spin }],
      }}
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
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        router.replace('/(tabs)/feed')
      } else {
        router.replace('/auth/login')
      }
    }

    void checkSession()
  }, [router])

  const s = buildStyles(colors)

  return (
    <View style={s.root}>
      {/* Groupe logo + wordmark */}
      <View style={s.logoGroup}>
        <LogoOrava accentColor={colors.accent} bgColor={colors.background} />
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
