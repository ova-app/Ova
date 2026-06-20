import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { SectionList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
  withSpring,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, Search, Star } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { emptyStateRecipe, skeletonRecipe } from '@/constants/recipes'
import { supabase } from '@/lib/supabase'
import { MUSCLE_GROUP_LABELS } from '@/lib/muscles'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string
  name_fr: string
  equipment_type: string | null
  muscle_group: string
}

interface LibrarySection {
  title: string // muscle group label FR
  data: Exercise[]
}

// ─── Muscle group labels FR (référentiel centralisé : lib/muscles.ts) ─────────

const MUSCLE_GROUP_ORDER = Object.keys(MUSCLE_GROUP_LABELS)

// ─── normalize NFD ────────────────────────────────────────────────────────────

function normalize(str: string): string {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const { colors } = useTheme()
  const sk = skeletonRecipe(colors)
  const shimmer = useSharedValue(0.4)

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(0.8, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    )
  }, [])

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: shimmer.value,
  }))

  return (
    <Animated.View
      style={[
        {
          minHeight: touchTarget.comfort,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.s5,
          marginBottom: 2,
        },
        shimmerStyle,
      ]}
    >
      <View style={{ flex: 1, gap: spacing.s2 }}>
        <View style={[sk.line, { width: '45%' }]} />
        <View style={[sk.line, { width: '30%', height: 10 }]} />
      </View>
    </Animated.View>
  )
}

// ─── Exercise row ─────────────────────────────────────────────────────────────

interface ExerciseRowProps {
  item: Exercise
  isFavorite: boolean
  onPress: () => void
  onToggleFavorite: () => void
}

