import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Image,
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
import {
  Gesture,
  GestureDetector,
  type PanGestureHandlerEventPayload,
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
} from 'react-native-gesture-handler'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Haptics from 'expo-haptics'
import {
  Plus,
  Trash2,
  X,
  Search,
  Zap,
  Flame,
  Trophy,
  Dumbbell,
  Check,
  ChevronLeft,
} from 'lucide-react-native'
import Svg, { Path as SvgPath } from 'react-native-svg'
import {
  Canvas,
  Path,
  Skia,
  LinearGradient as SkiaLinearGradient,
  vec,
} from '@shopify/react-native-skia'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring, font } from '@/constants/theme'
import { useWorkout, WorkoutExercise, WorkoutSet, PrLevel } from '@/context/WorkoutContext'
import {
  prOverlayRecipe,
  prBadgeRecipe,
  type PrLevel as PrLevelStrict,
  type PrType,
} from '@/constants/recipes'
import { storage } from '@/lib/storage'
import { getGhostReference, type GhostSet } from '@/lib/ghost'
import { ghostLimitDays } from '@/lib/plan'
import { useExerciseLibrary, MUSCLE_LABELS, type ExerciseRow } from '@/lib/hooks/useExerciseLibrary'
import { getLastLocalSet } from '@/lib/db'
import { REPS_VALUES, getWeightValues } from '@/lib/weights'
import WheelPickerModal from './wheel-picker-modal'
import oravaLogo from '@/assets/orava_logo.png'

const { width: SCREEN_W } = Dimensions.get('window')

// ─── GhostCompareBar ─────────────────────────────────────────────────────────

