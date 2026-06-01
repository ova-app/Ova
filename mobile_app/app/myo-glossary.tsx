import React, { useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft } from 'lucide-react-native'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Data ────────────────────────────────────────────────────────────────────

interface DimEntry {
  name: string
  desc: string
}

interface FamilyEntry {
  name: string
  color: string
  description: string
  dims: DimEntry[]
  grid?: boolean
}

const FAMILIES: FamilyEntry[] = [
  {
    name: 'VOLUME',
    color: '#f97316',
    description: 'Quantité totale de travail produite dans la séance.',
    dims: [
      { name: 'Vol. total', desc: 'Σ poids × reps sur tous les sets' },
      { name: 'Vol. sets', desc: 'Nombre total de sets effectués' },
      { name: 'Vol./rep', desc: 'Volume total / nombre total de reps' },
      { name: 'Vol./set', desc: 'Volume total / nombre de sets' },
      { name: 'Tendance', desc: 'Δ volume vs séances précédentes (rolling)' },
      { name: 'Densité', desc: 'Volume total rapporté à la durée de séance' },
    ],
  },
  {
    name: 'INTENSITÉ',
    color: '#ef4444',
    description: 'Effort relatif déployé pendant la séance.',
    dims: [
      { name: 'RPE moy.', desc: 'Moyenne des RPE sur tous les sets' },
      { name: 'Facteur int.', desc: 'Poids utilisé vs 1RM Epley estimé' },
      { name: 'RPE pic', desc: 'Effort maximal atteint dans la séance' },
      { name: 'Constance', desc: '1 − (σ RPE / μ RPE) — faible variance = score haut' },
      { name: 'Int. relative', desc: 'Score composite vs ton historique personnel' },
    ],
  },
  {
    name: 'STRUCTURE',
    color: '#8b5cf6',
    description: 'Organisation logique et cohérence de la séance.',
    dims: [
      { name: 'Nb exercices', desc: 'Nombre d\'exercices distincts' },
      { name: 'Sets/exercice', desc: 'Nombre moyen de sets par exercice' },
      { name: 'Variété', desc: 'Diversité des groupes musculaires ciblés' },
      { name: 'Score struct.', desc: 'Cohérence de l\'enchaînement push/pull/legs' },
      { name: 'Rég. repos', desc: '1 − (σ repos / μ repos) entre sets' },
    ],
  },
  {
    name: 'RÉCUP',
    color: '#06b6d4',
    description: 'Qualité de la récupération intra-séance.',
    dims: [
      { name: 'Repos moy.', desc: 'Temps de repos moyen entre les sets' },
      { name: 'Var. repos', desc: 'Variabilité des temps de repos' },
      { name: 'Complétion', desc: '% de sets complétés sans abandon' },
      { name: 'Qualité repos', desc: 'Adéquation repos / intensité du set précédent' },
      { name: 'Récup. est.', desc: 'Score de récupération estimé (0-100)' },
    ],
  },
  {
    name: 'PERF',
    color: '#fac775',
    description: 'Réalisations de performance dans la séance.',
    dims: [
      { name: 'Nb PRs', desc: 'Nombre de records personnels établis' },
      { name: 'Amp. PRs', desc: 'Amplitude moyenne Δ% vs précédent record' },
      { name: 'Force rel.', desc: 'Poids max rapporté au poids de corps' },
      { name: 'Prog. 1RM', desc: 'Δ 1RM Epley vs dernière séance même exercice' },
      { name: 'Constance perf.', desc: 'Stabilité des perfs entre sets d\'un même exercice' },
    ],
  },
  {
    name: 'RÉGULARITÉ',
    color: '#22c55e',
    description: 'Discipline d\'entraînement sur la durée.',
    dims: [
      { name: 'Fréquence', desc: 'Séances / semaine (rolling 4 semaines)' },
      { name: 'Streak', desc: 'Semaines consécutives d\'entraînement' },
      { name: 'Var. séances', desc: 'Variabilité du volume séance à séance' },
      { name: 'Planning', desc: 'Régularité créneaux horaires et jours de semaine' },
      { name: 'Régularité', desc: 'Score composite des 4 dimensions précédentes' },
    ],
  },
  {
    name: 'MUSCLES',
    color: '#ec4899',
    description: 'Volume par zone anatomique (17 muscles et faisceaux).',
    grid: true,
    dims: [
      { name: 'Pec claviculaire', desc: 'Développé incliné, fly haut' },
      { name: 'Pec sternal', desc: 'Développé plat, fly médian' },
      { name: 'Delt antérieur', desc: 'Développé, élévation frontale' },
      { name: 'Delt médial', desc: 'Élévation latérale' },
      { name: 'Delt postérieur', desc: 'Oiseau, tirage face' },
      { name: 'Grand dorsal', desc: 'Traction, tirage poitrine' },
      { name: 'Trapèze', desc: 'Rowing, haussements' },
      { name: 'Grand rond', desc: 'Tirages verticaux, rowing bas' },
      { name: 'Rhomboïdes', desc: 'Rowing, rétraction scapulaire' },
      { name: 'Érecteurs rachis', desc: 'Soulevé de terre, hyperextension' },
      { name: 'Biceps', desc: 'Curls, tirages' },
      { name: 'Triceps', desc: 'Développés, extensions, dips' },
      { name: 'Quadriceps', desc: 'Squat, leg press, extension' },
      { name: 'Ischio-jambiers', desc: 'Leg curl, Romanian DL' },
      { name: 'Fessiers', desc: 'Hip thrust, squat, leg press' },
      { name: 'Mollets', desc: 'Élévations debout et assis' },
      { name: 'Core', desc: 'Abdos, gainage, obliques' },
    ],
  },
  {
    name: 'TEMPS',
    color: '#3b82f6',
    description: 'Gestion du temps et efficacité de la séance.',
    dims: [
      { name: 'Durée', desc: 'Durée totale de la séance' },
      { name: 'Tempo', desc: 'Cadence d\'enchaînement (durée / transitions)' },
      { name: 'Densité', desc: 'Temps actif (sets) / durée totale' },
      { name: 'Efficacité', desc: 'Volume produit par seconde de séance' },
      { name: 'Timing', desc: 'Créneau horaire vs ton profil circadien' },
    ],
  },
]

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MyoGlossaryScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const s = buildStyles(colors)

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
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
        <View style={s.headerCenter}>
          <Text style={s.headerEyebrow}>MYO</Text>
          <Text style={s.headerTitle}>Guide des variables</Text>
        </View>
        <View style={s.headerRight} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + spacing.s8 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Intro ── */}
        <View style={s.introCard}>
          <View style={s.introHeader}>
            <View style={[s.introDot, { backgroundColor: colors.accent }]} />
            <Text style={[s.introTitle, { color: colors.textPrimary }]}>Score Myo 0 → 100</Text>
          </View>
          <Text style={[s.introBody, { color: colors.textSecondary }]}>
            Chaque dimension est normalisée sur ton historique personnel. Un score de
            {' '}<Text style={{ color: colors.textPrimary, fontFamily: font.bold }}>100</Text>{' '}
            représente ton meilleur niveau sur cette variable.
          </Text>
          <View style={s.introStats}>
            <View style={s.introStat}>
              <Text style={[s.introStatNum, { color: colors.accent }]}>53</Text>
              <Text style={[s.introStatLabel, { color: colors.textTertiary }]}>VARIABLES</Text>
            </View>
            <View style={[s.introStatDivider, { backgroundColor: colors.separator }]} />
            <View style={s.introStat}>
              <Text style={[s.introStatNum, { color: colors.textPrimary }]}>8</Text>
              <Text style={[s.introStatLabel, { color: colors.textTertiary }]}>FAMILLES</Text>
            </View>
            <View style={[s.introStatDivider, { backgroundColor: colors.separator }]} />
            <View style={s.introStat}>
              <Text style={[s.introStatNum, { color: colors.textPrimary }]}>3D</Text>
              <Text style={[s.introStatLabel, { color: colors.textTertiary }]}>TOPOLOGIE</Text>
            </View>
          </View>
        </View>

        {/* ── Familles ── */}
        {FAMILIES.map((family, fi) => (
          <FamilySection key={family.name} family={family} index={fi} colors={colors} s={s} />
        ))}
      </ScrollView>
    </View>
  )
}

