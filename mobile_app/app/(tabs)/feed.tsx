import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Image,
  Modal,
  TextInput,
} from 'react-native'
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  withSpring,
  withSequence,
  useAnimatedStyle,
  useAnimatedProps,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
import { SafeAreaView } from 'react-native-safe-area-context'
import { Heart, MessageCircle, RefreshCw, MapPin, X } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/core'
import { spacing, typography, radius } from '@/constants/theme'
import { emptyStateRecipe } from '@/constants/recipes'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FeedWorkout {
  id: string
  title: string
  total_volume_kg: number | null
  started_at: string
  ended_at: string | null
  pr_seance: 'gold' | 'silver' | 'bronze' | null
  location_city: string | null
  gym_id: string | null
  user: {
    id: string
    username: string | null
    full_name: string | null
  }
  likes_count: number
  comments_count: number
  user_has_liked: boolean
}

interface LikeUser {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

interface Like {
  user_id: string
  created_at: string
  users: LikeUser | null
}

interface CommentUser {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
}

interface Comment {
  id: string
  content: string
  created_at: string
  user_id: string
  users: CommentUser | null
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

function MyoIcon({ size = 80, bg = '#0A0A0F' }: { size?: number; bg?: string }) {
  const segments = MYO_SECTOR_COLORS.length
  const segAngle = (2 * Math.PI) / segments
  const cx = size / 2
  const cy = size / 2
  const r = size / 2
  const gap = 0.06
  const innerR = size * 0.32

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {MYO_SECTOR_COLORS.map((color, i) => {
        const startAngle = i * segAngle - Math.PI / 2
        const endAngle = startAngle + segAngle - gap
        const x1 = cx + r * Math.cos(startAngle)
        const y1 = cy + r * Math.sin(startAngle)
        const x2 = cx + r * Math.cos(endAngle)
        const y2 = cy + r * Math.sin(endAngle)
        const largeArc = (segAngle - gap) > Math.PI ? 1 : 0
        return (
          <Path
            key={i}
            d={`M ${cx.toFixed(2)} ${cy.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`}
            fill={color}
          />
        )
      })}
      <Circle cx={cx} cy={cy} r={innerR} fill={bg} />
    </Svg>
  )
}

// ─── Logo Orava (48px cercle + losange) ──────────────────────────────────────

function OravaLogo({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Svg width={48} height={48} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="44"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="35.5" stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="27"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="18.5" stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="10"   stroke={colors.accent} strokeWidth="5" fill="none" />
      <Circle cx="50" cy="50" r="3.5"  fill={colors.accent} />
    </Svg>
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

// ─── Format durée (secondes → "1h 45min") ────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${mins}min`
  return `${mins}min`
}

// ─── PR Badge color ──────────────────────────────────────────────────────────

function prBadgeColor(level: 'gold' | 'silver' | 'bronze'): string {
  const map: Record<'gold' | 'silver' | 'bronze', string> = {
    gold: '#FAC775',
    silver: '#C0C0C0',
    bronze: '#CD7F32',
  }
  return map[level]
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
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
    <Animated.View style={[styles.skeletonCard, { backgroundColor: colors.backgroundSecondary }, shimmerStyle]}>
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonAvatar, { backgroundColor: colors.backgroundTertiary }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View style={[styles.skeletonLine, { width: '55%', backgroundColor: colors.backgroundTertiary }]} />
          <View style={[styles.skeletonLine, { width: '35%', height: 10, backgroundColor: colors.backgroundTertiary }]} />
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Modal Likes ──────────────────────────────────────────────────────────────

interface LikesModalProps {
  visible: boolean
  likes: Like[]
  onClose: () => void
}

function LikesModal({ visible, likes, onClose }: LikesModalProps) {
  const { colors } = useTheme()

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
        <View style={[styles.likesModalContent, { backgroundColor: colors.backgroundSecondary }]}>
          {/* Header */}
          <View style={[styles.likesModalHeader, { borderBottomColor: colors.separator }]}>
            <Text style={[typography.subtitle, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}>
              Aimé par
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Likes list — scrollable */}
          <FlatList
            data={likes}
            keyExtractor={(_, i) => i.toString()}
            scrollEnabled={true}
            renderItem={({ item }) => {
              const user = item.users
              const displayName = user?.username ?? user?.full_name ?? '?'
              const bgColor = avatarColor(user?.id || '')
              return (
                <View style={[styles.likeRow, { borderBottomColor: colors.separator }]}>
                  <View style={[styles.avatarSmall, { backgroundColor: bgColor }]}>
                    <Text style={[styles.avatarInitialsSmall, { color: colors.textPrimary }]}>
                      {displayName.split(' ').slice(0, 2).map((p: string) => p.charAt(0).toUpperCase()).join('')}
                    </Text>
                  </View>
                  <Text style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' }]}>
                    {displayName}
                  </Text>
                </View>
              )
            }}
            contentContainerStyle={{ paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  )
}

// ─── Modal Comments ───────────────────────────────────────────────────────────

interface CommentsModalProps {
  visible: boolean
  workoutId: string
  comments: Comment[]
  currentUserId: string | null
  onClose: () => void
  onCommentAdded: () => void
}

function CommentsModal({
  visible,
  workoutId,
  comments,
  currentUserId,
  onClose,
  onCommentAdded,
}: CommentsModalProps) {
  const { colors } = useTheme()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handlePostComment = async () => {
    if (!text.trim() || !currentUserId) return
    setSubmitting(true)
    try {
      await supabase
        .from('comments')
        .insert({
          workout_id: workoutId,
          user_id: currentUserId,
          content: text,
        })
      setText('')
      onCommentAdded()
    } catch (err) {
      console.error('Failed to post comment:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await supabase.from('comments').delete().eq('id', commentId)
      onCommentAdded()
    } catch (err) {
      console.error('Failed to delete comment:', err)
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
          <Text style={[typography.subtitle, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}>
            Commentaires
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Comments list */}
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const user = item.users
            const displayName = user?.username ?? user?.full_name ?? '?'
            const bgColor = avatarColor(user?.id || '')
            const isOwner = currentUserId === user?.id
            return (
              <View style={[styles.commentRow, { borderBottomColor: colors.separator }]}>
                <View style={[styles.avatarSmall, { backgroundColor: bgColor }]}>
                  <Text style={[styles.avatarInitialsSmall, { color: colors.textPrimary }]}>
                    {displayName.split(' ').slice(0, 2).map((p: string) => p.charAt(0).toUpperCase()).join('')}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2 }}>
                    <Text style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' }]}>
                      {displayName}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textTertiary }]}>
                      {timeAgo(item.created_at)}
                    </Text>
                  </View>
                  <Text
                    style={[typography.body, { color: colors.textSecondary, marginTop: spacing.s1 }]}
                    numberOfLines={3}
                  >
                    {item.content}
                  </Text>
                </View>
                {isOwner && (
                  <TouchableOpacity onPress={() => handleDeleteComment(item.id)}>
                    <X size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </View>
            )
          }}
          contentContainerStyle={{ paddingHorizontal: spacing.s4 }}
          ListEmptyComponent={
            <View style={{ paddingVertical: spacing.s8, alignItems: 'center' }}>
              <Text style={[typography.body, { color: colors.textTertiary }]}>
                Aucun commentaire
              </Text>
            </View>
          }
        />

        {/* Input footer */}
        <View style={[styles.commentInputContainer, { borderTopColor: colors.separator, backgroundColor: colors.backgroundSecondary }]}>
          <TextInput
            placeholder="Commenter..."
            placeholderTextColor={colors.textTertiary}
            value={text}
            onChangeText={setText}
            editable={!submitting}
            style={[
              styles.commentInput,
              {
                color: colors.textPrimary,
                borderColor: colors.border,
                backgroundColor: colors.background,
              },
            ]}
            multiline
          />
          <TouchableOpacity
            onPress={handlePostComment}
            disabled={!text.trim() || submitting}
            style={[
              styles.commentButton,
              {
                backgroundColor: text.trim() ? colors.accent : colors.backgroundTertiary,
                opacity: text.trim() ? 1 : 0.5,
              },
            ]}
          >
            <Text style={[typography.caption, { color: colors.background, fontFamily: 'Barlow_700Bold' }]}>
              Envoyer
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

// ─── Feed Item ────────────────────────────────────────────────────────────────

interface FeedItemProps {
  item: FeedWorkout
  currentUserId: string | null
  onLike: (workoutId: string, hasLiked: boolean) => void
  onNavigateDetail: (workoutId: string) => void
}

function FeedItem({ item, currentUserId, onLike, onNavigateDetail }: FeedItemProps) {
  const { colors } = useTheme()
  const [likesModalVisible, setLikesModalVisible] = useState(false)
  const [commentsModalVisible, setCommentsModalVisible] = useState(false)
  const [likes, setLikes] = useState<Like[]>([])
  const [comments, setComments] = useState<Comment[]>([])

  const displayName = item.user.username ?? item.user.full_name ?? '?'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((p: string) => p.charAt(0).toUpperCase())
    .join('')
  const bgColor = avatarColor(item.user.id || item.id)
  const volumeStr = formatVolume(item.total_volume_kg)
  const durationStr = formatDuration(
    item.ended_at ? (new Date(item.ended_at).getTime() - new Date(item.started_at).getTime()) / 1000 : null
  )

  const fetchLikes = async () => {
    try {
      const { data, error } = await supabase
        .from('likes')
        .select(`user_id, created_at, users:user_id(id, username, full_name, avatar_url)`)
        .eq('workout_id', item.id)
      if (!error && data) {
        // Supabase returns users as array, convert to single object
        const mapped = (data as unknown as Array<{
          user_id: string
          created_at: string
          users: Array<LikeUser> | null
        }>).map(like => ({
          user_id: like.user_id,
          created_at: like.created_at,
          users: like.users?.[0] ?? null,
        }))
        setLikes(mapped)
      }
    } catch (err) {
      console.error('Failed to fetch likes:', err)
    }
  }

  const fetchComments = async () => {
    try {
      const { data, error } = await supabase
        .from('comments')
        .select(`id, content, created_at, user_id, users:user_id(id, username, full_name, avatar_url)`)
        .eq('workout_id', item.id)
        .order('created_at', { ascending: false })
      if (!error && data) {
        // Supabase returns users as array, convert to single object
        const mapped = (data as unknown as Array<{
          id: string
          content: string
          created_at: string
          user_id: string
          users: Array<CommentUser> | null
        }>).map(comment => ({
          id: comment.id,
          content: comment.content,
          created_at: comment.created_at,
          user_id: comment.user_id,
          users: comment.users?.[0] ?? null,
        }))
        setComments(mapped)
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err)
    }
  }

  const openLikesModal = async () => {
    await fetchLikes()
    setLikesModalVisible(true)
  }

  const openCommentsModal = async () => {
    await fetchComments()
    setCommentsModalVisible(true)
  }

  const prBadgeContent = item.pr_seance ? (
    <View
      style={[
        styles.prBadge,
        { backgroundColor: prBadgeColor(item.pr_seance) },
      ]}
    >
      <Text style={[typography.caption, { color: colors.background, fontFamily: 'Barlow_700Bold' }]}>
        {item.pr_seance.toUpperCase()}
      </Text>
    </View>
  ) : null

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onNavigateDetail(item.id)}
        style={[styles.feedItem, { backgroundColor: colors.backgroundSecondary }]}
      >
        {/* Row 1 — Avatar + Meta */}
        <View style={styles.row1}>
          <View style={[styles.avatarMed, { backgroundColor: bgColor }]}>
            <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>{initials}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[typography.caption, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold', textTransform: 'uppercase' }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 12 }]}>
              {timeAgo(item.started_at)}
            </Text>
          </View>
          {prBadgeContent}
        </View>

        {/* Row 2 — Titre */}
        <Text
          style={[typography.subtitle, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold', marginTop: spacing.s3 }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {/* Row 3 — Lieu */}
        {item.location_city && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2, marginTop: spacing.s3 }}>
            <MapPin size={16} color={colors.textSecondary} />
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.location_city}
            </Text>
          </View>
        )}

        {/* Row 4 — Métriques (3 colonnes) */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Volume</Text>
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
              {volumeStr}
              {volumeStr !== '—' && <Text style={{ fontSize: 12, color: colors.textSecondary }}> kg</Text>}
            </Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Durée</Text>
            <Text style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}>
              {durationStr}
            </Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={[typography.caption, { color: colors.textTertiary }]}>Score</Text>
            <Text style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' }]}>
              —
            </Text>
          </View>
        </View>

        {/* Row 5 — Myo + Photos placeholder */}
        <View style={styles.myoPhotosRow}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <MyoIcon size={80} bg={colors.background} />
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={[
                styles.photoPlaceholder,
                { backgroundColor: colors.backgroundTertiary },
              ]}
            >
              <Text style={[typography.caption, { color: colors.textTertiary }]}>
                Aucune photo
              </Text>
            </View>
          </View>
        </View>

        {/* Row 6 — Actions */}
        <View style={[styles.actionsRow, { borderTopColor: colors.separator }]}>
          <TouchableOpacity
            onPress={() => onLike(item.id, item.user_has_liked)}
            onLongPress={openLikesModal}
            style={styles.actionBtn}
          >
            <Heart
              size={16}
              color={item.user_has_liked ? colors.error : colors.textTertiary}
              fill={item.user_has_liked ? colors.error : 'transparent'}
            />
            <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: spacing.s1 }]}>
              {item.likes_count}
            </Text>
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity
            onPress={openCommentsModal}
            onLongPress={openCommentsModal}
            style={styles.actionBtn}
          >
            <MessageCircle size={16} color={colors.textTertiary} />
            <Text style={[typography.caption, { color: colors.textTertiary, marginLeft: spacing.s1 }]}>
              {item.comments_count}
            </Text>
          </TouchableOpacity>
        </View>

      </TouchableOpacity>

      {/* Modals */}
      <LikesModal
        visible={likesModalVisible}
        likes={likes}
        onClose={() => setLikesModalVisible(false)}
      />
      <CommentsModal
        visible={commentsModalVisible}
        workoutId={item.id}
        comments={comments}
        currentUserId={currentUserId}
        onClose={() => setCommentsModalVisible(false)}
        onCommentAdded={fetchComments}
      />
    </>
  )
}

