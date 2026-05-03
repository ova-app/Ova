import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
type PrLevel = 'gold' | 'silver' | 'bronze' | null
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetDetail {
  set_number: number
  weight_kg: number
  reps: number
  is_pr: boolean
  pr_charge: PrLevel
  pr_serie: PrLevel
}

interface ExerciseDetail {
  name: string
  equipment: string | null
  order_index: number
  sets: SetDetail[]
}

interface MuscleShare {
  group: string
  pct: number
}

interface WorkoutDetail {
  id: string
  title: string
  started_at: string
  duration_sec: number
  exercises: ExerciseDetail[]
  total_volume: number
  total_sets: number
  pr_count: number
  photo_url: string | null
  muscle_breakdown: MuscleShare[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barre: 'Barre', halteres: 'Haltères', poulie: 'Poulie',
  machine: 'Machine', poids_corps: 'Poids du corps',
  smith: 'Smith', kettlebell: 'Kettlebell',
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (id) fetchWorkout(id) }, [id])

  async function fetchWorkout(workoutId: string) {
    // Step 1: workout + structure (no exercises join — avoids cross-table RLS issues)
    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id, title, started_at, duration_sec, photo_url,
        workout_exercises (
          id, order_index, exercise_id, pr_exercice,
          workout_sets ( set_number, weight_kg, reps, is_pr, pr_charge, pr_serie )
        )
      `)
      .eq('id', workoutId)
      .single()

    setLoading(false)
    if (error || !data) return

    // Step 2: fetch exercise names separately (same pattern as library.tsx — known to work)
    const weRows = (data.workout_exercises ?? []) as any[]
    const exerciseIds = [...new Set(weRows.map(we => we.exercise_id).filter(Boolean))]
    let exMap: Record<string, { name_fr: string; equipment_type: string | null }> = {}

    if (exerciseIds.length > 0) {
      const { data: exData } = await supabase
        .from('exercises')
        .select('id, name_fr, equipment_type')
        .in('id', exerciseIds)
      if (exData) {
        for (const ex of exData as any[]) exMap[ex.id] = ex
      }
    }

    const exercises: ExerciseDetail[] = weRows
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(we => ({
        name: exMap[we.exercise_id]?.name_fr ?? 'Exercice',
        equipment: exMap[we.exercise_id]?.equipment_type ?? null,
        order_index: we.order_index,
        sets: ((we.workout_sets ?? []) as any[])
          .sort((a: any, b: any) => a.set_number - b.set_number)
          .map((s: any) => ({
            set_number: s.set_number,
            weight_kg: s.weight_kg ?? 0,
            reps: s.reps ?? 0,
            is_pr: s.is_pr ?? false,
            pr_charge: (s.pr_charge ?? null) as PrLevel,
            pr_serie: (s.pr_serie ?? null) as PrLevel,
          })),
      }))

    const allSets = exercises.flatMap(e => e.sets)

    // Step 3: muscle breakdown (primary counts double)
    let muscle_breakdown: MuscleShare[] = []
    if (exerciseIds.length > 0) {
      const { data: muscleData } = await supabase
        .from('exercise_muscles')
        .select('exercise_id, role, muscles(muscle_group)')
        .in('exercise_id', exerciseIds)

      if (muscleData) {
        const score: Record<string, number> = {}
        for (const em of muscleData as any[]) {
          const group: string = (em.muscles as any)?.muscle_group ?? 'Autre'
          score[group] = (score[group] ?? 0) + (em.role === 'primary' ? 2 : 1)
        }
        const total = Object.values(score).reduce((a, b) => a + b, 0)
        if (total > 0) {
          muscle_breakdown = Object.entries(score)
            .map(([group, s]) => ({ group, pct: Math.round(s / total * 100) }))
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 6)
        }
      }
    }

    setWorkout({
      id: data.id,
      title: data.title ?? 'Séance',
      started_at: data.started_at,
      duration_sec: data.duration_sec ?? 0,
      exercises,
      total_volume: allSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
      total_sets: allSets.length,
      pr_count: allSets.filter(s => s.is_pr).length,
      photo_url: (data as any).photo_url ?? null,
      muscle_breakdown,
    })
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Séance introuvable</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerMeta}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {workout.title}
          </Text>
          <Text style={[styles.headerDate, { color: colors.textSecondary }]}>
            {formatDate(workout.started_at)} · {formatTime(workout.started_at)}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Photo */}
        {workout.photo_url && (
          <Image
            source={{ uri: workout.photo_url }}
            style={styles.workoutPhoto}
            resizeMode="cover"
          />
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatBox label="Durée" value={formatDuration(workout.duration_sec)} colors={colors} />
          <StatBox label="Séries" value={String(workout.total_sets)} colors={colors} />
          <StatBox
            label="Volume"
            value={workout.total_volume >= 1000
              ? `${(workout.total_volume / 1000).toFixed(1)}t`
              : `${workout.total_volume.toLocaleString('fr')} kg`}
            colors={colors}
          />
          {workout.pr_count > 0 && (
            <StatBox label="PRs" value={String(workout.pr_count)} colors={colors} highlight />
          )}
        </View>

        {/* Muscles travaillés */}
        {workout.muscle_breakdown.length > 0 && (
          <View style={[mbStyles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0 }]}>Muscles travaillés</Text>
            {workout.muscle_breakdown.map(({ group, pct }) => (
              <View key={group} style={mbStyles.row}>
                <Text style={[mbStyles.name, { color: colors.textPrimary }]}>{group}</Text>
                <View style={[mbStyles.barBg, { backgroundColor: colors.backgroundSecondary }]}>
                  <View style={[mbStyles.barFill, { width: `${pct}%` as any, backgroundColor: colors.accent }]} />
                </View>
                <Text style={[mbStyles.pct, { color: colors.textSecondary }]}>{pct}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Exercices */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Exercices</Text>
        {workout.exercises.map((ex, idx) => (
          <View key={idx} style={[styles.exerciseCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <View style={styles.exerciseHeader}>
              <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{ex.name}</Text>
              {ex.equipment && (
                <Text style={[styles.exerciseEquip, { color: colors.textSecondary }]}>
                  {EQUIPMENT_LABELS[ex.equipment] ?? ex.equipment}
                </Text>
              )}
            </View>

            <View style={[styles.setHeaderRow, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.setCol, styles.setColLabel, { color: colors.textSecondary }]}>Série</Text>
              <Text style={[styles.setCol, styles.setColLabel, { color: colors.textSecondary }]}>Poids</Text>
              <Text style={[styles.setCol, styles.setColLabel, { color: colors.textSecondary }]}>Reps</Text>
              <View style={{ width: 60 }} />
            </View>

            {ex.sets.map((set, sIdx) => (
              <View key={sIdx} style={styles.setRow}>
                <Text style={[styles.setCol, { color: colors.textPrimary }]}>{set.set_number}</Text>
                <Text style={[styles.setCol, { color: colors.textPrimary }]}>
                  {set.weight_kg % 1 === 0 ? set.weight_kg : set.weight_kg.toFixed(1)} kg
                </Text>
                <Text style={[styles.setCol, { color: colors.textPrimary }]}>{set.reps}</Text>
                <PRBadges set={set} colors={colors} />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

// ─── PRBadges ────────────────────────────────────────────────────────────────

const PR_LEVEL_COLORS: Record<NonNullable<PrLevel>, string> = {
  gold: '#FAC775', silver: '#C0C0C0', bronze: '#CD7F32',
}
const PR_LEVEL_EMOJI: Record<NonNullable<PrLevel>, string> = {
  gold: '🥇', silver: '🥈', bronze: '🥉',
}

function PRBadges({ set, colors }: { set: SetDetail; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (!set.pr_charge && !set.pr_serie) return <View style={{ width: 60 }} />
  return (
    <View style={styles.prIcons}>
      {set.pr_charge && (
        <View style={[styles.prBadge, { backgroundColor: PR_LEVEL_COLORS[set.pr_charge] + '25', borderColor: PR_LEVEL_COLORS[set.pr_charge] + '60' }]}>
          <Zap size={10} color={PR_LEVEL_COLORS[set.pr_charge]} fill={PR_LEVEL_COLORS[set.pr_charge]} />
          <Text style={[styles.prBadgeText, { color: PR_LEVEL_COLORS[set.pr_charge] }]}>
            {PR_LEVEL_EMOJI[set.pr_charge]}
          </Text>
        </View>
      )}
      {set.pr_serie && (
        <View style={[styles.prBadge, { backgroundColor: PR_LEVEL_COLORS[set.pr_serie] + '25', borderColor: PR_LEVEL_COLORS[set.pr_serie] + '60' }]}>
          <Flame size={10} color={PR_LEVEL_COLORS[set.pr_serie]} fill={PR_LEVEL_COLORS[set.pr_serie]} />
          <Text style={[styles.prBadgeText, { color: PR_LEVEL_COLORS[set.pr_serie] }]}>
            {PR_LEVEL_EMOJI[set.pr_serie]}
          </Text>
        </View>
      )}
    </View>
  )
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, colors, highlight = false }: {
  label: string; value: string; highlight?: boolean
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={[
      statStyles.box,
      { backgroundColor: colors.card, borderColor: colors.separator },
      highlight && { backgroundColor: colors.prAmber + '15', borderColor: colors.prAmber + '40' },
    ]}>
      <Text style={[statStyles.value, { color: highlight ? colors.prAmber : colors.textPrimary }]}>
        {value}
      </Text>
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

const mbStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 13, fontWeight: '500', width: 96 },
  barBg: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4 },
  pct: { fontSize: 12, width: 34, textAlign: 'right' },
})

const statStyles = StyleSheet.create({
  box: { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 4, borderWidth: 1 },
  value: { fontSize: 17, fontWeight: '700' },
  label: { fontSize: 10 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14,
    gap: 8, borderBottomWidth: 1,
  },
  backBtn: { paddingTop: 2 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 28 },
  headerMeta: { flex: 1, gap: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerDate: { fontSize: 12 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 60, gap: 4 },
  workoutPhoto: { width: '100%', height: 220, borderRadius: 14, marginBottom: 8 },

  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },

  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },

  exerciseCard: { borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, gap: 8 },
  exerciseHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  exerciseName: { fontSize: 15, fontWeight: '700', flex: 1 },
  exerciseEquip: { fontSize: 12 },

  setHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 4, borderBottomWidth: 1,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  setCol: { flex: 1, fontSize: 14 },
  setColLabel: { fontSize: 11, fontWeight: '500' },

  prIcons: { width: 60, flexDirection: 'row', gap: 3, justifyContent: 'flex-end' },
  prBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  prBadgeText: { fontSize: 10, fontWeight: '700' },
})