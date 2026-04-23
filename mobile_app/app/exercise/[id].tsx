/**
 * ORAVA — Session 05
 * app/exercise/[id].tsx
 * Fiche exercice — muscles avec barres de pourcentage + historique perso
 */

import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MuscleMapping {
  muscle_name: string
  role: 'primary' | 'secondary' | 'stabilizer'
  activation_pct: number
}

interface ExerciseDetail {
  id: string
  name: string
  equipment: string
  mechanics: string
  force_type: string
  laterality: string
  is_verified: boolean
  muscles: MuscleMapping[]
}

interface PersonalRecord {
  weight_kg: number
  reps: number
  logged_at: string
}

interface SetHistory {
  workout_title: string
  started_at: string
  sets: { set_number: number; weight_kg: number; reps: number; is_pr: boolean }[]
}

// ─── Constantes ─────────────────────────────────────────────────────────────

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell:    'Barre',
  dumbbell:   'Haltères',
  machine:    'Machine',
  cable:      'Poulie',
  bodyweight: 'Poids corps',
  kettlebell: 'Kettlebell',
  band:       'Élastique',
  other:      'Autre',
}

const MECHANICS_LABELS: Record<string, string> = {
  compound:  'Poly-articulaire',
  isolation: 'Isolation',
}

const ROLE_COLORS: Record<string, string> = {
  primary:    '#D85A30', // orange Orava
  secondary:  '#FAC775', // ambre
  stabilizer: '#333',    // gris
}

const ROLE_LABELS: Record<string, string> = {
  primary:    'Principal',
  secondary:  'Secondaire',
  stabilizer: 'Stabilisateur',
}

