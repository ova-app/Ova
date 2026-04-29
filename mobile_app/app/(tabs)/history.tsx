import { useCallback, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface WorkoutSummary {
  id: string
  title: string
  started_at: string
  duration_sec: number
  exercise_count: number
  total_sets: number
  total_volume: number
  pr_count: number
  has_pr_charge: boolean
  has_pr_serie: boolean
  has_pr_1rm: boolean
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return "Aujourd'hui"
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays} jours`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function computeStats(raw: any): WorkoutSummary {
  const exercises = raw.workout_exercises ?? []
  const allSets = exercises.flatMap((we: any) => we.workout_sets ?? [])

  return {
    id: raw.id,
    title: raw.title ?? 'Séance',
    started_at: raw.started_at,
    duration_sec: raw.duration_sec ?? 0,
    exercise_count: exercises.length,
    total_sets: allSets.length,
    total_volume: allSets.reduce((sum: number, s: any) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
    pr_count: allSets.filter((s: any) => s.is_pr).length,
    has_pr_charge: allSets.some((s: any) => s.pr_charge === true),
    has_pr_serie: allSets.some((s: any) => s.pr_serie === true),
    has_pr_1rm: allSets.some((s: any) => s.pr_1rm === true),
  }
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { colors } = useTheme()
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useFocusEffect(useCallback(() => { fetchHistory() }, []))

  async function fetchHistory() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id, title, started_at, duration_sec,
        workout_exercises (
          id,
          workout_sets ( weight_kg, reps, is_pr, pr_charge, pr_serie, pr_1rm )
        )
      `)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(100)

    setLoading(false)
    setRefreshing(false)
    if (error || !data) return
    setWorkouts(data.map(computeStats))
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Historique</Text>
        {workouts.length > 0 && (
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {workouts.length} séance{workouts.length > 1 ? 's' : ''}
          </Text>
        )}
      </View>

      {workouts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Aucune séance</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Lance une séance via le bouton + pour commencer à construire ton historique.
          </Text>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <WorkoutCard workout={item} colors={colors} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchHistory() }}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </View>
  )
}

// ─── WorkoutCard ─────────────────────────────────────────────────────────────

function WorkoutCard({ workout, colors }: {
  workout: WorkoutSummary
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const hasPrTypes = workout.has_pr_charge || workout.has_pr_serie || workout.has_pr_1rm
  const showGenericPr = workout.pr_count > 0 && !hasPrTypes

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}
      onPress={() => router.push(`/history/${workout.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.cardMain}>
        <View style={styles.cardLeft}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {workout.title}
          </Text>
          <Text style={[styles.cardDate, { color: colors.textSecondary }]}>
            {formatDate(workout.started_at)}
          </Text>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.cardDuration, { color: colors.textSecondary }]}>
            {formatDuration(workout.duration_sec)}
          </Text>
          {(hasPrTypes || showGenericPr) && (
            <View style={styles.prRow}>
              {workout.has_pr_charge && <Zap size={13} color="#FFD700" fill="#FFD700" />}
              {workout.has_pr_serie && <Flame size={13} color={colors.accent} fill={colors.accent} />}
              {workout.has_pr_1rm && <Trophy size={13} color={colors.prAmber} fill={colors.prAmber} />}
              {showGenericPr && (
                <Text style={[styles.prCount, { color: colors.prAmber }]}>
                  {workout.pr_count} PR
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={[styles.cardStats, { borderTopColor: colors.separator }]}>
        <Stat label="Exercices" value={String(workout.exercise_count)} colors={colors} />
        <StatDivider colors={colors} />
        <Stat label="Séries" value={String(workout.total_sets)} colors={colors} />
        <StatDivider colors={colors} />
        <Stat
          label="Volume"
          value={workout.total_volume >= 1000
            ? `${(workout.total_volume / 1000).toFixed(1)}t`
            : `${workout.total_volume.toLocaleString('fr')} kg`}
          colors={colors}
        />
      </View>
    </TouchableOpacity>
  )
}

function Stat({ label, value, colors }: {
  label: string; value: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

function StatDivider({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return <View style={[styles.statDivider, { backgroundColor: colors.separator }]} />
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  title: { fontSize: 28, fontWeight: '700' },
  count: { fontSize: 13, marginBottom: 4 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 100 },

  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, gap: 12 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft: { flex: 1, gap: 3 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDate: { fontSize: 12 },
  cardDuration: { fontSize: 13, fontWeight: '500' },

  prRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prCount: { fontSize: 12, fontWeight: '600' },

  cardStats: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 12, borderTopWidth: 1,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 15, fontWeight: '700' },
  statLabel: { fontSize: 10 },
  statDivider: { width: 1, height: 28 },
})