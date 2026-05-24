import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Zap, Flame } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

type MuscleRole = 'primary' | 'secondary' | 'stabilizer'

interface Exercise {
  id: string
  name_fr: string
  equipment_type: string | null
  is_compound: boolean
  description_fr: string | null
  muscle_group: string | null
}

interface MuscleMapping {
  muscle: string
  fascicle: string | null
  role: MuscleRole
  activation_pct: number
}

interface RecordStats {
  maxCharge: number | null
  maxSerie: { weight: number; reps: number } | null
}

interface RecentSession {
  workoutId: string
  startedAt: string
  nSets: number
  maxWeight: number | null
  delta: number | null // kg vs session précédente
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MUSCLE_LABEL_MAP: Record<string, string> = {
  grand_pectoral: 'Grand pectoral',
  deltoide: 'Deltoïde',
  grand_dorsal: 'Grand dorsal',
  trapeze: 'Trapèze',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quadriceps: 'Quadriceps',
  ischio_jambiers: 'Ischio-jambiers',
  fessier_maximus: 'Fessier maximus',
  fessier_median: 'Fessier médian',
  fessier_minimus: 'Fessier minimus',
  mollets: 'Mollets',
  abdominaux: 'Abdominaux',
  grand_rond: 'Grand rond',
  rhomboide: 'Rhomboïdes',
  erecteurs_rachis: 'Érecteurs rachis',
  avant_bras: 'Avant-bras',
  brachial: 'Brachial',
  brachioradial: 'Brachioradial',
  adducteurs: 'Adducteurs',
  iliopsoas: 'Iliopsoas',
  infra_epineux: 'Infra-épineux',
  serratus_anterieur: 'Serratus ant.',
}

const FASCICLE_LABEL_MAP: Record<string, string> = {
  faisceau_claviculaire: 'faisceau claviculaire',
  faisceau_sternal: 'faisceau sternal',
  faisceau_abdominal: 'faisceau abdominal',
  faisceau_anterieur: 'faisceau antérieur',
  faisceau_median: 'faisceau médian',
  faisceau_posterieur: 'faisceau postérieur',
  faisceau_inferieur: 'faisceau inférieur',
  faisceau_superieur: 'faisceau supérieur',
  faisceau_moyen: 'faisceau moyen',
  chef_long: 'chef long',
  chef_court: 'chef court',
  chef_lateral: 'chef latéral',
  chef_medial: 'chef médial',
  brachial: 'brachial',
  rectus_femoris: 'rectus femoris',
  vastus_lateralis: 'vastus lateralis',
  vastus_medialis: 'vastus medialis',
  biceps_femoral: 'biceps fémoral',
  semi_membraneux: 'semi-membraneux',
  semi_tendineux: 'semi-tendineux',
  gastrocnemien: 'gastrocnémien',
  gastrocnemien_lateral: 'gastrocnémien latéral',
  gastrocnemien_medial: 'gastrocnémien médial',
  soleus: 'soléaire',
  obliques_externes: 'obliques ext.',
  obliques_internes: 'obliques int.',
  rectus_abdominis: 'rectus abdominis',
  transverse: 'transverse',
  extenseurs_poignet: 'extenseurs poignet',
  flechisseurs_doigts: 'fléchisseurs doigts',
  flechisseurs_poignet: 'fléchisseurs poignet',
  palmaire_long: 'palmaire long',
}

function muscleName(m: MuscleMapping): string {
  const base = MUSCLE_LABEL_MAP[m.muscle] ?? m.muscle
  if (!m.fascicle) return base
  const fascLabel = FASCICLE_LABEL_MAP[m.fascicle] ?? m.fascicle.replace(/_/g, ' ')
  return `${base} — ${fascLabel}`
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ExerciseDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const router = useRouter()

  const [exercise, setExercise] = useState<Exercise | null>(null)
  const [muscles, setMuscles] = useState<MuscleMapping[]>([])
  const [records, setRecords] = useState<RecordStats>({ maxCharge: null, maxSerie: null })
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([])
  const [loading, setLoading] = useState<boolean>(true)

  const fetchExercise = useCallback(async (): Promise<void> => {
    if (!id) return

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Exercise
    const { data: exData } = await supabase
      .from('exercises')
      .select('id, name_fr, equipment_type, is_compound, description_fr, muscle_group')
      .eq('id', id)
      .single()

    if (!exData) {
      setLoading(false)
      return
    }
    setExercise(exData as Exercise)

    // Muscles
    const { data: emData } = await supabase
      .from('exercise_muscles')
      .select('muscle, fascicle, role, activation_pct')
      .eq('exercise_id', id)
      .order('activation_pct', { ascending: false })

    if (emData) {
      setMuscles(emData as MuscleMapping[])
    }

    // PR history — top sets par charge
    const { data: setsData } = await supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps,
        workout_exercises!inner(
          workout_id,
          workouts!inner(user_id, started_at)
        )
      `)
      .eq('workout_exercises.exercise_id', id)
      .eq('workout_exercises.workouts.user_id', user.id)
      .not('weight_kg', 'is', null)
      .order('weight_kg', { ascending: false })
      .limit(50)

    if (setsData && setsData.length > 0) {
      const maxCharge = (setsData[0].weight_kg as number)
      const maxSerieRow = [...setsData].sort((a, b) =>
        ((b.weight_kg as number) * (b.reps as number)) - ((a.weight_kg as number) * (a.reps as number))
      )[0]

      setRecords({
        maxCharge,
        maxSerie: {
          weight: maxSerieRow.weight_kg as number,
          reps: maxSerieRow.reps as number,
        },
      })
    }

    // 3 dernières sessions
    const { data: weData } = await supabase
      .from('workout_exercises')
      .select(`
        workout_id,
        workouts!inner(started_at, user_id),
        workout_sets(weight_kg, reps)
      `)
      .eq('exercise_id', id)
      .eq('workouts.user_id', user.id)
      .order('workouts.started_at', { ascending: false })
      .limit(4)

    if (weData && weData.length > 0) {
      type WeSessionRow = {
        workout_id: string
        workouts: { started_at: string; user_id: string }[] | { started_at: string; user_id: string }
        workout_sets: Array<{ weight_kg: number | null; reps: number | null }> | null
      }
      const typedWeData = weData as WeSessionRow[]
      const sessions: RecentSession[] = typedWeData.slice(0, 3).map((we, idx) => {
        const sets = (we.workout_sets ?? []) as Array<{ weight_kg: number | null; reps: number | null }>
        const maxW = Math.max(...sets.map(s => s.weight_kg ?? 0), 0)
        const nS = sets.length

        let delta: number | null = null
        if (idx < typedWeData.length - 1) {
          const prevSets = (typedWeData[idx + 1].workout_sets ?? []) as Array<{ weight_kg: number | null; reps: number | null }>
          const prevMaxW = Math.max(...prevSets.map(s => s.weight_kg ?? 0), 0)
          if (prevMaxW > 0 && maxW > 0) {
            delta = maxW - prevMaxW
          }
        }

        const workoutsRaw = we.workouts
        const workoutsObj = Array.isArray(workoutsRaw) ? workoutsRaw[0] : workoutsRaw

        return {
          workoutId: we.workout_id,
          startedAt: workoutsObj.started_at,
          nSets: nS,
          maxWeight: maxW > 0 ? maxW : null,
          delta,
        }
      })
      setRecentSessions(sessions)
    }

    setLoading(false)
  }, [id])

  useEffect(() => {
    void fetchExercise()
  }, [fetchExercise])

  const s = buildStyles(colors)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!exercise) {
    return (
      <View style={s.loader}>
        <Text style={{ ...typography.body, color: colors.textSecondary }}>Exercice introuvable.</Text>
      </View>
    )
  }

  const primaryMuscles = muscles.filter(m => m.role === 'primary')
  const secondaryMuscles = muscles.filter(m => m.role === 'secondary')
  const stabilizerMuscles = muscles.filter(m => m.role === 'stabilizer')

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

          <Text style={s.headerTitle} numberOfLines={1}>{exercise.name_fr}</Text>

          <View style={s.backBtnPlaceholder} />
        </View>

        {/* ── Muscles ── */}
        {muscles.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>MUSCLES</Text>

            {primaryMuscles.length > 0 && (
              <View style={s.muscleGroup}>
                <Text style={s.muscleGroupLabel}>PRIMARY</Text>
                {primaryMuscles.map((m, idx) => (
                  <View key={idx} style={s.muscleRow}>
                    <View style={[s.muscleDot, { backgroundColor: colors.accent }]} />
                    <Text style={[s.muscleName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {muscleName(m)}
                    </Text>
                    <Text
                      style={[s.musclePct, { color: colors.accent }]}
                      accessibilityLabel={`${m.activation_pct} pourcent`}
                    >
                      {m.activation_pct}%
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {secondaryMuscles.length > 0 && (
              <View style={s.muscleGroup}>
                <Text style={s.muscleGroupLabel}>SECONDARY</Text>
                {secondaryMuscles.map((m, idx) => (
                  <View key={idx} style={s.muscleRow}>
                    <View style={[s.muscleDot, { backgroundColor: colors.prGold }]} />
                    <Text style={[s.muscleName, { color: colors.textSecondary }]} numberOfLines={1}>
                      {muscleName(m)}
                    </Text>
                    <Text
                      style={[s.musclePct, { color: colors.prGold }]}
                      accessibilityLabel={`${m.activation_pct} pourcent`}
                    >
                      {m.activation_pct}%
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {stabilizerMuscles.length > 0 && (
              <View style={s.muscleGroup}>
                <Text style={s.muscleGroupLabel}>STABILIZER</Text>
                {stabilizerMuscles.map((m, idx) => (
                  <View key={idx} style={s.muscleRow}>
                    <View style={[s.muscleDot, { backgroundColor: colors.textTertiary }]} />
                    <Text style={[s.muscleName, { color: colors.textTertiary }]} numberOfLines={1}>
                      {muscleName(m)}
                    </Text>
                    <Text
                      style={[s.musclePct, { color: colors.textTertiary }]}
                      accessibilityLabel={`${m.activation_pct} pourcent`}
                    >
                      {m.activation_pct}%
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ── Mes Records ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>MES RECORDS</Text>

          <View style={s.recordsRow}>
            {/* Charge max */}
            <View style={s.recordCard}>
              <Zap size={20} color={colors.accent} style={s.recordIcon} />
              <Text style={s.recordCardLabel}>CHARGE MAX</Text>
              <Text style={s.recordValue} accessibilityLabel={records.maxCharge != null ? `${records.maxCharge} kilogrammes` : 'Aucun record'}>
                {records.maxCharge != null ? `${records.maxCharge} kg` : '—'}
              </Text>
            </View>

            {/* Meilleure série */}
            <View style={s.recordCard}>
              <Flame size={20} color={colors.accent} style={s.recordIcon} />
              <Text style={s.recordCardLabel}>MEILLEURE SÉRIE</Text>
              <Text style={s.recordValue} accessibilityLabel={
                records.maxSerie != null
                  ? `${records.maxSerie.weight} kilogrammes ${records.maxSerie.reps} répétitions`
                  : 'Aucun record'
              }>
                {records.maxSerie != null ? `${records.maxSerie.weight} × ${records.maxSerie.reps}` : '—'}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Historique ── */}
        {recentSessions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>HISTORIQUE</Text>

            <View style={s.historyCard}>
              {recentSessions.map((session, idx) => {
                const dateStr = new Date(session.startedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                })
                const isLast = idx === recentSessions.length - 1
                const hasDelta = session.delta != null
                const deltaPositive = (session.delta ?? 0) > 0
                const deltaZero = (session.delta ?? 0) === 0
                const deltaColor = !hasDelta || deltaZero
                  ? colors.textTertiary
                  : deltaPositive ? colors.success : colors.error

                const deltaText = !hasDelta || deltaZero
                  ? '—'
                  : deltaPositive
                    ? `+${session.delta!} kg`
                    : `${session.delta!} kg`

                return (
                  <Pressable
                    key={idx}
                    style={({ pressed }) => [
                      s.historyRow,
                      !isLast && s.historyRowBorder,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => router.push(`/history/${session.workoutId}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Séance du ${dateStr}`}
                  >
                    <Text style={s.historyDate}>{dateStr}</Text>

                    <Text style={s.historyStats} numberOfLines={1}>
                      {session.nSets} série{session.nSets > 1 ? 's' : ''}
                      {session.maxWeight != null ? ` · ${session.maxWeight} kg max` : ''}
                    </Text>

                    <Text style={[s.historyDelta, { color: deltaColor }]}>
                      {deltaText}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
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
    headerTitle: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      flex: 1,
      textAlign: 'center',
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
    muscleGroup: {
      marginBottom: spacing.s4,
    },
    muscleGroupLabel: {
      fontSize: 11,
      fontFamily: font.bold,
      color: colors.textTertiary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: spacing.s2,
    },
    muscleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.s2,
      gap: spacing.s3,
    },
    muscleDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    muscleName: {
      ...typography.body,
      flex: 1,
    },
    musclePct: {
      fontFamily: font.mono,
      fontVariant: ['tabular-nums'],
      fontSize: 13,
      fontWeight: '600',
    },

    // Records
    recordsRow: {
      flexDirection: 'row',
      gap: spacing.s3,
    },
    recordCard: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
    },
    recordIcon: {
      marginBottom: spacing.s2,
    },
    recordCardLabel: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.textTertiary,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: spacing.s2,
    },
    recordValue: {
      fontSize: 28,
      fontFamily: font.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.8,
      fontVariant: ['tabular-nums'],
    },

    // History
    historyCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.s3,
      paddingHorizontal: spacing.s4,
      minHeight: 52,
    },
    historyRowBorder: {
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    historyDate: {
      ...typography.caption,
      color: colors.textTertiary,
      width: 56,
    },
    historyStats: {
      ...typography.body,
      color: colors.textSecondary,
      flex: 1,
    },
    historyDelta: {
      fontFamily: font.bold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
  })
}
