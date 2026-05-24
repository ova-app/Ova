import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Dumbbell, MapPin, Trophy, Zap } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

type PrLevel = 'gold' | 'silver' | 'bronze' | null

interface WorkoutDetail {
  id: string
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
  pct: number // normalized 0-100
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HistoryDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const router = useRouter()

  const [workout, setWorkout] = useState<WorkoutDetail | null>(null)
  const [exercises, setExercises] = useState<ExerciseWithSets[]>([])
  const [muscleBars, setMuscleBars] = useState<MuscleBar[]>([])
  const [gymName, setGymName] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)

  const fetchWorkout = useCallback(async (): Promise<void> => {
    if (!id) return

    // Workout
    const { data: wData } = await supabase
      .from('workouts')
      .select('id, title, started_at, ended_at, duration_sec, total_volume_kg, note, photo_url, pr_seance, avg_rest_seconds, location_city, gym_id')
      .eq('id', id)
      .single()

    if (!wData) {
      setLoading(false)
      return
    }
    setWorkout(wData as WorkoutDetail)

    // Gym name if available
    if ((wData as { gym_id?: string | null }).gym_id) {
      const { data: gymData } = await supabase
        .from('gyms')
        .select('name')
        .eq('id', (wData as { gym_id: string }).gym_id)
        .single()
      if (gymData) {
        setGymName((gymData as { name: string }).name)
      }
    } else if ((wData as { location_city?: string | null }).location_city) {
      setGymName((wData as { location_city: string }).location_city)
    }

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

  // Collect PR badges from exercises
  const hasPrSeance = workout.pr_seance != null
  const prExercises = exercises.filter(ex => ex.pr_exercice != null)
  const prChargeEx = exercises.find(ex => ex.sets.some(s => s.pr_charge != null))
  const prSerieEx = exercises.find(ex => ex.sets.some(s => s.pr_serie != null))

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

          <View style={s.backBtnPlaceholder} />
        </View>

        {/* ── Photo / Banner ── */}
        <View style={s.banner}>
          {workout.photo_url ? (
            <Image
              source={{ uri: workout.photo_url }}
              style={s.bannerImage}
              accessibilityLabel="Photo de séance"
            />
          ) : (
            <View style={s.bannerPlaceholder}>
              <Dumbbell size={32} color={colors.textTertiary} />
            </View>
          )}

          {gymName != null && (
            <View style={s.bannerGymRow}>
              <MapPin size={12} color={colors.textSecondary} />
              <Text style={s.bannerGymText} numberOfLines={1}>{gymName}</Text>
            </View>
          )}
        </View>

        {/* ── Stats Row ── */}
        <View style={s.statsCard}>
          <View style={s.statItem}>
            <Text style={[s.statValue, { color: colors.accent }]} accessibilityLabel={`${formatVolume(workout.total_volume_kg)} volume`}>
              {formatVolume(workout.total_volume_kg)}
            </Text>
          </View>

          <View style={s.statSeparator} />

          <View style={s.statItem}>
            <Text style={s.statValue}>{formatDuration(workout.duration_sec)}</Text>
          </View>

          <View style={s.statSeparator} />

          <View style={s.statItem}>
            <Text style={s.statValue} accessibilityLabel={`${nSets} séries`}>
              {nSets} séries
            </Text>
          </View>
        </View>

        {/* ── PR Badges ── */}
        {(hasPrSeance || prChargeEx != null || prSerieEx != null || prExercises.length > 0) && (
          <View style={s.prBadgesRow}>
            {hasPrSeance && (
              <View style={[s.prBadge, { backgroundColor: `${colors.prGold}26` }]}>
                <Trophy size={12} color={colors.prGold} />
                <Text style={[s.prBadgeText, { color: colors.prGold }]}>PR SÉANCE</Text>
              </View>
            )}

            {prChargeEx != null && (
              <View style={[s.prBadge, { backgroundColor: `${colors.accent}1A` }]}>
                <Zap size={12} color={colors.accent} />
                <Text style={[s.prBadgeText, { color: colors.accent }]}>
                  PR CHARGE · {prChargeEx.nameFr}
                </Text>
              </View>
            )}

            {prSerieEx != null && prSerieEx !== prChargeEx && (
              <View style={[s.prBadge, { backgroundColor: `${colors.accent}1A` }]}>
                <Zap size={12} color={colors.accent} />
                <Text style={[s.prBadgeText, { color: colors.accent }]}>
                  PR SÉRIE · {prSerieEx.nameFr}
                </Text>
              </View>
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

        {/* ── Exercices ── */}
        {exercises.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>EXERCICES</Text>

            {exercises.map(ex => {
              const hasPr = ex.pr_exercice != null || ex.sets.some(s => s.pr_charge != null || s.pr_serie != null)
              return (
                <View key={ex.workoutExerciseId} style={s.exCard}>
                  {/* Nom + PR badge */}
                  <View style={s.exHeader}>
                    <Text style={s.exName} numberOfLines={1}>{ex.nameFr}</Text>
                    {hasPr && (
                      <View style={[s.exPrBadge, { backgroundColor: `${colors.accent}1A` }]}>
                        <Zap size={10} color={colors.accent} />
                        <Text style={[s.exPrBadgeText, { color: colors.accent }]}>PR</Text>
                      </View>
                    )}
                  </View>

                  {/* Table sets */}
                  {ex.sets.length > 0 && (
                    <View style={s.setsTable}>
                      {/* Header */}
                      <View style={s.setRowHeader}>
                        <Text style={[s.setCellHeader, s.colSet]}>SET</Text>
                        <Text style={[s.setCellHeader, s.colWeight]}>POIDS</Text>
                        <Text style={[s.setCellHeader, s.colReps]}>REPS</Text>
                        <Text style={[s.setCellHeader, s.colVol]}>VOL.</Text>
                      </View>

                      {ex.sets.map((set, rowIdx) => {
                        const vol = (set.weight_kg ?? 0) * (set.reps ?? 0)
                        const hasPrSet = set.pr_charge != null || set.pr_serie != null
                        const rowBg = rowIdx % 2 === 1 ? colors.backgroundTertiary : 'transparent'
                        const prColor = hasPrSet ? colors.accent : null

                        return (
                          <View key={set.id} style={[s.setRow, { backgroundColor: rowBg }]}>
                            <Text style={[s.setCellMono, s.colSet, hasPrSet && prColor ? { color: prColor } : null]}>
                              {set.set_number}
                            </Text>
                            <Text style={[s.setCellMono, s.colWeight]}>
                              {set.weight_kg != null ? `${set.weight_kg} kg` : '—'}
                            </Text>
                            <Text style={[s.setCellMono, s.colReps]}>
                              {set.reps ?? '—'}
                            </Text>
                            <Text style={[s.setCellMono, s.colVol]}>
                              {vol > 0 ? `${vol} kg` : '—'}
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
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
      paddingTop: spacing.s12,
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s4,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnPlaceholder: {
      width: 44,
      height: 44,
    },
    headerDate: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
    },

    // Banner
    banner: {
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s3,
      borderRadius: radius.lg,
      overflow: 'hidden',
      height: 120,
      backgroundColor: colors.backgroundSecondary,
    },
    bannerImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    bannerPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: spacing.s6,
    },
    bannerGymRow: {
      position: 'absolute',
      bottom: spacing.s3,
      left: spacing.s3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
    },
    bannerGymText: {
      ...typography.caption,
      color: colors.textSecondary,
    },

    // Stats card — single card with separators
    statsCard: {
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s3,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.s3,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.s1,
    },
    statValue: {
      fontSize: 17,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.3,
    },
    statSeparator: {
      width: 1,
      height: 24,
      backgroundColor: colors.separator,
    },

    // PR Badges
    prBadgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s5,
    },
    prBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
      borderRadius: radius.sm,
      paddingVertical: spacing.s1 + 2,
      paddingHorizontal: spacing.s3,
    },
    prBadgeText: {
      ...typography.caption,
      fontFamily: font.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Section
    section: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: -0.2,
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
      borderRadius: radius.sm,
    },
    musclePct: {
      fontFamily: font.mono,
      fontVariant: ['tabular-nums'],
      fontSize: 12,
      color: colors.textSecondary,
      width: 36,
      textAlign: 'right',
    },
    musclePctSymbol: {
      fontSize: 10,
    },

    // Exercice card
    exCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
      marginBottom: spacing.s3,
    },
    exHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s3,
    },
    exName: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
      flex: 1,
    },
    exPrBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: radius.sm,
      paddingVertical: 3,
      paddingHorizontal: spacing.s2,
      marginLeft: spacing.s2,
    },
    exPrBadgeText: {
      ...typography.caption,
      fontFamily: font.bold,
      letterSpacing: 0.5,
    },

    // Sets table
    setsTable: {
      gap: 1,
    },
    setRowHeader: {
      flexDirection: 'row',
      paddingBottom: spacing.s2,
    },
    setRow: {
      flexDirection: 'row',
      paddingVertical: spacing.s2,
      paddingHorizontal: spacing.s1,
      borderRadius: radius.sm,
    },
    setCellHeader: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    setCellMono: {
      fontFamily: font.mono,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      color: colors.textPrimary,
    },
    colSet: {
      width: 32,
    },
    colWeight: {
      flex: 1,
    },
    colReps: {
      width: 52,
      textAlign: 'center',
    },
    colVol: {
      width: 72,
      textAlign: 'right',
    },
  })
}
