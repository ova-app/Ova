import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  StatusBar,
} from 'react-native'
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  runOnJS,
  Easing,
} from 'react-native-reanimated'
import { Gesture, GestureDetector, type PanGestureHandlerEventPayload, type GestureStateChangeEvent, type GestureUpdateEvent } from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import { Plus, Trash2, X, Search, Zap, Flame, Trophy, Dumbbell, Check, ChevronLeft } from 'lucide-react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring } from '@/constants/theme'
import {
  useWorkout,
  WorkoutExercise,
  WorkoutSet,
  PrLevel,
} from '@/context/WorkoutContext'
import { prOverlayRecipe, prBadgeRecipe, type PrLevel as PrLevelStrict, type PrType } from '@/constants/recipes'
import { storage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { getGhostReference, type GhostSet } from '@/lib/ghost'
import { getLastLocalSet } from '@/lib/db'
import WheelPickerModal from './wheel-picker-modal'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseRow {
  id: string
  name_fr: string
  muscle_group: string | null
  equipment_type: string | null
}

interface PrEvent {
  type: PrType
  level: PrLevelStrict
  title: string       // "RECORD CHARGE" etc.
  value: string       // "120 kg" / "1 240 kg" / "120 × 8"
  subtitle: string    // "+5 kg vs ancien record" or "Nouveau sommet"
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REPS_VALUES = Array.from({ length: 50 }, (_, i) => i + 1)

const MUSCLE_LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux',
  dos: 'Dos',
  epaules: 'Épaules',
  biceps: 'Bras',
  triceps: 'Bras',
  quadriceps: 'Jambes',
  ischio_jambiers: 'Jambes',
  fessiers: 'Jambes',
  mollets: 'Jambes',
  abdominaux: 'Core',
}

const CHIP_GROUPS = [
  { key: null, label: 'Tous' },
  { key: 'pectoraux', label: 'Pectoraux' },
  { key: 'dos', label: 'Dos' },
  { key: 'epaules', label: 'Épaules' },
  { key: 'biceps', label: 'Bras' },
  { key: 'quadriceps', label: 'Jambes' },
]

function getWeightValues(equipType: string | null): number[] {
  if (equipType === 'bodyweight') return []
  if (equipType === 'dumbbell') return Array.from({ length: 30 }, (_, i) => (i + 1) * 2)
  if (equipType === 'barbell') {
    return [20, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160, 170, 180, 190, 200, 210, 220]
  }
  if (equipType === 'kettlebell') return Array.from({ length: 12 }, (_, i) => (i + 1) * 4)
  return Array.from({ length: 80 }, (_, i) => (i + 1) * 2.5)
}

function snapshotToMMKV(
  exercises: WorkoutExercise[],
  currentIndex: number,
  startedAt: Date | null,
): void {
  storage.set(
    'workout_session_draft',
    JSON.stringify({ exercises, currentIndex, startedAt: startedAt?.toISOString() ?? null }),
  )
}

function prLevelColor(level: PrLevel, colors: ReturnType<typeof useTheme>['colors']): string {
  if (level === 'gold') return colors.prGold
  if (level === 'silver') return colors.prSilver
  if (level === 'bronze') return colors.prBronze
  return colors.textSecondary
}

function bestPrLevel(a: PrLevel, b: PrLevel): PrLevel {
  const rank = (l: PrLevel) => (l === 'gold' ? 3 : l === 'silver' ? 2 : l === 'bronze' ? 1 : 0)
  return rank(a) >= rank(b) ? a : b
}

function normalizeNFD(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ─── LogoOrava ───────────────────────────────────────────────────────────────

function LogoOrava() {
  const { colors } = useTheme()
  return (
    <Svg width={48} height={48} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="44"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="35.5" stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="27"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="18.5" stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="10"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="3.5"  fill={colors.accent} />
    </Svg>
  )
}

// ─── SetRow (swipe delete) ────────────────────────────────────────────────────

interface SetRowProps {
  set: WorkoutSet
  onDelete: () => void
  colors: ReturnType<typeof useTheme>['colors']
}

function SetRow({ set, onDelete, colors }: SetRowProps) {
  const translateX = useSharedValue(0)
  const baseOffset = useSharedValue(0)
  const rowHeight = useSharedValue(touchTarget.comfort)
  const rowOpacity = useSharedValue(1)
  const THRESHOLD = 56
  const DELETE_REVEAL = 68

  const panGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-20, 20])
    .onUpdate((e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      const next = baseOffset.value + e.translationX
      translateX.value = Math.min(0, Math.max(next, -DELETE_REVEAL))
    })
    .onEnd((e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
      const next = baseOffset.value + e.translationX
      if (next < -THRESHOLD) {
        translateX.value = withSpring(-DELETE_REVEAL, spring.snappy)
        baseOffset.value = -DELETE_REVEAL
      } else {
        translateX.value = withSpring(0, spring.snappy)
        baseOffset.value = 0
      }
    })

  function handleDeleteConfirm() {
    rowOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) })
    rowHeight.value = withTiming(0, { duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1) }, (finished) => {
      'worklet'
      if (finished) runOnJS(onDelete)()
    })
  }

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const wrapperAnimStyle = useAnimatedStyle(() => ({
    height: rowHeight.value,
    opacity: rowOpacity.value,
  }))

  const prLevel = bestPrLevel(set.pr_charge, set.pr_serie)
  const prColor = prLevelColor(prLevel, colors)

  return (
    <Animated.View style={[styles.setRowWrapper, { borderRadius: radius.md }, wrapperAnimStyle]}>
      <TouchableOpacity
        style={[styles.setRowDeleteBg, { backgroundColor: colors.error }]}
        onPress={handleDeleteConfirm}
        activeOpacity={0.75}
      >
        <Trash2 size={16} color="#fff" />
      </TouchableOpacity>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.setRowContent,
            { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md },
            animStyle,
          ]}
        >
          <Text style={[styles.setRowLabel, { color: colors.textSecondary }]}>
            Set {set.set_number}
          </Text>
          <Text
            style={[styles.setRowValue, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {set.weight_kg > 0 ? `${set.weight_kg} kg × ${set.reps}` : `${set.reps} reps`}
          </Text>
          {prLevel !== null && (
            <View style={[styles.prBadge, { borderColor: prColor }]}>
              {prLevel === 'gold' || prLevel === 'silver' ? (
                <Zap size={10} color={prColor} />
              ) : (
                <Flame size={10} color={prColor} />
              )}
              <Text style={[styles.prBadgeText, { color: prColor }]}>
                {prLevel === 'gold' ? 'PR' : prLevel === 'silver' ? '2e' : '3e'}
              </Text>
            </View>
          )}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  )
}

