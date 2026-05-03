import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PrLevel = 'gold' | 'silver' | 'bronze' | null

export interface WorkoutSet {
  set_number: number
  weight_kg: number
  reps: number
  is_pr: boolean
  pr_charge: PrLevel
  pr_serie: PrLevel
  rest_seconds: number | null
  validated_at: number | null  // internal ms timestamp, not persisted
  validated: boolean
}

export interface WorkoutExercise {
  exercise_id: string
  name: string
  muscle_group: string | null
  equipment_type: string | null
  sets: WorkoutSet[]
  pr_top3_charge: { pr1: number; pr2: number | null; pr3: number | null }
  pr_top3_serie:  { pr1: number; pr2: number | null; pr3: number | null }
  pr_top3_exercice: { pr1: number; pr2: number | null; pr3: number | null }
  pr_exercice: PrLevel  // computed at save time
}

export type WorkoutStatus = 'idle' | 'active' | 'done'

interface WorkoutContextValue {
  status: WorkoutStatus
  startedAt: Date | null
  exercises: WorkoutExercise[]
  currentIndex: number
  elapsedSeconds: number
  startWorkout: () => void
  finishWorkout: () => void
  resetWorkout: () => void
  addExercise: (id: string, name: string, muscleGroup: string | null, equipmentType?: string | null) => Promise<void>
  removeExercise: (index: number) => void
  setCurrentIndex: (i: number) => void
  updateDraftSet: (exerciseIndex: number, field: 'weight_kg' | 'reps', value: number) => void
  validateSet: (exerciseIndex: number) => { prCharge: PrLevel; prSerie: PrLevel }
  removeSet: (exerciseIndex: number, setIndex: number) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function computePodium(
  value: number,
  top3: { pr1: number; pr2: number | null; pr3: number | null },
): PrLevel {
  if (value <= 0 || top3.pr1 <= 0) return null
  if (value > top3.pr1) return 'gold'
  if (top3.pr2 !== null && value > top3.pr2) return 'silver'
  if (top3.pr3 !== null && value > top3.pr3) return 'bronze'
  return null
}

function emptyTop3() {
  return { pr1: 0, pr2: null, pr3: null } as { pr1: number; pr2: number | null; pr3: number | null }
}

function top3FromValues(values: number[]) {
  const distinct = [...new Set(values)].sort((a, b) => b - a)
  return {
    pr1: distinct[0] ?? 0,
    pr2: distinct[1] ?? null,
    pr3: distinct[2] ?? null,
  }
}

function lastDraftIndex(sets: WorkoutSet[]): number {
  for (let i = sets.length - 1; i >= 0; i--) {
    if (!sets[i].validated) return i
  }
  return -1
}

function makeDraft(setNumber: number, weight = 0, reps = 0): WorkoutSet {
  return {
    set_number: setNumber,
    weight_kg: weight,
    reps,
    is_pr: false,
    pr_charge: null,
    pr_serie: null,
    rest_seconds: null,
    validated_at: null,
    validated: false,
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

const WorkoutContext = createContext<WorkoutContextValue | null>(null)

export function useWorkout(): WorkoutContextValue {
  const ctx = useContext(WorkoutContext)
  if (!ctx) throw new Error('useWorkout must be inside WorkoutProvider')
  return ctx
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function WorkoutProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WorkoutStatus>('idle')
  const [startedAt, setStartedAt] = useState<Date | null>(null)
  const [exercises, setExercises] = useState<WorkoutExercise[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastValidatedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (status === 'active') {
      timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  function startWorkout() {
    setStatus('active')
    setStartedAt(new Date())
    setElapsedSeconds(0)
    setExercises([])
    setCurrentIndex(0)
    lastValidatedAtRef.current = null
  }

  function finishWorkout() {
    setStatus('done')
  }

  function resetWorkout() {
    setStatus('idle')
    setStartedAt(null)
    setElapsedSeconds(0)
    setExercises([])
    setCurrentIndex(0)
    lastValidatedAtRef.current = null
  }

  async function addExercise(
    id: string,
    name: string,
    muscleGroup: string | null,
    equipmentType: string | null = null,
  ) {
    let pr_top3_charge  = emptyTop3()
    let pr_top3_serie   = emptyTop3()
    let pr_top3_exercice = emptyTop3()

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Fetch all historical sets for this exercise (with workout_id for grouping)
        const { data } = await supabase
          .from('workout_sets')
          .select(`
            weight_kg, reps,
            workout_exercises!inner (
              exercise_id,
              workout_id,
              workouts!inner ( user_id )
            )
          `)
          .eq('workout_exercises.exercise_id', id)
          .eq('workout_exercises.workouts.user_id', user.id)

        if (data && data.length > 0) {
          const weights: number[] = []
          const serieValues: number[] = []
          const sessionVolumeMap: Record<string, number> = {}

          for (const s of data as any[]) {
            const w: number = s.weight_kg ?? 0
            const r: number = s.reps ?? 0
            const workoutId: string = s.workout_exercises?.workout_id

            if (w > 0) weights.push(w)
            if (w > 0 && r > 0) serieValues.push(w * r)
            if (workoutId && w > 0 && r > 0) {
              sessionVolumeMap[workoutId] = (sessionVolumeMap[workoutId] ?? 0) + w * r
            }
          }

          pr_top3_charge   = top3FromValues(weights)
          pr_top3_serie    = top3FromValues(serieValues)
          pr_top3_exercice = top3FromValues(Object.values(sessionVolumeMap))
        }
      }
    } catch (_) {
      // Non-bloquant
    }

    const newExercise: WorkoutExercise = {
      exercise_id: id,
      name,
      muscle_group: muscleGroup,
      equipment_type: equipmentType,
      pr_top3_charge,
      pr_top3_serie,
      pr_top3_exercice,
      pr_exercice: null,
      sets: [makeDraft(1)],
    }

    const newIndex = exercises.length
    setExercises(prev => [...prev, newExercise])
    setCurrentIndex(newIndex)
  }

  function removeExercise(index: number) {
    setExercises(prev => prev.filter((_, i) => i !== index))
    setCurrentIndex(prev => Math.max(0, Math.min(prev, exercises.length - 2)))
  }

  function updateDraftSet(exerciseIndex: number, field: 'weight_kg' | 'reps', value: number) {
    setExercises(prev => {
      const next = [...prev]
      const ex = { ...next[exerciseIndex], sets: [...next[exerciseIndex].sets] }
      const draftIdx = lastDraftIndex(ex.sets)
      if (draftIdx === -1) return prev
      ex.sets[draftIdx] = { ...ex.sets[draftIdx], [field]: Math.max(0, value) }
      next[exerciseIndex] = ex
      return next
    })
  }

  function validateSet(exerciseIndex: number): { prCharge: PrLevel; prSerie: PrLevel } {
    const ex = exercises[exerciseIndex]
    if (!ex) return { prCharge: null, prSerie: null }

    const draftIdx = lastDraftIndex(ex.sets)
    if (draftIdx === -1) return { prCharge: null, prSerie: null }

    const draft = ex.sets[draftIdx]
    if (draft.weight_kg <= 0 || draft.reps <= 0) return { prCharge: null, prSerie: null }

    const prCharge = computePodium(draft.weight_kg, ex.pr_top3_charge)
    const prSerie  = computePodium(draft.weight_kg * draft.reps, ex.pr_top3_serie)
    const isAnyPr  = prCharge !== null || prSerie !== null

    const now = Date.now()
    const rest_seconds = lastValidatedAtRef.current !== null
      ? Math.round((now - lastValidatedAtRef.current) / 1000)
      : null
    lastValidatedAtRef.current = now

    setExercises(prev => {
      const next = [...prev]
      const exCopy = { ...next[exerciseIndex], sets: [...next[exerciseIndex].sets] }
      const dIdx = lastDraftIndex(exCopy.sets)
      if (dIdx === -1) return prev

      exCopy.sets[dIdx] = {
        ...exCopy.sets[dIdx],
        validated: true,
        is_pr: isAnyPr,
        pr_charge: prCharge,
        pr_serie: prSerie,
        rest_seconds,
        validated_at: now,
      }

      const validatedCount = exCopy.sets.filter(s => s.validated).length
      exCopy.sets.push(makeDraft(validatedCount + 1, draft.weight_kg, draft.reps))

      next[exerciseIndex] = exCopy
      return next
    })

    return { prCharge, prSerie }
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    setExercises(prev => {
      const next = [...prev]
      const ex = { ...next[exerciseIndex] }
      const sets = ex.sets.filter((_, i) => i !== setIndex)

      let counter = 0
      ex.sets = sets.map(s => {
        if (s.validated) { counter++; return { ...s, set_number: counter } }
        return { ...s, set_number: counter + 1 }
      })

      next[exerciseIndex] = ex
      return next
    })
  }

  return (
    <WorkoutContext.Provider value={{
      status, startedAt, exercises, currentIndex, elapsedSeconds,
      startWorkout, finishWorkout, resetWorkout,
      addExercise, removeExercise, setCurrentIndex,
      updateDraftSet, validateSet, removeSet,
    }}>
      {children}
    </WorkoutContext.Provider>
  )
}
