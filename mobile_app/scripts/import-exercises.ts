/**
 * ORAVA — Session 05
 * Script d'import one-shot : Wger API → Supabase
 *
 * Usage : npx ts-node scripts/import-exercises.ts
 * Prérequis : EXPO_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WGER_BASE = 'https://wger.de/api/v2'

// ─── Types Wger ────────────────────────────────────────────────────────────

interface WgerMuscle {
  id: number
  name_en: string
  is_front: boolean
}

interface WgerExerciseInfo {
  id: number
  uuid: string
  category: { id: number; name: string }
  muscles: { id: number; name_en: string }[]
  muscles_secondary: { id: number; name_en: string }[]
  equipment: { id: number; name: string }[]
  translations: {
    id: number
    language: number
    name: string
    description: string
  }[]
}

// ─── Mappings ──────────────────────────────────────────────────────────────

const CATEGORY_NAME_TO_GROUP: Record<string, string> = {
  'Abs':       'core',
  'Arms':      'arms',
  'Back':      'back',
  'Calves':    'calves',
  'Chest':     'chest',
  'Legs':      'legs',
  'Shoulders': 'shoulders',
  'Glutes':    'glutes',
}

const EQUIPMENT_NAME_MAP: Record<string, string> = {
  'Barbell':    'barbell',
  'Dumbbell':   'dumbbell',
  'Gymnasium mat': 'other',
  'Pull-up bar': 'bodyweight',
  'Bench':      'other',
  'Cable':      'cable',
  'Machine':    'machine',
  'Plate':      'other',
  'Resistance Band': 'band',
  'Kettlebell': 'kettlebell',
  'None (bodyweight exercise)': 'bodyweight',
  'SZ-Bar':     'barbell',
  'Dip belt':   'other',
}

const MUSCLE_GROUP_MAP: Record<number, string> = {
  1:  'shoulders',
  2:  'shoulders',
  3:  'arms',
  4:  'chest',
  5:  'arms',
  6:  'calves',
  7:  'calves',
  8:  'legs',
  9:  'core',
  10: 'back',
  11: 'back',
  12: 'legs',
  13: 'glutes',
  14: 'arms',
  15: 'arms',
  16: 'core',
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function fetchAll<T>(endpoint: string, params: Record<string, string> = {}): Promise<T[]> {
  const results: T[] = []
  const query = new URLSearchParams({ limit: '100', format: 'json', ...params })
  let url: string | null = `${WGER_BASE}/${endpoint}/?${query}`

  while (url) {
    console.log(`  GET ${url}`)
    const res: Response = await fetch(url)
    if (!res.ok) throw new Error(`Wger error ${res.status} on ${url}`)
    const data: { results: T[]; next: string | null } = await res.json()
    results.push(...data.results)
    url = data.next
    await sleep(300)
  }

  return results
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ─── Étape 1 : Import des muscles ──────────────────────────────────────────

async function importMuscles(): Promise<Map<number, string>> {
  console.log('\n📦 Import muscles...')
  const wgerMuscles = await fetchAll<WgerMuscle>('muscle')

  const wgerToOravaId = new Map<number, string>()

  for (const m of wgerMuscles) {
    if (!m.name_en) continue

    const group = MUSCLE_GROUP_MAP[m.id] ?? 'other'

    const { data, error } = await supabase
      .from('muscles')
      .upsert({
        name: m.name_en,
        muscle_group: group,
        body_side: 'both',
      }, { onConflict: 'name' })
      .select('id')
      .single()

    if (error) {
      console.error(`  ❌ Muscle "${m.name_en}":`, error.message)
      continue
    }

    wgerToOravaId.set(m.id, data.id)
    console.log(`  ✅ Muscle: ${m.name_en} (group: ${group})`)
  }

  return wgerToOravaId
}

// ─── Étape 2 : Import des exercices via exerciseinfo ───────────────────────

async function importExercises(muscleMap: Map<number, string>): Promise<void> {
  console.log('\n🏋️ Import exercices...')

  // exerciseinfo retourne tout : nom, muscles, équipement, catégorie
  const exercises = await fetchAll<WgerExerciseInfo>('exerciseinfo')

  console.log(`  ${exercises.length} exercices récupérés depuis Wger`)

  let imported = 0
  let skipped = 0

  for (const ex of exercises) {
    // Trouver le nom anglais dans les translations (language = 2)
    const enTranslation = ex.translations?.find(t => t.language === 2)
    const name = enTranslation?.name?.trim()

    if (!name) {
      skipped++
      continue
    }

    const categoryName = ex.category?.name ?? ''
    const group = CATEGORY_NAME_TO_GROUP[categoryName] ?? 'other'

    const firstEquipment = ex.equipment?.[0]?.name ?? ''
    const equipmentOrava = EQUIPMENT_NAME_MAP[firstEquipment] ?? 'other'

    const { data: exData, error: exError } = await supabase
      .from('exercises')
      .upsert({
        name,
        slug: slugify(name),
        external_id: String(ex.id),
        source: 'api',
        equipment: equipmentOrava,
        mechanics: (ex.muscles?.length ?? 0) > 1 ? 'compound' : 'isolation',
        force_type: 'push',
        laterality: 'bilateral',
        is_verified: false,
      }, { onConflict: 'external_id' })
      .select('id')
      .single()

    if (exError) {
      console.error(`  ❌ Exercice "${name}":`, exError.message)
      skipped++
      continue
    }

    const exerciseId = exData.id

    // Mappings musculaires
    const muscleMappings: {
      exercise_id: string
      muscle_id: string
      role: string
      activation_pct: number
      source: string
      confidence: string
    }[] = []

    for (const muscle of (ex.muscles ?? [])) {
      const muscleOravaId = muscleMap.get(muscle.id)
      if (!muscleOravaId) continue
      muscleMappings.push({
        exercise_id: exerciseId,
        muscle_id: muscleOravaId,
        role: 'primary',
        activation_pct: 70,
        source: 'api',
        confidence: 'low',
      })
    }

    for (const muscle of (ex.muscles_secondary ?? [])) {
      const muscleOravaId = muscleMap.get(muscle.id)
      if (!muscleOravaId) continue
      muscleMappings.push({
        exercise_id: exerciseId,
        muscle_id: muscleOravaId,
        role: 'secondary',
        activation_pct: 30,
        source: 'api',
        confidence: 'low',
      })
    }

    if (muscleMappings.length > 0) {
      const { error: mappingError } = await supabase
        .from('exercise_muscles')
        .upsert(muscleMappings, { onConflict: 'exercise_id,muscle_id' })

      if (mappingError) {
        console.error(`  ⚠️ Mapping muscles pour "${name}":`, mappingError.message)
      }
    }

    imported++
    if (imported % 20 === 0) {
      console.log(`  → ${imported} exercices importés...`)
    }
  }

  console.log(`\n✅ Import terminé : ${imported} exercices importés, ${skipped} ignorés`)
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 ORAVA — Import exercices Wger → Supabase')
  console.log('─────────────────────────────────────────────')

  if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Variables manquantes dans .env')
    process.exit(1)
  }

  try {
    const muscleMap = await importMuscles()
    console.log(`  → ${muscleMap.size} muscles mappés`)
    await importExercises(muscleMap)
    console.log('\n🎉 Script terminé avec succès !')
  } catch (err) {
    console.error('\n❌ Erreur fatale :', err)
    process.exit(1)
  }
}

main()