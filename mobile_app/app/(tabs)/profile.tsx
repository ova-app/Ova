/**
 * ORAVA — Session 07
 * app/(tabs)/profile.tsx
 * Profil utilisateur — stats mensuelles, tableau PRs, déconnexion
 */

import { useCallback, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../../lib/supabase'

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserProfile {
  username: string
  full_name: string | null
}

interface MonthStats {
  workout_count: number
  total_duration_seconds: number
  total_sets: number
  total_volume: number
}

interface ExercisePR {
  exercise_name: string
  weight_kg: number
  reps: number
}

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
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
  return { start: start.toISOString(), end: end.toISOString() }
}

function monthLabel(): string {
  return new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function ProfileScreen() {
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
      .select(`
        duration_seconds,
        workout_exercises (
          workout_sets ( weight_kg, reps )
        )
      `)
      .eq('user_id', userId)
      .gte('started_at', start)
      .lte('started_at', end)

    if (!data) return { workout_count: 0, total_duration_seconds: 0, total_sets: 0, total_volume: 0 }

    let totalDuration = 0
    let totalSets = 0
    let totalVolume = 0

    for (const w of data as any[]) {
      totalDuration += w.duration_seconds ?? 0
      for (const we of (w.workout_exercises ?? []) as any[]) {
        const sets = we.workout_sets ?? []
        totalSets += sets.length
        totalVolume += sets.reduce((sum: number, s: any) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0)
      }
    }

    return { workout_count: data.length, total_duration_seconds: totalDuration, total_sets: totalSets, total_volume: totalVolume }
  }

  async function fetchPRs(userId: string): Promise<ExercisePR[]> {
    const { data } = await supabase
      .from('workouts')
      .select(`
        workout_exercises (
          exercises ( name ),
          workout_sets ( weight_kg, reps, is_pr )
        )
      `)
      .eq('user_id', userId)

    if (!data) return []

    const prMap: Record<string, ExercisePR> = {}

    for (const w of data as any[]) {
      for (const we of (w.workout_exercises ?? []) as any[]) {
        const name: string = we.exercises?.name ?? 'Exercice'
        for (const s of (we.workout_sets ?? []) as any[]) {
          if (!s.is_pr) continue
          if (!prMap[name] || s.weight_kg > prMap[name].weight_kg) {
            prMap[name] = { exercise_name: name, weight_kg: s.weight_kg, reps: s.reps }
          }
        }
      }
    }

    return Object.values(prMap)
      .sort((a, b) => b.weight_kg - a.weight_kg)
      .slice(0, 20)
  }

  async function handleSignOut() {
    Alert.alert(
      'Se déconnecter ?',
      'Tu devras te reconnecter pour accéder à Orava.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion', style: 'destructive',
          onPress: async () => { await supabase.auth.signOut() },
        },
      ]
    )
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#D85A30" size="large" />
      </View>
    )
  }

  const displayName = profile?.full_name ?? profile?.username ?? 'Athlète'
  const username = profile?.username ?? ''

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profil</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Identité */}
        <View style={styles.identityCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(displayName)}</Text>
          </View>
          <View style={styles.identityMeta}>
            <Text style={styles.displayName}>{displayName}</Text>
            {username ? <Text style={styles.username}>@{username}</Text> : null}
          </View>
        </View>

        {/* Stats du mois */}
        <Text style={styles.sectionTitle}>
          Ce mois · <Text style={styles.sectionTitleAccent}>{monthLabel()}</Text>
        </Text>

        {monthStats && monthStats.workout_count > 0 ? (
          <View style={styles.statsGrid}>
            <StatBox label="Séances" value={String(monthStats.workout_count)} />
            <StatBox label="Durée totale" value={formatDuration(monthStats.total_duration_seconds)} />
            <StatBox label="Séries" value={String(monthStats.total_sets)} />
            <StatBox
              label="Volume"
              value={monthStats.total_volume >= 1000
                ? `${(monthStats.total_volume / 1000).toFixed(1)}t`
                : `${monthStats.total_volume.toLocaleString('fr')} kg`
              }
            />
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionText}>Aucune séance ce mois-ci.</Text>
          </View>
        )}

        {/* Records personnels */}
        <Text style={styles.sectionTitle}>Records personnels</Text>

        {prs.length > 0 ? (
          <View style={styles.prTable}>
            <View style={styles.prTableHeader}>
              <Text style={[styles.prCol, styles.prColLabel, styles.prColWide]}>Exercice</Text>
              <Text style={[styles.prCol, styles.prColLabel]}>Poids</Text>
              <Text style={[styles.prCol, styles.prColLabel]}>Reps</Text>
            </View>
            {prs.map((pr, idx) => (
              <View key={idx} style={[styles.prRow, idx % 2 === 1 && styles.prRowAlt]}>
                <Text style={[styles.prCol, styles.prExerciseName, styles.prColWide]} numberOfLines={1}>
                  {pr.exercise_name}
                </Text>
                <Text style={[styles.prCol, styles.prWeight]}>
                  {pr.weight_kg % 1 === 0 ? pr.weight_kg : pr.weight_kg.toFixed(1)} kg
                </Text>
                <Text style={[styles.prCol, styles.prReps]}>{pr.reps}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptySection}>
            <Text style={styles.emptySectionText}>
              Tes records apparaîtront ici après ta première séance.
            </Text>
          </View>
        )}

        {/* Déconnexion */}
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutBtnText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

// ─── StatBox ─────────────────────────────────────────────────────────────────

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={statStyles.box}>
      <Text style={statStyles.value}>{value}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  )
}

const statStyles = StyleSheet.create({
  box: {
    width: '48%',
    backgroundColor: '#111',
    borderRadius: 14,
    padding: 16,
    alignItems: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  value: { color: '#fff', fontSize: 22, fontWeight: '700' },
  label: { color: '#555', fontSize: 12 },
})

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },

  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  headerTitle: { color: '#fff', fontSize: 28, fontWeight: '700' },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 100, gap: 8 },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#0F0F0F',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#D85A3022',
    borderWidth: 1.5,
    borderColor: '#D85A3055',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#D85A30', fontSize: 20, fontWeight: '700' },
  identityMeta: { gap: 4 },
  displayName: { color: '#fff', fontSize: 18, fontWeight: '700' },
  username: { color: '#555', fontSize: 14 },

  sectionTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 12 },
  sectionTitleAccent: { color: '#555', fontWeight: '400' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },

  emptySection: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1A1A1A',
  },
  emptySectionText: { color: '#555', fontSize: 14 },

  prTable: {
    backgroundColor: '#111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1A1A1A',
    overflow: 'hidden',
  },
  prTableHeader: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  prRow: { flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 12 },
  prRowAlt: { backgroundColor: '#0A0A0A' },
  prCol: { flex: 1, color: '#ccc', fontSize: 13 },
  prColWide: { flex: 3 },
  prColLabel: { color: '#444', fontSize: 11, fontWeight: '600' },
  prExerciseName: { color: '#fff', fontWeight: '500' },
  prWeight: { color: '#FAC775', fontWeight: '600' },
  prReps: { color: '#888' },

  signOutBtn: {
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
  },
  signOutBtnText: { color: '#888', fontSize: 16, fontWeight: '600' },
})