// ─── ExerciseModal ────────────────────────────────────────────────────────────

interface ExerciseModalProps {
  visible: boolean
  onClose: () => void
  onSelect: (ex: ExerciseRow) => void
  addedIds: Set<string>
  colors: ReturnType<typeof useTheme>['colors']
}

function ExerciseModal({ visible, onClose, onSelect, addedIds, colors }: ExerciseModalProps) {
  const slideValue = useSharedValue(Dimensions.get('window').height)
  const backdropOpacity = useSharedValue(0)
  const [mounted, setMounted] = useState(visible)
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const insets = useSafeAreaInsets()

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideValue.value }],
  }))
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }))

  useEffect(() => {
    if (visible) {
      setMounted(true)
      slideValue.value = withTiming(0, { duration: 320, easing: Easing.bezier(0.16, 1, 0.3, 1) })
      backdropOpacity.value = withTiming(1, { duration: 200 })
      fetchExercises()
    } else {
      slideValue.value = withSpring(Dimensions.get('window').height, spring.snappy)
      backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) })
      const t = setTimeout(() => {
        setMounted(false)
        setSearch('')
        setFilter(null)
      }, 360)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  async function fetchExercises() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('exercises')
        .select('id, name_fr, muscle_group, equipment_type')
        .order('name_fr')
      if (data) setExercises(data as ExerciseRow[])
    } finally {
      setLoading(false)
    }
  }

  // Group filtered exercises by muscle section
  const filtered = useMemo(() => {
    let list = exercises
    if (filter) list = list.filter(e => e.muscle_group === filter)
    if (search.trim()) {
      const q = normalizeNFD(search.trim())
      list = list.filter(e => normalizeNFD(e.name_fr).includes(q))
    }
    return list
  }, [exercises, search, filter])

  // Build section list grouped by display label (multiple muscle_groups can share the same label)
  const sections = useMemo(() => {
    const map = new Map<string, ExerciseRow[]>()
    for (const ex of filtered) {
      const label = (MUSCLE_LABELS[ex.muscle_group ?? ''] ?? ex.muscle_group ?? 'autre').toUpperCase()
      if (!map.has(label)) map.set(label, [])
      map.get(label)!.push(ex)
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }))
  }, [filtered])

  // Flatten for FlatList with section headers
  type ListItem =
    | { type: 'header'; title: string }
    | { type: 'exercise'; item: ExerciseRow }

  const flatData: ListItem[] = useMemo(() => {
    const result: ListItem[] = []
    for (const section of sections) {
      result.push({ type: 'header', title: section.title })
      for (const ex of section.data) {
        result.push({ type: 'exercise', item: ex })
      }
    }
    return result
  }, [sections])

  if (!mounted) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[styles.modalOverlay, backdropStyle]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.modalSheet,
          { backgroundColor: colors.backgroundSecondary, paddingBottom: insets.bottom },
          slideStyle,
        ]}
      >
        {/* Handle */}
        <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />

        {/* Title */}
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
            Ajouter un exercice
          </Text>
        </View>

        {/* Search */}
        <View style={[styles.searchRow, { backgroundColor: colors.inputBackground }]}>
          <Search size={16} color={colors.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder="Rechercher..."
            placeholderTextColor={colors.textTertiary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <X size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Chips — wrap layout */}
        <View style={styles.chipsWrap}>
          {CHIP_GROUPS.map(({ key, label }) => {
            const active = filter === key
            return (
              <TouchableOpacity
                key={label}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? colors.accent : colors.backgroundTertiary,
                  },
                ]}
                onPress={() => setFilter(key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: active ? colors.background : colors.textSecondary },
                  ]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Exercise list */}
        <FlatList
          data={flatData}
          keyExtractor={(item, idx) =>
            item.type === 'header' ? `h-${item.title}` : `e-${item.item.id}-${idx}`
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.s12 }}
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <Text
                  style={[
                    styles.sectionHeader,
                    { color: colors.textTertiary },
                  ]}
                >
                  {item.title}
                </Text>
              )
            }
            const ex = item.item
            const isAdded = addedIds.has(ex.id)
            const sub = [ex.equipment_type, MUSCLE_LABELS[ex.muscle_group ?? ''] ?? ex.muscle_group]
              .filter(Boolean)
              .join(' · ')
            return (
              <TouchableOpacity
                style={[styles.exerciseRow, { borderBottomColor: colors.separator }]}
                onPress={() => {
                  onSelect(ex)
                  Keyboard.dismiss()
                }}
                activeOpacity={0.7}
              >
                <View style={styles.exerciseRowInfo}>
                  <Text style={[styles.exerciseName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {ex.name_fr}
                  </Text>
                  {sub ? (
                    <Text style={[styles.exerciseSub, { color: colors.textSecondary }]}>
                      {sub}
                    </Text>
                  ) : null}
                </View>
                {isAdded ? (
                  <Check size={18} color={colors.accent} />
                ) : (
                  <Plus size={18} color={colors.textTertiary} />
                )}
              </TouchableOpacity>
            )
          }}
          ListEmptyComponent={
            <Text style={[styles.emptyText, { color: colors.textTertiary }]}>
              {loading ? 'Chargement…' : 'Aucun exercice'}
            </Text>
          }
        />
      </Animated.View>
    </View>
  )
}

