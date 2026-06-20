import React, { useState, useEffect } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, StatusBar, ViewStyle } from 'react-native'
import Animated, { useSharedValue, withSpring, useAnimatedStyle } from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, spring, font } from '@/constants/theme'
import { toggleRecipe } from '@/constants/recipes'
import { supabase } from '@/lib/supabase'
import { cacheUserPlan } from '@/lib/plan'

// ─── ToggleRow (inline) ──────────────────────────────────────────────────────
// Custom toggle wired via toggleRecipe + Reanimated spring (snappy).
// Track 52×32, thumb 26, translate 20px (52 - 26 - 2×3 padding).

interface ToggleRowProps {
  label: string
  subtitle?: string
  value: boolean
  onChange: (v: boolean) => void
  accessibilityLabel?: string
  rowStyle?: ViewStyle
}

const THUMB_TRANSLATE = 20

function ToggleRow({
  label,
  subtitle,
  value,
  onChange,
  accessibilityLabel,
  rowStyle,
}: ToggleRowProps): React.JSX.Element {
  const { colors } = useTheme()
  const styles = toggleRecipe(value, colors)

  const progress = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, spring.snappy)
  }, [value, progress])

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRANSLATE }],
  }))

  // Override alignSelf — translateX seul positionne le thumb.
  const thumbBase = { ...styles.thumb, alignSelf: 'flex-start' as const }

  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={rowStyle ? [styles.row, rowStyle] : styles.row}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.track}>
        <Animated.View style={[thumbBase, thumbStyle]} />
      </View>
    </Pressable>
  )
}

// ─── Types ───────────────────────────────────────────────────────────────────

type WeightUnit = 'kg' | 'lbs'

interface SettingsState {
  weightUnit: WeightUnit
  vibrationEnabled: boolean
  defaultTimerSeconds: number
  publicWorkoutsByDefault: boolean
  ghostEnabled: boolean
}

