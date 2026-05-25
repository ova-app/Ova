import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Zap, Flame, Shield } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { emptyStateRecipe } from '@/constants/recipes'

// ─── Types ───────────────────────────────────────────────────────────────────

type PrLevel = 'gold' | 'silver' | 'bronze'

interface PodiumSlot {
  level: PrLevel
  weight_kg: number
  reps: number | null
}

interface ExercisePR {
  exerciseId: string
  nameFr: string
  muscleGroup: string
  podiumCharge: PodiumSlot[]    // top 3 pr_charge par poids, triés gold→silver→bronze
  podiumSerie: PodiumSlot[]     // top 3 pr_serie, triés gold→silver→bronze
}

// ─── Raw DB row type ──────────────────────────────────────────────────────────

interface RawSetRow {
  weight_kg:  number | null
  reps:       number | null
  pr_charge:  string | null
  pr_serie:   string | null
  workout_exercises:
    | {
        exercise_id: string
        exercises:
          | { name_fr: string; muscle_group: string }[]
          | { name_fr: string; muscle_group: string }
      }[]
    | {
        exercise_id: string
        exercises:
          | { name_fr: string; muscle_group: string }[]
          | { name_fr: string; muscle_group: string }
      }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LEVEL_ORDER: Record<PrLevel, number> = { gold: 0, silver: 1, bronze: 2 }

const MUSCLE_LABELS: Record<string, string> = {
  pectoraux:       'Pectoraux',
  dos:             'Dos',
  epaules:         'Épaules',
  biceps:          'Biceps',
  triceps:         'Triceps',
  quadriceps:      'Quadriceps',
  ischio_jambiers: 'Ischio-jambiers',
  fessiers:        'Fessiers',
  mollets:         'Mollets',
  abdominaux:      'Abdominaux',
  avant_bras:      'Avant-bras',
}

function muscleLabel(raw: string): string {
  return MUSCLE_LABELS[raw] ?? raw.replace(/_/g, ' ')
}

function levelShortLabel(level: PrLevel): string {
  return level === 'gold' ? 'OR' : level === 'silver' ? 'ARG' : 'BRZ'
}

function resolveWE(
  raw: RawSetRow['workout_exercises'],
): {
  exercise_id: string
  exercises: { name_fr: string; muscle_group: string }[] | { name_fr: string; muscle_group: string }
} {
  return Array.isArray(raw) ? raw[0] : raw
}

function resolveExercise(
  raw: { name_fr: string; muscle_group: string }[] | { name_fr: string; muscle_group: string },
): { name_fr: string; muscle_group: string } {
  return Array.isArray(raw) ? raw[0] : raw
}

// ─── Build podiums from raw sets ──────────────────────────────────────────────

function buildPodium(
  entries: { weight_kg: number; reps: number | null; level: PrLevel }[],
): PodiumSlot[] {
  const byLevel = new Map<PrLevel, PodiumSlot>()
  for (const e of entries) {
    const existing = byLevel.get(e.level)
    if (!existing || e.weight_kg > existing.weight_kg) {
      byLevel.set(e.level, { level: e.level, weight_kg: e.weight_kg, reps: e.reps })
    }
  }
  return ([...byLevel.values()] as PodiumSlot[]).sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  )
}

