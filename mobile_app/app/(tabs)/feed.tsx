import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { log } from '@/lib/logger'
import {
  Animated as RNAnimated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
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
  withDelay,
  useAnimatedStyle,
  useAnimatedProps,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated'
import Svg, { Path, Circle } from 'react-native-svg'
import {
  Canvas,
  Circle as SkiaCircle,
  Path as SkiaPath,
  RadialGradient,
  Skia,
  LinearGradient as SkiaLinearGradient,
  vec,
} from '@shopify/react-native-skia'
import MyoChart from '@/app/workout/myo-chart'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedPath = Animated.createAnimatedComponent(Path)
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Heart,
  MessageCircle,
  RefreshCw,
  MapPin,
  X,
  Zap,
  Flame,
  Trophy,
  Target,
  Sparkles,
} from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/core'
import { spacing, typography, radius, dark, avatarColors, scrim } from '@/constants/theme'
import { emptyStateRecipe } from '@/constants/recipes'
import { supabase } from '@/lib/supabase'
import { formatVolume, formatDuration } from '@/lib/utils'
import oravaLogo from '@/assets/orava_logo.png'
import {
  useFeedData,
  type FeedWorkout,
  type FeedEntry,
  type ClaimFeedItem,
  type PRLevel,
  type WorkoutPRSummary,
} from '@/lib/hooks/useFeedData'
import { type ClaimVote } from '@/lib/claims'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  likes_count: number
  user_has_liked: boolean
}

// ─── Avatar colors (stable par user id) ──────────────────────────────────────

function avatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return avatarColors[Math.abs(hash) % avatarColors.length]
}

// ─── Logo Orava ───────────────────────────────────────────────────────────────

