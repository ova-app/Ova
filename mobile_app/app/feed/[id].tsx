import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  useWindowDimensions,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Share2, MoreVertical, Heart, MessageCircle, X, Send, HelpCircle } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font, duration } from '@/constants/theme'
import { prBadgeRecipe, type PrType } from '@/constants/recipes'
import MyoOrb, { FAMILY_NAMES, SECTOR_COLORS_HEX } from '@/app/workout/myo-orb'
import { sessionValuesFromSignature } from '@/lib/myo'
import { Zap, Flame, Dumbbell, Trophy } from 'lucide-react-native'
import Svg, { Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg'

// ─── Score hero avec dégradé arc-en-ciel (interpolation 8 couleurs familles) ──
function GradientScoreText({ score }: { score: number }) {
  const size = 80
  return (
    <Svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
      <Defs>
        <LinearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          {SECTOR_COLORS_HEX.map((color, i) => (
            <Stop
              key={i}
              offset={`${(i / (SECTOR_COLORS_HEX.length - 1)) * 100}%`}
              stopColor={color}
            />
          ))}
        </LinearGradient>
      </Defs>
      <SvgText
        x={size / 2}
        y={size * 0.58}
        textAnchor="middle"
        fill="url(#scoreGrad)"
        fontSize={size * 0.62}
        fontWeight="900"
      >
        {String(score)}
      </SvgText>
    </Svg>
  )
}

// ─── PR Badge (unified) ──────────────────────────────────────────────────────

const PR_ICON: Record<PrType, React.ComponentType<{ size?: number; color?: string }>> = {
  charge:   Zap,
  serie:    Flame,
  exercice: Dumbbell,
  seance:   Trophy,
}

function PrBadge({
  level,
  type,
  label,
  size = 14,
}: {
  level: 'gold' | 'silver' | 'bronze'
  type: PrType
  label: string
  size?: number
}) {
  const { colors } = useTheme()
  const r = prBadgeRecipe(level, type, colors)
  const Icon = PR_ICON[type]
  return (
    <View style={r.container}>
      <Icon size={size} color={r.iconColor} />
      <Text style={r.label}>{label}</Text>
    </View>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

type PrLevel = 'gold' | 'silver' | 'bronze' | null

interface FeedWorkoutDetail {
  id: string
  user_id: string
  title: string | null
  started_at: string
  ended_at: string | null
  duration_sec: number | null
  total_volume_kg: number | null
  note: string | null
  photo_url: string | null
  pr_seance: PrLevel
  avg_rest_seconds: number | null
  location_city: string | null
  is_public: boolean
  poids_corps_kg: number | null
  user: {
    id: string
    username: string | null
    full_name: string | null
    avatar_url: string | null
  }
}

interface WorkoutMetricsData {
  [key: string]: any
}

interface SetRow {
  id: string
  set_number: number
  set_type: string
  reps: number | null
  weight_kg: number | null
  rest_seconds: number | null
  pr_charge: PrLevel
  pr_serie: PrLevel
}

interface ExerciseWithSets {
  workoutExerciseId: string
  exerciseId: string
  nameFr: string
  orderIndex: number
  pr_exercice: PrLevel
  sets: SetRow[]
}

interface MuscleBar {
  muscleLabel: string
  pct: number
}

interface CommentRow {
  id: string
  content: string
  created_at: string
  user_id: string
  users: {
    username: string | null
    full_name: string | null
    avatar_url: string | null
  } | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' })
  const day = d.toLocaleDateString('fr-FR', { day: 'numeric' })
  const month = d.toLocaleDateString('fr-FR', { month: 'long' })
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${month.charAt(0).toUpperCase() + month.slice(1)}`
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  return `${m}min`
}

function formatVolume(kg: number | null): string {
  if (kg == null) return '—'
  const rounded = Math.round(kg)
  if (rounded >= 1000) {
    const thousands = Math.floor(rounded / 1000)
    const remainder = rounded % 1000
    return `${thousands} ${String(remainder).padStart(3, '0')} kg`
  }
  return `${rounded} kg`
}

function totalSets(exercises: ExerciseWithSets[]): number {
  return exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
}

const MUSCLE_LABEL_MAP: Record<string, string> = {
  grand_pectoral: 'Pectoraux',
  deltoide: 'Deltoïdes',
  grand_dorsal: 'Grand dorsal',
  trapeze: 'Trapèze',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quadriceps: 'Quadriceps',
  ischio_jambiers: 'Ischio-jambiers',
  fessier_maximus: 'Fessiers',
  fessier_median: 'Fessiers',
  fessier_minimus: 'Fessiers',
  mollets: 'Mollets',
  abdominaux: 'Core',
  grand_rond: 'Grand rond',
  rhomboide: 'Rhomboïdes',
  erecteurs_rachis: 'Érecteurs rachis',
  avant_bras: 'Avant-bras',
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return 'À l\'instant'
  if (diffMins < 60) return `${diffMins}min`
  if (diffHours < 24) return `${diffHours}h`
  if (diffDays < 7) return `${diffDays}j`
  return d.toLocaleDateString('fr-FR')
}

// ─── Récap séance ────────────────────────────────────────────────────────────

function formatRestTime(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function formatExVol(kg: number): string {
  const r = Math.round(kg)
  if (r >= 1000) return `${Math.floor(r / 1000)} ${String(r % 1000).padStart(3, '0')} kg`
  return `${r} kg`
}

function RecapSection({
  exercises,
  colors,
}: {
  exercises: ExerciseWithSets[]
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={recapS.wrapper}>
      <Text style={[recapS.sectionTitle, { color: colors.textTertiary }]}>RÉCAP SÉANCE</Text>
      {exercises.map((ex, idx) => {
        const workingSets = ex.sets.filter(s => s.set_type !== 'warmup')
        const totalVol = workingSets.reduce((s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0)
        const maxWeight = Math.max(...ex.sets.map(s => s.weight_kg ?? 0), 0)
        const nbSets = workingSets.length

        const restsValid = workingSets.filter(s => (s.rest_seconds ?? 0) > 0)
        const avgRest = restsValid.length
          ? Math.round(restsValid.reduce((s, set) => s + (set.rest_seconds ?? 0), 0) / restsValid.length)
          : null

        const bestSet = workingSets.length > 0
          ? workingSets.reduce((best, s) => {
              const vol = (s.weight_kg ?? 0) * (s.reps ?? 0)
              const bestVol = (best.weight_kg ?? 0) * (best.reps ?? 0)
              return vol > bestVol ? s : best
            })
          : null

        const prColor =
          ex.pr_exercice === 'gold' ? colors.prGold :
          ex.pr_exercice === 'silver' ? colors.prSilver :
          ex.pr_exercice === 'bronze' ? colors.prBronze :
          null

        return (
          <View key={ex.workoutExerciseId} style={[recapS.card, { backgroundColor: colors.backgroundSecondary }]}>
            {/* Header */}
            <View style={recapS.cardHeader}>
              <View style={[recapS.indexBadge, { backgroundColor: colors.backgroundTertiary }]}>
                <Text style={[recapS.indexText, { color: colors.textTertiary }]}>
                  {String(idx + 1).padStart(2, '0')}
                </Text>
              </View>
              <Text style={[recapS.exName, { color: colors.textPrimary }]} numberOfLines={1}>
                {ex.nameFr}
              </Text>
              {prColor && (
                <View style={[recapS.prDot, { backgroundColor: prColor }]} />
              )}
            </View>

            {/* Séparateur */}
            <View style={[recapS.sep, { backgroundColor: colors.separator }]} />

            {/* 4 stats */}
            <View style={recapS.statsRow}>
              <View style={recapS.statCell}>
                <Text style={[recapS.statValue, { color: colors.textPrimary }]} allowFontScaling={false}>
                  {totalVol > 0 ? formatExVol(totalVol) : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>VOLUME</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text style={[recapS.statValue, { color: colors.textPrimary }]} allowFontScaling={false}>
                  {nbSets}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>SÉRIES</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text style={[recapS.statValue, { color: colors.textPrimary }]} allowFontScaling={false}>
                  {avgRest != null ? formatRestTime(avgRest) : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>REPOS MOY.</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text style={[recapS.statValue, { color: colors.textPrimary }]} allowFontScaling={false}>
                  {maxWeight > 0 ? `${maxWeight} kg` : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>MAX</Text>
              </View>
            </View>

            {/* Meilleure série */}
            {bestSet != null && (bestSet.reps ?? 0) > 0 && (
              <>
                <View style={[recapS.sep, { backgroundColor: colors.separator }]} />
                <View style={recapS.bestRow}>
                  <Text style={[recapS.bestLabel, { color: colors.textTertiary }]}>MEILLEURE SÉRIE</Text>
                  <Text style={[recapS.bestValue, { color: colors.accent }]} allowFontScaling={false}>
                    {bestSet.reps} reps × {bestSet.weight_kg} kg
                  </Text>
                </View>
              </>
            )}
          </View>
        )
      })}
    </View>
  )
}

const recapS = StyleSheet.create({
  wrapper: {
    paddingHorizontal: spacing.s4,
    marginBottom: spacing.s6,
  },
  sectionTitle: {
    ...typography.caption,
    fontFamily: font.bold,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: spacing.s4,
  },
  card: {
    borderRadius: radius.md,
    marginBottom: spacing.s3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    gap: spacing.s3,
  },
  indexBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indexText: {
    fontSize: 11,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
  },
  exName: {
    flex: 1,
    fontSize: 14,
    fontFamily: font.bold,
    letterSpacing: -0.2,
    lineHeight: 18,
  },
  prDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  sep: {
    height: 1,
    marginHorizontal: spacing.s3,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: spacing.s3,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.s1,
  },
  statValue: {
    fontSize: 13,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 9,
    fontFamily: font.medium,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: spacing.s2,
    opacity: 0.5,
  },
  bestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
  },
  bestLabel: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  bestValue: {
    fontSize: 13,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
})

// ─── Chip famille ────────────────────────────────────────────────────────────

const chipBaseStyle = {
  paddingHorizontal: spacing.s3,
  paddingVertical  : 5,
  borderRadius     : radius.full,
  borderWidth      : 1,
  alignItems       : 'center' as const,
  justifyContent   : 'center' as const,
}
const chipLabelBase = {
  fontSize     : 9,
  fontFamily   : font.bold,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
}

function FamilyChip({
  name, color, isActive, anyActive, onPress,
}: {
  name: string; index: number; color: string
  isActive: boolean; anyActive: boolean; onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipBaseStyle,
        {
          borderColor    : color,
          backgroundColor: isActive ? `${color}22` : 'transparent',
          opacity        : anyActive && !isActive ? 0.42 : 1,
        },
      ]}
    >
      <Text style={[chipLabelBase, { color: isActive ? color : `${color}99` }]} numberOfLines={1}>
        {name}
      </Text>
    </Pressable>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FeedDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const router = useRouter()
  const { width: screenWidth } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const [workout, setWorkout] = useState<FeedWorkoutDetail | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([])
  const [muscleBars, setMuscleBars] = useState<MuscleBar[]>([])
  const [likes, setLikes] = useState<number>(0)
  const [hasLiked, setHasLiked] = useState<boolean>(false)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null)
  const [sessionValues, setSessionValues] = useState<number[][] | undefined>(undefined)
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false)
  const [newComment, setNewComment] = useState<string>('')
  const [selectedFamily, setSelectedFamily] = useState<number | null>(null)
  const [myoFullscreen, setMyoFullscreen] = useState<boolean>(false)

  const familyScores = useMemo(() => {
    if (!sessionValues) return new Array(8).fill(0) as number[]
    return sessionValues.map(fam =>
      Math.round((fam.reduce((s, v) => s + v, 0) / fam.length) * 100)
    )
  }, [sessionValues])

  const globalScore = useMemo(() => {
    if (!sessionValues) return 0
    const sum = sessionValues.reduce((acc, fam) => acc + fam.reduce((s, v) => s + v, 0) / fam.length, 0)
    return Math.round((sum / sessionValues.length) * 100)
  }, [sessionValues])
  const scoreColor = globalScore >= 66 ? '#FAC775' : globalScore >= 33 ? '#D85A30' : '#8E8E93'

  const openMyoFullscreen = useCallback(() => {
    setMyoFullscreen(true)
  }, [])

  const fetchWorkout = useCallback(async (): Promise<void> => {
    if (!id) return

    // Workout
    const { data: wData, error: wError } = await supabase
      .from('workouts')
      .select(`
        id, user_id, title, started_at, ended_at, duration_sec, total_volume_kg,
        note, photo_url, pr_seance, avg_rest_seconds, location_city, is_public,
        poids_corps_kg,
        user:user_id(id, username, full_name, avatar_url)
      `)
      .eq('id', id)
      .single()

    if (wError || !wData) {
      console.error('fetchWorkout error:', wError)
      setLoading(false)
      return
    }

    // Cast
    const wTyped = wData as unknown as {
      id: string
      user_id: string
      title: string | null
      started_at: string
      ended_at: string | null
      duration_sec: number | null
      total_volume_kg: number | null
      note: string | null
      photo_url: string | null
      pr_seance: PrLevel
      avg_rest_seconds: number | null
      location_city: string | null
      is_public: boolean
      poids_corps_kg: number | null
      user: Array<{
        id: string
        username: string | null
        full_name: string | null
        avatar_url: string | null
      }> | {
        id: string
        username: string | null
        full_name: string | null
        avatar_url: string | null
      } | null
    }

    const userRaw = wTyped.user
    const userObj = Array.isArray(userRaw)
      ? (userRaw[0] ?? null)
      : userRaw

    const workoutData: FeedWorkoutDetail = {
      id: wTyped.id,
      user_id: wTyped.user_id,
      title: wTyped.title,
      started_at: wTyped.started_at,
      ended_at: wTyped.ended_at,
      duration_sec: wTyped.duration_sec,
      total_volume_kg: wTyped.total_volume_kg,
      note: wTyped.note,
      photo_url: wTyped.photo_url,
      pr_seance: wTyped.pr_seance,
      avg_rest_seconds: wTyped.avg_rest_seconds,
      location_city: wTyped.location_city,
      is_public: wTyped.is_public,
      poids_corps_kg: wTyped.poids_corps_kg,
      user: userObj ?? { id: '', username: null, full_name: null, avatar_url: null },
    }
    setWorkout(workoutData)

    // Exercises + sets
    const { data: weData } = await supabase
      .from('workout_exercises')
      .select(`
        id, exercise_id, order_index, pr_exercice,
        exercises!inner(name_fr),
        workout_sets(id, set_number, set_type, reps, weight_kg, rest_seconds, pr_charge, pr_serie)
      `)
      .eq('workout_id', id)
      .order('order_index')

    if (weData) {
      type WeRow = {
        id: string
        exercise_id: string
        order_index: number
        pr_exercice: string | null
        exercises: { name_fr: string }[] | { name_fr: string }
        workout_sets: SetRow[] | null
      }
      const exs: ExerciseWithSets[] = (weData as WeRow[]).map(we => {
        const exRaw = we.exercises
        const exObj = Array.isArray(exRaw) ? exRaw[0] : exRaw
        return {
          workoutExerciseId: we.id,
          exerciseId: we.exercise_id,
          nameFr: exObj.name_fr,
          orderIndex: we.order_index,
          pr_exercice: (we.pr_exercice as PrLevel) ?? null,
          sets: ((we.workout_sets ?? []) as SetRow[]).sort((a, b) => a.set_number - b.set_number),
        }
      })
      setExercises(exs)

      // Muscle bars
      const exerciseIds = exs.map(e => e.exerciseId)
      const { data: emData } = await supabase
        .from('exercise_muscles')
        .select('exercise_id, muscle, role, activation_pct')
        .in('exercise_id', exerciseIds)
        .in('role', ['primary', 'secondary'])

      if (emData) {
        const muscleVol: Record<string, number> = {}

        for (const em of emData) {
          const ex = exs.find(e => e.exerciseId === em.exercise_id)
          if (!ex) continue
          const vol = ex.sets.reduce((sum, s) => {
            return sum + (s.weight_kg ?? 0) * (s.reps ?? 0) * ((em.activation_pct ?? 0) / 100)
          }, 0)
          const label = MUSCLE_LABEL_MAP[em.muscle as string] ?? (em.muscle as string)
          muscleVol[label] = (muscleVol[label] ?? 0) + vol
        }

        const maxVol = Math.max(...Object.values(muscleVol), 1)
        const bars: MuscleBar[] = Object.entries(muscleVol)
          .map(([muscleLabel, vol]) => ({
            muscleLabel,
            pct: Math.round((vol / maxVol) * 100),
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 6)

        setMuscleBars(bars)
      }
    }

    // Likes
    const { data: likeData, count: likeCount } = await supabase
      .from('likes')
      .select('*', { count: 'exact' })
      .eq('workout_id', id)

    if (likeCount !== null) {
      setLikes(likeCount)
    }

    // Comments
    const { data: commentData } = await supabase
      .from('comments')
      .select(`
        id, content, created_at, user_id,
        users(username, full_name, avatar_url)
      `)
      .eq('workout_id', id)
      .order('created_at', { ascending: false })

    if (commentData) {
      type CommentRaw = {
        id: string
        content: string
        created_at: string
        user_id: string
        users: Array<{
          username: string | null
          full_name: string | null
          avatar_url: string | null
        }>
      }
      const typedComments: CommentRow[] = (commentData as unknown as CommentRaw[]).map(c => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        users: Array.isArray(c.users) && c.users.length > 0 ? c.users[0] : null,
      }))
      setComments(typedComments)
    }

    // Myo signature — données réelles
    const { data: myoRow } = await supabase
      .from('myo_signatures')
      .select('z_volume, z_intensite, z_structure, z_recovery, z_performance, z_regularite, z_extended')
      .eq('workout_id', id)
      .maybeSingle()

    if (myoRow) {
      setSessionValues(sessionValuesFromSignature(myoRow as {
        z_volume: number; z_intensite: number; z_structure: number
        z_recovery: number; z_performance: number; z_regularite: number
        z_extended: Record<string, unknown>
      }))
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    void fetchWorkout()
  }, [fetchWorkout])

  const s = buildStyles(colors)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={s.loader}>
        <Text style={{ color: colors.textSecondary, ...typography.body }}>Séance introuvable.</Text>
      </View>
    )
  }

  const nSets = totalSets(exercises)

  // PR badges
  const hasPrSeance = workout.pr_seance != null
  const prExercises = exercises.filter(ex => ex.pr_exercice != null)
  const prChargeEx = exercises.find(ex => ex.sets.some(s => s.pr_charge != null))
  const prSerieEx = exercises.find(ex => ex.sets.some(s => s.pr_serie != null))

  const bestLevel = (vals: Array<'gold' | 'silver' | 'bronze' | null>): 'gold' | 'silver' | 'bronze' | null => {
    if (vals.includes('gold')) return 'gold'
    if (vals.includes('silver')) return 'silver'
    if (vals.includes('bronze')) return 'bronze'
    return null
  }

  const prChargeLevel = prChargeEx ? bestLevel(prChargeEx.sets.map(s => s.pr_charge)) : null
  const prSerieLevel = prSerieEx ? bestLevel(prSerieEx.sets.map(s => s.pr_serie)) : null

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <View>
        {/* ── Header ── */}
        <View style={[s.header, { paddingTop: insets.top + spacing.s2 }]}>
          <Pressable
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>

          <Text style={s.headerDate} numberOfLines={1}>
            {formatDate(workout.started_at)}
          </Text>

          <Pressable style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]} hitSlop={8}>
            <Share2 size={20} color={colors.textPrimary} />
          </Pressable>
        </View>

        {/* ── User row ── */}
        <View style={s.userRow}>
          <View style={[s.userAvatar, { backgroundColor: colors.backgroundSecondary }]}>
            {workout.user.avatar_url ? (
              <Image
                source={{ uri: workout.user.avatar_url }}
                style={s.userAvatarImg}
                accessibilityLabel="Avatar utilisateur"
              />
            ) : (
              <Text style={s.userAvatarInit}>
                {(workout.user.full_name?.[0] ?? workout.user.username?.[0] ?? 'U').toUpperCase()}
              </Text>
            )}
          </View>

          <View style={s.userInfo}>
            <Text style={s.userName} numberOfLines={1}>
              {workout.user.full_name || workout.user.username || 'Utilisateur'}
            </Text>
            {workout.location_city ? (
              <Text style={s.userHandle} numberOfLines={1}>
                {workout.location_city}
              </Text>
            ) : (
              <Text style={s.userHandle} numberOfLines={1}>
                @{workout.user.username || 'user'}
              </Text>
            )}
          </View>

          <Pressable style={({ pressed }) => [s.menuBtn, pressed && { opacity: 0.6 }]} hitSlop={8}>
            <MoreVertical size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* ── Titre séance ── */}
        {workout.title && (
          <View style={s.titleBlock}>
            <Text style={s.workoutTitle} numberOfLines={2}>{workout.title}</Text>
          </View>
        )}

        {/* ── Hero stats — toujours visibles ── */}
        <View style={s.heroBlock}>
          <Text style={s.heroLabel}>VOLUME TOTAL</Text>
          <View style={s.heroRow}>
            <Text style={[s.heroValue, { color: colors.accent }]} allowFontScaling={false}>
              {formatVolume(workout.total_volume_kg)}
            </Text>
          </View>
          <View style={s.statChips}>
            <View style={[s.statChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[s.chipValue, { color: colors.textPrimary }]}>{formatDuration(workout.duration_sec)}</Text>
              <Text style={[s.chipLabel, { color: colors.textTertiary }]}>DURÉE</Text>
            </View>
            <View style={[s.statChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[s.chipValue, { color: colors.textPrimary }]}>{nSets}</Text>
              <Text style={[s.chipLabel, { color: colors.textTertiary }]}>SETS</Text>
            </View>
            <View style={[s.statChip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[s.chipValue, { color: colors.textPrimary }]}>
                {workout.avg_rest_seconds ? `${Math.round(workout.avg_rest_seconds)}s` : '—'}
              </Text>
              <Text style={[s.chipLabel, { color: colors.textTertiary }]}>REPOS</Text>
            </View>
          </View>
        </View>

        {/* ── PRs — toujours visibles ── */}
        {(hasPrSeance || prChargeEx != null || prSerieEx != null) && (
          <View style={s.prsBlock}>
            {hasPrSeance && workout.pr_seance && (
              <PrBadge level={workout.pr_seance} type="seance" label="PR Séance" size={13} />
            )}
            {prChargeEx != null && prChargeLevel && (
              <PrBadge level={prChargeLevel} type="charge" label={`Charge · ${prChargeEx.nameFr}`} size={13} />
            )}
            {prSerieEx != null && prSerieEx !== prChargeEx && prSerieLevel && (
              <PrBadge level={prSerieLevel} type="serie" label={`Série · ${prSerieEx.nameFr}`} size={13} />
            )}
          </View>
        )}

        {/* ── Note ── */}
        {workout.note && (
          <View style={s.noteBlock}>
            <Text style={[s.noteText, { color: colors.textSecondary }]}>{workout.note}</Text>
          </View>
        )}

        {/* ── Photo ── */}
        {workout.photo_url && (
          <Pressable
            onPress={() => setPhotoLightbox(workout.photo_url!)}
            style={s.photoBlock}
          >
            <Image
              source={{ uri: workout.photo_url }}
              style={s.photoImage}
              accessibilityLabel="Photo de séance"
            />
          </Pressable>
        )}

        {/* ── Séparateur ── */}
        <View style={[s.divider, { backgroundColor: colors.separator }]} />

        {/* ── Myo Orb (miniature cliquable) ── */}
        <View style={s.myoSection}>
          <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MYO</Text>
          <Pressable
            style={({ pressed }) => [s.myoMiniCard, { backgroundColor: colors.backgroundSecondary, opacity: pressed ? 0.85 : 1 }]}
            onPress={openMyoFullscreen}
            accessibilityRole="button"
            accessibilityLabel="Voir le graphe Myo en grand"
          >
            <View pointerEvents="none" style={s.myoMiniOrb}>
              <MyoOrb
                sessionValues={sessionValues}
                size={140}
                selectedFamily={null}
                onFamilySelect={() => {}}
                bgColor={colors.backgroundSecondary}
                showScore={false}
                showLabels={false}
              />
            </View>
            <View style={s.myoMiniInfo}>
              <Text style={[s.myoMiniTitle, { color: colors.textPrimary }]}>Signature Myo</Text>
              <Text style={[s.myoMiniSub, { color: colors.textSecondary }]}>8 familles · Tap pour détailler</Text>
              <View style={s.myoColorStrip}>
                {SECTOR_COLORS_HEX.map((c, i) => (
                  <View key={i} style={[s.myoColorSegment, { backgroundColor: c }]} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
                <Text style={[s.myoMiniTitle, { color: scoreColor, fontSize: 22, fontVariant: ['tabular-nums'] }]}>
                  {globalScore}
                </Text>
                <Text style={[s.myoMiniSub, { color: colors.textTertiary, fontSize: 11 }]}>/ 100</Text>
              </View>
            </View>
          </Pressable>
        </View>

        {/* ── Muscles travaillés ── */}
        {muscleBars.length > 0 && (
          <View style={s.section}>
            <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>MUSCLES TRAVAILLÉS</Text>
            {muscleBars.map((bar, idx) => (
              <View key={idx} style={s.muscleRow}>
                <Text style={[s.muscleLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                  {bar.muscleLabel}
                </Text>
                <View style={[s.muscleBarTrack, { backgroundColor: colors.backgroundTertiary }]}>
                  <View style={[s.muscleBarFill, { width: `${bar.pct}%`, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[s.musclePct, { color: colors.accent }]}>
                  {bar.pct}%
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Récap séance ── */}
        {exercises.length > 0 && (
          <RecapSection exercises={exercises} colors={colors} />
        )}
      </View>
      </ScrollView>

      {/* ── Bottom bar — like + commentaires ── */}
      <View style={[s.bottomBar, { backgroundColor: colors.background, borderTopColor: colors.separator, paddingBottom: insets.bottom + spacing.s2 }]}>
        <Pressable
          style={({ pressed }) => [s.bottomAction, pressed && { opacity: 0.7 }]}
          onPress={() => setHasLiked(!hasLiked)}
        >
          <Heart
            size={17}
            color={hasLiked ? '#FF3B30' : colors.textSecondary}
            fill={hasLiked ? '#FF3B30' : 'none'}
          />
          <Text style={[s.bottomCount, { color: hasLiked ? '#FF3B30' : colors.textSecondary }]}>
            {likes + (hasLiked ? 1 : 0)}
          </Text>
          <Text style={[s.bottomActionLabel, { color: hasLiked ? '#FF3B30' : colors.textTertiary }]}>
            J'AIME
          </Text>
        </Pressable>

        <View style={[s.bottomSep, { backgroundColor: colors.separator }]} />

        <Pressable
          style={({ pressed }) => [s.bottomAction, pressed && { opacity: 0.7 }]}
          onPress={() => setCommentsOpen(true)}
        >
          <MessageCircle size={17} color={colors.textSecondary} />
          <Text style={[s.bottomCount, { color: colors.textSecondary }]}>
            {comments.length}
          </Text>
          <Text style={[s.bottomActionLabel, { color: colors.textTertiary }]}>
            COMMENTAIRES
          </Text>
        </Pressable>
      </View>

      {/* ── Modal commentaires (bottom-sheet) ── */}
      <Modal
        visible={commentsOpen}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setCommentsOpen(false)}
      >
        <View style={{ flex: 1 }}>
          <Pressable style={s.commentsOverlay} onPress={() => setCommentsOpen(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[s.commentsSheet, { backgroundColor: colors.backgroundSecondary, paddingBottom: insets.bottom }]}
          >
            <View style={[s.commentsHandle, { backgroundColor: colors.textTertiary }]} />

            <View style={s.commentsHeaderRow}>
              <Text style={[s.commentsTitle, { color: colors.textPrimary }]}>
                {`Commentaires${comments.length > 0 ? ` · ${comments.length}` : ''}`}
              </Text>
              <Pressable onPress={() => setCommentsOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={s.commentsList} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <Text style={[s.commentsEmpty, { color: colors.textTertiary }]}>
                  Aucun commentaire.
                </Text>
              ) : comments.map(comment => (
                <View key={comment.id} style={[s.commentCard, { borderBottomColor: colors.separator }]}>
                  <View style={[s.commentAvatar, { backgroundColor: colors.backgroundTertiary }]}>
                    {comment.users?.avatar_url ? (
                      <Image source={{ uri: comment.users.avatar_url }} style={s.commentAvatarImg} />
                    ) : (
                      <Text style={[s.commentAvatarInit, { color: colors.textPrimary }]}>
                        {(comment.users?.full_name?.[0] ?? comment.users?.username?.[0] ?? 'U').toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={s.commentBody}>
                    <View style={s.commentHeaderRow}>
                      <Text style={[s.commentAuthor, { color: colors.textPrimary }]} numberOfLines={1}>
                        {comment.users?.full_name || comment.users?.username || 'Utilisateur'}
                      </Text>
                      <Text style={[s.commentTime, { color: colors.textTertiary }]}>
                        {formatCommentDate(comment.created_at)}
                      </Text>
                    </View>
                    <Text style={[s.commentText, { color: colors.textSecondary }]}>{comment.content}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={[s.commentInputRow, { borderTopColor: colors.separator }]}>
              <TextInput
                style={[s.commentInputField, { color: colors.textPrimary, backgroundColor: colors.backgroundTertiary }]}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor={colors.textTertiary}
                value={newComment}
                onChangeText={setNewComment}
                multiline={false}
                returnKeyType="send"
              />
              <Pressable
                style={({ pressed }) => [s.commentSend, pressed && { opacity: 0.6 }, !newComment.trim() && { opacity: 0.3 }]}
                disabled={!newComment.trim()}
              >
                <Send size={17} color={colors.accent} />
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* ── Myo Fullscreen Modal ── */}
      <Modal
        visible={myoFullscreen}
        transparent={false}
        animationType="none"
        onRequestClose={() => setMyoFullscreen(false)}
        statusBarTranslucent
      >
        <View style={[s.myoFsContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={s.myoFsHeader}>
            <Pressable
              style={({ pressed }) => [s.myoFsClose, pressed && { opacity: 0.6 }]}
              onPress={() => router.push('/myo-glossary')}
              hitSlop={8}
              accessibilityLabel="Guide des variables Myo"
            >
              <HelpCircle size={22} color={colors.textSecondary} strokeWidth={1.5} />
            </Pressable>
            <Text style={[s.myoFsTitle, { color: colors.textPrimary }]}>Signature Myo</Text>
            <Pressable
              style={({ pressed }) => [s.myoFsClose, pressed && { opacity: 0.6 }]}
              onPress={() => setMyoFullscreen(false)}
              hitSlop={8}
              accessibilityLabel="Fermer"
            >
              <X size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.myoFsOrb}
            showsVerticalScrollIndicator={false}
          >
            <MyoOrb
              sessionValues={sessionValues}
              size={screenWidth - 32}
              selectedFamily={selectedFamily}
              onFamilySelect={(fi) => setSelectedFamily(fi)}
              bgColor={colors.background}
            />
          </ScrollView>
          <View style={[s.familySelector, { paddingHorizontal: spacing.s4, paddingBottom: spacing.s3 }]}>
            {FAMILY_NAMES.map((name, idx) => (
              <FamilyChip
                key={idx}
                name={name}
                index={idx}
                color={SECTOR_COLORS_HEX[idx]}
                isActive={selectedFamily === idx}
                anyActive={selectedFamily !== null}
                onPress={() => setSelectedFamily(selectedFamily === idx ? null : idx)}
              />
            ))}
          </View>
          {/* Score global hero */}
          <View style={[s.myoFsGlobalScoreBlock, { paddingBottom: insets.bottom + spacing.s2 }]}>
            <View style={s.myoFsGlobalScoreRow}>
              <View style={s.myoFsScoreDivider} />
              <View style={s.myoFsScoreCenter}>
                <GradientScoreText score={globalScore} />
                <Text style={[s.myoFsScoreGlobalLabel, { color: colors.textTertiary }]}>SCORE GLOBAL</Text>
              </View>
              <View style={s.myoFsScoreDivider} />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Photo Lightbox Modal ── */}
      {photoLightbox && (
        <Modal
          visible={true}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setPhotoLightbox(null)}
        >
          <View style={[s.lightboxContainer, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
            <Pressable
              style={s.lightboxClose}
              onPress={() => setPhotoLightbox(null)}
            >
              <X size={28} color={colors.textPrimary} />
            </Pressable>

            <Image
              source={{ uri: photoLightbox }}
              style={s.lightboxImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loader: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.s12,
    },

    // Header
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s4,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerDate: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    headerBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // User row
    userRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
      gap: spacing.s3,
    },
    userAvatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    userAvatarImg: {
      width: '100%',
      height: '100%',
    },
    userAvatarInit: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    userInfo: {
      flex: 1,
    },
    userName: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    userHandle: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.s1,
    },
    menuBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Titre séance
    titleBlock: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s4,
    },
    workoutTitle: {
      fontSize: 22,
      fontFamily: font.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.4,
      lineHeight: 28,
    },

    // Hero stats block
    heroBlock: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s5,
    },
    heroLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginBottom: spacing.s2,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: spacing.s4,
    },
    heroValue: {
      fontSize: 48,
      fontFamily: font.black,
      letterSpacing: -1.5,
      lineHeight: 52,
      fontVariant: ['tabular-nums'],
    },

    // Stat chips
    statChips: {
      flexDirection: 'row',
      gap: spacing.s2,
    },
    statChip: {
      paddingHorizontal: spacing.s3,
      paddingVertical: spacing.s2,
      borderRadius: radius.sm,
      alignItems: 'center',
      minWidth: 64,
    },
    chipValue: {
      fontSize: 15,
      fontFamily: font.bold,
      letterSpacing: -0.3,
      fontVariant: ['tabular-nums'],
    },
    chipLabel: {
      fontSize: 10,
      fontFamily: font.medium,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginTop: 1,
    },

    // PRs block
    prsBlock: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s5,
    },

    // Note
    noteBlock: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s4,
    },
    noteText: {
      ...typography.body,
      fontStyle: 'italic',
    },

    // Photo
    photoBlock: {
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s5,
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    photoImage: {
      width: '100%',
      height: 200,
      resizeMode: 'cover',
    },

    // Divider
    divider: {
      height: 1,
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },

    // Myo section
    myoSection: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    myoMiniCard: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.lg,
      padding: spacing.s3,
      gap: spacing.s4,
    },
    myoMiniOrb: {
      width: 140,
      height: 140,
    },
    myoMiniInfo: {
      flex: 1,
      gap: spacing.s2,
    },
    myoMiniTitle: {
      fontSize: 16,
      fontFamily: font.bold,
      letterSpacing: -0.2,
    },
    myoMiniSub: {
      ...typography.caption,
    },
    myoColorStrip: {
      flexDirection: 'row',
      height: 4,
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: spacing.s2,
    },
    myoColorSegment: {
      flex: 1,
    },
    myoFsGlobalScoreBlock: {
      paddingHorizontal: spacing.s4,
      gap: spacing.s4,
    },
    myoFsGlobalScoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s4,
    },
    myoFsScoreCenter: {
      alignItems: 'center',
      gap: 2,
    },
    myoFsScoreDivider: {
      flex: 1,
      height: 1,
      backgroundColor: 'rgba(255,255,255,0.07)',
    },
    myoFsScoreGlobalLabel: {
      fontSize: 9,
      fontFamily: font.bold,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      marginTop: -4,
    },
    myoFsScoreRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    myoFsScoreItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    myoFsScoreVal: {
      fontSize: 13,
      fontFamily: font.bold,
    },
    myoFsScoreLabel: {
      fontSize: 9,
      fontFamily: font.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    familySelector: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      justifyContent: 'center',
    },
    familyButton: {
      paddingHorizontal: spacing.s3,
      paddingVertical: 5,
      borderRadius: radius.full,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    familyButtonLabel: {
      fontSize: 9,
      fontFamily: font.bold,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    // Myo fullscreen modal
    myoFsContainer: {
      flex: 1,
    },
    myoFsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s4,
    },
    myoFsTitle: {
      fontSize: 18,
      fontFamily: font.bold,
      letterSpacing: -0.3,
    },
    myoFsClose: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    myoFsOrb: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.s4,
    },

    // Section generic
    section: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    sectionTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginBottom: spacing.s4,
    },

    // Muscles
    muscleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.s3,
      gap: spacing.s3,
    },
    muscleLabel: {
      ...typography.caption,
      width: 96,
    },
    muscleBarTrack: {
      flex: 1,
      height: 5,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    muscleBarFill: {
      height: '100%',
      borderRadius: radius.full,
    },
    musclePct: {
      fontFamily: font.mono,
      fontVariant: ['tabular-nums'],
      fontSize: 12,
      width: 36,
      textAlign: 'right',
    },

    // Bottom bar discret
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s3,
      borderTopWidth: 1,
      gap: spacing.s4,
    },
    bottomAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      paddingVertical: spacing.s2,
    },
    bottomCount: {
      fontSize: 13,
      fontFamily: font.bold,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.2,
    },
    bottomActionLabel: {
      fontSize: 10,
      fontFamily: font.medium,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    bottomSep: {
      width: 1,
      height: 16,
      opacity: 0.4,
    },

    // Comments modal
    commentsOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    commentsSheet: {
      maxHeight: '70%',
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingTop: spacing.s3,
    },
    commentsHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: spacing.s4,
      opacity: 0.4,
    },
    commentsHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s4,
    },
    commentsTitle: {
      fontSize: 16,
      fontFamily: font.bold,
      letterSpacing: -0.2,
    },
    commentsList: {
      paddingHorizontal: spacing.s4,
      maxHeight: 340,
    },
    commentsEmpty: {
      ...typography.caption,
      textAlign: 'center',
      paddingVertical: spacing.s8,
    },
    commentCard: {
      flexDirection: 'row',
      gap: spacing.s3,
      marginBottom: spacing.s4,
      paddingBottom: spacing.s4,
      borderBottomWidth: 1,
    },
    commentAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    commentAvatarImg: {
      width: '100%',
      height: '100%',
    },
    commentAvatarInit: {
      fontSize: 10,
      fontFamily: font.bold,
    },
    commentBody: {
      flex: 1,
    },
    commentHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      marginBottom: spacing.s1,
    },
    commentAuthor: {
      ...typography.caption,
      fontFamily: font.bold,
      flex: 1,
    },
    commentTime: {
      fontSize: 10,
      fontFamily: font.regular,
      color: 'transparent',
    },
    commentText: {
      ...typography.caption,
      lineHeight: 18,
    },
    commentInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s3,
      borderTopWidth: 1,
    },
    commentInputField: {
      flex: 1,
      height: 40,
      borderRadius: radius.md,
      paddingHorizontal: spacing.s3,
      fontSize: 14,
      fontFamily: font.regular,
    },
    commentSend: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Lightbox
    lightboxContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxClose: {
      position: 'absolute',
      top: spacing.s4,
      right: spacing.s4,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10,
    },
    lightboxImage: {
      width: '100%',
      height: '100%',
    },
  })
}
