import React, { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import {
  useSharedValue,
  useAnimatedReaction,
  runOnJS,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import { ChevronLeft, Dumbbell, TrendingUp, Zap, Target } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography, font } from '@/constants/theme'
import { useAnalyticsData } from '@/lib/hooks/useAnalyticsData'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function deltaColor(pct: number, colors: ReturnType<typeof useTheme>['colors']): string {
  if (pct > 5) return colors.success
  if (pct < -5) return colors.error
  return colors.textSecondary
}

function deltaSign(pct: number): string {
  if (pct > 0) return `+${Math.round(pct)}%`
  if (pct < 0) return `${Math.round(pct)}%`
  return '—'
}

// ─── Animated counter ────────────────────────────────────────────────────────

const easeOutCubic = Easing.bezier(0.215, 0.61, 0.355, 1)

function AnimatedCounter({
  target,
  duration = 1200,
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

  const formatAndSet = useCallback(
    (v: number) => {
      setDisplayValue(formatter(Math.round(v)))
    },
    [formatter]
  )

  useEffect(() => {
    sv.value = withDelay(delay, withTiming(target, { duration, easing: easeOutCubic }))
  }, [target, delay, duration])

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

export default function AnalyticsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const { unit: weightUnit, toDisplay, formatVolume: formatVolumeU } = useWeightUnit()
  const router = useRouter()

  const {
    volumeRolling,
    muscleBars,
    recentPRs,
    predictions,
    totalSeances,
    totalVolumeKg,
    loading,
  } = useAnalyticsData()

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = buildStyles(colors)

  if (loading) {
    return (
      <View style={s.loader}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const prLevelColor = (level: 'gold' | 'silver' | 'bronze'): string =>
    level === 'gold' ? colors.prGold : level === 'silver' ? colors.prSilver : colors.prBronze

  return (
    <View style={s.container}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Pressable
            style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.6 }]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <ChevronLeft size={24} color={colors.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>ANALYTIQUE</Text>
          <View style={s.backBtnPlaceholder} />
        </View>

        {/* ── Métriques hero — séances + volume 90j ── */}
        <View style={s.heroCard}>
          <View style={s.heroCol}>
            <AnimatedCounter
              target={totalSeances}
              duration={1400}
              delay={0}
              style={s.heroValueAccent}
            />
            <Text style={s.heroLabel}>SÉANCES 90J</Text>
          </View>

          <View style={s.heroSep} />

          <View style={s.heroCol}>
            <AnimatedCounter
              target={totalVolumeKg}
              duration={1400}
              delay={120}
              style={s.heroValuePrimary}
              formatter={formatVolumeU}
            />
            <Text style={s.heroLabel}>{weightUnit.toUpperCase()} TOTAL 90J</Text>
          </View>
        </View>

        {/* ── Volume rolling 7 / 30 / 90j ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>VOLUME ROLLING</Text>

          {volumeRolling == null ? (
            <View style={s.emptyCard}>
              <TrendingUp size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Lance ta première séance pour voir tes stats.</Text>
            </View>
          ) : (
            <View style={s.rollingCard}>
              {/* Ligne 7j — valeur hero accent */}
              <View style={s.rollingRow}>
                <View style={s.rollingLabelBlock}>
                  <Text style={s.rollingPeriod}>7J</Text>
                  <Text
                    style={[
                      s.rollingDelta,
                      { color: deltaColor(volumeRolling.delta7vs30, colors) },
                    ]}
                  >
                    {deltaSign(volumeRolling.delta7vs30)} vs moy.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol7j}
                    duration={1200}
                    delay={0}
                    style={s.rollingValueAccent}
                    formatter={formatVolumeU}
                  />
                  <Text style={s.rollingUnit}> {weightUnit}</Text>
                </View>
              </View>

              <View style={s.rowSep} />

              {/* Ligne 30j */}
              <View style={s.rollingRow}>
                <Text style={s.rollingPeriod}>30J</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol30j}
                    duration={1200}
                    delay={80}
                    style={s.rollingValuePrimary}
                    formatter={formatVolumeU}
                  />
                  <Text style={s.rollingUnit}> {weightUnit}</Text>
                </View>
              </View>

              <View style={s.rowSep} />

              {/* Ligne 90j */}
              <View style={s.rollingRow}>
                <Text style={s.rollingPeriod}>90J</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <AnimatedCounter
                    target={volumeRolling.vol90j}
                    duration={1200}
                    delay={160}
                    style={s.rollingValuePrimary}
                    formatter={formatVolumeU}
                  />
                  <Text style={s.rollingUnit}> {weightUnit}</Text>
                </View>
              </View>

              {/* Barre visuelle 7j / 30j normalisée */}
              <View style={s.chartContainer}>
                <Text style={s.chartLabel}>RÉPARTITION 7J VS 30J</Text>
                <View style={s.barTrackWide}>
                  <View
                    style={[
                      s.barFill,
                      {
                        width:
                          volumeRolling.vol30j > 0
                            ? `${Math.min(Math.round((volumeRolling.vol7j / volumeRolling.vol30j) * 100 * (7 / 30) * 4), 100)}%`
                            : '0%',
                      },
                    ]}
                  />
                </View>
                <View style={s.chartLegendRow}>
                  <Text style={s.chartLegendItem}>
                    <Text style={{ color: colors.accent }}>■</Text>
                    {'  '}7 derniers jours
                  </Text>
                  <Text style={s.chartLegendItem}>
                    <Text style={{ color: colors.textTertiary }}>■</Text>
                    {'  '}Objectif hebdo
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* ── Muscles les plus travaillés (30j) ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>MUSCLES LES PLUS TRAVAILLÉS — 30J</Text>

          {muscleBars.length === 0 ? (
            <View style={s.emptyCard}>
              <Dumbbell size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Pas encore de données musculaires sur 30 jours.</Text>
            </View>
          ) : (
            <View style={s.muscleCard}>
              {muscleBars.map((bar, idx) => (
                <View key={idx} style={s.muscleRow}>
                  <Text style={s.muscleLabel} numberOfLines={1}>
                    {bar.label}
                  </Text>

                  <View style={s.muscleBarTrack}>
                    <View style={[s.muscleBarFill, { width: `${bar.pct}%` }]} />
                  </View>

                  <Text style={s.muscleVolume}>
                    {formatVolumeU(bar.volKg)}
                    <Text style={s.muscleVolumeUnit}> {weightUnit}</Text>
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── PRs récents ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PRs RÉCENTS</Text>

          {recentPRs.length === 0 ? (
            <View style={s.emptyCard}>
              <Zap size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>Aucun record enregistré. Lance-toi !</Text>
            </View>
          ) : (
            <View style={s.prsGrid}>
              {recentPRs.map((pr, idx) => {
                const levelColor = prLevelColor(pr.level)
                return (
                  <View key={idx} style={s.prCard}>
                    {/* Barre accent niveau */}
                    <View style={[s.prAccentBar, { backgroundColor: levelColor }]} />

                    <View style={s.prContent}>
                      {/* Nom exercice + icône */}
                      <View style={s.prHeader}>
                        <Text style={s.prExName} numberOfLines={1}>
                          {pr.exerciseName.toUpperCase()}
                        </Text>
                        <Zap size={12} color={levelColor} fill={levelColor} strokeWidth={0} />
                      </View>

                      {/* Valeur */}
                      <Text style={[s.prValue, { color: levelColor }]}>
                        {Math.round(toDisplay(pr.value))}
                        <Text style={s.prUnit}> {weightUnit}</Text>
                      </Text>

                      {/* Date */}
                      <Text style={s.prDate}>{formatShortDate(pr.seanceDate)}</Text>
                    </View>
                  </View>
                )
              })}
            </View>
          )}

          {/* Lien Armurerie */}
          <Pressable
            style={({ pressed }) => [s.armurerieBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/prs')}
            accessibilityRole="button"
            accessibilityLabel="Voir l'Armurerie complète"
          >
            <Text style={s.armurerieBtnText}>Voir l'Armurerie →</Text>
          </Pressable>
        </View>

        {/* ── Prédictions PRs ── */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>PRÉDICTIONS PR</Text>

          {predictions.length === 0 ? (
            <View style={s.emptyCard}>
              <TrendingUp size={20} color={colors.textTertiary} />
              <Text style={s.emptyText}>
                Les prédictions apparaissent après quelques séances sur un même exercice.
              </Text>
            </View>
          ) : (
            <View style={s.predictionsGrid}>
              {predictions
                .sort((a, b) => a.daysUntilPR - b.daysUntilPR)
                .map((pred) => (
                  // ORA-079 — boucle robot→humain : la prédiction (confiance ≥ 60 %) est
                  // claimable en 1 tap → /claim/new prérempli (exercice + cible).
                  <Pressable
                    key={pred.exerciseId}
                    style={({ pressed }) => [s.predCard, pressed && { opacity: 0.75 }]}
                    onPress={() =>
                      router.push({
                        pathname: '/claim/new',
                        params: {
                          exerciseId: pred.exerciseId,
                          exerciseName: pred.exerciseName,
                          target: String(pred.predictedPR),
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Claimer ${Math.round(toDisplay(pred.predictedPR))} ${weightUnit} sur ${pred.exerciseName}`}
                  >
                    <View style={[s.predAccentBar, { backgroundColor: colors.accent }]} />
                    <View style={s.predContent}>
                      <Text style={s.predExName} numberOfLines={1}>
                        {pred.exerciseName.toUpperCase()}
                      </Text>
                      <View style={s.predValueRow}>
                        <Text style={[s.predValue, { color: colors.accent }]}>
                          {Math.round(toDisplay(pred.predictedPR))}
                        </Text>
                        <Text style={s.predUnit}> {weightUnit}</Text>
                      </View>
                      <Text style={s.predDelta}>
                        +{Math.round(toDisplay(pred.delta))} {weightUnit} vs actuel
                      </Text>
                      <View style={s.predFooter}>
                        <Text style={s.predDays}>
                          {pred.daysUntilPR === 1 ? 'Demain' : `Dans ${pred.daysUntilPR}j`}
                        </Text>
                        <Text style={s.predConfidence}>
                          {Math.round(pred.confidence * 100)}% confiance
                        </Text>
                      </View>
                      <View style={s.predClaimRow}>
                        <Target size={12} color={colors.accent} strokeWidth={2.5} />
                        <Text style={s.predClaimText}>Claimer ce PR</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
            </View>
          )}
        </View>

        <View style={s.bottomSpacer} />
      </ScrollView>
    </View>
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
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: spacing.s12,
    },

    // ── Header ──
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.s12,
      paddingHorizontal: spacing.s4,
      paddingBottom: spacing.s4,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backBtnPlaceholder: {
      width: 44,
      height: 44,
    },
    headerTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      flex: 1,
      textAlign: 'center',
    },

    // ── Hero card ──
    heroCard: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s5,
      paddingHorizontal: spacing.s4,
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s6,
      alignItems: 'center',
    },
    heroCol: {
      flex: 1,
      alignItems: 'center',
    },
    heroSep: {
      width: 1,
      height: 48,
      backgroundColor: colors.separator,
    },
    // accent = métrique hero (séances)
    heroValueAccent: {
      ...typography.display,
      color: colors.accent,
      fontVariant: ['tabular-nums'] as const,
    },
    // primaire = volume
    heroValuePrimary: {
      ...typography.display,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as const,
    },
    heroLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
      textAlign: 'center',
    },

    // ── Section ──
    section: {
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s8,
    },
    sectionTitle: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s4,
    },

    // ── Empty state ──
    emptyCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      padding: spacing.s6,
      alignItems: 'center',
      gap: spacing.s3,
    },
    emptyText: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
    },

    // ── Rolling card ──
    rollingCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      padding: spacing.s4,
    },
    rollingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.s3,
    },
    rollingLabelBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
    },
    rollingPeriod: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      width: 28,
    },
    rollingDelta: {
      ...typography.caption,
      fontFamily: font.medium,
      fontVariant: ['tabular-nums'] as const,
    },
    // 7j = accent (métrique la plus récente = hero)
    rollingValueAccent: {
      ...typography.title,
      color: colors.accent,
      fontVariant: ['tabular-nums'] as const,
    },
    rollingValuePrimary: {
      ...typography.title,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'] as const,
    },
    rollingUnit: {
      ...typography.caption,
      fontFamily: font.medium,
      color: colors.textSecondary,
    },
    rowSep: {
      height: 1,
      backgroundColor: colors.separator,
    },

    // Mini chart
    chartContainer: {
      marginTop: spacing.s5,
      gap: spacing.s2,
    },
    chartLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginBottom: spacing.s1,
    },
    barTrackWide: {
      height: 6,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    barFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    chartLegendRow: {
      flexDirection: 'row',
      gap: spacing.s6,
      marginTop: spacing.s2,
    },
    chartLegendItem: {
      ...typography.caption,
      color: colors.textTertiary,
    },

    // ── Muscle bars ──
    muscleCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s3,
      paddingHorizontal: spacing.s4,
    },
    muscleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.s3,
      gap: spacing.s3,
    },
    muscleLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      width: 100,
    },
    muscleBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      overflow: 'hidden',
    },
    muscleBarFill: {
      height: '100%',
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    muscleVolume: {
      ...typography.mono,
      fontSize: 12,
      color: colors.textSecondary,
      width: 52,
      textAlign: 'right',
      fontVariant: ['tabular-nums'] as const,
    },
    muscleVolumeUnit: {
      ...typography.caption,
      fontFamily: font.mono,
      fontSize: 10,
      color: colors.textTertiary,
    },

    // ── PRs grid ──
    prsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s3,
      marginBottom: spacing.s4,
    },
    prCard: {
      width: '47%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    prAccentBar: {
      height: 3,
      width: '100%',
    },
    prContent: {
      padding: spacing.s4,
      gap: spacing.s1,
    },
    prHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.s1,
    },
    prExName: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
      flex: 1,
      marginRight: spacing.s1,
    },
    prValue: {
      ...typography.title,
      fontVariant: ['tabular-nums'] as const,
    },
    prUnit: {
      ...typography.caption,
      fontFamily: font.regular,
      color: colors.textSecondary,
    },
    prDate: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s1,
    },

    // ── Armurerie btn ──
    armurerieBtn: {
      alignSelf: 'center',
      paddingVertical: spacing.s2,
      minHeight: 44,
      justifyContent: 'center',
    },
    armurerieBtnText: {
      ...typography.body,
      color: colors.accent,
    },

    // ── Prédictions grid ──
    predictionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s3,
    },
    predCard: {
      width: '47%',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    predAccentBar: {
      height: 3,
      width: '100%',
    },
    predContent: {
      padding: spacing.s4,
      gap: spacing.s1,
    },
    predExName: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
      marginBottom: spacing.s1,
    },
    predValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
    },
    predValue: {
      ...typography.title,
      fontVariant: ['tabular-nums'] as const,
    },
    predUnit: {
      ...typography.caption,
      fontFamily: font.regular,
      color: colors.textSecondary,
    },
    predDelta: {
      ...typography.caption,
      color: colors.success,
      fontFamily: font.medium,
      marginTop: spacing.s1,
    },
    predFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.s2,
    },
    predDays: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    predConfidence: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    predClaimRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
      marginTop: spacing.s3,
      paddingTop: spacing.s2,
      borderTopWidth: 1,
      borderTopColor: colors.separator,
    },
    predClaimText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.accent,
    },

    bottomSpacer: {
      height: spacing.s12,
    },
  })
}