function OravaLogo() {
  return <Image source={oravaLogo} style={{ width: 40, height: 40 }} resizeMode="contain" />
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

// ─── PR Badge color ──────────────────────────────────────────────────────────

function prBadgeColor(level: 'gold' | 'silver' | 'bronze'): string {
  const map: Record<'gold' | 'silver' | 'bronze', string> = {
    gold: dark.prGold,
    silver: dark.prSilver,
    bronze: dark.prBronze,
  }
  return map[level]
}

// ─── PR Pill ─────────────────────────────────────────────────────────────────
// Pill compacte : count en gras + icônes colorées par type présent

// Icône exercice = Dumbbell (lucide), couleur violet fixe, pas de niveau
const PR_ICON_DEFS = [
  { key: 'seance' as const, Icon: Trophy, colorFn: (l: PRLevel) => prBadgeColor(l) },
  { key: 'charge' as const, Icon: Zap, colorFn: (l: PRLevel) => prBadgeColor(l) },
  { key: 'serie' as const, Icon: Flame, colorFn: (l: PRLevel) => prBadgeColor(l) },
  { key: 'exercice' as const, Icon: Trophy, colorFn: (_: PRLevel) => dark.prExercice },
]

// Wrapper sans hooks — return null légal car aucun hook avant lui
function PRSkiaChip({ prs }: { prs: WorkoutPRSummary }) {
  if (!prs.charge && !prs.serie && !prs.exercice && !prs.seance) return null
  return <PRSkiaChipInner prs={prs} />
}

// Inner — tous les hooks ici, jamais de return null (Rules of Hooks respectées)
function PRSkiaChipInner({ prs }: { prs: WorkoutPRSummary }) {
  const PR_RANK: Record<PRLevel, number> = { gold: 3, silver: 2, bronze: 1 }
  const topCandidates = (['charge', 'serie', 'seance'] as const)
    .map((k) => prs[k])
    .filter((l): l is PRLevel => l !== null)
  const topLevel: PRLevel = topCandidates.sort((a, b) => PR_RANK[b] - PR_RANK[a])[0] ?? 'bronze'
  const dominantColor = prBadgeColor(topLevel)
  const hasGold = topLevel === 'gold'

  const gemTypes = (['seance', 'charge', 'serie', 'exercice'] as const).filter((k) => !!prs[k])

  const CHIP_H = 40
  const ICON_SIZE = 13
  const ICON_GAP = 4
  const PADDING = 10
  // 3 paliers calés sur les largeurs réelles Barlow 700 13px :
  // "1 PR"≈22px · "4 PRs"≈30px · "10 PRs"≈40px
  const TEXT_W = prs.total >= 10 ? 46 : prs.total >= 5 ? 37 : 29
  const SEP_AREA = 13 // 6px gap + 1px sep + 6px gap
  const ICONS_AREA = gemTypes.length * ICON_SIZE + Math.max(0, gemTypes.length - 1) * ICON_GAP
  const CHIP_W = PADDING + TEXT_W + SEP_AREA + ICONS_AREA + PADDING

  const GEM_Y = CHIP_H / 2
  const ICONS_START_X = PADDING + TEXT_W + SEP_AREA + ICON_SIZE / 2
  const gemCentersX = gemTypes.map((_, i) => ICONS_START_X + i * (ICON_SIZE + ICON_GAP))

  const BEAM_W = Math.round(CHIP_W * 0.6)
  const GLOW_R: Record<PRLevel, number> = { gold: 16, silver: 12, bronze: 9 }

  const shimX = useSharedValue(-(BEAM_W + 10))
  const glowOpacity = useSharedValue(1)
  const entryScale = useSharedValue(0.82)

  useEffect(() => {
    entryScale.value = withSpring(1, { damping: 14, stiffness: 280 })

    const shimTimer = setTimeout(
      () => {
        shimX.value = withRepeat(
          withTiming(CHIP_W + 10, {
            duration: hasGold ? 1800 : 2600,
            easing: Easing.bezier(0.37, 0, 0.63, 1),
          }),
          -1,
          false
        )
      },
      900 + Math.floor(Math.random() * 700)
    )

    let pulseTimer: ReturnType<typeof setTimeout> | null = null
    if (hasGold) {
      pulseTimer = setTimeout(() => {
        // false : withSequence gère déjà les deux sens, reverse=true causerait un double-reverse
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.5, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) }),
            withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
          ),
          -1,
          false
        )
      }, 700)
    }

    return () => {
      clearTimeout(shimTimer)
      if (pulseTimer) clearTimeout(pulseTimer)
      cancelAnimation(shimX)
      cancelAnimation(glowOpacity)
      cancelAnimation(entryScale)
    }
  }, [])

  const shimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimX.value }],
  }))
  const entryStyle = useAnimatedStyle(() => ({
    transform: [{ scale: entryScale.value }],
  }))
  const glowLayerStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }))

  const beamPath = useMemo(() => {
    const p = Skia.Path.Make()
    p.moveTo(0, 0)
    p.lineTo(BEAM_W, 0)
    p.lineTo(BEAM_W, CHIP_H)
    p.lineTo(0, CHIP_H)
    p.close()
    return p
  }, [BEAM_W])

  return (
    <Animated.View style={entryStyle}>
      <View
        style={{
          width: CHIP_W,
          height: CHIP_H,
          backgroundColor: dominantColor + '1A',
          borderRadius: CHIP_H / 2,
          borderWidth: 1,
          borderColor: dominantColor + '60',
          overflow: 'hidden',
        }}
      >
        {/* 1 seul Canvas glows — opacity pulsée par Animated.View pour gold */}
        <Animated.View style={[StyleSheet.absoluteFill, glowLayerStyle]} pointerEvents="none">
          <Canvas style={{ width: CHIP_W, height: CHIP_H }}>
            {gemTypes.map((type, i) => {
              const level = prs[type] as PRLevel
              const cx = gemCentersX[i]
              const gr = GLOW_R[level]
              const c = type === 'exercice' ? dark.prExercice : prBadgeColor(level)
              return (
                <SkiaCircle key={type} cx={cx} cy={GEM_Y} r={gr}>
                  <RadialGradient c={vec(cx, GEM_Y)} r={gr} colors={[c + '72', c + '00']} />
                </SkiaCircle>
              )
            })}
            {/* Halo étendu gold — même draw call, pas de Canvas séparé */}
            {hasGold
              ? gemTypes.map((type, i) => {
                  if (prs[type] !== 'gold') return null
                  const cx = gemCentersX[i]
                  const c = type === 'exercice' ? dark.prExercice : dark.prGold
                  return (
                    <SkiaCircle key={`h${type}`} cx={cx} cy={GEM_Y} r={24}>
                      <RadialGradient c={vec(cx, GEM_Y)} r={24} colors={[c + '45', c + '00']} />
                    </SkiaCircle>
                  )
                })
              : null}
          </Canvas>
        </Animated.View>

        {/* Shimmer sweep — clip par overflow:hidden du parent pill */}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, left: 0, width: BEAM_W, height: CHIP_H },
            shimStyle,
          ]}
          pointerEvents="none"
        >
          <Canvas style={{ width: BEAM_W, height: CHIP_H }}>
            <SkiaPath path={beamPath} style="fill">
              <SkiaLinearGradient
                start={vec(0, 0)}
                end={vec(BEAM_W, 0)}
                colors={[
                  'rgba(255,255,255,0)',
                  hasGold ? 'rgba(250,199,117,0.22)' : 'rgba(255,255,255,0.13)',
                  'rgba(255,255,255,0)',
                ]}
                positions={[0, 0.5, 1]}
              />
            </SkiaPath>
          </Canvas>
        </Animated.View>

        {/* Contenu overlay */}
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: PADDING,
            gap: 6,
          }}
          pointerEvents="none"
        >
          <Text
            style={{
              fontSize: 13,
              fontFamily: 'Barlow_700Bold',
              color: dominantColor,
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.3,
            }}
          >
            {prs.total} PR{prs.total > 1 ? 's' : ''}
          </Text>
          <View style={{ width: 1, height: 12, backgroundColor: dominantColor + '44' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ICON_GAP }}>
            {PR_ICON_DEFS.map(({ key, Icon, colorFn }) => {
              const level = prs[key]
              if (!level) return null
              return (
                <Icon
                  key={key}
                  size={ICON_SIZE}
                  color={colorFn(level as PRLevel)}
                  fill={colorFn(level as PRLevel)}
                />
              )
            })}
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  const { colors } = useTheme()
  const CARD_W = SCREEN_WIDTH - spacing.s4 * 2
  const CARD_H = 88
  const BEAM_W = 220

  const shimX = useSharedValue(-(BEAM_W + 16))

  useEffect(() => {
    shimX.value = -(BEAM_W + 16)
    shimX.value = withRepeat(
      withTiming(CARD_W + 16, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) }),
      -1,
      false
    )
  }, [])

  const shimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimX.value }],
  }))

  const beamPath = useMemo(() => {
    const p = Skia.Path.Make()
    p.moveTo(0, 0)
    p.lineTo(BEAM_W, 0)
    p.lineTo(BEAM_W, CARD_H)
    p.lineTo(0, CARD_H)
    p.close()
    return p
  }, [])

  return (
    <View
      style={[
        styles.skeletonCard,
        { backgroundColor: colors.backgroundSecondary, overflow: 'hidden' },
      ]}
    >
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonAvatar, { backgroundColor: colors.backgroundTertiary }]} />
        <View style={{ flex: 1, gap: 8 }}>
          <View
            style={[
              styles.skeletonLine,
              { width: '55%', backgroundColor: colors.backgroundTertiary },
            ]}
          />
          <View
            style={[
              styles.skeletonLine,
              { width: '35%', height: 10, backgroundColor: colors.backgroundTertiary },
            ]}
          />
        </View>
      </View>
      <Animated.View
        style={[
          { position: 'absolute', top: 0, left: 0, width: BEAM_W, height: CARD_H },
          shimStyle,
        ]}
        pointerEvents="none"
      >
        <Canvas style={{ width: BEAM_W, height: CARD_H }}>
          <SkiaPath path={beamPath} style="fill">
            <SkiaLinearGradient
              start={vec(0, 0)}
              end={vec(BEAM_W, 0)}
              colors={['rgba(18,18,26,0)', 'rgba(60,60,80,0.55)', 'rgba(18,18,26,0)']}
              positions={[0, 0.5, 1]}
            />
          </SkiaPath>
        </Canvas>
      </Animated.View>
    </View>
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.modalOverlay, { backgroundColor: scrim }]}>
        <View style={[styles.likesModalContent, { backgroundColor: colors.backgroundSecondary }]}>
          {/* Header */}
          <View style={[styles.likesModalHeader, { borderBottomColor: colors.separator }]}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' },
              ]}
            >
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
                      {displayName
                        .split(' ')
                        .slice(0, 2)
                        .map((p: string) => p.charAt(0).toUpperCase())
                        .join('')}
                    </Text>
                  </View>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' },
                    ]}
                  >
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
  onCommentLike: (commentId: string, hasLiked: boolean) => void
}

const SCREEN_HEIGHT = Dimensions.get('window').height
// ORA-067 — largeur figée au niveau module (app portrait-locked) : évite un Dimensions.get() par render.
const SCREEN_WIDTH = Dimensions.get('window').width
const SHEET_HALF = SCREEN_HEIGHT * 0.5
const SHEET_FULL = SCREEN_HEIGHT * 0.9