// ─── PR Flash Overlay ─────────────────────────────────────────────────────────

interface PrFlashOverlayProps {
  events: PrEvent[] | null
  onDismiss: () => void
}

// Max number of simultaneous PR cards (charge + serie + exercice + seance)
const MAX_PR_CARDS = 4
const REVEAL_STAGGER_MS = 80
const AUTO_DISMISS_MS = 2500
const FADE_OUT_MS = 260

// Map PR type → lucide icon component (kept as ref, not JSX, to allow reuse)
const PR_TYPE_ICON: Record<PrType, typeof Zap> = {
  charge:   Zap,
  serie:    Flame,
  exercice: Dumbbell,
  seance:   Trophy,
}

function PrFlashOverlay({ events, onDismiss }: PrFlashOverlayProps) {
  const { colors } = useTheme()
  const backdropOpacity = useSharedValue(0)
  const prevKey = useRef<string | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pre-allocate sharedValues for up to MAX_PR_CARDS — hooks order stable
  const op0 = useSharedValue(0); const ty0 = useSharedValue(20); const sc0 = useSharedValue(0.9)
  const op1 = useSharedValue(0); const ty1 = useSharedValue(20); const sc1 = useSharedValue(0.9)
  const op2 = useSharedValue(0); const ty2 = useSharedValue(20); const sc2 = useSharedValue(0.9)
  const op3 = useSharedValue(0); const ty3 = useSharedValue(20); const sc3 = useSharedValue(0.9)

  const cardOps = [op0, op1, op2, op3]
  const cardTys = [ty0, ty1, ty2, ty3]
  const cardScs = [sc0, sc1, sc2, sc3]

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }))
  const card0Style = useAnimatedStyle(() => ({
    opacity: op0.value,
    transform: [{ translateY: ty0.value }, { scale: sc0.value }],
  }))
  const card1Style = useAnimatedStyle(() => ({
    opacity: op1.value,
    transform: [{ translateY: ty1.value }, { scale: sc1.value }],
  }))
  const card2Style = useAnimatedStyle(() => ({
    opacity: op2.value,
    transform: [{ translateY: ty2.value }, { scale: sc2.value }],
  }))
  const card3Style = useAnimatedStyle(() => ({
    opacity: op3.value,
    transform: [{ translateY: ty3.value }, { scale: sc3.value }],
  }))
  const cardStyles = [card0Style, card1Style, card2Style, card3Style]

  // Unique key per events batch to retrigger animations
  const eventsKey = events && events.length > 0
    ? events.map(e => `${e.type}:${e.level}:${e.value}`).join('|')
    : null

  function clearTimers() {
    if (dismissTimerRef.current) { clearTimeout(dismissTimerRef.current); dismissTimerRef.current = null }
    if (fadeTimerRef.current) { clearTimeout(fadeTimerRef.current); fadeTimerRef.current = null }
  }

  function dismiss() {
    clearTimers()
    backdropOpacity.value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.quad) })
    for (let i = 0; i < MAX_PR_CARDS; i++) {
      cardOps[i].value = withTiming(0, { duration: FADE_OUT_MS, easing: Easing.out(Easing.quad) })
    }
    // setTimeout JS side — no runOnJS needed (we're already on JS thread)
    fadeTimerRef.current = setTimeout(onDismiss, FADE_OUT_MS + 20)
  }

  useEffect(() => {
    if (events && events.length > 0 && eventsKey !== prevKey.current) {
      prevKey.current = eventsKey
      clearTimers()

      // Reset all card values
      for (let i = 0; i < MAX_PR_CARDS; i++) {
        cardOps[i].value = 0
        cardTys[i].value = 20
        cardScs[i].value = 0.9
      }

      // Backdrop fade in
      backdropOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) })

      // Choreography: stagger each card 80ms
      const limit = Math.min(events.length, MAX_PR_CARDS)
      for (let i = 0; i < limit; i++) {
        const delay = i * REVEAL_STAGGER_MS
        setTimeout(() => {
          cardOps[i].value = withSpring(1, spring.bouncy)
          cardTys[i].value = withSpring(0, spring.bouncy)
          cardScs[i].value = withSpring(1, spring.bouncy)
        }, delay)
      }

      // Auto-dismiss
      dismissTimerRef.current = setTimeout(dismiss, AUTO_DISMISS_MS)
      return clearTimers
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey])

  if (!events || events.length === 0) return null

  // Take backdrop style from first event's level (visually identical across levels — backdrop is BACKDROP token)
  const baseRecipe = prOverlayRecipe(events[0].level, colors)

  return (
    <Animated.View
      style={[baseRecipe.backdrop, backdropStyle, { zIndex: 200 }]}
      pointerEvents="auto"
      onTouchEnd={dismiss}
    >
      <View style={baseRecipe.cardStack} pointerEvents="box-none">
        {events.slice(0, MAX_PR_CARDS).map((ev, i) => {
          const styles_i = prOverlayRecipe(ev.level, colors)
          const badge = prBadgeRecipe(ev.level, ev.type, colors)
          const Icon = PR_TYPE_ICON[ev.type]
          return (
            <Animated.View key={`${ev.type}-${i}`} style={[styles_i.card, cardStyles[i]]}>
              <View style={styles_i.cardAccent} />
              <Icon size={24} color={badge.iconColor} />
              <Text style={styles_i.cardTitle}>{ev.title}</Text>
              <Text style={styles_i.cardValue}>{ev.value}</Text>
              <Text style={styles_i.cardSubtitle}>{ev.subtitle}</Text>
            </Animated.View>
          )
        })}
      </View>
    </Animated.View>
  )
}

