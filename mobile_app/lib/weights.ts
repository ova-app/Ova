// ─── Granulométrie poids + reps — source unique (ORA-035) ────────────────────
// Auparavant dupliqué dans session.tsx et wheel-picker-modal.tsx.
// Granulométrie figée (cf. rules/workout.md — ne pas modifier).

export const REPS_VALUES = Array.from({ length: 50 }, (_, i) => i + 1)

// Valeurs de poids sélectionnables selon l'équipement.
// dumbbell : 2 kg · barbell : barre + disques · kettlebell : 4 kg · défaut (poulie/machine) : 2,5 kg
export function getWeightValues(equipType: string | null): number[] {
  if (equipType === 'bodyweight') return []
  if (equipType === 'dumbbell') return Array.from({ length: 30 }, (_, i) => (i + 1) * 2)
  if (equipType === 'barbell') {
    return [
      20, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140, 150, 160,
      170, 180, 190, 200, 210, 220,
    ]
  }
  if (equipType === 'kettlebell') return Array.from({ length: 12 }, (_, i) => (i + 1) * 4)
  return Array.from({ length: 80 }, (_, i) => (i + 1) * 2.5)
}

// ─── Unité de poids — conversions + formatage (kg = unité canonique en DB) ────
// La DB stocke TOUJOURS des kg (weight_kg, total_volume_kg, poids_corps_kg).
// L'unité n'est qu'une préférence d'affichage + de saisie. Tout transite par kg.

export type WeightUnit = 'kg' | 'lbs'

const LB_PER_KG = 2.2046226218
const KG_PER_LB = 0.45359237

// kg canonique → valeur affichée dans l'unité choisie (non arrondie).
export function convertFromKg(kg: number, unit: WeightUnit): number {
  return unit === 'lbs' ? kg * LB_PER_KG : kg
}

// valeur saisie dans l'unité choisie → kg canonique (pour stockage DB).
export function convertToKg(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value * KG_PER_LB : value
}

// Arrondi d'affichage : entier en lbs, dixième en kg (granulométrie 2,5 kg).
function roundDisplay(value: number, unit: WeightUnit): number {
  if (unit === 'lbs') return Math.round(value)
  return Math.round(value * 10) / 10
}

// Poids unitaire (charge, record) → chaîne affichée. `suffix` ajoute « kg »/« lbs ».
export function formatWeight(
  kg: number | null | undefined,
  unit: WeightUnit,
  opts: { suffix?: boolean } = {}
): string {
  if (kg == null) return '—'
  const v = roundDisplay(convertFromKg(kg, unit), unit)
  const num = `${v}`
  return opts.suffix === false ? num : `${num} ${unit}`
}

// Volume (gros nombres) → entier espacé par milliers, optionnellement suffixé.
export function formatVolumeUnit(
  kg: number | null | undefined,
  unit: WeightUnit,
  opts: { suffix?: boolean } = {}
): string {
  if (kg == null) return '—'
  const rounded = Math.round(convertFromKg(kg, unit))
  const num =
    rounded >= 1000
      ? `${Math.floor(rounded / 1000)} ${(rounded % 1000).toString().padStart(3, '0')}`
      : `${rounded}`
  return opts.suffix ? `${num} ${unit}` : num
}

// Granulométrie lbs — parallèle au kg (ne modifie pas le kg figé).
// Pas standards des disques/haltères impériaux. Stockage reste en kg (convertToKg).
export function getWeightValuesLbs(equipType: string | null): number[] {
  if (equipType === 'bodyweight') return []
  if (equipType === 'dumbbell') return Array.from({ length: 30 }, (_, i) => (i + 1) * 5) // 5→150
  if (equipType === 'barbell') {
    return [
      45, 65, 95, 115, 135, 145, 155, 165, 175, 185, 195, 205, 225, 245, 265, 275, 295, 315, 335,
      365, 385, 405, 425, 455, 495,
    ]
  }
  if (equipType === 'kettlebell') return Array.from({ length: 12 }, (_, i) => (i + 1) * 10) // 10→120
  return Array.from({ length: 80 }, (_, i) => (i + 1) * 5) // 5→400
}

// Valeurs du wheel picker selon l'unité d'affichage active.
export function getWeightValuesForUnit(equipType: string | null, unit: WeightUnit): number[] {
  return unit === 'lbs' ? getWeightValuesLbs(equipType) : getWeightValues(equipType)
}
