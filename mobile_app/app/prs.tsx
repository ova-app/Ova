import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { log } from '@/lib/logger'
import {
  Dimensions,
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  StatusBar,
  ScrollView,
} from 'react-native'
import { Canvas, Circle as SkiaCircle, RadialGradient, vec } from '@shopify/react-native-skia'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Zap, Flame, Shield, Pin } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { emptyStateRecipe } from '@/constants/recipes'
import { muscleGroupLabel } from '@/lib/muscles'
import { pinExerciseAsFeatured, clearFeaturedPr, getManualFeaturedPr } from '@/lib/featuredPr'

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
  podiumCharge: PodiumSlot[] // top 3 pr_charge par poids, triés gold→silver→bronze
  podiumSerie: PodiumSlot[] // top 3 pr_serie, triés gold→silver→bronze
}

// ─── Raw DB row type ──────────────────────────────────────────────────────────

// Lignes brutes des requêtes Supabase (client non typé — cast via `unknown`, ORA-036)
interface WorkoutIdRow {
  id: string
}
interface WeQueryRow {
  id: string
  exercise_id: string
}
interface ExQueryRow {
  id: string
  name_fr: string
  muscle_group: string
}
interface SetQueryRow {
  weight_kg: number | null
  reps: number | null
  pr_charge: string | null
  pr_serie: string | null
  workout_exercise_id: string
}

interface RawSetRow {
  weight_kg: number | null
  reps: number | null
  pr_charge: string | null
  pr_serie: string | null
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

function levelShortLabel(level: PrLevel): string {
  return level === 'gold' ? 'OR' : level === 'silver' ? 'ARG' : 'BRZ'
}

function resolveWE(raw: RawSetRow['workout_exercises']): {
  exercise_id: string
  exercises: { name_fr: string; muscle_group: string }[] | { name_fr: string; muscle_group: string }
} {
  return Array.isArray(raw) ? raw[0] : raw
}

function resolveExercise(
  raw: { name_fr: string; muscle_group: string }[] | { name_fr: string; muscle_group: string }
): { name_fr: string; muscle_group: string } {
  return Array.isArray(raw) ? raw[0] : raw
}

// ─── Build podiums from raw sets ──────────────────────────────────────────────

function buildPodium(
  entries: { weight_kg: number; reps: number | null; level: PrLevel }[]
): PodiumSlot[] {
  const byLevel = new Map<PrLevel, PodiumSlot>()
  for (const e of entries) {
    const existing = byLevel.get(e.level)
    if (!existing || e.weight_kg > existing.weight_kg) {
      byLevel.set(e.level, { level: e.level, weight_kg: e.weight_kg, reps: e.reps })
    }
  }
  return ([...byLevel.values()] as PodiumSlot[]).sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]
  )
}

function buildExercisePRs(rows: RawSetRow[]): ExercisePR[] {
  type EntryBuf = {
    weight_kg: number
    reps: number | null
    level: PrLevel
    nameFr: string
    muscleGroup: string
  }

  const chargeMap = new Map<string, EntryBuf[]>()
  const serieMap = new Map<string, EntryBuf[]>()

  for (const row of rows) {
    if (!row.workout_exercises) continue
    const we = resolveWE(row.workout_exercises)
    if (!we) continue
    const ex = resolveExercise(we.exercises)
    if (!ex) continue

    const id = we.exercise_id
    const nameFr = ex.name_fr
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
    const serieEntries = serieMap.get(id) ?? []
    const anyEntry = chargeEntries[0] ?? serieEntries[0]
    if (!anyEntry) continue

    result.push({
      exerciseId: id,
      nameFr: anyEntry.nameFr,
      muscleGroup: anyEntry.muscleGroup,
      podiumCharge: buildPodium(chargeEntries),
      podiumSerie: buildPodium(serieEntries),
    })
  }

  // Gold first, puis par poids max descendant
  result.sort((a, b) => {
    const aGold = a.podiumCharge.some((s) => s.level === 'gold') ? 0 : 1
    const bGold = b.podiumCharge.some((s) => s.level === 'gold') ? 0 : 1
    if (aGold !== bGold) return aGold - bGold
    const aMax = a.podiumCharge[0]?.weight_kg ?? 0
    const bMax = b.podiumCharge[0]?.weight_kg ?? 0
    return bMax - aMax
  })

  return result
}