function buildExercisePRs(rows: RawSetRow[]): ExercisePR[] {
  type EntryBuf = { weight_kg: number; reps: number | null; level: PrLevel; nameFr: string; muscleGroup: string }

  const chargeMap = new Map<string, EntryBuf[]>()
  const serieMap  = new Map<string, EntryBuf[]>()

  for (const row of rows) {
    if (!row.workout_exercises) continue
    const we = resolveWE(row.workout_exercises)
    if (!we) continue
    const ex = resolveExercise(we.exercises)
    if (!ex) continue

    const id          = we.exercise_id
    const nameFr      = ex.name_fr
    const muscleGroup = ex.muscle_group

    if (row.pr_charge !== null) {
      const level = row.pr_charge as PrLevel
      const arr = chargeMap.get(id) ?? []
      arr.push({ weight_kg: row.weight_kg ?? 0, reps: row.reps, level, nameFr, muscleGroup })
      chargeMap.set(id, arr)
    }

    if (row.pr_serie !== null) {
      const level = row.pr_serie as PrLevel
      const arr = serieMap.get(id) ?? []
      arr.push({ weight_kg: row.weight_kg ?? 0, reps: row.reps, level, nameFr, muscleGroup })
      serieMap.set(id, arr)
    }
  }

  const allIds = new Set([...chargeMap.keys(), ...serieMap.keys()])
  const result: ExercisePR[] = []

  for (const id of allIds) {
    const chargeEntries = chargeMap.get(id) ?? []
    const serieEntries  = serieMap.get(id)  ?? []
    const anyEntry = chargeEntries[0] ?? serieEntries[0]
    if (!anyEntry) continue

    result.push({
      exerciseId:    id,
      nameFr:        anyEntry.nameFr,
      muscleGroup:   anyEntry.muscleGroup,
      podiumCharge:  buildPodium(chargeEntries),
      podiumSerie:   buildPodium(serieEntries),
    })
  }

  // Gold first, puis par poids max descendant
  result.sort((a, b) => {
    const aGold = a.podiumCharge.some(s => s.level === 'gold') ? 0 : 1
    const bGold = b.podiumCharge.some(s => s.level === 'gold') ? 0 : 1
    if (aGold !== bGold) return aGold - bGold
    const aMax = a.podiumCharge[0]?.weight_kg ?? 0
    const bMax = b.podiumCharge[0]?.weight_kg ?? 0
    return bMax - aMax
  })

  return result
}

// ─── PodiumSlotView (inline) ──────────────────────────────────────────────────

interface PodiumSlotViewProps {
  slot: PodiumSlot
  type: 'charge' | 'serie'
  colors: ReturnType<typeof useTheme>['colors']
}

function PodiumSlotView({ slot, type, colors }: PodiumSlotViewProps): React.JSX.Element {
  const levelColor =
    slot.level === 'gold'   ? colors.prGold   :
    slot.level === 'silver' ? colors.prSilver :
    colors.prBronze

  const iconColor = type === 'charge' ? colors.prGold : colors.accent

  return (
    <View style={slotSt.col}>
      <View style={[slotSt.iconBadge, { backgroundColor: `${levelColor}18` }]}>
        {type === 'charge'
          ? <Zap   size={13} color={iconColor} fill={iconColor} strokeWidth={0} />
          : <Flame size={13} color={iconColor} fill={iconColor} strokeWidth={0} />
        }
      </View>
      <Text
        style={[slotSt.weight, { color: levelColor }]}
        accessibilityLabel={`${slot.weight_kg} kilogrammes`}
      >
        {slot.weight_kg}
        <Text style={slotSt.unit}> kg</Text>
      </Text>
      {slot.reps !== null && slot.reps > 0 && (
        <Text style={[slotSt.reps, { color: colors.textTertiary }]}>
          {slot.reps} reps
        </Text>
      )}
      <Text style={[slotSt.levelLabel, { color: levelColor }]}>
        {levelShortLabel(slot.level)}
      </Text>
    </View>
  )
}

const slotSt = StyleSheet.create({
  col: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.s1,
    paddingVertical: spacing.s2,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s1,
  },
  weight: {
    fontSize: 18,
    fontFamily: font.bold,
    letterSpacing: -0.3,
    lineHeight: 22,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  unit: {
    fontSize: 12,
    fontFamily: font.regular,
    letterSpacing: 0,
  },
  reps: {
    ...typography.caption,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  levelLabel: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 14,
  },
})

// ─── ExerciseCard (inline) ────────────────────────────────────────────────────

interface ExerciseCardProps {
  item: ExercisePR
  colors: ReturnType<typeof useTheme>['colors']
}