function CommentsModal({
  visible,
  workoutId,
  comments,
  currentUserId,
  onClose,
  onCommentAdded,
  onCommentLike,
}: CommentsModalProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const expandedRef = useRef(false)
  const sheetHeight = useRef(new RNAnimated.Value(SHEET_HALF)).current
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  React.useEffect(() => {
    if (visible) {
      expandedRef.current = false
      sheetHeight.setValue(0)
      RNAnimated.spring(sheetHeight, {
        toValue: SHEET_HALF,
        damping: 20,
        stiffness: 300,
        useNativeDriver: false,
      }).start()
    }
  }, [visible])

  const expandSheet = () => {
    expandedRef.current = true
    RNAnimated.spring(sheetHeight, {
      toValue: SHEET_FULL,
      damping: 20,
      stiffness: 300,
      useNativeDriver: false,
    }).start()
  }

  const collapseSheet = () => {
    expandedRef.current = false
    RNAnimated.spring(sheetHeight, {
      toValue: SHEET_HALF,
      damping: 20,
      stiffness: 300,
      useNativeDriver: false,
    }).start()
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, gs) => {
        if (gs.dy < -40) {
          expandSheet()
        } else if (gs.dy > 60) {
          if (expandedRef.current) collapseSheet()
          else onCloseRef.current()
        }
      },
    })
  ).current

  const handlePostComment = async () => {
    if (!text.trim() || !currentUserId) return
    setSubmitting(true)
    try {
      await supabase.from('comments').insert({
        workout_id: workoutId,
        user_id: currentUserId,
        content: text,
      })
      setText('')
      onCommentAdded()
    } catch (err) {
      log.error('Failed to post comment:', err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteComment = async (commentId: string) => {
    try {
      await supabase.from('comments').delete().eq('id', commentId)
      onCommentAdded()
    } catch (err) {
      log.error('Failed to delete comment:', err)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: scrim }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <RNAnimated.View
          style={[
            styles.commentsSheetContent,
            { backgroundColor: colors.backgroundSecondary, height: sheetHeight },
          ]}
        >
          {/* Drag handle — zone swipe dédiée (séparée du header pour ne pas bloquer le X) */}
          <View style={styles.dragHandleArea} {...panResponder.panHandlers}>
            <View style={[styles.dragHandle, { backgroundColor: colors.textTertiary }]} />
          </View>

          {/* Header — hors du pan responder */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.separator }]}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' },
              ]}
            >
              Commentaires
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <X size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Comments list */}
          <FlatList
            data={comments}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const user = item.users
              const displayName = user?.username ?? user?.full_name ?? '?'
              const bgColor = avatarColor(user?.id || '')
              const isOwner = currentUserId === user?.id
              return (
                <View style={[styles.commentRow, { borderBottomColor: colors.separator }]}>
                  <View style={[styles.avatarSmall, { backgroundColor: bgColor }]}>
                    <Text style={[styles.avatarInitialsSmall, { color: colors.textPrimary }]}>
                      {displayName
                        .split(' ')
                        .slice(0, 2)
                        .map((p: string) => p.charAt(0).toUpperCase())
                        .join('')}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.s2 }}>
                      <Text
                        style={[
                          typography.body,
                          { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' },
                        ]}
                      >
                        {displayName}
                      </Text>
                      <Text style={[typography.caption, { color: colors.textTertiary }]}>
                        {timeAgo(item.created_at)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        typography.body,
                        { color: colors.textSecondary, marginTop: spacing.s1 },
                      ]}
                      numberOfLines={3}
                    >
                      {item.content}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center', gap: spacing.s1 }}>
                    <TouchableOpacity
                      onPress={() => onCommentLike(item.id, item.user_has_liked)}
                      hitSlop={{ top: 8, right: 8, bottom: 4, left: 8 }}
                    >
                      <Heart
                        size={14}
                        color={item.user_has_liked ? colors.error : colors.textTertiary}
                        fill={item.user_has_liked ? colors.error : 'transparent'}
                      />
                    </TouchableOpacity>
                    {item.likes_count > 0 && (
                      <Text style={[typography.micro, { color: colors.textTertiary }]}>
                        {item.likes_count}
                      </Text>
                    )}
                    {isOwner && (
                      <TouchableOpacity
                        onPress={() => handleDeleteComment(item.id)}
                        hitSlop={{ top: 4, right: 8, bottom: 8, left: 8 }}
                      >
                        <X size={14} color={colors.textTertiary} />
                      </TouchableOpacity>
                    )}
                  </View>
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
          <View
            style={[
              styles.commentInputContainer,
              {
                borderTopColor: colors.separator,
                backgroundColor: colors.backgroundSecondary,
                paddingBottom: Math.max(insets.bottom, spacing.s3),
              },
            ]}
          >
            <TextInput
              placeholder="Commenter..."
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              editable={!submitting}
              maxLength={500}
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
              <Text
                style={[
                  typography.caption,
                  { color: colors.background, fontFamily: 'Barlow_700Bold' },
                ]}
              >
                Envoyer
              </Text>
            </TouchableOpacity>
          </View>
        </RNAnimated.View>
      </KeyboardAvoidingView>
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

