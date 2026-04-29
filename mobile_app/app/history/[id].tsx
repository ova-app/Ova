import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SetDetail {
  set_number: number
  weight_kg: number
  reps: number
  is_pr: boolean
  pr_charge: boolean
  pr_serie: boolean
  pr_1rm: boolean
}

interface ExerciseDetail {
  name: string
  equipment: string | null
  order_index: number
  sets: SetDetail[]
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
    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id, title, started_at, duration_sec,
        workout_exercises (
          order_index,
          exercises ( name_fr, equipment_type ),
          workout_sets ( set_number, weight_kg, reps, is_pr, pr_charge, pr_serie, pr_1rm )
        )
      `)
      .eq('id', workoutId)
      .single()

    setLoading(false)
    if (error || !data) return

    const exercises: ExerciseDetail[] = ((data.workout_exercises ?? []) as any[])
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map(we => ({
        name: we.exercises?.name_fr ?? 'Exercice',
        equipment: we.exercises?.equipment_type ?? null,
        order_index: we.order_index,
        sets: ((we.workout_sets ?? []) as any[])
          .sort((a: any, b: any) => a.set_number - b.set_number)
          .map((s: any) => ({
            set_number: s.set_number,
            weight_kg: s.weight_kg ?? 0,
            reps: s.reps ?? 0,
            is_pr: s.is_pr ?? false,
            pr_charge: s.pr_charge ?? false,
            pr_serie: s.pr_serie ?? false,
            pr_1rm: s.pr_1rm ?? false,
          })),
      }))

    const allSets = exercises.flatMap(e => e.sets)

    setWorkout({
      id: data.id,
      title: data.title ?? 'Séance',
      started_at: data.started_at,
      duration_sec: data.duration_sec ?? 0,
      exercises,
      total_volume: allSets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0),
      total_sets: allSets.length,
      pr_count: allSets.filter(s => s.is_pr).length,
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

function PRBadges({ set, colors }: { set: SetDetail; colors: ReturnType<typeof useTheme>['colors'] }) {
  if (!set.is_pr) return <View style={{ width: 60 }} />
  return (
    <View style={styles.prIcons}>
      {set.pr_charge && <Zap size={14} color="#FFD700" fill="#FFD700" />}
      {set.pr_serie && <Flame size={14} color={colors.accent} fill={colors.accent} />}
      {set.pr_1rm && <Trophy size={14} color="#FAC775" fill="#FAC775" />}
      {!set.pr_charge && !set.pr_serie && !set.pr_1rm && (
        <View style={[styles.prBadge, { backgroundColor: colors.prAmber + '20' }]}>
          <Text style={[styles.prBadgeText, { color: colors.prAmber }]}>PR</Text>
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