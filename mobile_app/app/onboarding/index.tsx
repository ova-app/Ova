import React from 'react'
import { View, Text, Pressable, StyleSheet, SafeAreaView, Dimensions } from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Circle, Path } from 'react-native-svg'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography } from '@/constants/theme'

const { width: LARGEUR_ECRAN } = Dimensions.get('window')
const TAILLE_ORB = 200

// ─── Placeholder Myo — arcs SVG colorés ─────────────────────────────────────

function PlaceholderMyo(): React.JSX.Element {
  return (
    <Svg width={TAILLE_ORB} height={TAILLE_ORB} viewBox="0 0 200 200">
      {/* Fond radial simulé — cercle secondaire */}
      <Circle cx={100} cy={100} r={90} fill="#12121A" />
      <Circle cx={100} cy={100} r={70} fill="#1A1A24" />

      {/* Arc famille VOLUME #f97316 — grand arc ~270° */}
      <Path
        d="M 100,14 A 86,86 0 1 1 14,100"
        stroke="#f97316"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Arc famille CHARGE #ef4444 — arc ~180° */}
      <Path
        d="M 100,28 A 72,72 0 1 1 28,100"
        stroke="#ef4444"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Arc famille STRUCTURE #8b5cf6 — arc ~120° */}
      <Path
        d="M 100,42 A 58,58 0 0 1 158,100"
        stroke="#8b5cf6"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
      {/* Arc famille RÉCUP #06b6d4 — arc ~90° */}
      <Path
        d="M 100,56 A 44,44 0 0 1 144,100"
        stroke="#06b6d4"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  )
}

// ─── Dots progression ────────────────────────────────────────────────────────

function DotsProgression({ actif }: { actif: 0 | 1 }): React.JSX.Element {
  const { colors } = useTheme()
  return (
    <View style={dotsStyles.conteneur}>
      <View
        style={[
          dotsStyles.point,
          {
            width: actif === 0 ? 8 : 6,
            height: actif === 0 ? 8 : 6,
            backgroundColor: actif === 0 ? colors.accent : colors.textTertiary,
          },
        ]}
      />
      <View
        style={[
          dotsStyles.point,
          {
            width: actif === 1 ? 8 : 6,
            height: actif === 1 ? 8 : 6,
            backgroundColor: actif === 1 ? colors.accent : colors.textTertiary,
          },
        ]}
      />
    </View>
  )
}

const dotsStyles = StyleSheet.create({
  conteneur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  point: {
    borderRadius: 9999,
  },
})

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function OnboardingIndexScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()
  const styles = buildStyles(colors)

  return (
    <SafeAreaView style={styles.conteneur}>
      {/* Top 45% — placeholder Myo */}
      <View style={styles.zoneOrb}>
        <PlaceholderMyo />
      </View>

      {/* Bas — contenu texte + actions */}
      <View style={styles.zoneContenu}>
        <Text style={styles.titre}>Chaque séance{'\n'}devient une œuvre.</Text>
        <Text style={styles.sousTitre}>
          Visualise tes entraînements comme jamais. Analyse. Progresse.
        </Text>

        <DotsProgression actif={0} />

        <View style={styles.zoneActions}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaAppuye]}
            onPress={() => router.push('/onboarding/first-set')}
            accessibilityRole="button"
            accessibilityLabel="Commencer l'onboarding"
          >
            <Text style={styles.ctaTexte}>COMMENCER</Text>
          </Pressable>

          <Pressable
            style={styles.lienConnexion}
            onPress={() => router.push('/auth/login')}
            accessibilityRole="link"
            accessibilityLabel="Se connecter"
          >
            <Text style={styles.lienTexte}>Se connecter</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    conteneur: {
      flex: 1,
      backgroundColor: colors.background,
    },
    zoneOrb: {
      flex: 45,
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoneContenu: {
      flex: 55,
      paddingHorizontal: spacing.s6,
      paddingBottom: spacing.s8,
      gap: spacing.s5,
    },
    titre: {
      fontSize: 32,
      fontFamily: 'Barlow_800ExtraBold',
      color: colors.textPrimary,
      lineHeight: 38,
      letterSpacing: -0.5,
    },
    sousTitre: {
      ...typography.body,
      color: colors.textSecondary,
      lineHeight: 22,
    },
    zoneActions: {
      flex: 1,
      justifyContent: 'flex-end',
      gap: spacing.s3,
    },
    cta: {
      height: 64,
      backgroundColor: colors.accent,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaAppuye: {
      opacity: 0.85,
    },
    ctaTexte: {
      ...typography.body,
      fontFamily: 'Barlow_700Bold',
      color: colors.background,
      letterSpacing: 1,
    },
    lienConnexion: {
      alignItems: 'center',
      paddingVertical: spacing.s3,
    },
    lienTexte: {
      ...typography.body,
      color: colors.textSecondary,
    },
  })
}