// ─── KPIs Bandeau ────────────────────────────────────────────────────────────

// TrendArrow — reproduit exactement TrendingUp/TrendingDown Lucide (viewBox 0 0 24 24)
// 3 paths séparés tracés en séquence : polyligne → branche H → branche V
// Longueurs mesurées : polyligne ≈ 30, branche H = 6, branche V = 6
const AnimatedPath = Animated.createAnimatedComponent(Path)

function TrendArrow({ color, up, drawProgress }: {
  color: string
  up: boolean
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
  // Path 1 : polyligne principale (longueur ≈ 30)
  const L1 = 30
  // Path 2 : segment horizontal du coin (longueur = 6)
  const L2 = 6
  // Path 3 : segment vertical du coin (longueur = 6)
  const L3 = 6

  // progress [0,1] → anime les 3 paths en séquence
  // p1 : 0→0.7, p2 : 0.7→0.85, p3 : 0.85→1
  const props1 = useAnimatedProps(() => {
    'worklet'
    const p = Math.min(drawProgress.value / 0.7, 1)
    return { strokeDashoffset: L1 * (1 - p) }
  })
  const props2 = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.7) / 0.15, 1))
    return { strokeDashoffset: L2 * (1 - p) }
  })
  const props3 = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.85) / 0.15, 1))
    return { strokeDashoffset: L3 * (1 - p) }
  })

  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      {up ? (
        <>
          {/* polyligne : 1,17 → 9,9 → 14,14 → 23,5 */}
          <AnimatedPath
            d="M1 17 L9 9 L14 14 L23 5"
            stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            fill="none" strokeDasharray={L1} animatedProps={props1}
          />
          {/* branche H : 17,5 → 23,5 */}
          <AnimatedPath
            d="M17 5 L23 5"
            stroke={color} strokeWidth={2} strokeLinecap="round"
            fill="none" strokeDasharray={L2} animatedProps={props2}
          />
          {/* branche V : 23,5 → 23,11 */}
          <AnimatedPath
            d="M23 5 L23 11"
            stroke={color} strokeWidth={2} strokeLinecap="round"
            fill="none" strokeDasharray={L3} animatedProps={props3}
          />
        </>
      ) : (
        <>
          {/* polyligne down : 1,7 → 9,15 → 14,10 → 23,19 */}
          <AnimatedPath
            d="M1 7 L9 15 L14 10 L23 19"
            stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            fill="none" strokeDasharray={L1} animatedProps={props1}
          />
          {/* branche H : 17,19 → 23,19 */}
          <AnimatedPath
            d="M17 19 L23 19"
            stroke={color} strokeWidth={2} strokeLinecap="round"
            fill="none" strokeDasharray={L2} animatedProps={props2}
          />
          {/* branche V : 23,13 → 23,19 */}
          <AnimatedPath
            d="M23 13 L23 19"
            stroke={color} strokeWidth={2} strokeLinecap="round"
            fill="none" strokeDasharray={L3} animatedProps={props3}
          />
        </>
      )}
    </Svg>
  )
}

