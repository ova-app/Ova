import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  Dimensions,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Dumbbell, Flame, MapPin, Trophy, Zap } from 'lucide-react-native'
import { Canvas, Path, Skia, Group, LinearGradient, vec } from '@shopify/react-native-skia'
import Animated, {
  useSharedValue,
  withDelay,
  withTiming,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'
import { prBadgeRecipe, type PrType } from '@/constants/recipes'

const { width: SCREEN_W } = Dimensions.get('window')

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
  pct: number  // normalized 0-100
  role: 'primary' | 'secondary'
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

// ─── Barre musculaire Skia animée ────────────────────────────────────────────

const BAR_H = 7
const BAR_RADIUS = 3.5
const ACCENT_COLOR = '#FFDD00'

function SkiaMuscleBar({
  label,
  pct,
  delay,
  role,
}: {
  label: string
  pct: number
  delay: number
  role: 'primary' | 'secondary'
}) {
  const { colors } = useTheme()
  const barW = SCREEN_W - spacing.s4 * 2 - 96 - 36 - spacing.s3 * 2
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(pct / 100, { duration: 650, easing: Easing.bezier(0.16, 1, 0.3, 1) }))
  }, [])

  const isPrimary = role === 'primary'
  const gradStart = isPrimary ? ACCENT_COLOR : '#FF6B00'
  const gradEnd   = isPrimary ? '#FAC775'    : '#7A7A8C'

  const barStyle = useAnimatedStyle(() => ({
    width: Math.max(progress.value * barW, BAR_RADIUS * 2),
  }))

  const barPath = useMemo(() => {
    const p = Skia.Path.Make()
    p.addRRect({ rect: { x: 0, y: 0, width: barW, height: BAR_H }, rx: BAR_RADIUS, ry: BAR_RADIUS })
    return p
  }, [barW])

  return (
    <View style={histStyles.muscleRow}>
      <Text
        style={[histStyles.muscleLabel, { color: isPrimary ? '#F0F0F5' : '#9A7A5C' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={[histStyles.muscleBarTrack, { width: barW, backgroundColor: `${gradStart}14` }]}>
        <Animated.View style={[histStyles.muscleBarAnimWrap, barStyle]}>
          <Canvas style={{ width: barW, height: BAR_H }}>
            <Path path={barPath} style="fill">
              <LinearGradient
                start={vec(0, 0)}
                end={vec(barW, 0)}
                colors={[gradStart, gradEnd]}
              />
            </Path>
          </Canvas>
        </Animated.View>
      </View>
      <Text
        style={[histStyles.musclePct, { color: isPrimary ? ACCENT_COLOR : '#4A4A5A' }]}
        allowFontScaling={false}
      >
        {pct}%
      </Text>
    </View>
  )
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
        const muscleVol:  Record<string, number>               = {}
        const muscleRole: Record<string, 'primary' | 'secondary'> = {}

        for (const em of emData) {
          const ex = exs.find(e => e.exerciseId === em.exercise_id)
          if (!ex) continue
          const vol = ex.sets.reduce((sum, s) => {
            return sum + (s.weight_kg ?? 0) * (s.reps ?? 0) * ((em.activation_pct ?? 0) / 100)
          }, 0)
          const label = MUSCLE_LABEL_MAP[em.muscle as string] ?? (em.muscle as string)
          muscleVol[label] = (muscleVol[label] ?? 0) + vol
          // primary wins over secondary
          if (!muscleRole[label] || em.role === 'primary') {
            muscleRole[label] = em.role as 'primary' | 'secondary'
          }
        }

        const maxVol = Math.max(...Object.values(muscleVol), 1)
        const bars: MuscleBar[] = Object.entries(muscleVol)
          .map(([muscleLabel, vol]) => ({
            muscleLabel,
            pct:  Math.round((vol / maxVol) * 100),
            role: muscleRole[muscleLabel] ?? 'secondary',
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

  // Best level helpers — gold > silver > bronze
  const bestLevel = (vals: Array<'gold' | 'silver' | 'bronze' | null>): 'gold' | 'silver' | 'bronze' | null => {
    if (vals.includes('gold')) return 'gold'
    if (vals.includes('silver')) return 'silver'
    if (vals.includes('bronze')) return 'bronze'
    return null
  }
  const prChargeLevel = prChargeEx
    ? bestLevel(prChargeEx.sets.map(s => s.pr_charge))
    : null
  const prSerieLevel = prSerieEx
    ? bestLevel(prSerieEx.sets.map(s => s.pr_serie))
    : null

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
              <MapPin size={12} color={colors.error} />
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
            <Text style={s.statLabel}>VOLUME</Text>
          </View>

          <View style={s.statSeparator} />

          <View style={s.statItem}>
            <Text style={s.statValue}>{formatDuration(workout.duration_sec)}</Text>
            <Text style={s.statLabel}>DURÉE</Text>
          </View>

          <View style={s.statSeparator} />

          <View style={s.statItem}>
            <Text style={s.statValue} accessibilityLabel={`${nSets} séries`}>
              {nSets}
            </Text>
            <Text style={s.statLabel}>SETS</Text>
          </View>
        </View>

        {/* ── PR Badges ── */}
        {(hasPrSeance || prChargeEx != null || prSerieEx != null || prExercises.length > 0) && (
          <View style={s.prBadgesRow}>
            {hasPrSeance && workout.pr_seance && (
              <PrBadge level={workout.pr_seance} type="seance" label="Séance" size={12} />
            )}

            {prChargeEx != null && prChargeLevel && (
              <PrBadge
                level={prChargeLevel}
                type="charge"
                label={`Charge · ${prChargeEx.nameFr}`}
                size={12}
              />
            )}

            {prSerieEx != null && prSerieEx !== prChargeEx && prSerieLevel && (
              <PrBadge
                level={prSerieLevel}
                type="serie"
                label={`Série · ${prSerieEx.nameFr}`}
                size={12}
              />
            )}
          </View>
        )}

        {/* ── Muscles travaillés — Skia bars ── */}
        {muscleBars.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>MUSCLES TRAVAILLÉS</Text>
            {muscleBars.map((bar, idx) => (
              <SkiaMuscleBar
                key={bar.muscleLabel}
                label={bar.muscleLabel}
                pct={bar.pct}
                delay={idx * 70}
                role={bar.role}
              />
            ))}
          </View>
        )}

        {/* ── Exercices ── */}
        {exercises.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>EXERCICES</Text>

            {exercises.map(ex => {
              const exSetPrCharge = bestLevel(ex.sets.map(set => set.pr_charge))
              const exSetPrSerie  = bestLevel(ex.sets.map(set => set.pr_serie))
              // Priorité d'affichage : exercice > charge > série (un seul badge — header compact)
              const exBadgeLevel: 'gold' | 'silver' | 'bronze' | null =
                ex.pr_exercice ?? exSetPrCharge ?? exSetPrSerie
              const exBadgeType: PrType =
                ex.pr_exercice != null ? 'exercice' :
                exSetPrCharge != null ? 'charge' :
                'serie'
              const exBadgeLabel =
                ex.pr_exercice != null ? 'Exercice' :
                exSetPrCharge != null ? 'Charge' :
                'Série'
              return (
                <View key={ex.workoutExerciseId} style={s.exCard}>
                  {/* Nom + PR badge */}
                  <View style={s.exHeader}>
                    <Text style={s.exName} numberOfLines={1}>{ex.nameFr}</Text>
                    {exBadgeLevel && (
                      <PrBadge level={exBadgeLevel} type={exBadgeType} label={exBadgeLabel} size={10} />
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
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
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
    // Section
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

// ─── Styles statiques SkiaMuscleBar ──────────────────────────────────────────

const histStyles = StyleSheet.create({
  muscleRow: {
    flexDirection: 'row',
    alignItems   : 'center',
    marginBottom : spacing.s3,
    gap          : spacing.s3,
  },
  muscleLabel: {
    fontSize : 12,
    fontFamily: font.medium,
    width    : 96,
  },
  muscleBarTrack: {
    height      : BAR_H,
    borderRadius: BAR_RADIUS,
    overflow    : 'hidden',
  },
  muscleBarAnimWrap: {
    height      : BAR_H,
    overflow    : 'hidden',
    borderRadius: BAR_RADIUS,
  },
  musclePct: {
    fontSize   : 12,
    fontFamily : font.bold,
    width      : 36,
    textAlign  : 'right',
    fontVariant: ['tabular-nums'],
  },
})