function FeedItemBase({ item, currentUserId, onLike, onNavigateDetail }: FeedItemProps) {
  const sessionValues = item.sessionValues
  const { colors } = useTheme()
  const screenW = SCREEN_WIDTH
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
    item.ended_at
      ? (new Date(item.ended_at).getTime() - new Date(item.started_at).getTime()) / 1000
      : null
  )

  const fetchLikes = async () => {
    try {
      const { data, error } = await supabase
        .from('likes')
        .select(`user_id, created_at, users:user_id(id, username, full_name, avatar_url)`)
        .eq('workout_id', item.id)
      if (!error && data) {
        // Supabase returns users as array, convert to single object
        const mapped = (
          data as unknown as Array<{
            user_id: string
            created_at: string
            users: Array<LikeUser> | null
          }>
        ).map((like) => ({
          user_id: like.user_id,
          created_at: like.created_at,
          users: like.users?.[0] ?? null,
        }))
        setLikes(mapped)
      }
    } catch (err) {
      log.error('Failed to fetch likes:', err)
    }
  }

  const fetchComments = async () => {
    try {
      const { data: authData } = await supabase.auth.getUser()
      const uid = authData.user?.id

      const { data, error } = await supabase
        .from('comments')
        .select(
          `id, content, created_at, user_id, users:user_id(id, username, full_name, avatar_url)`
        )
        .eq('workout_id', item.id)
        .order('created_at', { ascending: false })
      if (!error && data) {
        const commentIds = (data as unknown as Array<{ id: string }>).map((c) => c.id)

        const [likesRes, userLikesRes] = await Promise.all([
          supabase.from('comment_likes').select('comment_id').in('comment_id', commentIds),
          uid
            ? supabase
                .from('comment_likes')
                .select('comment_id')
                .eq('user_id', uid)
                .in('comment_id', commentIds)
            : Promise.resolve({ data: [] }),
        ])

        const likesCount = new Map<string, number>()
        for (const r of likesRes.data ?? []) {
          const cid = (r as { comment_id: string }).comment_id
          likesCount.set(cid, (likesCount.get(cid) ?? 0) + 1)
        }
        const likedSet = new Set(
          ((userLikesRes as { data: Array<{ comment_id: string }> | null }).data ?? []).map(
            (l) => l.comment_id
          )
        )

        const mapped = (
          data as unknown as Array<{
            id: string
            content: string
            created_at: string
            user_id: string
            users: Array<CommentUser> | null
          }>
        ).map((comment) => ({
          id: comment.id,
          content: comment.content,
          created_at: comment.created_at,
          user_id: comment.user_id,
          users: comment.users?.[0] ?? null,
          likes_count: likesCount.get(comment.id) ?? 0,
          user_has_liked: likedSet.has(comment.id),
        }))
        setComments(mapped)
      }
    } catch (err) {
      log.error('Failed to fetch comments:', err)
    }
  }

  const handleCommentLike = async (commentId: string, hasLiked: boolean) => {
    if (!currentUserId) return

    setComments((prev) =>
      prev.map((c) =>
        c.id === commentId
          ? {
              ...c,
              user_has_liked: !hasLiked,
              likes_count: hasLiked ? c.likes_count - 1 : c.likes_count + 1,
            }
          : c
      )
    )

    if (hasLiked) {
      await supabase
        .from('comment_likes')
        .delete()
        .eq('user_id', currentUserId)
        .eq('comment_id', commentId)
    } else {
      await supabase.from('comment_likes').insert({ user_id: currentUserId, comment_id: commentId })
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

  const hasPR = !!(item.prs.charge || item.prs.serie || item.prs.exercice || item.prs.seance)

  return (
    <>
      <View style={{ marginBottom: spacing.s3 }}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => onNavigateDetail(item.id)}
          style={[
            styles.feedItem,
            { backgroundColor: colors.backgroundSecondary, marginBottom: 0 },
          ]}
        >
          {/* Row 1 — Avatar + Meta + PR Pill en haut-droit */}
          <View style={styles.row1}>
            <View style={[styles.avatarMed, { backgroundColor: bgColor }]}>
              <Text style={[styles.avatarInitials, { color: colors.textPrimary }]}>{initials}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={[
                  typography.caption,
                  {
                    color: colors.textPrimary,
                    fontFamily: 'Barlow_700Bold',
                    textTransform: 'uppercase',
                  },
                ]}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text style={[typography.caption, { color: colors.textSecondary, fontSize: 12 }]}>
                {timeAgo(item.started_at)}
              </Text>
            </View>
            {hasPR && <PRSkiaChip prs={item.prs} />}
          </View>

          {/* Row 2 — Titre */}
          <Text
            style={[
              typography.subtitle,
              { color: colors.textPrimary, fontFamily: 'Barlow_700Bold', marginTop: spacing.s3 },
            ]}
            numberOfLines={2}
          >
            {item.title}
          </Text>

          {/* Row 4 — Lieu */}
          {item.location_city && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.s2,
                marginTop: spacing.s3,
              }}
            >
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
                {volumeStr !== '—' && (
                  <Text style={{ fontSize: 12, color: colors.textSecondary }}> kg</Text>
                )}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>Durée</Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' },
                ]}
              >
                {durationStr}
              </Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={[typography.caption, { color: colors.textTertiary }]}>Score</Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textPrimary, fontFamily: 'Barlow_700Bold' },
                ]}
              >
                —
              </Text>
            </View>
          </View>

          {/* Row 5 — Myo + photo swipeable */}
          {(() => {
            const cardW = screenW - spacing.s4 * 2
            const pageW = cardW - spacing.s3 * 2
            const hasPhoto = !!item.photo_url
            return (
              <View style={{ marginTop: spacing.s4, overflow: 'hidden' }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  decelerationRate="fast"
                  scrollEnabled={hasPhoto}
                  nestedScrollEnabled
                  style={{ width: pageW, height: pageW }}
                >
                  {/* Page 0 — Myo */}
                  <View
                    style={{
                      width: pageW,
                      height: pageW,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    pointerEvents="none"
                  >
                    <MyoChart
                      sessionValues={sessionValues}
                      size={pageW}
                      selectedFamily={null}
                      onFamilySelect={() => {}}
                      showScore={false}
                      showLabels={false}
                    />
                  </View>
                  {/* Page 1 — Photo */}
                  {hasPhoto && (
                    <View
                      style={{
                        width: pageW,
                        height: pageW,
                        borderRadius: radius.md,
                        overflow: 'hidden',
                      }}
                    >
                      <Image
                        source={{ uri: item.photo_url! }}
                        style={{ width: pageW, height: pageW }}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </ScrollView>
                {/* Dots indicateurs */}
                {hasPhoto && (
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 5,
                      marginTop: spacing.s2,
                    }}
                  >
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: colors.accent,
                      }}
                    />
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 3,
                        backgroundColor: colors.textTertiary,
                        opacity: 0.4,
                      }}
                    />
                  </View>
                )}
              </View>
            )
          })()}

          {/* Row 6 — Actions + premier commentaire */}
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
              <Text
                style={[typography.caption, { color: colors.textTertiary, marginLeft: spacing.s1 }]}
              >
                {item.likes_count}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openCommentsModal}
              onLongPress={openCommentsModal}
              style={styles.actionBtn}
            >
              <MessageCircle size={16} color={colors.textTertiary} />
              <Text
                style={[typography.caption, { color: colors.textTertiary, marginLeft: spacing.s1 }]}
              >
                {item.comments_count}
              </Text>
            </TouchableOpacity>

            {item.first_comment && (
              <View style={styles.firstCommentInline}>
                <View
                  style={[
                    styles.firstCommentAvatar,
                    { backgroundColor: avatarColor(item.first_comment.user_id) },
                  ]}
                >
                  <Text
                    style={{ fontSize: 9, fontFamily: 'Barlow_700Bold', color: dark.textPrimary }}
                  >
                    {(item.first_comment.username ?? '·').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.firstCommentText}>
                  <Text
                    style={[typography.caption, { color: colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    <Text style={{ fontFamily: 'Barlow_700Bold', color: colors.textPrimary }}>
                      {item.first_comment.username ?? '·'}{' '}
                    </Text>
                    {item.first_comment.content}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

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
        onCommentLike={handleCommentLike}
      />
    </>
  )
}

// Mémoïsé (ORA-029) — une cellule ne re-render que si son item/handlers changent.
// Couplé à removeClippedSubviews : les MyoChart Skia hors-viewport sont démontés.
const FeedItem = React.memo(FeedItemBase)

// ─── Feed Claim Card (called-shot social) ──────────────────────────────────────

function claimDaysUntil(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000))
}

function FeedClaimCardBase({
  claim,
  currentUserId,
  onVote,
}: {
  claim: ClaimFeedItem
  currentUserId: string | null
  onVote: (claimId: string, vote: ClaimVote) => void
}) {
  const { colors } = useTheme()
  const displayName = claim.user.username ?? claim.user.full_name ?? '?'
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
  const bg = avatarColor(claim.user.id || claim.id)
  const isOwn = currentUserId === claim.user.id
  const resolved = claim.status === 'succeeded'
  const targetLabel = `${claim.target_value} ${claim.unit}`
  const dLeft = claimDaysUntil(claim.deadline)
  const deadlineLabel =
    claim.scope === 'next_session'
      ? 'prochaine séance'
      : dLeft === 0
        ? 'dernier jour'
        : `J-${dLeft}`
  const ts = resolved ? (claim.resolved_at ?? claim.created_at) : claim.created_at
  const accentCol = resolved ? colors.prGold : colors.accent
  const believeOn = claim.myVote === 'believe'
  const doubtOn = claim.myVote === 'doubt'

  // Styles dynamiques (theme/état) hoistés — pas de littéral inline (lint clean).
  const cardDyn = { backgroundColor: colors.backgroundSecondary, borderLeftColor: accentCol }
  const avatarDyn = { backgroundColor: bg }
  const nameDyn = { color: colors.textPrimary }
  const timeDyn = { color: colors.textSecondary }
  const tagDyn = { backgroundColor: accentCol + '1A' }
  const tagTextDyn = { color: accentCol }
  const bodyDyn = { color: colors.textPrimary }
  const subDyn = { color: colors.textSecondary }
  const trackDyn = { backgroundColor: colors.backgroundTertiary }
  const fillDyn = {
    backgroundColor: colors.accent,
    width: `${Math.min(100, (claim.progress_current / Math.max(1, claim.target_value)) * 100)}%`,
  } as const
  const mutedDyn = { color: colors.textTertiary }
  const footerDyn = { borderTopColor: colors.separator }
  const believeBtnDyn = { backgroundColor: believeOn ? colors.accent : colors.backgroundTertiary }
  const doubtBtnDyn = {
    backgroundColor: doubtOn ? colors.textSecondary : colors.backgroundTertiary,
  }
  const believeTextDyn = { color: believeOn ? colors.background : colors.textPrimary }
  const doubtTextDyn = { color: doubtOn ? colors.background : colors.textPrimary }
  const believeAccent = { color: colors.accent }

  return (
    <View style={claimStyles.wrapper}>
      <View style={[styles.feedItem, claimStyles.card, cardDyn]}>
        {/* Header */}
        <View style={styles.row1}>
          <View style={[styles.avatarMed, avatarDyn]}>
            <Text style={[styles.avatarInitials, nameDyn]}>{initials}</Text>
          </View>
          <View style={claimStyles.nameCol}>
            <Text style={[typography.caption, claimStyles.metaName, nameDyn]} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={[typography.caption, claimStyles.metaTime, timeDyn]}>{timeAgo(ts)}</Text>
          </View>
          <View style={[claimStyles.tag, tagDyn]}>
            {resolved ? (
              <Sparkles size={12} color={colors.prGold} />
            ) : (
              <Target size={12} color={colors.accent} strokeWidth={2.5} />
            )}
            <Text style={[claimStyles.tagText, tagTextDyn]}>{resolved ? 'RÉUSSI' : 'CLAIM'}</Text>
          </View>
        </View>

        {/* Corps */}
        <Text style={[typography.subtitle, claimStyles.body, bodyDyn]}>
          {resolved ? `A tenu son claim : ${targetLabel}` : `Vise ${targetLabel}`}
        </Text>
        {claim.type === 'weight' && claim.exercise_name && (
          <Text style={[typography.body, claimStyles.sub, subDyn]}>
            {claim.exercise_name}
            {!resolved ? ` · ${deadlineLabel}` : ''}
          </Text>
        )}
        {claim.type === 'sessions' && !resolved && (
          <View style={claimStyles.progressWrap}>
            <View style={[claimStyles.progressTrack, trackDyn]}>
              <View style={[claimStyles.progressFill, fillDyn]} />
            </View>
            <Text style={[typography.caption, claimStyles.progressLabel, mutedDyn]}>
              {claim.progress_current}/{claim.target_value} · {deadlineLabel}
            </Text>
          </View>
        )}

        {/* Footer — pronostics */}
        {resolved ? (
          <Text style={[typography.caption, claimStyles.resolvedNote, subDyn]}>
            {claim.believe > 0 ? `${claim.believe} y croyaient. Pari tenu.` : 'Pari tenu.'}
          </Text>
        ) : isOwn ? (
          <View style={[claimStyles.ownRow, footerDyn]}>
            <Text style={[typography.caption, subDyn]}>
              <Text style={[claimStyles.bold, believeAccent]}>{claim.believe}</Text> y croient
            </Text>
            <Text style={[typography.caption, subDyn]}>
              <Text style={[claimStyles.bold, nameDyn]}>{claim.doubt}</Text> sceptiques
            </Text>
          </View>
        ) : (
          <View style={[claimStyles.voteRow, footerDyn]}>
            <TouchableOpacity
              onPress={() => onVote(claim.id, 'believe')}
              style={[claimStyles.voteBtn, believeBtnDyn]}
            >
              <Flame
                size={15}
                color={believeOn ? colors.background : colors.accent}
                fill={believeOn ? colors.background : 'transparent'}
              />
              <Text style={[claimStyles.voteBtnText, believeTextDyn]}>
                J&apos;y crois {claim.believe > 0 ? claim.believe : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onVote(claim.id, 'doubt')}
              style={[claimStyles.voteBtn, doubtBtnDyn]}
            >
              <Text style={[claimStyles.voteBtnText, doubtTextDyn]}>
                Chaud {claim.doubt > 0 ? claim.doubt : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  )
}

const FeedClaimCard = React.memo(FeedClaimCardBase)

const claimStyles = StyleSheet.create({
  wrapper: { marginBottom: spacing.s3 },
  card: { marginBottom: 0, borderLeftWidth: 3 },
  nameCol: { flex: 1, minWidth: 0 },
  metaName: { fontFamily: 'Barlow_700Bold', textTransform: 'uppercase' },
  metaTime: { fontSize: 12 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    height: 26,
  },
  tagText: { fontSize: 10, fontFamily: 'Barlow_700Bold', letterSpacing: 1 },
  body: { fontFamily: 'Barlow_700Bold', marginTop: spacing.s3 },
  sub: { marginTop: 2 },
  progressWrap: { marginTop: spacing.s3 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { marginTop: spacing.s1 },
  resolvedNote: { marginTop: spacing.s3 },
  ownRow: {
    flexDirection: 'row',
    gap: spacing.s4,
    marginTop: spacing.s4,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
  },
  bold: { fontFamily: 'Barlow_700Bold' },
  voteRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s4,
    paddingTop: spacing.s3,
    borderTopWidth: 1,
  },
  voteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    height: 40,
    borderRadius: radius.md,
  },
  voteBtnText: { fontFamily: 'Barlow_700Bold', fontSize: 13 },
})

// ─── KPIs Bandeau ────────────────────────────────────────────────────────────

// TrendArrow — reproduit exactement TrendingUp/TrendingDown Lucide (viewBox 0 0 24 24)
// 3 paths séparés tracés en séquence : polyligne → branche H → branche V
// Longueurs mesurées : polyligne ≈ 30, branche H = 6, branche V = 6
function TrendArrow({
  color,
  up,
  drawProgress,
}: {
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
    <Svg width={14} height={14} viewBox="0 0 24 24">
      {up ? (
        <>
          {/* polyligne : 1,17 → 9,9 → 14,14 → 23,5 */}
          <AnimatedPath
            d="M1 17 L9 9 L14 14 L23 5"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={L1}
            animatedProps={props1}
          />
          {/* branche H : 17,5 → 23,5 */}
          <AnimatedPath
            d="M17 5 L23 5"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={L2}
            animatedProps={props2}
          />
          {/* branche V : 23,5 → 23,11 */}
          <AnimatedPath
            d="M23 5 L23 11"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={L3}
            animatedProps={props3}
          />
        </>
      ) : (
        <>
          {/* polyligne down : 1,7 → 9,15 → 14,10 → 23,19 */}
          <AnimatedPath
            d="M1 7 L9 15 L14 10 L23 19"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={L1}
            animatedProps={props1}
          />
          {/* branche H : 17,19 → 23,19 */}
          <AnimatedPath
            d="M17 19 L23 19"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={L2}
            animatedProps={props2}
          />
          {/* branche V : 23,13 → 23,19 */}
          <AnimatedPath
            d="M23 13 L23 19"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={L3}
            animatedProps={props3}
          />
        </>
      )}
    </Svg>
  )
}

function MapPinIcon({
  color,
  drawProgress,
}: {
  color: string
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
  const L_SHAPE = 70 // teardrop bezier (overestimate)
  const L_CIRCLE = 19 // 2π×3

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
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <AnimatedPath
        d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_SHAPE}
        animatedProps={shapeProps}
      />
      <AnimatedCircle
        cx={12}
        cy={10}
        r={3}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeDasharray={L_CIRCLE}
        animatedProps={circleProps}
      />
    </Svg>
  )
}

function DumbbellIcon({
  color,
  drawProgress,
}: {
  color: string
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
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
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <AnimatedPath
        d="M9.6 14.4 L14.4 9.6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={L_BAR}
        animatedProps={barProps}
      />
      <AnimatedPath
        d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_RIGHT}
        animatedProps={rightProps}
      />
      <AnimatedPath
        d="M20.1 3.9 L21.5 2.5"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={L_ACCENT}
        animatedProps={accentRProps}
      />
      <AnimatedPath
        d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_LEFT}
        animatedProps={leftProps}
      />
      <AnimatedPath
        d="M2.5 21.5 L3.9 20.1"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={L_ACCENT}
        animatedProps={accentLProps}
      />
    </Svg>
  )
}