// ─── Podium à hauteurs (charge max) ───────────────────────────────────────────
// Or au centre surélevé (hero), Argent à gauche, Bronze à droite — plus bas.
// La hiérarchie est portée par la HAUTEUR de la marche, pas par la couleur seule.

const CARD_W = Dimensions.get('window').width - spacing.s4 * 2

const BAR_HEIGHT: Record<PrLevel, number> = { gold: 84, silver: 56, bronze: 42 }
const VISUAL_ORDER: PrLevel[] = ['silver', 'gold', 'bronze'] // disposition olympique

function levelColorOf(level: PrLevel, colors: ReturnType<typeof useTheme>['colors']): string {
  return level === 'gold' ? colors.prGold : level === 'silver' ? colors.prSilver : colors.prBronze
}

// Lueur radiale derrière la marche Or — dramatise le record absolu.
function GoldGlow(): React.JSX.Element {
  const r = CARD_W * 0.42
  const cx = CARD_W / 2
  const H = BAR_HEIGHT.gold + 40
  return (
    <Canvas
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: H }}
      pointerEvents="none"
    >
      <SkiaCircle cx={cx} cy={H} r={r}>
        <RadialGradient c={vec(cx, H)} r={r} colors={['#FAC77533', '#FAC77500']} />
      </SkiaCircle>
    </Canvas>
  )
}

interface PodiumStepProps {
  slot: PodiumSlot | undefined
  level: PrLevel
  colors: ReturnType<typeof useTheme>['colors']
}

function PodiumStep({ slot, level, colors }: PodiumStepProps): React.JSX.Element {
  const { unit, toDisplay } = useWeightUnit()
  const c = levelColorOf(level, colors)
  const isGold = level === 'gold'

  if (!slot) {
    // Marche vide — réserve l'emprise pour garder l'alignement du podium
    return (
      <View style={podSt.col}>
        <View style={podSt.metricSpacer} />
        <View
          style={[
            podSt.bar,
            {
              height: BAR_HEIGHT[level] * 0.5,
              backgroundColor: colors.backgroundTertiary,
              opacity: 0.4,
            },
          ]}
        />
      </View>
    )
  }

  return (
    <View style={podSt.col}>
      <View style={podSt.metric}>
        <Text
          style={[podSt.weight, isGold && podSt.weightGold, { color: c }]}
          accessibilityLabel={`${Math.round(toDisplay(slot.weight_kg))} ${unit}`}
        >
          {Math.round(toDisplay(slot.weight_kg))}
          <Text style={[podSt.unit, { color: c }]}> {unit}</Text>
        </Text>
        {slot.reps !== null && slot.reps > 0 && (
          <Text style={[podSt.reps, { color: colors.textTertiary }]}>× {slot.reps}</Text>
        )}
      </View>
      <View
        style={[
          podSt.bar,
          {
            height: BAR_HEIGHT[level],
            backgroundColor: `${c}1A`,
            borderColor: `${c}55`,
          },
        ]}
      >
        {isGold && <View style={[podSt.barCap, { backgroundColor: c }]} />}
        <Text style={[podSt.medal, { color: c }]}>{levelShortLabel(level)}</Text>
      </View>
    </View>
  )
}

function ChargePodium({
  slots,
  colors,
}: {
  slots: PodiumSlot[]
  colors: ReturnType<typeof useTheme>['colors']
}): React.JSX.Element {
  const byLevel = new Map<PrLevel, PodiumSlot>(slots.map((s) => [s.level, s]))
  const hasGold = byLevel.has('gold')
  return (
    <View style={podSt.wrap}>
      {hasGold && <GoldGlow />}
      <View style={podSt.row}>
        {VISUAL_ORDER.map((level) => (
          <PodiumStep key={level} slot={byLevel.get(level)} level={level} colors={colors} />
        ))}
      </View>
    </View>
  )
}

