import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { log } from '@/lib/logger'
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
  Share,
  ActionSheetIOS,
  Alert,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  runOnJS,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  ChevronLeft,
  Share2,
  MoreVertical,
  Heart,
  MessageCircle,
  X,
  Send,
  HelpCircle,
} from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { convertFromKg, formatWeight, WeightUnit } from '@/lib/weights'
import {
  spacing,
  radius,
  typography,
  font,
  duration,
  score as scoreScale,
  scrim,
  scrimStrong,
} from '@/constants/theme'
import { type PrType } from '@/constants/recipes'
import MyoChart, {
  FAMILY_NAMES,
  FAMILY_NAMES_SHORT,
  SECTOR_COLORS_HEX,
} from '@/app/workout/myo-chart'
import MyoGlossaryScreen from '@/app/myo-glossary'
import { sessionValuesFromSignature } from '@/lib/myo'
import { formatDuration } from '@/lib/utils'
import { MUSCLE_LABELS } from '@/lib/muscles'
import { Zap, Flame, Dumbbell, Trophy } from 'lucide-react-native'
import Svg, { Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg'

// ─── Score dégradé gris→orange→or ──────────────────────────────────────────
function GradientScoreText({ score, size = 80 }: { score: number; size?: number }) {
  return (
    <Svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`}>
      <Defs>
        <LinearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={scoreScale.low} />
          <Stop offset="50%" stopColor={scoreScale.mid} />
          <Stop offset="100%" stopColor={scoreScale.high} />
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
  charge: Zap,
  serie: Flame,
  exercice: Dumbbell,
  seance: Trophy,
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
  [key: string]: unknown
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

function totalSets(exercises: ExerciseWithSets[]): number {
  return exercises.reduce((sum, ex) => sum + ex.sets.length, 0)
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return "À l'instant"
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

function formatExVol(kg: number, unit: WeightUnit): string {
  const r = Math.round(convertFromKg(kg, unit))
  if (r >= 1000) return `${Math.floor(r / 1000)} ${String(r % 1000).padStart(3, '0')} ${unit}`
  return `${r} ${unit}`
}

const SET_TYPE_LABEL: Record<string, string> = {
  warmup: 'Échauff.',
  working: 'Working',
  dropset: 'Dropset',
  failure: 'Échec',
}

function RecapSection({
  exercises,
  colors,
}: {
  exercises: ExerciseWithSets[]
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const { unit, formatWeight: fmtW } = useWeightUnit()
  const setPrColor = (lvl: PrLevel): string | null =>
    lvl === 'gold'
      ? colors.prGold
      : lvl === 'silver'
        ? colors.prSilver
        : lvl === 'bronze'
          ? colors.prBronze
          : null

  return (
    <View style={recapS.wrapper}>
      <Text style={[recapS.sectionTitle, { color: colors.textTertiary }]}>
        DÉTAIL DES EXOS & SÉRIES
      </Text>
      {exercises.map((ex, idx) => {
        const workingSets = ex.sets.filter((s) => s.set_type !== 'warmup')
        const totalVol = workingSets.reduce(
          (s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0),
          0
        )
        const maxWeight = Math.max(...ex.sets.map((s) => s.weight_kg ?? 0), 0)
        const nbSets = workingSets.length

        const restsValid = workingSets.filter((s) => (s.rest_seconds ?? 0) > 0)
        const avgRest = restsValid.length
          ? Math.round(
              restsValid.reduce((s, set) => s + (set.rest_seconds ?? 0), 0) / restsValid.length
            )
          : null

        const bestSet =
          workingSets.length > 0
            ? workingSets.reduce((best, s) => {
                const vol = (s.weight_kg ?? 0) * (s.reps ?? 0)
                const bestVol = (best.weight_kg ?? 0) * (best.reps ?? 0)
                return vol > bestVol ? s : best
              })
            : null

        const prColor =
          ex.pr_exercice === 'gold'
            ? colors.prGold
            : ex.pr_exercice === 'silver'
              ? colors.prSilver
              : ex.pr_exercice === 'bronze'
                ? colors.prBronze
                : null

        return (
          <View
            key={ex.workoutExerciseId}
            style={[recapS.card, { backgroundColor: colors.backgroundSecondary }]}
          >
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
              {prColor && <View style={[recapS.prDot, { backgroundColor: prColor }]} />}
            </View>

            {/* Séparateur */}
            <View style={[recapS.sep, { backgroundColor: colors.separator }]} />

            {/* 4 stats */}
            <View style={recapS.statsRow}>
              <View style={recapS.statCell}>
                <Text
                  style={[recapS.statValue, { color: colors.textPrimary }]}
                  allowFontScaling={false}
                >
                  {totalVol > 0 ? formatExVol(totalVol, unit) : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>VOLUME</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text
                  style={[recapS.statValue, { color: colors.textPrimary }]}
                  allowFontScaling={false}
                >
                  {nbSets}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>SÉRIES</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text
                  style={[recapS.statValue, { color: colors.textPrimary }]}
                  allowFontScaling={false}
                >
                  {avgRest != null ? formatRestTime(avgRest) : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>REPOS MOY.</Text>
              </View>
              <View style={[recapS.statDivider, { backgroundColor: colors.separator }]} />
              <View style={recapS.statCell}>
                <Text
                  style={[recapS.statValue, { color: colors.textPrimary }]}
                  allowFontScaling={false}
                >
                  {maxWeight > 0 ? fmtW(maxWeight) : '—'}
                </Text>
                <Text style={[recapS.statLabel, { color: colors.textTertiary }]}>MAX</Text>
              </View>
            </View>

            {/* Meilleure série */}
            {bestSet != null && (bestSet.reps ?? 0) > 0 && (
              <>
                <View style={[recapS.sep, { backgroundColor: colors.separator }]} />
                <View style={recapS.bestRow}>
                  <Text style={[recapS.bestLabel, { color: colors.textTertiary }]}>
                    MEILLEURE SÉRIE
                  </Text>
                  <Text
                    style={[recapS.bestValue, { color: colors.accent }]}
                    allowFontScaling={false}
                  >
                    {bestSet.reps} reps × {fmtW(bestSet.weight_kg ?? 0)}
                  </Text>
                </View>
              </>
            )}

            {/* Détail des séries */}
            {ex.sets.length > 0 && (
              <>
                <View style={[recapS.sep, { backgroundColor: colors.separator }]} />
                <View style={recapS.seriesList}>
                  {ex.sets.map((set) => {
                    const chColor = setPrColor(set.pr_charge)
                    const seColor = setPrColor(set.pr_serie)
                    const isWarm = set.set_type === 'warmup'
                    return (
                      <View key={set.id} style={recapS.seriesRow}>
                        <Text style={[recapS.seriesNum, { color: colors.textTertiary }]}>
                          {String(set.set_number).padStart(2, '0')}
                        </Text>
                        <View
                          style={[recapS.typeChip, { backgroundColor: colors.backgroundTertiary }]}
                        >
                          <Text
                            style={[
                              recapS.typeChipTxt,
                              { color: isWarm ? colors.textTertiary : colors.textSecondary },
                            ]}
                          >
                            {SET_TYPE_LABEL[set.set_type] ?? set.set_type}
                          </Text>
                        </View>
                        <Text
                          style={[
                            recapS.seriesVal,
                            { color: isWarm ? colors.textTertiary : colors.textPrimary },
                          ]}
                          allowFontScaling={false}
                        >
                          {set.reps ?? 0} × {fmtW(set.weight_kg ?? 0)}
                        </Text>
                        <View style={recapS.seriesPrs}>
                          {chColor && <Zap size={12} color={chColor} />}
                          {seColor && <Flame size={12} color={seColor} />}
                        </View>
                      </View>
                    )
                  })}
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
  seriesList: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    gap: 2,
  },
  seriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: spacing.s3,
  },
  seriesNum: {
    fontSize: 11,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    width: 20,
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    minWidth: 62,
    alignItems: 'center',
  },
  typeChipTxt: {
    fontSize: 9,
    fontFamily: font.bold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  seriesVal: {
    flex: 1,
    fontSize: 13,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  seriesPrs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 14,
    justifyContent: 'flex-end',
  },
})

// ─── PRs réalisés ──────────────────────────────────────────────────────────────

const PR_TYPE_LABEL: Record<PrType, string> = {
  charge: 'PR Charge',
  serie: 'PR Série',
  exercice: 'PR Exercice',
  seance: 'PR Séance',
}

const PR_LEVEL_SHORT: Record<'gold' | 'silver' | 'bronze', string> = {
  gold: 'OR',
  silver: 'ARGENT',
  bronze: 'BRONZE',
}

interface PrEntry {
  key: string
  type: PrType
  level: 'gold' | 'silver' | 'bronze'
  title: string
  detail: string
}

const LEVEL_RANK: Record<'gold' | 'silver' | 'bronze', number> = { gold: 0, silver: 1, bronze: 2 }

function collectPrs(
  workout: FeedWorkoutDetail,
  exercises: ExerciseWithSets[],
  unit: WeightUnit
): PrEntry[] {
  const out: PrEntry[] = []

  if (workout.pr_seance) {
    out.push({
      key: 'seance',
      type: 'seance',
      level: workout.pr_seance,
      title: 'Séance complète',
      detail: workout.total_volume_kg != null ? formatExVol(workout.total_volume_kg, unit) : '',
    })
  }

  for (const ex of exercises) {
    if (ex.pr_exercice) {
      const vol = ex.sets
        .filter((s) => s.set_type !== 'warmup')
        .reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
      out.push({
        key: `ex-${ex.workoutExerciseId}`,
        type: 'exercice',
        level: ex.pr_exercice,
        title: ex.nameFr,
        detail: vol > 0 ? formatExVol(vol, unit) : '',
      })
    }
    for (const set of ex.sets) {
      if (set.pr_charge) {
        out.push({
          key: `ch-${set.id}`,
          type: 'charge',
          level: set.pr_charge,
          title: ex.nameFr,
          detail: `${formatWeight(set.weight_kg ?? 0, unit)} × ${set.reps ?? 0}`,
        })
      }
      if (set.pr_serie) {
        out.push({
          key: `se-${set.id}`,
          type: 'serie',
          level: set.pr_serie,
          title: ex.nameFr,
          detail: `${set.reps ?? 0} reps × ${formatWeight(set.weight_kg ?? 0, unit)}`,
        })
      }
    }
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
}

function PrsSection({
  workout,
  exercises,
  colors,
}: {
  workout: FeedWorkoutDetail
  exercises: ExerciseWithSets[]
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const { unit } = useWeightUnit()
  const prs = collectPrs(workout, exercises, unit)
  if (prs.length === 0) return null

  const levelColor = (lvl: 'gold' | 'silver' | 'bronze'): string =>
    lvl === 'gold' ? colors.prGold : lvl === 'silver' ? colors.prSilver : colors.prBronze

  return (
    <View style={prsS.wrapper}>
      <Text style={[prsS.sectionTitle, { color: colors.textTertiary }]}>
        {`PRs RÉALISÉS · ${prs.length}`}
      </Text>
      {prs.map((pr) => {
        const Icon = PR_ICON[pr.type]
        const lc = levelColor(pr.level)
        return (
          <View key={pr.key} style={[prsS.card, { backgroundColor: colors.backgroundSecondary }]}>
            <View style={[prsS.iconWrap, { backgroundColor: `${lc}1F` }]}>
              <Icon size={16} color={lc} />
            </View>
            <View style={prsS.body}>
              <Text style={[prsS.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {pr.title}
              </Text>
              <Text style={[prsS.type, { color: colors.textTertiary }]}>
                {PR_TYPE_LABEL[pr.type]}
              </Text>
            </View>
            <View style={prsS.right}>
              {pr.detail !== '' && (
                <Text
                  style={[prsS.detail, { color: colors.textSecondary }]}
                  allowFontScaling={false}
                  numberOfLines={1}
                >
                  {pr.detail}
                </Text>
              )}
              <View style={[prsS.medal, { backgroundColor: lc }]}>
                <Text style={[prsS.medalTxt, { color: colors.background }]}>
                  {PR_LEVEL_SHORT[pr.level]}
                </Text>
              </View>
            </View>
          </View>
        )
      })}
    </View>
  )
}

const prsS = StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: spacing.s3,
    marginBottom: spacing.s2,
    gap: spacing.s3,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontFamily: font.bold,
    letterSpacing: -0.2,
  },
  type: {
    fontSize: 9,
    fontFamily: font.medium,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  detail: {
    fontSize: 12,
    fontFamily: font.bold,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  medal: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  medalTxt: {
    fontSize: 8,
    fontFamily: font.bold,
    letterSpacing: 0.6,
  },
})

// ─── Chip famille ────────────────────────────────────────────────────────────

const chipBaseStyle = {
  paddingHorizontal: spacing.s3,
  paddingVertical: 5,
  borderRadius: radius.full,
  borderWidth: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexShrink: 1 as const,
}
const chipLabelBase = {
  fontSize: 9,
  fontFamily: font.bold,
  letterSpacing: 0.8,
  textTransform: 'uppercase' as const,
}

function FamilyChip({
  name,
  color,
  isActive,
  anyActive,
  onPress,
}: {
  name: string
  index: number
  color: string
  isActive: boolean
  anyActive: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        chipBaseStyle,
        {
          borderColor: color,
          backgroundColor: isActive ? `${color}22` : 'transparent',
          opacity: anyActive && !isActive ? 0.42 : 1,
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
  const { formatVolume: formatVolumeU } = useWeightUnit()
  const router = useRouter()
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const [workout, setWorkout] = useState<FeedWorkoutDetail | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([])
  const [muscleBars, setMuscleBars] = useState<MuscleBar[]>([])
  const [likes, setLikes] = useState<number>(0)
  const [hasLiked, setHasLiked] = useState<boolean>(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null)
  const [sessionValues, setSessionValues] = useState<number[][] | undefined>(undefined)
  const [commentsOpen, setCommentsOpen] = useState<boolean>(false)
  const [newComment, setNewComment] = useState<string>('')
  const [selectedFamily, setSelectedFamily] = useState<number | null>(null)
  const [myoFullscreen, setMyoFullscreen] = useState<boolean>(false)
  const [myoGlossaryOpen, setMyoGlossaryOpen] = useState<boolean>(false)

  // Animation volume total 0 → valeur finale
  const volumeAnim = useSharedValue(0)
  const [displayVolume, setDisplayVolume] = useState<number>(0)
  const [volumeReady, setVolumeReady] = useState<boolean>(false)

  useAnimatedReaction(
    () => volumeAnim.value,
    (value) => {
      runOnJS(setDisplayVolume)(Math.round(value))
    }
  )

  useEffect(() => {
    if (workout?.total_volume_kg == null) return
    cancelAnimation(volumeAnim)
    volumeAnim.value = 0
    setVolumeReady(true)
    volumeAnim.value = withSequence(
      withTiming(0, { duration: 0 }),
      withTiming(workout.total_volume_kg, {
        duration: 1800,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    )
  }, [workout?.id])

  // Animation hint "GUIDE" sur le bouton HelpCircle
  const hintOpacity = useSharedValue(0)
  const hintY = useSharedValue(6)

  useEffect(() => {
    if (!myoFullscreen) {
      hintOpacity.value = withTiming(0, { duration: 200 })
      hintY.value = withTiming(6, { duration: 200 })
      return
    }
    hintOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(900, withTiming(1, { duration: 350, easing: Easing.out(Easing.ease) })),
        withTiming(1, { duration: 2200 }),
        withTiming(0, { duration: 450, easing: Easing.in(Easing.ease) }),
        withTiming(0, { duration: 1800 })
      ),
      -1,
      false
    )
    hintY.value = withRepeat(
      withSequence(
        withTiming(6, { duration: 0 }),
        withDelay(900, withTiming(0, { duration: 350, easing: Easing.out(Easing.ease) })),
        withTiming(0, { duration: 2200 }),
        withTiming(-3, { duration: 450, easing: Easing.in(Easing.ease) }),
        withTiming(6, { duration: 0 }),
        withTiming(6, { duration: 1800 })
      ),
      -1,
      false
    )
  }, [myoFullscreen])

  const hintAnimStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
    transform: [{ translateY: hintY.value }],
  }))

  const glossarySlide = useSharedValue(screenHeight)

  useEffect(() => {
    glossarySlide.value = myoGlossaryOpen
      ? withTiming(0, { duration: 380, easing: Easing.bezier(0.16, 1, 0.3, 1) })
      : withTiming(screenHeight, { duration: 280, easing: Easing.bezier(0.4, 0, 1, 1) })
  }, [myoGlossaryOpen])

  const glossaryAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: glossarySlide.value }],
  }))

  const familyScores = useMemo(() => {
    if (!sessionValues) return new Array(8).fill(0) as number[]
    return sessionValues.map((fam) =>
      Math.round((fam.reduce((s, v) => s + v, 0) / fam.length) * 100)
    )
  }, [sessionValues])

  const globalScore = useMemo(() => {
    if (!sessionValues) return 0
    const sum = sessionValues.reduce(
      (acc, fam) => acc + fam.reduce((s, v) => s + v, 0) / fam.length,
      0
    )
    return Math.round((sum / sessionValues.length) * 100)
  }, [sessionValues])
  const scoreColor =
    globalScore >= 66 ? scoreScale.high : globalScore >= 33 ? scoreScale.mid : scoreScale.low

  const openMyoFullscreen = useCallback(() => {
    setMyoFullscreen(true)
  }, [])

  const fetchWorkout = useCallback(async (): Promise<void> => {
    if (!id) return

    // Workout
    const { data: wData, error: wError } = await supabase
      .from('workouts')
      .select(
        `
        id, user_id, title, started_at, ended_at, duration_sec, total_volume_kg,
        note, photo_url, pr_seance, avg_rest_seconds, location_city, is_public,
        poids_corps_kg,
        user:user_id(id, username, full_name, avatar_url)
      `
      )
      .eq('id', id)
      .single()

    if (wError || !wData) {
      log.error('fetchWorkout error:', wError)
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
      user:
        | Array<{
            id: string
            username: string | null
            full_name: string | null
            avatar_url: string | null
          }>
        | {
            id: string
            username: string | null
            full_name: string | null
            avatar_url: string | null
          }
        | null
    }

    const userRaw = wTyped.user
    const userObj = Array.isArray(userRaw) ? (userRaw[0] ?? null) : userRaw

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
    // ⚠️ Pas d'embed `exercises!inner(...)` : aucune FK workout_exercises→exercises
    // dans le cache PostgREST (PGRST200) → l'embed faisait échouer toute la requête.
    // Les noms d'exos sont récupérés dans une requête séparée par exercise_id.
    const { data: weData, error: weError } = await supabase
      .from('workout_exercises')
      .select(
        `
        id, exercise_id, order_index, pr_exercice,
        workout_sets(id, set_number, set_type, reps, weight_kg, rest_seconds, pr_charge, pr_serie)
      `
      )
      .eq('workout_id', id)
      .order('order_index')

    if (weError) {
      log.error('fetchWorkout workout_exercises error:', weError)
    }

    if (weData) {
      type WeRow = {
        id: string
        exercise_id: string
        order_index: number
        pr_exercice: string | null
        workout_sets: SetRow[] | null
      }
      const weRows = weData as WeRow[]

      // Noms d'exos — requête séparée (pas de FK pour l'embed PostgREST)
      const nameById = new Map<string, string>()
      const distinctIds = [...new Set(weRows.map((we) => we.exercise_id))]
      if (distinctIds.length > 0) {
        const { data: exData } = await supabase
          .from('exercises')
          .select('id, name_fr')
          .in('id', distinctIds)
        for (const ex of (exData ?? []) as Array<{ id: string; name_fr: string }>) {
          nameById.set(ex.id, ex.name_fr)
        }
      }

      const exs: ExerciseWithSets[] = weRows.map((we) => {
        return {
          workoutExerciseId: we.id,
          exerciseId: we.exercise_id,
          nameFr: nameById.get(we.exercise_id) ?? 'Exercice',
          orderIndex: we.order_index,
          pr_exercice: (we.pr_exercice as PrLevel) ?? null,
          sets: ((we.workout_sets ?? []) as SetRow[]).sort((a, b) => a.set_number - b.set_number),
        }
      })
      setExercises(exs)

      // Muscle bars
      const exerciseIds = exs.map((e) => e.exerciseId)
      const { data: emData } = await supabase
        .from('exercise_muscles')
        .select('exercise_id, muscle, role, activation_pct')
        .in('exercise_id', exerciseIds)
        .in('role', ['primary', 'secondary'])

      if (emData) {
        const muscleVol: Record<string, number> = {}

        // ORA-031 — indexer exs par exerciseId (first-match, comme .find) → O(n+m)
        const exById = new Map<string, (typeof exs)[number]>()
        for (const e of exs) if (!exById.has(e.exerciseId)) exById.set(e.exerciseId, e)

        for (const em of emData) {
          const ex = exById.get(em.exercise_id)
          if (!ex) continue
          const vol = ex.sets.reduce((sum, s) => {
            return sum + (s.weight_kg ?? 0) * (s.reps ?? 0) * ((em.activation_pct ?? 0) / 100)
          }, 0)
          const label = MUSCLE_LABELS[em.muscle as string] ?? (em.muscle as string)
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
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id ?? null
    setCurrentUserId(uid)

    const { data: likeData, count: likeCount } = await supabase
      .from('likes')
      .select('user_id', { count: 'exact' })
      .eq('workout_id', id)

    if (likeCount !== null) {
      setLikes(likeCount)
    }
    if (likeData && uid) {
      setHasLiked((likeData as Array<{ user_id: string }>).some((l) => l.user_id === uid))
    }

    // Comments
    const { data: commentData } = await supabase
      .from('comments')
      .select(
        `
        id, content, created_at, user_id,
        users(username, full_name, avatar_url)
      `
      )
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
      const typedComments: CommentRow[] = (commentData as unknown as CommentRaw[]).map((c) => ({
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
      .select(
        'z_volume, z_intensite, z_structure, z_recovery, z_performance, z_regularite, z_extended'
      )
      .eq('workout_id', id)
      .maybeSingle()

    if (myoRow) {
      setSessionValues(
        sessionValuesFromSignature(
          myoRow as {
            z_volume: number
            z_intensite: number
            z_structure: number
            z_recovery: number
            z_performance: number
            z_regularite: number
            z_extended: Record<string, unknown>
          }
        )
      )
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    void fetchWorkout()
  }, [fetchWorkout])

  const toggleLike = useCallback(async (): Promise<void> => {
    if (!currentUserId || !id) return

    // Optimistic update
    const wasLiked = hasLiked
    setHasLiked(!wasLiked)
    setLikes((prev) => prev + (wasLiked ? -1 : 1))

    const { error } = wasLiked
      ? await supabase.from('likes').delete().eq('user_id', currentUserId).eq('workout_id', id)
      : await supabase.from('likes').insert({ user_id: currentUserId, workout_id: id })

    // Revert on error
    if (error) {
      setHasLiked(wasLiked)
      setLikes((prev) => prev + (wasLiked ? 1 : -1))
    }
  }, [currentUserId, id, hasLiked])

  const s = buildStyles(colors)

  const handleShare = useCallback(async () => {
    const title = workout?.title ?? 'Séance'
    const vol =
      workout?.total_volume_kg != null
        ? formatVolumeU(workout.total_volume_kg, { suffix: true })
        : ''
    const date = workout ? formatDate(workout.started_at) : ''
    try {
      await Share.share({
        message: `${title} · ${vol} · ${date} — via Ova`,
        title,
      })
    } catch {}
  }, [workout])

  const handleMenu = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Copier le lien', 'Signaler'],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) void Share.share({ message: `ova://feed/${id}` })
        }
      )
    } else {
      Alert.alert('Options', undefined, [
        { text: 'Copier le lien', onPress: () => Share.share({ message: `ova://feed/${id}` }) },
        { text: 'Signaler', style: 'destructive', onPress: () => {} },
        { text: 'Annuler', style: 'cancel' },
      ])
    }
  }, [id])

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

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        decelerationRate={0.96}
      >
        <View>
          {/* ── Header compact (back + user + actions) ── */}
          <View style={[s.header, { paddingTop: insets.top + spacing.s2 }]}>
            <Pressable
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Retour"
              hitSlop={8}
            >
              <ChevronLeft size={22} color={colors.textPrimary} />
            </Pressable>

            <View style={[s.userAvatar, { backgroundColor: colors.backgroundSecondary }]}>
              {workout.user.avatar_url ? (
                <Image
                  source={{ uri: workout.user.avatar_url }}
                  style={s.userAvatarImg}
                  accessibilityLabel="Avatar"
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
              <Text style={s.userHandle} numberOfLines={1}>
                {formatDate(workout.started_at)}
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]}
              onPress={() => void handleShare()}
              hitSlop={8}
              accessibilityLabel="Partager"
            >
              <Share2 size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.headerBtn, pressed && { opacity: 0.6 }]}
              onPress={handleMenu}
              hitSlop={8}
              accessibilityLabel="Plus d'options"
            >
              <MoreVertical size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* ── Titre séance ── */}
          {workout.title && (
            <View style={s.titleBlock}>
              <Text style={s.workoutTitle} numberOfLines={2}>
                {workout.title}
              </Text>
            </View>
          )}

          {/* ── Hero stats — toujours visibles ── */}
          <View style={s.heroBlock}>
            <Text style={s.heroLabel}>VOLUME TOTAL</Text>
            <View style={s.heroRow}>
              <Text style={[s.heroValue, { color: colors.accent }]} allowFontScaling={false}>
                {volumeReady
                  ? formatVolumeU(displayVolume, { suffix: true })
                  : formatVolumeU(workout.total_volume_kg, { suffix: true })}
              </Text>
            </View>
            <View style={s.statChips}>
              <View style={[s.statChip, { backgroundColor: colors.backgroundSecondary }]}>
                <Text style={[s.chipValue, { color: colors.textPrimary }]}>
                  {formatDuration(workout.duration_sec)}
                </Text>
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

          {/* ── Note ── */}
          {workout.note && (
            <View style={s.noteBlock}>
              <Text style={[s.noteText, { color: colors.textSecondary }]}>{workout.note}</Text>
            </View>
          )}

          {/* ── Photo ── */}
          {workout.photo_url && (
            <Pressable onPress={() => setPhotoLightbox(workout.photo_url!)} style={s.photoBlock}>
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
              style={({ pressed }) => [
                s.myoMiniCard,
                { backgroundColor: colors.backgroundSecondary, opacity: pressed ? 0.85 : 1 },
              ]}
              onPress={openMyoFullscreen}
              accessibilityRole="button"
              accessibilityLabel="Voir le graphe Myo en grand"
            >
              <View pointerEvents="none" style={s.myoMiniOrb}>
                <MyoChart
                  sessionValues={sessionValues}
                  size={140}
                  selectedFamily={null}
                  onFamilySelect={() => {}}
                  showScore={false}
                  showLabels={false}
                />
              </View>
              <View style={s.myoMiniInfo}>
                <Text style={[s.myoMiniTitle, { color: colors.textPrimary }]}>Signature Myo</Text>
                <Text style={[s.myoMiniSub, { color: colors.textSecondary }]}>
                  8 familles · Tap pour détailler
                </Text>
                <View style={{ marginTop: spacing.s2, gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <GradientScoreText score={globalScore} size={44} />
                    <Text style={[s.myoMiniSub, { color: colors.textTertiary, fontSize: 11 }]}>
                      / 100
                    </Text>
                  </View>
                  <View style={[s.scoreBarTrack, { backgroundColor: colors.backgroundTertiary }]}>
                    <Svg width={`${globalScore}%`} height={6} style={{ borderRadius: 3 }}>
                      <Defs>
                        <LinearGradient id="sbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                          <Stop offset="0%" stopColor={scoreScale.low} />
                          <Stop offset="50%" stopColor={scoreScale.mid} />
                          <Stop offset="100%" stopColor={scoreScale.high} />
                        </LinearGradient>
                      </Defs>
                      <Rect x={0} y={0} width="100%" height={6} rx={3} fill="url(#sbGrad)" />
                    </Svg>
                  </View>
                </View>
              </View>
            </Pressable>
          </View>

          {/* ── Muscles travaillés ── */}
          {muscleBars.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textTertiary }]}>
                MUSCLES TRAVAILLÉS
              </Text>
              {muscleBars.map((bar, idx) => (
                <View key={idx} style={s.muscleRow}>
                  <Text style={[s.muscleLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {bar.muscleLabel}
                  </Text>
                  <View style={[s.muscleBarTrack, { backgroundColor: colors.backgroundTertiary }]}>
                    <View
                      style={[
                        s.muscleBarFill,
                        { width: `${bar.pct}%`, backgroundColor: colors.accent },
                      ]}
                    />
                  </View>
                  <Text style={[s.musclePct, { color: colors.accent }]}>{bar.pct}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* ── PRs réalisés ── */}
          <PrsSection workout={workout} exercises={exercises} colors={colors} />

          {/* ── Détail des exos & séries ── */}
          {exercises.length > 0 && <RecapSection exercises={exercises} colors={colors} />}
        </View>
      </ScrollView>

      {/* ── Bottom bar — like + commentaires ── */}
      <View
        style={[
          s.bottomBar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.separator,
            paddingBottom: insets.bottom + spacing.s2,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [s.bottomAction, pressed && { opacity: 0.7 }]}
          onPress={toggleLike}
          accessibilityRole="button"
          accessibilityLabel={hasLiked ? "Retirer j'aime" : "J'aime"}
        >
          <Heart
            size={17}
            color={hasLiked ? colors.error : colors.textSecondary}
            fill={hasLiked ? colors.error : 'none'}
          />
          <Text style={[s.bottomCount, { color: hasLiked ? colors.error : colors.textSecondary }]}>
            {likes}
          </Text>
          <Text
            style={[s.bottomActionLabel, { color: hasLiked ? colors.error : colors.textTertiary }]}
          >
            J'AIME
          </Text>
        </Pressable>

        <View style={[s.bottomSep, { backgroundColor: colors.separator }]} />

        <Pressable
          style={({ pressed }) => [s.bottomAction, pressed && { opacity: 0.7 }]}
          onPress={() => setCommentsOpen(true)}
        >
          <MessageCircle size={17} color={colors.textSecondary} />
          <Text style={[s.bottomCount, { color: colors.textSecondary }]}>{comments.length}</Text>
          <Text style={[s.bottomActionLabel, { color: colors.textTertiary }]}>COMMENTAIRES</Text>
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
            style={[
              s.commentsSheet,
              { backgroundColor: colors.backgroundSecondary, paddingBottom: insets.bottom },
            ]}
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
              ) : (
                comments.map((comment) => (
                  <View
                    key={comment.id}
                    style={[s.commentCard, { borderBottomColor: colors.separator }]}
                  >
                    <View style={[s.commentAvatar, { backgroundColor: colors.backgroundTertiary }]}>
                      {comment.users?.avatar_url ? (
                        <Image
                          source={{ uri: comment.users.avatar_url }}
                          style={s.commentAvatarImg}
                        />
                      ) : (
                        <Text style={[s.commentAvatarInit, { color: colors.textPrimary }]}>
                          {(
                            comment.users?.full_name?.[0] ??
                            comment.users?.username?.[0] ??
                            'U'
                          ).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={s.commentBody}>
                      <View style={s.commentHeaderRow}>
                        <Text
                          style={[s.commentAuthor, { color: colors.textPrimary }]}
                          numberOfLines={1}
                        >
                          {comment.users?.full_name || comment.users?.username || 'Utilisateur'}
                        </Text>
                        <Text style={[s.commentTime, { color: colors.textTertiary }]}>
                          {formatCommentDate(comment.created_at)}
                        </Text>
                      </View>
                      <Text style={[s.commentText, { color: colors.textSecondary }]}>
                        {comment.content}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={[s.commentInputRow, { borderTopColor: colors.separator }]}>
              <TextInput
                style={[
                  s.commentInputField,
                  { color: colors.textPrimary, backgroundColor: colors.backgroundTertiary },
                ]}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor={colors.textTertiary}
                value={newComment}
                onChangeText={setNewComment}
                multiline={false}
                returnKeyType="send"
              />
              <Pressable
                style={({ pressed }) => [
                  s.commentSend,
                  pressed && { opacity: 0.6 },
                  !newComment.trim() && { opacity: 0.3 },
                ]}
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
        <View
          style={[s.myoFsContainer, { backgroundColor: colors.background, paddingTop: insets.top }]}
        >
          <View style={s.myoFsHeader}>
            <Pressable
              style={({ pressed }) => [s.myoFsHelpBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setMyoGlossaryOpen(true)}
              hitSlop={8}
              accessibilityLabel="Guide des variables Myo"
            >
              <HelpCircle size={22} color={colors.textPrimary} />
              <Animated.Text
                style={[hintAnimStyle, s.myoFsHelpHint, { color: colors.textSecondary }]}
              >
                GUIDE
              </Animated.Text>
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
            <MyoChart
              sessionValues={sessionValues}
              size={screenWidth - 32}
              selectedFamily={selectedFamily}
              onFamilySelect={(fi) => setSelectedFamily(fi)}
            />
          </ScrollView>
          <View
            style={[
              s.familySelector,
              { paddingHorizontal: spacing.s4, paddingBottom: spacing.s3, alignSelf: 'stretch' },
            ]}
          >
            {FAMILY_NAMES_SHORT.map((name, idx) => (
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
          {/* ── Glossaire — overlay animé dans le même container ── */}
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: colors.background },
              glossaryAnimStyle,
            ]}
            pointerEvents={myoGlossaryOpen ? 'auto' : 'none'}
          >
            <MyoGlossaryScreen onClose={() => setMyoGlossaryOpen(false)} />
          </Animated.View>
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
          <View style={[s.lightboxContainer, { backgroundColor: scrimStrong }]}>
            <Pressable style={s.lightboxClose} onPress={() => setPhotoLightbox(null)}>
              <X size={28} color={colors.textPrimary} />
            </Pressable>

            <Image source={{ uri: photoLightbox }} style={s.lightboxImage} resizeMode="contain" />
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

    // Header compact
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s3,
      paddingBottom: spacing.s3,
      marginBottom: spacing.s4,
      gap: spacing.s2,
    },
    backBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    headerBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    userAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0,
    },
    userAvatarImg: {
      width: '100%',
      height: '100%',
    },
    userAvatarInit: {
      fontSize: 13,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    userInfo: {
      flex: 1,
      minWidth: 0,
    },
    userName: {
      fontSize: 13,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: -0.1,
    },
    userHandle: {
      fontSize: 11,
      fontFamily: font.regular,
      color: colors.textTertiary,
      marginTop: 1,
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
    scoreBarTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    scoreBarFill: {
      height: 6,
      borderRadius: 3,
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
    myoFsHelpBtn: {
      width: 44,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3,
    },
    myoFsHelpHint: {
      fontSize: 8,
      fontFamily: font.bold,
      letterSpacing: 0.9,
      textTransform: 'uppercase' as const,
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
      backgroundColor: scrim,
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
