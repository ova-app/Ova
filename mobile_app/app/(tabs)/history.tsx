import React, { useEffect } from 'react'
import { SectionList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  Easing,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, Dumbbell, Trophy } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography } from '@/constants/theme'
import { emptyStateRecipe } from '@/constants/recipes'
import { formatDuration } from '@/lib/utils'
import { useHistoryData, type WorkoutRow } from '@/lib/hooks/useHistoryData'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS_FR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  const { colors } = useTheme()
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
        styles.card,
        {
          backgroundColor: colors.backgroundSecondary,
          marginBottom: spacing.s2,
        },
        shimmerStyle,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s4 }}>
        <View
          style={[
            styles.dateBlock,
            { backgroundColor: colors.backgroundTertiary, borderRadius: 6 },
          ]}
        />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={{
              width: '55%',
              height: 12,
              borderRadius: 4,
              backgroundColor: colors.backgroundTertiary,
            }}
          />
          <View
            style={{
              width: '40%',
              height: 10,
              borderRadius: 4,
              backgroundColor: colors.backgroundTertiary,
            }}
          />
        </View>
      </View>
    </Animated.View>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: WorkoutRow
  onPress: () => void
}

function HistoryRow({ item, onPress }: HistoryRowProps) {
  const { colors } = useTheme()
  const { unit: weightUnit, formatVolume: formatVolumeU } = useWeightUnit()
  const d = new Date(item.started_at)
  const day = d.getDate().toString() // pas de zéro devant
  const weekday = DAYS_FR[d.getDay()]

  const volumeStr = formatVolumeU(item.total_volume_kg)

  const subtitleParts = [
    `${item.total_sets} série${item.total_sets > 1 ? 's' : ''}`,
    formatDuration(item.duration_sec),
  ]

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.backgroundSecondary, marginBottom: spacing.s2 },
      ]}
    >
      <View style={styles.cardInner}>
        {/* Bloc date */}
        <View style={styles.dateBlock}>
          <Text
            style={[
              typography.title,
              {
                color: colors.textPrimary,
                fontSize: 22,
                lineHeight: 26,
                letterSpacing: -0.3,
                fontFamily: 'Barlow_700Bold',
              },
            ]}
          >
            {day}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, textTransform: 'uppercase', marginTop: 2 },
            ]}
          >
            {weekday}
          </Text>
        </View>

        {/* Centre */}
        <View style={styles.centerCol}>
          <Text
            style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}
            numberOfLines={1}
          >
            {item.title ?? '—'}
          </Text>
          <Text
            style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={1}
          >
            {subtitleParts.join(' · ')}
          </Text>
        </View>

        {/* Right : icône PR + volume + chevron */}
        <View style={styles.rightCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {item.pr_seance === 'gold' && <Trophy size={14} color={colors.prGold} />}
            {item.pr_seance === 'silver' && <Trophy size={14} color={colors.prSilver} />}
            {item.pr_seance === 'bronze' && <Trophy size={14} color={colors.prBronze} />}
            <Text
              style={[
                typography.body,
                {
                  color: colors.textPrimary,
                  fontFamily: 'Barlow_700Bold',
                  fontVariant: ['tabular-nums'],
                  fontSize: 14,
                },
              ]}
            >
              {volumeStr}{' '}
              <Text
                style={{
                  fontFamily: 'Barlow_400Regular',
                  color: colors.textSecondary,
                  fontSize: 12,
                }}
              >
                {weightUnit}
              </Text>
            </Text>
          </View>
          <ChevronRight size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function HistoryEmptyState() {
  const { colors } = useTheme()
  const router = useRouter()
  const s = emptyStateRecipe('history', colors)
  return (
    <View style={s.container}>
      <View style={s.icon}>
        <Dumbbell size={28} color={colors.textTertiary} />
      </View>
      <Text style={s.title}>Aucune séance encore.</Text>
      <Text style={s.subtitle}>Lance ta première séance.</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/workout/session')}
        style={s.cta}
      >
        <Text style={s.ctaLabel}>COMMENCER</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { colors } = useTheme()
  const router = useRouter()

  const { sections, loading } = useHistoryData()

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <Text
        style={[
          typography.title,
          {
            color: colors.textPrimary,
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s6,
            paddingBottom: spacing.s3,
          },
        ]}
      >
        Historique
      </Text>

      {loading ? (
        <View style={{ paddingHorizontal: spacing.s5 }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.s5,
            paddingBottom: spacing.s12,
          }}
          renderSectionHeader={({ section }) => (
            <Text
              style={[
                typography.caption,
                {
                  color: colors.textTertiary,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  paddingTop: spacing.s6,
                  paddingBottom: spacing.s3,
                },
              ]}
            >
              {section.title}
            </Text>
          )}
          renderItem={({ item }) => (
            <HistoryRow item={item} onPress={() => router.push(`/history/${item.id}` as const)} />
          )}
          ItemSeparatorComponent={() => null}
          SectionSeparatorComponent={() => null}
          ListEmptyComponent={() => <HistoryEmptyState />}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
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
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    gap: spacing.s3,
  },
  dateBlock: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
  },
  rightCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 2,
  },
})