// ─── Composant ──────────────────────────────────────────────────────────────

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [exercise, setExercise] = useState<ExerciseDetail | null>(null)
  const [history, setHistory] = useState<SetHistory[]>([])
  const [pr, setPr] = useState<PersonalRecord | null>(null)
  const [loading, setLoading] = useState(true)

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
        id, name, equipment, mechanics, force_type, laterality, is_verified,
        exercise_muscles (
          role, activation_pct,
          muscles ( name )
        )
      `)
      .eq('id', exerciseId)
      .single()

    if (error || !data) {
      setLoading(false)
      return
    }

    const muscles: MuscleMapping[] = (data.exercise_muscles ?? [])
      .map((em: any) => ({
        muscle_name: em.muscles?.name ?? 'Inconnu',
        role: em.role,
        activation_pct: em.activation_pct,
      }))
      .sort((a: MuscleMapping, b: MuscleMapping) => {
        const order = { primary: 0, secondary: 1, stabilizer: 2 }
        return (order[a.role] ?? 3) - (order[b.role] ?? 3)
      })

    setExercise({
      id: data.id,
      name: data.name,
      equipment: data.equipment,
      mechanics: data.mechanics,
      force_type: data.force_type,
      laterality: data.laterality,
      is_verified: data.is_verified,
      muscles,
    })

    setLoading(false)
  }

  async function fetchHistory(exerciseId: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Historique des 5 dernières séances avec cet exercice
    const { data, error } = await supabase
      .from('workout_exercises')
      .select(`
        workout_sets ( set_number, weight_kg, reps, is_pr, logged_at ),
        workouts ( title, started_at, user_id )
      `)
      .eq('exercise_id', exerciseId)
      .eq('workouts.user_id', user.id)
      .order('workouts.started_at', { ascending: false })
      .limit(5)

    if (error || !data) return

    const sessions: SetHistory[] = data
      .filter((we: any) => we.workouts?.user_id === user.id)
      .map((we: any) => ({
        workout_title: we.workouts?.title ?? 'Séance',
        started_at: we.workouts?.started_at ?? '',
        sets: (we.workout_sets ?? []).sort((a: any, b: any) => a.set_number - b.set_number),
      }))

    setHistory(sessions)

    // Meilleur PR : poids max toutes séances confondues
    const allSets = sessions.flatMap(s => s.sets)
    if (allSets.length > 0) {
      const best = allSets.reduce((prev, curr) =>
        curr.weight_kg > prev.weight_kg ? curr : prev
      )
      setPr({ weight_kg: best.weight_kg, reps: best.reps, logged_at: best.logged_at })
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#D85A30" size="large" />
      </View>
    )
  }

  if (!exercise) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Exercice introuvable</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{exercise.name}</Text>
        {exercise.is_verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>Vérifié</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Tags infos */}
        <View style={styles.tagsRow}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}</Text>
          </View>
          {exercise.mechanics && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{MECHANICS_LABELS[exercise.mechanics] ?? exercise.mechanics}</Text>
            </View>
          )}
        </View>

        {/* PR personnel */}
        {pr && (
          <View style={styles.prCard}>
            <Text style={styles.prLabel}>🏆 Mon PR</Text>
            <Text style={styles.prValue}>{pr.weight_kg} kg × {pr.reps} reps</Text>
            <Text style={styles.prDate}>{formatDate(pr.logged_at)}</Text>
          </View>
        )}

        {/* Section muscles */}
        <Text style={styles.sectionTitle}>Muscles sollicités</Text>

        {exercise.muscles.length === 0 ? (
          <Text style={styles.noDataText}>Pas encore de données musculaires</Text>
        ) : (
          <View style={styles.musclesContainer}>
            {exercise.muscles.map((m, index) => (
              <View key={index} style={styles.muscleRow}>
                <View style={styles.muscleHeader}>
                  <Text style={styles.muscleName}>{m.muscle_name}</Text>
                  <View style={[styles.roleTag, { backgroundColor: ROLE_COLORS[m.role] + '22' }]}>
                    <Text style={[styles.roleText, { color: ROLE_COLORS[m.role] }]}>
                      {ROLE_LABELS[m.role]}
                    </Text>
                  </View>
                </View>
                {/* Barre de pourcentage */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${m.activation_pct || 30}%`,
                        backgroundColor: ROLE_COLORS[m.role],
                      }
                    ]}
                  />
                </View>
                {m.activation_pct > 0 && (
                  <Text style={styles.pctText}>{m.activation_pct}%</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Historique personnel */}
        <Text style={styles.sectionTitle}>Mon historique</Text>

        {history.length === 0 ? (
          <View style={styles.noHistory}>
            <Text style={styles.noHistoryText}>Pas encore réalisé</Text>
            <Text style={styles.noHistorySubtext}>
              Lance une séance et ajoute cet exercice pour voir ton historique ici.
            </Text>
          </View>
        ) : (
          history.map((session, sIdx) => (
            <View key={sIdx} style={styles.sessionCard}>
              <View style={styles.sessionHeader}>
                <Text style={styles.sessionTitle}>{session.workout_title}</Text>
                <Text style={styles.sessionDate}>{formatDate(session.started_at)}</Text>
              </View>
              {session.sets.map((set, setIdx) => (
                <View key={setIdx} style={styles.setRow}>
                  <Text style={styles.setNumber}>Série {set.set_number}</Text>
                  <Text style={styles.setData}>{set.weight_kg} kg × {set.reps} reps</Text>
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
    </View>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#888',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backButton: {
    padding: 4,
  },
  backText: {
    color: '#D85A30',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 30,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  verifiedBadge: {
    backgroundColor: '#D85A3022',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedText: {
    color: '#D85A30',
    fontSize: 11,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tag: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
  },
  prCard: {
    backgroundColor: '#FAC77515',
    borderWidth: 1,
    borderColor: '#FAC77540',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 4,
  },
  prLabel: {
    color: '#FAC775',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  prValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  prDate: {
    color: '#888',
    fontSize: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 14,
    marginTop: 4,
  },
  noDataText: {
    color: '#555',
    fontSize: 13,
    marginBottom: 24,
  },
  musclesContainer: {
    gap: 14,
    marginBottom: 28,
  },
  muscleRow: {
    gap: 6,
  },
  muscleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  muscleName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  roleTag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#1A1A1A',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  pctText: {
    color: '#555',
    fontSize: 11,
    alignSelf: 'flex-end',
  },
  noHistory: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  noHistoryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  noHistorySubtext: {
    color: '#555',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  sessionCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  sessionTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sessionDate: {
    color: '#555',
    fontSize: 12,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 8,
  },
  setNumber: {
    color: '#555',
    fontSize: 13,
    width: 54,
  },
  setData: {
    color: '#ccc',
    fontSize: 13,
    flex: 1,
  },
  prBadge: {
    backgroundColor: '#FAC77520',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  prBadgeText: {
    color: '#FAC775',
    fontSize: 10,
    fontWeight: '700',
  },
})