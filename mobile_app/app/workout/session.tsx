import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, Modal, ActivityIndicator, Alert, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useWorkout, WorkoutExercise, WorkoutSet, PrLevel } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'
import { Zap, Flame } from 'lucide-react-native'

const PR_LEVEL_COLORS: Record<NonNullable<PrLevel>, { badge: string; bg: string }> = {
  gold:   { badge: '#FAC775', bg: '#FAC77520' },
  silver: { badge: '#C0C0C0', bg: '#C0C0C020' },
  bronze: { badge: '#CD7F32', bg: '#CD7F3220' },
}

const PR_CHARGE_LABELS: Record<NonNullable<PrLevel>, string> = {
  gold:   '🥇 PR Charge — record absolu !',
  silver: '🥈 PR Charge — 2e meilleur poids !',
  bronze: '🥉 PR Charge — 3e meilleur poids !',
}

const PR_SERIE_LABELS: Record<NonNullable<PrLevel>, string> = {
  gold:   '🥇 PR Série — record absolu !',
  silver: '🥈 PR Série — 2e meilleure perf !',
  bronze: '🥉 PR Série — 3e meilleure perf !',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExerciseResult {
  id: string
  name_fr: string
  muscle_group: string | null
  equipment_type: string | null
}

// ─── Picker wheel helpers ─────────────────────────────────────────────────────

function generateWeightValues(equipmentType: string | null): number[] {
  switch (equipmentType) {
    case 'halteres':
      return Array.from({ length: 30 }, (_, i) => (i + 1) * 2)           // 2..60
    case 'poulie':
      return Array.from({ length: 40 }, (_, i) => (i + 1) * 2.5)         // 2.5..100
    case 'machine':
      return Array.from({ length: 80 }, (_, i) => (i + 1) * 2.5)         // 2.5..200
    case 'smith':
      return Array.from({ length: 60 }, (_, i) => (i + 1) * 2.5)         // 2.5..150
    case 'kettlebell':
      return Array.from({ length: 12 }, (_, i) => (i + 1) * 4)           // 4..48
    case 'barre': {
      const plates = [0, 1.25, 2.5, 5, 10, 20]
      const weights = new Set<number>()
      for (let i = 0; i < plates.length; i++) {
        for (let j = 0; j < plates.length; j++) {
          for (let k = 0; k < plates.length; k++) {
            const perSide = plates[i] + plates[j] + plates[k]
            const total = 20 + perSide * 2
            if (total <= 220) weights.add(Math.round(total * 100) / 100)
          }
        }
      }
      return Array.from(weights).sort((a, b) => a - b)
    }
    default:
      return Array.from({ length: 80 }, (_, i) => (i + 1) * 2.5)
  }
}

function formatWeight(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(1)
}

const ITEM_HEIGHT = 48
const REPS_VALUES = Array.from({ length: 50 }, (_, i) => i + 1)  // 1..50

// ─── WheelPicker ──────────────────────────────────────────────────────────────

interface WheelPickerProps {
  values: number[]
  selected: number
  onSelect: (v: number) => void
  colors: ReturnType<typeof useTheme>['colors']
  label: string
  format?: (v: number) => string
  sublabel?: string | null
}

function WheelPicker({ values, selected, onSelect, colors, label, format, sublabel }: WheelPickerProps) {
  const scrollRef = useRef<ScrollView>(null)
  const hasMomentum = useRef(false)

  // On value list change (new exercise/equipment): scroll to position.
  // If selected is not in the new list, auto-select first item.
  useEffect(() => {
    let idx = values.indexOf(selected)
    if (idx === -1) {
      idx = 0
      onSelect(values[0])
    }
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false })
  }, [values])

  // Read which item landed in the center slot — do NOT write back to the ScrollView.
  // snapToInterval already positioned it; writing back causes the trembling.
  function readValue(y: number) {
    const idx = Math.max(0, Math.min(Math.round(y / ITEM_HEIGHT), values.length - 1))
    onSelect(values[idx])
  }

  return (
    <View style={wpStyles.container}>
      <Text style={[wpStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[wpStyles.wheel, { borderColor: colors.separator }]}>
        <View
          pointerEvents="none"
          style={[wpStyles.highlight, { borderColor: colors.accent, backgroundColor: colors.accent + '15' }]}
        />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
          onScrollBeginDrag={() => { hasMomentum.current = false }}
          onMomentumScrollBegin={() => { hasMomentum.current = true }}
          onScrollEndDrag={e => {
            if (!hasMomentum.current) readValue(e.nativeEvent.contentOffset.y)
          }}
          onMomentumScrollEnd={e => {
            hasMomentum.current = false
            readValue(e.nativeEvent.contentOffset.y)
          }}
        >
          {values.map((v, i) => {
            const isSelected = v === selected
            return (
              <TouchableOpacity
                key={v}
                activeOpacity={0.7}
                style={wpStyles.item}
                onPress={() => {
                  onSelect(v)
                  scrollRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true })
                }}
              >
                <Text style={[
                  wpStyles.itemText,
                  { color: isSelected ? colors.accent : colors.textSecondary },
                  isSelected && wpStyles.itemTextSelected,
                ]}>
                  {format ? format(v) : String(v)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      {sublabel && (
        <Text style={[wpStyles.sublabel, { color: colors.textSecondary }]}>{sublabel}</Text>
      )}
    </View>
  )
}

const wpStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  wheel: {
    width: '100%',
    height: ITEM_HEIGHT * 5,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    position: 'relative',
  },
  highlight: {
    position: 'absolute',
    top: ITEM_HEIGHT * 2,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    zIndex: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 20, fontVariant: ['tabular-nums'] },
  itemTextSelected: { fontSize: 24, fontWeight: '700' },
  sublabel: { fontSize: 11, textAlign: 'center' },
})

// ─── Composant principal ──────────────────────────────────────────────────────

export default function WorkoutSessionScreen() {
  const { colors } = useTheme()
  const workout = useWorkout()
  const [showPicker, setShowPicker] = useState(false)
  const [allExercises, setAllExercises] = useState<ExerciseResult[]>([])
  const [exercisesLoading, setExercisesLoading] = useState(false)
  const [prFlash, setPrFlash] = useState<{ prCharge: PrLevel; prSerie: PrLevel } | null>(null)

  // Démarrage automatique si on arrive depuis le FAB
  useEffect(() => {
    if (workout.status === 'idle') workout.startWorkout()
    else if (workout.status === 'done') router.replace('/workout/summary')
  }, [])

  const currentExercise: WorkoutExercise | null = workout.exercises[workout.currentIndex] ?? null
  const validatedSets = currentExercise?.sets.filter(s => s.validated) ?? []
  const draft = currentExercise?.sets.find(s => !s.validated) ?? null

  const weightValues = useMemo(
    () => generateWeightValues(currentExercise?.equipment_type ?? null),
    [currentExercise?.equipment_type]
  )
  const isBodyweight = currentExercise?.equipment_type === 'poids_corps'

  // Barbell subtitle
  const barreSubLabel = currentExercise?.equipment_type === 'barre' && draft
    ? (() => {
        const disques = (draft.weight_kg - 20) / 2
        if (disques <= 0) return 'Barre 20 kg seule'
        return `Barre 20 kg + ${formatWeight(disques)} kg de chaque côté`
      })()
    : null

  // ─── Chrono ────────────────────────────────────────────────────────────────

  function formatChrono(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ─── Recherche exercice ────────────────────────────────────────────────────

  useEffect(() => { loadExercises() }, [])

  async function loadExercises() {
    setExercisesLoading(true)
    const { data } = await supabase
      .from('exercises')
      .select('id, name_fr, equipment_type, muscle_group')
      .order('name_fr')
    setExercisesLoading(false)
    setAllExercises((data ?? []).map((ex: any) => ({
      id: ex.id,
      name_fr: ex.name_fr,
      equipment_type: ex.equipment_type,
      muscle_group: ex.muscle_group ?? null,
    })))
  }

  async function handleSelectExercise(ex: ExerciseResult) {
    setShowPicker(false)
    await workout.addExercise(ex.id, ex.name_fr, ex.muscle_group, ex.equipment_type)
  }

  // ─── Validation série ──────────────────────────────────────────────────────

  function handleValidate() {
    if (!draft || draft.reps <= 0) {
      Alert.alert('Série incomplète', 'Saisis un nombre de répétitions.')
      return
    }
    if (!isBodyweight && draft.weight_kg <= 0) {
      Alert.alert('Série incomplète', 'Saisis un poids.')
      return
    }
    const result = workout.validateSet(workout.currentIndex)
    if (result.prCharge !== null || result.prSerie !== null) {
      setPrFlash(result)
      setTimeout(() => setPrFlash(null), 2500)
    }
    // Auto-launch rest timer after set validation
    router.push('/workout/timer')
  }

  // ─── Fin de séance ─────────────────────────────────────────────────────────

  function handleFinish() {
    const totalValidated = workout.exercises.reduce(
      (sum, ex) => sum + ex.sets.filter(s => s.validated).length, 0
    )
    if (totalValidated === 0) {
      Alert.alert(
        'Aucune série enregistrée',
        "Tu n'as validé aucune série. Abandonner la séance ?",
        [
          { text: 'Continuer', style: 'cancel' },
          { text: 'Abandonner', style: 'destructive', onPress: () => { workout.resetWorkout(); router.back() } },
        ]
      )
      return
    }
    workout.finishWorkout()
    router.push('/workout/summary')
  }

  // ─── État vide ────────────────────────────────────────────────────────────

  if (workout.exercises.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.separator }]}>
          <Text style={[styles.chrono, { color: colors.textPrimary }]}>{formatChrono(workout.elapsedSeconds)}</Text>
          <TouchableOpacity style={[styles.finishBtn, { backgroundColor: colors.accent }]} onPress={handleFinish}>
            <Text style={styles.finishBtnText}>Terminer</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>💪</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Aucun exercice</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>Ajoute ton premier exercice pour commencer</Text>
          <TouchableOpacity style={[styles.addFirstBtn, { backgroundColor: colors.accent }]} onPress={() => setShowPicker(true)}>
            <Text style={styles.addFirstBtnText}>+ Ajouter un exercice</Text>
          </TouchableOpacity>
        </View>
        <ExercisePicker
          visible={showPicker}
          allExercises={allExercises}
          loading={exercisesLoading}
          onSelect={handleSelectExercise}
          onClose={() => setShowPicker(false)}
          colors={colors}
        />
      </View>
    )
  }

  // ─── Rendu principal ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.chrono, { color: colors.textPrimary }]}>{formatChrono(workout.elapsedSeconds)}</Text>
        <TouchableOpacity
          style={[styles.timerBtn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => router.push('/workout/timer')}
        >
          <Text style={styles.timerBtnText}>⏱</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.finishBtn, { backgroundColor: colors.accent }]} onPress={handleFinish}>
          <Text style={styles.finishBtnText}>Terminer</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation exercice */}
      <View style={[styles.exerciseNav, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity
          style={[styles.navBtn, workout.currentIndex === 0 && styles.navBtnDisabled]}
          onPress={() => workout.setCurrentIndex(workout.currentIndex - 1)}
          disabled={workout.currentIndex === 0}
        >
          <Text style={[styles.navBtnText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <View style={styles.exerciseTitleContainer}>
          <Text style={[styles.exerciseName, { color: colors.textPrimary }]} numberOfLines={1}>
            {currentExercise?.name}
          </Text>
          <Text style={[styles.exerciseCounter, { color: colors.textSecondary }]}>
            {workout.currentIndex + 1} / {workout.exercises.length}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.navBtn, workout.currentIndex === workout.exercises.length - 1 && styles.navBtnDisabled]}
          onPress={() => workout.setCurrentIndex(workout.currentIndex + 1)}
          disabled={workout.currentIndex === workout.exercises.length - 1}
        >
          <Text style={[styles.navBtnText, { color: colors.accent }]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Séries validées */}
      <ScrollView style={styles.setsScroll} contentContainerStyle={styles.setsContent} showsVerticalScrollIndicator={false}>
        {validatedSets.length === 0 ? (
          <Text style={[styles.noSetsText, { color: colors.textSecondary }]}>Première série — c'est parti !</Text>
        ) : (
          validatedSets.map((set, idx) => (
            <SetRow
              key={idx}
              set={set}
              onRemove={() => workout.removeSet(workout.currentIndex, idx)}
              colors={colors}
            />
          ))
        )}
      </ScrollView>

      {/* PR Flash */}
      {prFlash && (
        <View style={styles.prFlashBanner}>
          {prFlash.prCharge && (
            <View style={styles.prFlashItem}>
              <Zap color={PR_LEVEL_COLORS[prFlash.prCharge].badge} size={16} fill={PR_LEVEL_COLORS[prFlash.prCharge].badge} />
              <Text style={[styles.prFlashText, { color: PR_LEVEL_COLORS[prFlash.prCharge].badge }]}>
                {PR_CHARGE_LABELS[prFlash.prCharge]}
              </Text>
            </View>
          )}
          {prFlash.prSerie && (
            <View style={styles.prFlashItem}>
              <Flame color={PR_LEVEL_COLORS[prFlash.prSerie].badge} size={16} fill={PR_LEVEL_COLORS[prFlash.prSerie].badge} />
              <Text style={[styles.prFlashText, { color: PR_LEVEL_COLORS[prFlash.prSerie].badge }]}>
                {PR_SERIE_LABELS[prFlash.prSerie]}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Série en cours */}
      {draft && (
        <View style={[styles.draftContainer, { backgroundColor: colors.backgroundSecondary, borderTopColor: colors.separator }]}>
          <Text style={[styles.draftLabel, { color: colors.textSecondary }]}>Série {draft.set_number}</Text>

          <View style={styles.inputsRow}>
            {!isBodyweight ? (
              <WheelPicker
                values={weightValues}
                selected={draft.weight_kg}
                onSelect={v => workout.updateDraftSet(workout.currentIndex, 'weight_kg', v)}
                colors={colors}
                label="Poids (kg)"
                format={formatWeight}
                sublabel={barreSubLabel}
              />
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <WheelPicker
              values={REPS_VALUES}
              selected={draft.reps}
              onSelect={v => workout.updateDraftSet(workout.currentIndex, 'reps', v)}
              colors={colors}
              label="Reps"
            />
          </View>

          <TouchableOpacity style={[styles.validateBtn, { backgroundColor: colors.accent }]} onPress={handleValidate}>
            <Text style={styles.validateBtnText}>✓  Valider la série</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Footer */}
      <View style={[styles.footer, { borderTopColor: colors.separator }]}>
        <TouchableOpacity
          style={[styles.addExerciseBtn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => setShowPicker(true)}
        >
          <Text style={[styles.addExerciseBtnText, { color: colors.textSecondary }]}>+ Ajouter un exercice</Text>
        </TouchableOpacity>
      </View>

      <ExercisePicker
        visible={showPicker}
        query={searchQuery}
        results={searchResults}
        searching={searching}
        onChangeQuery={setSearchQuery}
        onSelect={handleSelectExercise}
        onClose={() => setShowPicker(false)}
        colors={colors}
      />
    </KeyboardAvoidingView>
  )
}

// ─── SetRow ──────────────────────────────────────────────────────────────────

function SetRow({ set, onRemove, colors }: { set: WorkoutSet; onRemove: () => void; colors: ReturnType<typeof useTheme>['colors'] }) {
  const chargeCfg = set.pr_charge ? PR_LEVEL_COLORS[set.pr_charge] : null
  const serieCfg  = set.pr_serie  ? PR_LEVEL_COLORS[set.pr_serie]  : null
  return (
    <View style={[setStyles.row, { borderBottomColor: colors.separator }]}>
      <Text style={[setStyles.number, { color: colors.textSecondary }]}>Série {set.set_number}</Text>
      <Text style={[setStyles.data, { color: colors.textPrimary }]}>
        {set.weight_kg > 0
          ? `${formatWeight(set.weight_kg)} kg × ${set.reps} reps`
          : `${set.reps} reps`}
      </Text>
      {chargeCfg && (
        <View style={[setStyles.prBadge, { backgroundColor: chargeCfg.bg, borderColor: chargeCfg.badge + '60' }]}>
          <Zap color={chargeCfg.badge} size={11} fill={chargeCfg.badge} />
          <Text style={[setStyles.prBadgeText, { color: chargeCfg.badge }]}>
            {set.pr_charge === 'gold' ? '🥇' : set.pr_charge === 'silver' ? '🥈' : '🥉'}
          </Text>
        </View>
      )}
      {serieCfg && (
        <View style={[setStyles.prBadge, { backgroundColor: serieCfg.bg, borderColor: serieCfg.badge + '60' }]}>
          <Flame color={serieCfg.badge} size={11} fill={serieCfg.badge} />
          <Text style={[setStyles.prBadgeText, { color: serieCfg.badge }]}>
            {set.pr_serie === 'gold' ? '🥇' : set.pr_serie === 'silver' ? '🥈' : '🥉'}
          </Text>
        </View>
      )}
      <TouchableOpacity style={setStyles.deleteBtn} onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={[setStyles.deleteText, { color: colors.textSecondary }]}>×</Text>
      </TouchableOpacity>
    </View>
  )
}

const setStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    gap: 8,
  },
  number: { fontSize: 13, width: 54 },
  data: { fontSize: 15, fontWeight: '500', flex: 1 },
  prBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  prBadgeText: { fontSize: 13, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 4 },
  deleteText: { fontSize: 20, lineHeight: 22 },
})

// ─── ExercisePicker ──────────────────────────────────────────────────────────

interface ExercisePickerProps {
  visible: boolean
  allExercises: ExerciseResult[]
  loading: boolean
  onSelect: (ex: ExerciseResult) => void
  onClose: () => void
  colors: ReturnType<typeof useTheme>['colors']
}

const EQUIPMENT_SHORT: Record<string, string> = {
  barre: 'Barre', halteres: 'Haltères', machine: 'Machine',
  poulie: 'Poulie', poids_corps: 'Poids du corps', kettlebell: 'KB', smith: 'Smith',
}

const MUSCLE_FILTERS = [
  { key: 'all',             label: 'Tous' },
  { key: 'pectoraux',       label: 'Pecto' },
  { key: 'dos',             label: 'Dos' },
  { key: 'epaules',         label: 'Épaules' },
  { key: 'biceps',          label: 'Biceps' },
  { key: 'triceps',         label: 'Triceps' },
  { key: 'quadriceps',      label: 'Quadri' },
  { key: 'ischio_jambiers', label: 'Ischio' },
  { key: 'fessiers',        label: 'Fessiers' },
  { key: 'mollets',         label: 'Mollets' },
  { key: 'abdominaux',      label: 'Abdos' },
  { key: 'avant_bras',      label: 'Av-bras' },
]

function normalize(str: string) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function ExercisePicker({ visible, allExercises, loading, onSelect, onClose, colors }: ExercisePickerProps) {
  const [query, setQuery] = useState('')
  const [muscleFilter, setMuscleFilter] = useState('all')

  useEffect(() => {
    if (!visible) { setQuery(''); setMuscleFilter('all') }
  }, [visible])

  const results = useMemo(() => {
    const q = normalize(query)
    return allExercises.filter(ex => {
      const matchSearch = q.length === 0 || normalize(ex.name_fr).includes(q)
      const matchMuscle = muscleFilter === 'all' || ex.muscle_group === muscleFilter
      return matchSearch && matchMuscle
    })
  }, [allExercises, query, muscleFilter])

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[pStyles.container, { backgroundColor: colors.background }]}>
        <View style={[pStyles.header, { borderBottomColor: colors.separator }]}>
          <Text style={[pStyles.title, { color: colors.textPrimary }]}>Exercice</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[pStyles.closeText, { color: colors.accent }]}>Annuler</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[pStyles.search, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
          placeholder="Rechercher..."
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={setQuery}
          autoFocus
          clearButtonMode="while-editing"
        />
        <View style={pStyles.chipsRow}>
          {MUSCLE_FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[
                pStyles.chip,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.separator },
                muscleFilter === f.key && { backgroundColor: colors.accent, borderColor: colors.accent },
              ]}
              onPress={() => setMuscleFilter(f.key)}
            >
              <Text style={[
                pStyles.chipText, { color: colors.textSecondary },
                muscleFilter === f.key && { color: '#fff' },
              ]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity style={[pStyles.row, { borderBottomColor: colors.separator }]} onPress={() => onSelect(item)}>
                <Text style={[pStyles.rowName, { color: colors.textPrimary }]}>{item.name_fr}</Text>
                {item.equipment_type && (
                  <Text style={[pStyles.rowSub, { color: colors.textSecondary }]}>
                    {EQUIPMENT_SHORT[item.equipment_type] ?? item.equipment_type}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 40 }}
          />
        )}
      </View>
    </Modal>
  )
}

const pStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '700' },
  closeText: { fontSize: 16 },
  search: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 7,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '500' },
  row: { paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowName: { fontSize: 15, fontWeight: '500', flex: 1 },
  rowSub: { fontSize: 12 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 58,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  chrono: { fontSize: 18, fontWeight: '700', flex: 1, fontVariant: ['tabular-nums'] },
  timerBtn: { padding: 8, borderRadius: 10 },
  timerBtnText: { fontSize: 18 },
  finishBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  finishBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  exerciseNav: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  navBtn: { padding: 10, width: 44, alignItems: 'center' },
  navBtnDisabled: { opacity: 0.2 },
  navBtnText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  exerciseTitleContainer: { flex: 1, alignItems: 'center', gap: 2 },
  exerciseName: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  exerciseCounter: { fontSize: 12 },
  setsScroll: { flex: 1 },
  setsContent: { paddingTop: 4, paddingBottom: 16 },
  noSetsText: { fontSize: 14, textAlign: 'center', marginTop: 24 },
  prFlashBanner: {
    position: 'absolute',
    top: 130,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 6,
    zIndex: 99,
  },
  prFlashItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prFlashText: { fontSize: 15, fontWeight: '700' },
  draftContainer: {
    borderTopWidth: 1,
    padding: 16,
    gap: 14,
  },
  draftLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  inputsRow: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  divider: { width: 1, height: ITEM_HEIGHT * 5, marginHorizontal: 8 },
  validateBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  validateBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footer: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  addExerciseBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  addExerciseBtnText: { fontSize: 15, fontWeight: '600' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center' },
  addFirstBtn: { marginTop: 8, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32 },
  addFirstBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})