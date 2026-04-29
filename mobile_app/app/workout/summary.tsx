import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native'
import { router } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useWorkout, WorkoutExercise } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Gym { id: string; name: string }

interface PREntry {
  exerciseName: string
  type: 'charge' | 'serie' | '1rm'
  value: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateName(exercises: WorkoutExercise[]): string {
  const MUSCLE_GROUP_LABELS: Record<string, string> = {
    pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules',
    biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps',
    ischio_jambiers: 'Ischio', fessiers: 'Fessiers',
    mollets: 'Mollets', abdominaux: 'Abdos', avant_bras: 'Avant-bras',
  }
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

function formatWeight(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const { colors } = useTheme()
  const workout = useWorkout()

  const [title, setTitle] = useState('')
  const [gyms, setGyms] = useState<Gym[]>([])
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)

  const doneExercises = workout.exercises.filter(ex => ex.sets.some(s => s.validated))

  const totalSets = doneExercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.validated).length, 0)
  const totalVolume = doneExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(s => s.validated).reduce((v, s) => v + s.weight_kg * s.reps, 0),
    0
  )

  // Collecte tous les PRs réalisés pendant la séance
  const sessionPRs: PREntry[] = []
  for (const ex of doneExercises) {
    for (const s of ex.sets.filter(s => s.validated)) {
      if (s.pr_charge) sessionPRs.push({ exerciseName: ex.name, type: 'charge', value: s.weight_kg })
      if (s.pr_serie) sessionPRs.push({ exerciseName: ex.name, type: 'serie', value: s.weight_kg * s.reps })
      if (s.pr_1rm) sessionPRs.push({ exerciseName: ex.name, type: '1rm', value: s.weight_kg * (1 + s.reps / 30) })
    }
  }

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

      const { data: workoutData, error: workoutError } = await supabase
        .from('workouts')
        .insert({
          user_id: user.id,
          title: title.trim() || 'Séance',
          started_at: workout.startedAt?.toISOString(),
          ended_at: new Date().toISOString(),
          duration_sec: workout.elapsedSeconds,
          gym_id: selectedGymId,
          is_public: isPublic,
        })
        .select('id')
        .single()

      if (workoutError || !workoutData) throw workoutError ?? new Error('Erreur création séance')

      for (let i = 0; i < doneExercises.length; i++) {
        const ex = doneExercises[i]
        const { data: weData, error: weError } = await supabase
          .from('workout_exercises')
          .insert({ workout_id: workoutData.id, exercise_id: ex.exercise_id, order_index: i })
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
            pr_charge: s.pr_charge,
            pr_serie: s.pr_serie,
            pr_1rm: s.pr_1rm,
            logged_at: new Date().toISOString(),
          }))
        )
      }

      workout.resetWorkout()
      router.replace('/(tabs)/feed')
    } catch (err: any) {
      Alert.alert('Erreur', err.message ?? "Impossible d'enregistrer la séance.")
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
        { text: 'Abandonner', style: 'destructive', onPress: () => { workout.resetWorkout(); router.replace('/(tabs)/feed') } },
      ]
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Résumé</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Nom */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Nom de la séance</Text>
        <TextInput
          style={[styles.titleInput, { backgroundColor: colors.card, borderColor: colors.separator, color: colors.textPrimary }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Nom de la séance"
          placeholderTextColor={colors.textSecondary}
          maxLength={60}
        />

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Durée" value={formatDuration(workout.elapsedSeconds)} colors={colors} />
          <StatCard label="Séries" value={String(totalSets)} colors={colors} />
          <StatCard label="Volume" value={`${totalVolume.toLocaleString('fr')} kg`} colors={colors} />
          {sessionPRs.length > 0 && (
            <StatCard label="PRs" value={String(sessionPRs.length)} colors={colors} highlight />
          )}
        </View>

        {/* Bloc PRs */}
        {sessionPRs.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Records battus aujourd'hui</Text>
            <View style={[styles.prBlock, { backgroundColor: colors.card, borderColor: colors.separator }]}>
              {sessionPRs.map((pr, idx) => (
                <PRRow key={idx} pr={pr} colors={colors} />
              ))}
            </View>
          </>
        )}

        {/* Exercices */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Exercices</Text>
        {doneExercises.map((ex, eIdx) => (
          <View key={eIdx} style={[styles.exerciseCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{ex.name}</Text>
            {ex.sets.filter(s => s.validated).map((set, sIdx) => (
              <View key={sIdx} style={[styles.setRow, { borderTopColor: colors.separator }]}>
                <Text style={[styles.setNumber, { color: colors.textSecondary }]}>Série {set.set_number}</Text>
                <Text style={[styles.setData, { color: colors.textPrimary }]}>
                  {set.weight_kg > 0
                    ? `${formatWeight(set.weight_kg)} kg × ${set.reps} reps`
                    : `${set.reps} reps`}
                </Text>
                {set.pr_charge && <Zap color="#FFD700" size={13} fill="#FFD700" />}
                {set.pr_serie && <Flame color="#D85A30" size={13} fill="#D85A30" />}
              </View>
            ))}
          </View>
        ))}

        {/* Salle */}
        {gyms.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Salle</Text>
            <View style={styles.gymList}>
              <TouchableOpacity
                style={[styles.gymChip, { backgroundColor: colors.card, borderColor: selectedGymId === null ? colors.accent : colors.separator }]}
                onPress={() => setSelectedGymId(null)}
              >
                <Text style={[styles.gymChipText, { color: selectedGymId === null ? colors.accent : colors.textSecondary }]}>Aucune</Text>
              </TouchableOpacity>
              {gyms.map(gym => (
                <TouchableOpacity
                  key={gym.id}
                  style={[styles.gymChip, { backgroundColor: colors.card, borderColor: selectedGymId === gym.id ? colors.accent : colors.separator }]}
                  onPress={() => setSelectedGymId(gym.id)}
                >
                  <Text style={[styles.gymChipText, { color: selectedGymId === gym.id ? colors.accent : colors.textSecondary }]}>{gym.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Visibilité */}
        <TouchableOpacity
          style={[styles.visibilityRow, { backgroundColor: colors.card, borderColor: colors.separator }]}
          onPress={() => setIsPublic(v => !v)}
          activeOpacity={0.7}
        >
          <View style={styles.visibilityInfo}>
            <Text style={[styles.visibilityLabel, { color: colors.textPrimary }]}>Partager dans le fil</Text>
            <Text style={[styles.visibilitySub, { color: colors.textSecondary }]}>
              {isPublic ? 'Visible par tes abonnés' : 'Séance privée'}
            </Text>
          </View>
          <View style={[styles.toggle, isPublic && { backgroundColor: colors.accent }]}>
            <View style={[styles.toggleKnob, isPublic && styles.toggleKnobOn]} />
          </View>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.actions, { borderTopColor: colors.separator }]}>
        <TouchableOpacity style={[styles.discardBtn, { backgroundColor: colors.backgroundSecondary }]} onPress={handleDiscard}>
          <Text style={[styles.discardBtnText, { color: colors.textSecondary }]}>Abandonner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.accent }, saving && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Enregistrer</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── PRRow ────────────────────────────────────────────────────────────────────

const PR_CONFIG = {
  charge: { icon: Zap, color: '#FFD700', label: 'PR Charge', fill: true },
  serie:  { icon: Flame, color: '#D85A30', label: 'PR Série', fill: true },
  '1rm':  { icon: Trophy, color: '#FFD700', label: 'PR 1RM estimé', fill: false },
}

function PRRow({ pr, colors }: { pr: PREntry; colors: ReturnType<typeof useTheme>['colors'] }) {
  const cfg = PR_CONFIG[pr.type]
  const Icon = cfg.icon
  return (
    <View style={prStyles.row}>
      <Icon color={cfg.color} size={16} fill={cfg.fill ? cfg.color : 'none'} />
      <Text style={[prStyles.label, { color: cfg.color }]}>{cfg.label}</Text>
      <Text style={[prStyles.exName, { color: colors.textPrimary }]} numberOfLines={1}>{pr.exerciseName}</Text>
      <Text style={[prStyles.value, { color: colors.textSecondary }]}>
        {pr.type === 'serie' ? `${Math.round(pr.value)} kg` : `${pr.value.toFixed(1)} kg`}
      </Text>
    </View>
  )
}

const prStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '700', width: 90 },
  exName: { flex: 1, fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
})

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, colors, highlight = false }: {
  label: string; value: string; colors: ReturnType<typeof useTheme>['colors']; highlight?: boolean
}) {
  return (
    <View style={[
      statStyles.card,
      { backgroundColor: colors.card, borderColor: highlight ? colors.prGold + '50' : colors.separator },
      highlight && { backgroundColor: colors.prGold + '15' },
    ]}>
      <Text style={[statStyles.value, { color: highlight ? colors.prGold : colors.textPrimary }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

const statStyles = StyleSheet.create({
  card: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1 },
  value: { fontSize: 18, fontWeight: '700' },
  label: { fontSize: 11 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 24, gap: 8 },
  sectionLabel: {
    fontSize: 12, fontWeight: '600', textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 16, marginBottom: 8,
  },
  titleInput: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 17, fontWeight: '600',
  },
  statsRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  prBlock: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  exerciseCard: {
    borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 4, gap: 0,
  },
  exerciseName: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  setRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, gap: 6,
  },
  setNumber: { fontSize: 13, width: 54 },
  setData: { fontSize: 13, flex: 1 },
  gymList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gymChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  gymChipText: { fontSize: 14 },
  visibilityRow: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: 1, padding: 14, marginTop: 4, gap: 12,
  },
  visibilityInfo: { flex: 1, gap: 2 },
  visibilityLabel: { fontSize: 15, fontWeight: '600' },
  visibilitySub: { fontSize: 12 },
  toggle: {
    width: 44, height: 26, borderRadius: 13,
    backgroundColor: '#2A2A2A', justifyContent: 'center', paddingHorizontal: 3,
  },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#555' },
  toggleKnobOn: { backgroundColor: '#fff', alignSelf: 'flex-end' },
  actions: {
    flexDirection: 'row', padding: 16, gap: 12,
    borderTopWidth: 1, paddingBottom: 32,
  },
  discardBtn: { flex: 1, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  discardBtnText: { fontSize: 16, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})