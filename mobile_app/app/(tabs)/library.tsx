import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, SectionList, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Exercise {
  id: string
  name_fr: string
  equipment_type: string
  is_compound: boolean
  muscle_group: string
}

interface Section {
  title: string
  key: string
  data: Exercise[]
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const SECTION_ORDER = [
  'pectoraux', 'dos', 'epaules', 'biceps', 'triceps',
  'quadriceps', 'ischio_jambiers', 'fessiers', 'mollets', 'abdominaux', 'avant_bras',
]

const SECTION_LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules',
  biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps',
  ischio_jambiers: 'Ischio-jambiers', fessiers: 'Fessiers',
  mollets: 'Mollets', abdominaux: 'Abdominaux', avant_bras: 'Avant-bras',
}

const EQUIPMENT_LABELS: Record<string, string> = {
  barre: 'Barre', halteres: 'Haltères', poulie: 'Poulie',
  machine: 'Machine', poids_corps: 'Poids du corps', smith: 'Smith', kettlebell: 'Kettlebell',
}

const EQUIPMENT_FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'barre', label: 'Barre' },
  { key: 'halteres', label: 'Haltères' },
  { key: 'poulie', label: 'Poulie' },
  { key: 'machine', label: 'Machine' },
  { key: 'poids_corps', label: 'Poids du corps' },
  { key: 'smith', label: 'Smith' },
  { key: 'kettlebell', label: 'Kettlebell' },
]

const TYPE_FILTERS = [
  { key: 'all', label: 'Tout' },
  { key: 'compound', label: 'Polyarticulaire' },
  { key: 'isolation', label: 'Isolation' },
]

// ─── Composant ───────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const { colors } = useTheme()
  const [allExercises, setAllExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [equipFilter, setEquipFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => { fetchExercises() }, [])

  async function fetchExercises() {
    setLoading(true)
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name_fr, equipment_type, is_compound, muscle_group')
      .order('name_fr')

    if (error) {
      console.error('Erreur chargement exercices:', error.message)
      setLoading(false)
      return
    }

    setAllExercises((data ?? []) as Exercise[])
    setLoading(false)
  }

  const sections: Section[] = useCallback(() => {
    let filtered = allExercises.filter(ex => {
      const matchSearch = ex.name_fr.toLowerCase().includes(search.toLowerCase())
      const matchEquip = equipFilter === 'all' || ex.equipment_type === equipFilter
      const matchType =
        typeFilter === 'all' ||
        (typeFilter === 'compound' ? ex.is_compound : !ex.is_compound)
      return matchSearch && matchEquip && matchType
    })

    const grouped: Record<string, Exercise[]> = {}
    for (const ex of filtered) {
      const g = ex.muscle_group ?? 'autre'
      if (!grouped[g]) grouped[g] = []
      grouped[g].push(ex)
    }

    // Sort each group: compounds first
    for (const g of Object.keys(grouped)) {
      grouped[g].sort((a, b) => {
        if (a.is_compound === b.is_compound) return a.name_fr.localeCompare(b.name_fr)
        return a.is_compound ? -1 : 1
      })
    }

    return SECTION_ORDER
      .filter(k => grouped[k]?.length > 0)
      .map(k => ({
        key: k,
        title: SECTION_LABELS[k] ?? k,
        data: grouped[k],
      }))
  }, [allExercises, search, equipFilter, typeFilter])()

  const totalCount = allExercises.length

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Bibliothèque</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>{totalCount} exercices</Text>
      </View>

      {/* Filtres équipement */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {EQUIPMENT_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.separator },
              equipFilter === f.key && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
            onPress={() => setEquipFilter(f.key)}
          >
            <Text style={[
              styles.chipText, { color: colors.textSecondary },
              equipFilter === f.key && { color: '#fff' },
            ]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Filtres type */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {TYPE_FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.chip,
              { backgroundColor: colors.card, borderColor: colors.separator },
              typeFilter === f.key && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
            onPress={() => setTypeFilter(f.key)}
          >
            <Text style={[
              styles.chipText, { color: colors.textSecondary },
              typeFilter === f.key && { color: '#fff' },
            ]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Barre de recherche */}
      <View style={[styles.searchContainer, { borderBottomColor: colors.separator }]}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary }]}
          placeholder="Rechercher un exercice..."
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} size="large" />
      ) : sections.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.textPrimary }]}>Aucun exercice trouvé</Text>
          <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
            Essaie un autre filtre ou une autre recherche
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          stickySectionHeadersEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
              <Text style={[styles.sectionHeaderText, { color: colors.textSecondary }]}>
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.exerciseRow, { borderBottomColor: colors.separator }]}
              onPress={() => router.push(`/exercise/${item.id}`)}
            >
              <Text
                style={[styles.exerciseName, { color: colors.textPrimary }]}
                numberOfLines={2}
              >
                {item.name_fr}
              </Text>
              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.separator }]}>
                  <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
                    {EQUIPMENT_LABELS[item.equipment_type] ?? item.equipment_type}
                  </Text>
                </View>
                {item.is_compound && (
                  <View style={[styles.badge, styles.badgePoly]}>
                    <Text style={styles.badgePolyText}>Poly</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => null}
        />
      )}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    borderBottomWidth: 1,
  },
  title: { fontSize: 28, fontWeight: '700' },
  count: { fontSize: 13 },
  chipsScroll: { flexGrow: 0, marginTop: 8 },
  chipsContent: { paddingHorizontal: 16, gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '500' },
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  searchInput: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  loader: { flex: 1, marginTop: 60 },
  listContent: { paddingBottom: 40 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    paddingTop: 14,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
    minHeight: 64,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  badges: { flexDirection: 'row', gap: 6, flexShrink: 0 },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: '500' },
  badgePoly: {
    backgroundColor: '#D85A3022',
    borderColor: '#D85A3066',
  },
  badgePolyText: { color: '#D85A30', fontSize: 11, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 13 },
})