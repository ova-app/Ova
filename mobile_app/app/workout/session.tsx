import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  FlatList,
  Keyboard,
  Platform,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Dimensions,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Timer, Plus, Trash2, X, Search, Zap, Flame, Trophy, Check } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring } from '@/constants/theme'
import {
  useWorkout,
  computePodium,
  WorkoutExercise,
  WorkoutSet,
  PrLevel,
} from '@/context/WorkoutContext'
import { storage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseRow {
  id: string
  name_fr: string
  muscle_group: string | null
  equipment_type: string | null
}

interface PrFlashData {
  prCharge: PrLevel
  prSerie: PrLevel
  weight: number
  reps: number
  sessionVolume?: number
  sessionDelta?: number
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
}

function WheelPicker({ values, selectedValue, onValueChange, label, isEmpty }: WheelPickerProps) {
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
  const translateX = useRef(new Animated.Value(0)).current
  const THRESHOLD = 80

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dy) < 20,
        onPanResponderMove: (_, g) => {
          if (g.dx < 0) translateX.setValue(g.dx)
        },
        onPanResponderRelease: (_, g) => {
          if (g.dx < -THRESHOLD) {
            Animated.spring(translateX, {
              toValue: -300,
              useNativeDriver: true,
              ...spring.snappy,
            }).start(() => onDelete())
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              ...spring.snappy,
            }).start()
          }
        },
      }),
    [onDelete, translateX],
  )

  const prLevel = bestPrLevel(set.pr_charge, set.pr_serie)
  const prColor = prLevelColor(prLevel, colors)

  return (
    <View style={[styles.setRowWrapper, { borderRadius: radius.md }]}>
      <View style={[styles.setRowDeleteBg, { backgroundColor: colors.error, borderRadius: radius.md }]}>
        <Trash2 size={20} color="#fff" />
      </View>
      <Animated.View
        style={[
          styles.setRowContent,
          { backgroundColor: colors.backgroundSecondary, borderRadius: radius.md, transform: [{ translateX }] },
        ]}
        {...panResponder.panHandlers}
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
  const slideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const insets = useSafeAreaInsets()

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        ...spring.standard,
      }).start()
      fetchExercises()
    } else {
      Animated.spring(slideAnim, {
        toValue: Dimensions.get('window').height,
        useNativeDriver: true,
        ...spring.snappy,
      }).start()
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

  // Build section list: [{title, data}]
  const sections = useMemo(() => {
    const map = new Map<string, ExerciseRow[]>()
    for (const ex of filtered) {
      const group = ex.muscle_group ?? 'autre'
      if (!map.has(group)) map.set(group, [])
      map.get(group)!.push(ex)
    }
    return Array.from(map.entries()).map(([group, data]) => ({
      title: (MUSCLE_LABELS[group] ?? group).toUpperCase(),
      data,
    }))
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
          {
            backgroundColor: colors.backgroundSecondary,
            paddingBottom: insets.bottom,
            transform: [{ translateY: slideAnim }],
          },
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
  flash: PrFlashData | null
  onDismiss: () => void
  colors: ReturnType<typeof useTheme>['colors']
}

function PrFlashOverlay({ flash, onDismiss, colors }: PrFlashOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.85)).current
  const prevKey = useRef<string | null>(null)

  const flashKey = flash
    ? `${flash.prCharge}-${flash.prSerie}-${flash.weight}-${flash.reps}`
    : null

  useEffect(() => {
    if (flash && flashKey !== prevKey.current) {
      prevKey.current = flashKey
      opacity.setValue(0)
      scale.setValue(0.85)
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, useNativeDriver: true, ...spring.bouncy }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...spring.bouncy }),
      ]).start()

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
          Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, ...spring.snappy }),
        ]).start(() => onDismiss())
      }, 2200)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flashKey])

  if (!flash) return null

  const hasSeancePr = flash.sessionDelta !== undefined && flash.sessionDelta > 0
  const hasChargePr = flash.prCharge !== null
  const hasSeriePr = flash.prSerie !== null

  return (
    <Animated.View
      style={[styles.prOverlay, { opacity }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <Animated.View style={[styles.prCardsContainer, { transform: [{ scale }] }]}>
        {/* Card 1 — PR Séance (gold) */}
        {hasSeancePr && (
          <View
            style={[
              styles.prCard,
              styles.prCardLarge,
              { backgroundColor: 'rgba(250, 199, 117, 0.12)', borderColor: 'rgba(250, 199, 117, 0.25)' },
            ]}
          >
            <Trophy size={28} color={colors.prGold} />
            <Text style={[styles.prCardLabel, { color: colors.accent }]}>
              NOUVEAU PR SÉANCE
            </Text>
            <Text style={[styles.prCardValue, { color: colors.textPrimary }]}>
              {`+${flash.sessionDelta} kg vs meilleure séance`}
            </Text>
          </View>
        )}

        {/* Card 2 — PR Charge */}
        {hasChargePr && (
          <View
            style={[
              styles.prCard,
              styles.prCardLarge,
              {
                backgroundColor: colors.backgroundTertiary,
                borderColor: prLevelColor(flash.prCharge, colors) + '40',
              },
            ]}
          >
            <Zap size={28} color={prLevelColor(flash.prCharge, colors)} />
            <Text style={[styles.prCardLabel, { color: prLevelColor(flash.prCharge, colors) }]}>
              {`PR CHARGE · ${flash.prCharge === 'gold' ? 'OR' : flash.prCharge === 'silver' ? 'ARGENT' : 'BRONZE'}`}
            </Text>
            <Text style={[styles.prCardValue, { color: colors.textPrimary }]}>
              {`${flash.weight} kg · ${flash.prCharge === 'gold' ? 'Nouvelle meilleure charge' : flash.prCharge === 'silver' ? '2e meilleure charge' : '3e meilleure charge'}`}
            </Text>
          </View>
        )}

        {/* Card 3 — PR Série (compact horizontal) */}
        {hasSeriePr && (
          <View
            style={[
              styles.prCard,
              styles.prCardCompact,
              {
                backgroundColor: colors.backgroundTertiary,
                borderColor: prLevelColor(flash.prSerie, colors) + '30',
              },
            ]}
          >
            <Flame size={20} color={prLevelColor(flash.prSerie, colors)} />
            <Text style={[styles.prCardLabelInline, { color: colors.textSecondary }]}>
              PR SÉRIE
            </Text>
            <Text style={[styles.prCardValueInline, { color: colors.textPrimary }]}>
              {`${flash.weight * flash.reps} pts`}
            </Text>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  )
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
  const [prFlash, setPrFlash] = useState<PrFlashData | null>(null)
  const tabsScrollRef = useRef<ScrollView>(null)

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

  // Added exercise IDs for checkmarks in modal
  const addedIds = useMemo(() => new Set(exercises.map(e => e.exercise_id)), [exercises])

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
    const { prCharge, prSerie } = validateSet(currentIndex)
    snapshotToMMKV(exercises, currentIndex, startedAt)

    if (prCharge !== null || prSerie !== null) {
      setPrFlash({
        prCharge,
        prSerie,
        weight: draftWeight,
        reps: draftReps,
      })
    }
  }

  async function handleAddExercise(ex: ExerciseRow) {
    setModalVisible(false)
    await addExercise(ex.id, ex.name_fr, ex.muscle_group, ex.equipment_type)
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
            Prêt à s'entraîner ?
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

          {/* Prev best */}
          <View style={styles.prevBestRow}>
            <View style={[styles.prevBestLine, { backgroundColor: colors.textTertiary }]} />
            <Text style={[styles.prevBestText, { color: colors.textTertiary }]}>
              {prevBest
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
        flash={prFlash}
        onDismiss={() => setPrFlash(null)}
        colors={colors}
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

  // ── PR Flash overlay ──
  prOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  },
  prCardsContainer: {
    width: '82%',
    gap: spacing.s3,
  },
  prCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s4,
  },
  prCardLarge: {
    alignItems: 'center',
    gap: spacing.s2,
  },
  prCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
  },
  prCardLabel: {
    ...typography.caption,
    letterSpacing: 1,
  },
  prCardValue: {
    ...typography.subtitle,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  prCardLabelInline: {
    ...typography.caption,
    letterSpacing: 1,
    flex: 1,
  },
  prCardValueInline: {
    ...typography.body,
    fontVariant: ['tabular-nums'],
    fontFamily: 'Barlow_700Bold',
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