// ─── FamilySection ────────────────────────────────────────────────────────────

function FamilySection({
  family,
  index,
  colors,
  s,
}: {
  family: FamilyEntry
  index: number
  colors: ReturnType<typeof useTheme>['colors']
  s: ReturnType<typeof buildStyles>
}): React.JSX.Element {
  return (
    <View style={s.familyCard}>
      {/* Left border */}
      <View style={[s.familyAccent, { backgroundColor: family.color }]} />

      <View style={s.familyContent}>
        {/* Header row */}
        <View style={s.familyHeader}>
          <View style={[s.familyDot, { backgroundColor: family.color }]} />
          <Text style={[s.familyName, { color: colors.textPrimary }]}>{family.name}</Text>
          <View style={[s.dimCountBadge, { backgroundColor: family.color + '22' }]}>
            <Text style={[s.dimCountText, { color: family.color }]}>
              {family.dims.length}
            </Text>
          </View>
          <Text style={[s.familyIndexLabel, { color: colors.textTertiary }]}>
            F{index + 1}
          </Text>
        </View>

        {/* Description */}
        <Text style={[s.familyDesc, { color: colors.textSecondary }]}>
          {family.description}
        </Text>

        {/* Separator */}
        <View style={[s.dimSeparator, { backgroundColor: colors.separator }]} />

        {/* Dims */}
        {family.grid ? (
          <View style={s.dimGrid}>
            {family.dims.map((dim, di) => (
              <View key={di} style={[s.dimGridItem, { backgroundColor: colors.backgroundTertiary }]}>
                <View style={[s.dimGridIndex, { backgroundColor: family.color + '33' }]}>
                  <Text style={[s.dimIndexText, { color: family.color }]}>
                    {String(di).padStart(2, '0')}
                  </Text>
                </View>
                <Text style={[s.dimGridName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {dim.name}
                </Text>
                <Text style={[s.dimGridDesc, { color: colors.textTertiary }]} numberOfLines={1}>
                  {dim.desc}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          family.dims.map((dim, di) => (
            <View key={di} style={s.dimRow}>
              <View style={[s.dimIndexBadge, { backgroundColor: family.color + '20' }]}>
                <Text style={[s.dimIndexText, { color: family.color }]}>
                  {String(di + 1).padStart(2, '0')}
                </Text>
              </View>
              <View style={s.dimTextBlock}>
                <Text style={[s.dimName, { color: colors.textPrimary }]}>{dim.name}</Text>
                <Text style={[s.dimDesc, { color: colors.textSecondary }]}>{dim.desc}</Text>
              </View>
            </View>
          ))
        )}
      </View>
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
      paddingTop: spacing.s4,
      paddingBottom: spacing.s3,
    },
    backBtn: {
      width: 44,
      height: 44,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerEyebrow: {
      ...typography.caption,
      fontFamily: font.mono,
      color: colors.accent,
      letterSpacing: 3,
      textTransform: 'uppercase',
    },
    headerTitle: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
      marginTop: 1,
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
      gap: spacing.s3,
    },

    // ── Intro ──
    introCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      padding: spacing.s4,
      marginBottom: spacing.s1,
    },
    introHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      marginBottom: spacing.s2,
    },
    introDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    introTitle: {
      ...typography.subtitle,
      fontFamily: font.bold,
    },
    introBody: {
      ...typography.body,
      lineHeight: 22,
    },
    introStats: {
      flexDirection: 'row',
      marginTop: spacing.s4,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    introStat: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.s3,
    },
    introStatNum: {
      fontSize: 22,
      fontFamily: font.black,
      letterSpacing: -0.5,
    },
    introStatLabel: {
      ...typography.caption,
      letterSpacing: 1,
      marginTop: 2,
    },
    introStatDivider: {
      width: 1,
      marginVertical: spacing.s3,
    },

    // ── Family card ──
    familyCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    familyAccent: {
      width: 3,
    },
    familyContent: {
      flex: 1,
      padding: spacing.s4,
    },
    familyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      marginBottom: spacing.s1,
    },
    familyDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    familyName: {
      ...typography.caption,
      fontFamily: font.bold,
      letterSpacing: 1.5,
      flex: 1,
    },
    dimCountBadge: {
      paddingHorizontal: spacing.s2,
      paddingVertical: 2,
      borderRadius: radius.full,
    },
    dimCountText: {
      fontSize: 11,
      fontFamily: font.bold,
      letterSpacing: 0.5,
    },
    familyIndexLabel: {
      fontSize: 11,
      fontFamily: font.mono,
      letterSpacing: 0.5,
    },
    familyDesc: {
      ...typography.body,
      fontSize: 13,
      marginBottom: spacing.s3,
    },
    dimSeparator: {
      height: 1,
      marginBottom: spacing.s3,
    },

    // ── Dim list ──
    dimRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.s3,
      marginBottom: spacing.s2,
    },
    dimIndexBadge: {
      width: 28,
      height: 28,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    dimIndexText: {
      fontSize: 10,
      fontFamily: font.mono,
      letterSpacing: 0.5,
    },
    dimTextBlock: {
      flex: 1,
    },
    dimName: {
      fontSize: 14,
      fontFamily: font.bold,
      lineHeight: 18,
    },
    dimDesc: {
      fontSize: 12,
      fontFamily: font.regular,
      lineHeight: 17,
      marginTop: 1,
    },

    // ── Dim grid (muscles) ──
    dimGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
    },
    dimGridItem: {
      width: '47.5%',
      borderRadius: radius.sm,
      padding: spacing.s3,
    },
    dimGridIndex: {
      width: 26,
      height: 18,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.s1,
    },
    dimGridName: {
      fontSize: 12,
      fontFamily: font.bold,
      lineHeight: 16,
    },
    dimGridDesc: {
      fontSize: 11,
      fontFamily: font.regular,
      lineHeight: 15,
      marginTop: 2,
    },
  })
}