function MapPinIcon({ color, drawProgress }: { color: string; drawProgress: ReturnType<typeof useSharedValue<number>> }) {
  const L_SHAPE = 70   // teardrop bezier (overestimate)
  const L_CIRCLE = 19  // 2π×3

  const shapeProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.min(drawProgress.value / 0.7, 1)
    return { strokeDashoffset: L_SHAPE * (1 - p) }
  })
  const circleProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.7) / 0.3, 1))
    return { strokeDashoffset: L_CIRCLE * (1 - p) }
  })

  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <AnimatedPath
        d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeDasharray={L_SHAPE} animatedProps={shapeProps}
      />
      <AnimatedCircle
        cx={12} cy={10} r={3}
        stroke={color} strokeWidth={2}
        fill="none" strokeDasharray={L_CIRCLE} animatedProps={circleProps}
      />
    </Svg>
  )
}

function DumbbellIcon({ color, drawProgress }: { color: string; drawProgress: ReturnType<typeof useSharedValue<number>> }) {
  const L_BAR = 10
  const L_RIGHT = 100
  const L_LEFT = 100
  const L_ACCENT = 5

  const barProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.min(drawProgress.value / 0.2, 1)
    return { strokeDashoffset: L_BAR * (1 - p) }
  })
  const rightProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.2) / 0.35, 1))
    return { strokeDashoffset: L_RIGHT * (1 - p) }
  })
  const accentRProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.5) / 0.1, 1))
    return { strokeDashoffset: L_ACCENT * (1 - p) }
  })
  const leftProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.6) / 0.3, 1))
    return { strokeDashoffset: L_LEFT * (1 - p) }
  })
  const accentLProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.88) / 0.12, 1))
    return { strokeDashoffset: L_ACCENT * (1 - p) }
  })

  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <AnimatedPath
        d="M9.6 14.4 L14.4 9.6"
        stroke={color} strokeWidth={2} strokeLinecap="round"
        fill="none" strokeDasharray={L_BAR} animatedProps={barProps}
      />
      <AnimatedPath
        d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeDasharray={L_RIGHT} animatedProps={rightProps}
      />
      <AnimatedPath
        d="M20.1 3.9 L21.5 2.5"
        stroke={color} strokeWidth={2} strokeLinecap="round"
        fill="none" strokeDasharray={L_ACCENT} animatedProps={accentRProps}
      />
      <AnimatedPath
        d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        fill="none" strokeDasharray={L_LEFT} animatedProps={leftProps}
      />
      <AnimatedPath
        d="M2.5 21.5 L3.9 20.1"
        stroke={color} strokeWidth={2} strokeLinecap="round"
        fill="none" strokeDasharray={L_ACCENT} animatedProps={accentLProps}
      />
    </Svg>
  )
}

