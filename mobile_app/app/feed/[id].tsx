import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  FlatList,
  SectionList,
  Modal,
  useWindowDimensions,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Share2, MoreVertical, Heart, X } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font, duration } from '@/constants/theme'
import { prBadgeRecipe, type PrType } from '@/constants/recipes'
import MyoOrb from '@/app/workout/myo-orb'
import { Zap, Flame, Dumbbell, Trophy } from 'lucide-react-native'

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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FeedDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const router = useRouter()
  const { width: screenWidth } = useWindowDimensions()

  const [workout, setWorkout] = useState<FeedWorkoutDetail | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([])
  const [muscleBars, setMuscleBars] = useState<MuscleBar[]>([])
  const [likes, setLikes] = useState<number>(0)
  const [hasLiked, setHasLiked] = useState<boolean>(false)
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [expandRecap, setExpandRecap] = useState<boolean>(false)
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null)
  const [sessionValues, setSessionValues] = useState<number[][] | undefined>(undefined)

  const fetchWorkout = useCallback(async (): Promise<void> => {
    if (!id) return

    // Workout
    const { data: wData } = await supabase
      .from('workouts')
      .select(`
        id, user_id, title, started_at, ended_at, duration_sec, total_volume_kg,
        note, photo_url, pr_seance, avg_rest_seconds, location_city, is_public,
        poids_corps_kg,
        users(id, username, full_name, avatar_url)
      `)
      .eq('id', id)
      .single()

    if (!wData) {
      setLoading(false)
      return
    }

    // Cast avec correction du type users
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
      users: Array<{
        id: string
        username: string | null
        full_name: string | null
        avatar_url: string | null
      }>
    }

    const workoutData: FeedWorkoutDetail = {
      ...wTyped,
      user: Array.isArray(wTyped.users) && wTyped.users.length > 0 ? wTyped.users[0] : {
        id: '',
        username: null,
        full_name: null,
        avatar_url: null,
      },
    }
    setWorkout(workoutData)

    // Exercises + sets
    const { data: weData } = await supabase
      .from('workout_exercises')
      .select(`
        id, exercise_id, order_index, pr_exercice,
        exercises!inner(name_fr),
        workout_sets(id, set_number, set_type, reps, weight_kg, pr_charge, pr_serie)
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

    // Workout metrics (Myo data)
    const { data: metricsData } = await supabase
      .from('workout_metrics')
      .select('data')
      .eq('workout_id', id)
      .single()

    if (metricsData) {
      // TODO: Extract sessionValues from metricsData.data if available
      // For now, mock data will be used in MyoOrb
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
        {/* ── Header ── */}
        <View style={s.header}>
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
            <Text style={s.userHandle} numberOfLines={1}>
              @{workout.user.username || 'user'}
            </Text>
          </View>

          <Pressable style={({ pressed }) => [s.menuBtn, pressed && { opacity: 0.6 }]} hitSlop={8}>
            <MoreVertical size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* ── Myo Orb — GÉANT ── */}
        <View style={s.myoSection}>
          <View style={s.myoContainer}>
            <MyoOrb sessionValues={sessionValues} size={screenWidth - 32} />
          </View>

          {/* Famille selector (8 boutons colorés) */}
          <View style={s.familySelector}>
            {['VOLUME', 'INTENSITÉ', 'STRUCTURE', 'RÉCUP', 'PERF', 'RÉGULARITÉ', 'MUSCLES', 'TEMPS'].map((name, idx) => (
              <View
                key={idx}
                style={[
                  s.familyButton,
                  { backgroundColor: ['#f97316', '#ef4444', '#8b5cf6', '#06b6d4', '#fac775', '#22c55e', '#ec4899', '#3b82f6'][idx] },
                ]}
              >
                <Text style={s.familyButtonLabel} numberOfLines={1}>{name}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Photos (si présentes) ── */}
        {workout.photo_url && (
          <View style={s.photoSection}>
            <FlatList
              data={[workout.photo_url]}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setPhotoLightbox(item)}
                  style={s.photoThumb}
                >
                  <Image
                    source={{ uri: item }}
                    style={s.photoImage}
                    accessibilityLabel="Photo de séance"
                  />
                </Pressable>
              )}
              keyExtractor={(_, idx) => `photo-${idx}`}
              horizontal
              scrollEnabled={false}
              contentContainerStyle={s.photoList}
            />
          </View>
        )}

        {/* ── Recap séance (collapsible) ── */}
        <Pressable
          style={({ pressed }) => [s.recapHeader, pressed && { backgroundColor: colors.backgroundTertiary }]}
          onPress={() => setExpandRecap(!expandRecap)}
        >
          <Text style={s.recapTitle}>RÉSUMÉ SÉANCE</Text>
          <Text style={s.recapToggle}>{expandRecap ? '−' : '+'}</Text>
        </Pressable>

        {expandRecap && (
          <View style={s.recapContent}>
            {/* Hero metric — volume */}
            <View style={s.recapHero}>
              <Text style={s.recapHeroValue} accessibilityLabel={`${formatVolume(workout.total_volume_kg)} volume`}>
                {formatVolume(workout.total_volume_kg)}
              </Text>
              <Text style={s.recapHeroLabel}>VOLUME</Text>
            </View>

            {/* Stats grid */}
            <View style={s.recapStats}>
              <View style={s.recapStat}>
                <Text style={s.recapStatValue}>{formatDuration(workout.duration_sec)}</Text>
                <Text style={s.recapStatLabel}>DURÉE</Text>
              </View>

              <View style={s.recapStat}>
                <Text style={s.recapStatValue}>{nSets}</Text>
                <Text style={s.recapStatLabel}>SETS</Text>
              </View>

              <View style={s.recapStat}>
                <Text style={s.recapStatValue}>{workout.avg_rest_seconds ? `${Math.round(workout.avg_rest_seconds)}s` : '—'}</Text>
                <Text style={s.recapStatLabel}>REPOS</Text>
              </View>
            </View>

            {/* PRs */}
            {(hasPrSeance || prChargeEx != null || prSerieEx != null) && (
              <View style={s.recapPrs}>
                {hasPrSeance && workout.pr_seance && (
                  <PrBadge level={workout.pr_seance} type="seance" label="Séance" size={12} />
                )}
                {prChargeEx != null && prChargeLevel && (
                  <PrBadge level={prChargeLevel} type="charge" label={`Charge · ${prChargeEx.nameFr}`} size={12} />
                )}
                {prSerieEx != null && prSerieEx !== prChargeEx && prSerieLevel && (
                  <PrBadge level={prSerieLevel} type="serie" label={`Série · ${prSerieEx.nameFr}`} size={12} />
                )}
              </View>
            )}

            {/* Location */}
            {workout.location_city && (
              <Text style={s.recapLocation}>{workout.location_city}</Text>
            )}

            {/* Note */}
            {workout.note && (
              <Text style={s.recapNote}>{workout.note}</Text>
            )}
          </View>
        )}

        {/* ── Muscles travaillés ── */}
        {muscleBars.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>MUSCLES TRAVAILLÉS</Text>

            {muscleBars.map((bar, idx) => (
              <View key={idx} style={s.muscleRow}>
                <Text style={s.muscleLabel} numberOfLines={1}>{bar.muscleLabel}</Text>

                <View style={s.muscleBarTrack}>
                  <View
                    style={[s.muscleBarFill, { width: `${bar.pct}%` }]}
                  />
                </View>

                <Text style={s.musclePct} accessibilityLabel={`${bar.pct} pourcent`}>
                  {bar.pct}
                  <Text style={s.musclePctSymbol}>%</Text>
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Commentaires ── */}
        {comments.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>COMMENTAIRES ({comments.length})</Text>

            {comments.map(comment => (
              <View key={comment.id} style={s.commentCard}>
                <View style={s.commentHeader}>
                  <View style={[s.commentAvatar, { backgroundColor: colors.backgroundSecondary }]}>
                    {comment.users?.avatar_url ? (
                      <Image
                        source={{ uri: comment.users.avatar_url }}
                        style={s.commentAvatarImg}
                      />
                    ) : (
                      <Text style={s.commentAvatarInit}>
                        {(comment.users?.full_name?.[0] ?? comment.users?.username?.[0] ?? 'U').toUpperCase()}
                      </Text>
                    )}
                  </View>

                  <View style={s.commentMeta}>
                    <Text style={s.commentAuthor} numberOfLines={1}>
                      {comment.users?.full_name || comment.users?.username || 'Utilisateur'}
                    </Text>
                    <Text style={s.commentTime}>{formatCommentDate(comment.created_at)}</Text>
                  </View>
                </View>

                <Text style={s.commentText}>{comment.content}</Text>
              </View>
            ))}
          </View>
        )}

        {comments.length === 0 && (
          <View style={s.emptyComments}>
            <Text style={s.emptyCommentsText}>Aucun commentaire pour le moment.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Like button (sticky bottom) ── */}
      <View style={s.bottomBar}>
        <Pressable
          style={({ pressed }) => [
            s.likeButton,
            hasLiked && { backgroundColor: colors.error },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => setHasLiked(!hasLiked)}
        >
          <Heart size={20} color={hasLiked ? colors.textPrimary : colors.textSecondary} fill={hasLiked ? colors.error : 'none'} />
          <Text style={[s.likeText, hasLiked && { color: colors.error }]}>
            Aimé par {likes}
          </Text>
        </Pressable>
      </View>

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
      paddingTop: spacing.s4,
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

    // Myo section
    myoSection: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    myoContainer: {
      alignItems: 'center',
      marginBottom: spacing.s5,
    },
    familySelector: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      justifyContent: 'center',
    },
    familyButton: {
      paddingHorizontal: spacing.s3,
      paddingVertical: spacing.s2,
      borderRadius: radius.full,
      minWidth: 60,
      alignItems: 'center',
      justifyContent: 'center',
    },
    familyButtonLabel: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
    },

    // Photos
    photoSection: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    photoList: {
      gap: spacing.s3,
    },
    photoThumb: {
      width: 120,
      height: 120,
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: colors.backgroundSecondary,
    },
    photoImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },

    // Recap
    recapHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s4,
      backgroundColor: colors.backgroundSecondary,
      marginHorizontal: spacing.s4,
      borderRadius: radius.md,
      marginBottom: spacing.s3,
    },
    recapTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
    },
    recapToggle: {
      fontSize: 20,
      color: colors.accent,
      fontFamily: font.bold,
    },
    recapContent: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
    },
    recapHero: {
      alignItems: 'center',
      marginBottom: spacing.s5,
    },
    recapHeroValue: {
      ...typography.display,
      fontFamily: font.black,
      color: colors.accent,
      fontVariant: ['tabular-nums'],
    },
    recapHeroLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: spacing.s2,
    },
    recapStats: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginBottom: spacing.s4,
    },
    recapStat: {
      alignItems: 'center',
    },
    recapStatValue: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    recapStatLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
    },
    recapPrs: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      marginBottom: spacing.s4,
    },
    recapLocation: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: spacing.s2,
    },
    recapNote: {
      ...typography.body,
      color: colors.textPrimary,
      fontStyle: 'italic',
    },

    // Section generic
    section: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    sectionTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 1,
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
      color: colors.textSecondary,
      width: 96,
    },
    muscleBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    muscleBarFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    musclePct: {
      fontFamily: font.mono,
      fontVariant: ['tabular-nums'],
      fontSize: 12,
      color: colors.accent,
      width: 36,
      textAlign: 'right',
    },
    musclePctSymbol: {
      fontSize: 10,
    },

    // Comments
    commentCard: {
      marginBottom: spacing.s4,
      paddingBottom: spacing.s4,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    commentHeader: {
      flexDirection: 'row',
      gap: spacing.s3,
      marginBottom: spacing.s2,
    },
    commentAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    commentAvatarImg: {
      width: '100%',
      height: '100%',
    },
    commentAvatarInit: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    commentMeta: {
      flex: 1,
      justifyContent: 'center',
    },
    commentAuthor: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    commentTime: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s1,
    },
    commentText: {
      ...typography.body,
      color: colors.textPrimary,
      marginLeft: spacing.s4 + 36 + spacing.s3,
    },
    emptyComments: {
      paddingVertical: spacing.s6,
      alignItems: 'center',
    },
    emptyCommentsText: {
      ...typography.caption,
      color: colors.textTertiary,
    },

    // Bottom like bar
    bottomBar: {
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s4,
      paddingTop: spacing.s3,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    likeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.s3,
      paddingHorizontal: spacing.s4,
      borderRadius: radius.md,
      backgroundColor: colors.backgroundSecondary,
      gap: spacing.s2,
    },
    likeText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
      textTransform: 'uppercase',
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