const podSt = StyleSheet.create({
  wrap: {
    justifyContent: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s2,
  },
  col: {
    flex: 1,
    alignItems: 'center',
  },
  metric: {
    alignItems: 'center',
    marginBottom: spacing.s2,
  },
  metricSpacer: {
    height: 24,
    marginBottom: spacing.s2,
  },
  weight: {
    fontSize: 20,
    fontFamily: font.bold,
    letterSpacing: -0.4,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  weightGold: {
    fontSize: 30,
    fontFamily: font.extraBold,
    letterSpacing: -0.8,
    lineHeight: 32,
  },
  unit: {
    fontSize: 12,
    fontFamily: font.regular,
    letterSpacing: 0,
  },
  reps: {
    ...typography.micro,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    borderWidth: 1,
    borderBottomWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.s2,
    overflow: 'hidden',
  },
  barCap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  medal: {
    fontSize: 10,
    fontFamily: font.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
})

// ─── ExerciseCard (inline) ────────────────────────────────────────────────────

interface ExerciseCardProps {
  item: ExercisePR
  colors: ReturnType<typeof useTheme>['colors']
  onPin: (item: ExercisePR) => void
  isPinned: boolean
}

function ExerciseCard({ item, colors, onPin, isPinned }: ExerciseCardProps): React.JSX.Element {
  const { unit, toDisplay } = useWeightUnit()
  const hasCharge = item.podiumCharge.length > 0
  const hasSerie = item.podiumSerie.length > 0
  const hasGold = item.podiumCharge.some((s) => s.level === 'gold')
  // Meilleure série = la plus haute marche disponible (gold > silver > bronze)
  const bestSerie = item.podiumSerie[0]

  return (
    <View
      style={[
        cardSt.card,
        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
        hasGold && { borderColor: `${colors.prGold}40` },
      ]}
    >
      {/* En-tête exercice */}
      <View style={cardSt.header}>
        <View style={cardSt.headerText}>
          <Text style={[cardSt.exerciseName, { color: colors.textPrimary }]} numberOfLines={1}>
            {item.nameFr}
          </Text>
          <Text style={[cardSt.muscleGroup, { color: colors.textTertiary }]}>
            {muscleGroupLabel(item.muscleGroup).toUpperCase()}
          </Text>
        </View>

        {/* ORA-076 — épingle ce PR en vitrine du profil (best-effort, no-op pré-migration) */}
        {hasCharge && (
          <Pressable
            onPress={() => onPin(item)}
            style={({ pressed }) => [cardSt.pinBtn, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={
              isPinned
                ? 'Dé-épingler ce PR de la vitrine du profil'
                : 'Épingler ce PR en vitrine du profil'
            }
            accessibilityState={{ selected: isPinned }}
            hitSlop={6}
          >
            <Pin
              size={16}
              color={isPinned ? colors.accent : colors.textTertiary}
              fill={isPinned ? colors.accent : 'transparent'}
              strokeWidth={2}
            />
          </Pressable>
        )}
      </View>

      {/* Podium charge max — hero de la card */}
      {hasCharge && (
        <View style={cardSt.podiumSection}>
          <View style={cardSt.sectionHeader}>
            <Zap size={11} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
            <Text style={[cardSt.sectionLabel, { color: colors.textTertiary }]}>CHARGE MAX</Text>
          </View>
          <ChargePodium slots={item.podiumCharge} colors={colors} />
        </View>
      )}

      {/* Footer compact — meilleure série */}
      {hasSerie && bestSerie && (
        <View style={[cardSt.serieFooter, { borderTopColor: colors.separator }]}>
          <View style={cardSt.serieLeft}>
            <Flame size={12} color={colors.accent} fill={colors.accent} strokeWidth={0} />
            <Text style={[cardSt.serieLabel, { color: colors.textTertiary }]}>MEILLEURE SÉRIE</Text>
          </View>
          <Text style={[cardSt.serieValue, { color: colors.textSecondary }]}>
            {Math.round(toDisplay(bestSerie.weight_kg))}
            <Text style={cardSt.serieUnit}> {unit}</Text>
            {bestSerie.reps !== null && bestSerie.reps > 0 && (
              <Text style={{ color: colors.textTertiary }}> × {bestSerie.reps}</Text>
            )}
          </Text>
        </View>
      )}
    </View>
  )
}

const cardSt = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s4,
    marginHorizontal: spacing.s4,
    marginBottom: spacing.s3,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.s4,
  },
  headerText: {
    flex: 1,
    gap: spacing.s1,
    marginRight: spacing.s2,
  },
  exerciseName: {
    fontSize: 16,
    fontFamily: font.bold,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  muscleGroup: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pinBtn: {
    width: touchTarget.min,
    height: touchTarget.min,
    marginTop: -spacing.s2,
    marginRight: -spacing.s2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  podiumSection: {
    gap: spacing.s3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  sectionLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  serieFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.s4,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
  },
  serieLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  serieLabel: {
    ...typography.micro,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  serieValue: {
    fontSize: 15,
    fontFamily: font.bold,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  serieUnit: {
    fontSize: 11,
    fontFamily: font.regular,
  },
})

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard({
  colors,
}: {
  colors: ReturnType<typeof useTheme>['colors']
}): React.JSX.Element {
  return (
    <View
      style={[
        cardSt.card,
        {
          backgroundColor: colors.backgroundSecondary,
          borderColor: colors.border,
          gap: spacing.s4,
          marginBottom: spacing.s3,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View
          style={{
            width: 160,
            height: 15,
            borderRadius: radius.sm,
            backgroundColor: colors.backgroundTertiary,
          }}
        />
        <View
          style={{
            width: 36,
            height: 12,
            borderRadius: radius.sm,
            backgroundColor: colors.backgroundTertiary,
          }}
        />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ alignItems: 'center', gap: spacing.s2 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: radius.full,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
            <View
              style={{
                width: 48,
                height: 18,
                borderRadius: radius.sm,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
            <View
              style={{
                width: 24,
                height: 10,
                borderRadius: radius.sm,
                backgroundColor: colors.backgroundTertiary,
              }}
            />
          </View>
        ))}
      </View>
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PrsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [prs, setPrs] = useState<ExercisePR[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null) // ORA-076 — exo épinglé en vitrine

  const muscleGroups = useMemo((): string[] => {
    const seen = new Set<string>()
    for (const pr of prs) if (pr.muscleGroup) seen.add(pr.muscleGroup)
    return [...seen].sort((a, b) => muscleGroupLabel(a).localeCompare(muscleGroupLabel(b), 'fr'))
  }, [prs])

  const filteredPrs = useMemo((): ExercisePR[] => {
    if (!selectedMuscle) return prs
    return prs.filter((pr) => pr.muscleGroup === selectedMuscle)
  }, [prs, selectedMuscle])

  const fetchPRs = useCallback(async (): Promise<void> => {
    setLoading(true)
    setHasError(false)

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    // ORA-076 — exercice actuellement épinglé en vitrine (état du bouton pin). Best-effort,
    // hors du chemin critique (no-op pré-migration).
    void getManualFeaturedPr(user.id).then((featured) =>
      setPinnedId(featured?.manual ? featured.exercise_id : null)
    )

    // Step 1 : workout IDs de l'user
    const { data: workoutsData, error: wErr } = await supabase
      .from('workouts')
      .select('id')
      .eq('user_id', user.id)

    if (wErr || !workoutsData) {
      log.error('[prs] workouts query error:', wErr)
      setHasError(true)
      setLoading(false)
      return
    }
    if (workoutsData.length === 0) {
      setPrs([])
      setLoading(false)
      return
    }

    const workoutIds = (workoutsData as unknown as WorkoutIdRow[]).map((w) => w.id)

    // Step 2 : workout_exercises (pas de join — FK non déclaré en DB)
    const { data: weRows, error: weError } = await supabase
      .from('workout_exercises')
      .select('id, exercise_id')
      .in('workout_id', workoutIds)

    if (weError || !weRows) {
      log.error('[prs] workout_exercises query error:', weError)
      setHasError(true)
      setLoading(false)
      return
    }
    if (weRows.length === 0) {
      setPrs([])
      setLoading(false)
      return
    }

    // Step 3 : infos exercice (query séparée — FK exercise_id non contrainte)
    const exerciseIds = [...new Set((weRows as unknown as WeQueryRow[]).map((w) => w.exercise_id))]
    const { data: exRows, error: exError } = await supabase
      .from('exercises')
      .select('id, name_fr, muscle_group')
      .in('id', exerciseIds)

    if (exError || !exRows) {
      log.error('[prs] exercises query error:', exError)
      setHasError(true)
      setLoading(false)
      return
    }

    const exMap = new Map<string, { name_fr: string; muscle_group: string }>()
    for (const ex of exRows as unknown as ExQueryRow[]) {
      exMap.set(String(ex.id), { name_fr: ex.name_fr, muscle_group: ex.muscle_group })
    }

    type WeInfo = { exercise_id: string; name_fr: string; muscle_group: string }
    const weMap = new Map<string, WeInfo>()
    for (const we of weRows as unknown as WeQueryRow[]) {
      const exInfo = exMap.get(String(we.exercise_id))
      if (exInfo && we.id && we.exercise_id) {
        weMap.set(String(we.id), {
          exercise_id: String(we.exercise_id),
          name_fr: exInfo.name_fr,
          muscle_group: exInfo.muscle_group,
        })
      }
    }

    const weIds = [...weMap.keys()]
    if (weIds.length === 0) {
      setPrs([])
      setLoading(false)
      return
    }

    // Step 4 : sets de ces workout_exercises
    const { data: sets, error: setsError } = await supabase
      .from('workout_sets')
      .select('weight_kg, reps, pr_charge, pr_serie, workout_exercise_id')
      .in('workout_exercise_id', weIds)

    if (setsError || !sets) {
      log.error('[prs] workout_sets query error:', setsError)
      setHasError(true)
      setLoading(false)
      return
    }

    const allRows: RawSetRow[] = []
    for (const set of sets as unknown as SetQueryRow[]) {
      if (!set.pr_charge && !set.pr_serie) continue
      const info = weMap.get(String(set.workout_exercise_id))
      if (!info) continue
      allRows.push({
        weight_kg: set.weight_kg,
        reps: set.reps,
        pr_charge: set.pr_charge,
        pr_serie: set.pr_serie,
        workout_exercises: {
          exercise_id: info.exercise_id,
          exercises: { name_fr: info.name_fr, muscle_group: info.muscle_group },
        },
      })
    }

    setPrs(buildExercisePRs(allRows))
    setLoading(false)
  }, [router])

  useEffect(() => {
    void fetchPRs()
  }, [fetchPRs])

  // ORA-076 — toggle vitrine profil : 1er tap épingle, 2e tap dé-épingle (retour auto-pick).
  const handlePin = useCallback(
    (item: ExercisePR): void => {
      void (async () => {
        if (pinnedId === item.exerciseId) {
          const ok = await clearFeaturedPr()
          if (ok) setPinnedId(null)
        } else {
          const ok = await pinExerciseAsFeatured(item.exerciseId, item.nameFr)
          if (ok) setPinnedId(item.exerciseId)
        }
      })()
    },
    [pinnedId]
  )

  const s = buildStyles(colors)
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
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} colors={colors} />
          ))}
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
          <Text style={empty.subtitle}>Lance ta première séance — tes PRs s'afficheront ici.</Text>
        </View>
      </SafeAreaView>
    )
  }

  // ── Liste ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      <FlatList
        data={filteredPrs}
        keyExtractor={(item) => item.exerciseId}
        renderItem={({ item }) => (
          <ExerciseCard
            item={item}
            colors={colors}
            onPin={handlePin}
            isPinned={pinnedId === item.exerciseId}
          />
        )}
        ListHeaderComponent={
          <>
            {Header}

            {/* Chips filtres groupe musculaire */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chipsContainer}
            >
              <Pressable
                style={({ pressed }) => [
                  s.chip,
                  !selectedMuscle && s.chipActive,
                  { backgroundColor: !selectedMuscle ? colors.accent : colors.backgroundSecondary },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setSelectedMuscle(null)}
                accessibilityRole="button"
                accessibilityLabel="Tous les groupes musculaires"
              >
                <Text
                  style={[
                    s.chipLabel,
                    { color: !selectedMuscle ? colors.background : colors.textSecondary },
                  ]}
                >
                  TOUS
                </Text>
              </Pressable>

              {muscleGroups.map((group) => {
                const active = selectedMuscle === group
                return (
                  <Pressable
                    key={group}
                    style={({ pressed }) => [
                      s.chip,
                      active && s.chipActive,
                      { backgroundColor: active ? colors.accent : colors.backgroundSecondary },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setSelectedMuscle(active ? null : group)}
                    accessibilityRole="button"
                    accessibilityLabel={muscleGroupLabel(group)}
                  >
                    <Text
                      style={[
                        s.chipLabel,
                        { color: active ? colors.background : colors.textSecondary },
                      ]}
                    >
                      {muscleGroupLabel(group).toUpperCase()}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>

            <View style={s.countRow}>
              <Text style={s.countValue}>{filteredPrs.length}</Text>
              <Text style={s.countLabel}>
                {filteredPrs.length === 1 ? ' exercice' : ' exercices'}
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
    chipsContainer: {
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s3,
      gap: spacing.s2,
      flexDirection: 'row',
    },
    chip: {
      paddingHorizontal: spacing.s3,
      paddingVertical: spacing.s2,
      borderRadius: radius.full,
    },
    chipActive: {},
    chipLabel: {
      fontSize: 11,
      fontFamily: font.bold,
      letterSpacing: 0.8,
    },
  })
}