function ActivityWaveIcon({
  color,
  drawProgress,
}: {
  color: string
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
  const L = 42
  const waveProps = useAnimatedProps(() => {
    'worklet'
    return { strokeDashoffset: L * (1 - drawProgress.value) }
  })
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <AnimatedPath
        d="M2 12 L6 12 L8 6 L10 18 L12 12 L22 12"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L}
        animatedProps={waveProps}
      />
    </Svg>
  )
}

function TrophyDrawIcon({
  color,
  drawProgress,
}: {
  color: string
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
  const L_CUP = 48
  const L_HANDLES = 14
  const L_BASE = 36

  const cupProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.min(drawProgress.value / 0.55, 1)
    return { strokeDashoffset: L_CUP * (1 - p) }
  })
  const handlesProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.55) / 0.15, 1))
    return { strokeDashoffset: L_HANDLES * (1 - p) }
  })
  const baseProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.7) / 0.3, 1))
    return { strokeDashoffset: L_BASE * (1 - p) }
  })

  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <AnimatedPath
        d="M6 2 L18 2 L18 9 A6 6 0 0 1 6 9 Z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_CUP}
        animatedProps={cupProps}
      />
      <AnimatedPath
        d="M6 6 L4 6 A2 2 0 0 0 6 10 M18 6 L20 6 A2 2 0 0 1 18 10"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_HANDLES}
        animatedProps={handlesProps}
      />
      <AnimatedPath
        d="M10 14 L10 18 L7 22 M14 14 L14 18 L17 22 M4 22 L20 22"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_BASE}
        animatedProps={baseProps}
      />
    </Svg>
  )
}