const STORAGE_KEYS = {
  weightUnit: 'settings_weight_unit',
  vibration: 'settings_vibration',
  defaultTimer: 'settings_default_timer',
  publicWorkouts: 'settings_public_workouts',
  ghost: 'settings_ghost',
} as const

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [settings, setSettings] = useState<SettingsState>({
    weightUnit: 'kg',
    vibrationEnabled: true,
    defaultTimerSeconds: 90,
    publicWorkoutsByDefault: false,
    ghostEnabled: true,
  })
  const [userPlan, setUserPlan] = useState<'free' | 'premium'>('free')

  // ─── Persistance load ─────────────────────────────────────────────────────

  useEffect(() => {
    async function loadSettings(): Promise<void> {
      try {
        const [unit, vibration, timer, publicWorkouts, ghost] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.weightUnit),
          AsyncStorage.getItem(STORAGE_KEYS.vibration),
          AsyncStorage.getItem(STORAGE_KEYS.defaultTimer),
          AsyncStorage.getItem(STORAGE_KEYS.publicWorkouts),
          AsyncStorage.getItem(STORAGE_KEYS.ghost),
        ])

        setSettings((prev) => ({
          ...prev,
          weightUnit: (unit === 'lbs' ? 'lbs' : 'kg') as WeightUnit,
          vibrationEnabled: vibration !== 'false',
          defaultTimerSeconds: timer ? parseInt(timer, 10) : 90,
          publicWorkoutsByDefault: publicWorkouts === 'true',
          ghostEnabled: ghost !== 'false',
        }))
      } catch {
        // Silent fail — valeurs par défaut conservées
      }
    }

    async function loadPlan(): Promise<void> {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('users').select('plan').eq('id', user.id).single()
        if (data?.plan === 'premium') setUserPlan('premium')
        cacheUserPlan(data?.plan) // ORA-063 — cache plan offline (fenêtre ghost)
      } catch {
        // Silent fail — plan reste 'free'
      }
    }

    void loadSettings()
    void loadPlan()
  }, [])

  // ─── Persistance save ─────────────────────────────────────────────────────

  async function setWeightUnit(unit: WeightUnit): Promise<void> {
    setSettings((prev) => ({ ...prev, weightUnit: unit }))
    await AsyncStorage.setItem(STORAGE_KEYS.weightUnit, unit)
  }

  async function setVibration(enabled: boolean): Promise<void> {
    setSettings((prev) => ({ ...prev, vibrationEnabled: enabled }))
    await AsyncStorage.setItem(STORAGE_KEYS.vibration, String(enabled))
  }

  async function setPublicWorkouts(enabled: boolean): Promise<void> {
    setSettings((prev) => ({ ...prev, publicWorkoutsByDefault: enabled }))
    await AsyncStorage.setItem(STORAGE_KEYS.publicWorkouts, String(enabled))
  }

  async function setGhostEnabled(enabled: boolean): Promise<void> {
    setSettings((prev) => ({ ...prev, ghostEnabled: enabled }))
    await AsyncStorage.setItem(STORAGE_KEYS.ghost, String(enabled))
  }

  const s = buildStyles(colors)

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={s.header}>
        <Pressable
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Retour"
        >
          <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Réglages</Text>
        <View style={s.headerRight} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* GROUPE UNITÉS */}
        <Text style={s.groupLabel}>UNITÉS</Text>
        <View style={s.group}>
          <View style={s.row}>
            <Text style={s.rowLabel}>Unité de poids</Text>
            <View style={s.segmented}>
              <Pressable
                style={[s.segBtn, settings.weightUnit === 'kg' && s.segBtnActive]}
                onPress={() => setWeightUnit('kg')}
                accessibilityRole="button"
                accessibilityLabel="Kilogrammes"
                accessibilityState={{ selected: settings.weightUnit === 'kg' }}
              >
                <Text style={[s.segLabel, settings.weightUnit === 'kg' && s.segLabelActive]}>
                  kg
                </Text>
              </Pressable>
              <Pressable
                style={[s.segBtn, settings.weightUnit === 'lbs' && s.segBtnActive]}
                onPress={() => setWeightUnit('lbs')}
                accessibilityRole="button"
                accessibilityLabel="Livres"
                accessibilityState={{ selected: settings.weightUnit === 'lbs' }}
              >
                <Text style={[s.segLabel, settings.weightUnit === 'lbs' && s.segLabelActive]}>
                  lbs
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* GROUPE SÉANCE */}
        <Text style={s.groupLabel}>SÉANCE</Text>
        <View style={s.group}>
          {/* Timer par défaut */}
          <Pressable
            style={[s.row, s.rowPressable]}
            onPress={() => {
              // Navigation vers un picker timer — Phase 1
            }}
            accessibilityRole="button"
            accessibilityLabel={`Timer par défaut : ${settings.defaultTimerSeconds}s`}
          >
            <Text style={s.rowLabel}>Timer par défaut</Text>
            <View style={s.rowRight}>
              <Text style={s.rowValue}>{settings.defaultTimerSeconds}s</Text>
              <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
            </View>
          </Pressable>

          <View style={s.separator} />

          {/* Vibrations */}
          <ToggleRow
            label="Vibrations"
            value={settings.vibrationEnabled}
            onChange={setVibration}
            accessibilityLabel="Activer les vibrations"
            rowStyle={s.rowInGroup}
          />

          <View style={s.separator} />

          {/* Mode Fantôme */}
          <ToggleRow
            label="Mode Fantôme"
            subtitle="Affiche ta meilleure perf passée sur chaque exercice."
            value={settings.ghostEnabled}
            onChange={setGhostEnabled}
            accessibilityLabel="Activer le Mode Fantôme"
            rowStyle={s.rowInGroup}
          />
        </View>

        {/* GROUPE CONFIDENTIALITÉ */}
        <Text style={s.groupLabel}>CONFIDENTIALITÉ</Text>
        <View style={s.group}>
          <ToggleRow
            label="Séances publiques par défaut"
            subtitle="Chaque séance démarre privée."
            value={settings.publicWorkoutsByDefault}
            onChange={setPublicWorkouts}
            accessibilityLabel="Séances publiques par défaut"
            rowStyle={s.rowInGroup}
          />
        </View>

        {/* GROUPE MYO */}
        <Text style={s.groupLabel}>MYO</Text>
        <View style={s.group}>
          <Pressable
            style={[
              s.row,
              s.rowPressable,
              { height: undefined, minHeight: 56, paddingVertical: spacing.s3 },
            ]}
            onPress={() => router.push('/myo-glossary')}
            accessibilityRole="button"
            accessibilityLabel="Guide des variables Myo"
          >
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Guide des variables</Text>
              <Text style={[s.rowSubtitle, { color: colors.textSecondary }]}>
                53 variables · 8 familles
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
          </Pressable>
        </View>

        {/* GROUPE COMPTE */}
        <Text style={s.groupLabel}>COMPTE</Text>
        <View style={s.group}>
          {/* Modifier le profil */}
          <Pressable
            style={[s.row, s.rowPressable]}
            onPress={() => router.push('/edit-profile')}
            accessibilityRole="button"
            accessibilityLabel="Modifier le profil"
          >
            <Text style={s.rowLabel}>Modifier le profil</Text>
            <ChevronRight size={16} color={colors.textTertiary} strokeWidth={2} />
          </Pressable>

          <View style={s.separator} />

          {/* Plan Pro */}
          <View style={s.row}>
            <Text style={s.rowLabel}>Plan Pro</Text>
            <View style={userPlan === 'premium' ? s.badgePro : s.badgeFree}>
              <Text style={userPlan === 'premium' ? s.badgeLabelPro : s.badgeLabelFree}>
                {userPlan === 'premium' ? 'ACTIF' : 'FREE'}
              </Text>
            </View>
          </View>
        </View>

        <View style={s.bottomPad} />
      </ScrollView>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.s4,
      paddingTop: spacing.s12,
      paddingBottom: spacing.s4,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerTitle: {
      flex: 1,
      ...typography.subtitle,
      fontFamily: font.bold,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    headerRight: {
      width: 44,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.s4,
      paddingTop: spacing.s2,
    },
    groupLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s2,
      marginTop: spacing.s6,
      paddingHorizontal: spacing.s1,
    },
    group: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 56,
      paddingHorizontal: spacing.s4,
    },
    rowInGroup: {
      backgroundColor: 'transparent',
      borderRadius: 0,
      minHeight: 56,
    },
    rowPressable: {
      // Pressable styles inherited via Pressable wrapper
    },
    rowLabel: {
      ...typography.body,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      ...typography.caption,
      marginTop: 1,
    },
    rowRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
    },
    rowValue: {
      ...typography.body,
      color: colors.accent,
    },
    separator: {
      height: 1,
      backgroundColor: colors.separator,
      marginHorizontal: spacing.s4,
    },
    // Segmented control
    segmented: {
      flexDirection: 'row',
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      height: 32,
      padding: 2,
      gap: 2,
    },
    segBtn: {
      height: 28,
      paddingHorizontal: spacing.s3,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.full,
    },
    segBtnActive: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
    },
    segLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      letterSpacing: 0.4,
    },
    segLabelActive: {
      color: colors.background,
      fontFamily: font.bold,
    },
    // Badge plan
    badgePro: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      paddingHorizontal: spacing.s3,
      paddingVertical: 4,
    },
    badgeLabelPro: {
      ...typography.caption,
      color: colors.background,
      fontFamily: font.bold,
      letterSpacing: 0.8,
    },
    badgeFree: {
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      paddingHorizontal: spacing.s3,
      paddingVertical: 4,
    },
    badgeLabelFree: {
      ...typography.caption,
      color: colors.textSecondary,
      fontFamily: font.bold,
      letterSpacing: 0.8,
    },
    bottomPad: {
      height: spacing.s12,
    },
  })
}
