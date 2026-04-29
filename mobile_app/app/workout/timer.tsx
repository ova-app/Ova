import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration,
  AppState, AppStateStatus,
} from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '45s', seconds: 45 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '120s', seconds: 120 },
]

const FACTORY_DEFAULT = 90

// ─── Composant ───────────────────────────────────────────────────────────────

export default function TimerScreen() {
  const { colors } = useTheme()
  const [selected, setSelected] = useState(FACTORY_DEFAULT)
  const [remaining, setRemaining] = useState(FACTORY_DEFAULT)
  const [running, setRunning] = useState(false)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimestampRef = useRef<number | null>(null)
  const startRemainingRef = useRef<number>(FACTORY_DEFAULT)
  const runningRef = useRef(false)
  runningRef.current = running

  // Lire la durée par défaut depuis AsyncStorage et auto-démarrer
  useEffect(() => {
    AsyncStorage.getItem('default_rest').then(value => {
      if (!value || value === 'disabled') return
      const secs = parseInt(value, 10)
      if (!isNaN(secs) && secs > 0) {
        setSelected(secs)
        setRemaining(secs)
        setRunning(true)
      }
    })
  }, [])

  // Interval de décompte
  useEffect(() => {
    if (running) {
      startTimestampRef.current = Date.now()
      startRemainingRef.current = remaining
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!)
            setRunning(false)
            Vibration.vibrate([0, 300, 150, 300, 150, 500])
            setTimeout(() => router.back(), 1000)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [running])

  // Résistance mise en fond
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active' && runningRef.current && startTimestampRef.current !== null) {
        const elapsed = Math.floor((Date.now() - startTimestampRef.current) / 1000)
        const newRemaining = Math.max(0, startRemainingRef.current - elapsed)
        setRemaining(newRemaining)
        startTimestampRef.current = Date.now()
        startRemainingRef.current = newRemaining
        if (newRemaining === 0) {
          setRunning(false)
          Vibration.vibrate([0, 300, 150, 300, 150, 500])
          setTimeout(() => router.back(), 1000)
        }
      }
    })
    return () => sub.remove()
  }, [])

  function selectPreset(seconds: number) {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    setSelected(seconds)
    setRemaining(seconds)
    // Auto-start on preset selection
    setTimeout(() => setRunning(true), 50)
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isDone = remaining === 0

  return (
    <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.92)' }]}>
      {/* Handle */}
      <View style={styles.handle} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Repos</Text>

      {/* Cercle principal */}
      <View style={styles.circleContainer}>
        {/* SVG-like circle using borders */}
        <View style={[styles.circleOuter, { borderColor: colors.backgroundSecondary }]}>
          <View style={[styles.circleInner, {
            borderColor: isDone ? colors.accent : colors.accent,
            opacity: isDone ? 0.3 : 1,
          }]} />
          <View style={styles.circleContent}>
            <Text style={[styles.timerText, { color: isDone ? colors.accent : colors.textPrimary }]}>
              {formatTime(remaining)}
            </Text>
            <Text style={[styles.timerHint, { color: colors.textSecondary }]}>
              {isDone ? 'Terminé !' : running ? 'En cours' : 'Pausé'}
            </Text>
          </View>
        </View>
      </View>

      {/* Presets */}
      <View style={styles.presets}>
        {PRESETS.map(p => (
          <TouchableOpacity
            key={p.seconds}
            style={[
              styles.preset,
              { backgroundColor: colors.card, borderColor: colors.separator },
              selected === p.seconds && { backgroundColor: colors.accent + '22', borderColor: colors.accent },
            ]}
            onPress={() => selectPreset(p.seconds)}
          >
            <Text style={[
              styles.presetText,
              { color: selected === p.seconds ? colors.accent : colors.textSecondary },
              selected === p.seconds && { fontWeight: '700' },
            ]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Bouton Arrêter */}
      <TouchableOpacity
        style={[styles.stopBtn, { backgroundColor: colors.card }]}
        onPress={() => router.back()}
      >
        <Text style={[styles.stopBtnText, { color: colors.textSecondary }]}>Arrêter</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 16,
    paddingBottom: 48,
    paddingHorizontal: 24,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 32,
    letterSpacing: 0.3,
  },
  circleContainer: {
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleOuter: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    position: 'absolute',
    width: 204,
    height: 204,
    borderRadius: 102,
    borderWidth: 4,
  },
  circleContent: {
    alignItems: 'center',
    gap: 6,
  },
  timerText: {
    fontSize: 64,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  timerHint: {
    fontSize: 13,
  },
  presets: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 40,
  },
  preset: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 15,
    fontWeight: '600',
  },
  stopBtn: {
    paddingVertical: 16,
    paddingHorizontal: 56,
    borderRadius: 14,
  },
  stopBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
})