function GhostCompareBar({
  ghostWeight,
  currentWeight,
  ghostBeaten,
}: {
  ghostWeight: number
  currentWeight: number
  ghostBeaten: boolean
}) {
  const W = SCREEN_W - spacing.s4 * 2
  const H = 4
  const maxW = Math.max(ghostWeight, currentWeight, 1)
  const ghostPx = Math.min((ghostWeight / maxW) * W, W)
  const currPx = Math.min((currentWeight / maxW) * W, W)

  const barProg = useSharedValue(0)
  useEffect(() => {
    barProg.value = 0
    barProg.value = withSpring(1, { damping: 18, stiffness: 200 })
  }, [currentWeight])

  const currStyle = useAnimatedStyle(() => ({
    width: Math.max(barProg.value * currPx, H),
  }))

  const trackPath = useMemo(() => {
    const p = Skia.Path.Make()
    p.moveTo(0, 0)
    p.lineTo(W, 0)
    p.lineTo(W, H)
    p.lineTo(0, H)
    p.close()
    return p
  }, [W])

  const delta = Math.round((currentWeight - ghostWeight) * 10) / 10
  const beaten = ghostBeaten

  return (
    <View
      style={{ paddingHorizontal: spacing.s4, paddingTop: spacing.s1, paddingBottom: spacing.s2 }}
    >
      {/* Barre */}
      <View
        style={{
          height: H,
          borderRadius: H / 2,
          overflow: 'hidden',
          backgroundColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {/* Marqueur fantôme */}
        <View
          style={{
            position: 'absolute',
            left: ghostPx - 1,
            top: -1,
            width: 2,
            height: H + 2,
            backgroundColor: 'rgba(255,255,255,0.30)',
            borderRadius: 1,
          }}
        />
        {/* Barre courante */}
        <Animated.View style={[{ height: H, borderRadius: H / 2, overflow: 'hidden' }, currStyle]}>
          <Canvas style={{ width: W, height: H }}>
            <Path path={trackPath} style="fill">
              <SkiaLinearGradient
                start={vec(0, 0)}
                end={vec(W, 0)}
                colors={
                  beaten
                    ? ['rgba(0,230,115,0.45)', '#00E673']
                    : delta < 0
                      ? ['rgba(255,59,48,0.35)', 'rgba(255,59,48,0.70)']
                      : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.50)']
                }
              />
            </Path>
          </Canvas>
        </Animated.View>
      </View>
      {/* Label delta */}
      <Text
        style={{
          color: beaten ? '#00E673' : delta < 0 ? 'rgba(255,59,48,0.80)' : 'rgba(255,255,255,0.32)',
          fontSize: 11,
          fontFamily: font.medium,
          marginTop: spacing.s1,
          letterSpacing: 0.3,
          fontVariant: ['tabular-nums'],
        }}
      >
        {delta > 0
          ? `↑ +${delta} kg vs fantôme`
          : delta < 0
            ? `↓ ${Math.abs(delta)} kg vs fantôme`
            : `= fantôme · ${ghostWeight} kg`}
      </Text>
    </View>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrEvent {
  type: PrType
  level: PrLevelStrict
  title: string // "RECORD CHARGE" etc.
  value: string // "120 kg" / "1 240 kg" / "120 × 8"
  subtitle: string // "+5 kg vs ancien record" or "Nouveau sommet"
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHIP_GROUPS = [
  { key: null, label: 'Tous' },
  { key: 'pectoraux', label: 'Pectoraux' },
  { key: 'dos', label: 'Dos' },
  { key: 'epaules', label: 'Épaules' },
  { key: 'biceps', label: 'Bras' },
  { key: 'quadriceps', label: 'Jambes' },
]

function snapshotToMMKV(
  exercises: WorkoutExercise[],
  currentIndex: number,
  startedAt: Date | null
): void {
  storage.set(
    'workout_session_draft',
    JSON.stringify({ exercises, currentIndex, startedAt: startedAt?.toISOString() ?? null })
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

// ─── LogoOrava ───────────────────────────────────────────────────────────────

function LogoOrava() {
  return <Image source={oravaLogo} style={{ width: 48, height: 48 }} resizeMode="contain" />
}

// ─── SetRow (swipe delete) ────────────────────────────────────────────────────

interface SetRowProps {
  set: WorkoutSet
  onDelete: () => void
  colors: ReturnType<typeof useTheme>['colors']
  ghostVolume?: number
}

function SetRow({ set, onDelete, colors, ghostVolume }: SetRowProps) {
  const translateX = useSharedValue(0)
  const baseOffset = useSharedValue(0)
  const rowHeight = useSharedValue<number>(touchTarget.comfort)
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
    rowHeight.value = withTiming(
      0,
      { duration: 260, easing: Easing.bezier(0.16, 1, 0.3, 1) },
      (finished) => {
        'worklet'
        if (finished) runOnJS(onDelete)()
      }
    )
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
        accessibilityRole="button"
        accessibilityLabel="Supprimer la série"
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
          <Text style={[styles.setRowValue, { color: colors.textPrimary }]} numberOfLines={1}>
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
          {ghostVolume !== undefined && ghostVolume > 0 && (
            <View style={styles.setVolumeBar}>
              <View
                style={[
                  styles.setVolumeFill,
                  {
                    width:
                      `${Math.min(((set.weight_kg * set.reps) / ghostVolume) * 100, 100)}%` as `${number}%`,
                    backgroundColor:
                      set.weight_kg * set.reps >= ghostVolume ? '#00E673' : 'rgba(255,59,48,0.55)',
                  },
                ]}
              />
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
  // Couche data extraite — ORA-034 (bibliothèque + recherche/filtre + sections)
  const { loading, search, setSearch, filter, setFilter, flatData, reset } =
    useExerciseLibrary(visible)
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
    } else {
      slideValue.value = withSpring(Dimensions.get('window').height, spring.snappy)
      backdropOpacity.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) })
      const t = setTimeout(() => {
        setMounted(false)
        reset()
      }, 360)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

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
            accessibilityLabel="Rechercher un exercice"
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
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
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Filtre ${label}`}
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
                <Text style={[styles.sectionHeader, { color: colors.textTertiary }]}>
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
                accessibilityRole="button"
                accessibilityState={{ selected: isAdded }}
                accessibilityLabel={`${ex.name_fr}${sub ? `, ${sub}` : ''}${isAdded ? ', ajouté à la séance' : ''}`}
                accessibilityHint={isAdded ? 'Retirer de la séance' : 'Ajouter à la séance'}
              >
                <View style={styles.exerciseRowInfo}>
                  <Text
                    style={[styles.exerciseName, { color: colors.textPrimary }]}
                    numberOfLines={1}
                  >
                    {ex.name_fr}
                  </Text>
                  {sub ? (
                    <Text style={[styles.exerciseSub, { color: colors.textSecondary }]}>{sub}</Text>
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
  charge: Zap,
  serie: Flame,
  exercice: Dumbbell,
  seance: Trophy,
}

function PrFlashOverlay({ events, onDismiss }: PrFlashOverlayProps) {
  const { colors } = useTheme()
  const backdropOpacity = useSharedValue(0)
  const prevKey = useRef<string | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Pre-allocate sharedValues for up to MAX_PR_CARDS — hooks order stable
  const op0 = useSharedValue(0)
  const ty0 = useSharedValue(20)
  const sc0 = useSharedValue(0.9)
  const op1 = useSharedValue(0)
  const ty1 = useSharedValue(20)
  const sc1 = useSharedValue(0.9)
  const op2 = useSharedValue(0)
  const ty2 = useSharedValue(20)
  const sc2 = useSharedValue(0.9)
  const op3 = useSharedValue(0)
  const ty3 = useSharedValue(20)
  const sc3 = useSharedValue(0.9)

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
  const eventsKey =
    events && events.length > 0
      ? events.map((e) => `${e.type}:${e.level}:${e.value}`).join('|')
      : null

  function clearTimers() {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current)
      dismissTimerRef.current = null
    }
    if (fadeTimerRef.current) {
      clearTimeout(fadeTimerRef.current)
      fadeTimerRef.current = null
    }
  }

  function dismiss() {
    clearTimers()
    backdropOpacity.value = withTiming(0, {
      duration: FADE_OUT_MS,
      easing: Easing.out(Easing.quad),
    })
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
    level === 'gold' ? 'Nouveau sommet' : level === 'silver' ? '2e meilleure' : '3e meilleure'
  if (level === 'gold') return ordinal
  const suffix = kind === 'charge' ? 'charge' : kind === 'serie' ? 'série' : 'performance'
  return `${ordinal} ${suffix}`
}

function buildPrEvents(
  prCharge: PrLevel,
  prSerie: PrLevel,
  weight: number,
  reps: number
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
    // ORA-063 — fenêtre selon le plan (cache RAM, zéro réseau séance)
    void getGhostReference(currentExerciseId, ghostLimitDays()).then(setGhostRef)
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
      (finished) => {
        if (finished) runOnJS(router.replace)('/(tabs)/feed')
      }
    )
  }

  const currentExercise: WorkoutExercise | undefined = exercises[currentIndex]
  const draftSet: WorkoutSet | undefined = currentExercise?.sets.find((s) => !s.validated)
  const validatedSets: WorkoutSet[] = currentExercise?.sets.filter((s) => s.validated) ?? []

  const weightValues = useMemo(
    () => getWeightValues(currentExercise?.equipment_type ?? null),
    [currentExercise?.equipment_type]
  )

  const draftWeight = draftSet?.weight_kg ?? weightValues[0] ?? 0
  const draftReps = draftSet?.reps ?? 1

  // Set number being prepared
  const nextSetNumber = validatedSets.length + 1

  // Ghost beaten: current draft weight beats ghost reference
  const ghostBeaten = ghostEnabled && ghostRef !== null && draftWeight > ghostRef.weight_kg

  // Added exercise IDs for checkmarks in modal
  const addedIds = useMemo(() => new Set(exercises.map((e) => e.exercise_id)), [exercises])

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
      const rank = (l: PrLevelStrict | null) =>
        l === 'gold' ? 3 : l === 'silver' ? 2 : l === 'bronze' ? 1 : 0
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
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <ChevronLeft size={24} color={colors.textSecondary} strokeWidth={2} />
        </TouchableOpacity>
        <View
          style={[styles.idleContainer, { paddingBottom: insets.bottom, paddingTop: insets.top }]}
        >
          <Text style={[styles.idleTitle, { color: colors.textPrimary }]}>Orava</Text>
          <Text style={[styles.idleSubtitle, { color: colors.textSecondary }]}>
            Prêt à sentraîner ?
          </Text>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.accent }]}
            onPress={startWorkout}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Démarrer une séance"
          >
            <Text style={[styles.startButtonText, { color: colors.background }]}>
              DÉMARRER UNE SÉANCE
            </Text>
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
              onPress={() => {
                resetWorkout()
                router.replace('/(tabs)/feed')
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Quitter la séance"
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
              accessibilityLabel={`Durée de la séance : ${Math.floor(elapsedSeconds / 60)} minutes`}
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
              style={[
                styles.finishButton,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
              ]}
              onPress={finishWorkout}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Terminer la séance"
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
              accessibilityRole="tab"
              accessibilityState={{ selected: idx === currentIndex }}
              accessibilityLabel={ex.name}
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
            accessibilityRole="button"
            accessibilityLabel="Ajouter un exercice"
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
            accessibilityRole="button"
            accessibilityLabel="Ajouter un exercice"
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
            <Text
              style={[styles.exerciseTitleZen, { color: colors.textPrimary }]}
              numberOfLines={2}
            >
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
                accessibilityRole="button"
                accessibilityLabel="Retirer cet exercice de la séance"
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
                  ghostVolume={ghostRef?.volume}
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
                accessibilityRole="adjustable"
                accessibilityLabel={`Poids : ${draftWeight > 0 ? draftWeight : 0} kilos`}
                accessibilityHint="Ouvre le sélecteur de poids"
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
                accessibilityRole="adjustable"
                accessibilityLabel={`Répétitions : ${draftReps}`}
                accessibilityHint="Ouvre le sélecteur de répétitions"
              >
                <Text style={[styles.pickerButtonValue, { color: colors.textPrimary }]}>
                  {draftReps}
                </Text>
                <Text style={[styles.pickerButtonLabel, { color: colors.textSecondary }]}>
                  REPS
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Ghost compare bar */}
          {ghostEnabled && ghostRef !== null && (
            <GhostCompareBar
              ghostWeight={ghostRef.weight_kg}
              currentWeight={draftWeight}
              ghostBeaten={ghostBeaten}
            />
          )}

          {/* LOG SET button — sticky at bottom */}
          <View
            style={[styles.logSetWrapper, { paddingBottom: Math.max(insets.bottom, spacing.s4) }]}
          >
            <TouchableOpacity
              style={[styles.logSetButton, { backgroundColor: colors.accent }]}
              onPress={handleValidate}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Valider la série : ${draftWeight > 0 ? draftWeight : 0} kilos, ${draftReps} répétitions`}
            >
              <Text style={[styles.logSetText, { color: colors.background }]}>LOG SET</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {/* PR Flash overlay */}
      <PrFlashOverlay events={prFlash} onDismiss={() => setPrFlash(null)} />

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

  // ── Ghost volume indicator in set row ──
  setVolumeBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  setVolumeFill: {
    height: 2,
    borderRadius: 1,
  },
})
