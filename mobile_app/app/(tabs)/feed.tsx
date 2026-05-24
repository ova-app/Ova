import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Heart, MessageCircle, RefreshCw } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography } from '@/constants/theme'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeedWorkout {
  id: string
  title: string
  total_volume_kg: number | null
  started_at: string
  pr_seance: 'gold' | 'silver' | 'bronze' | null
  user: {
    id: string
    username: string | null
    full_name: string | null
  }
  likes_count: number
  comments_count: number
  user_has_liked: boolean
}

// ─── Avatar colors (stable par user id) ──────────────────────────────────────

const AVATAR_COLORS = [
  '#6C63FF', // violet
  '#E9567A', // rose
  '#38B2AC', // teal
  '#F6A623', // orange
  '#48BB78', // vert
  '#667EEA', // indigo
  '#ED8936', // orange chaud
  '#9F7AEA', // purple
]

function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

// ─── Myo icon — roue à secteurs colorés ──────────────────────────────────────

const MYO_SECTOR_COLORS = [
  '#f97316', // VOLUME orange
  '#ef4444', // INTENSITÉ rouge
  '#8b5cf6', // STRUCTURE violet
  '#06b6d4', // RÉCUP cyan
  '#fac775', // PERF gold
  '#22c55e', // RÉGULARITÉ vert
  '#ec4899', // MUSCLES rose
  '#3b82f6', // TEMPS bleu
]

function MyoIcon({ size = 32, bg = '#0A0A0F' }: { size?: number; bg?: string }) {
  const segments = MYO_SECTOR_COLORS.length
  const segAngle = (2 * Math.PI) / segments
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  const paths: string[] = MYO_SECTOR_COLORS.map((_, i) => {
    const startAngle = i * segAngle - Math.PI / 2
    const endAngle = startAngle + segAngle - 0.04 // petit gap entre secteurs
    const x1 = cx + r * Math.cos(startAngle)
    const y1 = cy + r * Math.sin(startAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`
  })

  // Rendu sans SVG (React Native SVG non utilisé ici) — View avec border coloré par côtés
  // On simule avec des View rotées en absolue
  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      {MYO_SECTOR_COLORS.map((color, i) => {
        const rotation = (i / segments) * 360
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              overflow: 'hidden',
              transform: [{ rotate: `${rotation}deg` }],
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 0,
                left: size / 2,
                width: size / 2,
                height: size / 2,
                backgroundColor: color,
                transformOrigin: '0% 100%',
              }}
            />
          </View>
        )
      })}
      {/* Cercle central blanc cassé pour effet donut */}
      <View
        style={{
          position: 'absolute',
          width: size * 0.38,
          height: size * 0.38,
          borderRadius: size * 0.19,
          backgroundColor: bg,
          top: size * 0.31,
          left: size * 0.31,
        }}
      />
    </View>
  )
}

// ─── Temps relatif ────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}j`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

// ─── Format volume avec espace milliers ──────────────────────────────────────

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

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
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
    <Animated.View style={[styles.skeletonCard, { opacity: anim }]}>
      {/* Row avatar + lignes */}
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonAvatar, { backgroundColor: colors.backgroundTertiary }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '55%', backgroundColor: colors.backgroundTertiary }]} />
          <View style={[styles.skeletonLine, { width: '35%', height: 10, backgroundColor: colors.backgroundTertiary }]} />
        </View>
        <View style={[styles.skeletonMyoPlaceholder, { backgroundColor: colors.backgroundTertiary }]} />
      </View>
      {/* Skeleton likes */}
      <View style={{ flexDirection: 'row', gap: 16, paddingTop: 8 }}>
        <View style={[styles.skeletonLine, { width: 40, height: 10, backgroundColor: colors.backgroundTertiary }]} />
        <View style={[styles.skeletonLine, { width: 40, height: 10, backgroundColor: colors.backgroundTertiary }]} />
      </View>
    </Animated.View>
  )
}

// ─── Feed item ────────────────────────────────────────────────────────────────

