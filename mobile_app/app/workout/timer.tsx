import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, Vibration,
  AppState, AppStateStatus, FlatList,
} from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'

// ─── Presets ─────────────────────────────────────────────────────────────────

const PRESETS = [
  { label: '45s', seconds: 45 },
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2min', seconds: 120 },
  { label: '3min', seconds: 180 },
]

const FACTORY_DEFAULT = 90

const MIN_VALUES = Array.from({ length: 11 }, (_, i) => i)   // 0..10 min
const SEC_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const PICKER_ITEM_H = 44

function nearestSec(s: number): number {
  return SEC_VALUES.reduce((best, v) => Math.abs(v - s) < Math.abs(best - s) ? v : best, 0)
}

// ─── TimerWheelColumn ─────────────────────────────────────────────────────────

function TimerWheelColumn({ values, selected, onSelect, colors, label, format }: {
  values: number[]
  selected: number
  onSelect: (v: number) => void
  colors: ReturnType<typeof useTheme>['colors']
  label: string
  format: (v: number) => string
}) {
  const flatRef = useRef<FlatList<number>>(null)

  useEffect(() => {
    const idx = Math.max(0, values.indexOf(selected))
    const timer = setTimeout(() => {
      flatRef.current?.scrollToOffset({ offset: idx * PICKER_ITEM_H, animated: false })
    }, 80)
    return () => clearTimeout(timer)
  }, [selected])

  function snap(offsetY: number) {
    const idx = Math.max(0, Math.min(Math.round(offsetY / PICKER_ITEM_H), values.length - 1))
    onSelect(values[idx])
    flatRef.current?.scrollToOffset({ offset: idx * PICKER_ITEM_H, animated: true })
  }

  return (
    <View style={twStyles.col}>
      <Text style={[twStyles.colLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[twStyles.wheel, { borderColor: colors.separator }]}>
        <View
          pointerEvents="none"
          style={[twStyles.highlight, { borderColor: colors.accent, backgroundColor: colors.accent + '15' }]}
        />
        <FlatList
          ref={flatRef}
          data={values}
          keyExtractor={v => String(v)}
          showsVerticalScrollIndicator={false}
          snapToInterval={PICKER_ITEM_H}
          decelerationRate="fast"
          contentContainerStyle={{ paddingVertical: PICKER_ITEM_H * 2 }}
          onScrollEndDrag={e => snap(e.nativeEvent.contentOffset.y)}
          onMomentumScrollEnd={e => snap(e.nativeEvent.contentOffset.y)}
          renderItem={({ item, index }) => {
            const isSel = item === selected
            return (
              <TouchableOpacity
                style={{ height: PICKER_ITEM_H, alignItems: 'center', justifyContent: 'center' }}
                onPress={() => {
                  onSelect(item)
                  flatRef.current?.scrollToOffset({ offset: index * PICKER_ITEM_H, animated: true })
                }}
              >
                <Text style={[
                  twStyles.itemText,
                  { color: isSel ? colors.accent : colors.textSecondary },
                  isSel && twStyles.itemTextSelected,
                ]}>
                  {format(item)}
                </Text>
              </TouchableOpacity>
            )
          }}
        />
      </View>
    </View>
  )
}

const twStyles = StyleSheet.create({
  col: { flex: 1, alignItems: 'center', gap: 8 },
  colLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  wheel: {
    width: '100%',
    height: PICKER_ITEM_H * 5,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: PICKER_ITEM_H * 2,
    left: 0, right: 0,
    height: PICKER_ITEM_H,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    zIndex: 1,
  },
  itemText: { fontSize: 20, fontVariant: ['tabular-nums'] },
  itemTextSelected: { fontSize: 26, fontWeight: '700' },
})

// ─── Composant ───────────────────────────────────────────────────────────────

export default function TimerScreen() {
  const { colors, themeName } = useTheme()
  const [selected, setSelected] = useState(FACTORY_DEFAULT)
  const [remaining, setRemaining] = useState(FACTORY_DEFAULT)
  const [running, setRunning] = useState(false)
  const [pickerMin, setPickerMin] = useState(Math.floor(FACTORY_DEFAULT / 60))
  const [pickerSec, setPickerSec] = useState(nearestSec(FACTORY_DEFAULT % 60))

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimestampRef = useRef<number | null>(null)
  const startRemainingRef = useRef<number>(FACTORY_DEFAULT)
  const runningRef = useRef(false)
  runningRef.current = running

  // Read default from AsyncStorage then always auto-start
  useEffect(() => {
    AsyncStorage.getItem('default_rest').then(value => {
      if (value && value !== 'disabled') {
        const secs = parseInt(value, 10)
        if (!isNaN(secs) && secs > 0) {
          setSelected(secs)
          setRemaining(secs)
          setPickerMin(Math.floor(secs / 60))
          setPickerSec(nearestSec(secs % 60))
        }
      }
      setRunning(true)
    })
  }, [])

  // Countdown interval
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

  // Background resilience
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
    setPickerMin(Math.floor(seconds / 60))
    setPickerSec(nearestSec(seconds % 60))
    setTimeout(() => setRunning(true), 50)
  }

  function applyWheel(min: number, sec: number) {
    const total = min * 60 + sec
    if (total <= 0) return
    if (intervalRef.current) clearInterval(intervalRef.current)
    setRunning(false)
    setSelected(total)
    setRemaining(total)
    setTimeout(() => setRunning(true), 50)
  }

  function togglePause() {
    if (remaining === 0) return
    if (running) {
      startRemainingRef.current = remaining
      setRunning(false)
    } else {
      setRunning(true)
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const isDone = remaining === 0
  const textColor = isDone ? colors.accent : colors.textPrimary

  return (
    <View style={[styles.overlay, { backgroundColor: themeName === 'dark' ? 'rgba(0,0,0,0.95)' : colors.background }]}>
      {/* Handle */}
      <View style={[styles.handle, { backgroundColor: colors.separator }]} />

      <Text style={[styles.title, { color: colors.textPrimary }]}>Repos</Text>

      {/* Main circle */}
      <View style={styles.circleContainer}>
        <View style={[styles.circleOuter, { borderColor: colors.backgroundSecondary }]}>
          <View style={[styles.circleInner, {
            borderColor: colors.accent,
            opacity: isDone ? 0.3 : 1,
          }]} />
          <View style={styles.circleContent}>
            <Text style={[styles.timerText, { color: textColor }]}>
              {formatTime(remaining)}
            </Text>
            <Text style={[styles.timerHint, { color: colors.textSecondary }]}>
              {isDone ? 'Terminé !' : running ? 'En cours' : 'Pausé'}
            </Text>
          </View>
        </View>
      </View>

      {/* Pause / Reprendre button */}
      {!isDone && (
        <TouchableOpacity
          style={[styles.pauseBtn, { backgroundColor: running ? colors.accent : colors.backgroundSecondary }]}
          onPress={togglePause}
          activeOpacity={0.85}
        >
          <Text style={[styles.pauseBtnText, { color: running ? '#fff' : colors.textPrimary }]}>
            {running ? '⏸  Pause' : '▶  Reprendre'}
          </Text>
        </TouchableOpacity>
      )}

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

      {/* Wheel picker */}
      <View style={styles.wheelRow}>
        <TimerWheelColumn
          values={MIN_VALUES}
          selected={pickerMin}
          onSelect={min => { setPickerMin(min); applyWheel(min, pickerSec) }}
          colors={colors}
          label="min"
          format={v => String(v)}
        />
        <Text style={[styles.wheelColon, { color: colors.textSecondary }]}>:</Text>
        <TimerWheelColumn
          values={SEC_VALUES}
          selected={pickerSec}
          onSelect={sec => { setPickerSec(sec); applyWheel(pickerMin, sec) }}
          colors={colors}
          label="sec"
          format={v => v.toString().padStart(2, '0')}
        />
      </View>

      {/* Stop button */}
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
    borderRadius: 2,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  circleContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleInner: {
    position: 'absolute',
    width: 184,
    height: 184,
    borderRadius: 92,
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
  pauseBtn: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  pauseBtnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  presets: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 20,
  },
  wheelColon: {
    fontSize: 28,
    fontWeight: '700',
    paddingBottom: 28,
  },
  stopBtn: {
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 14,
  },
  stopBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
})
