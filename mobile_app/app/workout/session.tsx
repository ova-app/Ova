import { useEffect, useRef, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, Modal, ActivityIndicator, Alert, ScrollView,
  KeyboardAvoidingView, Platform, NativeScrollEvent, NativeSyntheticEvent,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useWorkout, WorkoutExercise, WorkoutSet } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'
import { Zap, Flame } from 'lucide-react-native'

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

// ─── ScrollPicker ─────────────────────────────────────────────────────────────

interface ScrollPickerProps {
  values: number[]
  selected: number
  onSelect: (v: number) => void
  colors: ReturnType<typeof useTheme>['colors']
  label: string
  barreSubLabel?: string | null
}

function ScrollPicker({ values, selected, onSelect, colors, label, barreSubLabel }: ScrollPickerProps) {
  const scrollRef = useRef<ScrollView>(null)
  const selectedIdx = Math.max(0, values.indexOf(selected))

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: selectedIdx * ITEM_HEIGHT, animated: false })
    }, 50)
    return () => clearTimeout(timer)
  }, [values])

  function handleScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const y = e.nativeEvent.contentOffset.y
    const idx = Math.round(y / ITEM_HEIGHT)
    const clamped = Math.max(0, Math.min(idx, values.length - 1))
    onSelect(values[clamped])
    scrollRef.current?.scrollTo({ y: clamped * ITEM_HEIGHT, animated: true })
  }

  return (
    <View style={pickerStyles.container}>
      <Text style={[pickerStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[pickerStyles.wheel, { borderColor: colors.separator }]}>
        {/* Selection highlight */}
        <View style={[pickerStyles.highlight, { borderColor: colors.accent, backgroundColor: colors.accent + '15' }]} />
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          onMomentumScrollEnd={handleScrollEnd}
          contentContainerStyle={{ paddingVertical: ITEM_HEIGHT * 2 }}
        >
          {values.map((v, idx) => {
            const isSelected = v === selected
            return (
              <TouchableOpacity
                key={v}
                style={pickerStyles.item}
                onPress={() => {
                  onSelect(v)
                  scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true })
                }}
              >
                <Text style={[
                  pickerStyles.itemText,
                  { color: isSelected ? colors.accent : colors.textSecondary },
                  isSelected && pickerStyles.itemTextSelected,
                ]}>
                  {formatWeight(v)}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      {barreSubLabel && (
        <Text style={[pickerStyles.subLabel, { color: colors.textSecondary }]}>{barreSubLabel}</Text>
      )}
    </View>
  )
}

const pickerStyles = StyleSheet.create({
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
    pointerEvents: 'none',
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 20, fontVariant: ['tabular-nums'] },
  itemTextSelected: { fontSize: 24, fontWeight: '700' },
  subLabel: { fontSize: 11, textAlign: 'center' },
})

// ─── Reps stepper ─────────────────────────────────────────────────────────────

interface RepsStepperProps {
  value: number
  onChange: (v: number) => void
  colors: ReturnType<typeof useTheme>['colors']
}

function RepsStepper({ value, onChange, colors }: RepsStepperProps) {
  return (
    <View style={repsStyles.container}>
      <Text style={[repsStyles.label, { color: colors.textSecondary }]}>REPS</Text>
      <View style={repsStyles.stepper}>
        <TouchableOpacity
          style={[repsStyles.btn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => onChange(Math.max(0, value - 1))}
        >
          <Text style={[repsStyles.btnText, { color: colors.textPrimary }]}>−</Text>
        </TouchableOpacity>
        <Text style={[repsStyles.value, { color: colors.textPrimary }]}>{value}</Text>
        <TouchableOpacity
          style={[repsStyles.btn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={() => onChange(value + 1)}
        >
          <Text style={[repsStyles.btnText, { color: colors.textPrimary }]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const repsStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', gap: 6 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 0 },
  btn: { width: 48, height: ITEM_HEIGHT * 5, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  btnText: { fontSize: 28, fontWeight: '300' },
  value: { fontSize: 40, fontWeight: '700', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
})

// ─── Composant principal ──────────────────────────────────────────────────────

export default function WorkoutSessionScreen() {
  const { colors } = useTheme()
  const workout = useWorkout()
  const [showPicker, setShowPicker] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ExerciseResult[]>([])
  const [searching, setSearching] = useState(false)
  const [prFlash, setPrFlash] = useState<{ isPrCharge: boolean; isPrSerie: boolean; isPr1rm: boolean } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Démarrage automatique si on arrive depuis le FAB
  useEffect(() => {
    if (workout.status === 'idle') workout.startWorkout()
    else if (workout.status === 'done') router.replace('/workout/summary')
  }, [])

  const currentExercise: WorkoutExercise | null = workout.exercises[workout.currentIndex] ?? null
  const validatedSets = currentExercise?.sets.filter(s => s.validated) ?? []
  const draft = currentExercise?.sets.find(s => !s.validated) ?? null

  const weightValues = generateWeightValues(currentExercise?.equipment_type ?? null)
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

  useEffect(() => {
    if (!showPicker) { setSearchQuery(''); setSearchResults([]); return }
    fetchExercises('')
  }, [showPicker])

  useEffect(() => {
    if (!showPicker) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchExercises(searchQuery), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [searchQuery, showPicker])

  async function fetchExercises(q: string) {
    setSearching(true)
    let query = supabase
      .from('exercises')
      .select('id, name_fr, equipment_type, muscle_group')
      .order('name_fr')
      .limit(40)

    if (q.trim().length > 0) query = query.ilike('name_fr', `%${q.trim()}%`)

    const { data } = await query
    setSearching(false)

    const results: ExerciseResult[] = (data ?? []).map((ex: any) => ({
      id: ex.id,
      name_fr: ex.name_fr,
      equipment_type: ex.equipment_type,
      muscle_group: ex.muscle_group ?? null,
    }))
    setSearchResults(results)
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
    if (result.isPrCharge || result.isPrSerie || result.isPr1rm) {
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
          query={searchQuery}
          results={searchResults}
          searching={searching}
          onChangeQuery={setSearchQuery}
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
          {prFlash.isPrCharge && (
            <View style={styles.prFlashItem}>
              <Zap color="#FFD700" size={16} fill="#FFD700" />
              <Text style={[styles.prFlashText, { color: '#FFD700' }]}>PR Charge !</Text>
            </View>
          )}
          {prFlash.isPrSerie && (
            <View style={styles.prFlashItem}>
              <Flame color="#D85A30" size={16} fill="#D85A30" />
              <Text style={[styles.prFlashText, { color: '#D85A30' }]}>PR Série !</Text>
            </View>
          )}
          {prFlash.isPr1rm && (
            <View style={styles.prFlashItem}>
              <Text style={[styles.prFlashText, { color: '#FFD700' }]}>🏆 PR 1RM !</Text>
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
              <ScrollPicker
                values={weightValues}
                selected={draft.weight_kg || weightValues[0]}
                onSelect={v => workout.updateDraftSet(workout.currentIndex, 'weight_kg', v)}
                colors={colors}
                label="Poids (kg)"
                barreSubLabel={barreSubLabel}
              />
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <RepsStepper
              value={draft.reps}
              onChange={v => workout.updateDraftSet(workout.currentIndex, 'reps', v)}
              colors={colors}
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
  return (
    <View style={[setStyles.row, { borderBottomColor: colors.separator }]}>
      <Text style={[setStyles.number, { color: colors.textSecondary }]}>Série {set.set_number}</Text>
      <Text style={[setStyles.data, { color: colors.textPrimary }]}>
        {set.weight_kg > 0
          ? `${formatWeight(set.weight_kg)} kg × ${set.reps} reps`
          : `${set.reps} reps`}
      </Text>
      {set.pr_charge && <Zap color="#FFD700" size={14} fill="#FFD700" />}
      {set.pr_serie && <Flame color="#D85A30" size={14} fill="#D85A30" />}
      {set.is_pr && !set.pr_charge && !set.pr_serie && (
        <View style={setStyles.prBadge}>
          <Text style={setStyles.prBadgeText}>PR</Text>
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
  prBadge: { backgroundColor: '#FAC77520', borderWidth: 1, borderColor: '#FAC77540', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  prBadgeText: { color: '#FAC775', fontSize: 11, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 4 },
  deleteText: { fontSize: 20, lineHeight: 22 },
})

// ─── ExercisePicker ──────────────────────────────────────────────────────────

interface ExercisePickerProps {
  visible: boolean
  query: string
  results: ExerciseResult[]
  searching: boolean
  onChangeQuery: (q: string) => void
  onSelect: (ex: ExerciseResult) => void
  onClose: () => void
  colors: ReturnType<typeof useTheme>['colors']
}

const EQUIPMENT_SHORT: Record<string, string> = {
  barre: 'Barre', halteres: 'Haltères', machine: 'Machine',
  poulie: 'Poulie', poids_corps: 'Poids du corps', kettlebell: 'KB', smith: 'Smith',
}

function ExercisePicker({ visible, query, results, searching, onChangeQuery, onSelect, onClose, colors }: ExercisePickerProps) {
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
          onChangeText={onChangeQuery}
          autoFocus
          clearButtonMode="while-editing"
        />
        {searching ? (
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
    marginVertical: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
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