function ClockDrawIcon({
  color,
  drawProgress,
}: {
  color: string
  drawProgress: ReturnType<typeof useSharedValue<number>>
}) {
  const L_CIRCLE = 65
  const L_HANDS = 12

  const circleProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.min(drawProgress.value / 0.78, 1)
    return { strokeDashoffset: L_CIRCLE * (1 - p) }
  })
  const handsProps = useAnimatedProps(() => {
    'worklet'
    const p = Math.max(0, Math.min((drawProgress.value - 0.78) / 0.22, 1))
    return { strokeDashoffset: L_HANDS * (1 - p) }
  })

  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <AnimatedPath
        d="M12 2 A10 10 0 0 1 22 12 A10 10 0 0 1 12 22 A10 10 0 0 1 2 12 A10 10 0 0 1 12 2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={L_CIRCLE}
        animatedProps={circleProps}
      />
      <AnimatedPath
        d="M12 7 L12 12 L16 14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray={L_HANDS}
        animatedProps={handsProps}
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
  volumeThisMonth: number
  prsThisMonth: number
  avgDurationMin: number
  scaleVolume: ReturnType<typeof useSharedValue<number>>
  scalePRs: ReturnType<typeof useSharedValue<number>>
  scaleDuration: ReturnType<typeof useSharedValue<number>>
  drawVolume: ReturnType<typeof useSharedValue<number>>
  drawPRs: ReturnType<typeof useSharedValue<number>>
  drawDuration: ReturnType<typeof useSharedValue<number>>
}

