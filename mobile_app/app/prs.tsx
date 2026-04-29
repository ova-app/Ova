import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

type PrLevel = 'gold' | 'silver' | 'bronze'

interface ExercisePodium {
  exercise_id: string
  name: string
  gold: { weight: number; reps: number; date: string } | null
  silver: { weight: number; reps: number; date: string } | null
  bronze: { weight: number; reps: number; date: string } | null
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const LEVEL_META: Record<PrLevel, { emoji: string; color: string; label: string }> = {
  gold:   { emoji: '🥇', color: '#FAC775', label: 'Record absolu' },
  silver: { emoji: '🥈', color: '#C0C0C0', label: '2e meilleure' },
  bronze: { emoji: '🥉', color: '#CD7F32', label: '3e meilleure' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })
}

function formatWeight(v: number): string {
  return v % 1 === 0 ? `${v}` : v.toFixed(1)
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function PRVaultScreen() {
  const { colors } = useTheme()
  const [podiums, setPodiums] = useState<ExercisePodium[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { loadPRs() }, []))

  async function loadPRs() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data, error } = await supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps, pr_level,
        workout_exercises!inner (
          exercise_id,
          workouts!inner ( user_id, started_at ),
          exercises!inner ( name_fr )
        )
      `)
      .eq('workout_exercises.workouts.user_id', user.id)
      .not('pr_level', 'is', null)

    setLoading(false)
    if (error || !data) return

    const byExercise: Record<string, ExercisePodium> = {}

    for (const row of data as any[]) {
      const exId: string = row.workout_exercises?.exercise_id
      const name: string = row.workout_exercises?.exercises?.name_fr ?? 'Exercice'
      const level: PrLevel = row.pr_level
      const weight: number = row.weight_kg ?? 0
      const reps: number = row.reps ?? 0
      const date: string = row.workout_exercises?.workouts?.started_at ?? ''

      if (!exId || !level) continue

      if (!byExercise[exId]) {
        byExercise[exId] = { exercise_id: exId, name, gold: null, silver: null, bronze: null }
      }

      // Keep the best (heaviest) entry per level
      const current = byExercise[exId][level]
      if (!current || weight > current.weight || (weight === current.weight && reps > current.reps)) {
        byExercise[exId][level] = { weight, reps, date }
      }
    }

    // Sort: exercises with gold first, then silver, then by name
    const sorted = Object.values(byExercise).sort((a, b) => {
      const scoreA = (a.gold ? 4 : 0) + (a.silver ? 2 : 0) + (a.bronze ? 1 : 0)
      const scoreB = (b.gold ? 4 : 0) + (b.silver ? 2 : 0) + (b.bronze ? 1 : 0)
      if (scoreB !== scoreA) return scoreB - scoreA
      return a.name.localeCompare(b.name)
    })

    setPodiums(sorted)
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Armurerie des PRs</Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} size="large" />
      ) : podiums.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyEmoji]}>🏆</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Pas encore de records</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Enregistre des séances pour voir tes meilleures performances ici.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.intro, { color: colors.textSecondary }]}>
            {podiums.length} exercice{podiums.length > 1 ? 's' : ''} avec des records
          </Text>

          {podiums.map(p => (
            <View key={p.exercise_id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
              <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{p.name}</Text>

              <View style={styles.medalsRow}>
                {(['gold', 'silver', 'bronze'] as PrLevel[]).map(level => {
                  const entry = p[level]
                  const meta = LEVEL_META[level]
                  return (
                    <View key={level} style={[
                      styles.medalBox,
                      { backgroundColor: entry ? meta.color + '15' : colors.backgroundSecondary, borderColor: entry ? meta.color + '40' : colors.separator },
                    ]}>
                      <Text style={styles.medalEmoji}>{meta.emoji}</Text>
                      {entry ? (
                        <>
                          <Text style={[styles.medalWeight, { color: entry ? meta.color : colors.textSecondary }]}>
                            {formatWeight(entry.weight)} kg
                          </Text>
                          <Text style={[styles.medalReps, { color: colors.textSecondary }]}>
                            × {entry.reps} reps
                          </Text>
                          <Text style={[styles.medalDate, { color: colors.textSecondary }]}>
                            {formatDate(entry.date)}
                          </Text>
                        </>
                      ) : (
                        <Text style={[styles.medalEmpty, { color: colors.textSecondary }]}>—</Text>
                      )}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '700' },
  loader: { flex: 1 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  content: { padding: 16, gap: 12 },
  intro: { fontSize: 13, marginBottom: 4 },

  card: {
    borderRadius: 16, borderWidth: 1, padding: 16, gap: 14,
  },
  exerciseName: { fontSize: 16, fontWeight: '700' },

  medalsRow: { flexDirection: 'row', gap: 8 },
  medalBox: {
    flex: 1, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 4,
  },
  medalEmoji: { fontSize: 22 },
  medalWeight: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  medalReps: { fontSize: 11, textAlign: 'center' },
  medalDate: { fontSize: 10, textAlign: 'center' },
  medalEmpty: { fontSize: 18, marginTop: 4 },
})
