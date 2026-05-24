import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Trophy } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

type PrLevel = 'gold' | 'silver' | 'bronze'
type FilterLevel = 'all' | PrLevel

interface PodiumEntry {
  level: PrLevel
  weightKg: number
  reps: number | null
  date: string | null
}

interface ExercisePRCard {
  exerciseId: string
  exerciseName: string
  bestLevel: PrLevel
  podium: Partial<Record<PrLevel, PodiumEntry>>
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PODIUM_LEVELS: PrLevel[] = ['gold', 'silver', 'bronze']

function podiumColors(colors: ReturnType<typeof useTheme>['colors']): Record<PrLevel, string> {
  return { gold: colors.prGold, silver: colors.prSilver, bronze: colors.prBronze }
}

const PODIUM_LABELS: Record<PrLevel, string> = {
  gold:   'OR',
  silver: 'ARGENT',
  bronze: 'BRONZE',
}

const FILTER_LABELS: Record<FilterLevel, string> = {
  all:    'Tous',
  gold:   'Or',
  silver: 'Argent',
  bronze: 'Bronze',
}

const LEVEL_ORDER: Record<PrLevel, number> = { gold: 0, silver: 1, bronze: 2 }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PrsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [cards, setCards] = useState<ExercisePRCard[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [filter, setFilter] = useState<FilterLevel>('all')

  const fetchPRs = useCallback(async (): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    // Récupérer tous les sets avec un pr_charge non null
    const { data: setsData } = await supabase
      .from('workout_sets')
      .select(`
        id, weight_kg, reps, pr_charge,
        workout_exercises!inner(
          exercise_id,
          exercises!inner(name_fr),
          workouts!inner(started_at, user_id)
        )
      `)
      .eq('workout_exercises.workouts.user_id', user.id)
      .not('pr_charge', 'is', null)
      .order('weight_kg', { ascending: false })

    if (!setsData) {
      setLoading(false)
      return
    }

    // Agréger par exercice : garder meilleur set par niveau
    const exerciseMap = new Map<string, ExercisePRCard>()

    type WeType = {
      exercise_id: string
      exercises: { name_fr: string }[] | { name_fr: string }
      workouts: { started_at: string; user_id: string }[] | { started_at: string; user_id: string }
    }
    type SetRow = typeof setsData[number] & { workout_exercises: WeType[] | WeType }

    for (const set of setsData as SetRow[]) {
      const weRaw = set.workout_exercises
      const we = Array.isArray(weRaw) ? weRaw[0] : weRaw

      const exerciseId = we.exercise_id
      const exRaw = we.exercises
      const exObj = Array.isArray(exRaw) ? exRaw[0] : exRaw
      const exerciseName = exObj.name_fr
      const workoutsRaw = we.workouts
      const workoutsObj = Array.isArray(workoutsRaw) ? workoutsRaw[0] : workoutsRaw
      const date = workoutsObj.started_at
      const level = set.pr_charge as PrLevel

      if (!exerciseMap.has(exerciseId)) {
        exerciseMap.set(exerciseId, {
          exerciseId,
          exerciseName,
          bestLevel: level,
          podium: {},
        })
      }

      const card = exerciseMap.get(exerciseId)!

      // Pour chaque niveau, on garde l'entrée avec le poids le plus lourd
      if (!card.podium[level] || (set.weight_kg ?? 0) > card.podium[level]!.weightKg) {
        card.podium[level] = {
          level,
          weightKg: set.weight_kg ?? 0,
          reps: set.reps ?? null,
          date,
        }
      }

      // Mettre à jour bestLevel (gold > silver > bronze)
      if (LEVEL_ORDER[level] < LEVEL_ORDER[card.bestLevel]) {
        card.bestLevel = level
      }
    }

    // Trier : gold first, puis silver, puis bronze
    const sorted = Array.from(exerciseMap.values()).sort((a, b) =>
      LEVEL_ORDER[a.bestLevel] - LEVEL_ORDER[b.bestLevel]
    )

    setCards(sorted)
    setLoading(false)
  }, [router])

  useEffect(() => {
    void fetchPRs()
  }, [fetchPRs])

  const s = buildStyles(colors)
  const PC = podiumColors(colors)

  // Filtrer les cards
  const visibleCards = filter === 'all'
    ? cards
    : cards.filter(c => c.podium[filter] != null)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

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

          <View style={s.headerTitles}>
            <Text style={s.title}>Armurerie</Text>
            <Text style={s.subtitle}>Tes records absolus</Text>
          </View>
        </View>

