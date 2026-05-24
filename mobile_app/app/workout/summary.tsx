import React, { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Flame, Zap } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, touchTarget } from '@/constants/theme'
import { useWorkout, computePodium, WorkoutExercise, PrLevel } from '@/context/WorkoutContext'
import { saveMyoSignature } from '@/lib/myo'
import { insertLocalSet, insertLocalSession } from '@/lib/db'
import { storage } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}H ${m}MIN`
  return `${m}MIN`
}

function formatDate(date: Date | null): string {
  if (!date) return "AUJOURD'HUI"
  const day = date.toLocaleDateString('fr-FR', { weekday: 'long' }).toUpperCase()
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const isToday = new Date().toDateString() === date.toDateString()
  return isToday ? `AUJOURD'HUI · ${time}` : `${day} · ${time}`
}

function generateWorkoutName(exercises: WorkoutExercise[], startedAt: Date | null): string {
  const hour = startedAt ? startedAt.getHours() : 12
  const slot = hour < 6 ? 'Nuit' : hour < 12 ? 'Matin' : hour < 18 ? 'Après-midi' : 'Soir'
  const groups = [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))]
  if (groups.length === 0) return `Séance du ${slot}`
  const groupLabels: Record<string, string> = {
    pectoraux: 'Pecs', dos: 'Dos', epaules: 'Épaules',
    biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Jambes',
    ischio_jambiers: 'Ischio', fessiers: 'Fessiers', mollets: 'Mollets', abdominaux: 'Abdos',
  }
  const label = groups.slice(0, 2).map(g => groupLabels[g ?? ''] ?? g ?? '').join(' & ')
  return `${label} — ${slot}`
}

function epley1RM(w: number, r: number): number {
  return r === 1 ? w : w * (1 + r / 30)
}

