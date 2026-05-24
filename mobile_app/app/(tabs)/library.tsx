import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, Search } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string
  name_fr: string
  equipment_type: string | null
  muscle_group: string
}

interface LibrarySection {
  title: string      // muscle group label FR
  data: Exercise[]
}

// ─── Muscle group labels FR ───────────────────────────────────────────────────

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  pectoraux:        'Pectoraux',
  dos:              'Dos',
  epaules:          'Épaules',
  biceps:           'Biceps',
  triceps:          'Triceps',
  quadriceps:       'Quadriceps',
  ischio_jambiers:  'Ischio-jambiers',
  fessiers:         'Fessiers',
  mollets:          'Mollets',
  abdominaux:       'Abdominaux',
  avant_bras:       'Avant-bras',
}

const MUSCLE_GROUP_ORDER = Object.keys(MUSCLE_GROUP_LABELS)

// ─── normalize NFD ────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const { colors } = useTheme()
  const anim = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    ).start()
  }, [anim])

  return (
    <Animated.View style={{ opacity: anim, height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.s5, marginBottom: 2 }}>
      <View style={{ flex: 1 }}>
        <View style={{ width: '45%', height: 12, borderRadius: 4, backgroundColor: colors.backgroundSecondary }} />
        <View style={{ width: '30%', height: 10, borderRadius: 4, backgroundColor: colors.backgroundSecondary, marginTop: 6 }} />
      </View>
    </Animated.View>
  )
}

// ─── Exercise row ─────────────────────────────────────────────────────────────

interface ExerciseRowProps {
  item: Exercise
  onPress: () => void
}

function ExerciseRow({ item, onPress }: ExerciseRowProps) {
  const { colors } = useTheme()

  const equipmentLabel = item.equipment_type
    ? item.equipment_type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    : null

  const muscleLabel = MUSCLE_GROUP_LABELS[item.muscle_group] ?? item.muscle_group

  const subtitle = equipmentLabel
    ? `${equipmentLabel} · ${muscleLabel}`
    : muscleLabel

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.exerciseRow]}
    >
      <View style={{ flex: 1 }}>
        <Text
          style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}
          numberOfLines={1}
        >
          {item.name_fr}
        </Text>
        <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const { colors } = useTheme()
  const router = useRouter()

  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchExercises = useCallback(async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('id, name_fr, equipment_type, muscle_group')
      .order('name_fr', { ascending: true })

    if (error || !data) return

    setExercises(data as Exercise[])
  }, [])

  useEffect(() => {
    fetchExercises().finally(() => setLoading(false))
  }, [fetchExercises])

  // ─── Filter + sections ───────────────────────────────────────────────────────

  const sections = useMemo<LibrarySection[]>(() => {
    const normalizedQuery = normalize(query)

    const filtered = exercises.filter(ex => {
      const matchesGroup = activeGroup == null || ex.muscle_group === activeGroup
      const matchesQuery =
        normalizedQuery.length === 0 ||
        normalize(ex.name_fr).includes(normalizedQuery) ||
        (ex.equipment_type != null && normalize(ex.equipment_type).includes(normalizedQuery))
      return matchesGroup && matchesQuery
    })

    // Group by muscle_group in canonical order
    const grouped = new Map<string, Exercise[]>()
    for (const ex of filtered) {
      if (!grouped.has(ex.muscle_group)) grouped.set(ex.muscle_group, [])
      grouped.get(ex.muscle_group)!.push(ex)
    }

    const result: LibrarySection[] = []
    for (const key of MUSCLE_GROUP_ORDER) {
      const group = grouped.get(key)
      if (group && group.length > 0) {
        result.push({
          title: MUSCLE_GROUP_LABELS[key] ?? key,
          data: group,
        })
      }
    }
    // Groupes hors order canonical à la fin
    for (const [key, group] of grouped.entries()) {
      if (!MUSCLE_GROUP_ORDER.includes(key) && group.length > 0) {
        result.push({ title: MUSCLE_GROUP_LABELS[key] ?? key, data: group })
      }
    }

    return result
  }, [exercises, query, activeGroup])

  // Muscle groups présents dans les données
  const presentGroups = useMemo(() => {
    const set = new Set(exercises.map(e => e.muscle_group))
    return MUSCLE_GROUP_ORDER.filter(g => set.has(g))
  }, [exercises])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <Text style={[typography.title, { color: colors.textPrimary, paddingHorizontal: spacing.s5, paddingTop: spacing.s12, paddingBottom: spacing.s4 }]}>
        Bibliothèque
      </Text>

      {/* SearchBar */}
      <View style={[styles.searchBar, { backgroundColor: colors.backgroundSecondary }]}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={[
            typography.caption,
            {
              flex: 1,
              color: colors.textPrimary,
              marginLeft: spacing.s2,
              paddingVertical: 0,
            },
          ]}
          placeholder="Rechercher un exercice…"
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {/* Chips muscle groups */}
      <View style={[styles.chipsContainer]}>
        {/* Chip "Tous" */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setActiveGroup(null)}
          style={[
            styles.chip,
            {
              backgroundColor: activeGroup == null ? colors.accent : colors.backgroundSecondary,
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              {
                color: activeGroup == null ? colors.background : colors.textSecondary,
              },
            ]}
          >
            Tous
          </Text>
        </TouchableOpacity>

        {presentGroups.map(group => {
          const isActive = activeGroup === group
          return (
            <TouchableOpacity
              key={group}
              activeOpacity={0.75}
              onPress={() => setActiveGroup(isActive ? null : group)}
              style={[
                styles.chip,
                {
                  backgroundColor: isActive ? colors.accent : colors.backgroundSecondary,
                },
              ]}
            >
              <Text
                style={[
                  typography.caption,
                  {
                    color: isActive ? colors.background : colors.textSecondary,
                  },
                ]}
              >
                {MUSCLE_GROUP_LABELS[group] ?? group}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* List */}
      {loading ? (
        <View style={{ paddingTop: spacing.s4 }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: spacing.s12 }}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                typography.caption,
                {
                  color: colors.textTertiary,
                  textTransform: 'uppercase',
                  paddingHorizontal: spacing.s5,
                  paddingTop: spacing.s6,
                  paddingBottom: spacing.s2,
                  backgroundColor: colors.background,
                },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <ExerciseRow
              item={item}
              onPress={() => router.push(`/exercise/${item.id}` as const)}
            />
          )}
          ItemSeparatorComponent={() => (
            <View style={{ height: 1, backgroundColor: colors.separator, marginHorizontal: spacing.s5 }} />
          )}
          SectionSeparatorComponent={() => null}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={[typography.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                Aucun exercice trouvé.
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled
        />
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    marginHorizontal: spacing.s5,
    paddingHorizontal: spacing.s4,
    marginBottom: spacing.s3,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: spacing.s5,
    marginBottom: spacing.s3,
  },
  chip: {
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
  },
  empty: {
    paddingTop: spacing.s12,
    paddingHorizontal: spacing.s6,
    alignItems: 'center',
  },
})
