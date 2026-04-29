import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useWorkout } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MuscleMapping {
  muscle: string
  fascicle: string | null
  role: 'primary' | 'secondary' | 'stabilizer'
  activation_pct: number
}

interface ExerciseDetail {
  id: string
  name_fr: string
  equipment_type: string
  is_compound: boolean
  muscle_group: string
  muscles: MuscleMapping[]
}

interface SetHistory {
  workout_title: string
  started_at: string
  sets: { set_number: number; weight_kg: number; reps: number; is_pr: boolean }[]
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barre: 'Barre', halteres: 'Haltères', poulie: 'Poulie',
  machine: 'Machine', poids_corps: 'Poids du corps', smith: 'Smith', kettlebell: 'Kettlebell',
}

const ROLE_COLORS: Record<string, string> = {
  primary: '#D85A30',
  secondary: '#FAC775',
  stabilizer: '#666',
}

const ROLE_LABELS: Record<string, string> = {
  primary: 'Principal',
  secondary: 'Secondaire',
  stabilizer: 'Stabilisateur',
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { colors } = useTheme()
  const workout = useWorkout()
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null)
  const [history, setHistory] = useState<SetHistory[]>([])
  const [loading, setLoading] = useState(true)

  const canAddToSession = workout.status === 'active'

  useEffect(() => {
    if (id) {
      fetchExercise(id)
      fetchHistory(id)
    }
  }, [id])

  async function fetchExercise(exerciseId: string) {
    const { data, error } = await supabase
      .from('exercises')
      .select(`
        id, name_fr, equipment_type, is_compound, muscle_group,
        exercise_muscles ( muscle, fascicle, role, activation_pct )
      `)
      .eq('id', exerciseId)
      .single()

    if (error || !data) { setLoading(false); return }

    const muscles: MuscleMapping[] = ((data as any).exercise_muscles ?? [])
      .map((em: any) => ({
        muscle: em.muscle ?? 'Inconnu',
        fascicle: em.fascicle ?? null,
        role: em.role,
        activation_pct: em.activation_pct ?? 0,
      }))
      .sort((a: MuscleMapping, b: MuscleMapping) => {
        const order = { primary: 0, secondary: 1, stabilizer: 2 }
        return (order[a.role] ?? 3) - (order[b.role] ?? 3)
      })

    setExercise({
      id: (data as any).id,
      name_fr: (data as any).name_fr,
      equipment_type: (data as any).equipment_type,
      is_compound: (data as any).is_compound,
      muscle_group: (data as any).muscle_group,
      muscles,
    })
    setLoading(false)
  }

  async function fetchHistory(exerciseId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('workout_exercises')
      .select(`
        workout_sets ( set_number, weight_kg, reps, is_pr, logged_at ),
        workouts ( title, started_at, user_id )
      `)
      .eq('exercise_id', exerciseId)
      .eq('workouts.user_id', user.id)
      .order('workouts.started_at', { ascending: false })
      .limit(5)

    if (!data) return

    const sessions: SetHistory[] = data
      .filter((we: any) => we.workouts?.user_id === user.id)
      .map((we: any) => ({
        workout_title: we.workouts?.title ?? 'Séance',
        started_at: we.workouts?.started_at ?? '',
        sets: (we.workout_sets ?? []).sort((a: any, b: any) => a.set_number - b.set_number),
      }))

    setHistory(sessions)
  }

  async function handleAddToSession() {
    if (!exercise) return
    await workout.addExercise(exercise.id, exercise.name_fr, exercise.muscle_group, exercise.equipment_type)
    router.push('/workout/session')
  }

  function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  if (!exercise) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.textSecondary }]}>Exercice introuvable</Text>
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={2}>
          {exercise.name_fr}
        </Text>
        <View style={styles.headerBadges}>
          <View style={[styles.badge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.separator }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {EQUIPMENT_LABELS[exercise.equipment_type] ?? exercise.equipment_type}
            </Text>
          </View>
          {exercise.is_compound && (
            <View style={[styles.badge, styles.badgePoly]}>
              <Text style={styles.badgePolyText}>Poly</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, canAddToSession && { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Muscles */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Muscles sollicités</Text>

        {exercise.muscles.length === 0 ? (
          <Text style={[styles.noData, { color: colors.textSecondary }]}>Pas encore de données musculaires</Text>
        ) : (
          <View style={styles.musclesContainer}>
            {exercise.muscles.map((m, idx) => (
              <View key={idx} style={[styles.muscleRow, { borderBottomColor: colors.separator }]}>
                <View style={styles.muscleInfo}>
                  <Text style={[styles.muscleName, { color: colors.textPrimary }]}>
                    {m.muscle}{m.fascicle ? ` · ${m.fascicle}` : ''}
                  </Text>
                  <View style={[styles.roleTag, { backgroundColor: ROLE_COLORS[m.role] + '22' }]}>
                    <Text style={[styles.roleText, { color: ROLE_COLORS[m.role] }]}>
                      {ROLE_LABELS[m.role]}
                    </Text>
                  </View>
                </View>
                {m.role === 'primary' && (
                  <>
                    <View style={[styles.barTrack, { backgroundColor: colors.backgroundSecondary }]}>
                      <View style={[styles.barFill, { width: `${m.activation_pct || 30}%`, backgroundColor: ROLE_COLORS[m.role] }]} />
                    </View>
                    {m.activation_pct > 0 && (
                      <Text style={[styles.pctText, { color: colors.textSecondary }]}>{m.activation_pct}%</Text>
                    )}
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Historique */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Mon historique</Text>

        {history.length === 0 ? (
          <View style={[styles.noHistory, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.noHistoryText, { color: colors.textPrimary }]}>Pas encore réalisé</Text>
            <Text style={[styles.noHistorySubtext, { color: colors.textSecondary }]}>
              Lance une séance et ajoute cet exercice pour voir ton historique ici.
            </Text>
          </View>
        ) : (
          history.map((session, sIdx) => (
            <View key={sIdx} style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
              <View style={[styles.sessionHeader, { borderBottomColor: colors.separator }]}>
                <Text style={[styles.sessionTitle, { color: colors.textPrimary }]}>{session.workout_title}</Text>
                <Text style={[styles.sessionDate, { color: colors.textSecondary }]}>{formatDate(session.started_at)}</Text>
              </View>
              {session.sets.map((set, setIdx) => (
                <View key={setIdx} style={styles.setRow}>
                  <Text style={[styles.setNumber, { color: colors.textSecondary }]}>Série {set.set_number}</Text>
                  <Text style={[styles.setData, { color: colors.textPrimary }]}>
                    {set.weight_kg % 1 === 0 ? set.weight_kg : set.weight_kg.toFixed(1)} kg × {set.reps} reps
                  </Text>
                  {set.is_pr && (
                    <View style={styles.prBadge}>
                      <Text style={styles.prBadgeText}>PR</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Bouton ajouter à la séance */}
      {canAddToSession && (
        <View style={[styles.addToSessionContainer, { backgroundColor: colors.background, borderTopColor: colors.separator }]}>
          <TouchableOpacity style={styles.addToSessionBtn} onPress={handleAddToSession}>
            <Text style={styles.addToSessionText}>Ajouter à la séance</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 15 },
  header: {
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 8,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  headerBadges: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: { fontSize: 12, fontWeight: '500' },
  badgePoly: { backgroundColor: '#D85A3022', borderColor: '#D85A3066' },
  badgePolyText: { color: '#D85A30', fontSize: 12, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60, gap: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 8, marginBottom: 12 },
  noData: { fontSize: 13, marginBottom: 24 },
  musclesContainer: { gap: 0, marginBottom: 28 },
  muscleRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  muscleInfo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muscleName: { fontSize: 14, fontWeight: '600', flex: 1 },
  roleTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 11, fontWeight: '600' },
  barTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  pctText: { fontSize: 11, alignSelf: 'flex-end' },
  noHistory: { borderRadius: 12, padding: 20, alignItems: 'center', gap: 8 },
  noHistoryText: { fontSize: 15, fontWeight: '600' },
  noHistorySubtext: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  sessionCard: { borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1 },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  sessionTitle: { fontSize: 14, fontWeight: '600' },
  sessionDate: { fontSize: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  setNumber: { fontSize: 13, width: 54 },
  setData: { fontSize: 13, flex: 1 },
  prBadge: { backgroundColor: '#FAC77520', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  prBadgeText: { color: '#FAC775', fontSize: 10, fontWeight: '700' },
  addToSessionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  addToSessionBtn: {
    backgroundColor: '#D85A30',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addToSessionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})