function muscleLabelFr(key: string): string {
  const map: Record<string, string> = {
    pectoraux: 'Pectoraux',
    dos: 'Dos',
    epaules: 'Épaules',
    biceps: 'Biceps',
    triceps: 'Triceps',
    quadriceps: 'Quadriceps',
    ischio_jambiers: 'Ischio',
    fessiers: 'Fessiers',
    mollets: 'Mollets',
    abdominaux: 'Abdominaux',
    autre: 'Autre',
  }
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SummaryScreen() {
  const router = useRouter()
  const { colors } = useTheme()
  const { status, startedAt, exercises, elapsedSeconds, resetWorkout } = useWorkout()

  const [isPublic, setIsPublic] = useState(false)
  const [workoutName, setWorkoutName] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [sectionAnims] = useState(() =>
    Array.from({ length: 5 }, () => new Animated.Value(0))
  )

  useEffect(() => {
    if (status !== 'done') {
      router.replace('/workout/session')
      return
    }
    setWorkoutName(generateWorkoutName(exercises, startedAt))
    const animations = sectionAnims.map((anim, i) =>
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        delay: i * 80,
        useNativeDriver: true,
      })
    )
    Animated.stagger(80, animations).start()
  }, [])

  // ─── Métriques ───────────────────────────────────────────────────────────

  const validSets = exercises.flatMap(ex =>
    ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
  )
  const totalVolume = validSets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
  const nbSeries = validSets.length
  const nbExercices = exercises.length

  // PRs détectés (charge + série uniquement — flash visuels en session)
  const prChargeDetected = validSets.filter(s => s.pr_charge !== null)
  const prSerieDetected = validSets.filter(s => s.pr_serie !== null)
  const hasPrs = prChargeDetected.length > 0 || prSerieDetected.length > 0

  // PR charge : meilleur niveau détecté
  const prChargeLevels: PrLevel[] = prChargeDetected.map(s => s.pr_charge)
  const bestPrCharge: PrLevel = prChargeLevels.includes('gold')
    ? 'gold'
    : prChargeLevels.includes('silver')
    ? 'silver'
    : prChargeLevels.includes('bronze')
    ? 'bronze'
    : null

  // PR série : meilleur niveau + meilleure valeur
  const prSerieMax = prSerieDetected.reduce(
    (best, s) => Math.max(best, Math.round(s.weight_kg * s.reps)),
    0
  )
  const prSerieLevels: PrLevel[] = prSerieDetected.map(s => s.pr_serie)
  const bestPrSerie: PrLevel = prSerieLevels.includes('gold')
    ? 'gold'
    : prSerieLevels.includes('silver')
    ? 'silver'
    : prSerieLevels.includes('bronze')
    ? 'bronze'
    : null

  // Barres musculaires — primary vs secondary depuis muscle_group (approx)
  const muscleVolumes = exercises.reduce<Record<string, number>>((acc, ex) => {
    const key = ex.muscle_group ?? 'autre'
    const vol = ex.sets
      .filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      .reduce((s, set) => s + set.weight_kg * set.reps, 0)
    acc[key] = (acc[key] ?? 0) + vol
    return acc
  }, {})
  const maxVol = Math.max(...Object.values(muscleVolumes), 1)
  const muscleEntries = Object.entries(muscleVolumes).sort((a, b) => b[1] - a[1])
  // Primary = top muscle, secondary = rest
  const primaryMuscle = muscleEntries[0]?.[0] ?? null

  // ─── computeAndSave ───────────────────────────────────────────────────────

  async function computeAndSave(): Promise<{ workoutId: string; prSeance: PrLevel }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Non authentifié')

    const poidsMax = Math.max(0, ...validSets.map(s => s.weight_kg))
    const volumeMaxSerie = Math.max(0, ...validSets.map(s => s.weight_kg * s.reps))
    const durationSec = elapsedSeconds

    const volumeParExercice: Record<string, number> = {}
    const volumeMaxSerieParEx: Record<string, number> = {}
    const poidsMaxParEx: Record<string, number> = {}
    const nbSeriesParEx: Record<string, number> = {}
    const estimated1rmParEx: Record<string, number> = {}
    const restParEx: Record<string, number[]> = {}

    for (const ex of exercises) {
      const sets = ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      if (sets.length === 0) continue
      const id = ex.exercise_id
      volumeParExercice[id] = sets.reduce((s, set) => s + set.weight_kg * set.reps, 0)
      volumeMaxSerieParEx[id] = Math.max(...sets.map(s => s.weight_kg * s.reps))
      poidsMaxParEx[id] = Math.max(...sets.map(s => s.weight_kg))
      nbSeriesParEx[id] = sets.length
      estimated1rmParEx[id] = Math.max(...sets.map(s => epley1RM(s.weight_kg, s.reps)))
      restParEx[id] = sets.map(s => s.rest_seconds ?? 0).filter(r => r > 0)
    }

    const allRests = Object.values(restParEx).flat()
    const tempsReposTotal = allRests.reduce((s, r) => s + r, 0)
    const tempsReposMoyen = allRests.length ? tempsReposTotal / allRests.length : null
    const tempsActif = Math.max(0, durationSec - tempsReposTotal)
    const ratioActif = durationSec > 0 ? tempsActif / durationSec : null
    const tempsReposMoyParEx: Record<string, number | null> = {}
    for (const [id, rests] of Object.entries(restParEx)) {
      tempsReposMoyParEx[id] = rests.length ? rests.reduce((a, b) => a + b, 0) / rests.length : null
    }

    const startHour = startedAt ? startedAt.getHours() : 18
    const slotHoraire: 'matin' | 'apres_midi' | 'soir' | 'nuit' =
      startHour < 6 ? 'nuit' : startHour < 12 ? 'matin' : startHour < 18 ? 'apres_midi' : 'soir'

    const densiteKgParMin = durationSec > 0 ? (totalVolume / durationSec) * 60 : 0

    // PR séance
    const { data: topWorkouts } = await supabase
      .from('workouts')
      .select('total_volume_kg')
      .eq('user_id', user.id)
      .not('total_volume_kg', 'is', null)
      .order('total_volume_kg', { ascending: false })
      .limit(3)

    const topVols: number[] = ((topWorkouts ?? []) as { total_volume_kg: number }[]).map(w => w.total_volume_kg ?? 0)
    const top3seance = { pr1: topVols[0] ?? 0, pr2: topVols[1] ?? null, pr3: topVols[2] ?? null }
    const prSeance = computePodium(totalVolume, top3seance)

    const prParExercice: Record<string, boolean> = {}
    for (const ex of exercises) {
      prParExercice[ex.exercise_id] = ex.sets.some(s => s.is_pr)
    }
    const nbPrSeance = validSets.filter(s => s.is_pr).length

    // Stats rolling best-effort
    let streakSemaines = 0
    let nbSeances30j = 0
    let frequenceHebdo = 0
    let volume7j = 0
    let tempsDerniere: number | null = null
    let evolutionRepos: number | null = null
    try {
      const since90 = new Date(Date.now() - 90 * 86400000).toISOString()
      const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: recent } = await supabase
        .from('workouts')
        .select('started_at, total_volume_kg, avg_rest_seconds')
        .eq('user_id', user.id)
        .gte('started_at', since90)
        .order('started_at', { ascending: false })
      if (recent?.length) {
        nbSeances30j = (recent as { started_at: string }[]).filter(w => w.started_at >= since30).length
        frequenceHebdo = nbSeances30j / 4
        const last = (recent as { started_at: string }[])[0]
        if (last?.started_at) {
          tempsDerniere = Math.round((Date.now() - new Date(last.started_at).getTime()) / 1000)
        }
        const weeks = new Set(
          (recent as { started_at: string }[]).map(w => {
            const d = new Date(w.started_at)
            return `${d.getFullYear()}-${Math.floor(
              (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 604800000
            )}`
          })
        )
        streakSemaines = weeks.size
      }
    } catch (_) {}

    try {
      const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
      const { data: wIds7j } = await supabase
        .from('workouts')
        .select('id, total_volume_kg')
        .eq('user_id', user.id)
        .gte('started_at', since7)
      volume7j = ((wIds7j ?? []) as { total_volume_kg: number }[]).reduce((s, w) => s + (w.total_volume_kg ?? 0), 0)
    } catch (_) {}

    let poidsCorps: number | null = null
    let ageAns: number | null = null
    try {
      const { data: userProfile } = await supabase
        .from('users')
        .select('date_naissance')
        .eq('id', user.id)
        .single()
      const { data: bodyM } = await supabase
        .from('body_metrics')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .single()
      if (bodyM) poidsCorps = (bodyM as { weight_kg: number }).weight_kg
      if ((userProfile as { date_naissance?: string } | null)?.date_naissance) {
        const dob = new Date((userProfile as { date_naissance: string }).date_naissance)
        ageAns = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000))
      }
    } catch (_) {}

    const chargeRelSeance = poidsCorps && poidsMax > 0 ? (poidsMax / (poidsCorps * 0.8)) * 100 : null
    const chargeRelParEx: Record<string, number | null> = {}
    for (const [id, pm] of Object.entries(poidsMaxParEx)) {
      chargeRelParEx[id] = poidsCorps ? (pm / (poidsCorps * 0.8)) * 100 : null
    }

    const dominantMuscle =
      exercises.length > 0
        ? [...new Set(exercises.map(e => e.muscle_group).filter(Boolean))]
            .sort(
              (a, b) =>
                (volumeParExercice[exercises.find(e => e.muscle_group === b)?.exercise_id ?? ''] ?? 0) -
                (volumeParExercice[exercises.find(e => e.muscle_group === a)?.exercise_id ?? ''] ?? 0)
            )[0] ?? null
        : null

    const setsByExercise: Record<string, Array<{ weight_kg: number; reps: number }>> =
      Object.fromEntries(
        exercises.map(ex => [
          ex.exercise_id,
          ex.sets
            .filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
            .map(s => ({ weight_kg: s.weight_kg, reps: s.reps })),
        ])
      )

    // ── 1. Workout ───────────────────────────────────────────────────────────
    const workoutId = crypto.randomUUID()
    const startedAtIso = startedAt?.toISOString() ?? new Date().toISOString()

    const { error: wErr } = await supabase.from('workouts').insert({
      id: workoutId,
      user_id: user.id,
      title: workoutName,
      started_at: startedAtIso,
      ended_at: new Date().toISOString(),
      duration_sec: durationSec,
      total_volume_kg: totalVolume,
      is_public: isPublic,
      poids_corps_kg: poidsCorps,
      pr_seance: prSeance,
    })
    if (wErr) throw new Error(wErr.message)

    // ── Photo upload best-effort ─────────────────────────────────────────────
    if (photoUri) {
      try {
        const response = await fetch(photoUri)
        const blob = await response.blob()
        const arrayBuffer = await blob.arrayBuffer()
        const uint8 = new Uint8Array(arrayBuffer)
        const { data: uploadData } = await supabase.storage
          .from('workout-photos')
          .upload(`${user.id}/${workoutId}.jpg`, uint8, { contentType: 'image/jpeg', upsert: true })
        if (uploadData) {
          const { data: publicUrl } = supabase.storage
            .from('workout-photos')
            .getPublicUrl(`${user.id}/${workoutId}.jpg`)
          if (publicUrl?.publicUrl) {
            await supabase
              .from('workouts')
              .update({ photo_url: publicUrl.publicUrl })
              .eq('id', workoutId)
          }
        }
      } catch (_) {}
    }

    // ── 2. workout_exercises + workout_sets ──────────────────────────────────
    for (let ei = 0; ei < exercises.length; ei++) {
      const ex = exercises[ei]
      const validatedSets = ex.sets.filter(s => s.validated && s.weight_kg > 0 && s.reps > 0)
      if (validatedSets.length === 0) continue

      const exVolume = volumeParExercice[ex.exercise_id] ?? 0
      const prExercice = computePodium(exVolume, ex.pr_top3_exercice)

      const weId = crypto.randomUUID()
      const { error: weErr } = await supabase.from('workout_exercises').insert({
        id: weId,
        workout_id: workoutId,
        exercise_id: ex.exercise_id,
        order_index: ei,
        pr_exercice: prExercice,
      })
      if (weErr) throw new Error(weErr.message)

      const setsInsert = validatedSets.map((s, si) => ({
        id: crypto.randomUUID(),
        workout_exercise_id: weId,
        set_type: 'working' as const,
        set_number: s.set_number,
        reps: s.reps,
        weight_kg: s.weight_kg,
        rest_seconds: s.rest_seconds,
        is_pr: s.is_pr,
        pr_charge: s.pr_charge,
        pr_serie: s.pr_serie,
        logged_at: s.validated_at
          ? new Date(s.validated_at).toISOString()
          : new Date().toISOString(),
      }))
      const { error: wsErr } = await supabase.from('workout_sets').insert(setsInsert)
      if (wsErr) throw new Error(wsErr.message)

      for (const s of validatedSets) {
        await insertLocalSet({
          id: `${workoutId}-${ex.exercise_id}-${s.set_number}`,
          exercise_id: ex.exercise_id,
          weight_kg: s.weight_kg,
          reps: s.reps,
          session_id: workoutId,
          logged_at: s.validated_at ?? Date.now(),
        })
      }
    }

    await insertLocalSession({ id: workoutId, total_volume_kg: totalVolume, logged_at: Date.now() })

    // ── 3. workout_metrics best-effort ───────────────────────────────────────
    try {
      const metricsData = {
        volume_total_kg: totalVolume,
        duree_totale_seance: durationSec,
        nb_exercices: nbExercices,
        nb_series_total: nbSeries,
        poids_max_seance_kg: poidsMax,
        volume_max_serie_kg: volumeMaxSerie,
        volume_par_exercice_kg: volumeParExercice,
        nb_series_par_exercice: nbSeriesParEx,
        poids_max_par_exercice_kg: poidsMaxParEx,
        estimated_1rm_par_exercice_kg: estimated1rmParEx,
        pr_par_exercice: prParExercice,
        temps_repos_total_sec: tempsReposTotal,
        temps_repos_moyen_seance_sec: tempsReposMoyen,
        temps_actif_sec: tempsActif,
        ratio_actif_repos: ratioActif,
        densite_kg_par_min: densiteKgParMin,
        slot_horaire: slotHoraire,
        heure_debut: startedAtIso,
        poids_corps_kg: poidsCorps,
        age_ans: ageAns,
        nb_pr_seance: nbPrSeance,
        streak_semaines_actives: streakSemaines,
        nb_seances_30_derniers_jours: nbSeances30j,
        frequence_hebdo_moyenne: frequenceHebdo,
        volume_7_derniers_jours_kg: volume7j,
        temps_depuis_derniere_seance_sec: tempsDerniere,
        charge_relative_seance: chargeRelSeance,
        charge_relative_par_exercice: chargeRelParEx,
        temps_repos_moyen_par_exercice_sec: tempsReposMoyParEx,
        muscle_primaire_dominant: dominantMuscle,
        volume_max_serie_par_exercice_kg: volumeMaxSerieParEx,
        muscles_sollicites: [],
      }
      await supabase.from('workout_metrics').insert({
        workout_id: workoutId,
        data: metricsData,
        computed_at: new Date().toISOString(),
      })
    } catch (_) {}

    // ── 4. Myo signature best-effort ─────────────────────────────────────────
    try {
      await saveMyoSignature({
        userId: user.id,
        workoutId,
        startedAtIso,
        volume_total_kg: totalVolume,
        densite_kg_par_min: densiteKgParMin,
        nb_series_total: nbSeries,
        score_recuperation_estime: null,
        nb_pr_seance: nbPrSeance,
        streak_semaines_actives: streakSemaines,
        volume_max_serie_kg: volumeMaxSerie,
        poids_max_seance_kg: poidsMax,
        charge_relative_seance: chargeRelSeance,
        nb_exercices: nbExercices,
        nb_series_par_exercise_moy: nbExercices > 0 ? nbSeries / nbExercices : 0,
        duree_totale_seance: durationSec,
        temps_repos_total_sec: tempsReposTotal,
        temps_repos_moyen_seance_sec: tempsReposMoyen,
        temps_actif_sec: tempsActif,
        ratio_actif_repos: ratioActif,
        heure_debut: startedAtIso,
        slot_horaire: slotHoraire,
        muscle_primaire_dominant: dominantMuscle,
        poids_corps_kg: poidsCorps,
        age_ans: ageAns,
        temps_depuis_derniere_seance_sec: tempsDerniere,
        volume_7_derniers_jours_kg: volume7j,
        evolution_repos_moyen_seance_sec: evolutionRepos,
        nb_seances_30_derniers_jours: nbSeances30j,
        frequence_hebdo_moyenne: frequenceHebdo,
        volume_par_exercice_kg: volumeParExercice,
        volume_max_serie_par_exercice_kg: volumeMaxSerieParEx,
        poids_max_par_exercice_kg: poidsMaxParEx,
        charge_relative_par_exercice: chargeRelParEx,
        nb_series_par_exercice: nbSeriesParEx,
        temps_repos_moyen_par_exercice_sec: tempsReposMoyParEx,
        estimated_1rm_par_exercice_kg: estimated1rmParEx,
        pr_par_exercice: prParExercice,
        volume_par_muscle_kg: {},
        evolution_volume_par_exercice: {},
        evolution_1rm_par_exercice: {},
        volume_par_muscle_30j_kg: {},
        volume_par_muscle_90j_kg: {},
        frequence_sollicitation_par_muscle_7j: {},
        muscles_sollicites: [],
        setsByExercise,
      })
    } catch (_) {}

    return { workoutId, prSeance }
  }

  // ─── Handlers ────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      await computeAndSave()
      storage.delete('workout_session_draft')
      resetWorkout()
      router.replace('/(tabs)/feed')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      setSaveError(msg)
      setSaving(false)
    }
  }

  function handleCancel() {
    Alert.alert(
      'Annuler ?',
      'La séance sera perdue.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Oui, annuler',
          style: 'destructive',
          onPress: () => {
            storage.delete('workout_session_draft')
            resetWorkout()
            router.replace('/(tabs)/feed')
          },
        },
      ]
    )
  }

  async function handlePickPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
    }
  }

  // ─── Animated style helper ───────────────────────────────────────────────

  const sectionStyle = (i: number) => ({
    opacity: sectionAnims[i],
    transform: [{ translateY: sectionAnims[i].interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  })

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header: date + titre ── */}
        <Animated.View style={sectionStyle(0)}>
          <Text style={[styles.dateCaption, { color: colors.textTertiary }]}>
            {formatDate(startedAt)}
          </Text>
          <Text style={[styles.workoutTitle, { color: colors.textPrimary }]} numberOfLines={2}>
            {workoutName}
          </Text>
        </Animated.View>

        {/* ── Volume total ── */}
        <Animated.View style={[styles.section, sectionStyle(1)]}>
          <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>VOLUME TOTAL</Text>
          <View style={styles.heroRow}>
            <Text style={[styles.heroValue, { color: colors.accent }]} allowFontScaling={false}>
              {Math.round(totalVolume).toLocaleString('fr-FR')}
            </Text>
            <Text style={[styles.heroUnit, { color: colors.accent }]}> kg</Text>
          </View>
          {/* Chips: durée · sets · exercices */}
          <View style={styles.chipsRow}>
            <View style={[styles.chip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]} allowFontScaling={false}>
                {formatDuration(elapsedSeconds)}
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]} allowFontScaling={false}>
                {nbSeries} SETS
              </Text>
            </View>
            <View style={[styles.chip, { backgroundColor: colors.backgroundSecondary }]}>
              <Text style={[styles.chipText, { color: colors.textSecondary }]} allowFontScaling={false}>
                {nbExercices} EXERCICE{nbExercices > 1 ? 'S' : ''}
              </Text>
            </View>
          </View>
        </Animated.View>

        {/* ── PRs détectés ── */}
        {hasPrs && (
          <Animated.View style={[styles.section, sectionStyle(2)]}>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>PRs DÉTECTÉS</Text>
            {bestPrCharge !== null && (
              <View style={[styles.prRow, { backgroundColor: colors.backgroundSecondary }]}>
                <Zap size={16} color={colors.accent} />
                <Text style={[styles.prText, { color: colors.textPrimary }]}>
                  PR Charge
                  {prChargeDetected.length > 0
                    ? ` · +${Math.round(prChargeDetected.reduce((m, s) => Math.max(m, s.weight_kg), 0))} kg`
                    : ''}
                </Text>
              </View>
            )}
            {bestPrSerie !== null && prSerieMax > 0 && (
              <View style={[styles.prRow, { backgroundColor: colors.backgroundSecondary, marginTop: spacing.s2 }]}>
                <Flame size={16} color={colors.accent} />
                <Text style={[styles.prText, { color: colors.textPrimary }]}>
                  PR Série · {prSerieMax} pts
                </Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Groupes musculaires ── */}
        {muscleEntries.length > 0 && (
          <Animated.View style={[styles.section, sectionStyle(3)]}>
            <Text style={[styles.sectionLabel, { color: colors.textTertiary }]}>GROUPES MUSCULAIRES</Text>
            {/* Légende */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.accent }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Primaire</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.textTertiary }]} />
                <Text style={[styles.legendText, { color: colors.textSecondary }]}>Secondaire</Text>
              </View>
            </View>
            {/* Barres */}
            {muscleEntries.map(([muscle, vol]) => {
              const pct = vol / maxVol
              const isPrimary = muscle === primaryMuscle
              const barColor = isPrimary ? colors.accent : colors.textSecondary
              return (
                <View key={muscle} style={styles.muscleRow}>
                  <Text style={[styles.muscleLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {muscleLabelFr(muscle)}
                  </Text>
                  <View style={[styles.muscleBarBg, { backgroundColor: colors.backgroundTertiary }]}>
                    <View
                      style={[
                        styles.muscleBarFill,
                        { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: barColor },
                      ]}
                    />
                  </View>
                  <Text style={[styles.musclePct, { color: colors.textSecondary }]} allowFontScaling={false}>
                    {Math.round(pct * 100)}%
                  </Text>
                </View>
              )
            })}
          </Animated.View>
        )}

        {/* ── Partager ── */}
        <Animated.View style={[styles.section, sectionStyle(4)]}>
          <View style={[styles.shareRow, { backgroundColor: colors.backgroundSecondary }]}>
            <Text style={[styles.shareLabel, { color: colors.textPrimary }]}>Partager</Text>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.switchBackground, true: colors.accent }}
              thumbColor={colors.textPrimary}
              ios_backgroundColor={colors.switchBackground}
            />
          </View>
        </Animated.View>

        {/* ── Erreur ── */}
        {saveError && (
          <View style={[styles.errorBox, { backgroundColor: `${colors.error}20`, borderColor: `${colors.error}40` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{saveError}</Text>
          </View>
        )}

        {/* ── Bouton sauvegarder ── */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.accent }, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.saveButtonText, { color: colors.background }]}>SAUVEGARDER</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={saving}
            activeOpacity={0.7}
          >
            <Text style={[styles.cancelButtonText, { color: colors.error }]}>ANNULER</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s6,
    paddingBottom: spacing.s12,
  },
  // Header
  dateCaption: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.s2,
  },
  workoutTitle: {
    ...typography.title,
    marginBottom: spacing.s1,
  },
  // Sections
  section: {
    marginTop: spacing.s6,
  },
  sectionLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: spacing.s3,
  },
  // Volume hero
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.s4,
  },
  heroValue: {
    ...typography.hero,
    fontVariant: ['tabular-nums'],
  },
  heroUnit: {
    fontSize: 28,
    fontFamily: typography.hero.fontFamily,
    letterSpacing: -0.5,
    lineHeight: 60,
    marginBottom: 4,
  },
  // Chips durée/sets/exercices
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.sm,
  },
  chipText: {
    ...typography.caption,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  // PR rows
  prRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s3,
    borderRadius: radius.md,
    minHeight: touchTarget.comfort,
  },
  prText: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
  },
  // Muscle bars
  legendRow: {
    flexDirection: 'row',
    gap: spacing.s4,
    marginBottom: spacing.s3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s1,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
  },
  legendText: {
    ...typography.caption,
  },
  muscleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginBottom: spacing.s3,
  },
  muscleLabel: {
    fontSize: 14,
    fontFamily: typography.body.fontFamily,
    width: 88,
  },
  muscleBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  muscleBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  musclePct: {
    ...typography.caption,
    width: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  // Partager
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderRadius: radius.md,
    minHeight: touchTarget.comfort,
  },
  shareLabel: {
    ...typography.body,
    fontWeight: '600',
  },
  // Erreur
  errorBox: {
    marginTop: spacing.s4,
    borderRadius: radius.md,
    padding: spacing.s4,
    borderWidth: 1,
  },
  errorText: {
    ...typography.caption,
  },
  // Footer
  footer: {
    marginTop: spacing.s8,
  },
  saveButton: {
    height: touchTarget.hero,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    ...typography.subtitle,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  cancelButton: {
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.s3,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '600',
  },
})