        {/* ── Filtres ── */}
        <View style={s.filtersRow}>
          {(['all', 'gold', 'silver', 'bronze'] as FilterLevel[]).map(f => {
            const active = filter === f
            const chipColor = f === 'all' ? null : PC[f as PrLevel]

            return (
              <Pressable
                key={f}
                style={({ pressed }) => [
                  s.filterChip,
                  active && s.filterChipActive,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setFilter(f)}
                accessibilityRole="button"
                accessibilityLabel={`Filtrer ${FILTER_LABELS[f]}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[
                  s.filterChipText,
                  active && { color: chipColor ?? colors.textPrimary },
                ]}>
                  {FILTER_LABELS[f]}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* ── Cards ── */}
        {visibleCards.length === 0 ? (
          <View style={s.emptyState}>
            <Text style={s.emptyText}>
              {filter === 'all'
                ? 'Aucun record encore. Lance ta première séance !'
                : `Aucun record ${FILTER_LABELS[filter].toLowerCase()} pour l'instant.`}
            </Text>
          </View>
        ) : (
          <View style={s.cardsList}>
            {visibleCards.map(card => (
              <View key={card.exerciseId} style={s.exerciseCard}>
                {/* Nom + trophy si gold */}
                <View style={s.cardHeader}>
                  <Text style={s.exerciseName} numberOfLines={2}>{card.exerciseName}</Text>
                  {card.bestLevel === 'gold' && (
                    <Trophy size={16} color={colors.prGold} style={s.trophyIcon} />
                  )}
                </View>

                {/* Podium 3 colonnes */}
                <View style={s.podiumRow}>
                  {PODIUM_LEVELS.map(level => {
                    const entry = card.podium[level]
                    const levelColor = PC[level]
                    const isEmpty = !entry

                    return (
                      <View key={level} style={s.podiumCol}>
                        {/* Label niveau */}
                        <Text style={[s.podiumLevelLabel, { color: isEmpty ? colors.textTertiary : levelColor }]}>
                          {PODIUM_LABELS[level]}
                        </Text>

                        {/* Valeur */}
                        {isEmpty ? (
                          <Text style={s.podiumEmpty}>—</Text>
                        ) : (
                          <>
                            <Text style={[s.podiumValue, { color: levelColor }]} accessibilityLabel={`${entry.weightKg} kilogrammes`}>
                              {entry.weightKg}
                              <Text style={s.podiumUnit}> kg</Text>
                            </Text>
                            {entry.reps != null && (
                              <Text style={s.podiumReps} accessibilityLabel={`${entry.reps} répétitions`}>
                                × {entry.reps}
                              </Text>
                            )}
                            <Text style={s.podiumDate}>
                              {formatShortDate(entry.date)}
                            </Text>
                          </>
                        )}
                      </View>
                    )
                  })}
                </View>
              </View>
            ))}
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
      alignItems: 'flex-start',
      paddingTop: spacing.s12,
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s6,
      gap: spacing.s3,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    headerTitles: {
      flex: 1,
    },
    title: {
      ...typography.title,
      color: colors.textPrimary,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.s1,
    },

    // Filtres
    filtersRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    filterChip: {
      height: 36,
      paddingHorizontal: spacing.s4,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterChipActive: {
      backgroundColor: colors.backgroundTertiary,
    },
    filterChipText: {
      ...typography.caption,
      color: colors.textSecondary,
      letterSpacing: 0.3,
    },

    // Empty state
    emptyState: {
      paddingHorizontal: spacing.s6,
      paddingTop: spacing.s10,
      alignItems: 'center',
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },

    // Cards list
    cardsList: {
      paddingHorizontal: spacing.s4,
      gap: spacing.s3,
    },

    // Exercise card
    exerciseCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      padding: spacing.s4,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s4,
    },
    exerciseName: {
      ...typography.body,
      fontFamily: 'Barlow_700Bold',
      color: colors.textPrimary,
      flex: 1,
    },
    trophyIcon: {
      marginLeft: spacing.s2,
    },

    // Podium
    podiumRow: {
      flexDirection: 'row',
      gap: spacing.s3,
    },
    podiumCol: {
      flex: 1,
      alignItems: 'center',
    },
    podiumLevelLabel: {
      fontSize: 10,
      fontFamily: 'Barlow_700Bold',
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: spacing.s2,
    },
    podiumEmpty: {
      ...typography.body,
      color: colors.textTertiary,
      marginTop: spacing.s1,
    },
    podiumValue: {
      fontSize: 24,
      fontFamily: 'Barlow_800ExtraBold',
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
    podiumUnit: {
      fontSize: 12,
      fontFamily: 'Barlow_400Regular',
    },
    podiumReps: {
      ...typography.caption,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    podiumDate: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s1,
      textAlign: 'center',
    },
  })
}
