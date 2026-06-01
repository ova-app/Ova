import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { SkipForward } from 'lucide-react-native'
import { Canvas, Path, Skia } from '@shopify/react-native-skia'
import { storage } from '@/lib/storage'
import Animated, {
  useSharedValue,
  withTiming,
  withSequence,
  withDelay,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

const PRESETS = [
  { label: '30s',  value: 30  },
  { label: '1min', value: 60  },
  { label: '1:30', value: 90  },
  { label: '2min', value: 120 },
  { label: '3min', value: 180 },
]

const ARC_DIAMETER  = 260
const STROKE_WIDTH  = 8
const RADIUS_CIRCLE = (ARC_DIAMETER / 2) - STROKE_WIDTH
const ARC_CX        = ARC_DIAMETER / 2
const ARC_CY        = ARC_DIAMETER / 2

// Full-circle track path — static, computed once
const TRACK_PATH = (() => {
  const p = Skia.Path.Make()
  const N = 80
  for (let i = 0; i <= N; i++) {
    const a = ((i / N) * 2 - 0.5) * Math.PI
    const x = ARC_CX + RADIUS_CIRCLE * Math.cos(a)
    const y = ARC_CY + RADIUS_CIRCLE * Math.sin(a)
    if (i === 0) p.moveTo(x, y)
    else p.lineTo(x, y)
  }
  return p
})()

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${rem}`
  return `${m}:${String(rem).padStart(2, '0')}`
}

export default function TimerScreen() {
  const router = useRouter()
  const { colors } = useTheme()

  const DEFAULT_PRESET = PRESETS.find(p => p.value === (storage.getNumber('timer_default_preset') ?? 90))?.value ?? 90

  const [remaining, setRemaining] = useState<number>(DEFAULT_PRESET)
  const [paused, setPaused] = useState<boolean>(false)
  const [finished, setFinished] = useState<boolean>(false)

  const totalRef = useRef<number>(DEFAULT_PRESET)
  const startTimeRef = useRef<number>(Date.now())
  const pausedAtRef = useRef<number | null>(null)
  const pausedElapsedRef = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)

  const overlayOpacity = useSharedValue(0)
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }))

  const clearTick = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const triggerFinish = useCallback(() => {
    setFinished(true)
    clearTick()
    setRemaining(0)
    try { Vibration.vibrate(400) } catch (_) {}
    overlayOpacity.value = withSequence(
      withTiming(1, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      }),
      withDelay(1200, withTiming(1, { duration: 0 }))
    )
    setTimeout(() => {
      router.back()
    }, 1500)
  }, [clearTick, overlayOpacity, router])

  const startTick = useCallback((fromRemaining: number) => {
    clearTick()
    startTimeRef.current = Date.now()
    pausedElapsedRef.current = totalRef.current - fromRemaining

    intervalRef.current = setInterval(() => {
      const elapsed = pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000
      const next = totalRef.current - elapsed
      if (next <= 0) {
        triggerFinish()
      } else {
        setRemaining(next)
      }
    }, 100)
  }, [clearTick, triggerFinish])

  useEffect(() => {
    startTick(totalRef.current)
    return () => clearTick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        if (!paused && !finished) {
          const elapsed = pausedElapsedRef.current + (Date.now() - startTimeRef.current) / 1000
          const next = totalRef.current - elapsed
          if (next <= 0) {
            triggerFinish()
          } else {
            setRemaining(next)
            startTick(next)
          }
        }
      }
      appStateRef.current = nextState
    })
    return () => sub.remove()
  }, [paused, finished, startTick, triggerFinish])

  const handleTogglePause = useCallback(() => {
    if (finished) return
    if (paused) {
      setPaused(false)
      startTick(remaining)
    } else {
      clearTick()
      pausedAtRef.current = Date.now()
      setPaused(true)
    }
  }, [finished, paused, remaining, startTick, clearTick])

  const progress = totalRef.current > 0 ? remaining / totalRef.current : 0

  const progressPath = useMemo(() => {
    const p = Skia.Path.Make()
    if (progress <= 0) return p
    const N = Math.max(4, Math.round(progress * 80))
    const startRad = -Math.PI / 2
    const sweepRad  = progress * 2 * Math.PI
    for (let i = 0; i <= N; i++) {
      const a = startRad + (i / N) * sweepRad
      const x = ARC_CX + RADIUS_CIRCLE * Math.cos(a)
      const y = ARC_CY + RADIUS_CIRCLE * Math.sin(a)
      if (i === 0) p.moveTo(x, y)
      else p.lineTo(x, y)
    }
    return p
  }, [progress])

  const arcColor =
    progress < 0.15 ? colors.error :
    progress < 0.30 ? '#FF6B00'    :
    colors.accent

  const handleSubtract = useCallback(() => {
    if (finished) return
    const next = Math.max(5, remaining - 15)
    clearTick()
    setFinished(false)
    setRemaining(next)
    // totalRef.current intentionally unchanged — gauge = next / original_total
    pausedElapsedRef.current = totalRef.current - next
    if (!paused) startTick(next)
  }, [finished, remaining, paused, clearTick, startTick])

  const handleAdd = useCallback(() => {
    if (finished) return
    const next = remaining + 15
    clearTick()
    setFinished(false)
    setRemaining(next)
    totalRef.current = next
    pausedElapsedRef.current = 0
    if (!paused) startTick(next)
  }, [finished, remaining, paused, clearTick, startTick])

  const handleSkip = useCallback(() => {
    clearTick()
    setFinished(false)
    setRemaining(0)
    router.back()
  }, [clearTick, router])

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Anneau centré verticalement */}
      <View style={styles.centerArea}>
        <TouchableOpacity
          onPress={handleTogglePause}
          activeOpacity={0.85}
          style={styles.arcWrapper}
        >
          <Canvas style={[styles.svg, { width: ARC_DIAMETER, height: ARC_DIAMETER }]}>
            <Path
              path={TRACK_PATH}
              style="stroke"
              strokeWidth={STROKE_WIDTH}
              color={colors.backgroundTertiary}
              strokeCap="round"
            />
            {progress > 0 && (
              <Path
                path={progressPath}
                style="stroke"
                strokeWidth={STROKE_WIDTH}
                color={arcColor}
                strokeCap="round"
              />
            )}
          </Canvas>

          {/* Temps centré dans l'anneau */}
          <View style={styles.arcCenter} pointerEvents="none">
            <Text
              style={[styles.timerText, { color: colors.textPrimary }]}
              suppressHighlighting
            >
              {formatTime(remaining)}
            </Text>
            {paused && !finished && (
              <Text style={[styles.pauseLabel, { color: colors.textTertiary }]}>
                EN PAUSE
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* 3 boutons de contrôle */}
      <View style={styles.controlsRow}>
        <TouchableOpacity
          onPress={handleSubtract}
          style={[styles.controlBtn, { backgroundColor: colors.backgroundSecondary }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.controlLabel, { color: colors.textPrimary }]}>−15</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSkip}
          style={[styles.controlBtn, { backgroundColor: colors.backgroundSecondary }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <SkipForward size={18} color={colors.textPrimary} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleAdd}
          style={[styles.controlBtn, { backgroundColor: colors.backgroundSecondary }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.controlLabel, { color: colors.textPrimary }]}>+15</Text>
        </TouchableOpacity>
      </View>


      {finished && (
        <Animated.View
          style={[
            styles.overlay,
            { backgroundColor: colors.background },
            overlayStyle,
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.overlayText, { color: colors.accent }]}>REPOS TERMINÉ</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Zone centrale qui occupe tout l'espace disponible et centre l'anneau
  centerArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcWrapper: {
    width: ARC_DIAMETER,
    height: ARC_DIAMETER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    position: 'absolute',
  },
  arcCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 64,
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -2,
    lineHeight: 72,
  },
  pauseLabel: {
    ...typography.caption,
    letterSpacing: 1.5,
    marginTop: spacing.s1,
  },
  // Rangée de 3 boutons sous l'anneau
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s6,
    marginBottom: spacing.s10,
  },
  controlBtn: {
    minWidth: 52,
    height: 44,
    paddingHorizontal: spacing.s5,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    fontSize: 15,
    fontFamily: font.medium,
    letterSpacing: 0,
  },
  bottomSpacer: {
    height: spacing.s4,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    fontSize: 24,
    fontFamily: font.black,
    letterSpacing: 3,
  },
})
