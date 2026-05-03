import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native'
import { router } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { Zap, Flame, Trophy, Camera, X, MapPin } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useWorkout, WorkoutExercise, PrLevel, computePodium } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Gym { id: string; name: string }

interface PREntry {
  exerciseName: string
  type: 'charge' | 'serie' | 'exercice' | 'seance'
  prLevel: NonNullable<PrLevel>
  value: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules',
  biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps',
  ischio_jambiers: 'Ischio', fessiers: 'Fessiers',
  mollets: 'Mollets', abdominaux: 'Abdos', avant_bras: 'Avant-bras',
}

function generateName(exercises: WorkoutExercise[]): string {
  if (exercises.length === 0) {
    const today = new Date()
    return `Séance du ${today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
  }

  if (exercises.length === 1) {
    return `Séance ${exercises[0].name}`
  }

  const muscleVolume: Record<string, number> = {}
  let totalVol = 0
  for (const ex of exercises) {
    if (!ex.muscle_group) continue
    const vol = ex.sets.filter(s => s.validated).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
    muscleVolume[ex.muscle_group] = (muscleVolume[ex.muscle_group] ?? 0) + vol
    totalVol += vol
  }

  const groups = Object.entries(muscleVolume).sort((a, b) => b[1] - a[1])

  if (groups.length === 0) {
    const today = new Date()
    return `Séance du ${today.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
  }

  if (groups.length === 1 || (totalVol > 0 && groups[0][1] / totalVol > 0.6)) {
    return `Séance ${MUSCLE_GROUP_LABELS[groups[0][0]] ?? groups[0][0]}`
  }

  if (groups.length === 2) {
    const a = MUSCLE_GROUP_LABELS[groups[0][0]] ?? groups[0][0]
    const b = MUSCLE_GROUP_LABELS[groups[1][0]] ?? groups[1][0]
    return `Séance ${a} / ${b}`
  }

  return 'Full Body'
}

const PUSH_MUSCLES = new Set(['pectoraux', 'epaules', 'triceps'])
const PULL_MUSCLES = new Set(['dos', 'biceps', 'avant_bras'])
const LOWER_MUSCLES = new Set(['quadriceps', 'ischio_jambiers', 'fessiers', 'mollets'])

function generateSuggestions(exercises: WorkoutExercise[]): string[] {
  const today = new Date()
  const hour = today.getHours()
  const timeLabel = hour < 12 ? 'matin' : hour < 17 ? 'après-midi' : 'soir'

  if (exercises.length === 0) {
    return [
      `Séance du ${timeLabel}`,
      today.toLocaleDateString('fr-FR', { weekday: 'long' }),
      'Full Body',
    ]
  }

  const muscleVolume: Record<string, number> = {}
  let totalVol = 0
  for (const ex of exercises) {
    if (!ex.muscle_group) continue
    const vol = ex.sets.filter(s => s.validated).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
    muscleVolume[ex.muscle_group] = (muscleVolume[ex.muscle_group] ?? 0) + vol
    totalVol += vol
  }

  let pushVol = 0, pullVol = 0, lowerVol = 0
  for (const [mg, vol] of Object.entries(muscleVolume)) {
    if (PUSH_MUSCLES.has(mg)) pushVol += vol
    if (PULL_MUSCLES.has(mg)) pullVol += vol
    if (LOWER_MUSCLES.has(mg)) lowerVol += vol
  }

  const candidates: string[] = []

  if (totalVol > 0 && pushVol / totalVol > 0.55) candidates.push('Push')
  else if (totalVol > 0 && pullVol / totalVol > 0.55) candidates.push('Pull')
  else if (totalVol > 0 && lowerVol / totalVol > 0.55) candidates.push('Legs')
  else candidates.push('Full Body')

  candidates.push(`Séance du ${timeLabel}`)

  const weekday = today.toLocaleDateString('fr-FR', { weekday: 'long' })
  candidates.push(weekday.charAt(0).toUpperCase() + weekday.slice(1))

  return candidates.slice(0, 3)
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min ${sec}s`
  return `${sec}s`
}

function formatRest(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  if (m > 0) return `${m}min ${sec > 0 ? sec + 's' : ''}`
  return `${sec}s`
}

function formatWeight(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

function computeMuscleStats(exercises: WorkoutExercise[]): Array<{ group: string; label: string; pct: number }> {
  const muscleVolume: Record<string, number> = {}
  let totalVol = 0
  for (const ex of exercises) {
    if (!ex.muscle_group) continue
    const vol = ex.sets.filter(s => s.validated).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
    muscleVolume[ex.muscle_group] = (muscleVolume[ex.muscle_group] ?? 0) + vol
    totalVol += vol
  }
  if (totalVol === 0) return []
  return Object.entries(muscleVolume)
    .map(([group, vol]) => ({
      group,
      label: MUSCLE_GROUP_LABELS[group] ?? group,
      pct: vol / totalVol,
    }))
    .sort((a, b) => b.pct - a.pct)
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const { colors } = useTheme()
  const workout = useWorkout()

  const [title, setTitle] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [locationCity, setLocationCity] = useState<string | null>(null)
  const [locationLoading, setLocationLoading] = useState(false)
  const [gyms, setGyms] = useState<Gym[]>([])
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null)
  const [isPublic, setIsPublic] = useState(true)
  const [saving, setSaving] = useState(false)
  // Top-3 volumes historiques de séance (chargé en async)
  const [seanceTop3, setSeanceTop3] = useState<{ pr1: number; pr2: number | null; pr3: number | null }>({ pr1: 0, pr2: null, pr3: null })

  const doneExercises = workout.exercises.filter(ex => ex.sets.some(s => s.validated))

  const totalSets = doneExercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.validated).length, 0)
  const totalVolume = doneExercises.reduce(
    (sum, ex) => sum + ex.sets.filter(s => s.validated).reduce((v, s) => v + s.weight_kg * s.reps, 0),
    0
  )

  const allRestSeconds = doneExercises
    .flatMap(ex => ex.sets.filter(s => s.validated && s.rest_seconds !== null && s.rest_seconds < 600))
    .map(s => s.rest_seconds as number)
  const avgRestSeconds = allRestSeconds.length > 0
    ? Math.round(allRestSeconds.reduce((a, b) => a + b, 0) / allRestSeconds.length)
    : null

  const muscleStats = computeMuscleStats(doneExercises)

  // ── PRs de la séance (calculés à la volée) ──────────────────────────────
  const sessionPRs: PREntry[] = []

  for (const ex of doneExercises) {
    for (const s of ex.sets.filter(s => s.validated)) {
      if (s.pr_charge !== null) {
        sessionPRs.push({ exerciseName: ex.name, type: 'charge', prLevel: s.pr_charge, value: s.weight_kg })
      }
      if (s.pr_serie !== null) {
        sessionPRs.push({ exerciseName: ex.name, type: 'serie', prLevel: s.pr_serie, value: s.weight_kg * s.reps })
      }
    }
    // PR Exercice : volume total de cet exercice dans la séance
    const exVol = ex.sets.filter(s => s.validated).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
    const prExercice = computePodium(exVol, ex.pr_top3_exercice)
    if (prExercice !== null) {
      sessionPRs.push({ exerciseName: ex.name, type: 'exercice', prLevel: prExercice, value: exVol })
    }
  }

  // PR Séance : volume total de la séance
  const prSeance = computePodium(totalVolume, seanceTop3)
  if (prSeance !== null) {
    sessionPRs.push({ exerciseName: 'Séance complète', type: 'seance', prLevel: prSeance, value: totalVolume })
  }

  useEffect(() => {
    const name = generateName(doneExercises)
    setTitle(name)
    setSuggestions(generateSuggestions(doneExercises).filter(s => s !== name))
    fetchGyms()
    loadSeanceTop3()
  }, [])

  async function loadSeanceTop3() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('workouts')
        .select('total_volume_kg')
        .eq('user_id', user.id)
        .gt('total_volume_kg', 0)
        .order('total_volume_kg', { ascending: false })
        .limit(10)
      if (data) {
        const vols = [...new Set((data as any[]).map((w: any) => w.total_volume_kg).filter((v: any) => v > 0))].sort((a: any, b: any) => b - a) as number[]
        setSeanceTop3({ pr1: vols[0] ?? 0, pr2: vols[1] ?? null, pr3: vols[2] ?? null })
      }
    } catch (_) {}
  }

  async function fetchGyms() {
    const { data } = await supabase.from('gyms').select('id, name').order('name').limit(20)
    if (data) setGyms(data as Gym[])
  }

  async function fetchLocation() {
    setLocationLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setLocationLoading(false); return }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const [geo] = await Location.reverseGeocodeAsync(pos.coords)
      if (geo) {
        setLocationCity(geo.city ?? geo.subregion ?? geo.region ?? null)
      }
    } catch {
      // geolocation failure is non-blocking
    }
    setLocationLoading(false)
  }

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Autorise l\'accès à ta galerie pour ajouter une photo.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
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

      // Upload photo if selected
      let photoUrl: string | null = null
      if (photoUri) {
        try {
          const ext = photoUri.split('.').pop() ?? 'jpg'
          const path = `${user.id}/${Date.now()}.${ext}`
          const response = await fetch(photoUri)
          const blob = await response.blob()
          const { error: uploadError } = await supabase.storage
            .from('workout-photos')
            .upload(path, blob, { contentType: `image/${ext}`, upsert: false })
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from('workout-photos').getPublicUrl(path)
            photoUrl = urlData.publicUrl
          }
        } catch {
          // Photo upload failure is non-blocking
        }
      }

      // Calcul PR Séance (volume total vs historique)
      const finalPrSeance = computePodium(totalVolume, seanceTop3)

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
          avg_rest_seconds: avgRestSeconds,
          photo_url: photoUrl,
          location_city: locationCity,
          pr_seance: finalPrSeance,
        })
        .select('id')
        .single()

      if (workoutError || !workoutData) throw workoutError ?? new Error('Erreur création séance')

      for (let i = 0; i < doneExercises.length; i++) {
        const ex = doneExercises[i]

        // Calcul PR Exercice (volume total de l'exercice dans la séance)
        const exVol = ex.sets.filter(s => s.validated).reduce((sum, s) => sum + s.weight_kg * s.reps, 0)
        const finalPrExercice = computePodium(exVol, ex.pr_top3_exercice)

        const { data: weData, error: weError } = await supabase
          .from('workout_exercises')
          .insert({
            workout_id: workoutData.id,
            exercise_id: ex.exercise_id,
            order_index: i,
            pr_exercice: finalPrExercice,
          })
          .select('id')
          .single()

        if (weError || !weData) throw weError ?? new Error('Erreur insertion workout_exercise')

        const validatedSets = ex.sets.filter(s => s.validated)
        if (validatedSets.length === 0) continue

        const { error: setsError } = await supabase.from('workout_sets').insert(
          validatedSets.map(s => ({
            workout_exercise_id: weData.id,
            set_number: s.set_number,
            weight_kg: s.weight_kg,
            reps: s.reps,
            is_pr: s.pr_charge !== null || s.pr_serie !== null,
            pr_charge: s.pr_charge,
            pr_serie: s.pr_serie,
            rest_seconds: s.rest_seconds,
            logged_at: new Date().toISOString(),
          }))
        )
        if (setsError) throw setsError
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
        {suggestions.length > 0 && (
          <View style={styles.suggestionsRow}>
            {suggestions.map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.suggestionChip, { backgroundColor: colors.card, borderColor: colors.separator }]}
                onPress={() => setTitle(s)}
                activeOpacity={0.7}
              >
                <Text style={[styles.suggestionChipText, { color: colors.textSecondary }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <StatCard label="Durée" value={formatDuration(workout.elapsedSeconds)} colors={colors} />
          <StatCard label="Séries" value={String(totalSets)} colors={colors} />
          <StatCard label="Volume" value={`${totalVolume.toLocaleString('fr')} kg`} colors={colors} />
          {avgRestSeconds !== null && (
            <StatCard label="Repos moy." value={formatRest(avgRestSeconds)} colors={colors} />
          )}
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

        {/* Muscles travaillés */}
        {muscleStats.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Muscles travaillés</Text>
            <View style={[styles.muscleBlock, { backgroundColor: colors.card, borderColor: colors.separator }]}>
              {muscleStats.map(m => (
                <View key={m.group} style={styles.muscleRow}>
                  <Text style={[styles.muscleLabel, { color: colors.textPrimary }]}>{m.label}</Text>
                  <View style={[styles.muscleBarBg, { backgroundColor: colors.backgroundSecondary }]}>
                    <View style={[styles.muscleBarFill, { width: `${Math.round(m.pct * 100)}%` as any, backgroundColor: colors.accent }]} />
                  </View>
                  <Text style={[styles.musclePct, { color: colors.textSecondary }]}>{Math.round(m.pct * 100)}%</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Exercices */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Exercices</Text>
        {doneExercises.map((ex, eIdx) => (
          <View key={eIdx} style={[styles.exerciseCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>{ex.name}</Text>
            {ex.sets.filter(s => s.validated).map((set, sIdx) => {
              const chargeCfg = set.pr_charge ? PR_LEVEL_META[set.pr_charge] : null
              const serieCfg  = set.pr_serie  ? PR_LEVEL_META[set.pr_serie]  : null
              return (
                <View key={sIdx} style={[styles.setRow, { borderTopColor: colors.separator }]}>
                  <Text style={[styles.setNumber, { color: colors.textSecondary }]}>Série {set.set_number}</Text>
                  <Text style={[styles.setData, { color: colors.textPrimary }]}>
                    {set.weight_kg > 0
                      ? `${formatWeight(set.weight_kg)} kg × ${set.reps} reps`
                      : `${set.reps} reps`}
                  </Text>
                  {chargeCfg && <Text style={{ fontSize: 13 }}>{chargeCfg.chargeEmoji}</Text>}
                  {serieCfg  && <Text style={{ fontSize: 13 }}>{serieCfg.serieEmoji}</Text>}
                </View>
              )
            })}
          </View>
        ))}

        {/* Localisation */}
        <TouchableOpacity
          style={[styles.locationRow, { backgroundColor: colors.card, borderColor: locationCity ? colors.accent + '50' : colors.separator }]}
          onPress={locationCity ? () => setLocationCity(null) : fetchLocation}
          activeOpacity={0.7}
        >
          <MapPin color={locationCity ? colors.accent : colors.textSecondary} size={16} />
          {locationLoading ? (
            <ActivityIndicator size="small" color={colors.accent} style={{ flex: 1 }} />
          ) : (
            <Text style={[styles.locationText, { color: locationCity ? colors.accent : colors.textSecondary }]}>
              {locationCity ?? 'Ajouter ma ville'}
            </Text>
          )}
          {locationCity && <X color={colors.textSecondary} size={14} />}
        </TouchableOpacity>

        {/* Photo */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Photo de séance</Text>
        {photoUri ? (
          <View style={styles.photoWrapper}>
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
            <TouchableOpacity
              style={[styles.photoRemove, { backgroundColor: colors.card }]}
              onPress={() => setPhotoUri(null)}
            >
              <X color={colors.textSecondary} size={16} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.photoBtn, { backgroundColor: colors.card, borderColor: colors.separator }]}
            onPress={pickPhoto}
            activeOpacity={0.7}
          >
            <Camera color={colors.textSecondary} size={20} />
            <Text style={[styles.photoBtnText, { color: colors.textSecondary }]}>Ajouter une photo</Text>
          </TouchableOpacity>
        )}

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

const PR_LEVEL_META: Record<NonNullable<PrLevel>, { color: string; emoji: string; chargeEmoji: string; serieEmoji: string }> = {
  gold:   { color: '#FAC775', emoji: '🥇', chargeEmoji: '⚡🥇', serieEmoji: '🔥🥇' },
  silver: { color: '#C0C0C0', emoji: '🥈', chargeEmoji: '⚡🥈', serieEmoji: '🔥🥈' },
  bronze: { color: '#CD7F32', emoji: '🥉', chargeEmoji: '⚡🥉', serieEmoji: '🔥🥉' },
}

const PR_TYPE_CONFIG: Record<PREntry['type'], { Icon: any; color: string; label: string; fill: boolean }> = {
  charge:   { Icon: Zap,    color: '#FAC775', label: 'PR Charge',    fill: true },
  serie:    { Icon: Flame,  color: '#D85A30', label: 'PR Série',     fill: true },
  exercice: { Icon: Flame,  color: '#9B59B6', label: 'PR Exercice',  fill: true },
  seance:   { Icon: Trophy, color: '#FAC775', label: 'PR Séance',    fill: false },
}

const LEVEL_LABEL: Record<NonNullable<PrLevel>, string> = {
  gold:   'Record absolu',
  silver: '2e meilleure perf',
  bronze: '3e meilleure perf',
}

function PRRow({ pr, colors }: { pr: PREntry; colors: ReturnType<typeof useTheme>['colors'] }) {
  const cfg  = PR_TYPE_CONFIG[pr.type]
  const Icon = cfg.Icon
  const levelColor = PR_LEVEL_META[pr.prLevel].color
  const emoji = PR_LEVEL_META[pr.prLevel].emoji
  return (
    <View style={prStyles.row}>
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Icon color={cfg.color} size={14} fill={cfg.fill ? cfg.color : 'none'} />
      <Text style={[prStyles.label, { color: cfg.color }]}>{cfg.label}</Text>
      <Text style={[prStyles.exName, { color: colors.textPrimary }]} numberOfLines={1}>{pr.exerciseName}</Text>
      <Text style={[prStyles.value, { color: levelColor }]}>{LEVEL_LABEL[pr.prLevel]}</Text>
    </View>
  )
}

const prStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 },
  label: { fontSize: 12, fontWeight: '700', width: 88 },
  exName: { flex: 1, fontSize: 12 },
  value: { fontSize: 11, fontWeight: '600' },
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
  card: { flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 4, borderWidth: 1 },
  value: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 10 },
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
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  prBlock: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 4,
  },
  muscleBlock: {
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muscleLabel: { fontSize: 13, fontWeight: '500', width: 90 },
  muscleBarBg: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  muscleBarFill: { height: 6, borderRadius: 3 },
  musclePct: { fontSize: 12, width: 34, textAlign: 'right' },
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
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: -2 },
  suggestionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  suggestionChipText: { fontSize: 13 },
  locationRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14,
  },
  locationText: { flex: 1, fontSize: 15 },
  photoWrapper: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  photoPreview: { width: '100%', height: 180, borderRadius: 14 },
  photoRemove: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 12, borderWidth: 1, paddingVertical: 16,
  },
  photoBtnText: { fontSize: 15, fontWeight: '500' },
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
