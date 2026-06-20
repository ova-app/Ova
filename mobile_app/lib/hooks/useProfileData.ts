// ─── useProfileData — couche data de l'écran Profile (ORA-034) ────────────────
// Extrait de app/(tabs)/profile.tsx : profil + stats mois + streak + top PRs +
// followers/follows + sparkline + historique. Refetch au focus + pull-to-refresh.
// L'écran ne garde que le rendu + l'action de déconnexion.

import { useCallback, useState } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { cacheUserPlan } from '@/lib/plan'
import { groupByMonth, type WorkoutRow, type HistorySection } from '@/lib/hooks/useHistoryData'

export interface UserProfile {
  id: string
  username: string | null
  full_name: string | null
  plan: 'free' | 'premium'
  avatar_url: string | null
  created_at: string | null
}

export interface MonthStats {
  seances: number
  volumeKg: number
  streakSemaines: number
}

export interface TopPR {
  exerciseName: string
  value: number
  level: 'gold' | 'silver' | 'bronze'
}

export interface SparklineData {
  volume: number
  date: string
}

export interface ProfileData {
  profile: UserProfile | null
  stats: MonthStats
  topPRs: TopPR[]
  followers: number
  follows: number
  sparklineData: SparklineData[]
  historySections: HistorySection[]
  refreshing: boolean
  onRefresh: () => void
}

export function useProfileData(): ProfileData {
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ seances: 0, volumeKg: 0, streakSemaines: 0 })
  const [topPRs, setTopPRs] = useState<TopPR[]>([])
  const [followers, setFollowers] = useState<number>(0)
  const [follows, setFollows] = useState<number>(0)
  const [sparklineData, setSparklineData] = useState<SparklineData[]>([])
  const [historySections, setHistorySections] = useState<HistorySection[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const fetchProfile = useCallback(async (): Promise<void> => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.replace('/auth/login')
      return
    }

    const uid = user.id
    const debutMois = new Date()
    debutMois.setDate(1)
    debutMois.setHours(0, 0, 0, 0)

    // Toutes les queries indépendantes en parallèle
    const [profileRes, workoutsMonthRes, followerRes, followingRes, setsRes, last8Res, historyRes] =
      await Promise.all([
        supabase
          .from('users')
          .select('id, username, full_name, plan, avatar_url, created_at')
          .eq('id', uid)
          .single(),
        supabase
          .from('workouts')
          .select('id, total_volume_kg, started_at')
          .eq('user_id', uid)
          .gte('started_at', debutMois.toISOString())
          .order('started_at', { ascending: false }),
        supabase.from('follows').select('id', { count: 'exact' }).eq('following_id', uid),
        supabase.from('follows').select('id', { count: 'exact' }).eq('follower_id', uid),
        supabase
          .from('workout_sets')
          .select(
            `weight_kg, pr_charge, workout_exercises!inner(exercise_id, exercises!inner(name_fr))`
          )
          .eq('workout_exercises.workouts.user_id', uid)
          .not('pr_charge', 'is', null)
          .order('weight_kg', { ascending: false })
          .limit(10),
        supabase
          .from('workouts')
          .select('total_volume_kg, started_at')
          .eq('user_id', uid)
          .order('started_at', { ascending: false })
          .limit(8),
        supabase
          .from('workouts')
          .select(
            `id, title, started_at, duration_sec, total_volume_kg, pr_seance, workout_exercises(workout_sets(id))`
          )
          .eq('user_id', uid)
          .order('started_at', { ascending: false })
          .limit(50),
      ])

    // Profile
    if (profileRes.data) {
      setProfile(profileRes.data as UserProfile)
      cacheUserPlan((profileRes.data as UserProfile).plan) // ORA-063 — cache plan offline
    }

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
        workout_exercises:
          | {
              exercise_id: string
              exercises: { name_fr: string }[] | { name_fr: string }
            }[]
          | {
              exercise_id: string
              exercises: { name_fr: string }[] | { name_fr: string }
            }
      }
      const prs: TopPR[] = (setsRes.data as SetsRow[])
        .filter((s) => s.pr_charge !== null)
        .slice(0, 3)
        .map((s) => {
          const we = Array.isArray(s.workout_exercises)
            ? s.workout_exercises[0]
            : s.workout_exercises
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
        [...last8Res.data].reverse().map((w) => ({
          volume: w.total_volume_kg ?? 0,
          date: new Date(w.started_at).toLocaleDateString('fr-FR', { day: 'numeric' }),
        }))
      )
    }

    // Historique
    if (historyRes.data) {
      const rows: WorkoutRow[] = (
        historyRes.data as Array<{
          id: string
          title: string
          started_at: string
          duration_sec: number | null
          total_volume_kg: number | null
          pr_seance: 'gold' | 'silver' | 'bronze' | null
          workout_exercises: Array<{ workout_sets: Array<{ id: string }> }>
        }>
      ).map((w) => ({
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

  useFocusEffect(
    useCallback(() => {
      void fetchProfile()
    }, [fetchProfile])
  )

  const onRefresh = useCallback((): void => {
    setRefreshing(true)
    void fetchProfile().finally(() => setRefreshing(false))
  }, [fetchProfile])

  return {
    profile,
    stats,
    topPRs,
    followers,
    follows,
    sparklineData,
    historySections,
    refreshing,
    onRefresh,
  }
}
