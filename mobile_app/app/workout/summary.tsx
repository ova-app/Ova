import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, {
  useSharedValue,
  withSpring,
  withDelay,
  withTiming,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  Easing,
  type SharedValue,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Camera, Dumbbell, Flame, Image as ImageIcon, Trophy, Zap } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget, spring, font } from '@/constants/theme'
import { prBadgeRecipe, type PrType } from '@/constants/recipes'
import { useWorkout, computePodium, WorkoutExercise, PrLevel } from '@/context/WorkoutContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { saveMyoSignature, computeSessionValues, computeMuscleDims, type EmRow } from '@/lib/myo'

import { Canvas, Path as SkiaPath, Skia, LinearGradient as SkiaLinearGradient, vec } from '@shopify/react-native-skia'
import { insertLocalSet, insertLocalSession } from '@/lib/db'
import { computePrediction } from '@/lib/predictor'
import { storage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

const { width: SCREEN_W } = Dimensions.get('window')

// ─── PR Icons ────────────────────────────────────────────────────────────────

const PR_ICON: Record<PrType, React.ComponentType<{ size?: number; color?: string }>> = {
  charge:   Zap,
  serie:    Flame,
  exercice: Dumbbell,
  seance:   Trophy,
}

const PR_LABEL: Record<PrType, string> = {
  charge:   'PR CHARGE',
  serie:    'PR SÉRIE',
  exercice: 'PR EXERCICE',
  seance:   'PR SÉANCE',
}

const PR_LEVEL_LABEL: Record<string, string> = {
  gold:   'OR',
  silver: 'ARGENT',
  bronze: 'BRONZE',
}

// ─── PR Row ──────────────────────────────────────────────────────────────────

function PrRow({
  level,
  type,
  value,
  delay,
  exerciseName,
  setNumber,
  onPress,
}: {
  level: 'gold' | 'silver' | 'bronze'
  type: PrType
  value: string
  delay: number
  exerciseName: string
  setNumber?: number
  onPress?: () => void
}) {
  const { colors } = useTheme()
  const Icon = PR_ICON[type]
  const tint = level === 'gold' ? colors.prGold : level === 'silver' ? colors.prSilver : colors.prBronze
  const anim = useSharedValue(0)

  useEffect(() => {
    anim.value = withDelay(delay, withSpring(1, spring.bouncy))
  }, [])

  const animStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [{ translateX: (1 - anim.value) * -14 }],
  }))

  return (
    <Animated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.prRow, { backgroundColor: colors.backgroundSecondary }]}
        onPress={onPress}
        activeOpacity={onPress ? 0.75 : 1}
      >
        {/* Barre accent gauche flush */}
        <View style={[styles.prRowAccentBar, { backgroundColor: tint }]} />
        {/* Icône cerclée */}
        <View style={[styles.prRowIconWrap, { backgroundColor: `${tint}1A` }]}>
          <Icon size={15} color={tint} />
        </View>
        {/* Contenu */}
        <View style={styles.prRowContent}>
          <Text style={[styles.prRowTypeLabel, { color: tint }]}>{PR_LABEL[type]}</Text>
          <Text style={[styles.prRowValueText, { color: colors.textPrimary }]}>{value}</Text>
          <Text style={[styles.prRowSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {exerciseName}{setNumber != null ? ` · Série ${setNumber}` : ''}
          </Text>
        </View>
        {/* Badge niveau + chevron */}
        <View style={styles.prRowRight}>
          <View style={[styles.prLevelPill, { borderColor: `${tint}45`, backgroundColor: `${tint}12` }]}>
            <Text style={[styles.prLevelPillText, { color: tint }]}>{PR_LEVEL_LABEL[level]}</Text>
          </View>
          {onPress && (
            <Text style={[styles.prRowChevron, { color: colors.textTertiary }]}>›</Text>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.statPill, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[styles.statPillValue, { color: colors.textPrimary }]} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={[styles.statPillLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  )
}

// ─── Muscle Legend ────────────────────────────────────────────────────────────

function MuscleLegend({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={styles.muscleLegend}>
      <View style={styles.muscleLegendItem}>
        <View style={[styles.muscleLegendDot, { backgroundColor: colors.accent }]} />
        <Text style={[styles.muscleLegendLabel, { color: colors.textSecondary }]}>Primaire</Text>
      </View>
      <View style={styles.muscleLegendItem}>
        <View style={[styles.muscleLegendDot, { backgroundColor: colors.textSecondary }]} />
        <Text style={[styles.muscleLegendLabel, { color: colors.textSecondary }]}>Secondaire</Text>
      </View>
    </View>
  )
}

// ─── Muscle Bar ───────────────────────────────────────────────────────────────

const MUSCLE_BAR_H      = 7
const MUSCLE_BAR_RADIUS = 3.5

function MuscleBar({
  label,
  pct,
  isPrimary,
  colors,
  delay,
}: {
  label: string
  pct: number
  isPrimary: boolean
  colors: ReturnType<typeof useTheme>['colors']
  delay: number
}) {
  const trackW = SCREEN_W - spacing.s4 * 2 - 84 - 40 - spacing.s3 * 2

  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withDelay(delay, withTiming(pct, { duration: 620, easing: Easing.bezier(0.16, 1, 0.3, 1) }))
  }, [])

  const barStyle = useAnimatedStyle(() => ({
    width: Math.max(progress.value * trackW, MUSCLE_BAR_RADIUS * 2),
  }))

  const barPath = React.useMemo(() => {
    const p = Skia.Path.Make()
    p.addRRect({ rect: { x: 0, y: 0, width: trackW, height: MUSCLE_BAR_H }, rx: MUSCLE_BAR_RADIUS, ry: MUSCLE_BAR_RADIUS })
    return p
  }, [trackW])

  const gradStart = isPrimary ? colors.accent : '#7A7A8C'
  const gradEnd   = isPrimary ? '#FAC775'    : '#3A3A4A'

  return (
    <View style={styles.muscleRow}>
      <Text style={[styles.muscleLabel, { color: isPrimary ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.muscleBarTrack, { width: trackW }]}>
        <View style={[styles.muscleBarBg, { backgroundColor: `${gradStart}14` }]}>
          <Animated.View style={[styles.muscleBarAnimWrap, barStyle]}>
            <Canvas style={{ width: trackW, height: MUSCLE_BAR_H }}>
              <SkiaPath path={barPath} style="fill">
                <SkiaLinearGradient
                  start={vec(0, 0)}
                  end={vec(trackW, 0)}
                  colors={[gradStart, gradEnd]}
                />
              </SkiaPath>
            </Canvas>
          </Animated.View>
        </View>
      </View>
      <Text
        style={[styles.musclePct, { color: isPrimary ? colors.accent : colors.textTertiary }]}
        allowFontScaling={false}
      >
        {Math.round(pct * 100)}%
      </Text>
    </View>
  )
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ label, colors }: { label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: colors.accent }]} />
      <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>{label}</Text>
    </View>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  return `${m}min`
}

