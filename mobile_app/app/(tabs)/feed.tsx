import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Zap, Flame, Trophy, MapPin, Timer } from 'lucide-react-native'
type PrLevel = 'gold' | 'silver' | 'bronze' | null
import Svg, { Path, Circle, Polygon, Line } from 'react-native-svg'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MyoSig {
  z_volume: number
  z_intensite: number
  z_structure: number
  z_recovery: number
  z_performance: number
  z_regularite: number
  score: number
  anomaly_detected: boolean
}

interface FeedPost {
  id: string
  title: string
  started_at: string
  duration_sec: number
  user_id: string
  username: string
  display_name: string
  exercise_count: number
  total_sets: number
  total_volume: number
  pr_count: number
  pr_charge_best: PrLevel
  pr_serie_best: PrLevel
  pr_seance: PrLevel
  like_count: number
  comment_count: number
  is_liked: boolean
  is_own: boolean
  location_city: string | null
  photo_url: string | null
  avg_rest_sec: number | null
  myoSig: MyoSig | null
}

interface Comment {
  id: string
  content: string
  created_at: string
  user_id: string
  display_name: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PR_LEVEL_COLORS: Record<NonNullable<PrLevel>, string> = {
  gold: '#FAC775', silver: '#C0C0C0', bronze: '#CD7F32',
}
const LEVEL_RANK: Record<string, number> = { gold: 3, silver: 2, bronze: 1 }
function bestPrLevel(sets: any[], field: string): PrLevel {
  let best: PrLevel = null
  for (const s of sets) {
    if (s[field] && (!best || LEVEL_RANK[s[field]] > LEVEL_RANK[best])) best = s[field]
  }
  return best
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
}

function formatRest(sec: number): string {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}min ${s}s` : `${m}min`
}

function computeAvgRest(sets: { rest_seconds?: number | null }[]): number | null {
  const vals = sets.map(s => s.rest_seconds ?? 0).filter(r => r > 0 && r < 3600)
  if (vals.length === 0) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

function formatRelative(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 60) return `Il y a ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `Il y a ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  if (diffD === 1) return 'Hier'
  if (diffD < 7) return `Il y a ${diffD} jours`
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

// ─── FeedScreen ──────────────────────────────────────────────────────────────

export default function FeedScreen() {
  const { colors } = useTheme()
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [commentWorkoutId, setCommentWorkoutId] = useState<string | null>(null)
  const [likersWorkoutId, setLikersWorkoutId] = useState<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)

  useFocusEffect(useCallback(() => { fetchFeed() }, []))

  async function fetchFeed() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    currentUserIdRef.current = user.id

    const { data: followsData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id)

    const followingIds: string[] = (followsData ?? []).map((f: any) => f.following_id)
    const visibleUserIds = [user.id, ...followingIds]

    const { data: workoutsData, error } = await supabase
      .from('workouts')
      .select(`
        id, title, started_at, duration_sec, user_id, location_city, photo_url, pr_seance,
        workout_exercises (
          exercise_id,
          workout_sets ( weight_kg, reps, is_pr, pr_charge, pr_serie, rest_seconds )
        ),
        likes ( user_id ),
        comments ( id )
      `)
      .in('user_id', visibleUserIds)
      .order('started_at', { ascending: false })
      .limit(30)

    if (error || !workoutsData) { setLoading(false); setRefreshing(false); return }

    const uniqueIds = [...new Set(workoutsData.map((w: any) => w.user_id))]
    const { data: profilesData } = await supabase
      .from('users')
      .select('id, username, full_name')
      .in('id', uniqueIds)

    const profileMap: Record<string, { username: string; full_name: string | null }> = {}
    for (const p of (profilesData ?? []) as any[]) {
      profileMap[p.id] = { username: p.username ?? 'anonyme', full_name: p.full_name }
    }

    const feedPosts: FeedPost[] = workoutsData.map((w: any) => {
      const weRows: any[] = w.workout_exercises ?? []
      const allSets = weRows.flatMap((we: any) => we.workout_sets ?? [])
      const profile = profileMap[w.user_id]
      const username = profile?.username ?? 'anonyme'

      const sessionAvg = computeAvgRest(allSets)

      return {
        id: w.id,
        title: w.title ?? 'Séance',
        started_at: w.started_at,
        duration_sec: w.duration_sec ?? 0,
        user_id: w.user_id,
        username,
        display_name: profile?.full_name ?? username,
        exercise_count: weRows.length,
        total_sets: allSets.length,
        total_volume: allSets.reduce((sum: number, s: any) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
        pr_count: allSets.filter((s: any) => s.is_pr).length,
        pr_charge_best: bestPrLevel(allSets, 'pr_charge'),
        pr_serie_best: bestPrLevel(allSets, 'pr_serie'),
        pr_seance: (w.pr_seance ?? null) as PrLevel,
        like_count: (w.likes ?? []).length,
        comment_count: (w.comments ?? []).length,
        is_liked: (w.likes ?? []).some((l: any) => l.user_id === user.id),
        is_own: w.user_id === user.id,
        location_city: w.location_city ?? null,
        photo_url: w.photo_url ?? null,
        avg_rest_sec: sessionAvg,
        myoSig: null,
      }
    })

    const wids = feedPosts.map(p => p.id)
    const { data: myoData } = wids.length > 0
      ? await supabase
          .from('myo_signatures')
          .select('workout_id,z_volume,z_intensite,z_structure,z_recovery,z_performance,z_regularite,score,anomaly_detected')
          .in('workout_id', wids)
      : { data: null }

    const myoMap: Record<string, MyoSig> = {}
    for (const m of (myoData ?? []) as any[]) {
      myoMap[m.workout_id] = {
        z_volume: m.z_volume, z_intensite: m.z_intensite, z_structure: m.z_structure,
        z_recovery: m.z_recovery, z_performance: m.z_performance, z_regularite: m.z_regularite,
        score: m.score, anomaly_detected: m.anomaly_detected,
      }
    }

    setPosts(feedPosts.map(p => ({ ...p, myoSig: myoMap[p.id] ?? null })))
    setLoading(false)
    setRefreshing(false)
  }

  async function toggleLike(postId: string, currentlyLiked: boolean) {
    const userId = currentUserIdRef.current
    if (!userId) return

    setPosts(prev => prev.map(p =>
      p.id === postId
        ? { ...p, is_liked: !currentlyLiked, like_count: p.like_count + (currentlyLiked ? -1 : 1) }
        : p
    ))

    const { error } = currentlyLiked
      ? await supabase.from('likes').delete().eq('workout_id', postId).eq('user_id', userId)
      : await supabase.from('likes').insert({ workout_id: postId, user_id: userId })

    if (error) {
      setPosts(prev => prev.map(p =>
        p.id === postId
          ? { ...p, is_liked: currentlyLiked, like_count: p.like_count + (currentlyLiked ? 1 : -1) }
          : p
      ))
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={styles.logo}>Orava</Text>
      </View>

      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🏋️</Text>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Ton feed est vide</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            Log ta première séance ou suis des amis pour voir leurs activités ici.
          </Text>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              colors={colors}
              onLike={() => toggleLike(item.id, item.is_liked)}
              onComment={() => setCommentWorkoutId(item.id)}
              onLikers={() => setLikersWorkoutId(item.id)}
              onPress={() => router.push(`/history/${item.id}`)}
            />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchFeed() }}
              tintColor={colors.accent}
            />
          }
        />
      )}

      <CommentsModal
        workoutId={commentWorkoutId}
        visible={commentWorkoutId !== null}
        onClose={() => setCommentWorkoutId(null)}
        onCommentSent={id => setPosts(prev => prev.map(p =>
          p.id === id ? { ...p, comment_count: p.comment_count + 1 } : p
        ))}
        colors={colors}
      />

      <LikersModal
        workoutId={likersWorkoutId}
        visible={likersWorkoutId !== null}
        onClose={() => setLikersWorkoutId(null)}
        colors={colors}
      />
    </View>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({ post, colors, onLike, onComment, onLikers, onPress }: {
  post: FeedPost
  colors: ReturnType<typeof useTheme>['colors']
  onLike: () => void
  onComment: () => void
  onLikers: () => void
  onPress: () => void
}) {
  const hasPrIcons = post.pr_charge_best !== null || post.pr_serie_best !== null || post.pr_seance !== null

  return (
    <TouchableOpacity
      style={[styles.card, { borderBottomColor: colors.separator }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* Auteur */}
      <View style={styles.authorRow}>
        <View style={[styles.avatar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '44' }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(post.display_name)}</Text>
        </View>
        <View style={styles.authorMeta}>
          <Text style={[styles.authorName, { color: colors.textPrimary }]}>
            {post.display_name}
            {post.is_own && <Text style={[styles.ownTag, { color: colors.textSecondary }]}> · Toi</Text>}
          </Text>
          <Text style={[styles.postTime, { color: colors.textSecondary }]}>{formatRelative(post.started_at)}</Text>
        </View>
        <Text style={[styles.duration, { color: colors.textSecondary }]}>{formatDuration(post.duration_sec)}</Text>
      </View>

      {/* Titre + ville */}
      <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{post.title}</Text>
      {post.photo_url && (
        <Image
          source={{ uri: post.photo_url }}
          style={styles.postPhoto}
          resizeMode="cover"
        />
      )}
      {post.location_city && (
        <View style={styles.locationRow}>
          <MapPin size={11} color={colors.textSecondary} />
          <Text style={[styles.locationText, { color: colors.textSecondary }]}>{post.location_city}</Text>
        </View>
      )}

      {/* Stats */}
      <View style={styles.statsRow}>
        <MiniStat icon="◎" label={`${post.exercise_count} ex.`} colors={colors} />
        <MiniStat icon="↑" label={`${post.total_sets} séries`} colors={colors} />
        <MiniStat
          icon="⚡"
          label={post.total_volume >= 1000
            ? `${(post.total_volume / 1000).toFixed(1)}t`
            : `${post.total_volume.toLocaleString('fr')} kg`}
          colors={colors}
        />
        {post.avg_rest_sec !== null && (
          <MiniStat icon={<Timer size={12} color={colors.textSecondary} />} label={formatRest(post.avg_rest_sec)} colors={colors} />
        )}
        {hasPrIcons && (
          <View style={[styles.prChip, { backgroundColor: colors.prAmber + '18' }]}>
            {post.pr_charge_best && <Zap size={12} color={PR_LEVEL_COLORS[post.pr_charge_best]} fill={PR_LEVEL_COLORS[post.pr_charge_best]} />}
            {post.pr_serie_best && <Flame size={12} color={PR_LEVEL_COLORS[post.pr_serie_best]} fill={PR_LEVEL_COLORS[post.pr_serie_best]} />}
            {post.pr_seance && <Trophy size={12} color={PR_LEVEL_COLORS[post.pr_seance]} fill={PR_LEVEL_COLORS[post.pr_seance]} />}
          </View>
        )}
      </View>


      {/* Myo */}
      {post.myoSig && <MyoCard sig={post.myoSig} workoutId={post.id} colors={colors} />}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={e => { e.stopPropagation(); onLike() }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.likeIcon, post.is_liked && { color: colors.accent }]}>
            {post.is_liked ? '♥' : '♡'}
          </Text>
          {post.like_count > 0 && (
            <TouchableOpacity onPress={e => { e.stopPropagation(); onLikers() }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.actionCount, { color: colors.textSecondary }, post.is_liked && { color: colors.accent }]}>
                {post.like_count}
              </Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionBtn}
          onPress={e => { e.stopPropagation(); onComment() }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.commentIcon}>💬</Text>
          {post.comment_count > 0 && (
            <Text style={[styles.actionCount, { color: colors.textSecondary }]}>{post.comment_count}</Text>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

// ─── CommentsModal ────────────────────────────────────────────────────────────

function CommentsModal({ workoutId, visible, onClose, onCommentSent, colors }: {
  workoutId: string | null
  visible: boolean
  onClose: () => void
  onCommentSent: (id: string) => void
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible && workoutId) fetchComments(workoutId)
    else { setComments([]); setNewComment('') }
  }, [visible, workoutId])

  async function fetchComments(id: string) {
    setLoading(true)
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, user_id, users(username, full_name)')
      .eq('workout_id', id)
      .order('created_at', { ascending: true })

    if (data) {
      setComments((data as any[]).map(c => ({
        id: c.id,
        content: c.content,
        created_at: c.created_at,
        user_id: c.user_id,
        display_name: (c.users as any)?.full_name ?? (c.users as any)?.username ?? 'Anonyme',
      })))
    }
    setLoading(false)
  }

  async function sendComment() {
    if (!workoutId || !newComment.trim()) return
    setSending(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSending(false); return }
    const content = newComment.trim()
    const { error } = await supabase.from('comments').insert({ workout_id: workoutId, user_id: user.id, content })
    if (!error) {
      setComments(prev => [...prev, {
        id: Date.now().toString(), content,
        created_at: new Date().toISOString(), user_id: user.id, display_name: 'Toi',
      }])
      setNewComment('')
      onCommentSent(workoutId)
    }
    setSending(false)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <TouchableOpacity style={cm.backdrop} onPress={onClose} activeOpacity={1} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={cm.sheetWrapper}>
          <View style={[cm.sheet, { backgroundColor: colors.card }]} onStartShouldSetResponder={() => true}>
            <View style={[cm.handle, { backgroundColor: colors.separator }]} />
            <View style={[cm.sheetHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[cm.sheetTitle, { color: colors.textPrimary }]}>Commentaires</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[cm.closeText, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <ActivityIndicator color={colors.accent} style={cm.loader} />
            ) : comments.length === 0 ? (
              <View style={cm.emptyComments}>
                <Text style={[cm.emptyCommentsText, { color: colors.textSecondary }]}>
                  Aucun commentaire. Sois le premier !
                </Text>
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={c => c.id}
                style={cm.commentList}
                renderItem={({ item }) => (
                  <View style={cm.commentRow}>
                    <View style={[cm.commentAvatar, { backgroundColor: colors.accent + '22' }]}>
                      <Text style={[cm.commentAvatarText, { color: colors.accent }]}>
                        {item.display_name[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                    <View style={cm.commentBody}>
                      <Text style={[cm.commentAuthor, { color: colors.textSecondary }]}>{item.display_name}</Text>
                      <Text style={[cm.commentContent, { color: colors.textPrimary }]}>{item.content}</Text>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={[cm.inputRow, { borderTopColor: colors.separator }]}>
              <TextInput
                style={[cm.input, { backgroundColor: colors.backgroundSecondary, color: colors.textPrimary, borderColor: colors.separator }]}
                value={newComment}
                onChangeText={setNewComment}
                placeholder="Ajouter un commentaire…"
                placeholderTextColor={colors.textSecondary}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={sendComment}
                submitBehavior="newline"
              />
              <TouchableOpacity
                style={[cm.sendBtn, { backgroundColor: colors.accent }, (!newComment.trim() || sending) && cm.sendBtnDisabled]}
                onPress={sendComment}
                disabled={!newComment.trim() || sending}
              >
                {sending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={cm.sendBtnText}>↑</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

// ─── LikersModal ─────────────────────────────────────────────────────────────

interface Liker { id: string; display_name: string }

function LikersModal({ workoutId, visible, onClose, colors }: {
  workoutId: string | null
  visible: boolean
  onClose: () => void
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const [likers, setLikers] = useState<Liker[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && workoutId) fetchLikers(workoutId)
    else setLikers([])
  }, [visible, workoutId])

  async function fetchLikers(id: string) {
    setLoading(true)
    const { data } = await supabase
      .from('likes')
      .select('user_id, users(username, full_name)')
      .eq('workout_id', id)
      .order('created_at', { ascending: false })
    if (data) {
      setLikers((data as any[]).map(l => ({
        id: l.user_id,
        display_name: (l.users as any)?.full_name ?? (l.users as any)?.username ?? 'Anonyme',
      })))
    }
    setLoading(false)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={cm.overlay}>
        <TouchableOpacity style={cm.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={[cm.sheet, { backgroundColor: colors.card }, cm.sheetWrapper]}>
          <View style={[cm.handle, { backgroundColor: colors.separator }]} />
          <View style={[cm.sheetHeader, { borderBottomColor: colors.separator }]}>
            <Text style={[cm.sheetTitle, { color: colors.textPrimary }]}>
              {likers.length > 0 ? `${likers.length} j'aime` : "J'aime"}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[cm.closeText, { color: colors.textSecondary }]}>✕</Text>
            </TouchableOpacity>
          </View>
          {loading ? (
            <ActivityIndicator color={colors.accent} style={cm.loader} />
          ) : likers.length === 0 ? (
            <View style={cm.emptyComments}>
              <Text style={[cm.emptyCommentsText, { color: colors.textSecondary }]}>Aucun j'aime pour l'instant.</Text>
            </View>
          ) : (
            <FlatList
              data={likers}
              keyExtractor={l => l.id}
              style={cm.commentList}
              renderItem={({ item }) => (
                <View style={cm.commentRow}>
                  <View style={[cm.commentAvatar, { backgroundColor: colors.accent + '22' }]}>
                    <Text style={[cm.commentAvatarText, { color: colors.accent }]}>
                      {item.display_name[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <Text style={[cm.commentAuthor, { color: colors.textPrimary, alignSelf: 'center' }]}>
                    {item.display_name}
                  </Text>
                  <Text style={{ fontSize: 16, marginLeft: 'auto' }}>♥</Text>
                </View>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  )
}

// ─── MiniStat ─────────────────────────────────────────────────────────────────

function MiniStat({ icon, label, colors }: {
  icon: string | React.ReactNode; label: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={styles.miniStat}>
      {typeof icon === 'string'
        ? <Text style={[styles.miniStatIcon, { color: colors.textSecondary }]}>{icon}</Text>
        : icon}
      <Text style={[styles.miniStatLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

// ─── Myo Fractal ──────────────────────────────────────────────────────────────

const MB = 160
const MC = MB / 2
const BLOOM_COLORS = ['#D85A30', '#FAC775', '#9B59B6', '#50C878', '#4A9EFF', '#FF9800']

interface FBranch { d: string; stroke: string; sw: number; op: number }
interface FDot    { cx: number; cy: number; r: number; fill: string }

function bPath(x1: number, y1: number, x2: number, y2: number, bend: number): string {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const px = (-dy / len) * len * bend * 0.22
  const py = (dx / len) * len * bend * 0.22
  const c1x = x1 + dx * 0.33 + px, c1y = y1 + dy * 0.33 + py
  const c2x = x2 - dx * 0.25 + px * 0.5, c2y = y2 - dy * 0.25 + py * 0.5
  return `M${x1.toFixed(1)},${y1.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
}

function addAxis(cx: number, cy: number, angle: number, z: number, color: string, br: FBranch[], dt: FDot[]) {
  const r0 = 14 + ((z + 3) / 6) * 52
  const spread = (20 + Math.abs(z) * 7) * Math.PI / 180
  const levels = z > 0.8 ? 3 : z > -0.8 ? 2 : 1

  const tx = cx + r0 * Math.cos(angle)
  const ty = cy + r0 * Math.sin(angle)
  br.push({ d: bPath(cx, cy, tx, ty, z * 0.1), stroke: color, sw: 2.0, op: 0.92 })

  if (levels === 1) { dt.push({ cx: tx, cy: ty, r: 2.2, fill: color }); return }

  const r1 = r0 * 0.44
  for (const s of [-1, 1]) {
    const a2 = angle + s * spread
    const t2x = tx + r1 * Math.cos(a2), t2y = ty + r1 * Math.sin(a2)
    br.push({ d: bPath(tx, ty, t2x, t2y, z * 0.07), stroke: color, sw: 1.1, op: 0.72 })

    if (levels === 2) { dt.push({ cx: t2x, cy: t2y, r: 1.5, fill: color }); continue }

    const r2 = r1 * 0.52
    for (const s2 of [-1, 1]) {
      const a3 = a2 + s2 * spread * 0.65
      const t3x = t2x + r2 * Math.cos(a3), t3y = t2y + r2 * Math.sin(a3)
      br.push({ d: bPath(t2x, t2y, t3x, t3y, z * 0.05), stroke: color, sw: 0.6, op: 0.55 })
      dt.push({ cx: t3x, cy: t3y, r: 1.0, fill: color })
    }
  }
}

function buildBloom(sig: MyoSig): { br: FBranch[]; dt: FDot[] } {
  const zs = [sig.z_volume, sig.z_intensite, sig.z_structure, sig.z_recovery, sig.z_performance, sig.z_regularite]
  const br: FBranch[] = [], dt: FDot[] = []
  zs.forEach((z, i) => addAxis(MC, MC, -Math.PI / 2 + (i / 6) * 2 * Math.PI, z, BLOOM_COLORS[i], br, dt))
  return { br, dt }
}

// ─── MyoBloom ─────────────────────────────────────────────────────────────────

function MyoBloom({ sig }: { sig: MyoSig }) {
  const { br, dt } = useMemo(
    () => buildBloom(sig),
    [sig.z_volume, sig.z_intensite, sig.z_structure, sig.z_recovery, sig.z_performance, sig.z_regularite]
  )
  return (
    <Svg width={MB} height={MB}>
      <Circle cx={MC} cy={MC} r={36} fill="none" stroke="#ffffff0e" strokeWidth={0.5} />
      {br.map((b, i) => (
        <Path key={i} d={b.d} stroke={b.stroke} strokeWidth={b.sw} opacity={b.op} fill="none" strokeLinecap="round" />
      ))}
      {dt.map((d, i) => (
        <Circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill={d.fill} opacity={0.85} />
      ))}
      <Circle cx={MC} cy={MC} r={4.5} fill="#ffffff" opacity={0.6} />
      <Circle cx={MC} cy={MC} r={2} fill="#ffffff" />
    </Svg>
  )
}

// ─── MyoScoreBar ──────────────────────────────────────────────────────────────

function MyoScoreBar({ score, textColor, sepColor }: { score: number; textColor: string; sepColor: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)))
  const barColor = pct >= 66 ? '#FAC775' : pct >= 33 ? '#D85A30' : '#8E8E93'
  const fillFlex = pct / 100
  const emptyFlex = 1 - fillFlex
  return (
    <View style={myoSt.scoreBar}>
      <View style={[myoSt.scoreTrack, { backgroundColor: sepColor }]}>
        {emptyFlex > 0 ? <View style={{ flex: emptyFlex }} /> : null}
        <View style={{ flex: fillFlex > 0 ? fillFlex : 0.001, backgroundColor: barColor, borderRadius: 4 }} />
      </View>
      <Text style={[myoSt.scoreNum, { color: textColor }]}>{pct}</Text>
    </View>
  )
}

// ─── MyoCard ──────────────────────────────────────────────────────────────────

function MyoCard({ sig, workoutId, colors }: {
  sig: MyoSig; workoutId: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <TouchableOpacity
      style={myoSt.card}
      onPress={() => router.push(`/workout/myo-orb?id=${workoutId}` as any)}
      activeOpacity={0.85}
    >
      <MyoBloom sig={sig} />
      <MyoScoreBar score={sig.score} textColor={colors.textPrimary} sepColor={colors.separator} />
    </TouchableOpacity>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  logo: { color: '#D85A30', fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptySubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  list: { paddingTop: 8, paddingBottom: 100 },

  card: { borderBottomWidth: 1, padding: 16, gap: 12 },

  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '700' },
  authorMeta: { flex: 1, gap: 2 },
  authorName: { fontSize: 14, fontWeight: '600' },
  ownTag: { fontWeight: '400' },
  postTime: { fontSize: 12 },
  duration: { fontSize: 13 },

  workoutTitle: { fontSize: 17, fontWeight: '700' },
  postPhoto: { width: '100%', height: 200, borderRadius: 10, marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  locationText: { fontSize: 11 },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  miniStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniStatIcon: { fontSize: 12 },
  miniStatLabel: { fontSize: 13 },

  prChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  prChipText: { fontSize: 12, fontWeight: '600' },

  actions: { flexDirection: 'row', gap: 20, paddingTop: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeIcon: { fontSize: 22, color: '#666' },
  commentIcon: { fontSize: 20 },
  actionCount: { fontSize: 14 },
})

const cm = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrapper: { maxHeight: '75%' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 8 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700' },
  closeText: { fontSize: 18 },
  loader: { marginVertical: 24 },
  emptyComments: { padding: 24, alignItems: 'center' },
  emptyCommentsText: { fontSize: 14 },
  commentList: { maxHeight: 320 },
  commentRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'flex-start' },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  commentAvatarText: { fontSize: 12, fontWeight: '700' },
  commentBody: { flex: 1, gap: 2 },
  commentAuthor: { fontSize: 12, fontWeight: '600' },
  commentContent: { fontSize: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, borderTopWidth: 1,
  },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, maxHeight: 100, borderWidth: 1,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
})

const myoSt = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  scoreBar: { width: 44, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4, gap: 6 },
  scoreTrack: {
    flex: 1, width: 10, borderRadius: 5, overflow: 'hidden',
    flexDirection: 'column',
  },
  scoreNum: { fontSize: 12, fontWeight: '700' },
})