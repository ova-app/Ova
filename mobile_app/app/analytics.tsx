import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { router } from 'expo-router'
import { Zap, Flame, Trophy } from 'lucide-react-native'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

type Period = '1M' | '3M' | '6M' | '1A' | 'Tout'

interface SummaryStats {
  total_workouts: number
  total_volume: number
  avg_duration_sec: number
  total_sets: number
}

interface WeeklyVolume { label: string; volume: number; is_current: boolean }

interface MuscleVolume { muscle_group: string; volume: number }

interface ExerciseProgress {
  name: string
  start_max: number
  end_max: number
  delta_pct: number
}

interface TopExercise { name: string; set_count: number; volume: number }

interface BalanceData { push: number; pull: number; upper: number; lower: number }

interface PRStats { charge: number; serie: number; rm: number }

// ─── Constantes ──────────────────────────────────────────────────────────────

const PERIODS: Period[] = ['1M', '3M', '6M', '1A', 'Tout']

const MUSCLE_LABELS: Record<string, string> = {
  pectoraux: 'Pectoraux', dos: 'Dos', epaules: 'Épaules',
  biceps: 'Biceps', triceps: 'Triceps', quadriceps: 'Quadriceps',
  ischio_jambiers: 'Ischio-jamb.', fessiers: 'Fessiers',
  mollets: 'Mollets', abdominaux: 'Abdominaux', avant_bras: 'Avant-bras',
}

const MUSCLE_GROUP_META: Record<string, { pushPull: 'push' | 'pull' | null; upperLower: 'upper' | 'lower' }> = {
  pectoraux:       { pushPull: 'push', upperLower: 'upper' },
  dos:             { pushPull: 'pull', upperLower: 'upper' },
  epaules:         { pushPull: 'push', upperLower: 'upper' },
  biceps:          { pushPull: 'pull', upperLower: 'upper' },
  triceps:         { pushPull: 'push', upperLower: 'upper' },
  quadriceps:      { pushPull: null,   upperLower: 'lower' },
  ischio_jambiers: { pushPull: null,   upperLower: 'lower' },
  fessiers:        { pushPull: null,   upperLower: 'lower' },
  mollets:         { pushPull: null,   upperLower: 'lower' },
  abdominaux:      { pushPull: null,   upperLower: 'upper' },
  avant_bras:      { pushPull: 'pull', upperLower: 'upper' },
}

const MAX_BAR_H = 80

function periodStart(period: Period): string | null {
  if (period === 'Tout') return null
  const now = new Date()
  const months = period === '1M' ? 1 : period === '3M' ? 3 : period === '6M' ? 6 : 12
  const d = new Date(now)
  d.setMonth(d.getMonth() - months)
  return d.toISOString()
}

function lerpColor(t: number): string {
  const r = Math.round(204 + (216 - 204) * t)
  const g = Math.round(204 + (90 - 204) * t)
  const b = Math.round(204 + (48 - 204) * t)
  return `rgb(${r},${g},${b})`
}