function formatDate(date: Date | null): string {
  if (!date) return "AUJOURD'HUI"
  const day = date.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const isToday = new Date().toDateString() === date.toDateString()
  return isToday ? `AUJOURD'HUI · ${time}` : `${day} · ${time}`
}

function generateWorkoutName(exercises: WorkoutExercise[], startedAt: Date | null): string {
  const hour = startedAt ? startedAt.getHours() : 12
  const slot = hour < 6 ? 'Nuit' : hour < 12 ? 'Matin' : hour < 18 ? 'Après-midi' : 'Soir'
  const groups = [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))]
  if (groups.length === 0) return `Séance du ${slot}`
  const groupLabels: Record<string, string> = {
    pectoraux: 'Pecs', dos: 'Dos', epaules: 'Épaules',
    biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Jambes',
    ischio_jambiers: 'Ischio', fessiers: 'Fessiers', mollets: 'Mollets', abdominaux: 'Abdos',
  }
  const label = groups.slice(0, 2).map(g => groupLabels[g ?? ''] ?? g ?? '').join(' & ')
  return `${label} — ${slot}`
}

function epley1RM(w: number, r: number): number {
  return r === 1 ? w : w * (1 + r / 30)
}

function formatRestTimeSummary(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function muscleLabelFr(key: string): string {
  const map: Record<string, string> = {
    pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules',
    biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps',
    ischio_jambiers: 'Ischio', fessiers: 'Fessiers', mollets: 'Mollets',
    abdominaux: 'Abdominaux', autre: 'Autre',
  }
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}

// ─── Volume Trend Sparkline ───────────────────────────────────────────────────

function VolumeTrendSparkline({
  history,
  current,
}: {
  history: number[]
  current: number
}) {
  const all = useMemo(() => [...history, current], [history, current])
  const W = SCREEN_W - spacing.s4 * 2
  const H = 52
  const padX = 4
  const padY = 8
  const n = all.length

  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  function findIdx(x: number): number {
    const t = (Math.max(padX, Math.min(W - padX, x)) - padX) / (W - padX * 2)
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))))
  }

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => setActiveIdx(findIdx(e.nativeEvent.locationX)),
    onPanResponderMove: (e) => setActiveIdx(findIdx(e.nativeEvent.locationX)),
    onPanResponderRelease: () => setActiveIdx(null),
    onPanResponderTerminate: () => setActiveIdx(null),
  }), [n, W])

  const { linePath, fillPath, pts } = useMemo(() => {
    if (all.length < 2) return { linePath: null, fillPath: null, pts: [] }
    const maxV = Math.max(...all, 1)
    const computedPts = all.map((v, i) => ({
      x: padX + (i / (n - 1)) * (W - padX * 2),
      y: padY + (1 - v / maxV) * (H - padY * 2),
    }))
    const line = Skia.Path.Make()
    const fill = Skia.Path.Make()
    line.moveTo(computedPts[0].x, computedPts[0].y)
    fill.moveTo(computedPts[0].x, H)
    fill.lineTo(computedPts[0].x, computedPts[0].y)
    for (let i = 1; i < computedPts.length; i++) {
      const prev = computedPts[i - 1]
      const curr = computedPts[i]
      const cpx = (prev.x + curr.x) / 2
      line.cubicTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y)
      fill.cubicTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y)
    }
    fill.lineTo(computedPts[computedPts.length - 1].x, H)
    fill.close()
    return { linePath: line, fillPath: fill, pts: computedPts }
  }, [all, W, H, n, padX, padY])

  const lineReveal = useSharedValue(0)
  useEffect(() => {
    lineReveal.value = 0
    lineReveal.value = withDelay(600, withTiming(1, { duration: 820, easing: Easing.bezier(0.16, 1, 0.3, 1) }))
  }, [all.length])

  const revealStyle = useAnimatedStyle(() => ({ width: lineReveal.value * W }))

  if (!linePath || !fillPath) return null

  const activeVal = activeIdx !== null ? all[activeIdx] : null
  const activePt  = activeIdx !== null ? pts[activeIdx] : null
  const isLast    = activeIdx === n - 1

  return (
    <View style={{ width: W, marginTop: spacing.s3 }}>
      {/* En-tête explicatif */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.s2 }}>
        <Text style={{ color: 'rgba(255,255,255,0.28)', fontSize: 9, fontFamily: font.medium, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          VOLUME · {n} séances
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.28)', fontSize: 9, fontFamily: font.medium, letterSpacing: 0.5 }}>
          cette séance →
        </Text>
      </View>
      {/* Canvas + touch */}
      <View style={{ width: W, height: H }} {...panResponder.panHandlers}>
        {/* Zone remplie */}
        <Canvas style={{ width: W, height: H, position: 'absolute' }}>
          <SkiaPath path={fillPath} style="fill" opacity={0.10}>
            <SkiaLinearGradient start={vec(0, 0)} end={vec(0, H)} colors={['#FFDD00', 'rgba(255,221,0,0)']} />
          </SkiaPath>
        </Canvas>
        {/* Ligne */}
        <View style={{ overflow: 'hidden', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Animated.View style={[{ height: H }, revealStyle]}>
            <Canvas style={{ width: W, height: H }}>
              <SkiaPath path={linePath} style="stroke" strokeWidth={1.8} strokeCap="round" strokeJoin="round" color="#FFDD00" />
            </Canvas>
          </Animated.View>
        </View>
        {/* Dot séance courante */}
        <Canvas style={{ width: W, height: H, position: 'absolute' }} pointerEvents="none">
          <SkiaPath
            path={(() => {
              const p = Skia.Path.Make()
              if (pts.length > 0) {
                const last = pts[pts.length - 1]
                p.addCircle(last.x, last.y, 4)
              }
              return p
            })()}
            style="fill"
            color="#FFDD00"
          />
        </Canvas>
        {/* Curseur actif */}
        {activeIdx !== null && activePt && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill]}>
            {/* Ligne verticale */}
            <View style={{
              position: 'absolute',
              left: activePt.x - 0.5,
              top: 0,
              width: 1,
              height: H,
              backgroundColor: 'rgba(255,255,255,0.18)',
            }} />
            {/* Dot */}
            <View style={{
              position: 'absolute',
              left: activePt.x - 4,
              top: activePt.y - 4,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isLast ? '#FFDD00' : 'rgba(255,255,255,0.70)',
              borderWidth: 1.5,
              borderColor: '#0A0A0F',
            }} />
            {/* Bulle valeur */}
            <View style={{
              position: 'absolute',
              left: Math.max(0, Math.min(activePt.x - 36, W - 72)),
              top: activePt.y < H / 2 ? activePt.y + 10 : activePt.y - 28,
              backgroundColor: 'rgba(26,26,36,0.92)',
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.10)',
            }}>
              <Text style={{ color: isLast ? '#FFDD00' : '#F0F0F5', fontSize: 11, fontFamily: font.bold, fontVariant: ['tabular-nums'], letterSpacing: -0.2 }}>
                {Math.round(activeVal!).toLocaleString('fr-FR')} kg
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { status, startedAt, exercises, elapsedSeconds, resetWorkout } = useWorkout()

  const [isPublic, setIsPublic] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [histVolumes, setHistVolumes] = useState<number[]>([])

  const scrollViewRef = useRef<ScrollView>(null)
  const recapSectionY = useRef(0)
  const recapCardRelY = useRef<Record<string, number>>({})

  const scrollToExercise = useCallback((exerciseId: string) => {
    const rel = recapCardRelY.current[exerciseId]
    if (rel == null) return
    scrollViewRef.current?.scrollTo({ y: Math.max(0, recapSectionY.current + rel - 16), animated: true })
  }, [])

  const [sessionValues, setSessionValues] = useState<number[][]>(() => {
    const sets = exercises.flatMap(ex =>
      ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
    )
    const vol = sets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
    const pMax = sets.length ? Math.max(...sets.map(s => s.weight_kg)) : 0
    const densite = elapsedSeconds > 0 ? (vol / elapsedSeconds) * 60 : 0
    return computeSessionValues({
      volume_kg: vol, densite, nb_series: sets.length,
      nb_exercices: exercises.length,
      nb_pr: sets.filter(s => s.pr_charge !== null || s.pr_serie !== null).length,
      streak: 0, frequence_hebdo: 0, nb_seances_30j: 0, duree_sec: elapsedSeconds,
      temps_repos_moy_sec: 120, ratio_actif: 0.5, poids_max_kg: pMax, charge_relative: 65,
    })
  })

  // Enrichit la famille 6 (muscles) dès le mount sans attendre le save
  useEffect(() => {
    const exerciseIds = exercises.map(ex => ex.exercise_id).filter(Boolean)
    if (!exerciseIds.length) return
    void (async () => {
      const { data } = await supabase
        .from('exercise_muscles')
        .select('exercise_id, muscle, fascicle, activation_pct')
        .in('exercise_id', exerciseIds)
        .in('role', ['primary', 'secondary'])
      if (!data?.length) return
      const setsByEx: Record<string, Array<{ weight_kg: number; reps: number }>> =
        Object.fromEntries(exercises.map(ex => [
          ex.exercise_id,
          ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0).map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
        ]))
      const muscleDims = computeMuscleDims(setsByEx, data as EmRow[])
      const sets = exercises.flatMap(ex =>
        ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      )
      const vol = sets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
      const pMax = sets.length ? Math.max(...sets.map(s => s.weight_kg)) : 0
      const densite = elapsedSeconds > 0 ? (vol / elapsedSeconds) * 60 : 0
      setSessionValues(computeSessionValues({
        volume_kg: vol, densite, nb_series: sets.length,
        nb_exercices: exercises.length,
        nb_pr: sets.filter(s => s.pr_charge !== null || s.pr_serie !== null).length,
        streak: 0, frequence_hebdo: 0, nb_seances_30j: 0, duree_sec: elapsedSeconds,
        temps_repos_moy_sec: 120, ratio_actif: 0.5, poids_max_kg: pMax, charge_relative: 65,
        muscleDims,
      }))
    })()
  }, [])

  // Fetch last 8 workout volumes for trend sparkline
  useEffect(() => {
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('workouts')
        .select('total_volume_kg')
        .eq('user_id', user.id)
        .not('total_volume_kg', 'is', null)
        .order('started_at', { ascending: false })
        .limit(8)
      if (data?.length) {
        setHistVolumes(
          (data as { total_volume_kg: number }[])
            .map(w => w.total_volume_kg)
            .reverse()
        )
      }
    })()
  }, [])

  // Reveal animations — sequential 80ms
  const anim0 = useSharedValue(0)
  const anim1 = useSharedValue(0)
  const anim2 = useSharedValue(0)
  const anim3 = useSharedValue(0)
  const anim4 = useSharedValue(0)
  const volumeAnimValue = useSharedValue(0)
  const [displayVolume, setDisplayVolume] = useState(0)

  const makeRevealStyle = (anim: SharedValue<number>) =>
    useAnimatedStyle(() => ({
      opacity: anim.value,
      transform: [{ translateY: (1 - anim.value) * 16 }],
    }))

  const style0 = makeRevealStyle(anim0)
  const style1 = makeRevealStyle(anim1)
  const style2 = makeRevealStyle(anim2)
  const style3 = makeRevealStyle(anim3)
  const style4 = makeRevealStyle(anim4)


  useAnimatedReaction(
    () => volumeAnimValue.value,
    (value) => { runOnJS(setDisplayVolume)(Math.round(value)) }
  )

  useEffect(() => {
    void AsyncStorage.getItem('settings_public_workouts').then(v => {
      if (v === 'true') setIsPublic(true)
    })
  }, [])

  useEffect(() => {
    if (status !== 'done') { router.replace('/workout/session'); return }
    setWorkoutName(generateWorkoutName(exercises, startedAt))
    anim0.value = withDelay(0,   withSpring(1, spring.standard))
    anim1.value = withDelay(80,  withSpring(1, spring.standard))
    anim2.value = withDelay(160, withSpring(1, spring.standard))
    anim3.value = withDelay(240, withSpring(1, spring.standard))
    anim4.value = withDelay(320, withSpring(1, spring.standard))
    volumeAnimValue.value = withDelay(
      800,
      withTiming(totalVolume, { duration: 500, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    )
  }, [])

  // ─── Métriques ─────────────────────────────────────────────────────────────

  const validSets = exercises.flatMap(ex =>
    ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
  )
  const totalVolume = validSets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
  const nbSeries = validSets.length
  const nbExercices = exercises.length
  const poidsMaxSeance = validSets.length ? Math.max(...validSets.map(s => s.weight_kg)) : 0

  const prChargeDetected = validSets.filter(s => s.pr_charge !== null)
  const prSerieDetected = validSets.filter(s => s.pr_serie !== null)
  const hasPrs = prChargeDetected.length > 0 || prSerieDetected.length > 0

  const prChargeLevels: PrLevel[] = prChargeDetected.map(s => s.pr_charge)
  const bestPrCharge: PrLevel = prChargeLevels.includes('gold') ? 'gold' :
    prChargeLevels.includes('silver') ? 'silver' :
    prChargeLevels.includes('bronze') ? 'bronze' : null

  const prSerieMax = prSerieDetected.reduce((best, s) => Math.max(best, Math.round(s.weight_kg * s.reps)), 0)
  const prSerieLevels: PrLevel[] = prSerieDetected.map(s => s.pr_serie)
  const bestPrSerie: PrLevel = prSerieLevels.includes('gold') ? 'gold' :
    prSerieLevels.includes('silver') ? 'silver' :
    prSerieLevels.includes('bronze') ? 'bronze' : null

  const muscleVolumes = exercises.reduce<Record<string, number>>((acc, ex) => {
    const key = ex.muscle_group ?? 'autre'
    const vol = ex.sets
      .filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      .reduce((s, set) => s + set.weight_kg * set.reps, 0)
    acc[key] = (acc[key] ?? 0) + vol
    return acc
  }, {})
  const maxVol = Math.max(...Object.values(muscleVolumes), 1)
  const muscleEntries = Object.entries(muscleVolumes).sort((a, b) => b[1] - a[1])
  const primaryMuscle = muscleEntries[0]?.[0] ?? null

  // ─── computeAndSave ─────────────────────────────────────────────────────────

  async function computeAndSave(): Promise<{ workoutId: string; prSeance: PrLevel }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Non authentifié')

    const poidsMax = Math.max(0, ...validSets.map(s => s.weight_kg))
    const volumeMaxSerie = Math.max(0, ...validSets.map(s => s.weight_kg * s.reps))
    const durationSec = elapsedSeconds

    const volumeParExercice: Record<string, number> = {}
    const volumeMaxSerieParEx: Record<string, number> = {}
    const poidsMaxParEx: Record<string, number> = {}
    const nbSeriesParEx: Record<string, number> = {}
    const estimated1rmParEx: Record<string, number> = {}
    const restParEx: Record<string, number[]> = {}

    for (const ex of exercises) {
      const sets = ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      if (sets.length === 0) continue
      const id = ex.exercise_id
      volumeParExercice[id] = sets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
      volumeMaxSerieParEx[id] = Math.max(...sets.map(s => s.weight_kg * s.reps))
      poidsMaxParEx[id] = Math.max(...sets.map(s => s.weight_kg))
      nbSeriesParEx[id] = sets.length
      estimated1rmParEx[id] = Math.max(...sets.map(s => epley1RM(s.weight_kg, s.reps)))
      restParEx[id] = sets.map(s => s.rest_seconds ?? 0).filter(r => r > 0)
    }

    const allRests = Object.values(restParEx).flat()
    const tempsReposTotal = allRests.reduce((s, r) => s + r, 0)
    const tempsReposMoyen = allRests.length ? tempsReposTotal / allRests.length : null
    const tempsActif = Math.max(0, durationSec - tempsReposTotal)
    const ratioActif = durationSec > 0 ? tempsActif / durationSec : null
    const tempsReposMoyParEx: Record<string, number | null> = {}
    for (const [id, rests] of Object.entries(restParEx)) {
      tempsReposMoyParEx[id] = rests.length ? rests.reduce((a, b) => a + b, 0) / rests.length : null
    }

    const startHour = startedAt ? startedAt.getHours() : 18
    const slotHoraire: 'matin' | 'apres_midi' | 'soir' | 'nuit' =
      startHour < 6 ? 'nuit' : startHour < 12 ? 'matin' : startHour < 18 ? 'apres_midi' : 'soir'
    const densiteKgParMin = durationSec > 0 ? (totalVolume / durationSec) * 60 : 0

    const { data: topWorkouts } = await supabase
      .from('workouts').select('total_volume_kg').eq('user_id', user.id)
      .not('total_volume_kg', 'is', null).order('total_volume_kg', { ascending: false }).limit(3)

    const topVols: number[] = ((topWorkouts ?? []) as { total_volume_kg: number }[]).map(w => w.total_volume_kg ?? 0)
    const top3seance = { pr1: topVols[0] ?? 0, pr2: topVols[1] ?? null, pr3: topVols[2] ?? null }
    const prSeance = computePodium(totalVolume, top3seance)

    const prParExercice: Record<string, boolean> = {}
    for (const ex of exercises) prParExercice[ex.exercise_id] = ex.sets.some(s => s.is_pr)
    const nbPrSeance = validSets.filter(s => s.is_pr).length

    let streakSemaines = 0, nbSeances30j = 0, frequenceHebdo = 0, volume7j = 0
    let tempsDerniere: number | null = null
    const evolutionRepos: number | null = null
    try {
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: recent } = await supabase.from('workouts')
        .select('started_at, total_volume_kg, avg_rest_seconds')
        .eq('user_id', user.id).gte('started_at', since90)
        .order('started_at', { ascending: false })
      if (recent?.length) {
        nbSeances30j = (recent as { started_at: string }[]).filter(w => w.started_at >= since30).length
        frequenceHebdo = nbSeances30j / 4
        const last = (recent as { started_at: string }[])[0]
        if (last?.started_at) tempsDerniere = Math.round((Date.now() - new Date(last.started_at).getTime()) / 1000)
        const weeks = new Set((recent as { started_at: string }[]).map(w => {
          const d = new Date(w.started_at)
          return `${d.getFullYear()}-${Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000)}`
        }))
        streakSemaines = weeks.size
      }
    } catch (_) {}

    try {
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: wIds7j } = await supabase.from('workouts').select('id, total_volume_kg')
        .eq('user_id', user.id).gte('started_at', since7)
      volume7j = ((wIds7j ?? []) as { total_volume_kg: number }[]).reduce((s, w) => s + (w.total_volume_kg ?? 0), 0)
    } catch (_) {}

    let poidsCorps: number | null = null, ageAns: number | null = null
    try {
      const { data: userProfile } = await supabase.from('users').select('date_naissance').eq('id', user.id).single()
      const { data: bodyM } = await supabase.from('body_metrics').select('weight_kg')
        .eq('user_id', user.id).order('measured_at', { ascending: false }).limit(1).single()
      if (bodyM) poidsCorps = (bodyM as { weight_kg: number }).weight_kg
      if ((userProfile as { date_naissance?: string } | null)?.date_naissance) {
        const dob = new Date((userProfile as { date_naissance: string }).date_naissance)
        ageAns = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000))
      }
    } catch (_) {}

    const chargeRelSeance = poidsCorps && poidsMax > 0 ? (poidsMax / (poidsCorps * 0.8)) * 100 : null
    const chargeRelParEx: Record<string, number | null> = {}
    for (const [id, pm] of Object.entries(poidsMaxParEx)) {
      chargeRelParEx[id] = poidsCorps ? (pm / (poidsCorps * 0.8)) * 100 : null
    }

    const dominantMuscle = exercises.length > 0
      ? [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))].sort(
          (a, b) =>
            (volumeParExercice[exercises.find(e => e.muscle_group === b)?.exercise_id ?? ''] ?? 0) -
            (volumeParExercice[exercises.find(e => e.muscle_group === a)?.exercise_id ?? ''] ?? 0)
        )[0] ?? null
      : null

    const setsByExercise: Record<string, Array<{ weight_kg: number; reps: number }>> =
      Object.fromEntries(exercises.map(ex => [
        ex.exercise_id,
        ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0).map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
      ]))

    const workoutId = crypto.randomUUID()
    const startedAtIso = startedAt?.toISOString() ?? new Date().toISOString()

    const { error: wErr } = await supabase.from('workouts').insert({
      id: workoutId, user_id: user.id, title: workoutName,
      started_at: startedAtIso, ended_at: new Date().toISOString(),
      duration_sec: durationSec, total_volume_kg: totalVolume,
      is_public: isPublic, poids_corps_kg: poidsCorps, pr_seance: prSeance,
    })
    if (wErr) throw new Error(wErr.message)

    if (photoUri) {
      try {
        const response = await fetch(photoUri)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const uint8 = new Uint8Array(arrayBuffer)
        const { data: uploadData } = await supabase.storage
          .from('workout-photos').upload(`${user.id}/${workoutId}.jpg`, uint8, { contentType: 'image/jpeg', upsert: true })
        if (uploadData) {
          const { data: publicUrl } = supabase.storage.from('workout-photos').getPublicUrl(`${user.id}/${workoutId}.jpg`)
          if (publicUrl?.publicUrl) await supabase.from('workouts').update({ photo_url: publicUrl.publicUrl }).eq('id', workoutId)
        }
      } catch (_) {}
    }

    for (let ei = 0; ei < exercises.length; ei++) {
      const ex = exercises[ei]
      const validatedSets = ex.sets.filter(s => s.validated && s.reps > 0)
      if (validatedSets.length === 0) continue
      const exVolume = volumeParExercice[ex.exercise_id] ?? 0
      const prExercice = computePodium(exVolume, ex.pr_top3_exercice)
      const weId = crypto.randomUUID()
      const { error: weErr } = await supabase.from('workout_exercises').insert({
        id: weId, workout_id: workoutId, exercise_id: ex.exercise_id, order_index: ei, pr_exercice: prExercice,
      })
      if (weErr) throw new Error(weErr.message)
      const setsInsert = validatedSets.map((s) => ({
        id: crypto.randomUUID(), workout_exercise_id: weId, set_type: 'working' as const,
        set_number: s.set_number, reps: s.reps, weight_kg: s.weight_kg, rest_seconds: s.rest_seconds,
        is_pr: s.is_pr, pr_charge: s.pr_charge, pr_serie: s.pr_serie,
        logged_at: s.validated_at ? new Date(s.validated_at).toISOString() : new Date().toISOString(),
      }))
      const { error: wsErr } = await supabase.from('workout_sets').insert(setsInsert)
      if (wsErr) throw new Error(wsErr.message)
      for (const s of validatedSets) {
        await insertLocalSet({
          id: `${workoutId}-${ex.exercise_id}-${s.set_number}`,
          exercise_id: ex.exercise_id, weight_kg: s.weight_kg, reps: s.reps,
          session_id: workoutId, logged_at: s.validated_at ?? Date.now(),
        })
      }
    }

    await insertLocalSession({ id: workoutId, total_volume_kg: totalVolume, logged_at: Date.now() })

    try {
      const metricsData = {
        volume_total_kg: totalVolume, duree_totale_seance: durationSec,
        nb_exercices: nbExercices, nb_series_total: nbSeries,
        poids_max_seance_kg: poidsMax, volume_max_serie_kg: volumeMaxSerie,
        volume_par_exercice_kg: volumeParExercice, nb_series_par_exercice: nbSeriesParEx,
        poids_max_par_exercice_kg: poidsMaxParEx, estimated_1rm_par_exercice_kg: estimated1rmParEx,
        pr_par_exercice: prParExercice, temps_repos_total_sec: tempsReposTotal,
        temps_repos_moyen_seance_sec: tempsReposMoyen, temps_actif_sec: tempsActif,
        ratio_actif_repos: ratioActif, densite_kg_par_min: densiteKgParMin, slot_horaire: slotHoraire,
        heure_debut: startedAtIso, poids_corps_kg: poidsCorps, age_ans: ageAns,
        nb_pr_seance: nbPrSeance, streak_semaines_actives: streakSemaines,
        nb_seances_30_derniers_jours: nbSeances30j, frequence_hebdo_moyenne: frequenceHebdo,
        volume_7_derniers_jours_kg: volume7j, temps_depuis_derniere_seance_sec: tempsDerniere,
        charge_relative_seance: chargeRelSeance, charge_relative_par_exercice: chargeRelParEx,
        temps_repos_moyen_par_exercice_sec: tempsReposMoyParEx, muscle_primaire_dominant: dominantMuscle,
        volume_max_serie_par_exercice_kg: volumeMaxSerieParEx, muscles_sollicites: [],
      }
      await supabase.from('workout_metrics').insert({
        workout_id: workoutId, data: metricsData, computed_at: new Date().toISOString(),
      })
    } catch (_) {}

    try {
      const sv = await saveMyoSignature({
        userId: user.id, workoutId, startedAtIso, volume_total_kg: totalVolume,
        densite_kg_par_min: densiteKgParMin, nb_series_total: nbSeries,
        score_recuperation_estime: null, nb_pr_seance: nbPrSeance,
        streak_semaines_actives: streakSemaines, volume_max_serie_kg: volumeMaxSerie,
        poids_max_seance_kg: poidsMax, charge_relative_seance: chargeRelSeance,
        nb_exercices: nbExercices, nb_series_par_exercise_moy: nbExercices > 0 ? nbSeries / nbExercices : 0,
        duree_totale_seance: durationSec, temps_repos_total_sec: tempsReposTotal,
        temps_repos_moyen_seance_sec: tempsReposMoyen, temps_actif_sec: tempsActif,
        ratio_actif_repos: ratioActif, heure_debut: startedAtIso, slot_horaire: slotHoraire,
        muscle_primaire_dominant: dominantMuscle, poids_corps_kg: poidsCorps, age_ans: ageAns,
        temps_depuis_derniere_seance_sec: tempsDerniere, volume_7_derniers_jours_kg: volume7j,
        evolution_repos_moyen_seance_sec: evolutionRepos, nb_seances_30_derniers_jours: nbSeances30j,
        frequence_hebdo_moyenne: frequenceHebdo, volume_par_exercice_kg: volumeParExercice,
        volume_max_serie_par_exercice_kg: volumeMaxSerieParEx, poids_max_par_exercice_kg: poidsMaxParEx,
        charge_relative_par_exercice: chargeRelParEx, nb_series_par_exercice: nbSeriesParEx,
        temps_repos_moyen_par_exercice_sec: tempsReposMoyParEx, estimated_1rm_par_exercice_kg: estimated1rmParEx,
        pr_par_exercice: prParExercice, volume_par_muscle_kg: {}, evolution_volume_par_exercice: {},
        evolution_1rm_par_exercice: {}, volume_par_muscle_30j_kg: {}, volume_par_muscle_90j_kg: {},
        frequence_sollicitation_par_muscle_7j: {}, muscles_sollicites: [], setsByExercise,
      })
      if (sv) setSessionValues(sv)
    } catch (_) {}

    return { workoutId, prSeance }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await computeAndSave()
      // Fire-and-forget — cache les prédictions en arrière-plan après save SQLite
      void (async () => {
        try {
          const preds = await Promise.all(
            exercises
              .filter(ex => ex.sets.some(s => s.validated && s.weight_kg > 0))
              .map(ex => computePrediction(ex.exercise_id, ex.name))
          )
          const valid = preds.filter((p): p is NonNullable<typeof p> => p !== null)
          if (valid.length > 0) {
            const existing = await AsyncStorage.getItem('predictions_cache')
            const prev: typeof valid = existing ? JSON.parse(existing) : []
            // Écrase les entrées du même exercice, garde les autres
            const merged = [
              ...prev.filter(p => !valid.some(v => v.exerciseId === p.exerciseId)),
              ...valid,
            ]
            await AsyncStorage.setItem('predictions_cache', JSON.stringify(merged))
          }
        } catch (_) {}
      })()
      storage.delete('workout_session_draft')
      resetWorkout()
      router.replace('/(tabs)/feed')
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur inconnue')
      setSaving(false)
    }
  }

  function handleCancel() {
    Alert.alert('Annuler ?', 'La séance sera perdue.', [
      { text: 'Non', style: 'cancel' },
      {
        text: 'Oui, annuler', style: 'destructive',
        onPress: () => {
          storage.delete('workout_session_draft')
          resetWorkout()
          router.replace('/(tabs)/feed')
        },
      },
    ])
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [4, 3], quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri)
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Header ── */}
        <Animated.View style={style0}>
          <Text style={[styles.dateCaption, { color: colors.textTertiary }]}>
            {formatDate(startedAt)}
          </Text>
          <Text style={[styles.workoutTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {workoutName}
          </Text>
        </Animated.View>

        {/* ── Volume hero ── */}
        <Animated.View style={[styles.heroBlock, style1]}>
          <Text style={[styles.heroLabel, { color: colors.textTertiary }]}>VOLUME TOTAL</Text>
          <View style={styles.heroRow}>
            <Text
              style={[styles.heroValue, { color: colors.accent }]}
              allowFontScaling={false}
            >
              {displayVolume.toLocaleString('fr-FR')}
            </Text>
            <Text style={[styles.heroUnit, { color: colors.accent }]}>kg</Text>
          </View>

          {/* Stats row: 3 pills */}
          <View style={styles.statsRow}>
            <StatPill label="DURÉE" value={formatDuration(elapsedSeconds)} colors={colors} />
            <StatPill label="SETS" value={String(nbSeries)} colors={colors} />
            <StatPill label="EXOS" value={String(nbExercices)} colors={colors} />
            {poidsMaxSeance > 0 && (
              <StatPill label="MAX" value={`${poidsMaxSeance}kg`} colors={colors} />
            )}
          </View>
        </Animated.View>

        {/* Trend sparkline — contexte séances précédentes */}
        {histVolumes.length > 0 && (
          <VolumeTrendSparkline history={histVolumes} current={totalVolume} />
        )}

        {/* ── Séparateur ── */}
        <View style={[styles.divider, { backgroundColor: colors.separator }]} />

        {/* ── PRs ── */}
        {hasPrs && (
          <Animated.View style={[styles.section, style2]}>
            <SectionHeader label="PRs DÉTECTÉS" colors={colors} />
            <View style={styles.prList}>
              {bestPrCharge !== null && (() => {
                const best = prChargeDetected.reduce((b, s) => s.weight_kg > (b?.weight_kg ?? 0) ? s : b, null as typeof prChargeDetected[0] | null)
                if (!best) return null
                const exForCharge = exercises.find(ex => ex.sets.some(s => s === best))
                return (
                  <PrRow
                    level={bestPrCharge}
                    type="charge"
                    value={`${best.weight_kg} kg`}
                    delay={80}
                    exerciseName={exForCharge?.name ?? ''}
                    setNumber={best.set_number}
                    onPress={exForCharge ? () => scrollToExercise(exForCharge.exercise_id) : undefined}
                  />
                )
              })()}
              {bestPrSerie !== null && (() => {
                const best = prSerieDetected.reduce((b, s) => (s.weight_kg * s.reps) > ((b?.weight_kg ?? 0) * (b?.reps ?? 0)) ? s : b, null as typeof prSerieDetected[0] | null)
                if (!best) return null
                const exForSerie = exercises.find(ex => ex.sets.some(s => s === best))
                return (
                  <PrRow
                    level={bestPrSerie}
                    type="serie"
                    value={`${best.weight_kg} kg × ${best.reps}`}
                    delay={160}
                    exerciseName={exForSerie?.name ?? ''}
                    setNumber={best.set_number}
                    onPress={exForSerie ? () => scrollToExercise(exForSerie.exercise_id) : undefined}
                  />
                )
              })()}
            </View>
          </Animated.View>
        )}

        {/* ── Groupes musculaires ── */}
        {muscleEntries.length > 0 && (
          <Animated.View style={[styles.section, style3]}>
            <View style={styles.muscleSectionHeader}>
              <SectionHeader label="GROUPES MUSCULAIRES" colors={colors} />
              <MuscleLegend colors={colors} />
            </View>
            {muscleEntries.map(([muscle, vol], idx) => (
              <MuscleBar
                key={muscle}
                label={muscleLabelFr(muscle)}
                pct={vol / maxVol}
                isPrimary={muscle === primaryMuscle}
                colors={colors}
                delay={idx * 60}
              />
            ))}
          </Animated.View>
        )}

        {/* ── Récap exercices ── */}
        {exercises.length > 0 && (
          <Animated.View
            style={[styles.section, style4]}
            onLayout={(e) => { recapSectionY.current = e.nativeEvent.layout.y }}
          >
            <SectionHeader label="RÉCAP SÉANCE" colors={colors} />
            {exercises.map((ex, exIdx) => {
              const exSets = ex.sets.filter(s => s.validated && s.reps > 0)
              if (exSets.length === 0) return null
              const maxW = Math.max(...exSets.map(s => s.weight_kg), 0)
              const exVol = exSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
              return (
                <View
                  key={ex.exercise_id}
                  style={[styles.recapCard, { backgroundColor: colors.backgroundSecondary }]}
                  onLayout={(e) => { recapCardRelY.current[ex.exercise_id] = e.nativeEvent.layout.y }}
                >
                  <View style={styles.recapExHeader}>
                    <View style={[styles.recapIdx, { backgroundColor: colors.backgroundTertiary }]}>
                      <Text style={[styles.recapIdxText, { color: colors.textTertiary }]}>
                        {String(exIdx + 1).padStart(2, '0')}
                      </Text>
                    </View>
                    <View style={styles.recapExInfo}>
                      <Text style={[styles.recapExName, { color: colors.textPrimary }]} numberOfLines={1}>
                        {ex.name}
                      </Text>
                      <Text style={[styles.recapExMeta, { color: colors.textTertiary }]}>
                        {exSets.length} set{exSets.length > 1 ? 's' : ''}
                        {maxW > 0 ? ` · ${maxW} kg max` : ''}
                        {exVol > 0 ? ` · ${Math.round(exVol)} kg vol.` : ''}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.recapSetsList}>
                    <View style={styles.recapSetHeader}>
                      <Text style={[styles.recapSetHeaderCell, { color: colors.textTertiary, width: 28 }]}>#</Text>
                      <Text style={[styles.recapSetHeaderCell, { color: colors.textTertiary, flex: 1 }]}>POIDS</Text>
                      <Text style={[styles.recapSetHeaderCell, { color: colors.textTertiary, width: 52, textAlign: 'right' }]}>REPS</Text>
                      <Text style={[styles.recapSetHeaderCell, { color: colors.textTertiary, width: 28, textAlign: 'center' }]}>PR</Text>
                    </View>
                    {exSets.map((s, si) => {
                      const prLevel = s.pr_charge ?? s.pr_serie
                      const prColor = prLevel === 'gold' ? colors.prGold : prLevel === 'silver' ? colors.prSilver : colors.prBronze
                      return (
                        <View
                          key={s.set_number}
                          style={[
                            styles.recapSetRow,
                            si < exSets.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.separator },
                            prLevel != null && { backgroundColor: `${prColor}10` },
                          ]}
                        >
                          <Text style={[styles.recapSetNum, { color: colors.textSecondary }]}>{s.set_number}</Text>
                          <Text style={[styles.recapSetWeight, { color: colors.textPrimary, flex: 1 }]}>
                            {s.weight_kg > 0 ? `${s.weight_kg} kg` : 'Poids corps'}
                          </Text>
                          <Text style={[styles.recapSetReps, { color: colors.textPrimary }]}>{s.reps}</Text>
                          <View style={styles.recapSetPr}>
                            {prLevel != null && <View style={[styles.recapPrDot, { backgroundColor: prColor }]} />}
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              )
            })}
          </Animated.View>
        )}

        {/* ── Photo ── */}
        <Animated.View style={[styles.section, style4]}>
          <SectionHeader label="PHOTO" colors={colors} />
          <TouchableOpacity
            style={[
              styles.photoButton,
              { borderColor: colors.border, backgroundColor: colors.backgroundSecondary },
              photoUri ? styles.photoButtonFilled : null,
            ]}
            onPress={handlePickPhoto}
            activeOpacity={0.8}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            ) : (
              <View style={styles.photoPlaceholder}>
                <View style={[styles.photoIconWrap, { backgroundColor: colors.backgroundTertiary }]}>
                  <Camera size={22} color={colors.textSecondary} />
                </View>
                <Text style={[styles.photoPlaceholderText, { color: colors.textSecondary }]}>
                  Ajouter une photo
                </Text>
                <Text style={[styles.photoPlaceholderSub, { color: colors.textTertiary }]}>
                  Optionnel · Galerie
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Partager ── */}
        <Animated.View style={[styles.section, style4]}>
          <View style={[styles.shareRow, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={styles.shareLeft}>
              <Text style={[styles.shareLabel, { color: colors.textPrimary }]}>Partager</Text>
              <Text style={[styles.shareSub, { color: colors.textTertiary }]}>
                {isPublic ? 'Visible dans le feed' : 'Séance privée'}
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.switchBackground, true: colors.accent }}
              thumbColor={isPublic ? colors.background : colors.textPrimary}
              ios_backgroundColor={colors.switchBackground}
            />
          </View>
        </Animated.View>

        {/* ── Erreur ── */}
        {saveError && (
          <View style={[styles.errorBox, { backgroundColor: `${colors.error}18`, borderColor: `${colors.error}35` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{saveError}</Text>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.accent }, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.background }]}>SAUVEGARDER</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, { color: colors.textTertiary }]}>ANNULER LA SÉANCE</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s12,
  },

  // Header
  dateCaption: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s2,
  },
  workoutTitle: {
    fontSize: 28,
    fontFamily: font.extraBold,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: spacing.s1,
  },

  // Volume hero block
  heroBlock: {
    marginTop: spacing.s5,
  },
  heroLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s2,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s2,
    marginBottom: spacing.s4,
  },
  heroValue: {
    fontSize: 64,
    fontFamily: font.black,
    letterSpacing: -2,
    lineHeight: 68,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: 32,
    fontFamily: font.bold,
    letterSpacing: -0.5,
    lineHeight: 68,
    paddingBottom: 6,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  statPill: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.sm,
    alignItems: 'center',
    minWidth: 60,
  },
  statPillValue: {
    fontSize: 15,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  statPillLabel: {
    fontSize: 10,
    fontFamily: font.medium,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 1,
  },

  // Divider
  divider: {
    height: 1,
    marginVertical: spacing.s6,
  },

  // Sections
  section: {
    marginTop: spacing.s6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginBottom: spacing.s3,
  },
  sectionDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  sectionLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // PR rows
  prList: {
    gap: spacing.s2,
  },
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderRadius: radius.lg,
    minHeight: 64,
    overflow: 'hidden',
  },
  prRowAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  prRowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginLeft: spacing.s1,
  },
  prRowContent: {
    flex: 1,
    gap: 2,
  },
  prRowTypeLabel: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  prRowValueText: {
    fontSize: 22,
    fontFamily: font.black,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  prRowSubtitle: {
    fontSize: 11,
    fontFamily: font.regular,
    marginTop: 2,
    letterSpacing: 0.1,
  },
  prRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  prRowChevron: {
    fontSize: 20,
    lineHeight: 22,
    fontFamily: font.bold,
    marginLeft: 2,
  },
  prLevelPill: {
    paddingHorizontal: spacing.s2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  prLevelPillText: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 1.2,
  },

  // Muscle section
  muscleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s3,
  },
  muscleLegend: {
    flexDirection: 'row',
    gap: spacing.s3,
    alignItems: 'center',
  },
  muscleLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  muscleLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  muscleLegendLabel: {
    fontSize: 11,
    fontFamily: font.medium,
    letterSpacing: 0.3,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  muscleLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    width: 84,
  },
  muscleBarTrack: {
    // width set inline
  },
  muscleBarBg: {
    height      : MUSCLE_BAR_H,
    borderRadius: MUSCLE_BAR_RADIUS,
    overflow    : 'hidden',
  },
  muscleBarAnimWrap: {
    height      : MUSCLE_BAR_H,
    overflow    : 'hidden',
    borderRadius: MUSCLE_BAR_RADIUS,
  },
  muscleBarFill: {
    height      : '100%',
    borderRadius: MUSCLE_BAR_RADIUS,
  },
  musclePct: {
    fontSize: 12,
    fontFamily: font.bold,
    width: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },

  // Récap exercices
  recapCard: {
    borderRadius: radius.md,
    marginBottom: spacing.s3,
    overflow: 'hidden',
  },
  recapExHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    gap: spacing.s3,
  },
  recapIdx: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recapIdxText: {
    fontSize: 11,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
  },
  recapExInfo: {
    flex: 1,
  },
  recapExName: {
    fontSize: 14,
    fontFamily: font.bold,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  recapExMeta: {
    fontSize: 11,
    fontFamily: font.regular,
    marginTop: 1,
  },
  recapSetsList: {
    paddingHorizontal: spacing.s3,
    paddingBottom: spacing.s3,
  },
  recapSetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.s2,
    gap: spacing.s2,
  },
  recapSetHeaderCell: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  recapSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: spacing.s2,
  },
  recapSetNum: {
    fontSize: 12,
    fontFamily: font.mono,
    fontVariant: ['tabular-nums'],
    width: 28,
  },
  recapSetWeight: {
    fontSize: 13,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  recapSetReps: {
    fontSize: 13,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    width: 52,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  recapSetPr: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapPrDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  // Photo
  photoButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    overflow: 'hidden',
    minHeight: 100,
    justifyContent: 'center',
  },
  photoButtonFilled: {
    borderStyle: 'solid',
    borderWidth: 0,
  },
  photoPreview: {
    width: '100%',
    height: 180,
  },
  photoPlaceholder: {
    alignItems: 'center',
    paddingVertical: spacing.s5,
    gap: spacing.s2,
  },
  photoIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s1,
  },
  photoPlaceholderText: {
    fontSize: 14,
    fontFamily: font.medium,
  },
  photoPlaceholderSub: {
    ...typography.caption,
  },

  // Share row
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderRadius: radius.lg,
    minHeight: touchTarget.comfort,
  },
  shareLeft: {
    gap: 2,
  },
  shareLabel: {
    fontSize: 15,
    fontFamily: font.bold,
  },
  shareSub: {
    ...typography.caption,
  },

  // Error
  errorBox: {
    marginTop: spacing.s4,
    borderRadius: radius.md,
    padding: spacing.s4,
    borderWidth: 1,
  },
  errorText: {
    ...typography.caption,
  },

  // Footer
  footer: {
    marginTop: spacing.s8,
    gap: spacing.s1,
  },
  saveButton: {
    height: touchTarget.hero,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.s2,
  },
saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: font.black,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  cancelButton: {
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 12,
    fontFamily: font.medium,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
})