function ExerciseCard({ item, colors }: ExerciseCardProps): React.JSX.Element {
  const hasCharge = item.podiumCharge.length > 0
  const hasSerie  = item.podiumSerie.length > 0
  const hasGold   = item.podiumCharge.some(s => s.level === 'gold')

  return (
    <View style={[cardSt.card, { backgroundColor: colors.backgroundSecondary }]}>

      {/* En-tête exercice */}
      <View style={cardSt.header}>
        <View style={cardSt.headerText}>
          <Text style={[cardSt.exerciseName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.nameFr}
          </Text>
          <Text style={[cardSt.muscleGroup, { color: colors.textTertiary }]}>
            {muscleLabel(item.muscleGroup).toUpperCase()}
          </Text>
        </View>

        {hasGold && (
          <View style={[cardSt.goldPill, { backgroundColor: `${colors.prGold}18` }]}>
            <Zap size={11} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
            <Text style={[cardSt.goldPillText, { color: colors.prGold }]}>OR</Text>
          </View>
        )}
      </View>

      {/* Section charge max */}
      {hasCharge && (
        <View style={cardSt.section}>
          <View style={cardSt.sectionHeader}>
            <Zap size={11} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
            <Text style={[cardSt.sectionLabel, { color: colors.textTertiary }]}>
              CHARGE MAX
            </Text>
          </View>
          <View style={cardSt.podiumRow}>
            {item.podiumCharge.map(slot => (
              <PodiumSlotView key={slot.level} slot={slot} type="charge" colors={colors} />
            ))}
            {Array.from({ length: 3 - item.podiumCharge.length }).map((_, i) => (
              <View key={`ec-${i}`} style={slotSt.col} />
            ))}
          </View>
        </View>
      )}

      {/* Séparateur */}
      {hasCharge && hasSerie && (
        <View style={[cardSt.divider, { backgroundColor: colors.separator }]} />
      )}

      {/* Section meilleure série */}
      {hasSerie && (
        <View style={cardSt.section}>
          <View style={cardSt.sectionHeader}>
            <Flame size={11} color={colors.accent} fill={colors.accent} strokeWidth={0} />
            <Text style={[cardSt.sectionLabel, { color: colors.textTertiary }]}>
              MEILLEURE SÉRIE
            </Text>
          </View>
          <View style={cardSt.podiumRow}>
            {item.podiumSerie.map(slot => (
              <PodiumSlotView key={slot.level} slot={slot} type="serie" colors={colors} />
            ))}
            {Array.from({ length: 3 - item.podiumSerie.length }).map((_, i) => (
              <View key={`es-${i}`} style={slotSt.col} />
            ))}
          </View>
        </View>
      )}
    </View>
  )
}

const cardSt = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s4,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.s4,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
    marginRight: spacing.s3,
  },
  exerciseName: {
    fontSize: 15,
    fontFamily: font.bold,
    letterSpacing: 0,
    lineHeight: 20,
  },
  muscleGroup: {
    ...typography.caption,
    textTransform: 'uppercase',
  },
  goldPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.full,
  },
  goldPillText: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1,
  },
  section: {
    gap: spacing.s3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  sectionLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  podiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  divider: {
    height: 1,
    marginVertical: spacing.s4,
  },
})

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }): React.JSX.Element {
  return (
    <View style={[cardSt.card, { backgroundColor: colors.backgroundSecondary, gap: spacing.s4, marginBottom: spacing.s3 }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ width: 160, height: 15, borderRadius: radius.sm, backgroundColor: colors.backgroundTertiary }} />
        <View style={{ width: 36, height: 12, borderRadius: radius.sm, backgroundColor: colors.backgroundTertiary }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[0, 1, 2].map(i => (
          <View key={i} style={{ alignItems: 'center', gap: spacing.s2 }}>
            <View style={{ width: 28, height: 28, borderRadius: radius.full, backgroundColor: colors.backgroundTertiary }} />
            <View style={{ width: 48, height: 18, borderRadius: radius.sm,  backgroundColor: colors.backgroundTertiary }} />
            <View style={{ width: 24, height: 10, borderRadius: radius.sm,  backgroundColor: colors.backgroundTertiary }} />
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PrsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router     = useRouter()

  const [prs, setPrs]         = useState<ExercisePR[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)

  const fetchPRs = useCallback(async (): Promise<void> => {
    setLoading(true)
    setHasError(false)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    const { data, error } = await supabase
      .from('workouts')
      .select(`
        workout_exercises (
          exercise_id,
          exercises (name_fr, muscle_group),
          workout_sets (weight_kg, reps, pr_charge, pr_serie)
        )
      `)
      .eq('user_id', user.id)
      .limit(10000)

    if (error || !data) {
      setHasError(true)
      setLoading(false)
      return
    }

    // Flatten all sets from all workouts with their exercise info
    const allRows: RawSetRow[] = []
    for (const workout of data as any[]) {
      for (const we of workout.workout_exercises || []) {
        const ex = Array.isArray(we.exercises) ? we.exercises[0] : we.exercises
        if (!ex) continue
        for (const set of we.workout_sets || []) {
          if (set.pr_charge || set.pr_serie) {
            allRows.push({
              weight_kg: set.weight_kg,
              reps: set.reps,
              pr_charge: set.pr_charge,
              pr_serie: set.pr_serie,
              workout_exercises: {
                exercise_id: we.exercise_id,
                exercises: ex,
              },
            } as RawSetRow)
          }
        }
      }
    }

    setPrs(buildExercisePRs(allRows))
    setLoading(false)
  }, [router])

  useEffect(() => {
    void fetchPRs()
  }, [fetchPRs])

  const s     = buildStyles(colors)
  const empty = emptyStateRecipe('history', colors)

  // ── Header partagé ────────────────────────────────────────────────────────

  const Header = (
    <View style={s.header}>
      <Pressable
        style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
        hitSlop={8}
      >
        <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
      </Pressable>
      <Text style={s.headerTitle}>ARMURERIE</Text>
      <View style={s.headerSpacer} />
    </View>
  )

  // ── Skeleton ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        {Header}
        <View style={s.skeletonList}>
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} colors={colors} />)}
        </View>
      </SafeAreaView>
    )
  }

  // ── Erreur ────────────────────────────────────────────────────────────────

  if (hasError) {
    return (
      <SafeAreaView style={s.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        {Header}
        <View style={empty.container}>
          <View style={empty.icon}>
            <Shield size={28} color={colors.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={empty.title}>Erreur de chargement</Text>
          <Text style={empty.subtitle}>Vérifie ta connexion et réessaie.</Text>
          <Pressable
            style={({ pressed }) => [empty.cta, pressed && { opacity: 0.7 }]}
            onPress={() => void fetchPRs()}
            accessibilityRole="button"
            accessibilityLabel="Réessayer"
          >
            <Text style={empty.ctaLabel}>Réessayer</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (prs.length === 0) {
    return (
      <SafeAreaView style={s.safeArea}>
        <StatusBar barStyle="light-content" backgroundColor={colors.background} />
        {Header}
        <View style={empty.container}>
          <View style={empty.icon}>
            <Zap size={28} color={colors.textTertiary} strokeWidth={1.5} />
          </View>
          <Text style={empty.title}>Aucun record pour l'instant</Text>
          <Text style={empty.subtitle}>
            Lance ta première séance — tes PRs s'afficheront ici.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Liste ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <FlatList
        data={prs}
        keyExtractor={item => item.exerciseId}
        renderItem={({ item }) => <ExerciseCard item={item} colors={colors} />}
        ListHeaderComponent={
          <>
            {Header}
            <View style={s.countRow}>
              <Text style={s.countValue}>{prs.length}</Text>
              <Text style={s.countLabel}>
                {prs.length === 1 ? ' exercice' : ' exercices'}
              </Text>
            </View>
          </>
        }
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
      />
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s4,
      paddingTop: spacing.s4,
      paddingBottom: spacing.s3,
      minHeight: touchTarget.comfort,
    },
    backBtn: {
      width: touchTarget.min,
      height: touchTarget.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: {
      width: touchTarget.min,
    },
    countRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s4,
    },
    countValue: {
      fontSize: 22,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 28,
      fontVariant: ['tabular-nums'],
    },
    countLabel: {
      fontSize: 15,
      fontFamily: font.regular,
      color: colors.textSecondary,
      letterSpacing: 0,
      lineHeight: 22,
    },
    listContent: {
      paddingBottom: spacing.s12,
    },
    skeletonList: {
      paddingTop: spacing.s2,
    },
  })
}