function KPIBandeau({
  workoutsThisMonth,
  trendPercent,
  scaleSeances,
  scaleTrend,
  drawArrow,
  drawMapPin,
  drawDumbbell,
  volumeThisMonth,
  prsThisMonth,
  avgDurationMin,
  scaleVolume,
  scalePRs,
  scaleDuration,
  drawVolume,
  drawPRs,
  drawDuration,
}: KPIBandeauProps) {
  const { colors } = useTheme()
  const router = useRouter()

  const seancesStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleSeances.value }] }))
  const trendStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleTrend.value }] }))
  const volumeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleVolume.value }] }))
  const prsStyle = useAnimatedStyle(() => ({ transform: [{ scale: scalePRs.value }] }))
  const durationStyle = useAnimatedStyle(() => ({ transform: [{ scale: scaleDuration.value }] }))

  const trendColor =
    trendPercent > 5 ? colors.success : trendPercent < -5 ? colors.error : colors.textSecondary

  const showArrow = trendPercent > 5 || trendPercent < -5
  const arrowUp = trendPercent > 5

  const volumeStr =
    volumeThisMonth >= 1000 ? `${(volumeThisMonth / 1000).toFixed(1)}T` : `${volumeThisMonth} kg`

  const durationStr =
    avgDurationMin >= 60
      ? `${Math.floor(avgDurationMin / 60)}h${avgDurationMin % 60 > 0 ? `${avgDurationMin % 60}m` : ''}`
      : `${avgDurationMin}min`

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

      {/* Rangée 1 */}
      <View
        style={[
          styles.kpiBandeau,
          { paddingHorizontal: spacing.s4, gap: spacing.s3, paddingBottom: 0 },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.push('/gyms')}
          style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}
        >
          <MapPinIcon color={colors.textSecondary} drawProgress={drawMapPin} />
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            Voir les salles
          </Text>
        </TouchableOpacity>

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
                  fontSize: 11,
                },
              ]}
            >
              {workoutsThisMonth}
            </Text>
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            Séances
          </Text>
        </View>

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
                  fontSize: 11,
                },
              ]}
            >
              {trendPercent > 0 ? '+' : ''}
              {Math.round(trendPercent)}%
            </Text>
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            Tendance
          </Text>
        </View>
      </View>

      {/* Rangée 2 */}
      <View
        style={[
          styles.kpiBandeau,
          { paddingHorizontal: spacing.s4, gap: spacing.s3, paddingTop: spacing.s2 },
        ]}
      >
        <View style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}>
          <ActivityWaveIcon color={colors.textSecondary} drawProgress={drawVolume} />
          <Animated.View style={volumeStyle}>
            <Text
              style={[
                typography.body,
                {
                  color: colors.textPrimary,
                  fontFamily: 'Barlow_700Bold',
                  fontVariant: ['tabular-nums'],
                  textAlign: 'center',
                  fontSize: 11,
                },
              ]}
            >
              {volumeStr}
            </Text>
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            Volume
          </Text>
        </View>

        <View style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}>
          <TrophyDrawIcon color={colors.prGold} drawProgress={drawPRs} />
          <Animated.View style={prsStyle}>
            <Text
              style={[
                typography.body,
                {
                  color: colors.textPrimary,
                  fontFamily: 'Barlow_700Bold',
                  fontVariant: ['tabular-nums'],
                  textAlign: 'center',
                  fontSize: 11,
                },
              ]}
            >
              {prsThisMonth}
            </Text>
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            PRs
          </Text>
        </View>

        <View style={[styles.kpiItem, { backgroundColor: colors.backgroundSecondary }]}>
          <ClockDrawIcon color={colors.textSecondary} drawProgress={drawDuration} />
          <Animated.View style={durationStyle}>
            <Text
              style={[
                typography.body,
                {
                  color: colors.textPrimary,
                  fontFamily: 'Barlow_700Bold',
                  fontVariant: ['tabular-nums'],
                  textAlign: 'center',
                  fontSize: 11,
                },
              ]}
            >
              {durationStr}
            </Text>
          </Animated.View>
          <Text
            style={[
              typography.caption,
              { color: colors.textSecondary, textAlign: 'center', fontSize: 9 },
            ]}
            numberOfLines={1}
          >
            Durée moy.
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
  // Couche data extraite — ORA-034
  const {
    feedEntries,
    currentUserId,
    currentUserFirstName,
    kpis,
    fetchFeed,
    handleLike,
    voteOnClaim,
  } = useFeedData()
  const { workoutsThisMonth, trendPercent, volumeThisMonth, prsThisMonth, avgDurationMin } = kpis
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const greetingOpacity = useSharedValue(0)
  const greetingTranslate = useSharedValue(8)
  const logoScale = useSharedValue(1)
  const refreshSpin = useSharedValue(0)
  const listOpacity = useSharedValue(1)
  const listTranslateY = useSharedValue(0)
  const listTranslateX = useSharedValue(0)
  const scaleSeances = useSharedValue(1)
  const scaleTrend = useSharedValue(1)
  const drawArrow = useSharedValue(1)
  const drawMapPin = useSharedValue(1)
  const drawDumbbell = useSharedValue(1)
  const scaleVolume = useSharedValue(1)
  const scalePRs = useSharedValue(1)
  const scaleDuration = useSharedValue(1)
  const drawVolume = useSharedValue(1)
  const drawPRs = useSharedValue(1)
  const drawDuration = useSharedValue(1)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kpiIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const kpiDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstFocus = useRef(true)
  const lastFetchAtRef = useRef(0) // ORA-067 — timestamp du dernier fetch feed (TTL focus)
  const firstNameRef = useRef('')

  // Garder le ref à jour sans recréer l'interval
  useEffect(() => {
    firstNameRef.current = currentUserFirstName
  }, [currentUserFirstName])

  // ─── Groupe 1 : logo + icône profil + greeting — immédiat puis toutes les 5s ─

  useEffect(() => {
    const tickHeader = () => {
      logoScale.value = withSequence(
        withSpring(1.22, { damping: 5, stiffness: 500 }),
        withSpring(1.0, { damping: 10, stiffness: 300 }),
        withSpring(1.1, { damping: 7, stiffness: 420 }),
        withSpring(1.0, { damping: 14, stiffness: 260 })
      )

      if (!firstNameRef.current) return

      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      greetingOpacity.value = 0
      greetingTranslate.value = 8
      greetingOpacity.value = withTiming(1, {
        duration: 500,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
      greetingTranslate.value = withSpring(0, { damping: 25, stiffness: 120 })

      hideTimerRef.current = setTimeout(() => {
        greetingOpacity.value = withTiming(0, {
          duration: 450,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
        })
        greetingTranslate.value = withTiming(-4, {
          duration: 400,
          easing: Easing.bezier(0.37, 0, 0.63, 1),
        })
      }, 4000)
    }

    tickHeader()
    const id1 = setInterval(tickHeader, 5000)

    return () => {
      clearInterval(id1)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      cancelAnimation(logoScale)
      cancelAnimation(greetingOpacity)
      cancelAnimation(greetingTranslate)
    }
  }, [])

  // ─── Groupe 2 : 3 KPI cards — décalé de 2.5s puis toutes les 5s ─────────────

  useEffect(() => {
    const tickKPI = () => {
      scaleSeances.value = 1
      scaleSeances.value = withSequence(
        withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
        withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      )
      drawMapPin.value = 0
      drawMapPin.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      drawDumbbell.value = 0
      drawDumbbell.value = withTiming(1, {
        duration: 1100,
        easing: Easing.bezier(0.37, 0, 0.63, 1),
      })
      drawArrow.value = 0
      drawArrow.value = withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      // Rangée 2 — décalées en cascade (500ms / 900ms / 1300ms)
      drawVolume.value = 0
      drawVolume.value = withDelay(
        500,
        withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      )
      drawPRs.value = 0
      drawPRs.value = withDelay(
        900,
        withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      )
      drawDuration.value = 0
      drawDuration.value = withDelay(
        1300,
        withTiming(1, { duration: 1100, easing: Easing.bezier(0.37, 0, 0.63, 1) })
      )
      if (kpiTimerRef.current) clearTimeout(kpiTimerRef.current)
      kpiTimerRef.current = setTimeout(() => {
        scaleTrend.value = 1
        scaleTrend.value = withSequence(
          withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
          withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
        )
        // Nombres rangée 2 — même décalage que les icônes
        scaleVolume.value = 1
        scaleVolume.value = withDelay(
          350,
          withSequence(
            withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
            withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
          )
        )
        scalePRs.value = 1
        scalePRs.value = withDelay(
          750,
          withSequence(
            withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
            withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
          )
        )
        scaleDuration.value = 1
        scaleDuration.value = withDelay(
          1150,
          withSequence(
            withTiming(1.18, { duration: 120, easing: Easing.bezier(0.34, 1.56, 0.64, 1) }),
            withTiming(1.0, { duration: 200, easing: Easing.bezier(0.37, 0, 0.63, 1) })
          )
        )
      }, 150)
    }

    kpiDelayRef.current = setTimeout(() => {
      tickKPI()
      kpiIntervalRef.current = setInterval(tickKPI, 5000)
    }, 2500)

    return () => {
      if (kpiDelayRef.current) clearTimeout(kpiDelayRef.current)
      if (kpiIntervalRef.current) clearInterval(kpiIntervalRef.current)
      if (kpiTimerRef.current) clearTimeout(kpiTimerRef.current)
      cancelAnimation(scaleSeances)
      cancelAnimation(scaleTrend)
      cancelAnimation(drawArrow)
      cancelAnimation(drawMapPin)
      cancelAnimation(drawDumbbell)
      cancelAnimation(scaleVolume)
      cancelAnimation(scalePRs)
      cancelAnimation(scaleDuration)
      cancelAnimation(drawVolume)
      cancelAnimation(drawPRs)
      cancelAnimation(drawDuration)
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

  const listAnimStyle = useAnimatedStyle(() => ({
    opacity: listOpacity.value,
    transform: [{ translateY: listTranslateY.value }, { translateX: listTranslateX.value }],
  }))

  // ─── Refresh spin ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (refreshing) {
      refreshSpin.value = 0
      // ORA-066 — exception linear assumée : rotation continue (vitesse constante).
      refreshSpin.value = withRepeat(
        withTiming(360, { duration: 700, easing: Easing.linear }),
        -1,
        false
      )
    } else {
      cancelAnimation(refreshSpin)
    }
  }, [refreshing])

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        lastFetchAtRef.current = Date.now()
        fetchFeed().finally(() => setLoading(false))
      } else {
        // Retour sur le tab — slide depuis la droite (toujours).
        const W = SCREEN_WIDTH
        listTranslateX.value = W
        listOpacity.value = 0.85
        listTranslateX.value = withSpring(0, { damping: 22, stiffness: 180, mass: 0.8 })
        listOpacity.value = withTiming(1, { duration: 220, easing: Easing.bezier(0.16, 1, 0.3, 1) })
        listTranslateY.value = 0
        // ORA-067 — ne re-fetch que si les données sont périmées (>20s) : évite de marteler
        // Supabase (8 requêtes) à chaque aller-retour rapide entre tabs.
        if (Date.now() - lastFetchAtRef.current < 20000) return
        lastFetchAtRef.current = Date.now()
        setRefreshing(true)
        Promise.all([fetchFeed(), new Promise((r) => setTimeout(r, 1500))]).finally(() => {
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
    await Promise.all([fetchFeed(), new Promise((r) => setTimeout(r, 1500))])
    setRefreshing(false)
    listOpacity.value = withTiming(1, { duration: 300, easing: Easing.bezier(0.16, 1, 0.3, 1) })
    listTranslateY.value = withSpring(0, { damping: 20, stiffness: 300 })
  }, [fetchFeed])

  // ─── Navigate to detail ─────────────────────────────────────────────────────

  const handleNavigateDetail = useCallback(
    (workoutId: string) => {
      router.push(`/feed/${workoutId}`)
    },
    [router]
  )

  // ─── Navigate to profile ─────────────────────────────────────────────────────

  const handleNavigateProfile = useCallback(() => {
    router.push('/(tabs)/profile')
  }, [router])

  // ─── FlatList — renderItem stable (ORA-029) ─────────────────────────────────

  const keyExtractor = useCallback((item: FeedEntry) => `${item.kind}-${item.id}`, [])
  const renderFeedItem = useCallback(
    ({ item }: { item: FeedEntry }) => {
      if (item.kind === 'claim') {
        return (
          <FeedClaimCard claim={item.claim} currentUserId={currentUserId} onVote={voteOnClaim} />
        )
      }
      return (
        <FeedItem
          item={item.workout}
          currentUserId={currentUserId}
          onLike={handleLike}
          onNavigateDetail={handleNavigateDetail}
        />
      )
    },
    [currentUserId, handleLike, handleNavigateDetail, voteOnClaim]
  )

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      {/* Header — Logo animé + Greeting émerge + Avatar */}
      <View style={[styles.header, { paddingHorizontal: spacing.s4, paddingVertical: spacing.s3 }]}>
        <Animated.View style={logoAnimStyle}>
          <TouchableOpacity onPress={() => router.push('/chat')} activeOpacity={0.8}>
            <OravaLogo />
          </TouchableOpacity>
        </Animated.View>
        {/* Clip parent — le texte émerge depuis le bord gauche */}
        <View style={{ flex: 1, marginLeft: spacing.s3 }}>
          <Animated.View style={greetingAnimStyle}>
            <Text
              style={[
                typography.body,
                { color: colors.textPrimary, fontFamily: 'Barlow_600SemiBold' },
              ]}
              numberOfLines={1}
            >
              Bonjour {currentUserFirstName},
            </Text>
            <Text style={[typography.caption, { color: colors.textSecondary }]} numberOfLines={1}>
              as-tu une question ?
            </Text>
          </Animated.View>
        </View>
        <TouchableOpacity
          onPress={handleNavigateProfile}
          hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
        >
          {/* Wrapper 44×44 — avatar 40×40 centré, SVG overlay pour le point orbital */}
          <View style={styles.avatarHeaderWrap}>
            <View
              style={[
                styles.avatarSmallHeader,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.accent },
              ]}
            >
              <Text style={[styles.avatarInitialsSmall, { color: colors.textPrimary }]}>
                {currentUserFirstName.charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Refresh indicator */}
      {refreshing && (
        <View style={styles.refreshIndicator}>
          <Animated.View style={refreshSpinStyle}>
            <RefreshCw size={12} color={colors.accent} />
          </Animated.View>
          <Text
            style={[
              typography.caption,
              {
                color: colors.textTertiary,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginLeft: spacing.s2,
              },
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
            data={feedEntries}
            keyExtractor={keyExtractor}
            contentContainerStyle={{
              paddingHorizontal: spacing.s4,
              paddingVertical: spacing.s3,
              paddingBottom: spacing.s12,
            }}
            ListHeaderComponent={
              <View style={{ marginHorizontal: -spacing.s4, marginBottom: spacing.s3 }}>
                <KPIBandeau
                  workoutsThisMonth={workoutsThisMonth}
                  trendPercent={trendPercent}
                  scaleSeances={scaleSeances}
                  scaleTrend={scaleTrend}
                  drawArrow={drawArrow}
                  drawMapPin={drawMapPin}
                  drawDumbbell={drawDumbbell}
                  volumeThisMonth={volumeThisMonth}
                  prsThisMonth={prsThisMonth}
                  avgDurationMin={avgDurationMin}
                  scaleVolume={scaleVolume}
                  scalePRs={scalePRs}
                  scaleDuration={scaleDuration}
                  drawVolume={drawVolume}
                  drawPRs={drawPRs}
                  drawDuration={drawDuration}
                />
              </View>
            }
            ItemSeparatorComponent={null}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            }
            renderItem={renderFeedItem}
            ListEmptyComponent={FeedEmptyState}
            showsVerticalScrollIndicator={false}
            // ── Perf (ORA-028) — limite le nombre de MyoChart Skia montés ──
            removeClippedSubviews
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={7}
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
    paddingVertical: spacing.s2,
    paddingHorizontal: spacing.s2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s1,
    minHeight: 72,
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
  firstCommentInline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginLeft: spacing.s6,
    minWidth: 0,
  },
  firstCommentAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  firstCommentText: {
    flex: 1,
    minWidth: 0,
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
  commentsSheetContent: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  dragHandleArea: {
    alignItems: 'center',
    paddingVertical: spacing.s5,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    opacity: 0.4,
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
