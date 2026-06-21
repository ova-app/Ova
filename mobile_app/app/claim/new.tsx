import React, { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { X, Dumbbell, CalendarDays, Search, Check, Target } from 'lucide-react-native'
import { log } from '@/lib/logger'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { createClaim, type ClaimScope, type ClaimType } from '@/lib/claims'
import { muscleGroupLabel } from '@/lib/muscles'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const normalize = (str: string): string => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

interface ExerciseRow {
  id: string
  name_fr: string
  muscle_group: string
}

const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7]

// Échéances proposées pour un claim de charge.
const SCOPE_OPTIONS: { value: ClaimScope; label: string }[] = [
  { value: 'next_session', label: 'Prochaine séance' },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois-ci' },
  { value: 'custom', label: 'Autre…' },
]

// jj/mm/aaaa → ms epoch (fin de journée locale). null si incomplet/invalide ou passé.
function customDeadlineMs(day: string, month: string, year: string): number | null {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null
  const d = parseInt(day, 10),
    m = parseInt(month, 10),
    y = parseInt(year, 10)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 2026 || y > 2100) return null
  const date = new Date(y, m - 1, d, 23, 59, 59, 0)
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null // date inexistante (ex. 31/02)
  return date.getTime() <= Date.now() ? null : date.getTime()
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NewClaimScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const { unit: weightUnit, toKg, toDisplay } = useWeightUnit()
  const router = useRouter()
  const s = buildStyles(colors)

  // Préremplissage depuis le moteur prédictif (ORA-079) : exercice + cible.
  const params = useLocalSearchParams<{
    exerciseId?: string
    exerciseName?: string
    target?: string
  }>()

  const [type, setType] = useState<ClaimType>('weight')

  // weight
  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [selectedExercise, setSelectedExercise] = useState<ExerciseRow | null>(
    params.exerciseId && params.exerciseName
      ? { id: params.exerciseId, name_fr: params.exerciseName, muscle_group: '' }
      : null
  )
  const [search, setSearch] = useState('')
  const [weightTarget, setWeightTarget] = useState(
    typeof params.target === 'string' ? params.target : ''
  )
  // Moment du claim de charge (échéance). Sessions = toujours 'week'.
  const [scope, setScope] = useState<ClaimScope>('next_session')
  const [customDay, setCustomDay] = useState('')
  const [customMonth, setCustomMonth] = useState('')
  const [customYear, setCustomYear] = useState('')

  // sessions
  const [sessionTarget, setSessionTarget] = useState<number>(4)

  const [isPublic, setIsPublic] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from('exercises')
        .select('id, name_fr, muscle_group')
        .order('name_fr')
      if (error) {
        log.error('[claim/new] exercises', error)
        return
      }
      const rows = (data ?? []) as ExerciseRow[]
      setExercises(rows)
      // ORA-079 — remplace le stub prérempli par la vraie ligne (libellé muscle) une fois chargée.
      if (params.exerciseId) {
        const full = rows.find((e) => e.id === params.exerciseId)
        if (full) setSelectedExercise(full)
      }
    })()
  }, [params.exerciseId])

  // Préremplissage prédictif : params.target est en kg → afficher dans l'unité courante.
  useEffect(() => {
    if (typeof params.target === 'string' && params.target) {
      setWeightTarget(String(Math.round(toDisplay(Number(params.target)))))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.target, weightUnit])

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return exercises.slice(0, 30)
    const q = normalize(search)
    return exercises.filter((e) => normalize(e.name_fr).includes(q)).slice(0, 30)
  }, [exercises, search])

  // Échéance custom valide (ms) — uniquement pertinente quand scope === 'custom'.
  const customMs = useMemo(
    () => customDeadlineMs(customDay, customMonth, customYear),
    [customDay, customMonth, customYear]
  )

  const canSubmit =
    type === 'weight'
      ? selectedExercise !== null &&
        Number(weightTarget) > 0 &&
        (scope !== 'custom' || customMs !== null)
      : sessionTarget > 0

  async function handleSubmit(): Promise<void> {
    if (!canSubmit || submitting) return
    setSubmitting(true)
    const created = await createClaim(
      type === 'weight'
        ? {
            type: 'weight',
            exerciseId: selectedExercise!.id,
            exerciseName: selectedExercise!.name_fr,
            // Saisie dans l'unité d'affichage → stockée en kg (unité canonique).
            targetValue: toKg(Number(weightTarget)),
            scope,
            customDeadlineMs: scope === 'custom' ? customMs : null,
            isPublic,
          }
        : {
            type: 'sessions',
            targetValue: sessionTarget,
            scope: 'week',
            isPublic,
          }
    )
    setSubmitting(false)
    if (created) router.back()
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable
          style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Fermer"
        >
          <X size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>NOUVEAU CLAIM</Text>
        <View style={s.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Accroche */}
          <View style={s.intro}>
            <View style={s.introIcon}>
              <Target size={18} color={colors.accent} strokeWidth={2} />
            </View>
            <Text style={s.introText}>
              Annonce un objectif vérifiable. Ova le résout avec ta vraie séance — le feed
              pronostique.
            </Text>
          </View>

          {/* Type */}
          <Text style={s.sectionLabel}>TYPE DE CLAIM</Text>
          <View style={s.typeRow}>
            <Pressable
              style={[s.typeCard, type === 'weight' && s.typeCardActive]}
              onPress={() => setType('weight')}
            >
              <Dumbbell
                size={20}
                color={type === 'weight' ? colors.accent : colors.textSecondary}
                strokeWidth={2}
              />
              <Text style={[s.typeTitle, type === 'weight' && { color: colors.textPrimary }]}>
                Charge
              </Text>
              <Text style={s.typeSub}>Un poids sur un exercice</Text>
            </Pressable>
            <Pressable
              style={[s.typeCard, type === 'sessions' && s.typeCardActive]}
              onPress={() => setType('sessions')}
            >
              <CalendarDays
                size={20}
                color={type === 'sessions' ? colors.accent : colors.textSecondary}
                strokeWidth={2}
              />
              <Text style={[s.typeTitle, type === 'sessions' && { color: colors.textPrimary }]}>
                Séances
              </Text>
              <Text style={s.typeSub}>Un nombre cette semaine</Text>
            </Pressable>
          </View>

          {/* ── Type weight ── */}
          {type === 'weight' && (
            <>
              <Text style={s.sectionLabel}>EXERCICE</Text>
              {selectedExercise ? (
                <Pressable
                  style={s.selectedExercise}
                  onPress={() => setSelectedExercise(null)}
                  accessibilityLabel="Changer d'exercice"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.selectedExerciseName}>{selectedExercise.name_fr}</Text>
                    <Text style={s.selectedExerciseMuscle}>
                      {muscleGroupLabel(selectedExercise.muscle_group).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={s.changeLabel}>Changer</Text>
                </Pressable>
              ) : (
                <>
                  <View style={s.searchBar}>
                    <Search size={16} color={colors.textTertiary} strokeWidth={2} />
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Rechercher un exercice…"
                      placeholderTextColor={colors.textTertiary}
                      style={s.searchInput}
                      autoCorrect={false}
                    />
                  </View>
                  <View style={s.exerciseList}>
                    {filteredExercises.map((ex) => (
                      <Pressable
                        key={ex.id}
                        style={({ pressed }) => [s.exerciseRow, pressed && { opacity: 0.6 }]}
                        onPress={() => {
                          setSelectedExercise(ex)
                          setSearch('')
                        }}
                      >
                        <Text style={s.exerciseRowName} numberOfLines={1}>
                          {ex.name_fr}
                        </Text>
                        <Text style={s.exerciseRowMuscle}>
                          {muscleGroupLabel(ex.muscle_group).toUpperCase()}
                        </Text>
                      </Pressable>
                    ))}
                    {filteredExercises.length === 0 && (
                      <Text style={s.emptyHint}>Aucun exercice trouvé.</Text>
                    )}
                  </View>
                </>
              )}

              {selectedExercise && (
                <>
                  <Text style={s.sectionLabel}>OBJECTIF</Text>
                  <View style={s.weightInputRow}>
                    <TextInput
                      value={weightTarget}
                      onChangeText={(t) => setWeightTarget(t.replace(/[^0-9.]/g, ''))}
                      placeholder="100"
                      placeholderTextColor={colors.textTertiary}
                      keyboardType="numeric"
                      style={s.weightInput}
                    />
                    <Text style={s.weightUnit}>{weightUnit}</Text>
                  </View>

                  <Text style={[s.sectionLabel, { marginTop: spacing.s6 }]}>MOMENT</Text>
                  <View style={s.scopeChips}>
                    {SCOPE_OPTIONS.map((opt) => {
                      const active = scope === opt.value
                      return (
                        <Pressable
                          key={opt.value}
                          style={[s.scopeChip, active && s.scopeChipActive]}
                          onPress={() => setScope(opt.value)}
                        >
                          <Text
                            style={[s.scopeChipText, active && { color: colors.background }]}
                            numberOfLines={1}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>

                  {scope === 'custom' ? (
                    <>
                      <View style={s.dateRow}>
                        <TextInput
                          value={customDay}
                          onChangeText={(t) => setCustomDay(t.replace(/[^0-9]/g, '').slice(0, 2))}
                          placeholder="JJ"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="number-pad"
                          maxLength={2}
                          style={[s.dateInput, { flex: 1 }]}
                        />
                        <Text style={s.dateSep}>/</Text>
                        <TextInput
                          value={customMonth}
                          onChangeText={(t) => setCustomMonth(t.replace(/[^0-9]/g, '').slice(0, 2))}
                          placeholder="MM"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="number-pad"
                          maxLength={2}
                          style={[s.dateInput, { flex: 1 }]}
                        />
                        <Text style={s.dateSep}>/</Text>
                        <TextInput
                          value={customYear}
                          onChangeText={(t) => setCustomYear(t.replace(/[^0-9]/g, '').slice(0, 4))}
                          placeholder="AAAA"
                          placeholderTextColor={colors.textTertiary}
                          keyboardType="number-pad"
                          maxLength={4}
                          style={[s.dateInput, { flex: 1.4 }]}
                        />
                      </View>
                      <Text style={s.scopeNote}>
                        {customDay || customMonth || customYear
                          ? customMs !== null
                            ? 'Cible à atteindre avant cette date.'
                            : 'Date invalide — format jj / mm / aaaa, dans le futur.'
                          : 'Choisis la date limite (jj / mm / aaaa).'}
                      </Text>
                    </>
                  ) : (
                    <Text style={s.scopeNote}>
                      {scope === 'next_session'
                        ? 'À ta prochaine séance avec cet exercice.'
                        : scope === 'week'
                          ? 'À atteindre dans les 7 prochains jours.'
                          : 'À atteindre dans les 30 prochains jours.'}
                    </Text>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Type sessions ── */}
          {type === 'sessions' && (
            <>
              <Text style={s.sectionLabel}>NOMBRE DE SÉANCES</Text>
              <View style={s.sessionChips}>
                {SESSION_OPTIONS.map((n) => {
                  const active = sessionTarget === n
                  return (
                    <Pressable
                      key={n}
                      style={[s.sessionChip, active && s.sessionChipActive]}
                      onPress={() => setSessionTarget(n)}
                    >
                      <Text style={[s.sessionChipText, active && { color: colors.background }]}>
                        {n}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
              <Text style={s.scopeNote}>À réaliser dans les 7 prochains jours.</Text>
            </>
          )}

          {/* Public */}
          <View style={s.publicRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.publicLabel}>Public</Text>
              <Text style={s.publicSub}>
                {isPublic
                  ? 'Visible dans le feed — les autres pronostiquent'
                  : 'Visible par toi seul'}
              </Text>
            </View>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              trackColor={{ false: colors.switchBackground, true: colors.accent }}
              thumbColor={isPublic ? colors.background : colors.textPrimary}
              ios_backgroundColor={colors.switchBackground}
            />
          </View>
        </ScrollView>

        {/* CTA */}
        <View style={s.footer}>
          <Pressable
            style={[
              s.submitBtn,
              { backgroundColor: colors.accent },
              !canSubmit && { opacity: 0.4 },
            ]}
            onPress={() => void handleSubmit()}
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <>
                <Check size={18} color={colors.background} strokeWidth={2.5} />
                <Text style={s.submitText}>Annoncer mon claim</Text>
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s4,
      paddingTop: spacing.s2,
      paddingBottom: spacing.s3,
      minHeight: touchTarget.comfort,
    },
    closeBtn: {
      width: touchTarget.min,
      height: touchTarget.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      flex: 1,
      textAlign: 'center',
    },
    headerSpacer: { width: touchTarget.min },
    scrollContent: {
      paddingHorizontal: spacing.s5,
      paddingBottom: spacing.s8,
    },
    intro: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
      marginBottom: spacing.s6,
    },
    introIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: `${colors.accent}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    introText: {
      ...typography.caption,
      color: colors.textSecondary,
      flex: 1,
      lineHeight: 17,
    },
    sectionLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s3,
    },
    typeRow: {
      flexDirection: 'row',
      gap: spacing.s3,
      marginBottom: spacing.s6,
    },
    typeCard: {
      flex: 1,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.s4,
      gap: spacing.s1,
    },
    typeCardActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}0D`,
    },
    typeTitle: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textSecondary,
      marginTop: spacing.s2,
    },
    typeSub: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      paddingHorizontal: spacing.s3,
      height: touchTarget.comfort,
      marginBottom: spacing.s3,
    },
    searchInput: {
      flex: 1,
      ...typography.body,
      color: colors.textPrimary,
      padding: 0,
    },
    exerciseList: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
      marginBottom: spacing.s4,
    },
    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s3,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      gap: spacing.s3,
    },
    exerciseRowName: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    exerciseRowMuscle: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    emptyHint: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
      padding: spacing.s4,
    },
    selectedExercise: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.accent,
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s3,
      marginBottom: spacing.s4,
    },
    selectedExerciseName: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    selectedExerciseMuscle: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 1,
    },
    changeLabel: {
      ...typography.caption,
      color: colors.accent,
      fontFamily: font.bold,
    },
    weightInputRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s3,
      gap: spacing.s2,
    },
    weightInput: {
      flex: 1,
      fontSize: 40,
      fontFamily: font.extraBold,
      color: colors.textPrimary,
      letterSpacing: -1,
      padding: 0,
      fontVariant: ['tabular-nums'],
    },
    weightUnit: {
      fontSize: 20,
      fontFamily: font.bold,
      color: colors.textSecondary,
    },
    scopeNote: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s2,
      marginBottom: spacing.s6,
    },
    sessionChips: {
      flexDirection: 'row',
      gap: spacing.s2,
    },
    sessionChip: {
      flex: 1,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
    },
    scopeChip: {
      paddingHorizontal: spacing.s4,
      height: touchTarget.min,
      borderRadius: radius.full,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scopeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    scopeChipText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
      textTransform: 'none',
      letterSpacing: 0,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      marginTop: spacing.s3,
    },
    dateInput: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.s3,
      height: touchTarget.comfort,
      textAlign: 'center',
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    dateSep: {
      ...typography.subtitle,
      color: colors.textTertiary,
    },
    sessionChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    sessionChipText: {
      fontSize: 20,
      fontFamily: font.bold,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    publicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s4,
      marginTop: spacing.s4,
    },
    publicLabel: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    publicSub: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 1,
    },
    footer: {
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s3,
      paddingBottom: spacing.s2,
    },
    submitBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s2,
      height: touchTarget.hero,
      borderRadius: radius.lg,
    },
    submitText: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.background,
      fontSize: 16,
    },
  })
}
