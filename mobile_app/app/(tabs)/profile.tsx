import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect, router } from 'expo-router'
import { Settings, TrendingUp } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile { username: string; full_name: string | null }

interface MonthStats {
  workout_count: number
  total_duration_seconds: number
  total_sets: number
  total_volume: number
}

interface ExercisePR { exercise_name: string; weight_kg: number; reps: number }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}min`
  if (m > 0) return `${m}min`
  return `${s}s`
}

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('')
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date()
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
  }
}

function monthLabel(): string {
  return new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors } = useTheme()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [monthStats, setMonthStats] = useState<MonthStats | null>(null)
  const [prs, setPRs] = useState<ExercisePR[]>([])
  const [loading, setLoading] = useState(true)

  useFocusEffect(useCallback(() => { fetchAll() }, []))

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const [profileResult, monthResult, prResult] = await Promise.all([
      supabase.from('users').select('username, full_name').eq('id', user.id).single(),
      fetchMonthStats(user.id),
      fetchPRs(user.id),
    ])

    if (profileResult.data) {
      setProfile({
        username: profileResult.data.username ?? 'anonyme',
        full_name: profileResult.data.full_name,
      })
    }
    setMonthStats(monthResult)
    setPRs(prResult)
    setLoading(false)
  }

  async function fetchMonthStats(userId: string): Promise<MonthStats> {
    const { start, end } = currentMonthRange()
    const { data } = await supabase
      .from('workouts')
      .select('duration_sec, workout_exercises ( workout_sets ( weight_kg, reps ) )')
      .eq('user_id', userId)
      .gte('started_at', start)
      .lte('started_at', end)

    if (!data) return { workout_count: 0, total_duration_seconds: 0, total_sets: 0, total_volume: 0 }

    let totalDuration = 0, totalSets = 0, totalVolume = 0
    for (const w of data as any[]) {
      totalDuration += w.duration_sec ?? 0
      for (const we of (w.workout_exercises ?? []) as any[]) {
        const sets = we.workout_sets ?? []
        totalSets += sets.length
        totalVolume += sets.reduce((s: number, r: any) => s + (r.weight_kg ?? 0) * (r.reps ?? 0), 0)
      }
    }
    return { workout_count: data.length, total_duration_seconds: totalDuration, total_sets: totalSets, total_volume: totalVolume }
  }

  async function fetchPRs(userId: string): Promise<ExercisePR[]> {
    const { data } = await supabase
      .from('workouts')
      .select('workout_exercises ( exercises ( name_fr ), workout_sets ( weight_kg, reps, is_pr ) )')
      .eq('user_id', userId)

    if (!data) return []

    const prMap: Record<string, ExercisePR> = {}
    for (const w of data as any[]) {
      for (const we of (w.workout_exercises ?? []) as any[]) {
        const name: string = we.exercises?.name_fr ?? 'Exercice'
        for (const s of (we.workout_sets ?? []) as any[]) {
          if (!s.is_pr) continue
          if (!prMap[name] || s.weight_kg > prMap[name].weight_kg) {
            prMap[name] = { exercise_name: name, weight_kg: s.weight_kg, reps: s.reps }
          }
        }
      }
    }
    return Object.values(prMap).sort((a, b) => b.weight_kg - a.weight_kg).slice(0, 20)
  }

  async function handleSignOut() {
    Alert.alert('Se déconnecter ?', 'Tu devras te reconnecter pour accéder à Orava.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const displayName = profile?.full_name ?? profile?.username ?? 'Athlète'
  const username = profile?.username ?? ''

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Profil</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => router.push('/analytics' as any)} style={styles.iconBtn}>
            <TrendingUp color={colors.textSecondary} size={22} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.iconBtn}>
            <Settings color={colors.textSecondary} size={22} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Identité */}
        <View style={[styles.identityCard, { backgroundColor: colors.card, borderColor: colors.separator }]}>
          <View style={[styles.avatar, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' }]}>
            <Text style={[styles.avatarText, { color: colors.accent }]}>{initials(displayName)}</Text>
          </View>
          <View style={styles.identityMeta}>
            <Text style={[styles.displayName, { color: colors.textPrimary }]}>{displayName}</Text>
            {username ? <Text style={[styles.username, { color: colors.textSecondary }]}>@{username}</Text> : null}
          </View>
        </View>

        {/* Stats du mois */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          Ce mois · <Text style={[styles.sectionTitleAccent, { color: colors.textSecondary }]}>{monthLabel()}</Text>
        </Text>

        {monthStats && monthStats.workout_count > 0 ? (
          <View style={styles.statsGrid}>
            <StatBox label="Séances" value={String(monthStats.workout_count)} colors={colors} />
            <StatBox label="Durée totale" value={formatDuration(monthStats.total_duration_seconds)} colors={colors} />
            <StatBox label="Séries" value={String(monthStats.total_sets)} colors={colors} />
            <StatBox
              label="Volume"
              value={monthStats.total_volume >= 1000
                ? `${(monthStats.total_volume / 1000).toFixed(1)}t`
                : `${monthStats.total_volume.toLocaleString('fr')} kg`}
              colors={colors}
            />
          </View>
        ) : (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>Aucune séance ce mois-ci.</Text>
          </View>
        )}

        {/* Records personnels */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Records personnels</Text>

        {prs.length > 0 ? (
          <View style={[styles.prTable, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <View style={[styles.prTableHeader, { borderBottomColor: colors.separator }]}>
              <Text style={[styles.prCol, styles.prColWide, { color: colors.textSecondary }]}>Exercice</Text>
              <Text style={[styles.prCol, { color: colors.textSecondary }]}>Poids</Text>
              <Text style={[styles.prCol, { color: colors.textSecondary }]}>Reps</Text>
            </View>
            {prs.map((pr, idx) => (
              <View key={idx} style={[
                styles.prRow,
                idx % 2 === 1 && { backgroundColor: colors.backgroundSecondary },
              ]}>
                <Text style={[styles.prCol, styles.prColWide, { color: colors.textPrimary, fontWeight: '500' }]} numberOfLines={1}>
                  {pr.exercise_name}
                </Text>
                <Text style={[styles.prCol, { color: colors.prAmber, fontWeight: '600' }]}>
                  {pr.weight_kg % 1 === 0 ? pr.weight_kg : pr.weight_kg.toFixed(1)} kg
                </Text>
                <Text style={[styles.prCol, { color: colors.textSecondary }]}>{pr.reps}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={[styles.emptySection, { backgroundColor: colors.card, borderColor: colors.separator }]}>
            <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>
              Tes records apparaîtront ici après ta première séance.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.signOutBtn, { backgroundColor: colors.backgroundSecondary }]}
          onPress={handleSignOut}
        >
          <Text style={[styles.signOutBtnText, { color: colors.textSecondary }]}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, colors }: {
  label: string; value: string; colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={[statStyles.box, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      <Text style={[statStyles.value, { color: colors.textPrimary }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  )
}

const statStyles = StyleSheet.create({
  box: { width: '48%', borderRadius: 14, padding: 16, alignItems: 'flex-start', gap: 6, borderWidth: 1 },
  value: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 12 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 28, fontWeight: '700' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 8 },
  identityCard: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 8,
  },
  avatar: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '700' },
  identityMeta: { gap: 4 },
  displayName: { fontSize: 18, fontWeight: '700' },
  username: { fontSize: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  sectionTitleAccent: { fontWeight: '400' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  emptySection: { borderRadius: 12, padding: 16, borderWidth: 1 },
  emptySectionText: { fontSize: 14 },
  prTable: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  prTableHeader: {
    flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  prRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12 },
  prCol: { flex: 1, fontSize: 13 },
  prColWide: { flex: 3 },
  signOutBtn: { marginTop: 24, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  signOutBtnText: { fontSize: 16, fontWeight: '600' },
})