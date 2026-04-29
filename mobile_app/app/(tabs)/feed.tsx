import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  has_pr_charge: boolean
  has_pr_serie: boolean
  has_pr_1rm: boolean
  like_count: number
  comment_count: number
  is_liked: boolean
  is_own: boolean
}

interface Comment {
  id: string
  content: string
  created_at: string
  user_id: string
  display_name: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
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
        id, title, started_at, duration_sec, user_id,
        workout_exercises (
          workout_sets ( weight_kg, reps, is_pr, pr_charge, pr_serie, pr_1rm )
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
      const allSets = (w.workout_exercises ?? []).flatMap((we: any) => we.workout_sets ?? [])
      const profile = profileMap[w.user_id]
      const username = profile?.username ?? 'anonyme'

      return {
        id: w.id,
        title: w.title ?? 'Séance',
        started_at: w.started_at,
        duration_sec: w.duration_sec ?? 0,
        user_id: w.user_id,
        username,
        display_name: profile?.full_name ?? username,
        exercise_count: (w.workout_exercises ?? []).length,
        total_sets: allSets.length,
        total_volume: allSets.reduce((sum: number, s: any) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0),
        pr_count: allSets.filter((s: any) => s.is_pr).length,
        has_pr_charge: allSets.some((s: any) => s.pr_charge === true),
        has_pr_serie: allSets.some((s: any) => s.pr_serie === true),
        has_pr_1rm: allSets.some((s: any) => s.pr_1rm === true),
        like_count: (w.likes ?? []).length,
        comment_count: (w.comments ?? []).length,
        is_liked: (w.likes ?? []).some((l: any) => l.user_id === user.id),
        is_own: w.user_id === user.id,
      }
    })

    setPosts(feedPosts)
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
    </View>
  )
}

// ─── PostCard ─────────────────────────────────────────────────────────────────

function PostCard({ post, colors, onLike, onComment, onPress }: {
  post: FeedPost
  colors: ReturnType<typeof useTheme>['colors']
  onLike: () => void
  onComment: () => void
  onPress: () => void
}) {
  const hasPrTypes = post.has_pr_charge || post.has_pr_serie || post.has_pr_1rm
  const showGenericPr = post.pr_count > 0 && !hasPrTypes

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

      {/* Titre */}
      <Text style={[styles.workoutTitle, { color: colors.textPrimary }]}>{post.title}</Text>

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
        {(hasPrTypes || showGenericPr) && (
          <View style={[styles.prChip, { backgroundColor: colors.prAmber + '18' }]}>
            {post.has_pr_charge && <Zap size={12} color="#FFD700" fill="#FFD700" />}
            {post.has_pr_serie && <Flame size={12} color={colors.accent} fill={colors.accent} />}
            {post.has_pr_1rm && <Trophy size={12} color={colors.prAmber} fill={colors.prAmber} />}
            {showGenericPr && (
              <Text style={[styles.prChipText, { color: colors.prAmber }]}>
                {post.pr_count} PR
              </Text>
            )}
          </View>
        )}
      </View>

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
            <Text style={[styles.actionCount, { color: colors.textSecondary }, post.is_liked && { color: colors.accent }]}>
              {post.like_count}
            </Text>
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

// ─── MiniStat ─────────────────────────────────────────────────────────────────

function MiniStat({ icon, label, colors }: {
  icon: string; label: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniStatIcon, { color: colors.textSecondary }]}>{icon}</Text>
      <Text style={[styles.miniStatLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
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