// ─── PR event builder (pure, from validateSet results) ───────────────────────

function formatKg(n: number): string {
  // Thin space thousand separator, no trailing zeros after decimal
  const rounded = Math.round(n * 10) / 10
  const fixed = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)
  return fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function levelSubtitle(level: PrLevelStrict, kind: 'charge' | 'serie' | 'exercice'): string {
  const ordinal =
    level === 'gold'   ? 'Nouveau sommet' :
    level === 'silver' ? '2e meilleure' :
                         '3e meilleure'
  if (level === 'gold') return ordinal
  const suffix = kind === 'charge' ? 'charge' : kind === 'serie' ? 'série' : 'performance'
  return `${ordinal} ${suffix}`
}

function buildPrEvents(
  prCharge: PrLevel,
  prSerie: PrLevel,
  weight: number,
  reps: number,
): PrEvent[] {
  const out: PrEvent[] = []
  if (prCharge !== null) {
    out.push({
      type: 'charge',
      level: prCharge,
      title: 'RECORD CHARGE',
      value: `${formatKg(weight)} kg`,
      subtitle: levelSubtitle(prCharge, 'charge'),
    })
  }
  if (prSerie !== null) {
    out.push({
      type: 'serie',
      level: prSerie,
      title: 'RECORD SÉRIE',
      value: `${formatKg(weight)} kg × ${reps}`,
      subtitle: levelSubtitle(prSerie, 'serie'),
    })
  }
  return out
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SessionScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const {
    status,
    startedAt,
    exercises,
    currentIndex,
    elapsedSeconds,
    startWorkout,
    finishWorkout,
    resetWorkout,
    addExercise,
    removeExercise,
    setCurrentIndex,
    updateDraftSet,
    validateSet,
    removeSet,
  } = useWorkout()

  const [modalVisible, setModalVisible] = useState(false)
  const [prFlash, setPrFlash] = useState<PrEvent[] | null>(null)
  const [wheelPickerVisible, setWheelPickerVisible] = useState(false)
  const tabsScrollRef = useRef<ScrollView>(null)

  // ── Ghost state ──
  const [ghostRef, setGhostRef] = useState<GhostSet | null>(null)
  const [ghostEnabled, setGhostEnabled] = useState(true)
  const [vibrationEnabled, setVibrationEnabled] = useState(true)
  const prevGhostBeatenRef = useRef(false)

  // ── Load ghost settings once ──
  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem('settings_ghost'),
      AsyncStorage.getItem('settings_vibration'),
    ]).then(([ghost, vibration]) => {
      setGhostEnabled(ghost !== 'false')
      setVibrationEnabled(vibration !== 'false')
    })
  }, [])

  // ── Load ghost reference when exercise changes ──
  const currentExerciseId = exercises[currentIndex]?.exercise_id
  useEffect(() => {
    if (!ghostEnabled || !currentExerciseId) {
      setGhostRef(null)
      return
    }
    void getGhostReference(currentExerciseId, 30).then(setGhostRef)
  }, [currentExerciseId, ghostEnabled])

  // ── Status done redirect ──
  useEffect(() => {
    if (status === 'done') {
      router.replace('/workout/summary')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // ── Snapshot after exercises change ──
  useEffect(() => {
    if (status === 'active') {
      snapshotToMMKV(exercises, currentIndex, startedAt)
    }
  }, [exercises, currentIndex, startedAt, status])

  // ── Scroll tabs to current ──
  useEffect(() => {
    if (tabsScrollRef.current && exercises.length > 0) {
      tabsScrollRef.current.scrollTo({ x: currentIndex * 120, animated: true })
    }
  }, [currentIndex, exercises.length])

  // ── Idle back animation ──
  const idleTranslateX = useSharedValue(0)
  const idleSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: idleTranslateX.value }],
  }))

  function handleIdleBack() {
    const W = Dimensions.get('window').width
    idleTranslateX.value = withTiming(
      W,
      { duration: 280, easing: Easing.bezier(0.16, 1, 0.3, 1) },
      (finished) => { if (finished) runOnJS(router.replace)('/(tabs)/feed') },
    )
  }

  const currentExercise: WorkoutExercise | undefined = exercises[currentIndex]
  const draftSet: WorkoutSet | undefined = currentExercise?.sets.find(s => !s.validated)
  const validatedSets: WorkoutSet[] = currentExercise?.sets.filter(s => s.validated) ?? []

  const weightValues = useMemo(
    () => getWeightValues(currentExercise?.equipment_type ?? null),
    [currentExercise?.equipment_type],
  )

  const draftWeight = draftSet?.weight_kg ?? (weightValues[0] ?? 0)
  const draftReps = draftSet?.reps ?? 1

  // Set number being prepared
  const nextSetNumber = validatedSets.length + 1


  // Ghost beaten: current draft weight beats ghost reference
  const ghostBeaten = ghostEnabled && ghostRef !== null && draftWeight > ghostRef.weight_kg

  // Added exercise IDs for checkmarks in modal
  const addedIds = useMemo(() => new Set(exercises.map(e => e.exercise_id)), [exercises])

  // ── Haptic: ghost beaten (double pulse sur transition false→true) ──
  useEffect(() => {
    if (ghostBeaten && !prevGhostBeatenRef.current && vibrationEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).then(() => {
        setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 120)
      })
    }
    prevGhostBeatenRef.current = ghostBeaten
  }, [ghostBeaten, vibrationEnabled])

  // ── Haptic: PR flash (800ms après le visuel) ──
  useEffect(() => {
    if (!prFlash || prFlash.length === 0 || !vibrationEnabled) return
    const bestLevel = prFlash.reduce<PrLevelStrict | null>((acc, ev) => {
      const rank = (l: PrLevelStrict | null) => l === 'gold' ? 3 : l === 'silver' ? 2 : l === 'bronze' ? 1 : 0
      return rank(ev.level) > rank(acc) ? ev.level : acc
    }, null)
    const t = setTimeout(() => {
      if (bestLevel === 'gold') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      } else {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      }
    }, 800)
    return () => clearTimeout(t)
  }, [prFlash, vibrationEnabled])

  function handleWeightChange(val: number) {
    if (currentExercise) {
      updateDraftSet(currentIndex, 'weight_kg', val)
      snapshotToMMKV(exercises, currentIndex, startedAt)
    }
  }

  function handleRepsChange(val: number) {
    if (currentExercise) {
      updateDraftSet(currentIndex, 'reps', val)
      snapshotToMMKV(exercises, currentIndex, startedAt)
    }
  }

  function handleValidate() {
    if (!currentExercise) return
    if (vibrationEnabled) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }
    const { prCharge, prSerie } = validateSet(currentIndex)
    snapshotToMMKV(exercises, currentIndex, startedAt)

    const events = buildPrEvents(prCharge, prSerie, draftWeight, draftReps)
    if (events.length > 0) {
      setPrFlash(events)
      setTimeout(() => router.push('/workout/timer'), 1500)
    } else {
      router.push('/workout/timer')
    }
  }

  async function handleAddExercise(ex: ExerciseRow) {
    setModalVisible(false)
    const newIdx = exercises.length
    await addExercise(ex.id, ex.name_fr, ex.muscle_group, ex.equipment_type)
    const lastSet = await getLastLocalSet(ex.id)
    if (lastSet) {
      updateDraftSet(newIdx, 'weight_kg', lastSet.weight_kg)
      updateDraftSet(newIdx, 'reps', lastSet.reps)
    }
    snapshotToMMKV(exercises, currentIndex, startedAt)
  }

  function handleRemoveExercise(index: number) {
    removeExercise(index)
    snapshotToMMKV(exercises, currentIndex, startedAt)
  }

  function handleRemoveSet(setIndex: number) {
    removeSet(currentIndex, setIndex)
    snapshotToMMKV(exercises, currentIndex, startedAt)
  }

  // ── IDLE screen ──
  if (status === 'idle') {
    return (
      <Animated.View style={[styles.flex, { backgroundColor: colors.background }, idleSlideStyle]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        <TouchableOpacity
          style={[styles.idleBackBtn, { top: insets.top + spacing.s4 }]}
          onPress={handleIdleBack}
          activeOpacity={0.7}
        >
          <ChevronLeft size={24} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
        <View style={[styles.idleContainer, { paddingBottom: insets.bottom, paddingTop: insets.top }]}>
          <Text style={[styles.idleTitle, { color: colors.textPrimary }]}>Orava</Text>
          <Text style={[styles.idleSubtitle, { color: colors.textSecondary }]}>
            Prêt à sentraîner ?
          </Text>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.accent }]}
            onPress={startWorkout}
            activeOpacity={0.85}
          >
            <Text style={[styles.startButtonText, { color: colors.background }]}>DÉMARRER UNE SÉANCE</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    )
  }

  // ── ACTIVE screen ──
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Top safe area + header */}
      <View style={{ paddingTop: insets.top }}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          {exercises.length === 0 ? (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => { resetWorkout(); router.replace('/(tabs)/feed') }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft size={28} color={colors.textPrimary} />
            </TouchableOpacity>
          ) : (
            <LogoOrava />
          )}
          <View style={styles.headerCenter}>
            <Text
              style={{
                color: colors.textPrimary,
                fontFamily: 'Barlow_700Bold',
                fontSize: 32,
                letterSpacing: -0.5,
                fontVariant: ['tabular-nums'],
              }}
            >
              {(() => {
                const h = Math.floor(elapsedSeconds / 3600)
                const m = Math.floor((elapsedSeconds % 3600) / 60)
                const s = elapsedSeconds % 60
                return h > 0
                  ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
                  : `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
              })()}
            </Text>
          </View>
          {exercises.length > 0 && (
            <TouchableOpacity
              style={[styles.finishButton, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
              onPress={finishWorkout}
              activeOpacity={0.85}
            >
              <Text style={[styles.finishText, { color: colors.textPrimary }]}>TERMINER</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Exercise tabs */}
        <ScrollView
          ref={tabsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsContent}
          style={[styles.tabsRow, { borderBottomColor: colors.separator }]}
          keyboardShouldPersistTaps="handled"
        >
          {exercises.map((ex, idx) => (
            <TouchableOpacity
              key={ex.exercise_id + idx}
              style={[
                styles.tab,
                idx === currentIndex && {
                  borderBottomColor: colors.accent,
                  borderBottomWidth: 2,
                },
              ]}
              onPress={() => setCurrentIndex(idx)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: idx === currentIndex ? colors.textPrimary : colors.textSecondary },
                ]}
                numberOfLines={1}
              >
                {ex.name.length > 14 ? ex.name.slice(0, 14) + '…' : ex.name}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.tabAdd}
            onPress={() => setModalVisible(true)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Plus size={18} color={colors.accent} />
            <Text style={[styles.tabAddText, { color: colors.accent }]}>Exercice</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* No exercise yet */}
      {exercises.length === 0 ? (
        <View style={styles.emptyExerciseContainer}>
          <Text style={[styles.emptyExerciseText, { color: colors.textSecondary }]}>
            Ajoute un exercice pour commencer
          </Text>
          <TouchableOpacity
            style={[
              styles.addFirstButton,
              { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
            ]}
            onPress={() => setModalVisible(true)}
            activeOpacity={0.85}
          >
            <Plus size={20} color={colors.accent} />
            <Text style={[styles.addFirstText, { color: colors.textPrimary }]}>
              Ajouter un exercice
            </Text>
          </TouchableOpacity>
        </View>
      ) : currentExercise ? (
        <View style={styles.flex}>
          {/* Exercise name + set label */}
          <View style={styles.exerciseHeaderZen}>
            <Text style={[styles.exerciseTitleZen, { color: colors.textPrimary }]} numberOfLines={2}>
              {currentExercise.name}
            </Text>
            <View style={styles.setLabelRow}>
              <Text style={[styles.setLabel, { color: colors.textSecondary }]}>
                {`SET ${nextSetNumber}`}
              </Text>
              <TouchableOpacity
                onPress={() => handleRemoveExercise(currentIndex)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.removeExButton}
              >
                <Trash2 size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Validated sets (scrollable, above picker) */}
          {validatedSets.length > 0 && (
            <ScrollView
              style={styles.setsScrollArea}
              contentContainerStyle={styles.setsContainer}
              showsVerticalScrollIndicator={false}
            >
              {validatedSets.map((set, idx) => (
                <SetRow
                  key={`${set.set_number}-${idx}`}
                  set={set}
                  onDelete={() => handleRemoveSet(idx)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          )}

          {/* Weight & Reps display � opens modal */}
          <View style={styles.pickersArea}>
            <View style={styles.pickersRow}>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setWheelPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerButtonValue, { color: colors.textPrimary }]}>
                  {draftWeight > 0 ? draftWeight : '�'}
                </Text>
                <Text style={[styles.pickerButtonLabel, { color: colors.textSecondary }]}>KG</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setWheelPickerVisible(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.pickerButtonValue, { color: colors.textPrimary }]}>
                  {draftReps}
                </Text>
                <Text style={[styles.pickerButtonLabel, { color: colors.textSecondary }]}>REPS</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* LOG SET button — sticky at bottom */}
          <View style={[styles.logSetWrapper, { paddingBottom: Math.max(insets.bottom, spacing.s4) }]}>
            <TouchableOpacity
              style={[styles.logSetButton, { backgroundColor: colors.accent }]}
              onPress={handleValidate}
              activeOpacity={0.85}
            >
              <Text style={[styles.logSetText, { color: colors.background }]}>LOG SET</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* PR Flash overlay */}
      <PrFlashOverlay
        events={prFlash}
        onDismiss={() => setPrFlash(null)}
      />

      {/* Exercise modal */}
      <ExerciseModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSelect={handleAddExercise}
        addedIds={addedIds}
        colors={colors}
      />

      {/* Unified wheel picker modal (weight + reps + rpe) */}
      <WheelPickerModal
        isVisible={wheelPickerVisible}
        onClose={() => setWheelPickerVisible(false)}
        onValidate={(weight, reps) => {
          handleWeightChange(weight)
          handleRepsChange(reps)
          setWheelPickerVisible(false)
        }}
        currentWeight={draftWeight}
        currentReps={draftReps}
        equipmentType={currentExercise?.equipment_type ?? null}
        ghostValue={ghostRef && ghostEnabled ? ghostRef.weight_kg : undefined}
        ghostBeaten={ghostBeaten}
      />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // ── Idle ──
  idleBackBtn: {
    position: 'absolute',
    left: spacing.s4,
    zIndex: 1,
    width: touchTarget.comfort,
    height: touchTarget.comfort,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s6,
    gap: spacing.s4,
  },
  idleTitle: {
    ...typography.hero,
    marginBottom: spacing.s2,
  },
  idleSubtitle: {
    ...typography.subtitle,
    marginBottom: spacing.s8,
  },
  startButton: {
    height: touchTarget.hero,
    width: '100%',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    ...typography.subtitle,
    letterSpacing: 1,
  },

  // ── Header ──
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishButton: {
    height: 36,
    paddingHorizontal: spacing.s4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  finishText: {
    ...typography.caption,
    letterSpacing: 1,
  },

  // ── Tabs ──
  tabsRow: {
    height: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabsContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s2,
  },
  tab: {
    height: 44,
    paddingHorizontal: spacing.s3,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  tabText: {
    ...typography.caption,
    letterSpacing: 0.5,
  },
  tabAdd: {
    height: 44,
    paddingHorizontal: spacing.s3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  tabAddText: {
    ...typography.caption,
    letterSpacing: 0.5,
  },

  // ── Empty exercise state ──
  emptyExerciseContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s4,
    paddingHorizontal: spacing.s6,
  },
  emptyExerciseText: {
    ...typography.body,
    textAlign: 'center',
  },
  addFirstButton: {
    height: touchTarget.hero,
    paddingHorizontal: spacing.s6,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
    borderWidth: 1,
  },
  addFirstText: {
    ...typography.subtitle,
  },

  // ── Exercise zen header ──
  exerciseHeaderZen: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
    gap: spacing.s1,
  },
  exerciseTitleZen: {
    ...typography.title,
  },
  setLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  setLabel: {
    ...typography.caption,
    letterSpacing: 0.8,
  },
  removeExButton: {
    padding: spacing.s2,
  },

  // ── Validated sets area ──
  setsScrollArea: {
    maxHeight: 160,
    paddingHorizontal: spacing.s4,
  },
  setsContainer: {
    gap: spacing.s2,
    paddingVertical: spacing.s2,
  },
  setRowWrapper: {
    overflow: 'hidden',
  },
  setRowDeleteBg: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: radius.md,
    borderBottomRightRadius: radius.md,
  },
  setRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s3,
  },
  setRowLabel: {
    ...typography.caption,
    width: 40,
  },
  setRowValue: {
    ...typography.body,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  prBadgeText: {
    ...typography.caption,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  // ── Pickers area ──
  pickersArea: {
    flex: 1,
    justifyContent: 'center',
  },
  pickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.s4,
    gap: spacing.s4,
  },
  pickerButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s2,
  },
  pickerButtonValue: {
    ...typography.display,
    fontVariant: ['tabular-nums'],
  },
  pickerButtonLabel: {
    ...typography.caption,
    letterSpacing: 1.2,
  },

  // ── LOG SET button ──
  logSetWrapper: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  logSetButton: {
    height: touchTarget.hero,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logSetText: {
    fontSize: 18,
    fontFamily: 'Barlow_700Bold',
    letterSpacing: 1.5,
  },

  // ── Modal ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginTop: spacing.s3,
    marginBottom: spacing.s2,
  },
  modalHeader: {
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
  },
  modalTitle: {
    ...typography.title,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s3,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    height: 44,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
  },
  chip: {
    paddingHorizontal: spacing.s3,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    ...typography.caption,
    letterSpacing: 0.3,
  },
  sectionHeader: {
    ...typography.caption,
    letterSpacing: 1,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s4,
    paddingBottom: spacing.s2,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    minHeight: touchTarget.comfort,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.s3,
  },
  exerciseRowInfo: {
    flex: 1,
    gap: 2,
  },
  exerciseName: {
    ...typography.body,
    fontFamily: 'Barlow_700Bold',
  },
  exerciseSub: {
    ...typography.caption,
    letterSpacing: 0.2,
  },
  emptyText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.s8,
  },
})
