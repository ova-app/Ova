/**
 * ORAVA — Session 05
 * app/(tabs)/library.tsx
 */

import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator, Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'

interface Exercise {
  id: string
  name: string
  equipment: string
  mechanics: string
  muscles_primary: string[]
  muscle_group: string
  is_verified: boolean
}

interface MuscleGroup {
  key: string
  label: string
}

const MUSCLE_GROUPS: MuscleGroup[] = [
  { key: 'all',       label: 'Tous' },
  { key: 'chest',     label: 'Poitrine' },
  { key: 'back',      label: 'Dos' },
  { key: 'shoulders', label: 'Épaules' },
  { key: 'arms',      label: 'Bras' },
  { key: 'legs',      label: 'Jambes' },
  { key: 'core',      label: 'Abdos' },
  { key: 'glutes',    label: 'Fessiers' },
  { key: 'calves',    label: 'Mollets' },
]

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: 'Barre', dumbbell: 'Haltères', machine: 'Machine',
  cable: 'Poulie', bodyweight: 'Poids corps', kettlebell: 'Kettlebell',
  band: 'Élastique', other: 'Autre',
}

export default function LibraryScreen() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeGroup, setActiveGroup] = useState('all')

  useEffect(() => { fetchExercises() }, [activeGroup])

  async function fetchExercises() {
    setLoading(true)

    let query = supabase
      .from('exercises')
      .select(`
        id, name, equipment, mechanics, is_verified,
        exercise_muscles!inner (
          role,
          muscles ( name, muscle_group )
        )
      `)
      .order('name')
      .limit(200)

    if (activeGroup !== 'all') {
      query = query
        .eq('exercise_muscles.muscles.muscle_group', activeGroup)
        .eq('exercise_muscles.role', 'primary')
    }

    const { data, error } = await query

    if (error) {
      console.error('Erreur chargement exercices:', error.message)
      setLoading(false)
      return
    }

    const transformed: Exercise[] = (data ?? []).map((ex: any) => {
      const primaryMuscles = ex.exercise_muscles
        ?.filter((em: any) => em.role === 'primary')
        ?.map((em: any) => em.muscles?.name)
        ?.filter(Boolean) ?? []

      const muscle_group = ex.exercise_muscles?.[0]?.muscles?.muscle_group ?? 'other'

      return {
        id: ex.id,
        name: ex.name,
        equipment: ex.equipment,
        mechanics: ex.mechanics,
        muscles_primary: primaryMuscles,
        muscle_group,
        is_verified: ex.is_verified,
      }
    })

    setExercises(transformed)
    setLoading(false)
  }

  const filtered = exercises.filter(ex =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.muscles_primary.some(m => m.toLowerCase().includes(search.toLowerCase()))
  )

  const renderChip = useCallback(({ key, label }: MuscleGroup) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, activeGroup === key && styles.chipActive]}
      onPress={() => setActiveGroup(key)}
    >
      <Text style={[styles.chipText, activeGroup === key && styles.chipTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  ), [activeGroup])

  const renderExercise = useCallback(({ item }: { item: Exercise }) => (
    <Pressable style={styles.exerciseRow} onPress={() => router.push(`/exercise/${item.id}`)}>
      <View style={styles.exerciseInfo}>
        <View style={styles.exerciseNameRow}>
          <Text style={styles.exerciseName} numberOfLines={1}>{item.name}</Text>
          {item.is_verified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>✓</Text>
            </View>
          )}
        </View>
        <View style={styles.tags}>
          {item.muscles_primary.slice(0, 2).map(muscle => (
            <View key={muscle} style={styles.tag}>
              <Text style={styles.tagText}>{muscle}</Text>
            </View>
          ))}
          {item.equipment && (
            <View style={[styles.tag, styles.tagEquipment]}>
              <Text style={styles.tagText}>{EQUIPMENT_LABELS[item.equipment] ?? item.equipment}</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  ), [])

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bibliothèque</Text>
      </View>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un exercice..."
          placeholderTextColor="#555"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll} contentContainerStyle={styles.chipsContent}>
        {MUSCLE_GROUPS.map(renderChip)}
      </ScrollView>
      {loading ? (
        <ActivityIndicator style={styles.loader} color="#D85A30" size="large" />
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Aucun exercice trouvé</Text>
          <Text style={styles.emptySubtext}>Essaie un autre filtre ou une autre recherche</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderExercise}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: '#fff' },
  searchContainer: { paddingHorizontal: 16, marginBottom: 12 },
  searchInput: {
    backgroundColor: '#1A1A1A', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 15,
  },
  chipsScroll: { flexGrow: 0, marginBottom: 8 },
  chipsContent: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#333',
  },
  chipActive: { backgroundColor: '#D85A30', borderColor: '#D85A30' },
  chipText: { color: '#888', fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  loader: { flex: 1, marginTop: 60 },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  exerciseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  exerciseInfo: { flex: 1, gap: 6 },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  exerciseName: { color: '#fff', fontSize: 15, fontWeight: '600', flex: 1 },
  verifiedBadge: {
    backgroundColor: '#D85A3022', borderRadius: 10,
    width: 18, height: 18, alignItems: 'center', justifyContent: 'center',
  },
  verifiedText: { color: '#D85A30', fontSize: 10, fontWeight: '700' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { backgroundColor: '#1A1A1A', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  tagEquipment: { backgroundColor: '#111', borderWidth: 1, borderColor: '#2A2A2A' },
  tagText: { color: '#888', fontSize: 11 },
  chevron: { color: '#444', fontSize: 22, marginLeft: 8 },
  separator: { height: 1, backgroundColor: '#1A1A1A' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  emptySubtext: { color: '#555', fontSize: 13 },
})