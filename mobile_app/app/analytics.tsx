import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { ChevronLeft, Dumbbell, TrendingUp, Zap } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'
import { formatVolume } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VolumeRolling {
  vol7j:  number
  vol30j: number
  vol90j: number
  delta7vs30: number  // % delta vs moyenne sur 30j
}

interface MuscleBar {
  label:  string
  pct:    number  // normalisé 0-100
  volKg:  number
}

interface RecentPR {
  exerciseName: string
  prType:       'charge' | 'serie'
  value:        number
  unit:         string
  level:        'gold' | 'silver' | 'bronze'
  seanceDate:   string
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MUSCLE_LABEL_MAP: Record<string, string> = {
  grand_pectoral:   'Pectoraux',
  deltoide:         'Deltoïdes',
  grand_dorsal:     'Grand dorsal',
  trapeze:          'Trapèze',
  biceps:           'Biceps',
  triceps:          'Triceps',
  quadriceps:       'Quadriceps',
  ischio_jambiers:  'Ischio-jambiers',
  fessier_maximus:  'Fessiers',
  fessier_median:   'Fessiers',
  fessier_minimus:  'Fessiers',
  mollets:          'Mollets',
  abdominaux:       'Core',
  grand_rond:       'Grand rond',
  rhomboide:        'Rhomboïdes',
  erecteurs_rachis: 'Érecteurs rachis',
  avant_bras:       'Avant-bras',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function subDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - n)
  return r
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function deltaColor(pct: number, colors: ReturnType<typeof useTheme>['colors']): string {
  if (pct > 5)  return colors.success
  if (pct < -5) return colors.error
  return colors.textSecondary
}

function deltaSign(pct: number): string {
  if (pct > 0) return `+${Math.round(pct)}%`
  if (pct < 0) return `${Math.round(pct)}%`
  return '—'
}

// ─── Animated counter ────────────────────────────────────────────────────────

const easeOutCubic = Easing.bezier(0.215, 0.61, 0.355, 1)

function AnimatedCounter({
  target,
  duration = 1200,
  delay = 0,
  style,
  formatter = (v: number) => String(v),
}: {
  target: number
  duration?: number
  delay?: number
  style?: object
  formatter?: (v: number) => string
}) {
  const sv = useSharedValue(0)
  const [displayValue, setDisplayValue] = useState(() => formatter(0))

  const formatAndSet = useCallback((v: number) => {
    setDisplayValue(formatter(Math.round(v)))
  }, [formatter])

  useEffect(() => {
    sv.value = withDelay(delay, withTiming(target, { duration, easing: easeOutCubic }))
  }, [target, delay, duration])

  useAnimatedReaction(
    () => Math.round(sv.value * 2),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(formatAndSet)(sv.value)
      }
    }
  )

  return <Text style={style}>{displayValue}</Text>
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AnalyticsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [volumeRolling, setVolumeRolling] = useState<VolumeRolling | null>(null)
  const [muscleBars, setMuscleBars]       = useState<MuscleBar[]>([])
  const [recentPRs, setRecentPRs]         = useState<RecentPR[]>([])
  const [totalSeances, setTotalSeances]   = useState<number>(0)
  const [totalVolumeKg, setTotalVolumeKg] = useState<number>(0)
  const [loading, setLoading]             = useState<boolean>(true)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    const now = new Date()
    const since90 = subDays(now, 90).toISOString()
    const since30 = subDays(now, 30).toISOString()
    const since7  = subDays(now, 7).toISOString()

    // ── Volume rolling 7/30/90j ──
    const { data: workoutsData } = await supabase
      .from('workouts')
      .select('id, total_volume_kg, started_at')
      .eq('user_id', user.id)
      .gte('started_at', since90)
      .order('started_at', { ascending: false })

    const workouts = (workoutsData ?? []) as Array<{
      id: string
      total_volume_kg: number | null
      started_at: string
    }>

    setTotalSeances(workouts.length)
    setTotalVolumeKg(workouts.reduce((s, w) => s + (w.total_volume_kg ?? 0), 0))

    const vol90 = workouts.reduce((s, w) => s + (w.total_volume_kg ?? 0), 0)
    const vol30 = workouts
      .filter(w => w.started_at >= since30)
      .reduce((s, w) => s + (w.total_volume_kg ?? 0), 0)
    const vol7 = workouts
      .filter(w => w.started_at >= since7)
      .reduce((s, w) => s + (w.total_volume_kg ?? 0), 0)

    // delta 7j vs moyenne hebdo sur 30j (= vol30j / 4)
    const moy7sur30 = vol30 / 4
    const delta7vs30 = moy7sur30 > 0 ? ((vol7 - moy7sur30) / moy7sur30) * 100 : 0

    setVolumeRolling({ vol7j: vol7, vol30j: vol30, vol90j: vol90, delta7vs30 })

    // ── Muscles rolling 30j ──
    const workoutIds30 = workouts
      .filter(w => w.started_at >= since30)
      .map(w => w.id)

    if (workoutIds30.length > 0) {
      const { data: weData } = await supabase
        .from('workout_exercises')
        .select('exercise_id, workout_sets(weight_kg, reps)')
        .in('workout_id', workoutIds30)

      type WeRow = {
        exercise_id: string
        workout_sets: Array<{ weight_kg: number | null; reps: number | null }> | null
      }
      const exerciseIds = [...new Set((weData as WeRow[] ?? []).map(we => we.exercise_id))]

      if (exerciseIds.length > 0) {
        const { data: emData } = await supabase
          .from('exercise_muscles')
          .select('exercise_id, muscle, role, activation_pct')
          .in('exercise_id', exerciseIds)
          .in('role', ['primary', 'secondary'])

        type EmRow = {
          exercise_id: string
          muscle: string
          role: string
          activation_pct: number | null
        }

        const muscleVol: Record<string, number> = {}

        for (const em of (emData as EmRow[] ?? [])) {
          const exRows = (weData as WeRow[] ?? []).filter(we => we.exercise_id === em.exercise_id)
          for (const exRow of exRows) {
            const vol = (exRow.workout_sets ?? []).reduce(
              (s, set) => s + (set.weight_kg ?? 0) * (set.reps ?? 0) * ((em.activation_pct ?? 0) / 100),
              0,
            )
            const label = MUSCLE_LABEL_MAP[em.muscle] ?? em.muscle
            muscleVol[label] = (muscleVol[label] ?? 0) + vol
          }
        }

        const maxVol = Math.max(...Object.values(muscleVol), 1)
        const bars: MuscleBar[] = Object.entries(muscleVol)
          .map(([label, vol]) => ({
            label,
            pct: Math.round((vol / maxVol) * 100),
            volKg: Math.round(vol),
          }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 8)

        setMuscleBars(bars)
      }
    }

    // ── PRs récents ──
    const { data: setsData } = await supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps, pr_charge, pr_serie, logged_at,
        workout_exercises!inner(
          exercise_id,
          exercises!inner(name_fr)
        )
      `)
      .not('pr_charge', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(20)

    type SetRow = {
      weight_kg: number | null
      reps: number | null
      pr_charge: string | null
      pr_serie: string | null
      logged_at: string
      workout_exercises:
        | { exercise_id: string; exercises: { name_fr: string }[] | { name_fr: string } }[]
        | { exercise_id: string; exercises: { name_fr: string }[] | { name_fr: string } }
    }

    if (setsData) {
      // Déduplique par exercice — 1 PR par exercice max
      const seen = new Set<string>()
      const prs: RecentPR[] = []

      for (const row of setsData as SetRow[]) {
        const we = Array.isArray(row.workout_exercises)
          ? row.workout_exercises[0]
          : row.workout_exercises
        const exRaw = we.exercises
        const ex = Array.isArray(exRaw) ? exRaw[0] : exRaw
        if (!ex || seen.has(ex.name_fr)) continue
        seen.add(ex.name_fr)

        prs.push({
          exerciseName: ex.name_fr,
          prType:       'charge',
          value:        row.weight_kg ?? 0,
          unit:         'kg',
          level:        (row.pr_charge ?? 'bronze') as 'gold' | 'silver' | 'bronze',
          seanceDate:   row.logged_at,
        })

        if (prs.length >= 6) break
      }

      setRecentPRs(prs)
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = buildStyles(colors)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const prLevelColor = (level: 'gold' | 'silver' | 'bronze'): string =>
    level === 'gold' ? colors.prGold : level === 'silver' ? colors.prSilver : colors.prBronze

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
          <Text style={s.headerTitle}>ANALYTIQUE</Text>
          <View style={s.backBtnPlaceholder} />
        </View>

        {/* ── Métriques hero — séances + volume 90j ── */}
        <View style={s.heroCard}>
          <View style={s.heroCol}>
            <AnimatedCounter
              target={totalSeances}
              duration={1400}
              delay={0}
              style={s.heroValueAccent}
            />
            <Text style={s.heroLabel}>SÉANCES 90J</Text>
          </View>

          <View style={s.heroSep} />

          <View style={s.heroCol}>
            <AnimatedCounter
              target={totalVolumeKg}
              duration={1400}
              delay={120}
              style={s.heroValuePrimary}
              formatter={formatVolume}
            />
            <Text style={s.heroLabel}>KG TOTAL 90J</Text>
          </View>
        </View>

        {/* ── Volume rolling 7 / 30 / 90j ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>VOLUME ROLLING</Text>

          {volumeRolling == null ? (
            <View style={s.emptyCard}>
              <TrendingUp size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Lance ta première séance pour voir tes stats.</Text>
            </View>
          ) : (
            <View style={s.rollingCard}>
              {/* Ligne 7j — valeur hero accent */}
              <View style={s.rollingRow}>
                <View style={s.rollingLabelBlock}>
                  <Text style={s.rollingPeriod}>7J</Text>
                  <Text
                    style={[s.rollingDelta, { color: deltaColor(volumeRolling.delta7vs30, colors) }]}
                  >
                    {deltaSign(volumeRolling.delta7vs30)} vs moy.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol7j}
                    duration={1200}
                    delay={0}
                    style={s.rollingValueAccent}
                    formatter={formatVolume}
                  />
                  <Text style={s.rollingUnit}> kg</Text>
                </View>
              </View>

              <View style={s.rowSep} />

              {/* Ligne 30j */}
              <View style={s.rollingRow}>
                <Text style={s.rollingPeriod}>30J</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol30j}
                    duration={1200}
                    delay={80}
                    style={s.rollingValuePrimary}
                    formatter={formatVolume}
                  />
                  <Text style={s.rollingUnit}> kg</Text>
                </View>
              </View>

              <View style={s.rowSep} />

              {/* Ligne 90j */}
              <View style={s.rollingRow}>
                <Text style={s.rollingPeriod}>90J</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol90j}
                    duration={1200}
                    delay={160}
                    style={s.rollingValuePrimary}
                    formatter={formatVolume}
                  />
                  <Text style={s.rollingUnit}> kg</Text>
                </View>
              </View>

              {/* Barre visuelle 7j / 30j normalisée */}
              <View style={s.chartContainer}>
                <Text style={s.chartLabel}>RÉPARTITION 7J VS 30J</Text>
                <View style={s.barTrackWide}>
                  <View
                    style={[
                      s.barFill,
                      {
                        width: volumeRolling.vol30j > 0
                          ? `${Math.min(Math.round((volumeRolling.vol7j / volumeRolling.vol30j) * 100 * (7 / 30) * 4), 100)}%`
                          : '0%',
                      },
                    ]}
                  />
                </View>
                <View style={s.chartLegendRow}>
                  <Text style={s.chartLegendItem}>
                    <Text style={{ color: colors.accent }}>■</Text>
                    {'  '}7 derniers jours
                  </Text>
                  <Text style={s.chartLegendItem}>
                    <Text style={{ color: colors.textTertiary }}>■</Text>
                    {'  '}Objectif hebdo
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Muscles les plus travaillés (30j) ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>MUSCLES LES PLUS TRAVAILLÉS — 30J</Text>

          {muscleBars.length === 0 ? (
            <View style={s.emptyCard}>
              <Dumbbell size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Pas encore de données musculaires sur 30 jours.</Text>
            </View>
          ) : (
            <View style={s.muscleCard}>
              {muscleBars.map((bar, idx) => (
                <View key={idx} style={s.muscleRow}>
                  <Text style={s.muscleLabel} numberOfLines={1}>{bar.label}</Text>

                  <View style={s.muscleBarTrack}>
                    <View style={[s.muscleBarFill, { width: `${bar.pct}%` }]} />
                  </View>

                  <Text style={s.muscleVolume}>
                    {formatVolume(bar.volKg)}
                    <Text style={s.muscleVolumeUnit}> kg</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── PRs récents ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PRs RÉCENTS</Text>

          {recentPRs.length === 0 ? (
            <View style={s.emptyCard}>
              <Zap size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Aucun record enregistré. Lance-toi !</Text>
            </View>
          ) : (
            <View style={s.prsGrid}>
              {recentPRs.map((pr, idx) => {
                const levelColor = prLevelColor(pr.level)
                return (
                  <View key={idx} style={s.prCard}>
                    {/* Barre accent niveau */}
                    <View style={[s.prAccentBar, { backgroundColor: levelColor }]} />

                    <View style={s.prContent}>
                      {/* Nom exercice + icône */}
                      <View style={s.prHeader}>
                        <Text style={s.prExName} numberOfLines={1}>
                          {pr.exerciseName.toUpperCase()}
                        </Text>
                        <Zap size={12} color={levelColor} fill={levelColor} strokeWidth={0} />
                      </View>

                      {/* Valeur */}
                      <Text style={[s.prValue, { color: levelColor }]}>
                        {pr.value}
                        <Text style={s.prUnit}> {pr.unit}</Text>
                      </Text>

                      {/* Date */}
                      <Text style={s.prDate}>{formatShortDate(pr.seanceDate)}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Lien Armurerie */}
          <Pressable
            style={({ pressed }) => [s.armurerieBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/prs')}
            accessibilityRole="button"
            accessibilityLabel="Voir l'Armurerie complète"
          >
            <Text style={s.armurerieBtnText}>Voir l'Armurerie →</Text>
          </Pressable>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-native/no-unused-styles
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

    // ── Header ──
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
    headerTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      flex: 1,
      textAlign: 'center',
    },

    // ── Hero card ──
    heroCard: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s5,
      paddingHorizontal: spacing.s4,
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s6,
      alignItems: 'center',
    },
    heroCol: {
      flex: 1,
      alignItems: 'center',
    },
    heroSep: {
      width: 1,
      height: 48,
      backgroundColor: colors.separator,
    },
    // accent = métrique hero (séances)
    heroValueAccent: {
      ...typography.display,
      color: colors.accent,
      fontVariant: ['tabular-nums'] as const,
    },
    // primaire = volume
    heroValuePrimary: {
      ...typography.display,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as const,
    },
    heroLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
      textAlign: 'center',
    },

    // ── Section ──
    section: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s8,
    },
    sectionTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s4,
    },

    // ── Empty state ──
    emptyCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s6,
      alignItems: 'center',
      gap: spacing.s3,
    },
    emptyText: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
    },

    // ── Rolling card ──
    rollingCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      padding: spacing.s4,
    },
    rollingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.s3,
    },
    rollingLabelBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
    },
    rollingPeriod: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      width: 28,
    },
    rollingDelta: {
      ...typography.caption,
      fontFamily: font.medium,
      fontVariant: ['tabular-nums'] as const,
    },
    // 7j = accent (métrique la plus récente = hero)
    rollingValueAccent: {
      ...typography.title,
      color: colors.accent,
      fontVariant: ['tabular-nums'] as const,
    },
    rollingValuePrimary: {
      ...typography.title,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as const,
    },
    rollingUnit: {
      ...typography.caption,
      fontFamily: font.medium,
      color: colors.textSecondary,
    },
    rowSep: {
      height: 1,
      backgroundColor: colors.separator,
    },

    // Mini chart
    chartContainer: {
      marginTop: spacing.s5,
      gap: spacing.s2,
    },
    chartLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginBottom: spacing.s1,
    },
    barTrackWide: {
      height: 6,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    chartLegendRow: {
      flexDirection: 'row',
      gap: spacing.s6,
      marginTop: spacing.s2,
    },
    chartLegendItem: {
      ...typography.caption,
      color: colors.textTertiary,
    },

    // ── Muscle bars ──
    muscleCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s3,
      paddingHorizontal: spacing.s4,
    },
    muscleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.s3,
      gap: spacing.s3,
    },
    muscleLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      width: 100,
    },
    muscleBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    muscleBarFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    muscleVolume: {
      ...typography.mono,
      fontSize: 12,
      color: colors.textSecondary,
      width: 52,
      textAlign: 'right',
      fontVariant: ['tabular-nums'] as const,
    },
    muscleVolumeUnit: {
      ...typography.caption,
      fontFamily: font.mono,
      fontSize: 10,
      color: colors.textTertiary,
    },

    // ── PRs grid ──
    prsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s3,
      marginBottom: spacing.s4,
    },
    prCard: {
      width: '47%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    prAccentBar: {
      height: 3,
      width: '100%',
    },
    prContent: {
      padding: spacing.s4,
      gap: spacing.s1,
    },
    prHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.s1,
    },
    prExName: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
      flex: 1,
      marginRight: spacing.s1,
    },
    prValue: {
      ...typography.title,
      fontVariant: ['tabular-nums'] as const,
    },
    prUnit: {
      ...typography.caption,
      fontFamily: font.regular,
      color: colors.textSecondary,
    },
    prDate: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s1,
    },

    // ── Armurerie btn ──
    armurerieBtn: {
      alignSelf: 'center',
      paddingVertical: spacing.s2,
      minHeight: 44,
      justifyContent: 'center',
    },
    armurerieBtnText: {
      ...typography.body,
      color: colors.accent,
    },

    bottomSpacer: {
      height: spacing.s12,
    },
  })
}
