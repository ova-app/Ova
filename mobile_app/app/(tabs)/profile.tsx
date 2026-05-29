import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SectionList,
  TouchableOpacity,
} from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Zap, Flame, Trophy, ChevronRight } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'
import { formatVolume } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  username: string | null
  full_name: string | null
  plan: 'free' | 'premium'
  avatar_url: string | null
  created_at: string | null
}

interface MonthStats {
  seances: number
  volumeKg: number
  streakSemaines: number
}

interface TopPR {
  exerciseName: string
  value: number
  level: 'gold' | 'silver' | 'bronze'
}

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
  title: string
  data: WorkoutRow[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS_FR = [
  'JANVIER', 'FÉVRIER', 'MARS', 'AVRIL', 'MAI', 'JUIN',
  'JUILLET', 'AOÛT', 'SEPTEMBRE', 'OCTOBRE', 'NOVEMBRE', 'DÉCEMBRE',
]
const DAYS_FR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']

function getInitiale(profile: UserProfile): string {
  const src = profile.full_name ?? profile.username ?? 'O'
  return src.charAt(0).toUpperCase()
}

function getUsername(profile: UserProfile): string {
  if (profile.username) return `@${profile.username}`
  if (profile.full_name) return profile.full_name
  return 'Athlète'
}

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

function groupByMonth(rows: WorkoutRow[]): HistorySection[] {
  const map = new Map<string, WorkoutRow[]>()
  for (const row of rows) {
    const key = sectionKeyFromDate(row.started_at)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }))
}

// ─── Sparkline mini ────────────────────────────────────────────────────────────

interface SparklineData {
  volume: number
  date: string
}