function weekMonday(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function AnalyticsScreen() {
  const { colors } = useTheme()
  const [period, setPeriod] = useState<Period>('3M')
  const [loading, setLoading] = useState(true)

  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [weeklyVolumes, setWeeklyVolumes] = useState<WeeklyVolume[]>([])
  const [muscleVolumes, setMuscleVolumes] = useState<MuscleVolume[]>([])
  const [streakCurrent, setStreakCurrent] = useState(0)
  const [streakRecord, setStreakRecord] = useState(0)
  const [miniCalendar, setMiniCalendar] = useState<boolean[]>([])
  const [progressList, setProgressList] = useState<ExerciseProgress[]>([])
  const [topExercises, setTopExercises] = useState<TopExercise[]>([])
  const [balance, setBalance] = useState<BalanceData>({ push: 0, pull: 0, upper: 0, lower: 0 })
  const [prStats, setPRStats] = useState<PRStats>({ charge: 0, serie: 0, rm: 0 })

  useEffect(() => { loadAll() }, [period])

  async function loadAll() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const start = periodStart(period)
    await Promise.all([
      loadSummaryAndWeekly(user.id, start),
      loadMuscleVolumes(user.id, start),
      loadRegularity(user.id),
      loadProgress(user.id, start),
      loadTopExercises(user.id, start),
      loadBalance(user.id, start),
      loadPRStats(user.id, start),
    ])
    setLoading(false)
  }

  // ── Résumé + Volume hebdomadaire ──────────────────────────────────────────

  async function loadSummaryAndWeekly(userId: string, start: string | null) {
    let query = supabase
      .from('workouts')
      .select('started_at, duration_sec, workout_exercises ( workout_sets ( weight_kg, reps ) )')
      .eq('user_id', userId)
      .order('started_at')

    if (start) query = query.gte('started_at', start)

    const { data } = await query
    if (!data || data.length === 0) {
      setSummary({ total_workouts: 0, total_volume: 0, avg_duration_sec: 0, total_sets: 0 })
      setWeeklyVolumes([])
      return
    }

    let totalVolume = 0, totalSets = 0, totalDuration = 0
    const weekMap: Map<string, number> = new Map()

    for (const w of data as any[]) {
      const allSets = (w.workout_exercises ?? []).flatMap((we: any) => we.workout_sets ?? [])
      const wVol = allSets.reduce((s: number, set: any) => s + (set.weight_kg ?? 0) * (set.reps ?? 0), 0)
      totalVolume += wVol
      totalSets += allSets.length
      totalDuration += w.duration_sec ?? 0

      const monday = weekMonday(new Date(w.started_at))
      const key = monday.toISOString().split('T')[0]
      weekMap.set(key, (weekMap.get(key) ?? 0) + wVol)
    }

    setSummary({
      total_workouts: data.length,
      total_volume: totalVolume,
      avg_duration_sec: Math.round(totalDuration / data.length),
      total_sets: totalSets,
    })

    // Weekly bars — cap at last 12 weeks for readability
    const today = new Date()
    const currentWeekKey = weekMonday(today).toISOString().split('T')[0]
    const sortedWeeks = Array.from(weekMap.keys()).sort()
    const lastWeeks = sortedWeeks.slice(-12)

    setWeeklyVolumes(lastWeeks.map(key => {
      const d = new Date(key)
      const label = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      return { label, volume: weekMap.get(key) ?? 0, is_current: key === currentWeekKey }
    }))
  }

  // ── Vue musculaire ────────────────────────────────────────────────────────

  async function loadMuscleVolumes(userId: string, start: string | null) {
    let query = supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps,
        workout_exercises!inner (
          workouts!inner ( user_id, started_at ),
          exercises!inner ( muscle_group )
        )
      `)
      .eq('workout_exercises.workouts.user_id', userId)

    if (start) query = query.gte('workout_exercises.workouts.started_at', start)

    const { data } = await query
    if (!data) return

    const volMap: Record<string, number> = {}
    for (const s of data as any[]) {
      const mg = s.workout_exercises?.exercises?.muscle_group
      if (!mg) continue
      volMap[mg] = (volMap[mg] ?? 0) + (s.weight_kg ?? 0) * (s.reps ?? 0)
    }

    setMuscleVolumes(
      Object.entries(volMap)
        .map(([muscle_group, volume]) => ({ muscle_group, volume }))
        .sort((a, b) => b.volume - a.volume)
    )
  }

  // ── Régularité ────────────────────────────────────────────────────────────

  async function loadRegularity(userId: string) {
    const { data } = await supabase
      .from('workouts')
      .select('started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })

    if (!data || data.length === 0) {
      setStreakCurrent(0); setStreakRecord(0); setMiniCalendar([]); return
    }

    const today = new Date()
    const workoutDays = new Set((data as any[]).map(w => new Date(w.started_at).toDateString()))
    const calendar: boolean[] = []
    for (let i = 27; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      calendar.push(workoutDays.has(d.toDateString()))
    }
    setMiniCalendar(calendar)

    const weekSet = new Set(
      (data as any[]).map(w => weekMonday(new Date(w.started_at)).toDateString())
    )
    const nowMonday = weekMonday(today)
    let current = 0, record = 0, streak = 0
    for (let i = 0; i < 104; i++) {
      const d = new Date(nowMonday)
      d.setDate(nowMonday.getDate() - i * 7)
      if (weekSet.has(d.toDateString())) {
        streak++
        if (i === 0 || i === current) current = streak
        record = Math.max(record, streak)
      } else {
        if (i > 0) break
        streak = 0
      }
    }
    setStreakCurrent(current)
    setStreakRecord(record)
  }

  // ── Progression des charges ───────────────────────────────────────────────

  async function loadProgress(userId: string, start: string | null) {
    let query = supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps,
        workout_exercises!inner (
          exercise_id,
          workouts!inner ( user_id, started_at ),
          exercises!inner ( name_fr )
        )
      `)
      .eq('workout_exercises.workouts.user_id', userId)

    if (start) query = query.gte('workout_exercises.workouts.started_at', start)

    const { data } = await query
    if (!data) return

    const byEx: Record<string, { name: string; entries: { date: string; weight: number }[] }> = {}
    for (const s of data as any[]) {
      const exId = s.workout_exercises?.exercise_id
      const name = s.workout_exercises?.exercises?.name_fr
      const date = s.workout_exercises?.workouts?.started_at
      const w = s.weight_kg ?? 0
      if (!exId || !name || !date || w === 0) continue
      if (!byEx[exId]) byEx[exId] = { name, entries: [] }
      byEx[exId].entries.push({ date, weight: w })
    }

    const result: ExerciseProgress[] = []
    for (const { name, entries } of Object.values(byEx)) {
      if (entries.length < 2) continue
      entries.sort((a, b) => a.date.localeCompare(b.date))
      const mid = Math.floor(entries.length / 2)
      const startMax = Math.max(...entries.slice(0, mid).map(e => e.weight))
      const endMax = Math.max(...entries.slice(mid).map(e => e.weight))
      if (startMax === 0) continue
      result.push({ name, start_max: startMax, end_max: endMax, delta_pct: ((endMax - startMax) / startMax) * 100 })
    }
    result.sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))
    setProgressList(result.slice(0, 10))
  }

  // ── Top exercices ─────────────────────────────────────────────────────────

  async function loadTopExercises(userId: string, start: string | null) {
    let query = supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps,
        workout_exercises!inner (
          exercise_id,
          workouts!inner ( user_id, started_at ),
          exercises!inner ( name_fr )
        )
      `)
      .eq('workout_exercises.workouts.user_id', userId)

    if (start) query = query.gte('workout_exercises.workouts.started_at', start)

    const { data } = await query
    if (!data) return

    const exMap: Record<string, { name: string; sets: number; volume: number }> = {}
    for (const s of data as any[]) {
      const exId = s.workout_exercises?.exercise_id
      const name = s.workout_exercises?.exercises?.name_fr
      if (!exId || !name) continue
      if (!exMap[exId]) exMap[exId] = { name, sets: 0, volume: 0 }
      exMap[exId].sets++
      exMap[exId].volume += (s.weight_kg ?? 0) * (s.reps ?? 0)
    }

    setTopExercises(
      Object.values(exMap)
        .map(e => ({ name: e.name, set_count: e.sets, volume: e.volume }))
        .sort((a, b) => b.set_count - a.set_count)
        .slice(0, 5)
    )
  }

  // ── Déséquilibres ─────────────────────────────────────────────────────────

  async function loadBalance(userId: string, start: string | null) {
    let query = supabase
      .from('workout_sets')
      .select(`
        weight_kg, reps,
        workout_exercises!inner (
          workouts!inner ( user_id, started_at ),
          exercises!inner ( muscle_group )
        )
      `)
      .eq('workout_exercises.workouts.user_id', userId)

    if (start) query = query.gte('workout_exercises.workouts.started_at', start)

    const { data } = await query
    if (!data) return

    let push = 0, pull = 0, upper = 0, lower = 0
    for (const s of data as any[]) {
      const mg = s.workout_exercises?.exercises?.muscle_group
      if (!mg) continue
      const meta = MUSCLE_GROUP_META[mg]
      if (!meta) continue
      const vol = (s.weight_kg ?? 0) * (s.reps ?? 0)
      if (meta.pushPull === 'push') push += vol
      if (meta.pushPull === 'pull') pull += vol
      if (meta.upperLower === 'upper') upper += vol
      if (meta.upperLower === 'lower') lower += vol
    }
    setBalance({ push, pull, upper, lower })
  }

  // ── Records battus ────────────────────────────────────────────────────────

  async function loadPRStats(userId: string, start: string | null) {
    let query = supabase
      .from('workout_sets')
      .select(`
        pr_charge, pr_serie, pr_1rm,
        workout_exercises!inner ( workouts!inner ( user_id, started_at ) )
      `)
      .eq('workout_exercises.workouts.user_id', userId)
      .eq('is_pr', true)

    if (start) query = query.gte('workout_exercises.workouts.started_at', start)

    const { data } = await query
    if (!data) return

    let charge = 0, serie = 0, rm = 0
    for (const s of data as any[]) {
      if (s.pr_charge) charge++
      if (s.pr_serie) serie++
      if (s.pr_1rm) rm++
    }
    setPRStats({ charge, serie, rm })
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  const maxVolume = muscleVolumes[0]?.volume ?? 1
  const maxWeekVol = weeklyVolumes.reduce((m, w) => Math.max(m, w.volume), 1)

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Mes stats</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Chips période */}
      <View style={[styles.periodsRow, { backgroundColor: colors.background, borderBottomColor: colors.separator }]}>
        {PERIODS.map(p => (
          <TouchableOpacity
            key={p}
            style={[
              styles.periodChip, { borderColor: colors.separator },
              period === p && { backgroundColor: colors.accent, borderColor: colors.accent },
            ]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[
              styles.periodChipText,
              { color: period === p ? '#fff' : colors.textSecondary },
              period === p && { fontWeight: '700' },
            ]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.accent} size="large" />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ── 0. Résumé de la période ── */}
          {summary && summary.total_workouts > 0 && (
            <>
              <SectionTitle label="Résumé" colors={colors} />
              <View style={styles.summaryGrid}>
                <SummaryBox value={String(summary.total_workouts)} label="Séances" colors={colors} accent />
                <SummaryBox
                  value={formatDuration(summary.avg_duration_sec)}
                  label="Durée moy." colors={colors}
                />
                <SummaryBox
                  value={summary.total_volume >= 1000
                    ? `${(summary.total_volume / 1000).toFixed(1)}t`
                    : `${Math.round(summary.total_volume).toLocaleString('fr')} kg`}
                  label="Volume total" colors={colors}
                />
                <SummaryBox value={String(summary.total_sets)} label="Séries" colors={colors} />
              </View>
            </>
          )}

          {/* ── 1. Volume par semaine ── */}
          {weeklyVolumes.length > 1 && (
            <>
              <SectionTitle label="Volume par semaine" colors={colors} />
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.barChartScroll}>
                  <View style={styles.barChart}>
                    {weeklyVolumes.map((wv, i) => {
                      const h = Math.max(4, (wv.volume / maxWeekVol) * MAX_BAR_H)
                      return (
                        <View key={i} style={styles.barColumn}>
                          <View style={styles.barWrapper}>
                            <View style={[
                              styles.bar,
                              {
                                height: h,
                                backgroundColor: wv.is_current ? colors.accent : colors.accent + '66',
                              },
                            ]} />
                          </View>
                          <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{wv.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                </ScrollView>
                <Text style={[styles.barCaption, { color: colors.textSecondary }]}>
                  Max : {maxWeekVol >= 1000
                    ? `${(maxWeekVol / 1000).toFixed(1)}t`
                    : `${Math.round(maxWeekVol).toLocaleString('fr')} kg`} / semaine
                </Text>
              </View>
            </>
          )}

          {/* ── 2. Vue musculaire ── */}
          <SectionTitle label="Vue musculaire" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            {muscleVolumes.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Pas encore de données</Text>
            ) : (
              <>
                {Object.keys(MUSCLE_LABELS).map(mg => {
                  const vol = muscleVolumes.find(m => m.muscle_group === mg)?.volume ?? 0
                  const intensity = maxVolume > 0 ? vol / maxVolume : 0
                  return (
                    <View key={mg} style={styles.muscleRow}>
                      <Text style={[styles.muscleLabel, { color: colors.textPrimary }]}>{MUSCLE_LABELS[mg]}</Text>
                      <View style={[styles.muscleBarTrack, { backgroundColor: colors.backgroundSecondary }]}>
                        <View style={[styles.muscleBarFill, {
                          width: `${intensity * 100}%`,
                          backgroundColor: vol > 0 ? lerpColor(intensity) : colors.separator,
                          minWidth: vol > 0 ? 4 : 0,
                        }]} />
                      </View>
                      {vol > 0 && (
                        <Text style={[styles.muscleVol, { color: colors.textSecondary }]}>
                          {vol >= 1000 ? `${(vol / 1000).toFixed(1)}t` : `${Math.round(vol)} kg`}
                        </Text>
                      )}
                    </View>
                  )
                })}
              </>
            )}
          </View>

          {/* ── 3. Régularité ── */}
          <SectionTitle label="Régularité" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <View style={styles.streakRow}>
              <View style={styles.streakBox}>
                <Text style={[styles.streakValue, { color: colors.accent }]}>{streakCurrent}</Text>
                <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>semaines streak actif</Text>
              </View>
              <View style={[styles.streakDivider, { backgroundColor: colors.separator }]} />
              <View style={styles.streakBox}>
                <Text style={[styles.streakValue, { color: colors.prGold }]}>{streakRecord}</Text>
                <Text style={[styles.streakLabel, { color: colors.textSecondary }]}>record de streak</Text>
              </View>
            </View>
            <View style={styles.calendar}>
              {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
                <Text key={i} style={[styles.calDay, { color: colors.textSecondary }]}>{d}</Text>
              ))}
              {miniCalendar.map((active, i) => (
                <View key={i} style={[
                  styles.calCell,
                  { backgroundColor: active ? colors.accent : colors.backgroundSecondary },
                ]} />
              ))}
            </View>
          </View>

          {/* ── 4. Progression des charges ── */}
          <SectionTitle label="Progression des charges" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            {progressList.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                Pas assez de données sur cette période
              </Text>
            ) : (
              progressList.map((ex, idx) => (
                <View key={idx} style={[
                  styles.progressRow,
                  idx > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth },
                ]}>
                  <Text style={[styles.progressName, { color: colors.textPrimary }]} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <View style={styles.progressValues}>
                    <Text style={[styles.progressWeight, { color: colors.textSecondary }]}>
                      {ex.start_max} → {ex.end_max} kg
                    </Text>
                    <Text style={[
                      styles.deltaText,
                      { color: ex.delta_pct >= 0 ? '#34C759' : '#FF3B30' },
                    ]}>
                      {ex.delta_pct >= 0 ? '↑' : '↓'} {Math.abs(ex.delta_pct).toFixed(1)}%
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── 5. Top exercices ── */}
          {topExercises.length > 0 && (
            <>
              <SectionTitle label="Exercices les plus pratiqués" colors={colors} />
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
                {topExercises.map((ex, idx) => {
                  const barPct = topExercises[0].set_count > 0
                    ? (ex.set_count / topExercises[0].set_count) * 100
                    : 0
                  return (
                    <View key={idx} style={[
                      styles.topExRow,
                      idx > 0 && { borderTopColor: colors.separator, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}>
                      <View style={styles.topExMeta}>
                        <View style={styles.topExNameRow}>
                          <Text style={[styles.topExRank, { color: colors.textSecondary }]}>
                            {idx + 1}.
                          </Text>
                          <Text style={[styles.topExName, { color: colors.textPrimary }]} numberOfLines={1}>
                            {ex.name}
                          </Text>
                        </View>
                        <View style={[styles.topExBar, { backgroundColor: colors.backgroundSecondary }]}>
                          <View style={[styles.topExFill, {
                            width: `${barPct}%`,
                            backgroundColor: colors.accent + '88',
                          }]} />
                        </View>
                      </View>
                      <View style={styles.topExStats}>
                        <Text style={[styles.topExSets, { color: colors.accent }]}>
                          {ex.set_count} séries
                        </Text>
                        <Text style={[styles.topExVol, { color: colors.textSecondary }]}>
                          {ex.volume >= 1000
                            ? `${(ex.volume / 1000).toFixed(1)}t`
                            : `${Math.round(ex.volume).toLocaleString('fr')} kg`}
                        </Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            </>
          )}

          {/* ── 6. Déséquilibres ── */}
          <SectionTitle label="Déséquilibres" colors={colors} />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <BalanceBar labelA="Push" valueA={balance.push} labelB="Pull" valueB={balance.pull} colors={colors} />
            <View style={[styles.balanceDivider, { backgroundColor: colors.separator }]} />
            <BalanceBar labelA="Haut" valueA={balance.upper} labelB="Bas" valueB={balance.lower} colors={colors} />
          </View>

          {/* ── 7. Records battus ── */}
          {(prStats.charge + prStats.serie + prStats.rm) > 0 && (
            <>
              <SectionTitle label="Records battus sur la période" colors={colors} />
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator, flexDirection: 'row' }]}>
                <PRStatBox icon={<Zap size={20} color="#FFD700" fill="#FFD700" />} count={prStats.charge} label="PR Charge" colors={colors} />
                <View style={[styles.prStatDivider, { backgroundColor: colors.separator }]} />
                <PRStatBox icon={<Flame size={20} color={colors.accent} fill={colors.accent} />} count={prStats.serie} label="PR Série" colors={colors} />
                <View style={[styles.prStatDivider, { backgroundColor: colors.separator }]} />
                <PRStatBox icon={<Trophy size={20} color={colors.prAmber} fill={colors.prAmber} />} count={prStats.rm} label="PR 1RM" colors={colors} />
              </View>
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryBox({ value, label, colors, accent }: {
  value: string; label: string; accent?: boolean
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={[
      summaryStyles.box,
      { backgroundColor: colors.card, borderColor: colors.separator },
      accent && { borderColor: colors.accent + '50', backgroundColor: colors.accent + '12' },
    ]}>
      <Text style={[summaryStyles.value, { color: accent ? colors.accent : colors.textPrimary }]}>{value}</Text>
      <Text style={[summaryStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

const summaryStyles = StyleSheet.create({
  box: { width: '48%', borderRadius: 14, padding: 16, borderWidth: 1, gap: 4 },
  value: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 12 },
})

function PRStatBox({ icon, count, label, colors }: {
  icon: React.ReactNode; count: number; label: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={styles.prStatBox}>
      {icon}
      <Text style={[styles.prStatCount, { color: colors.textPrimary }]}>{count}</Text>
      <Text style={[styles.prStatLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

function BalanceBar({ labelA, valueA, labelB, valueB, colors }: {
  labelA: string; valueA: number; labelB: string; valueB: number
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const total = valueA + valueB
  const pctA = total > 0 ? (valueA / total) * 100 : 50
  const pctB = 100 - pctA
  return (
    <View style={styles.balanceRow}>
      <View style={styles.balanceLabelLeft}>
        <Text style={[styles.balanceLabel, { color: colors.accent }]}>{labelA}</Text>
        <Text style={[styles.balanceVal, { color: colors.textSecondary }]}>{pctA.toFixed(0)}%</Text>
      </View>
      <View style={[styles.balanceTrack, { backgroundColor: colors.backgroundSecondary }]}>
        <View style={[styles.balanceFillA, { width: `${pctA}%`, backgroundColor: colors.accent }]} />
        <View style={[styles.balanceFillB, { width: `${pctB}%`, backgroundColor: colors.prPurple }]} />
      </View>
      <View style={styles.balanceLabelRight}>
        <Text style={[styles.balanceVal, { color: colors.textSecondary }]}>{pctB.toFixed(0)}%</Text>
        <Text style={[styles.balanceLabel, { color: colors.prPurple }]}>{labelB}</Text>
      </View>
    </View>
  )
}

function SectionTitle({ label, colors }: { label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{label}</Text>
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '700' },

  periodsRow: {
    flexDirection: 'row', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  periodChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  periodChipText: { fontSize: 13 },

  loader: { flex: 1 },
  content: { padding: 16, gap: 8 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 12, marginBottom: 4, paddingHorizontal: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  // Summary grid
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  // Weekly bar chart
  barChartScroll: { marginHorizontal: -4 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 4, paddingBottom: 4 },
  barColumn: { alignItems: 'center', gap: 4, width: 40 },
  barWrapper: { height: MAX_BAR_H, justifyContent: 'flex-end' },
  bar: { width: 28, borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 9, textAlign: 'center' },
  barCaption: { fontSize: 11, textAlign: 'right', marginTop: -4 },

  // Muscle view
  muscleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  muscleLabel: { fontSize: 13, width: 100 },
  muscleBarTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  muscleBarFill: { height: '100%', borderRadius: 4 },
  muscleVol: { fontSize: 11, width: 52, textAlign: 'right' },

  // Streak
  streakRow: { flexDirection: 'row', alignItems: 'center' },
  streakBox: { flex: 1, alignItems: 'center', gap: 4 },
  streakValue: { fontSize: 36, fontWeight: '700' },
  streakLabel: { fontSize: 12, textAlign: 'center' },
  streakDivider: { width: 1, height: 48, marginHorizontal: 8 },

  // Calendar
  calendar: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  calDay: { width: 32, textAlign: 'center', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  calCell: { width: 32, height: 32, borderRadius: 6 },

  // Progress
  progressRow: { paddingVertical: 10, gap: 4 },
  progressName: { fontSize: 14, fontWeight: '600' },
  progressValues: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressWeight: { fontSize: 13 },
  deltaText: { fontSize: 13, fontWeight: '700' },

  // Top exercises
  topExRow: { paddingVertical: 10, gap: 6 },
  topExMeta: { gap: 4 },
  topExNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topExRank: { fontSize: 13, width: 18 },
  topExName: { fontSize: 14, fontWeight: '600', flex: 1 },
  topExBar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  topExFill: { height: '100%', borderRadius: 2 },
  topExStats: { flexDirection: 'row', justifyContent: 'space-between' },
  topExSets: { fontSize: 13, fontWeight: '600' },
  topExVol: { fontSize: 12 },

  // Balance
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceLabelLeft: { width: 52, alignItems: 'flex-start', gap: 2 },
  balanceLabelRight: { width: 52, alignItems: 'flex-end', gap: 2 },
  balanceLabel: { fontSize: 13, fontWeight: '700' },
  balanceVal: { fontSize: 11 },
  balanceTrack: { flex: 1, height: 12, borderRadius: 6, overflow: 'hidden', flexDirection: 'row' },
  balanceFillA: { height: '100%' },
  balanceFillB: { height: '100%' },
  balanceDivider: { height: StyleSheet.hairlineWidth },

  // PR stats
  prStatBox: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  prStatCount: { fontSize: 28, fontWeight: '700' },
  prStatLabel: { fontSize: 11, textAlign: 'center' },
  prStatDivider: { width: StyleSheet.hairlineWidth, marginVertical: 8 },
})