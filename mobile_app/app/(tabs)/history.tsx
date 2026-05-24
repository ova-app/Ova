import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ChevronRight, Trophy } from 'lucide-react-native'
import { useRouter } from 'expo-router'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkoutRow {
  id: string
  title: string
  started_at: string
  duration_sec: number | null
  total_volume_kg: number | null
  total_sets: number
  pr_seance: 'gold' | 'silver' | 'bronze' | null
}

interface HistorySection {
  title: string      // "MAI 2026"
  data: WorkoutRow[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_FR = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
]
const DAYS_FR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']

function sectionKeyFromDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`
}

function formatDuration(sec: number | null): string {
  if (!sec) return '—'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}min`
  return `${m}min`
}

function formatVolume(kg: number | null): string {
  if (kg == null) return '—'
  const rounded = Math.round(kg)
  if (rounded >= 1000) {
    const thousands = Math.floor(rounded / 1000)
    const rest = rounded % 1000
    return `${thousands} ${rest.toString().padStart(3, '0')}`
  }
  return `${rounded}`
}

function groupByMonth(rows: WorkoutRow[]): HistorySection[] {
  const map = new Map<string, WorkoutRow[]>()
  for (const row of rows) {
    const key = sectionKeyFromDate(row.started_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }))
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
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundSecondary,
          opacity: anim,
          marginBottom: spacing.s2,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s4 }}>
        <View style={[styles.dateBlock, { backgroundColor: colors.backgroundTertiary, borderRadius: 6 }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={{ width: '55%', height: 12, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
          <View style={{ width: '40%', height: 10, borderRadius: 4, backgroundColor: colors.backgroundTertiary }} />
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
  const d = new Date(item.started_at)
  const day = d.getDate().toString() // pas de zéro devant
  const weekday = DAYS_FR[d.getDay()]

  const volumeStr = formatVolume(item.total_volume_kg)
  const isGoldPR = item.pr_seance === 'gold'

  const subtitleParts = [
    `${item.total_sets} série${item.total_sets > 1 ? 's' : ''}`,
    formatDuration(item.duration_sec),
  ]

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.backgroundSecondary, marginBottom: spacing.s2 }]}
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
            style={[
              typography.body,
              { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' },
            ]}
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

        {/* Right : trophy + volume + chevron */}
        <View style={styles.rightCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {item.pr_seance != null && (
              <Trophy size={14} color={colors.prGold} />
            )}
            <Text
              style={[
                typography.body,
                {
                  color: isGoldPR ? colors.accent : colors.textPrimary,
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
                kg
              </Text>
            </Text>
          </View>
          <ChevronRight size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function HistoryScreen() {
  const { colors } = useTheme()
  const router = useRouter()

  const [sections, setSections] = useState<HistorySection[]>([])
  const [loading, setLoading] = useState(true)

  const fetchHistory = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    if (!uid) return

    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id,
        title,
        started_at,
        duration_sec,
        total_volume_kg,
        pr_seance,
        workout_exercises (
          workout_sets ( id )
        )
      `)
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(200)

    if (error || !data) return

    const rows: WorkoutRow[] = (data as Array<{
      id: string
      title: string
      started_at: string
      duration_sec: number | null
      total_volume_kg: number | null
      pr_seance: 'gold' | 'silver' | 'bronze' | null
      workout_exercises: Array<{ workout_sets: Array<{ id: string }> }>
    }>).map(w => {
      const totalSets = w.workout_exercises.reduce(
        (acc, ex) => acc + ex.workout_sets.length,
        0
      )
      return {
        id: w.id,
        title: w.title ?? '—',
        started_at: w.started_at,
        duration_sec: w.duration_sec,
        total_volume_kg: w.total_volume_kg,
        total_sets: totalSets,
        pr_seance: w.pr_seance,
      }
    })

    setSections(groupByMonth(rows))
  }, [])

  useEffect(() => {
    fetchHistory().finally(() => setLoading(false))
  }, [fetchHistory])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
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
          keyExtractor={item => item.id}
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
            <HistoryRow
              item={item}
              onPress={() => router.push(`/history/${item.id}` as const)}
            />
          )}
          ItemSeparatorComponent={() => null}
          SectionSeparatorComponent={() => null}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text
                style={[
                  typography.subtitle,
                  { color: colors.textSecondary, textAlign: 'center' },
                ]}
              >
                Aucune séance enregistrée.
              </Text>
              <Text
                style={[
                  typography.caption,
                  { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.s2 },
                ]}
              >
                Lance ta première séance avec le bouton +
              </Text>
            </View>
          )}
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
  empty: {
    paddingTop: spacing.s12,
    paddingHorizontal: spacing.s6,
    alignItems: 'center',
  },
})