function SparklineRow({ data, colors }: { data: SparklineData[]; colors: any }) {
  if (data.length === 0) {
    return (
      <Text style={{ ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginVertical: spacing.s3 }}>
        Aucune séance récente
      </Text>
    )
  }

  const maxVol = Math.max(...data.map(d => d.volume), 1)
  const h = 48

  return (
    <View style={{ flexDirection: 'row', gap: spacing.s1, alignItems: 'flex-end', height: h, marginVertical: spacing.s3 }}>
      {data.map((item, idx) => {
        const ratio = item.volume / maxVol
        const barH = Math.max(4, h * ratio)
        return (
          <View
            key={idx}
            style={{
              flex: 1,
              height: barH,
              backgroundColor: colors.accent,
              borderRadius: radius.sm,
              opacity: 0.8,
            }}
          />
        )
      })}
    </View>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: WorkoutRow
  onPress: () => void
  colors: any
}

function HistoryRowInProfile({ item, onPress, colors }: HistoryRowProps) {
  const d = new Date(item.started_at)
  const day = d.getDate().toString()
  const weekday = DAYS_FR[d.getDay()]
  const volumeStr = formatVolume(item.total_volume_kg ?? 0)
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
                fontFamily: font.bold,
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
              { color: colors.textPrimary, fontFamily: font.bold },
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

        {/* Right : icône PR + volume + chevron */}
        <View style={styles.rightCol}>
          {item.pr_seance === 'gold' && (
            <Trophy size={14} color={colors.prGold} />
          )}
          {item.pr_seance === 'silver' && (
            <Trophy size={14} color={colors.prSilver} />
          )}
          {item.pr_seance === 'bronze' && (
            <Trophy size={14} color={colors.prBronze} />
          )}
          <Text
            style={[
              typography.body,
              {
                color: colors.textPrimary,
                fontFamily: font.bold,
                fontVariant: ['tabular-nums'],
                fontSize: 14,
              },
            ]}
          >
            {volumeStr}{' '}
            <Text
              style={{
                fontFamily: font.regular,
                color: colors.textSecondary,
                fontSize: 12,
              }}
            >
              kg
            </Text>
          </Text>
          <ChevronRight size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Animated counter ────────────────────────────────────────────────────────

const easeOutCubic = Easing.bezier(0.215, 0.61, 0.355, 1)

function AnimatedCounter({
  target,
  duration = 600,
  delay = 0,
  style,
  formatter = (v: number) => String(v),
}: {
  target: number
  duration?: number
  delay?: number
  style?: object
  formatter?: (v: number) => string
}) {
  const sv = useSharedValue(0)
  const [displayValue, setDisplayValue] = useState(() => formatter(0))

  const formatAndSet = useCallback((v: number) => {
    setDisplayValue(formatter(Math.round(v)))
  }, [formatter])

  useEffect(() => {
    sv.value = withDelay(delay, withTiming(target, { duration, easing: easeOutCubic }))
  }, [target, delay, duration])

  // Déclenche à chaque 0.5 unité au lieu de chaque entier
  // → mises à jour 2× plus fréquentes, mouvement perçu plus continu
  useAnimatedReaction(
    () => Math.round(sv.value * 2),
    (current, previous) => {
      if (current !== previous) {
        runOnJS(formatAndSet)(sv.value)
      }
    }
  )

  return <Text style={style}>{displayValue}</Text>
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ seances: 0, volumeKg: 0, streakSemaines: 0 })
  const [topPRs, setTopPRs] = useState<TopPR[]>([])
  const [followers, setFollowers] = useState<number>(0)
  const [follows, setFollows] = useState<number>(0)
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([])
  const [historySections, setHistorySections] = useState<HistorySection[]>([])
  const [deconnexionLoading, setDeconnexionLoading] = useState<boolean>(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    const uid = user.id
    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)

    // Toutes les queries indépendantes en parallèle
    const [
      profileRes,
      workoutsMonthRes,
      followerRes,
      followingRes,
      setsRes,
      last8Res,
      historyRes,
    ] = await Promise.all([
      supabase.from('users').select('id, username, full_name, plan, avatar_url, created_at').eq('id', uid).single(),
      supabase.from('workouts').select('id, total_volume_kg, started_at').eq('user_id', uid).gte('started_at', debutMois.toISOString()).order('started_at', { ascending: false }),
      supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', uid),
      supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', uid),
      supabase.from('workout_sets').select(`weight_kg, pr_charge, workout_exercises!inner(exercise_id, exercises!inner(name_fr))`).eq('workout_exercises.workouts.user_id', uid).not('pr_charge', 'is', null).order('weight_kg', { ascending: false }).limit(10),
      supabase.from('workouts').select('total_volume_kg, started_at').eq('user_id', uid).order('started_at', { ascending: false }).limit(8),
      supabase.from('workouts').select(`id, title, started_at, duration_sec, total_volume_kg, pr_seance, workout_exercises(workout_sets(id))`).eq('user_id', uid).order('started_at', { ascending: false }).limit(50),
    ])

    // Profile
    if (profileRes.data) setProfile(profileRes.data as UserProfile)

    // Followers
    setFollowers(followerRes.data?.length ?? 0)
    setFollows(followingRes.data?.length ?? 0)

    // Stats mois
    const workoutsData = workoutsMonthRes.data
    const seances = workoutsData?.length ?? 0
    const volumeKg = workoutsData?.reduce((sum, w) => sum + (w.total_volume_kg ?? 0), 0) ?? 0

    // Streak (dépend de workoutsData — query séparée inévitable)
    let streakSemaines = 0
    if (workoutsData && workoutsData.length > 0) {
      const { data: metricsData } = await supabase
        .from('workout_metrics')
        .select('data')
        .eq('workout_id', workoutsData[0].id)
        .single()
      if (metricsData?.data && typeof metricsData.data === 'object') {
        const d = metricsData.data as Record<string, unknown>
        streakSemaines = typeof d.streak_semaines === 'number' ? d.streak_semaines : 0
      }
    }

    setStats({ seances, volumeKg, streakSemaines })

    // PRs
    if (setsRes.data) {
      type SetsRow = {
        weight_kg: number | null
        pr_charge: string | null
        workout_exercises: {
          exercise_id: string
          exercises: { name_fr: string }[] | { name_fr: string }
        }[] | {
          exercise_id: string
          exercises: { name_fr: string }[] | { name_fr: string }
        }
      }
      const prs: TopPR[] = (setsRes.data as SetsRow[])
        .filter(s => s.pr_charge !== null)
        .slice(0, 3)
        .map(s => {
          const we = Array.isArray(s.workout_exercises) ? s.workout_exercises[0] : s.workout_exercises
          const exRaw = we.exercises
          const ex = Array.isArray(exRaw) ? exRaw[0] : exRaw
          return {
            exerciseName: ex.name_fr,
            value: s.weight_kg ?? 0,
            level: (s.pr_charge ?? 'bronze') as 'gold' | 'silver' | 'bronze',
          }
        })
      setTopPRs(prs)
    }

    // Sparkline
    if (last8Res.data) {
      setSparklineData(
        [...last8Res.data].reverse().map(w => ({
          volume: w.total_volume_kg ?? 0,
          date: new Date(w.started_at).toLocaleDateString('fr-FR', { day: 'numeric' }),
        }))
      )
    }

    // Historique
    if (historyRes.data) {
      const rows: WorkoutRow[] = (historyRes.data as Array<{
        id: string
        title: string
        started_at: string
        duration_sec: number | null
        total_volume_kg: number | null
        pr_seance: 'gold' | 'silver' | 'bronze' | null
        workout_exercises: Array<{ workout_sets: Array<{ id: string }> }>
      }>).map(w => ({
        id: w.id,
        title: w.title ?? '—',
        started_at: w.started_at,
        duration_sec: w.duration_sec,
        total_volume_kg: w.total_volume_kg,
        total_sets: w.workout_exercises.reduce((acc, ex) => acc + ex.workout_sets.length, 0),
        pr_seance: w.pr_seance,
      }))
      setHistorySections(groupByMonth(rows))
    }

  }, [router])

  useEffect(() => {
    void fetchProfile()
  }, [fetchProfile])

  async function seDeconnecter(): Promise<void> {
    setDeconnexionLoading(true)
    await supabase.auth.signOut()
    setDeconnexionLoading(false)
    router.replace('/auth/login')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const s = buildStyles(colors)

  const initiale = profile ? getInitiale(profile) : 'O'
  const displayName = profile ? getUsername(profile) : '@athlète'
  const isPro = profile?.plan === 'premium'

  return (
    <SafeAreaView style={[s.container]} edges={['top']}>
      <SectionList
        sections={historySections}
        keyExtractor={item => item.id}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View style={s.headerContainer}>
            {/* Avatar + Nom */}
            <View style={s.headerSection}>
              <View style={s.avatarCircle}>
                <Text style={s.avatarLetter}>{initiale}</Text>
              </View>

              <Text style={s.username}>{displayName}</Text>

              {isPro && (
                <View style={s.proBadge}>
                  <Text style={s.proBadgeText}>PRO</Text>
                </View>
              )}

              <Pressable
                style={({ pressed }) => [s.editBtn, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/edit-profile')}
              >
                <Text style={s.editBtnText}>Modifier</Text>
              </Pressable>
            </View>

            {/* Stats row */}
            <View style={s.statsCard}>
              <View style={s.statHeroRow}>
                <AnimatedCounter
                  target={stats.volumeKg}
                  duration={1400}
                  delay={0}
                  style={s.statValueHero}
                  formatter={formatVolume}
                />
                <Text style={[s.statLabel, s.statLabelAccent]}>KG CE MOIS</Text>
              </View>
              <View style={s.statSepH} />
              <View style={s.statSecondaryRow}>
                <View style={s.statCol}>
                  <AnimatedCounter target={stats.seances} duration={1000} delay={120} style={s.statValueSide} />
                  <Text style={s.statLabel}>SÉANCES</Text>
                </View>
                <View style={s.statSep} />
                <View style={s.statCol}>
                  <AnimatedCounter target={stats.streakSemaines} duration={1000} delay={120} style={s.statValueSide} />
                  <Text style={s.statLabel}>STREAK SEM.</Text>
                </View>
              </View>
            </View>

            {/* Followers */}
            <View style={s.followersRow}>
              <Pressable style={s.followerCol}>
                <AnimatedCounter target={followers} duration={800} delay={240} style={s.followerValue} />
                <Text style={s.followerLabel}>FOLLOWERS</Text>
              </Pressable>
              <Pressable style={s.followerCol}>
                <AnimatedCounter target={follows} duration={800} delay={240} style={s.followerValue} />
                <Text style={s.followerLabel}>FOLLOWS</Text>
              </Pressable>
            </View>

            {/* Sparkline */}
            <View style={s.sparklineSection}>
              <Text style={s.sparklineTitle}>8 DERNIÈRES SÉANCES</Text>
              <SparklineRow data={sparklineData} colors={colors} />
            </View>

            {/* PRs */}
            <View style={s.prsSection}>
              <Text style={s.prsTitle}>MES PRs</Text>
              {topPRs.length === 0 ? (
                <Text style={s.emptyText}>Aucun record encore. Lance une séance !</Text>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.prsScrollContent}
                >
                  {topPRs.map((pr, idx) => (
                    <View key={idx} style={s.prCard}>
                      <View style={s.prIconRow}>
                        <Text style={s.prExercise} numberOfLines={2}>
                          {pr.exerciseName.toUpperCase()}
                        </Text>
                        {pr.level === 'gold' ? (
                          <Zap size={14} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
                        ) : (
                          <Flame size={14} color={colors.accent} fill={colors.accent} strokeWidth={0} />
                        )}
                      </View>
                      <Text style={s.prValue}>
                        {pr.value}
                        <Text style={s.prUnit}> kg</Text>
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              )}
              <Pressable
                style={({ pressed }) => [s.armurerieBtn, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/prs')}
              >
                <Text style={s.armurerieBtnText}>Voir l'Armurerie →</Text>
              </Pressable>
            </View>

            {/* Menus footer */}
            <View style={s.footerMenus}>
              <Pressable
                style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/prs')}
              >
                <Text style={s.menuItemText}>Armurerie</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/analytics')}
              >
                <Text style={s.menuItemText}>Analytics</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.menuItem, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/settings')}
              >
                <Text style={s.menuItemText}>Paramètres</Text>
              </Pressable>
            </View>

            {/* Historique title */}
            <Text style={[s.sectionTitle, { marginTop: spacing.s8, marginBottom: spacing.s4 }]}>
              HISTORIQUE
            </Text>
          </View>
        )}
        ListHeaderComponentStyle={s.headerContent}
        contentContainerStyle={s.contentContainer}
        renderSectionHeader={({ section }) => (
          <Text style={s.sectionHeader}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <HistoryRowInProfile
            item={item}
            onPress={() => router.push(`/history/${item.id}` as const)}
            colors={colors}
          />
        )}
        ItemSeparatorComponent={() => null}
        SectionSeparatorComponent={() => null}
        ListFooterComponent={() => (
          <View style={s.footerContainer}>
            <Pressable
              style={({ pressed }) => [s.deconnexionBtn, pressed && { opacity: 0.6 }]}
              onPress={() => void seDeconnecter()}
              disabled={deconnexionLoading}
            >
              {deconnexionLoading ? (
                <ActivityIndicator color={colors.textTertiary} size="small" />
              ) : (
                <Text style={s.deconnexionText}>Déconnexion</Text>
              )}
            </Pressable>
          </View>
        )}
      />
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-native/no-unused-styles
function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loader: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerContent: {},
    contentContainer: {
      paddingHorizontal: spacing.s5,
    },
    headerContainer: {
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s6,
      paddingBottom: spacing.s2,
    },

    // ── Avatar section ──
    headerSection: {
      alignItems: 'center',
      marginBottom: spacing.s6,
    },
    avatarCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.s3,
    },
    avatarLetter: {
      ...typography.display,
      fontFamily: font.black,
      color: colors.background,
    },
    username: {
      ...typography.body,
      color: colors.textPrimary,
      marginBottom: spacing.s2,
      fontFamily: font.bold,
    },
    proBadge: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      height: 28,
      paddingHorizontal: spacing.s3,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.s2,
      marginBottom: spacing.s3,
    },
    proBadgeText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.background,
      letterSpacing: 1,
    },
    editBtn: {
      paddingVertical: spacing.s2,
      paddingHorizontal: spacing.s4,
      minHeight: 44,
      justifyContent: 'center',
    },
    editBtnText: {
      ...typography.body,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },

    // ── Stats card ──
    statsCard: {
      flexDirection: 'column',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s5,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
    },
    statHeroRow: {
      alignItems: 'center',
      paddingBottom: spacing.s4,
    },
    statSepH: {
      height: 1,
      backgroundColor: colors.separator,
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s4,
    },
    statSecondaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statCol: {
      flex: 1,
      alignItems: 'center',
    },
    statColCenter: {
      flex: 1,
      alignItems: 'center',
    },
    statSep: {
      width: 1,
      height: 40,
      backgroundColor: colors.separator,
    },
    statValueSide: {
      ...typography.display,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statValueHero: {
      ...typography.hero,
      color: colors.accent,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
      textAlign: 'center',
    },
    statLabelAccent: {
      color: colors.accent,
    },

    // ── Followers ──
    followersRow: {
      flexDirection: 'row',
      gap: spacing.s4,
      marginBottom: spacing.s6,
    },
    followerCol: {
      flex: 1,
      alignItems: 'center',
      padding: spacing.s4,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      minHeight: 60,
      justifyContent: 'center',
    },
    followerValue: {
      ...typography.display,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    followerLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
    },

    // ── Sparkline ──
    sparklineSection: {
      marginBottom: spacing.s6,
    },
    sparklineTitle: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s3,
    },

    // ── PRs ──
    prsSection: {
      marginBottom: spacing.s6,
    },
    prsTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      marginBottom: spacing.s4,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.s4,
    },
    prsScrollContent: {
      gap: spacing.s3,
      paddingRight: spacing.s5,
    },
    prCard: {
      minWidth: 140,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
    },
    prIconRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.s2,
    },
    prExercise: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      flex: 1,
      marginRight: spacing.s1,
    },
    prValue: {
      fontSize: 20,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: -0.5,
      fontVariant: ['tabular-nums'],
    },
    prUnit: {
      fontSize: 14,
      fontFamily: font.regular,
      color: colors.textPrimary,
    },
    armurerieBtn: {
      alignSelf: 'center',
      paddingVertical: spacing.s2,
      marginTop: spacing.s3,
      minHeight: 44,
      justifyContent: 'center',
    },
    armurerieBtnText: {
      ...typography.body,
      color: colors.accent,
    },

    // ── Footer menus ──
    footerMenus: {
      flexDirection: 'row',
      gap: spacing.s3,
      marginTop: spacing.s6,
      marginBottom: spacing.s6,
    },
    menuItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.s3,
      minHeight: 44,
      justifyContent: 'center',
    },
    menuItemText: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },

    // ── Historique ──
    sectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    sectionHeader: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      paddingTop: spacing.s6,
      paddingBottom: spacing.s3,
    },

    // ── Déconnexion ──
    footerContainer: {
      paddingVertical: spacing.s6,
      alignItems: 'center',
    },
    deconnexionBtn: {
      alignItems: 'center',
      paddingVertical: spacing.s5,
      minHeight: 44,
      justifyContent: 'center',
    },
    deconnexionText: {
      ...typography.body,
      color: colors.textSecondary,
    },
  })
}

const styles = StyleSheet.create({
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
