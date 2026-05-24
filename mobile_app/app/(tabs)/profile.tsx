import React, { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Zap, Flame } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  id: string
  username: string | null
  full_name: string | null
  plan: 'free' | 'premium'
  avatar_url: string | null
}

interface MonthStats {
  seances: number
  volumeKg: number
  streakSemaines: number
}

interface TopPR {
  exerciseName: string
  prType: 'charge' | 'serie'
  value: number
  unit: string
  level: 'gold' | 'silver' | 'bronze'
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getInitiale(profile: UserProfile): string {
  const src = profile.full_name ?? profile.username ?? 'O'
  return src.charAt(0).toUpperCase()
}

function getUsername(profile: UserProfile): string {
  if (profile.username) return `@${profile.username}`
  if (profile.full_name) return profile.full_name
  return 'Athlète'
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ seances: 0, volumeKg: 0, streakSemaines: 0 })
  const [topPRs, setTopPRs] = useState<TopPR[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [deconnexionLoading, setDeconnexionLoading] = useState<boolean>(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async (): Promise<void> => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    const { data: profileData } = await supabase
      .from('users')
      .select('id, username, full_name, plan, avatar_url')
      .eq('id', user.id)
      .single()

    if (profileData) {
      setProfile(profileData as UserProfile)
    }

    // Séances + volume ce mois
    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)

    const { data: workoutsData } = await supabase
      .from('workouts')
      .select('id, total_volume_kg, started_at')
      .eq('user_id', user.id)
      .gte('started_at', debutMois.toISOString())
      .order('started_at', { ascending: false })

    const seances = workoutsData?.length ?? 0
    const volumeKg = workoutsData?.reduce((sum, w) => sum + (w.total_volume_kg ?? 0), 0) ?? 0

    // Streak semaines : workout_metrics.data.streak_semaines depuis la dernière séance
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

    // Top PRs — 3 records charge les plus récents
    const { data: setsData } = await supabase
      .from('workout_sets')
      .select(`
        id, weight_kg, reps, pr_charge, pr_serie,
        workout_exercises!inner(
          exercise_id,
          exercises!inner(name_fr)
        )
      `)
      .eq('workout_exercises.workouts.user_id', user.id)
      .not('pr_charge', 'is', null)
      .order('weight_kg', { ascending: false })
      .limit(10)

    if (setsData) {
      type SetsRow = {
        weight_kg: number | null
        reps: number | null
        pr_charge: string | null
        workout_exercises: {
          exercise_id: string
          exercises: { name_fr: string }[] | { name_fr: string }
        }[] | {
          exercise_id: string
          exercises: { name_fr: string }[] | { name_fr: string }
        }
      }
      const prs: TopPR[] = (setsData as SetsRow[])
        .filter(s => s.pr_charge !== null)
        .slice(0, 3)
        .map(s => {
          const we = Array.isArray(s.workout_exercises) ? s.workout_exercises[0] : s.workout_exercises
          const exRaw = we.exercises
          const ex = Array.isArray(exRaw) ? exRaw[0] : exRaw
          return {
            exerciseName: ex.name_fr,
            prType: 'charge' as const,
            value: s.weight_kg ?? 0,
            unit: 'kg',
            level: (s.pr_charge ?? 'bronze') as 'gold' | 'silver' | 'bronze',
          }
        })
      setTopPRs(prs)
    }

    setLoading(false)
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

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = buildStyles(colors)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const initiale = profile ? getInitiale(profile) : 'O'
  const displayName = profile ? getUsername(profile) : '@athlète'
  const isPro = profile?.plan === 'premium'

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Avatar + Nom ── */}
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
        </View>

        {/* ── Hero Stats ── */}
        <View style={s.statsCard}>
          {/* Séances */}
          <View style={s.statCol}>
            <Text
              style={s.statValue}
              accessibilityLabel={`${stats.seances} séances ce mois`}
            >
              {stats.seances}
            </Text>
            <Text style={s.statLabel}>SÉANCES</Text>
          </View>

          <View style={s.statSep} />

          {/* Volume — affiché en hero sur 2 lignes si >= 1000 */}
          <View style={s.statCol}>
            {stats.volumeKg >= 1000 ? (
              <>
                <Text
                  style={[s.statValueHero, { color: colors.accent }]}
                  accessibilityLabel={`${Math.floor(stats.volumeKg / 1000)} milliers kilogrammes`}
                >
                  {Math.floor(stats.volumeKg / 1000)}
                </Text>
                <Text
                  style={[s.statValueHero, { color: colors.accent }]}
                  accessibilityLabel={`${Math.round(stats.volumeKg % 1000)} kilogrammes`}
                >
                  {Math.round(stats.volumeKg % 1000).toString().padStart(3, '0')}
                </Text>
              </>
            ) : (
              <Text
                style={[s.statValue, { color: colors.accent }]}
                accessibilityLabel={`${Math.round(stats.volumeKg)} kilogrammes ce mois`}
              >
                {Math.round(stats.volumeKg)}
              </Text>
            )}
            <Text style={[s.statLabel, { color: colors.accent }]}>KG CE MOIS</Text>
          </View>

          <View style={s.statSep} />

          {/* Streak */}
          <View style={s.statCol}>
            <Text
              style={s.statValue}
              accessibilityLabel={`${stats.streakSemaines} semaines de streak`}
            >
              {stats.streakSemaines}
            </Text>
            <Text style={s.statLabel}>STREAK SEM.</Text>
          </View>
        </View>

        {/* ── PRs ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>MES PRs</Text>

          {topPRs.length === 0 ? (
            <Text style={s.emptyText}>Aucun record encore. Lance une séance !</Text>
          ) : (
            <View style={s.prsRow}>
              {topPRs.map((pr, idx) => {
                const isPrGold = pr.level === 'gold'

                return (
                  <View key={idx} style={s.prCard}>
                    {/* Icône PR en haut à droite */}
                    <View style={s.prIconRow}>
                      <Text style={s.prExercise} numberOfLines={2}>
                        {pr.exerciseName.toUpperCase()}
                      </Text>
                      {isPrGold ? (
                        <Zap size={14} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
                      ) : (
                        <Flame size={14} color={colors.accent} fill={colors.accent} strokeWidth={0} />
                      )}
                    </View>
                    <Text style={s.prValue} accessibilityLabel={`${pr.value} ${pr.unit}`}>
                      {pr.value}{' '}
                      <Text style={s.prUnit}>{pr.unit}</Text>
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          {/* Voir l'Armurerie */}
          <Pressable
            style={({ pressed }) => [s.armurerieBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/prs')}
            accessibilityRole="button"
            accessibilityLabel="Voir l'Armurerie"
          >
            <Text style={s.armurerieBtnText}>Voir l'Armurerie →</Text>
          </Pressable>
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>

      {/* ── Déconnexion ── */}
      <Pressable
        style={({ pressed }) => [s.deconnexionBtn, pressed && { opacity: 0.6 }]}
        onPress={() => void seDeconnecter()}
        disabled={deconnexionLoading}
        accessibilityRole="button"
        accessibilityLabel="Se déconnecter"
      >
        {deconnexionLoading ? (
          <ActivityIndicator color={colors.textTertiary} size="small" />
        ) : (
          <Text style={s.deconnexionText}>Déconnexion</Text>
        )}
      </Pressable>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loader: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingTop: 64,
      paddingHorizontal: spacing.s6,
      paddingBottom: spacing.s12,
    },

    // ── Header avatar ──
    headerSection: {
      alignItems: 'center',
      marginBottom: spacing.s6,
    },
    avatarCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.s3,
    },
    avatarLetter: {
      fontSize: 32,
      fontFamily: font.black,
      color: colors.background,
      lineHeight: 36,
    },
    username: {
      ...typography.title,
      color: colors.textPrimary,
      marginBottom: spacing.s2,
    },
    proBadge: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      paddingVertical: 4,
      paddingHorizontal: 12,
    },
    proBadgeText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.background,
      letterSpacing: 1,
    },

    // ── Stats card ──
    statsCard: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s5,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s6,
      alignItems: 'center',
    },
    statCol: {
      flex: 1,
      alignItems: 'center',
    },
    statSep: {
      width: 1,
      height: 48,
      backgroundColor: colors.separator,
    },
    statValue: {
      fontSize: 40,
      fontFamily: font.extraBold,
      color: colors.textPrimary,
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
      lineHeight: 44,
    },
    statValueHero: {
      fontSize: 40,
      fontFamily: font.black,
      letterSpacing: -1.5,
      fontVariant: ['tabular-nums'],
      lineHeight: 42,
    },
    statLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
      textAlign: 'center',
    },

    // ── Section PRs ──
    section: {
      marginBottom: spacing.s8,
    },
    sectionTitle: {
      ...typography.title,
      color: colors.textPrimary,
      marginBottom: spacing.s4,
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
    },
    prsRow: {
      flexDirection: 'row',
      gap: spacing.s3,
      marginBottom: spacing.s3,
    },
    prCard: {
      flex: 1,
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

    // ── Armurerie ──
    armurerieBtn: {
      alignSelf: 'flex-end',
      paddingVertical: spacing.s2,
      minHeight: 44,
      justifyContent: 'center',
    },
    armurerieBtnText: {
      ...typography.caption,
      color: colors.accent,
    },

    bottomSpacer: {
      height: spacing.s12,
    },

    // ── Déconnexion ──
    deconnexionBtn: {
      alignItems: 'center',
      paddingVertical: spacing.s5,
      paddingBottom: spacing.s8,
      minHeight: 52,
      justifyContent: 'center',
    },
    deconnexionText: {
      ...typography.body,
      color: colors.textTertiary,
    },
  })
}
