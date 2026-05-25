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
import { Timer, Plus, Trash2, X, Search, Zap, Flame, Trophy, Dumbbell, Check } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring } from '@/constants/theme'
import {
  useWorkout,
  computePodium,
  WorkoutExercise,
  WorkoutSet,
  PrLevel,
} from '@/context/WorkoutContext'
import { prOverlayRecipe, prBadgeRecipe, type PrLevel as PrLevelStrict, type PrType } from '@/constants/recipes'
import { storage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'
import { getGhostReference, type GhostSet } from '@/lib/ghost'
import { getLastLocalSet } from '@/lib/db'

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

const ITEM_HEIGHT = 72
const VISIBLE_ITEMS = 5
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS

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

function formatElapsed(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
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

// ─── WheelPicker ─────────────────────────────────────────────────────────────

interface WheelPickerProps {
  values: number[]
  selectedValue: number
  onValueChange: (val: number) => void
  label: string
  isEmpty?: boolean
  ghostValue?: number
  ghostBeaten?: boolean
}

function WheelPicker({ values, selectedValue, onValueChange, label, isEmpty, ghostValue, ghostBeaten }: WheelPickerProps) {
  const { colors } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const selectedIndex = values.indexOf(selectedValue)
  const currentIndex = selectedIndex === -1 ? 0 : selectedIndex
  const isScrolling = useRef(false)

  useEffect(() => {
    if (scrollRef.current && values.length > 0) {
      const y = currentIndex * ITEM_HEIGHT
      scrollRef.current.scrollTo({ y, animated: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll programmatically when selectedValue changes externally (exercise switch)
  useEffect(() => {
    if (!isScrolling.current && scrollRef.current && values.length > 0) {
      const y = currentIndex * ITEM_HEIGHT
      scrollRef.current.scrollTo({ y, animated: true })
    }
  }, [selectedValue, currentIndex, values])

  const snapOffsets = useMemo(
    () => values.map((_, i) => i * ITEM_HEIGHT),
    [values],
  )

  function handleMomentumScrollEnd(e: { nativeEvent: { contentOffset: { y: number } } }) {
    isScrolling.current = false
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(idx, values.length - 1))
    onValueChange(values[clamped])
  }

  function handleScrollEndDrag(e: { nativeEvent: { contentOffset: { y: number } } }) {
    isScrolling.current = false
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(idx, values.length - 1))
    onValueChange(values[clamped])
  }

  function handleScrollBeginDrag() {
    isScrolling.current = true
  }

  if (isEmpty || values.length === 0) {
    return (
      <View style={styles.pickerOuter}>
        <View style={[styles.pickerContainer, { height: PICKER_HEIGHT }]}>
          <View style={[styles.pickerCenterHighlight, { backgroundColor: colors.backgroundSecondary }]} />
          <View style={styles.pickerCenterItemAbs}>
            <Text style={[styles.pickerItemSelected, { color: colors.textSecondary }]}>—</Text>
          </View>
        </View>
        <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
    )
  }

  return (
    <View style={styles.pickerOuter}>
      <View style={[styles.pickerContainer, { height: PICKER_HEIGHT }]}>
        {/* Center highlight box */}
        <View
          style={[
            styles.pickerCenterHighlight,
            { backgroundColor: colors.backgroundSecondary },
          ]}
          pointerEvents="none"
        />
        {/* Ghost bar — position relative to selected item */}
        {ghostValue !== undefined && (() => {
          const gIdx = values.indexOf(ghostValue)
          if (gIdx === -1) return null
          const ghostTop = ITEM_HEIGHT * 2 + (gIdx - currentIndex) * ITEM_HEIGHT
          return (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: ghostTop,
                left: spacing.s2,
                right: spacing.s2,
                height: 2,
                borderRadius: 1,
                backgroundColor: ghostBeaten ? colors.prGold : colors.textTertiary,
                opacity: ghostBeaten ? 0.8 : 0.35,
                zIndex: 3,
              }}
            />
          )
        })()}
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToOffsets={snapOffsets}
          decelerationRate="fast"
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          onScrollEndDrag={handleScrollEndDrag}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
          scrollEventThrottle={16}
        >
          {values.map((val, idx) => {
            const dist = Math.abs(idx - currentIndex)
            const isSelected = dist === 0
            const fontSize = isSelected ? 40 : dist === 1 ? 28 : 18
            const opacity = isSelected ? 1 : dist === 1 ? 0.4 : 0.15
            const fontFamily = isSelected ? 'Barlow_800ExtraBold' : 'Barlow_400Regular'
            return (
              <View key={val} style={[styles.pickerItem, { height: ITEM_HEIGHT }]}>
                <Text
                  style={{
                    fontSize,
                    fontFamily,
                    color: colors.textPrimary,
                    opacity,
                    fontVariant: ['tabular-nums'],
                    letterSpacing: isSelected ? -1.0 : 0,
                    lineHeight: ITEM_HEIGHT,
                  }}
                >
                  {val}
                </Text>
              </View>
            )
          })}
        </ScrollView>
      </View>
      <Text style={[styles.pickerLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
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
  const THRESHOLD = 80

  const panGesture = Gesture.Pan()
    .activeOffsetX([-6, 6])
    .failOffsetY([-20, 20])
    .onUpdate((e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      if (e.translationX < 0) {
        translateX.value = e.translationX
      }
    })
    .onEnd((e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
      if (e.translationX < -THRESHOLD) {
        translateX.value = withSpring(-300, spring.snappy, (finished) => {
          'worklet'
          if (finished) runOnJS(onDelete)()
        })
      } else {
        translateX.value = withSpring(0, spring.snappy)
      }
    })

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }))

  const prLevel = bestPrLevel(set.pr_charge, set.pr_serie)
  const prColor = prLevelColor(prLevel, colors)

  return (
    <View style={[styles.setRowWrapper, { borderRadius: radius.md }]}>
      <View style={[styles.setRowDeleteBg, { backgroundColor: colors.error, borderRadius: radius.md }]}>
        <Trash2 size={20} color="#fff" />
      </View>
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
    </View>
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
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const insets = useSafeAreaInsets()

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slideValue.value }],
  }))

  useEffect(() => {
    if (visible) {
      slideValue.value = withSpring(0, spring.standard)
      fetchExercises()
    } else {
      slideValue.value = withSpring(Dimensions.get('window').height, spring.snappy)
      setSearch('')
      setFilter(null)
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

  if (!visible) return null

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <TouchableOpacity
        style={[styles.modalOverlay]}
        activeOpacity={1}
        onPress={onClose}
      />
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
    addExercise,
    removeExercise,
    setCurrentIndex,
    updateDraftSet,
    validateSet,
    removeSet,
  } = useWorkout()

  const [modalVisible, setModalVisible] = useState(false)
  const [prFlash, setPrFlash] = useState<PrEvent[] | null>(null)
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

  // Prev best: best validated set of current exercise
  const prevBest = useMemo(() => {
    if (validatedSets.length === 0) return null
    let best: WorkoutSet | null = null
    for (const s of validatedSets) {
      if (!best || s.weight_kg * s.reps > best.weight_kg * best.reps) best = s
    }
    return best
  }, [validatedSets])

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
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
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
      </View>
    )
  }

  // ── ACTIVE screen ──
  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Top safe area + header */}
      <View style={{ paddingTop: insets.top }}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <TouchableOpacity
            style={styles.timerButton}
            onPress={() => router.push('/workout/timer')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Timer size={16} color={colors.accent} />
            <Text style={[styles.timerText, { color: colors.accent }]}>
              {formatElapsed(elapsedSeconds)}
            </Text>
          </TouchableOpacity>
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

          {/* WheelPicker — fills remaining space */}
          <View style={styles.pickersArea}>
            <View style={styles.pickersRow}>
              {weightValues.length > 0 ? (
                <WheelPicker
                  values={weightValues}
                  selectedValue={draftWeight}
                  onValueChange={handleWeightChange}
                  label="KG"
                  ghostValue={ghostRef && ghostEnabled ? ghostRef.weight_kg : undefined}
                  ghostBeaten={ghostBeaten}
                />
              ) : (
                <WheelPicker
                  values={[]}
                  selectedValue={0}
                  onValueChange={() => {}}
                  label="KG"
                  isEmpty
                />
              )}
              <WheelPicker
                values={REPS_VALUES}
                selectedValue={draftReps}
                onValueChange={handleRepsChange}
                label="REPS"
              />
            </View>
          </View>

          {/* Ghost / Prev best indicator */}
          <View style={styles.prevBestRow}>
            <View style={[styles.prevBestLine, {
              backgroundColor: ghostBeaten ? colors.prGold : colors.textTertiary,
              opacity: ghostBeaten ? 1 : 0.5,
            }]} />
            <Text style={[styles.prevBestText, {
              color: ghostBeaten ? colors.prGold : colors.textTertiary,
            }]}>
              {ghostRef && ghostEnabled
                ? ghostBeaten
                  ? `FANTÔME BATTU · +${formatKg(draftWeight - ghostRef.weight_kg)} KG`
                  : `FANTÔME · ${ghostRef.weight_kg} KG × ${ghostRef.reps}`
                : prevBest
                  ? `PREV BEST · ${prevBest.weight_kg}KG × ${prevBest.reps}`
                  : 'PREV BEST · —'}
            </Text>
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
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // ── Idle ──
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
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    height: touchTarget.min,
    paddingHorizontal: spacing.s2,
  },
  timerText: {
    ...typography.mono,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
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
    height: touchTarget.comfort,
    overflow: 'hidden',
  },
  setRowDeleteBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: spacing.s4,
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
    gap: 0,
  },
  pickerOuter: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.s2,
  },
  pickerContainer: {
    width: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  pickerCenterHighlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: spacing.s2,
    right: spacing.s2,
    height: ITEM_HEIGHT,
    borderRadius: radius.md,
    zIndex: 1,
    pointerEvents: 'none',
  },
  pickerItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCenterItemAbs: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerItemSelected: {
    fontSize: 40,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Barlow_800ExtraBold',
    letterSpacing: -1.0,
    lineHeight: 44,
  },
  pickerLabel: {
    ...typography.caption,
    letterSpacing: 1.2,
  },

  // ── Prev best ──
  prevBestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s3,
  },
  prevBestLine: {
    width: 16,
    height: 1,
    opacity: 0.5,
  },
  prevBestText: {
    ...typography.caption,
    letterSpacing: 0.5,
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
