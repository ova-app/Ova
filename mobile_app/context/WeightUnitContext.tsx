import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  WeightUnit,
  convertFromKg,
  convertToKg,
  formatWeight,
  formatVolumeUnit,
} from '@/lib/weights'

// Source de vérité : AsyncStorage clé `settings_weight_unit` (même clé que settings.tsx,
// historiquement écrite là). Offline-first — aucun appel réseau. La colonne DB
// users.weight_unit existe mais n'est pas la source ici (cohérent avec le reste des réglages).
const STORAGE_KEY = 'settings_weight_unit'

interface WeightUnitContextValue {
  unit: WeightUnit
  label: WeightUnit // 'kg' | 'lbs' — suffixe d'affichage
  setUnit: (u: WeightUnit) => void
  // Helpers liés à l'unité courante (kg = unité canonique en DB).
  toDisplay: (kg: number) => number
  toKg: (value: number) => number
  formatWeight: (kg: number | null | undefined, opts?: { suffix?: boolean }) => string
  formatVolume: (kg: number | null | undefined, opts?: { suffix?: boolean }) => string
}

const WeightUnitContext = createContext<WeightUnitContextValue | null>(null)

export function useWeightUnit(): WeightUnitContextValue {
  const ctx = useContext(WeightUnitContext)
  if (!ctx) throw new Error('useWeightUnit must be inside WeightUnitProvider')
  return ctx
}

export function WeightUnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>('kg')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value === 'lbs' || value === 'kg') setUnitState(value)
    })
  }, [])

  function setUnit(u: WeightUnit) {
    setUnitState(u)
    AsyncStorage.setItem(STORAGE_KEY, u).catch(() => {})
  }

  const value = useMemo<WeightUnitContextValue>(
    () => ({
      unit,
      label: unit,
      setUnit,
      toDisplay: (kg) => convertFromKg(kg, unit),
      toKg: (v) => convertToKg(v, unit),
      formatWeight: (kg, opts) => formatWeight(kg, unit, opts),
      formatVolume: (kg, opts) => formatVolumeUnit(kg, unit, opts),
    }),
    [unit]
  )

  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>
}
