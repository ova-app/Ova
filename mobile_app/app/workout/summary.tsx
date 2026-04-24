/**
 * ORAVA — Session 06
 * app/workout/summary.tsx
 * Résumé de séance + save Supabase
 */

import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useWorkout } from '../../context/WorkoutContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Gym {
  id: string
  name: string
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Pectoraux', back: 'Dos', shoulders: 'Épaules',
  arms: 'Bras', legs: 'Jambes', core: 'Abdos',
  glutes: 'Fessiers', calves: 'Mollets',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateName(exercises: ReturnType<typeof useWorkout>['exercises']): string {
  const groups = [...new Set(
    exercises.map(e => e.muscle_group).filter((g): g is string => Boolean(g))
  )]
  if (groups.length === 0) return 'Séance'
  if (groups.length === 1) return `Séance ${MUSCLE_GROUP_LABELS[groups[0]] ?? groups[0]}`
  if (groups.length === 2) {
    const a = MUSCLE_GROUP_LABELS[groups[0]] ?? groups[0]
    const b = MUSCLE_GROUP_LABELS[groups[1]] ?? groups[1]
    return `${a} · ${b}`
  }
  return 'Full Body'
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${sec}s`
  return `${sec}s`
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const workout = useWorkout()

  const [title, setTitle] = useState('')
  const [gyms, setGyms] = useState<Gym[]>([])
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Exercices avec au moins une série validée
  const doneExercises = workout.exercises.filter(ex => ex.sets.some(s => s.validated))

  const totalSets = doneExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(s => s.validated).length, 0
  )
  const totalVolume = doneExercises.reduce(
    (sum, ex) => sum + ex.sets
      .filter(s => s.validated)
      .reduce((v, s) => v + s.weight_kg * s.reps, 0),
    0
  )
  const totalPRs = doneExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(s => s.is_pr).length, 0
  )

  useEffect(() => {
    setTitle(generateName(doneExercises))
    fetchGyms()
  }, [])

  async function fetchGyms() {
    const { data } = await supabase.from('gyms').select('id, name').order('name').limit(20)
    if (data) setGyms(data as Gym[])
  }

  async function handleSave() {
    if (doneExercises.length === 0) {
      Alert.alert('Séance vide', 'Aucune série à enregistrer.')
      return
    }

    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Non authentifié')

      // 1. Créer la séance
      const { data: workoutData, error: workoutError } = await supabase
        .from('workouts')
        .insert({
          user_id: user.id,
          title: title.trim() || 'Séance',
          started_at: workout.startedAt?.toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: workout.elapsedSeconds,
          gym_id: selectedGymId,
          is_public: true,
        })
        .select('id')
        .single()

      if (workoutError || !workoutData) throw workoutError ?? new Error('Erreur création séance')

      // 2. Créer workout_exercises + workout_sets
      for (let i = 0; i < doneExercises.length; i++) {
        const ex = doneExercises[i]

        const { data: weData, error: weError } = await supabase
          .from('workout_exercises')
          .insert({
            workout_id: workoutData.id,
            exercise_id: ex.exercise_id,
            order_index: i,
          })
          .select('id')
          .single()

        if (weError || !weData) continue

        const validatedSets = ex.sets.filter(s => s.validated)
        if (validatedSets.length === 0) continue

        await supabase.from('workout_sets').insert(
          validatedSets.map(s => ({
            workout_exercise_id: weData.id,
            set_number: s.set_number,
            weight_kg: s.weight_kg,
            reps: s.reps,
            is_pr: s.is_pr,
            logged_at: new Date().toISOString(),
          }))
        )
      }

      workout.resetWorkout()
      router.replace('/(tabs)/feed')
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? 'Impossible d\'enregistrer la séance.')
    } finally {
      setSaving(false)
    }
  }

  function handleDiscard() {
    Alert.alert(
      'Abandonner la séance ?',
      'Toutes les séries seront perdues.',
      [
        { text: 'Continuer la séance', style: 'cancel' },
        {
          text: 'Abandonner', style: 'destructive',
          onPress: () => { workout.resetWorkout(); router.replace('/(tabs)/feed') }
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Résumé</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nom de la séance */}
        <Text style={styles.sectionLabel}>Nom de la séance</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Nom de la séance"
          placeholderTextColor="#444"
          maxLength={60}
        />

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Durée" value={formatDuration(workout.elapsedSeconds)} />
          <StatCard label="Séries" value={String(totalSets)} />
          <StatCard label="Volume" value={`${totalVolume.toLocaleString('fr')} kg`} />
          {totalPRs > 0 && <StatCard label="PRs" value={String(totalPRs)} highlight />}
        </View>

        {/* Exercices */}
        <Text style={styles.sectionLabel}>Exercices</Text>
        {doneExercises.map((ex, eIdx) => (
          <View key={eIdx} style={styles.exerciseCard}>
            <Text style={styles.exerciseName}>{ex.name}</Text>
            {ex.sets.filter(s => s.validated).map((set, sIdx) => (
              <View key={sIdx} style={styles.setRow}>
                <Text style={styles.setNumber}>Série {set.set_number}</Text>
                <Text style={styles.setData}>
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
        ))}

        {/* Salle */}
        {gyms.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Salle</Text>
            <View style={styles.gymList}>
              <TouchableOpacity
                style={[styles.gymChip, selectedGymId === null && styles.gymChipActive]}
                onPress={() => setSelectedGymId(null)}
              >
                <Text style={[styles.gymChipText, selectedGymId === null && styles.gymChipTextActive]}>
                  Aucune
                </Text>
              </TouchableOpacity>
              {gyms.map(gym => (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymChip, selectedGymId === gym.id && styles.gymChipActive]}
                  onPress={() => setSelectedGymId(gym.id)}
                >
                  <Text style={[styles.gymChipText, selectedGymId === gym.id && styles.gymChipTextActive]}>
                    {gym.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Boutons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.discardBtn} onPress={handleDiscard}>
          <Text style={styles.discardBtnText}>Abandonner</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={[statStyles.card, highlight && statStyles.cardHighlight]}>
      <Text style={[statStyles.value, highlight && statStyles.valueHighlight]}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  )
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  cardHighlight: {
    backgroundColor: '#FAC77510',
    borderColor: '#FAC77530',
  },
  value: { color: '#fff', fontSize: 18, fontWeight: '700' },
  valueHighlight: { color: '#FAC775' },
  label: { color: '#555', fontSize: 11 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  backText: { color: '#D85A30', fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 24, gap: 8 },

  sectionLabel: {
    color: '#555',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },

  titleInput: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },

  exerciseCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    padding: 14,
    marginBottom: 8,
    gap: 4,
  },
  exerciseName: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3, gap: 8 },
  setNumber: { color: '#555', fontSize: 13, width: 54 },
  setData: { color: '#ccc', fontSize: 13, flex: 1 },
  prBadge: {
    backgroundColor: '#FAC77520',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  prBadgeText: { color: '#FAC775', fontSize: 10, fontWeight: '700' },

  gymList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gymChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  gymChipActive: { backgroundColor: '#D85A3022', borderColor: '#D85A30' },
  gymChipText: { color: '#888', fontSize: 14 },
  gymChipTextActive: { color: '#D85A30', fontWeight: '600' },

  actionsContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A1A1A',
    paddingBottom: 32,
  },
  discardBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  discardBtnText: { color: '#888', fontSize: 16, fontWeight: '600' },
  saveBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#D85A30',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