interface FeedItemProps {
  item: FeedWorkout
  currentUserId: string | null
  onLike: (workoutId: string, hasLiked: boolean) => void
}

function FeedItem({ item, currentUserId, onLike }: FeedItemProps) {
  const { colors } = useTheme()

  const displayName = item.user.username ?? item.user.full_name ?? '?'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((p: string) => p.charAt(0).toUpperCase())
    .join('')
  const bgColor = avatarColor(item.user.id || item.id)
  const volumeStr = formatVolume(item.total_volume_kg)

  return (
    <View style={[styles.feedItem, { borderBottomColor: colors.separator }]}>
      {/* Row principale */}
      <View style={styles.mainRow}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: bgColor }]}>
          <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>{initials}</Text>
        </View>

        {/* Centre */}
        <View style={styles.centerCol}>
          <Text
            style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          <Text
            style={[typography.caption, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
        </View>

        {/* Right : Myo icon + volume + temps */}
        <View style={styles.rightCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MyoIcon size={32} bg={colors.background} />
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.textPrimary,
                    fontFamily: 'Barlow_700Bold',
                    fontVariant: ['tabular-nums'],
                  },
                ]}
              >
                {volumeStr}{' '}
                <Text style={{ color: colors.textSecondary, fontFamily: 'Barlow_400Regular', fontSize: 13 }}>
                  kg
                </Text>
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                {timeAgo(item.started_at)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Barre likes/comments */}
      <View style={styles.likeBar}>
        <TouchableOpacity
          style={styles.likeBtn}
          onPress={() => onLike(item.id, item.user_has_liked)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Heart
            size={14}
            color={item.user_has_liked ? colors.error : colors.textTertiary}
            fill={item.user_has_liked ? colors.error : 'transparent'}
          />
          <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: 4 }]}>
            {item.likes_count}
          </Text>
        </TouchableOpacity>

        <View style={styles.likeBtn}>
          <MessageCircle size={14} color={colors.textTertiary} />
          <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: 4 }]}>
            {item.comments_count}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { colors } = useTheme()
  const [workouts, setWorkouts] = useState<FeedWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // ─── Auth ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    if (!uid) return

    // Workouts publics — fetch principal sans count inline (évite ambiguïté types Supabase v2)
    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id,
        title,
        total_volume_kg,
        started_at,
        pr_seance,
        user:user_id (
          id,
          username,
          full_name
        )
      `)
      .eq('is_public', true)
      .order('started_at', { ascending: false })
      .limit(50)

    if (error || !data) return

    type RawWorkout = {
      id: string
      title: string
      total_volume_kg: number | null
      started_at: string
      pr_seance: 'gold' | 'silver' | 'bronze' | null
      // Supabase retourne un array pour les foreign key joins — on prend [0]
      user: Array<{ id: string; username: string | null; full_name: string | null }>
    }

    const workoutIds = (data as unknown as RawWorkout[]).map(w => w.id)

    // Counts likes + comments par workout
    const [likesRes, commentsRes, userLikesRes] = await Promise.all([
      supabase.from('likes').select('workout_id').in('workout_id', workoutIds),
      supabase.from('comments').select('workout_id').in('workout_id', workoutIds),
      supabase.from('likes').select('workout_id').eq('user_id', uid).in('workout_id', workoutIds),
    ])

    const likesCount = new Map<string, number>()
    const commentsCount = new Map<string, number>()
    for (const r of likesRes.data ?? []) {
      const id = (r as { workout_id: string }).workout_id
      likesCount.set(id, (likesCount.get(id) ?? 0) + 1)
    }
    for (const r of commentsRes.data ?? []) {
      const id = (r as { workout_id: string }).workout_id
      commentsCount.set(id, (commentsCount.get(id) ?? 0) + 1)
    }
    const likedSet = new Set(
      (userLikesRes.data ?? []).map((l: { workout_id: string }) => l.workout_id)
    )

    const mapped: FeedWorkout[] = (data as unknown as RawWorkout[]).map(w => ({
      id: w.id,
      title: w.title ?? '—',
      total_volume_kg: w.total_volume_kg,
      started_at: w.started_at,
      pr_seance: w.pr_seance,
      user: w.user?.[0] ?? { id: '', username: null, full_name: null },
      likes_count: likesCount.get(w.id) ?? 0,
      comments_count: commentsCount.get(w.id) ?? 0,
      user_has_liked: likedSet.has(w.id),
    }))

    setWorkouts(mapped)
  }, [])

  useEffect(() => {
    fetchFeed().finally(() => setLoading(false))
  }, [fetchFeed])

  // ─── Pull to refresh ────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchFeed()
    setRefreshing(false)
  }, [fetchFeed])

  // ─── Like toggle ────────────────────────────────────────────────────────────

  const handleLike = useCallback(async (workoutId: string, hasLiked: boolean) => {
    if (!currentUserId) return

    // Optimistic update
    setWorkouts(prev =>
      prev.map(w =>
        w.id === workoutId
          ? {
              ...w,
              user_has_liked: !hasLiked,
              likes_count: hasLiked ? w.likes_count - 1 : w.likes_count + 1,
            }
          : w
      )
    )

    if (hasLiked) {
      await supabase
        .from('likes')
        .delete()
        .eq('user_id', currentUserId)
        .eq('workout_id', workoutId)
    } else {
      await supabase
        .from('likes')
        .insert({ user_id: currentUserId, workout_id: workoutId })
    }
  }, [currentUserId])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <Text
        style={[
          typography.title,
          {
            color: colors.textPrimary,
            paddingHorizontal: spacing.s5,
            paddingTop: spacing.s6,
            paddingBottom: spacing.s2,
          },
        ]}
      >
        Feed
      </Text>

      {/* Indicateur actualisation */}
      {refreshing && (
        <View style={styles.refreshIndicator}>
          <RefreshCw size={12} color={colors.textTertiary} />
          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginLeft: 6 },
            ]}
          >
            Actualisation...
          </Text>
        </View>
      )}

      {loading ? (
        <View style={{ paddingHorizontal: spacing.s5, paddingTop: spacing.s3 }}>
          <SkeletonCard />
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={[styles.feedItem, { borderBottomColor: colors.separator }]}>
              <View style={styles.mainRow}>
                <View style={[styles.avatar, { backgroundColor: colors.backgroundSecondary }]} />
                <View style={styles.centerCol}>
                  <View style={{ width: '50%', height: 12, borderRadius: 4, backgroundColor: colors.backgroundSecondary, marginBottom: 6 }} />
                  <View style={{ width: '35%', height: 10, borderRadius: 4, backgroundColor: colors.backgroundSecondary }} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={item => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.s5,
            paddingBottom: spacing.s12,
          }}
          ItemSeparatorComponent={() => null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
          renderItem={({ item }) => (
            <FeedItem
              item={item}
              currentUserId={currentUserId}
              onLike={handleLike}
            />
          )}
          ListEmptyComponent={() => (
            <View style={styles.empty}>
              <Text style={[typography.subtitle, { color: colors.textSecondary, textAlign: 'center' }]}>
                Ton feed est vide.
              </Text>
              <Text style={[typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: spacing.s2 }]}>
                Suis des athletes pour voir leurs séances.
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
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
  refreshIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.s2,
  },
  feedItem: {
    paddingVertical: spacing.s3,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 14,
    fontFamily: 'Barlow_700Bold',
    letterSpacing: 0.5,
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
  },
  rightCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  likeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s5,
    paddingTop: spacing.s2,
    paddingLeft: 52, // aligner sous le texte (avatar 40 + gap 12)
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  skeletonCard: {
    paddingVertical: spacing.s3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    minHeight: 52,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    flexShrink: 0,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
  },
  skeletonMyoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    flexShrink: 0,
  },
  empty: {
    paddingTop: spacing.s12,
    paddingHorizontal: spacing.s6,
    alignItems: 'center',
  },
})
