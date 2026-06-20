// ─── useProfileData — couche data de l'écran Profile (ORA-034) ────────────────
// Extrait de app/(tabs)/profile.tsx : profil + stats mois + streak + top PRs +
// followers/follows + sparkline + historique. Refetch au focus + pull-to-refresh.
// L'écran ne garde que le rendu + l'action de déconnexion.

import { useCallback, useState } from 'react'
import { useRouter, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { cacheUserPlan } from '@/lib/plan'
import {
  getActiveClaim,
  getClaimVotes,
  getTrackRecord,
  getRecentFailedClaim,
  expireOverdueClaims,
  type Claim,
  type ClaimVoteCounts,
  type TrackRecord,
} from '@/lib/claims'
import { getAutoFeaturedPr, getManualFeaturedPr, type FeaturedPr } from '@/lib/featuredPr'
import { getProfilePhotos } from '@/lib/profilePhotos'
import { getProfileNameFields, type NameDisplay } from '@/lib/displayName'
import { groupByMonth, type WorkoutRow, type HistorySection } from '@/lib/hooks/useHistoryData'

export interface UserProfile {
  id: string
  username: string | null
  full_name: string | null
  plan: 'free' | 'premium'
  avatar_url: string | null
  created_at: string | null
  name_display: NameDisplay // préférence d'affichage en tête de profil (défaut 'full_name')
}

export interface MonthStats {
  seances: number
  volumeKg: number
  streakSemaines: number
}

export interface DayActivity {
  date: number // UNIX ms — début du jour
  label: string // 'L' · 'M' · 'M' · 'J' · 'V' · 'S' · 'D'
  dayNum: number // jour du mois
  hasSession: boolean
  isToday: boolean
  volumeKg: number // volume soulevé ce jour (0 si repos) — alimente le pop-up calendrier
}

export interface PhotoItem {
  id: string // clé unique : workout id (séance) ou profile_photo id (ajout manuel)
  photoUrl: string
  date: number // UNIX ms
  isPublic: boolean // false → badge « privé » sur la vignette (visible par soi seul)
  source: 'workout' | 'profile' // 'workout' → lien séance ; 'profile' → photo ajoutée à la vitrine
  workoutId: string | null // lien séance (source 'workout' uniquement)
}

export interface WeekVolume {
  weekStart: number // UNIX ms — lundi 00:00 de la semaine
  volumeKg: number
}

export interface SessionDay {
  date: number // UNIX ms — début du jour
  volumeKg: number // volume soulevé ce jour
}

export interface ProfileData {
  profile: UserProfile | null
  stats: MonthStats
  followers: number
  follows: number
  weekActivity: DayActivity[]
  weeklyVolume: WeekVolume[]
  monthSessions: SessionDay[]
  photoGallery: PhotoItem[]
  historySections: HistorySection[]
  featuredPr: FeaturedPr | null
  activeClaim: Claim | null
  recentFailedClaim: Claim | null
  claimVotes: ClaimVoteCounts
  trackRecord: TrackRecord
  refreshing: boolean
  onRefresh: () => void
}

const DAY_LABELS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']

export function useProfileData(): ProfileData {
  const router = useRouter()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ seances: 0, volumeKg: 0, streakSemaines: 0 })
  const [followers, setFollowers] = useState<number>(0)
  const [follows, setFollows] = useState<number>(0)
  const [weekActivity, setWeekActivity] = useState<DayActivity[]>([])
  const [weeklyVolume, setWeeklyVolume] = useState<WeekVolume[]>([])
  const [monthSessions, setMonthSessions] = useState<SessionDay[]>([])
  const [photoGallery, setPhotoGallery] = useState<PhotoItem[]>([])
  const [historySections, setHistorySections] = useState<HistorySection[]>([])
  const [featuredPr, setFeaturedPr] = useState<FeaturedPr | null>(null)
  const [activeClaim, setActiveClaim] = useState<Claim | null>(null)
  const [recentFailedClaim, setRecentFailedClaim] = useState<Claim | null>(null)
  const [claimVotes, setClaimVotes] = useState<ClaimVoteCounts>({
    believe: 0,
    doubt: 0,
    mine: null,
  })
  const [trackRecord, setTrackRecord] = useState<TrackRecord>({ succeeded: 0, total: 0 })
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
    const [profileRes, workoutsMonthRes, followerRes, followingRes, historyRes, photosRes] =
      await Promise.all([
        supabase
          // featured_pr volontairement HORS select : la colonne n'existe qu'après la migration
          // claims_and_featured_pr.sql — la sélectionner casserait toute la requête profil (400)
          // avant application. Le PR vedette passe par getAutoFeaturedPr (best-effort) en attendant
          // l'UI de pin manuel (Phase B), qui réintroduira la lecture de featured_pr.
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
          .from('workouts')
          .select(
            `id, title, started_at, duration_sec, total_volume_kg, photo_url, pr_seance, workout_exercises(workout_sets(id))`
          )
          .eq('user_id', uid)
          .order('started_at', { ascending: false })
          .limit(50),
        // Vitrine — requête dédiée photos, indépendante des 50 dernières séances : récupère
        // les séances AVEC photo + is_public (badge « privé »). La pile profil n'affiche qu'un
        // aperçu ; le modal vitrine montre toutes ces photos → limite large.
        supabase
          .from('workouts')
          .select('id, photo_url, started_at, is_public')
          .eq('user_id', uid)
          .not('photo_url', 'is', null)
          .order('started_at', { ascending: false })
          .limit(60),
      ])

    // Profile (name_display par défaut → 'full_name' ; affiné par la lecture isolée ci-dessous)
    if (profileRes.data) {
      setProfile({ ...(profileRes.data as object), name_display: 'full_name' } as UserProfile)
      cacheUserPlan((profileRes.data as { plan: 'free' | 'premium' }).plan) // ORA-063 — cache plan offline
    }

    // Followers
    setFollowers(followerRes.data?.length ?? 0)
    setFollows(followingRes.data?.length ?? 0)

    // ── Vitrine sociale : claim actif + pronostics + track record + PR vedette ──
    // Best-effort : un échec ici n'altère pas le reste du profil.
    await expireOverdueClaims(uid) // résout les claims 'week' dont l'échéance est passée
    const [claim, record, autoPr, recentFailed, manualPr, nameFields, profilePhotos] =
      await Promise.all([
        getActiveClaim(uid),
        getTrackRecord(uid),
        getAutoFeaturedPr(uid),
        getRecentFailedClaim(uid), // near-miss privé (ORA-081), affiché si pas de claim actif
        getManualFeaturedPr(uid), // ORA-076 — pin manuel (lecture isolée, no-op pré-migration)
        getProfileNameFields(uid), // préférence d'affichage du nom (lecture isolée, no-op pré-migration)
        getProfilePhotos(uid), // vitrine — photos ajoutées à la main (lecture isolée, [] pré-migration)
      ])
    // Préférence d'affichage : merge dans le profil déjà posé (défaut 'full_name' pré-migration).
    if (nameFields) {
      setProfile((prev) => (prev ? { ...prev, name_display: nameFields.name_display } : prev))
    }
    setActiveClaim(claim)
    setRecentFailedClaim(recentFailed)
    setTrackRecord(record)
    // Pin manuel (users.featured_pr) prioritaire sur l'auto-pick.
    setFeaturedPr(manualPr ?? autoPr)
    setClaimVotes(claim ? await getClaimVotes(claim.id, uid) : { believe: 0, doubt: 0, mine: null })

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

    // Historique + dérivés (calendrier 7j, galerie photos)
    if (historyRes.data) {
      const raw = historyRes.data as Array<{
        id: string
        title: string
        started_at: string
        duration_sec: number | null
        total_volume_kg: number | null
        photo_url: string | null
        pr_seance: 'gold' | 'silver' | 'bronze' | null
        workout_exercises: Array<{ workout_sets: Array<{ id: string }> }>
      }>

      const rows: WorkoutRow[] = raw.map((w) => ({
        id: w.id,
        title: w.title ?? '—',
        started_at: w.started_at,
        duration_sec: w.duration_sec,
        total_volume_kg: w.total_volume_kg,
        total_sets: w.workout_exercises.reduce((acc, ex) => acc + ex.workout_sets.length, 0),
        pr_seance: w.pr_seance,
      }))
      setHistorySections(groupByMonth(rows))

      // Jours avec séance — set + volume cumulé par jour (alimente calendrier semaine + mois)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayTs = today.getTime()
      const sessionDays = new Set<number>()
      const dayVolume = new Map<number, number>()
      for (const w of raw) {
        const d = new Date(w.started_at)
        d.setHours(0, 0, 0, 0)
        const ts = d.getTime()
        sessionDays.add(ts)
        dayVolume.set(ts, (dayVolume.get(ts) ?? 0) + (w.total_volume_kg ?? 0))
      }

      // Calendrier — semaine en cours, lundi → dimanche
      const dowToday = (today.getDay() + 6) % 7 // 0 = lundi
      const monday = new Date(today)
      monday.setDate(today.getDate() - dowToday)
      const week: DayActivity[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday)
        d.setDate(monday.getDate() + i)
        const ts = d.getTime()
        week.push({
          date: ts,
          label: DAY_LABELS[d.getDay()],
          dayNum: d.getDate(),
          hasSession: sessionDays.has(ts),
          isToday: ts === todayTs,
          volumeKg: dayVolume.get(ts) ?? 0,
        })
      }
      setWeekActivity(week)

      // Jours de séance (toutes dates dispo) → alimente le calendrier mois
      setMonthSessions(Array.from(dayVolume, ([date, volumeKg]) => ({ date, volumeKg })))

      // Volume hebdomadaire — 12 dernières semaines (lundi → dimanche), depuis les workouts récents.
      // Bucket par lundi 00:00 ; un graph fin du volume soulevé par semaine sous le calendrier.
      const NB_WEEKS = 12
      const WEEK_MS = 7 * 86400000
      const mondayOf = (ms: number): number => {
        const d = new Date(ms)
        d.setHours(0, 0, 0, 0)
        const dow = (d.getDay() + 6) % 7 // 0 = lundi
        d.setDate(d.getDate() - dow)
        return d.getTime()
      }
      const currentWeekStart = mondayOf(today.getTime())
      const buckets = new Map<number, number>()
      for (let i = 0; i < NB_WEEKS; i++) buckets.set(currentWeekStart - i * WEEK_MS, 0)
      for (const w of raw) {
        const key = mondayOf(new Date(w.started_at).getTime())
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + (w.total_volume_kg ?? 0))
      }
      const weekly: WeekVolume[] = []
      for (let i = NB_WEEKS - 1; i >= 0; i--) {
        const key = currentWeekStart - i * WEEK_MS
        weekly.push({ weekStart: key, volumeKg: buckets.get(key) ?? 0 })
      }
      setWeeklyVolume(weekly)
    }

    // Vitrine photos — fusion de deux sources, triées par date décroissante :
    //   • séances avec photo (requête dédiée, indépendante de l'historique limité à 50)
    //   • photos ajoutées à la main à la vitrine (profile_photos, [] pré-migration)
    // is_public → badge « privé » sur la vignette.
    const sessionPhotos: PhotoItem[] = (
      (photosRes.data ?? []) as Array<{
        id: string
        photo_url: string | null
        started_at: string
        is_public: boolean | null
      }>
    )
      .filter((w) => !!w.photo_url)
      .map((w) => ({
        id: w.id,
        photoUrl: w.photo_url as string,
        date: new Date(w.started_at).getTime(),
        isPublic: w.is_public ?? false,
        source: 'workout' as const,
        workoutId: w.id,
      }))
    const manualPhotos: PhotoItem[] = profilePhotos.map((p) => ({
      id: p.id,
      photoUrl: p.photoUrl,
      date: p.date,
      isPublic: p.isPublic,
      source: 'profile' as const,
      workoutId: null,
    }))
    setPhotoGallery([...sessionPhotos, ...manualPhotos].sort((a, b) => b.date - a.date))
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
    followers,
    follows,
    weekActivity,
    weeklyVolume,
    monthSessions,
    photoGallery,
    historySections,
    featuredPr,
    activeClaim,
    recentFailedClaim,
    claimVotes,
    trackRecord,
    refreshing,
    onRefresh,
  }
}