function ExerciseRow({ item, isFavorite, onPress, onToggleFavorite }: ExerciseRowProps) {
  const { colors } = useTheme()
  const starScale = useSharedValue(1)

  const equipmentLabel = item.equipment_type
    ? item.equipment_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : null

  const muscleLabel = MUSCLE_GROUP_LABELS[item.muscle_group] ?? item.muscle_group

  const subtitle = equipmentLabel ? `${equipmentLabel} · ${muscleLabel}` : muscleLabel

  const starAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: starScale.value }],
  }))

  const handleToggleFavorite = () => {
    starScale.value = withSpring(0.8, { damping: 18, stiffness: 300 })
    starScale.value = withSpring(1, { damping: 18, stiffness: 300 })
    onToggleFavorite()
  }

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.exerciseRow]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name_fr}, ${subtitle}`}
      accessibilityHint="Voir la fiche de l'exercice"
    >
      <View style={{ flex: 1, gap: spacing.s1 }}>
        <Text
          style={[typography.body, { color: colors.textPrimary, fontFamily: font.bold }]}
          numberOfLines={1}
        >
          {item.name_fr}
        </Text>
        <Text style={[typography.caption, { color: colors.textTertiary }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={handleToggleFavorite}
        hitSlop={12}
        style={{ marginRight: spacing.s2 }}
        accessibilityRole="button"
        accessibilityState={{ selected: isFavorite }}
        accessibilityLabel={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
      >
        <Animated.View style={starAnimStyle}>
          <Star
            size={18}
            color={colors.accent}
            fill={isFavorite ? colors.accent : 'none'}
            strokeWidth={isFavorite ? 0 : 1.5}
          />
        </Animated.View>
      </TouchableOpacity>
      <ChevronRight size={16} color={colors.textTertiary} />
    </TouchableOpacity>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function LibraryEmptyState() {
  const { colors } = useTheme()
  const s = emptyStateRecipe('library', colors)
  return (
    <View style={s.container}>
      <View style={s.icon}>
        <Search size={28} color={colors.textTertiary} />
      </View>
      <Text style={s.title}>Aucun exercice trouvé.</Text>
      <Text style={s.subtitle}>Essaie un autre terme ou filtre.</Text>
    </View>
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // ─── Load favorites ─────────────────────────────────────────────────────────

  const loadFavorites = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('library_favorites')
      if (stored) {
        setFavorites(new Set(JSON.parse(stored) as string[]))
      }
    } catch {
      // Silently fail
    }
  }, [])

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
    Promise.all([loadFavorites(), fetchExercises()]).finally(() => setLoading(false))
  }, [loadFavorites, fetchExercises])

  // ─── Toggle favorite ────────────────────────────────────────────────────────

  const toggleFavorite = useCallback(
    async (exerciseId: string) => {
      const newFavs = new Set(favorites)
      if (newFavs.has(exerciseId)) {
        newFavs.delete(exerciseId)
      } else {
        newFavs.add(exerciseId)
      }
      setFavorites(newFavs)
      try {
        await AsyncStorage.setItem('library_favorites', JSON.stringify(Array.from(newFavs)))
      } catch {
        // Silently fail
      }
    },
    [favorites]
  )

  // ─── Filter + sections ───────────────────────────────────────────────────────

  const sections = useMemo<LibrarySection[]>(() => {
    const normalizedQuery = normalize(query)

    const filtered = exercises.filter((ex) => {
      const matchesGroup = activeGroup == null || ex.muscle_group === activeGroup
      const matchesQuery =
        normalizedQuery.length === 0 ||
        normalize(ex.name_fr).includes(normalizedQuery) ||
        (ex.equipment_type != null && normalize(ex.equipment_type).includes(normalizedQuery))
      return matchesGroup && matchesQuery
    })

    const result: LibrarySection[] = []

    // Favorites section first if any
    const favoriteExercises = filtered.filter((ex) => favorites.has(ex.id))
    if (favoriteExercises.length > 0) {
      result.push({
        title: 'FAVORIS',
        data: favoriteExercises,
      })
    }

    // Group by muscle_group in canonical order
    const grouped = new Map<string, Exercise[]>()
    for (const ex of filtered) {
      if (!grouped.has(ex.muscle_group)) grouped.set(ex.muscle_group, [])
      grouped.get(ex.muscle_group)!.push(ex)
    }

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
  }, [exercises, query, activeGroup, favorites])

  // Muscle groups présents dans les données
  const presentGroups = useMemo(() => {
    const set = new Set(exercises.map((e) => e.muscle_group))
    return MUSCLE_GROUP_ORDER.filter((g) => set.has(g))
  }, [exercises])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <Text
        style={[
          typography.caption,
          {
            color: colors.textPrimary,
            fontFamily: font.bold,
            textTransform: 'uppercase',
            letterSpacing: 1,
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s10,
            paddingBottom: spacing.s4,
          },
        ]}
      >
        Bibliothèque
      </Text>

      {/* SearchBar */}
      <View style={[styles.searchBar, { backgroundColor: colors.inputBackground }]}>
        <Search size={16} color={colors.textTertiary} />
        <TextInput
          style={[
            typography.body,
            {
              flex: 1,
              color: colors.textPrimary,
              marginLeft: spacing.s2,
              paddingVertical: 0,
            },
          ]}
          placeholder="Rechercher..."
          placeholderTextColor={colors.textTertiary}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          clearButtonMode="while-editing"
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel="Rechercher un exercice"
        />
      </View>

      {/* Chips muscle groups */}
      <View style={[styles.chipsContainer]}>
        {/* Chip "Tous" */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setActiveGroup(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: activeGroup == null }}
          accessibilityLabel="Filtre Tous"
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

        {presentGroups.map((group) => {
          const isActive = activeGroup === group
          return (
            <TouchableOpacity
              key={group}
              activeOpacity={0.75}
              onPress={() => setActiveGroup(isActive ? null : group)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Filtre ${MUSCLE_GROUP_LABELS[group] ?? group}`}
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
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.s12 }}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                typography.caption,
                {
                  color: colors.textTertiary,
                  fontFamily: font.bold,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  paddingHorizontal: spacing.s5,
                  paddingVertical: spacing.s2,
                  paddingTop: spacing.s6,
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
              isFavorite={favorites.has(item.id)}
              onPress={() => router.push(`/exercise/${item.id}` as const)}
              onToggleFavorite={() => void toggleFavorite(item.id)}
            />
          )}
          ItemSeparatorComponent={() => null}
          SectionSeparatorComponent={() => null}
          ListEmptyComponent={() =>
            query.length > 0 || activeGroup != null ? <LibraryEmptyState /> : null
          }
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
    gap: spacing.s2,
    paddingHorizontal: spacing.s5,
    marginBottom: spacing.s3,
  },
  chip: {
    height: 32,
    borderRadius: radius.full,
    paddingHorizontal: spacing.s3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseRow: {
    minHeight: touchTarget.comfort,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s5,
    paddingVertical: spacing.s3,
  },
})