interface KPIBandeauProps {
  workoutsThisMonth: number
  trendPercent: number
  scaleSeances: ReturnType<typeof useSharedValue<number>>
  scaleTrend: ReturnType<typeof useSharedValue<number>>
  drawArrow: ReturnType<typeof useSharedValue<number>>
  drawMapPin: ReturnType<typeof useSharedValue<number>>
  drawDumbbell: ReturnType<typeof useSharedValue<number>>
}

function KPIBandeau({ workoutsThisMonth, trendPercent, scaleSeances, scaleTrend, drawArrow, drawMapPin, drawDumbbell }: KPIBandeauProps) {
  const { colors } = useTheme()
  const router = useRouter()

  const seancesStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleSeances.value }],
  }))
  const trendStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scaleTrend.value }],
  }))

  const trendColor =
    trendPercent > 5 ? colors.success :
    trendPercent < -5 ? colors.error :
    colors.textSecondary

  const showArrow = trendPercent > 5 || trendPercent < -5
  const arrowUp = trendPercent > 5

  return (
    <View>
      <Text
        style={[
          typography.caption,
          {
            color: colors.textTertiary,
            paddingHorizontal: spacing.s4,
            paddingTop: spacing.s3,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontFamily: 'Barlow_700Bold',
          },
        ]}
      >
        Stats ce mois
      </Text>
    <View style={[styles.kpiBandeau, { paddingHorizontal: spacing.s4, gap: spacing.s3 }]}>
      {/* Salles de sport */}
      <TouchableOpacity
        onPress={() => router.push('/gyms')}
        style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}
      >
        <MapPinIcon color={colors.textSecondary} drawProgress={drawMapPin} />
        <Text
          style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}
          numberOfLines={1}
        >
          Voir les salles
        </Text>
      </TouchableOpacity>

      {/* Séances ce mois */}
      <View style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}>
        <DumbbellIcon color={colors.textSecondary} drawProgress={drawDumbbell} />
        <Animated.View style={seancesStyle}>
          <Text
            style={[
              typography.body,
              {
                color: colors.textPrimary,
                fontFamily: 'Barlow_700Bold',
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              },
            ]}
          >
            {workoutsThisMonth}
          </Text>
        </Animated.View>
        <Text
          style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}
          numberOfLines={1}
        >
          Séances
        </Text>
      </View>

      {/* Tendance */}
      <View style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}>
        {showArrow && <TrendArrow color={trendColor} up={arrowUp} drawProgress={drawArrow} />}
        <Animated.View style={trendStyle}>
          <Text
            style={[
              typography.body,
              {
                color: trendColor,
                fontFamily: 'Barlow_700Bold',
                fontVariant: ['tabular-nums'],
                textAlign: 'center',
              },
            ]}
          >
            {trendPercent > 0 ? '+' : ''}{Math.round(trendPercent)}%
          </Text>
        </Animated.View>
        <Text
          style={[typography.caption, { color: colors.textSecondary, textAlign: 'center' }]}
          numberOfLines={1}
        >
          Tendance
        </Text>
      </View>
    </View>
    </View>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function FeedEmptyState() {
  const { colors } = useTheme()
  const s = emptyStateRecipe('feed', colors)
  return (
    <View style={s.container}>
      <Text style={[s.title, { marginTop: spacing.s4 }]}>Ton feed est vide.</Text>
      <Text style={s.subtitle}>Suis d&apos;autres athlètes pour voir leurs séances.</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { colors } = useTheme()
  const router = useRouter()
  const [workouts, setWorkouts] = useState<FeedWorkout[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserFirstName, setCurrentUserFirstName] = useState<string>('')
  const [workoutsThisMonth, setWorkoutsThisMonth] = useState(0)
  const [trendPercent, setTrendPercent] = useState(0)
  const greetingOpacity = useSharedValue(0)
  const greetingTranslate = useSharedValue(8)
  const logoScale = useSharedValue(1)
  const refreshSpin = useSharedValue(0)
  const listOpacity = useSharedValue(1)
  const listTranslateY = useSharedValue(0)
  const listTranslateX = useSharedValue(0)
  const dotAngle = useSharedValue(0)
  const scaleSeances = useSharedValue(1)
  const scaleTrend = useSharedValue(1)
  const drawArrow = useSharedValue(1)
  const drawMapPin = useSharedValue(1)
  const drawDumbbell = useSharedValue(1)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstFocus = useRef(true)
  const firstNameRef = useRef('')

  // Garder le ref à jour sans recréer l'interval
  useEffect(() => {
    firstNameRef.current = currentUserFirstName
  }, [currentUserFirstName])

  // ─── Interval unique monté une fois — logo + greeting synchronisés ───────────

  useEffect(() => {
    const tick = () => {
      logoScale.value = withSequence(
        withSpring(1.22, { damping: 5, stiffness: 500 }),
        withSpring(1.0, { damping: 10, stiffness: 300 }),
        withSpring(1.1, { damping: 7, stiffness: 420 }),
        withSpring(1.0, { damping: 14, stiffness: 260 })
      )

      scaleSeances.value = 1
      scaleSeances.value = withSequence(
        withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
        withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      )
      drawMapPin.value = 0
      drawMapPin.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      drawDumbbell.value = 0
      drawDumbbell.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      drawArrow.value = 0
      drawArrow.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      if (kpiTimerRef.current) clearTimeout(kpiTimerRef.current)
      kpiTimerRef.current = setTimeout(() => {
        scaleTrend.value = 1
        scaleTrend.value = withSequence(
          withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
          withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
        )
      }, 150)

      // Point qui fait le tour du cercle avatar en 1s
      dotAngle.value = 0
      dotAngle.value = withTiming(2 * Math.PI, {
        duration: 1000,
        easing: Easing.bezier(0.37, 0, 0.63, 1),
      })

      if (!firstNameRef.current) return

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      greetingOpacity.value = 0
      greetingTranslate.value = 8
      greetingOpacity.value = withTiming(1, { duration: 500, easing: Easing.bezier(0.16, 1, 0.3, 1) })
      greetingTranslate.value = withSpring(0, { damping: 25, stiffness: 120 })

      hideTimerRef.current = setTimeout(() => {
        greetingOpacity.value = withTiming(0, { duration: 450, easing: Easing.bezier(0.37, 0, 0.63, 1) })
        greetingTranslate.value = withTiming(-4, { duration: 400, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      }, 4000)
    }

    tick()
    const id = setInterval(tick, 5000)

    return () => {
      clearInterval(id)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      cancelAnimation(logoScale)
      cancelAnimation(greetingOpacity)
      cancelAnimation(greetingTranslate)
      cancelAnimation(dotAngle)
      cancelAnimation(scaleSeances)
      cancelAnimation(scaleTrend)
      cancelAnimation(drawArrow)
      cancelAnimation(drawMapPin)
      cancelAnimation(drawDumbbell)
      if (kpiTimerRef.current) clearTimeout(kpiTimerRef.current)
    }
  }, [])

  const greetingAnimStyle = useAnimatedStyle(() => ({
    opacity: greetingOpacity.value,
    transform: [{ translateY: greetingTranslate.value }],
  }))

  const logoAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
  }))

  const refreshSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${refreshSpin.value}deg` }],
  }))

  // Point animé — r orbital=21 → point (r=4.5) reste dans wrapper 52px (centre=26)
  const dotAnimatedProps = useAnimatedProps(() => {
    'worklet'
    const a = dotAngle.value - Math.PI / 4
    return {
      cx: 26 + 21 * Math.cos(a),
      cy: 26 + 21 * Math.sin(a),
    }
  })

  const listAnimStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
    transform: [{ translateY: listTranslateY.value }, { translateX: listTranslateX.value }],
  }))

  // ─── Refresh spin ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (refreshing) {
      refreshSpin.value = 0
      refreshSpin.value = withRepeat(
        withTiming(360, { duration: 700, easing: Easing.linear }),
        -1,
        false
      )
    } else {
      cancelAnimation(refreshSpin)
    }
  }, [refreshing])

  // ─── Auth ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null)
    })
  }, [])

  // ─── Compute KPI metrics ─────────────────────────────────────────────────────

  const computeKPIs = useCallback((allWorkouts: FeedWorkout[]) => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const thisMonth = allWorkouts.filter(w => {
      const d = new Date(w.started_at)
      return d >= monthStart && d <= monthEnd
    }).length

    setWorkoutsThisMonth(thisMonth)

    // Tendance : δ volume mois courant vs mois précédent
    const prevMonthStart = new Date(monthStart)
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
    const prevMonthEnd = new Date(monthStart)
    prevMonthEnd.setDate(0)

    const currVolume = allWorkouts
      .filter(w => {
        const d = new Date(w.started_at)
        return d >= monthStart && d <= monthEnd
      })
      .reduce((sum, w) => sum + (w.total_volume_kg ?? 0), 0)

    const prevVolume = allWorkouts
      .filter(w => {
        const d = new Date(w.started_at)
        return d >= prevMonthStart && d <= prevMonthEnd
      })
      .reduce((sum, w) => sum + (w.total_volume_kg ?? 0), 0)

    const trend = prevVolume > 0 ? ((currVolume - prevVolume) / prevVolume) * 100 : 0
    setTrendPercent(trend)
  }, [])

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser()
    const uid = authData.user?.id
    if (!uid) return

    // Get current user profile
    const { data: userData } = await supabase
      .from('users')
      .select('id, full_name, username')
      .eq('id', uid)
      .single()

    if (userData) {
      const firstName = (userData.full_name ?? userData.username ?? 'Athlète').split(' ')[0]
      setCurrentUserFirstName(firstName)
    }

    // Workouts publics
    const { data, error } = await supabase
      .from('workouts')
      .select(`
        id,
        title,
        total_volume_kg,
        started_at,
        ended_at,
        pr_seance,
        location_city,
        gym_id,
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
      ended_at: string | null
      pr_seance: 'gold' | 'silver' | 'bronze' | null
      location_city: string | null
      gym_id: string | null
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
      ended_at: w.ended_at,
      pr_seance: w.pr_seance,
      location_city: w.location_city,
      gym_id: w.gym_id,
      user: w.user?.[0] ?? { id: '', username: null, full_name: null },
      likes_count: likesCount.get(w.id) ?? 0,
      comments_count: commentsCount.get(w.id) ?? 0,
      user_has_liked: likedSet.has(w.id),
    }))

    setWorkouts(mapped)
    computeKPIs(mapped)
  }, [computeKPIs])

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        fetchFeed().finally(() => setLoading(false))
      } else {
        // Retour sur le tab — slide depuis la droite + actualisation
        const W = Dimensions.get('window').width
        listTranslateX.value = W
        listOpacity.value = 0.85
        listTranslateX.value = withSpring(0, { damping: 22, stiffness: 180, mass: 0.8 })
        listOpacity.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.16, 1, 0.3, 1) })
        listTranslateY.value = 0
        setRefreshing(true)
        Promise.all([fetchFeed(), new Promise(r => setTimeout(r, 1500))]).finally(() => {
          setRefreshing(false)
        })
      }
    }, [fetchFeed])
  )

  // ─── Pull to refresh ────────────────────────────────────────────────────────

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    listOpacity.value = 0.6
    listTranslateY.value = 6
    await Promise.all([fetchFeed(), new Promise(r => setTimeout(r, 1500))])
    setRefreshing(false)
    listOpacity.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    listTranslateY.value = withSpring(0, { damping: 20, stiffness: 300 })
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

  // ─── Navigate to detail ─────────────────────────────────────────────────────

  const handleNavigateDetail = useCallback((workoutId: string) => {
    router.push(`/feed/${workoutId}`)
  }, [router])

  // ─── Navigate to profile ─────────────────────────────────────────────────────

  const handleNavigateProfile = useCallback(() => {
    router.push('/(tabs)/profile')
  }, [router])

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header — Logo animé + Greeting émerge + Avatar */}
      <View style={[styles.header, { paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 }]}>
        <Animated.View style={logoAnimStyle}>
          <TouchableOpacity onPress={() => router.push('/chat')} activeOpacity={0.8}>
            <OravaLogo colors={colors} />
          </TouchableOpacity>
        </Animated.View>
        {/* Clip parent — le texte émerge depuis le bord gauche */}
        <View style={{ flex: 1, marginLeft: spacing.s3 }}>
          <Animated.View style={greetingAnimStyle}>
            <Text
              style={[typography.body, { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' }]}
              numberOfLines={1}
            >
              Bonjour {currentUserFirstName},
            </Text>
            <Text
              style={[typography.caption, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              as-tu une question ?
            </Text>
          </Animated.View>
        </View>
        <TouchableOpacity onPress={handleNavigateProfile} hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}>
          {/* Wrapper 44×44 — avatar 40×40 centré, SVG overlay pour le point orbital */}
          <View style={styles.avatarHeaderWrap}>
            <View style={[styles.avatarSmallHeader, { backgroundColor: colors.backgroundSecondary, borderColor: colors.accent }]}>
              <Text style={[styles.avatarInitialsSmall, { color: colors.textPrimary }]}>
                {currentUserFirstName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Svg width={52} height={52} style={StyleSheet.absoluteFill} pointerEvents="none">
              <AnimatedCircle
                r={4.5}
                fill={colors.accent}
                animatedProps={dotAnimatedProps}
              />
            </Svg>
          </View>
        </TouchableOpacity>
      </View>

      {/* KPI Bandeau */}
      {!loading && (
        <KPIBandeau workoutsThisMonth={workoutsThisMonth} trendPercent={trendPercent} scaleSeances={scaleSeances} scaleTrend={scaleTrend} drawArrow={drawArrow} drawMapPin={drawMapPin} drawDumbbell={drawDumbbell} />
      )}

      {/* Refresh indicator */}
      {refreshing && (
        <View style={styles.refreshIndicator}>
          <Animated.View style={refreshSpinStyle}>
            <RefreshCw size={12} color={colors.accent} />
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, letterSpacing: 1, textTransform: 'uppercase', marginLeft: spacing.s2 },
            ]}
          >
            Actualisation...
          </Text>
        </View>
      )}

      {/* Content */}
      {loading ? (
        <View style={{ paddingHorizontal: spacing.s4, paddingTop: spacing.s3, flex: 1 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : (
        <Animated.View style={[{ flex: 1 }, listAnimStyle]}>
        <FlatList
          data={workouts}
          keyExtractor={item => item.id}
          contentContainerStyle={{
            paddingHorizontal: spacing.s4,
            paddingVertical: spacing.s3,
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
              onNavigateDetail={handleNavigateDetail}
            />
          )}
          ListEmptyComponent={() => <FeedEmptyState />}
          showsVerticalScrollIndicator={false}
        />
        </Animated.View>
      )}
    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  avatarHeaderWrap: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarSmallHeader: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  kpiBandeau: {
    flexDirection: 'row',
    paddingVertical: spacing.s3,
  },
  kpiItem: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    minHeight: 100,
  },
  refreshIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.s2,
  },
  feedItem: {
    paddingVertical: spacing.s4,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    marginBottom: spacing.s3,
    overflow: 'hidden',
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  avatarMed: {
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
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitialsSmall: {
    fontSize: 12,
    fontFamily: 'Barlow_700Bold',
  },
  prBadge: {
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s1,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  myoPhotosRow: {
    flexDirection: 'row',
    gap: spacing.s3,
    marginTop: spacing.s4,
    height: 100,
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.s3,
    marginTop: spacing.s4,
    borderTopWidth: 1,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s2,
    paddingVertical: spacing.s2,
  },
  skeletonCard: {
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s3,
    borderRadius: radius.md,
    marginBottom: spacing.s3,
    overflow: 'hidden',
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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  likeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s3,
    paddingVertical: spacing.s3,
    borderBottomWidth: 1,
  },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.s2,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    fontSize: 14,
    maxHeight: 100,
  },
  commentButton: {
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
    borderRadius: radius.md,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s4,
  },
  likesModalContent: {
    maxHeight: '70%',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  likesModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    borderBottomWidth: 1,
  },
  greetingContainer: {
    paddingVertical: spacing.s2,
    marginBottom: spacing.s2,
  },
})
