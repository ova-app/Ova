import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SectionList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  useWindowDimensions,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { BlurView } from 'expo-blur'
import Animated, {
  useSharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  runOnJS,
  withTiming,
  withDelay,
  withSpring,
  Easing,
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image as ExpoImage } from 'expo-image'
import { useRouter } from 'expo-router'
import {
  Trophy,
  ChevronRight,
  Shield,
  TrendingUp,
  Settings,
  Dumbbell,
  Image as ImageIcon,
  Lock,
  Target,
  Plus,
  Crown,
  EyeOff,
  Flame,
  RotateCcw,
  CheckCircle2,
  Trash2,
  X,
  CalendarDays,
  ChevronLeft,
  Pin,
} from 'lucide-react-native'
import Svg, { Path as SvgPath, Circle, Defs, LinearGradient, Stop } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { supabase } from '@/lib/supabase'

import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography, font, spring, touchTarget } from '@/constants/theme'
import { formatDuration } from '@/lib/utils'
import { type WorkoutRow } from '@/lib/hooks/useHistoryData'
import {
  useProfileData,
  type UserProfile,
  type DayActivity,
  type WeekVolume,
  type SessionDay,
  type PhotoItem,
} from '@/lib/hooks/useProfileData'
import {
  createClaim,
  abandonClaim,
  validateClaimNow,
  nearMissGap,
  type Claim,
  type ClaimVoteCounts,
} from '@/lib/claims'
import { markFeedDirty } from '@/lib/feedSignal'
import { clearFeaturedPr, hideFeaturedPr, type FeaturedPr } from '@/lib/featuredPr'
import { uploadProfilePhoto, deleteProfilePhoto } from '@/lib/profilePhotos'
import { pinFeaturedPhoto, clearFeaturedPhoto } from '@/lib/featuredPhoto'
import { resolveDisplayName } from '@/lib/displayName'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS_FR = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM']
const WEEKDAYS_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const MONTHS_FR = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
]
const MONTHS_FULL_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]
const WEEK_HEADER_FR = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] // lundi → dimanche

function dayTitle(ms: number): string {
  const d = new Date(ms)
  return `${WEEKDAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`
}

function weekRangeTitle(weekStart: number): string {
  const a = new Date(weekStart)
  const b = new Date(weekStart + 6 * 86400000)
  const am = MONTHS_FR[a.getMonth()]
  const bm = MONTHS_FR[b.getMonth()]
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${am}`
    : `${a.getDate()} ${am} – ${b.getDate()} ${bm}`
}

function getDisplayName(profile: UserProfile): string {
  return resolveDisplayName(profile.name_display, profile.full_name, profile.username)
}

function getInitiale(profile: UserProfile): string {
  return (getDisplayName(profile).charAt(0) || 'O').toUpperCase()
}

function isThisMonth(ms: number): boolean {
  const d = new Date(ms)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
}

function daysUntil(deadlineIso: string | null): number | null {
  if (!deadlineIso) return null
  return Math.max(0, Math.ceil((new Date(deadlineIso).getTime() - Date.now()) / 86400000))
}

// ─── Stat sociale inline (vitrine) ─────────────────────────────────────────────

function SocialStat({
  value,
  label,
  colors,
}: {
  value: number
  label: string
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const s = buildStyles(colors)
  return (
    <View style={s.socialStat}>
      <Text style={s.socialStatValue} allowFontScaling={false}>
        {value}
      </Text>
      <Text style={s.socialStatLabel}>{label}</Text>
    </View>
  )
}

// ─── Bande Claim (called-shot social) ──────────────────────────────────────────

function ClaimBand({
  claim,
  recentFailed,
  votes,
  colors,
  onCreate,
  onReclaim,
  onCancel,
  onValidate,
  onRefresh,
}: {
  claim: Claim | null
  recentFailed: Claim | null
  votes: ClaimVoteCounts
  colors: ReturnType<typeof useTheme>['colors']
  onCreate: () => void
  onReclaim: (claim: Claim) => void
  onCancel: (claim: Claim) => void
  onValidate: (claim: Claim) => Promise<Claim | null>
  onRefresh: () => void
}) {
  const s = buildStyles(colors)
  const { unit: weightUnit, toDisplay } = useWeightUnit()
  // Claims poids : target_value stocké en kg (unit 'kg') → afficher dans l'unité. Séances inchangées.
  const fmtClaimVal = (val: number, claimUnit: string): string =>
    claimUnit === 'kg' ? `${Math.round(toDisplay(val))} ${weightUnit}` : `${val} ${claimUnit}`
  const mount = useSharedValue(0)
  useEffect(() => {
    mount.value = withDelay(120, withTiming(1, { duration: 350, easing: Easing.out(Easing.cubic) }))
  }, [])
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 10 }],
  }))

  // Validation manuelle (« Valider ») : barre de progression + emoji pendant le scan réel
  // des séances (lib/claims.validateClaimNow). Délai mini ⇒ la vérif est perceptible.
  const [validating, setValidating] = useState(false)
  const scan = useSharedValue(0)
  const scanStyle = useAnimatedStyle(() => ({ width: `${scan.value * 100}%` }))

  function confirmCancel(c: Claim): void {
    Alert.alert('Annuler le claim', 'Ton claim sera retiré. Aucune trace, aucun jugement.', [
      { text: 'Garder', style: 'cancel' },
      { text: 'Annuler le claim', style: 'destructive', onPress: () => onCancel(c) },
    ])
  }

  function runValidate(c: Claim): void {
    void (async () => {
      setValidating(true)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      // Durée mini 3 s même si le scan répond avant — perception « vérification » (design).
      scan.value = withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.cubic) })
      const minDelay = new Promise<void>((r) => setTimeout(r, 3000))
      // onValidate scanne + résout MAIS ne refresh pas (sinon activeClaim flipperait avant
      // la fin de l'animation). On refresh seulement après les 3 s → l'overlay tient bien
      // 3 s puis se démonte en révélant le résultat (claim résolu dans feed + historique).
      const [resolved] = await Promise.all([onValidate(c), minDelay])
      onRefresh()
      // Succès : on laisse `validating` true → le démontage (activeClaim → null) révèle le
      // résultat sans flash de la carte active. Échec (claim resté actif) : on rend la main.
      if (!resolved) setValidating(false)
    })()
  }

  // Progress bar (claims 'sessions')
  const progress = useSharedValue(0)
  const target = claim?.target_value ?? 1
  const current = claim?.progress_current ?? 0
  useEffect(() => {
    progress.value = withDelay(
      300,
      withTiming(Math.min(1, current / target), { duration: 700, easing: Easing.out(Easing.cubic) })
    )
  }, [current, target])
  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }))

  if (!claim) {
    // Atterrissage privé d'un claim raté récemment (ORA-081) : visible par l'auteur seul
    // (le feed n'affiche qu'active+succeeded), sans honte publique. Re-claim en 1 tap.
    if (recentFailed) {
      const isW = recentFailed.type === 'weight'
      const gap = nearMissGap(recentFailed.target_value, recentFailed.resolved_value)
      const gapLabel =
        gap != null && gap > 0
          ? isW
            ? `à ${Math.round(toDisplay(gap))} ${weightUnit} près`
            : `à ${gap} séance${gap > 1 ? 's' : ''} près`
          : null
      return (
        <Animated.View style={mountStyle}>
          <View style={s.nearMissCard}>
            <View style={s.nearMissHeaderRow}>
              <Text style={s.nearMissTag}>CLAIM MANQUÉ</Text>
              {gapLabel && <Text style={s.nearMissGapLabel}>{gapLabel}</Text>}
            </View>
            <Text style={s.nearMissTarget} numberOfLines={1}>
              {fmtClaimVal(recentFailed.target_value, recentFailed.unit)}
              {isW && recentFailed.exercise_name ? ` · ${recentFailed.exercise_name}` : ''}
            </Text>
            {recentFailed.resolved_value != null && (
              <Text style={s.nearMissReached}>
                Atteint : {fmtClaimVal(recentFailed.resolved_value, recentFailed.unit)}
              </Text>
            )}
            <View style={s.nearMissActions}>
              <Pressable
                style={({ pressed }) => [s.reclaimBtn, pressed && { opacity: 0.85 }]}
                onPress={() => onReclaim(recentFailed)}
                accessibilityRole="button"
                accessibilityLabel="Re-claim, réannoncer le même objectif"
              >
                <RotateCcw size={14} color={colors.background} strokeWidth={2.5} />
                <Text style={s.reclaimBtnText}>Re-claim</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.reclaimAltBtn, pressed && { opacity: 0.6 }]}
                onPress={onCreate}
                accessibilityRole="button"
                accessibilityLabel="Annoncer un autre objectif"
              >
                <Text style={s.reclaimAltText}>Autre objectif</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      )
    }
    return (
      <Animated.View style={mountStyle}>
        <Pressable
          style={({ pressed }) => [s.claimEmpty, pressed && { opacity: 0.7 }]}
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="Annoncer un claim"
        >
          <View style={s.claimEmptyIcon}>
            <Target size={16} color={colors.accent} strokeWidth={2} />
          </View>
          <View style={s.flexOne}>
            <Text style={s.claimEmptyTitle}>Annoncer un claim</Text>
            <Text style={s.claimEmptySub}>Annonce ton prochain objectif. Le feed pronostique.</Text>
          </View>
          <Plus size={18} color={colors.textTertiary} strokeWidth={2} />
        </Pressable>
      </Animated.View>
    )
  }

  const isWeight = claim.type === 'weight'
  const dLeft = daysUntil(claim.deadline)
  const deadlineLabel =
    claim.scope === 'next_session'
      ? 'Prochaine séance'
      : dLeft === 0
        ? 'Dernier jour'
        : `J-${dLeft}`

  return (
    <Animated.View style={mountStyle}>
      <View style={s.claimCard}>
        {/* barre accent gauche */}
        <View style={s.claimAccentBar} />
        <View style={s.claimHeaderRow}>
          <View style={s.claimTag}>
            <Target size={11} color={colors.accent} strokeWidth={2.5} />
            <Text style={s.claimTagText}>CLAIM ACTIF</Text>
          </View>
          <Text style={s.claimDeadline}>{deadlineLabel}</Text>
        </View>

        {/* cible */}
        <View style={s.claimTargetRow}>
          <Text style={s.claimTargetValue} allowFontScaling={false}>
            {isWeight ? Math.round(toDisplay(claim.target_value)) : claim.target_value}
            <Text style={s.claimTargetUnit}> {isWeight ? weightUnit : claim.unit}</Text>
          </Text>
          {isWeight && claim.exercise_name && (
            <Text style={s.claimExercise} numberOfLines={1}>
              {claim.exercise_name}
            </Text>
          )}
        </View>

        {/* progression (sessions) */}
        {!isWeight && (
          <View style={s.claimProgressWrap}>
            <View style={s.claimProgressTrack}>
              <Animated.View style={[s.claimProgressFill, barStyle]} />
            </View>
            <Text style={s.claimProgressLabel}>
              {current}/{claim.target_value}
            </Text>
          </View>
        )}

        {validating ? (
          /* Vérification en cours : scan réel des séances (emoji + barre de progression) */
          <View style={s.claimScanWrap}>
            <View style={s.claimScanHeader}>
              <Text style={s.claimScanEmoji} allowFontScaling={false}>
                🔍
              </Text>
              <Text style={s.claimScanLabel}>Vérification de ton claim…</Text>
            </View>
            <View style={s.claimProgressTrack}>
              <Animated.View style={[s.claimProgressFill, scanStyle]} />
            </View>
          </View>
        ) : (
          <>
            {/* pronostics (lecture seule sur son propre profil) */}
            <View style={s.claimVotesRow}>
              <View style={s.claimVoteChip}>
                <Flame size={12} color={colors.accent} strokeWidth={2.5} />
                <Text style={s.claimVoteCount}>{votes.believe}</Text>
                <Text style={s.claimVoteLabel}>y croient</Text>
              </View>
              <Text style={s.claimVoteSep}>·</Text>
              <View style={s.claimVoteChip}>
                <Text style={s.claimVoteCount}>{votes.doubt}</Text>
                <Text style={s.claimVoteLabel}>sceptiques</Text>
              </View>
            </View>

            {/* Actions : annuler (retrait) ou valider (scan réel → réussi/raté) */}
            <View style={s.claimActionsRow}>
              <Pressable
                style={({ pressed }) => [s.claimCancelBtn, pressed && { opacity: 0.6 }]}
                onPress={() => confirmCancel(claim)}
                accessibilityRole="button"
                accessibilityLabel="Annuler le claim"
              >
                <Trash2 size={14} color={colors.textSecondary} strokeWidth={2} />
                <Text style={s.claimCancelText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.claimValidateBtn, pressed && { opacity: 0.85 }]}
                onPress={() => runValidate(claim)}
                accessibilityRole="button"
                accessibilityLabel="Valider le claim, vérifier dans mes séances"
              >
                <CheckCircle2 size={15} color={colors.background} strokeWidth={2.5} />
                <Text style={s.claimValidateText}>Valider</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Animated.View>
  )
}

// ─── Card PR vedette (vitrine prestige) ─────────────────────────────────────────

function PrVedetteCard({
  pr,
  colors,
  onPress,
  onLongPress,
}: {
  pr: FeaturedPr | null
  colors: ReturnType<typeof useTheme>['colors']
  onPress: () => void
  onLongPress: () => void
}) {
  const s = buildStyles(colors)
  const { unit: weightUnit, toDisplay } = useWeightUnit()
  const mount = useSharedValue(0)
  useEffect(() => {
    mount.value = withDelay(200, withSpring(1, spring.standard))
  }, [])
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 10 }],
  }))

  // Pas encore de PR : message passif (rien à épingler).
  if (!pr) {
    return (
      <Animated.View style={[s.prVedetteEmpty, mountStyle]}>
        <Crown size={16} color={colors.textTertiary} strokeWidth={1.5} />
        <Text style={s.prVedetteEmptyText}>
          Ton premier record s&apos;affichera ici en vitrine.
        </Text>
      </Animated.View>
    )
  }

  // Vitrine masquée par l'utilisateur : slot CTA → invite à accrocher un PR vedette.
  if (pr.hidden) {
    return (
      <Animated.View style={mountStyle}>
        <TouchableOpacity
          style={s.prVedetteEmpty}
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={300}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Accrocher un PR vedette"
          accessibilityHint="Choisis un record à mettre en avant sur ton profil"
        >
          <Crown size={16} color={colors.textTertiary} strokeWidth={1.5} />
          <Text style={s.prVedetteEmptyText}>
            Accroche un PR vedette si tu veux le mettre en avant.
          </Text>
        </TouchableOpacity>
      </Animated.View>
    )
  }

  const recent = isThisMonth(pr.achieved_at)

  return (
    <Animated.View style={mountStyle}>
      <TouchableOpacity
        style={s.prVedetteCard}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={300}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Voir l'Armurerie"
        accessibilityHint="Appui long pour changer le PR vedette"
      >
        <View style={s.prVedetteHeaderRow}>
          <View style={s.prVedetteTag}>
            <Crown size={12} color={colors.prGold} fill={colors.prGold} strokeWidth={0} />
            <Text style={s.prVedetteTagText}>PR VEDETTE</Text>
          </View>
          {recent && (
            <View style={s.prVedetteBadge}>
              <Text style={s.prVedetteBadgeText}>CE MOIS</Text>
            </View>
          )}
        </View>

        <View style={s.prVedetteMain}>
          <ChevronRight size={18} color={colors.textTertiary} />
          <View style={s.prVedetteTextCol}>
            <Text style={s.prVedetteValue} allowFontScaling={false}>
              {Math.round(toDisplay(pr.weight_kg))}
              <Text style={s.prVedetteUnit}> {weightUnit}</Text>
            </Text>
            <Text style={s.prVedetteExercise} numberOfLines={1}>
              {pr.exercise_name}
            </Text>
            <Text style={s.prVedetteDelta}>
              {pr.delta_kg != null && pr.delta_kg > 0
                ? `+${Math.round(toDisplay(pr.delta_kg))} ${weightUnit} vs ton ancien record`
                : 'Premier record'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  )
}

// ─── Tooltip flottant partagé (calendrier + graph volume) ──────────────────────
// Léger : carte glassy au-dessus de l'élément tapé, flèche centrée sur l'ancre,
// apparition spring (jamais linear). pointerEvents none → ne capture pas le tap.

function ChartTooltip({
  x,
  containerW,
  title,
  value,
  accent,
  colors,
}: {
  x: number // centre x de l'ancre, dans le repère du conteneur
  containerW: number
  title: string
  value: string
  accent?: boolean
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const s = buildStyles(colors)
  const TW = 134
  const mount = useSharedValue(0)
  useEffect(() => {
    mount.value = withSpring(1, spring.snappy)
  }, [])
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 5 }, { scale: 0.95 + mount.value * 0.05 }],
  }))

  let left = x - TW / 2
  if (containerW > 0) left = Math.max(0, Math.min(left, containerW - TW))
  const pointerLeft = Math.max(10, Math.min(x - left - 5, TW - 20))

  return (
    <Animated.View style={[s.tooltip, { left, width: TW }, mountStyle]} pointerEvents="none">
      <Text style={s.tooltipTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={[s.tooltipValue, accent && { color: colors.prGold }]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {value}
      </Text>
      <View style={[s.tooltipPointer, { left: pointerLeft }]} />
    </Animated.View>
  )
}

// ─── Calendrier 7 derniers jours (interactif) ───────────────────────────────────

function WeekCalendar({
  days,
  colors,
}: {
  days: DayActivity[]
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const s = buildStyles(colors)
  const { formatVolume: formatVolumeU } = useWeightUnit()
  const [w, setW] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const pick = useCallback((i: number) => {
    setSel((prev) => (prev === i ? null : i))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSel(null), 2600)
  }, [])

  const d = sel !== null ? days[sel] : null
  const anchorX = sel !== null && w > 0 ? ((sel + 0.5) / days.length) * w : 0

  return (
    <View style={s.calWrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {d && (
        <ChartTooltip
          key={`cal-${sel}`}
          x={anchorX}
          containerW={w}
          colors={colors}
          title={dayTitle(d.date)}
          value={d.hasSession ? formatVolumeU(d.volumeKg, { suffix: true }) : 'Repos'}
          accent={d.hasSession}
        />
      )}
      <View style={s.weekRow}>
        {days.map((day, i) => (
          <Pressable
            key={day.date}
            style={s.weekCol}
            onPress={() => pick(i)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`${dayTitle(day.date)} — ${
              day.hasSession ? formatVolumeU(day.volumeKg, { suffix: true }) : 'repos'
            }`}
          >
            <Text style={[s.weekLabel, day.isToday && s.weekLabelToday]}>{day.label}</Text>
            <View
              style={[
                s.weekCell,
                day.hasSession && s.weekCellActive,
                day.isToday && !day.hasSession && s.weekCellToday,
                sel === i && s.weekCellSelected,
              ]}
            >
              {day.hasSession ? (
                <Dumbbell size={15} color={colors.background} strokeWidth={2.5} />
              ) : (
                <Text style={[s.weekDayNum, day.isToday && s.weekDayNumToday]}>{day.dayNum}</Text>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// ─── Calendrier mensuel (modal, même style que la semaine) ─────────────────────

type MonthCell = {
  day: number
  ts: number
  hasSession: boolean
  volumeKg: number
  isToday: boolean
}

function MonthCalendar({
  visible,
  sessions,
  colors,
  onClose,
}: {
  visible: boolean
  sessions: SessionDay[]
  colors: ReturnType<typeof useTheme>['colors']
  onClose: () => void
}) {
  const s = buildStyles(colors)
  const { formatVolume: formatVolumeU } = useWeightUnit()
  const [offset, setOffset] = useState(0) // 0 = mois courant ; négatif = passé
  const [sel, setSel] = useState<MonthCell | null>(null)

  // Réinitialise au mois courant à chaque ouverture
  useEffect(() => {
    if (visible) {
      setOffset(0)
      setSel(null)
    }
  }, [visible])

  const dayVolume = useMemo(() => {
    const m = new Map<number, number>()
    for (const d of sessions) m.set(d.date, d.volumeKg)
    return m
  }, [sessions])

  const { title, weeks } = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const todayTs = now.getTime()
    const base = new Date(now.getFullYear(), now.getMonth() + offset, 1)
    const year = base.getFullYear()
    const month = base.getMonth()
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7 // 0 = lundi
    const nbDays = new Date(year, month + 1, 0).getDate()

    const cells: (MonthCell | null)[] = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let day = 1; day <= nbDays; day++) {
      const ts = new Date(year, month, day).getTime()
      cells.push({
        day,
        ts,
        hasSession: dayVolume.has(ts),
        volumeKg: dayVolume.get(ts) ?? 0,
        isToday: ts === todayTs,
      })
    }
    while (cells.length % 7 !== 0) cells.push(null)
    const rows: (MonthCell | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7))

    return { title: `${MONTHS_FULL_FR[month]} ${year}`, weeks: rows }
  }, [offset, dayVolume])

  const canGoNext = offset < 0

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.monthBackdrop} onPress={onClose}>
        <Pressable style={s.monthCard} onPress={() => {}}>
          {/* En-tête : navigation mois */}
          <View style={s.monthHeader}>
            <Pressable
              onPress={() => {
                setOffset((o) => o - 1)
                setSel(null)
              }}
              hitSlop={10}
              style={s.monthNavBtn}
              accessibilityLabel="Mois précédent"
            >
              <ChevronLeft size={20} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
            <Text style={s.monthTitle}>{title}</Text>
            <Pressable
              onPress={() => {
                if (canGoNext) {
                  setOffset((o) => o + 1)
                  setSel(null)
                }
              }}
              hitSlop={10}
              disabled={!canGoNext}
              style={s.monthNavBtn}
              accessibilityLabel="Mois suivant"
            >
              <ChevronRight
                size={20}
                color={canGoNext ? colors.textSecondary : colors.textTertiary}
                strokeWidth={2.5}
              />
            </Pressable>
          </View>

          {/* En-tête jours */}
          <View style={s.monthDowRow}>
            {WEEK_HEADER_FR.map((l, i) => (
              <View key={i} style={s.monthDowCol}>
                <Text style={s.weekLabel}>{l}</Text>
              </View>
            ))}
          </View>

          {/* Grille */}
          {weeks.map((row, ri) => (
            <View key={ri} style={s.monthWeekRow}>
              {row.map((cell, ci) => (
                <View key={ci} style={s.monthDowCol}>
                  {cell ? (
                    <Pressable
                      onPress={() => setSel((prev) => (prev?.ts === cell.ts ? null : cell))}
                      hitSlop={2}
                      accessibilityRole="button"
                      accessibilityLabel={`${cell.day} — ${
                        cell.hasSession ? formatVolumeU(cell.volumeKg, { suffix: true }) : 'repos'
                      }`}
                    >
                      <View
                        style={[
                          s.weekCell,
                          cell.hasSession && s.weekCellActive,
                          cell.isToday && !cell.hasSession && s.weekCellToday,
                          sel?.ts === cell.ts && s.weekCellSelected,
                        ]}
                      >
                        {cell.hasSession ? (
                          <Dumbbell size={15} color={colors.background} strokeWidth={2.5} />
                        ) : (
                          <Text style={[s.weekDayNum, cell.isToday && s.weekDayNumToday]}>
                            {cell.day}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ) : (
                    <View style={s.weekCell} />
                  )}
                </View>
              ))}
            </View>
          ))}

          {/* Détail du jour sélectionné */}
          <View style={s.monthDetail}>
            {sel ? (
              <Text style={s.monthDetailText} allowFontScaling={false}>
                {dayTitle(sel.ts)}
                {sel.hasSession ? (
                  <Text
                    style={{ color: colors.prGold }}
                  >{`  ·  ${formatVolumeU(sel.volumeKg, { suffix: true })}`}</Text>
                ) : (
                  <Text style={{ color: colors.textTertiary }}>{'  ·  Repos'}</Text>
                )}
              </Text>
            ) : (
              <Text style={[s.monthDetailText, { color: colors.textTertiary }]}>
                Touche un jour pour le détail
              </Text>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

// ─── Graph volume hebdomadaire (interactif, axe Y discret) ─────────────────────

// Courbe lissée (Catmull-Rom → cubiques Bézier). Élégant, jamais de cassure dure.
function buildSmoothPath(pts: { x: number; y: number }[], closeToBaseline?: number): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) {
    const p = pts[0]
    return closeToBaseline != null
      ? `M ${p.x} ${closeToBaseline} L ${p.x} ${p.y} Z`
      : `M ${p.x} ${p.y}`
  }
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`
  }
  if (closeToBaseline != null) {
    const last = pts[pts.length - 1]
    d += ` L ${last.x} ${closeToBaseline} L ${pts[0].x} ${closeToBaseline} Z`
  }
  return d
}

const VOL_CHART_H = 72
const VOL_PAD_TOP = 8
const VOL_PAD_BOTTOM = 6

function WeeklyVolumeChart({
  weeks,
  colors,
}: {
  weeks: WeekVolume[]
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const s = buildStyles(colors)
  const { formatVolume: formatVolumeU } = useWeightUnit()
  const [w, setW] = useState(0)
  const [sel, setSel] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const pick = useCallback((i: number) => {
    setSel((prev) => (prev === i ? null : i))
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setSel(null), 2600)
  }, [])

  const max = Math.max(1, ...weeks.map((wk) => wk.volumeKg))
  const ticks = [max, max / 2, 0] // axe Y discret : haut · milieu · base
  const sw = sel !== null ? weeks[sel] : null
  const anchorX = sel !== null && w > 0 ? ((sel + 0.5) / weeks.length) * w : 0

  const usableH = VOL_CHART_H - VOL_PAD_TOP - VOL_PAD_BOTTOM
  const baselineY = VOL_CHART_H - VOL_PAD_BOTTOM
  const pts =
    w > 0
      ? weeks.map((wk, i) => ({
          x: ((i + 0.5) / weeks.length) * w,
          y: VOL_PAD_TOP + (1 - wk.volumeKg / max) * usableH,
        }))
      : []

  return (
    <View style={s.volOuter}>
      <View style={s.volAxisCol}>
        {ticks.map((t, i) => (
          <Text key={i} style={s.volAxisLabel} numberOfLines={1} allowFontScaling={false}>
            {formatVolumeU(Math.round(t))}
          </Text>
        ))}
      </View>
      <View style={s.volChartArea} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {/* lignes de repère discrètes (alignées sur les ticks) */}
        <View style={[s.volGrid, { top: 0 }]} />
        <View style={[s.volGrid, { top: '50%' }]} />
        <View style={[s.volGrid, { bottom: 0 }]} />

        {sw && (
          <ChartTooltip
            key={`vol-${sel}`}
            x={anchorX}
            containerW={w}
            colors={colors}
            title={`Sem. ${weekRangeTitle(sw.weekStart)}`}
            value={sw.volumeKg > 0 ? formatVolumeU(sw.volumeKg, { suffix: true }) : 'Aucun volume'}
            accent={sw.volumeKg > 0}
          />
        )}

        {/* Ligne jaune lissée + dégradé sous la courbe */}
        {w > 0 && (
          <Svg width={w} height={VOL_CHART_H} style={s.volSvg} pointerEvents="none">
            <Defs>
              <LinearGradient id="volFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.prGold} stopOpacity={0.22} />
                <Stop offset="1" stopColor={colors.prGold} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <SvgPath d={buildSmoothPath(pts, baselineY)} fill="url(#volFill)" />
            <SvgPath
              d={buildSmoothPath(pts)}
              fill="none"
              stroke={colors.prGold}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {pts.map((p, i) => {
              const isLast = i === weeks.length - 1
              const isSel = sel === i
              if (!isSel && !isLast) return null
              return (
                <Circle
                  key={weeks[i].weekStart}
                  cx={p.x}
                  cy={p.y}
                  r={isSel ? 4 : 3}
                  fill={isSel ? colors.accent : colors.prGold}
                  stroke={colors.background}
                  strokeWidth={1.5}
                />
              )
            })}
          </Svg>
        )}

        {/* Couche tactile : un tap n'importe où sélectionne la semaine la plus proche */}
        <Pressable
          style={s.volTouchLayer}
          onPress={(e) => {
            if (w <= 0) return
            const x = e.nativeEvent.locationX
            const i = Math.max(0, Math.min(weeks.length - 1, Math.floor((x / w) * weeks.length)))
            pick(i)
          }}
          accessibilityRole="button"
          accessibilityLabel="Détail du volume par semaine"
        />
      </View>
    </View>
  )
}

// ─── Vitrine — pile compacte (aperçu profil) ───────────────────────────────────
// Aperçu empilé des photos postées. Tap → ouvre le modal vitrine plein écran.
// Aucune photo → icône par défaut (toujours tappable : invite à en ajouter).

const STACK_MAX = 4 // vignettes affichées dans la pile avant le badge « +N »

function PhotoStack({
  photos,
  colors,
  onOpen,
}: {
  photos: PhotoItem[]
  colors: ReturnType<typeof useTheme>['colors']
  onOpen: () => void
}) {
  const s = buildStyles(colors)
  const mount = useSharedValue(0)
  useEffect(() => {
    mount.value = withDelay(160, withSpring(1, spring.standard))
  }, [])
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ scale: 0.94 + mount.value * 0.06 }],
  }))

  // Hero = photo épinglée (remontée en tête par useProfileData) ou, à défaut, la plus
  // récente. Toujours photos[0] → vignette agrandie qui met la vitrine en avant.
  const hero = photos[0] ?? null
  const rest = photos.slice(1, STACK_MAX) // petites vignettes empilées derrière le hero
  const extra = photos.length - 1 - rest.length
  const countLabel =
    photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''}` : 'Aucune photo'

  return (
    <Animated.View style={[s.vitrineWrap, mountStyle]}>
      <Pressable
        style={({ pressed }) => [s.vitrineBtn, pressed && { opacity: 0.7 }]}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Vitrine — ${countLabel}${hero?.isPinned ? ', photo épinglée' : ''}`}
      >
        {photos.length === 0 ? (
          // Aucune photo → pile de cartes vides empilées (même langage visuel que l'aperçu réel)
          <View style={s.vitrineThumbs}>
            <View style={[s.vitrineHero, s.vitrineThumbEmpty]}>
              <ImageIcon size={18} color={colors.textTertiary} strokeWidth={1.75} />
            </View>
            {[0, 1].map((i) => (
              <View
                key={i}
                style={[s.vitrineThumb, s.vitrineThumbEmpty, { marginLeft: -13, zIndex: -i }]}
              />
            ))}
          </View>
        ) : (
          <View style={s.vitrineThumbs}>
            {/* Hero agrandi — met en avant la photo épinglée (ou la plus récente) */}
            <View style={s.vitrineHeroWrap}>
              <ExpoImage
                source={{ uri: hero!.photoUrl }}
                style={[s.vitrineHero, hero!.isPinned && s.vitrineHeroPinned]}
                contentFit="cover"
                transition={120}
                cachePolicy="memory-disk"
              />
              {hero!.isPinned && (
                <View style={s.vitrinePinBadge}>
                  <Pin
                    size={9}
                    color={colors.background}
                    fill={colors.background}
                    strokeWidth={2}
                  />
                </View>
              )}
            </View>
            {rest.map((p, i) => (
              <ExpoImage
                key={p.id}
                source={{ uri: p.photoUrl }}
                style={[s.vitrineThumb, { marginLeft: -13, zIndex: -1 - i }]}
                contentFit="cover"
                transition={120}
                cachePolicy="memory-disk"
              />
            ))}
            {extra > 0 && (
              <View
                style={[s.vitrineThumb, s.vitrineMore, { marginLeft: -13, zIndex: -STACK_MAX }]}
              >
                <Text style={s.vitrineMoreText} allowFontScaling={false}>
                  +{extra}
                </Text>
              </View>
            )}
          </View>
        )}
      </Pressable>
    </Animated.View>
  )
}

// ─── Vitrine — modal plein écran (grille + zoom) ────────────────────────────────
// Overlay transparent glassy au-dessus du profil. Grille 3 colonnes de toutes les
// photos ; tap sur une vignette → zoom plein écran. Zoom rendu en couche absolue
// (pas de Modal imbriqué → robuste Android).

function VitrineModal({
  visible,
  photos,
  colors,
  onClose,
  onOpenSession,
  onChanged,
}: {
  visible: boolean
  photos: PhotoItem[]
  colors: ReturnType<typeof useTheme>['colors']
  onClose: () => void
  onOpenSession: (workoutId: string) => void
  onChanged: () => void // refetch après ajout / suppression (la BDD reste source de vérité)
}) {
  const s = buildStyles(colors)
  const { width } = useWindowDimensions()
  const [zoom, setZoom] = useState<PhotoItem | null>(null)
  const [busy, setBusy] = useState(false)

  // Grille 3 colonnes — largeur écran moins padding (s5×2) moins 2 gaps (s2).
  const tileSize = Math.floor((width - spacing.s5 * 2 - spacing.s2 * 2) / 3)

  function handleClose(): void {
    setZoom(null)
    onClose()
  }

  // Upload de l'URI choisie → refetch (la BDD reste source de vérité).
  async function uploadAndRefresh(uri: string): Promise<void> {
    setBusy(true)
    const created = await uploadProfilePhoto(uri)
    setBusy(false)
    if (created) onChanged()
    else Alert.alert('Échec', "Impossible d'ajouter la photo. Réessaie.")
  }

  // Prise de photo en direct (caméra) → upload → refetch.
  async function takePhoto(): Promise<void> {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Accès refusé', "Autorise l'accès à l'appareil photo pour prendre une photo.")
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    await uploadAndRefresh(result.assets[0].uri)
  }

  // Choix d'une photo depuis la galerie → upload → refetch.
  async function pickFromLibrary(): Promise<void> {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Accès refusé', "Autorise l'accès aux photos pour en ajouter à ta vitrine.")
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    if (result.canceled || !result.assets?.[0]) return
    await uploadAndRefresh(result.assets[0].uri)
  }

  // Ajout d'une photo à la vitrine (hors séance) → choix caméra / galerie.
  function handleAdd(): void {
    if (busy) return
    Alert.alert('Ajouter une photo', 'Choisis la source de ta photo.', [
      { text: 'Prendre une photo', onPress: () => void takePhoto() },
      { text: 'Choisir dans la galerie', onPress: () => void pickFromLibrary() },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  // Suppression d'une photo de profil (source 'profile' uniquement).
  function handleDelete(photo: PhotoItem): void {
    Alert.alert('Supprimer la photo', 'Cette photo sera retirée de ta vitrine.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true)
            const ok = await deleteProfilePhoto(photo.id)
            setBusy(false)
            setZoom(null)
            if (ok) onChanged()
            else Alert.alert('Échec', 'Impossible de supprimer la photo. Réessaie.')
          })()
        },
      },
    ])
  }

  // Épingle / désépingle la photo en tête de vitrine (ORA-084) — n'importe quelle source.
  // Optimiste : le zoom reflète l'état tout de suite, refetch reclasse ensuite la grille.
  async function togglePin(photo: PhotoItem): Promise<void> {
    if (busy) return
    const willPin = !photo.isPinned
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setBusy(true)
    const ok = willPin
      ? await pinFeaturedPhoto({
          id: photo.id,
          photo_url: photo.photoUrl,
          source: photo.source,
          workout_id: photo.workoutId,
        })
      : await clearFeaturedPhoto()
    setBusy(false)
    if (!ok) {
      Alert.alert('Échec', "Impossible d'épingler la photo. Réessaie.")
      return
    }
    setZoom({ ...photo, isPinned: willPin })
    onChanged()
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <BlurView
        intensity={40}
        tint="dark"
        experimentalBlurMethod="dimezisBlurView"
        style={s.flexOne}
      >
        <View style={s.vitrineModalBackdrop}>
          <SafeAreaView style={s.flexOne} edges={['top', 'bottom']}>
            <View style={s.vitrineModalHeader}>
              <Text style={s.vitrineModalTitle}>VITRINE</Text>
              <Pressable
                onPress={handleClose}
                hitSlop={12}
                style={s.vitrineModalClose}
                accessibilityRole="button"
                accessibilityLabel="Fermer la vitrine"
              >
                <X size={22} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={s.vitrineModalScroll}
              showsVerticalScrollIndicator={false}
            >
              <View style={s.galleryGrid}>
                {/* Tuile d'ajout — toujours en tête (visible même vitrine vide) */}
                <Pressable
                  onPress={handleAdd}
                  disabled={busy}
                  style={({ pressed }) => [
                    s.galleryAddTile,
                    { width: tileSize, height: tileSize },
                    pressed && !busy ? { opacity: 0.7 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une photo à la vitrine"
                >
                  {busy ? (
                    <ActivityIndicator color={colors.accent} size="small" />
                  ) : (
                    <>
                      <Plus size={24} color={colors.accent} strokeWidth={2} />
                      <Text style={s.galleryAddLabel}>Ajouter</Text>
                    </>
                  )}
                </Pressable>

                {photos.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setZoom(p)}
                    style={({ pressed }) => (pressed ? { opacity: 0.75 } : null)}
                    accessibilityRole="imagebutton"
                    accessibilityLabel="Zoomer la photo"
                  >
                    <ExpoImage
                      source={{ uri: p.photoUrl }}
                      style={[s.galleryTile, { width: tileSize, height: tileSize }]}
                      contentFit="cover"
                      transition={180}
                      cachePolicy="memory-disk"
                    />
                    {!p.isPublic && (
                      <View style={s.galleryPrivateBadge}>
                        <Lock size={11} color={colors.textPrimary} strokeWidth={2.5} />
                      </View>
                    )}
                    {p.isPinned && (
                      <View style={s.galleryPinBadge}>
                        <Pin
                          size={12}
                          color={colors.background}
                          fill={colors.background}
                          strokeWidth={2}
                        />
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>

              {photos.length === 0 && (
                <Text style={[s.galleryEmptyText, s.vitrineModalHint]}>
                  Ajoute une photo, ou prends-en une pendant une séance.
                </Text>
              )}
            </ScrollView>
          </SafeAreaView>

          {/* Zoom plein écran — couche absolue au-dessus de la grille */}
          {zoom && (
            <Pressable
              style={[StyleSheet.absoluteFill, s.lightboxBackdrop]}
              onPress={() => setZoom(null)}
            >
              <ExpoImage
                source={{ uri: zoom.photoUrl }}
                style={s.lightboxImage}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
              <Pressable
                style={s.lightboxClose}
                onPress={() => setZoom(null)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Fermer le zoom"
              >
                <X size={24} color={colors.textPrimary} strokeWidth={2} />
              </Pressable>

              {/* Épingler / désépingler — met la photo en tête de vitrine (toute source) */}
              <Pressable
                style={s.lightboxPin}
                onPress={() => void togglePin(zoom)}
                disabled={busy}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={zoom.isPinned ? 'Désépingler la photo' : 'Épingler la photo'}
              >
                <Pin
                  size={22}
                  color={zoom.isPinned ? colors.accent : colors.textPrimary}
                  fill={zoom.isPinned ? colors.accent : 'transparent'}
                  strokeWidth={2}
                />
              </Pressable>

              {zoom.source === 'workout' && zoom.workoutId ? (
                <Pressable
                  style={s.lightboxCta}
                  onPress={() => {
                    const id = zoom.workoutId as string
                    handleClose()
                    onOpenSession(id)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Voir la séance"
                >
                  <Text style={s.lightboxCtaText}>Voir la séance</Text>
                  <ChevronRight size={16} color={colors.background} strokeWidth={2.5} />
                </Pressable>
              ) : (
                <Pressable
                  style={s.lightboxDeleteBtn}
                  onPress={() => handleDelete(zoom)}
                  accessibilityRole="button"
                  accessibilityLabel="Supprimer la photo"
                >
                  <Trash2 size={16} color={colors.error} strokeWidth={2} />
                  <Text style={s.lightboxDeleteText}>Supprimer</Text>
                </Pressable>
              )}
            </Pressable>
          )}
        </View>
      </BlurView>
    </Modal>
  )
}

// ─── History row ──────────────────────────────────────────────────────────────

interface HistoryRowProps {
  item: WorkoutRow
  onPress: () => void
  colors: ReturnType<typeof useTheme>['colors']
}

function HistoryRowInProfile({ item, onPress, colors }: HistoryRowProps) {
  const { unit: weightUnit, formatVolume: formatVolumeU } = useWeightUnit()
  const d = new Date(item.started_at)
  const day = d.getDate().toString()
  const weekday = DAYS_FR[d.getDay()]
  const volumeStr = formatVolumeU(item.total_volume_kg ?? 0)
  const subtitleParts = [
    `${item.total_sets} série${item.total_sets > 1 ? 's' : ''}`,
    formatDuration(item.duration_sec),
  ]

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.card,
        { backgroundColor: colors.backgroundSecondary, marginBottom: spacing.s2 },
      ]}
    >
      <View style={styles.cardInner}>
        {/* Bloc date */}
        <View style={styles.dateBlock}>
          <Text
            style={[
              typography.title,
              {
                color: colors.textPrimary,
                fontSize: 22,
                lineHeight: 26,
                letterSpacing: -0.3,
                fontFamily: font.bold,
              },
            ]}
          >
            {day}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, textTransform: 'uppercase', marginTop: 2 },
            ]}
          >
            {weekday}
          </Text>
        </View>

        {/* Centre */}
        <View style={styles.centerCol}>
          <Text
            style={[typography.body, { color: colors.textPrimary, fontFamily: font.bold }]}
            numberOfLines={1}
          >
            {item.title ?? '—'}
          </Text>
          <Text
            style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={1}
          >
            {subtitleParts.join(' · ')}
          </Text>
        </View>

        {/* Right : icône PR + volume + chevron */}
        <View style={styles.rightCol}>
          {item.pr_seance === 'gold' && <Trophy size={14} color={colors.prGold} />}
          {item.pr_seance === 'silver' && <Trophy size={14} color={colors.prSilver} />}
          {item.pr_seance === 'bronze' && <Trophy size={14} color={colors.prBronze} />}
          <Text
            style={[
              typography.body,
              {
                color: colors.textPrimary,
                fontFamily: font.bold,
                fontVariant: ['tabular-nums'],
                fontSize: 14,
              },
            ]}
          >
            {volumeStr}{' '}
            <Text
              style={{
                fontFamily: font.regular,
                color: colors.textSecondary,
                fontSize: 12,
              }}
            >
              {weightUnit}
            </Text>
          </Text>
          <ChevronRight size={14} color={colors.textTertiary} style={{ marginTop: 2 }} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

// ─── Ligne historique : claim résolu (réussi = vert / raté = rouge) ─────────────

function ClaimHistoryRowInProfile({
  claim,
  colors,
}: {
  claim: Claim
  colors: ReturnType<typeof useTheme>['colors']
}) {
  const { unit: weightUnit, toDisplay } = useWeightUnit()
  const succeeded = claim.status === 'succeeded'
  const tone = succeeded ? colors.success : colors.error
  const d = new Date(claim.resolved_at ?? claim.created_at)
  const day = d.getDate().toString()
  const weekday = DAYS_FR[d.getDay()]
  const isWeight = claim.type === 'weight'
  const sub = isWeight ? (claim.exercise_name ?? 'Claim de charge') : 'Claim de séances'
  const targetLabel =
    claim.unit === 'kg'
      ? `${Math.round(toDisplay(claim.target_value))} ${weightUnit}`
      : `${claim.target_value} ${claim.unit}`

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.backgroundSecondary,
          marginBottom: spacing.s2,
          borderLeftWidth: 3,
          borderLeftColor: tone,
        },
      ]}
    >
      <View style={styles.cardInner}>
        {/* Bloc date (résolution) */}
        <View style={styles.dateBlock}>
          <Text
            style={[
              typography.title,
              {
                color: colors.textPrimary,
                fontSize: 22,
                lineHeight: 26,
                letterSpacing: -0.3,
                fontFamily: font.bold,
              },
            ]}
          >
            {day}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.textTertiary, textTransform: 'uppercase', marginTop: 2 },
            ]}
          >
            {weekday}
          </Text>
        </View>

        {/* Centre : cible + contexte */}
        <View style={styles.centerCol}>
          <Text
            style={[typography.body, { color: colors.textPrimary, fontFamily: font.bold }]}
            numberOfLines={1}
          >
            Claim · {targetLabel}
          </Text>
          <Text
            style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}
            numberOfLines={1}
          >
            {sub}
          </Text>
        </View>

        {/* Badge statut (vert réussi / rouge raté) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.s1,
            paddingVertical: 4,
            paddingHorizontal: spacing.s2,
            borderRadius: radius.full,
            backgroundColor: `${tone}1A`,
          }}
        >
          {succeeded ? (
            <CheckCircle2 size={13} color={tone} strokeWidth={2.5} />
          ) : (
            <X size={13} color={tone} strokeWidth={2.5} />
          )}
          <Text style={{ fontSize: 10, fontFamily: font.bold, color: tone, letterSpacing: 0.8 }}>
            {succeeded ? 'RÉUSSI' : 'MANQUÉ'}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ─── Animated counter ────────────────────────────────────────────────────────

const easeOutCubic = Easing.bezier(0.215, 0.61, 0.355, 1)

function AnimatedCounter({
  target,
  duration = 600,
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

export default function ProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const {
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
  } = useProfileData()

  const [deconnexionLoading, setDeconnexionLoading] = useState<boolean>(false)
  const [lightboxOpen, setLightboxOpen] = useState<boolean>(false)
  const [vitrineOpen, setVitrineOpen] = useState<boolean>(false)
  const [monthOpen, setMonthOpen] = useState<boolean>(false)
  const [prSheetOpen, setPrSheetOpen] = useState<boolean>(false)

  // PR vedette — appui long sur la carte → action sheet (changer / revenir à l'auto).
  function openPrSheet(): void {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setPrSheetOpen(true)
  }
  function handleChangePr(): void {
    setPrSheetOpen(false)
    router.push('/prs')
  }
  function handleResetPr(): void {
    setPrSheetOpen(false)
    void (async () => {
      await clearFeaturedPr()
      onRefresh()
    })()
  }
  function handleHidePr(): void {
    setPrSheetOpen(false)
    void (async () => {
      await hideFeaturedPr()
      onRefresh()
    })()
  }

  // Re-claim 1 tap (ORA-081) : réannonce le même objectif (createClaim expire l'ancien actif
  // s'il existe) puis refetch → la bande repasse en « claim actif ».
  function handleReclaim(c: Claim): void {
    void (async () => {
      await createClaim({
        type: c.type,
        exerciseId: c.exercise_id,
        exerciseName: c.exercise_name,
        targetValue: c.target_value,
        scope: c.scope,
        isPublic: c.is_public,
      })
      onRefresh()
    })()
  }

  // Annuler le claim actif : marqué raté (rouge), reste visible dans le feed + l'historique.
  function handleCancelClaim(c: Claim): void {
    void (async () => {
      await abandonClaim(c)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
      markFeedDirty() // force le refresh du feed même dans la fenêtre anti-refetch (ORA-067)
      onRefresh()
    })()
  }

  // Valider : scan réel des séances → réussi/raté (status change). NE refresh PAS ici —
  // c'est la ClaimBand qui déclenche le refresh après les 3 s mini d'animation (sinon
  // activeClaim passerait à null trop tôt et l'overlay se démonterait avant la fin).
  // Le claim refait surface dans le feed + l'historique au refresh.
  async function handleValidateClaim(c: Claim): Promise<Claim | null> {
    const resolved = await validateClaimNow(c)
    void Haptics.notificationAsync(
      resolved?.status === 'succeeded'
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning
    )
    markFeedDirty()
    return resolved
  }

  async function seDeconnecter(): Promise<void> {
    setDeconnexionLoading(true)
    await supabase.auth.signOut()
    setDeconnexionLoading(false)
    router.replace('/auth/login')
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const s = buildStyles(colors)

  const initiale = profile ? getInitiale(profile) : 'O'
  const fullName = profile ? getDisplayName(profile) : 'Athlète'
  const isPro = profile?.plan === 'premium'
  const avatarUrl = profile?.avatar_url ?? null
  const bio = profile?.bio ?? null

  function handleAvatarPress(): void {
    if (avatarUrl) setLightboxOpen(true)
    else router.push('/edit-profile')
  }

  return (
    <SafeAreaView style={[s.container]} edges={['top']}>
      <SectionList
        sections={historySections}
        keyExtractor={(item) => item.id}
        scrollEnabled
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={() => (
          <View style={s.headerContainer}>
            {/* Barre haut : nom + prénom centré · réglages à droite */}
            <View style={s.topBar}>
              <View style={s.topBarCenter}>
                <Text style={s.fullName} numberOfLines={1}>
                  {fullName}
                </Text>
                {isPro && (
                  <View style={s.proBadge}>
                    <Text style={s.proBadgeText}>PRO</Text>
                  </View>
                )}
              </View>
              <View style={s.topBarActions}>
                <Pressable
                  style={({ pressed }) => [s.gearBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => router.push('/prs')}
                  accessibilityRole="button"
                  accessibilityLabel="Armurerie"
                  hitSlop={8}
                >
                  <Shield size={17} color={colors.textSecondary} strokeWidth={1.75} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.gearBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => router.push('/analytics')}
                  accessibilityRole="button"
                  accessibilityLabel="Analytics"
                  hitSlop={8}
                >
                  <TrendingUp size={17} color={colors.textSecondary} strokeWidth={1.75} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [s.gearBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => router.push('/settings')}
                  accessibilityRole="button"
                  accessibilityLabel="Paramètres"
                  hitSlop={8}
                >
                  <Settings size={17} color={colors.textSecondary} strokeWidth={1.75} />
                </Pressable>
              </View>
            </View>

            {/* Identité : avatar (gauche) + stats sociales horizontales */}
            <View style={s.identityRow}>
              <Pressable
                onPress={handleAvatarPress}
                accessibilityLabel="Photo de profil"
                style={s.avatarWrap}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={s.avatarImage} />
                ) : (
                  <View style={s.avatarCircle}>
                    <Text style={s.avatarLetter}>{initiale}</Text>
                  </View>
                )}
              </Pressable>
              <View style={s.socialStats}>
                <SocialStat value={stats.seances} label="SÉANCES" colors={colors} />
                <View style={s.socialStat}>
                  <Text style={s.socialStatValue} allowFontScaling={false}>
                    {followers}
                  </Text>
                  <Text style={s.socialStatLabel}>ABONNÉS</Text>
                  {trackRecord.total > 0 && (
                    <Text
                      style={s.claimsUnder}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      allowFontScaling={false}
                    >
                      {Math.round((trackRecord.succeeded / trackRecord.total) * 100)}% claims sur{' '}
                      {trackRecord.total}
                    </Text>
                  )}
                </View>
                <SocialStat value={follows} label="ABONNEMENTS" colors={colors} />
              </View>
            </View>

            {/* Bio (sous l'avatar, à gauche) + vitrine photos (à droite) — ORA-085.
                Bande comprise entre l'avatar et la carte « cette semaine ». Tap bio → édition. */}
            <View style={s.bioVitrineRow}>
              <Pressable
                style={s.bioBlock}
                onPress={() => router.push('/edit-profile')}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={bio ? 'Modifier la bio' : 'Ajouter une bio'}
              >
                {bio ? (
                  <Text style={s.bioText} numberOfLines={3}>
                    {bio}
                  </Text>
                ) : (
                  <Text style={s.bioPlaceholder} numberOfLines={1}>
                    + Ajouter une bio
                  </Text>
                )}
              </Pressable>
              <PhotoStack
                photos={photoGallery}
                colors={colors}
                onOpen={() => setVitrineOpen(true)}
              />
            </View>

            {/* Streak + calendrier 7 jours + volume hebdo (haut du profil) */}
            <View style={s.statsCard}>
              {stats.streakSemaines > 0 && (
                <>
                  <View style={s.statSecondaryRow}>
                    <View style={s.statCol}>
                      <AnimatedCounter
                        target={stats.streakSemaines}
                        duration={1000}
                        delay={120}
                        style={s.statValueSide}
                      />
                      <Text style={s.statLabel}>STREAK SEM.</Text>
                    </View>
                  </View>
                  <View style={s.statSepH} />
                </>
              )}
              <View style={s.weekInCard}>
                <View style={s.weekHeaderRow}>
                  <Text style={[s.sectionLabel, { marginBottom: 0 }]}>CETTE SEMAINE</Text>
                  <Pressable
                    onPress={() => setMonthOpen(true)}
                    hitSlop={10}
                    style={s.monthTriggerBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Voir le calendrier du mois"
                  >
                    <CalendarDays size={18} color={colors.textSecondary} strokeWidth={2} />
                  </Pressable>
                </View>
                <WeekCalendar days={weekActivity} colors={colors} />
                {weeklyVolume.some((w) => w.volumeKg > 0) && (
                  <>
                    <View style={s.volTopGap} />
                    <Text style={s.sectionLabel}>VOLUME / SEMAINE</Text>
                    <WeeklyVolumeChart weeks={weeklyVolume} colors={colors} />
                  </>
                )}
              </View>
            </View>

            {/* CLAIM — aspiration (futur) */}
            <ClaimBand
              claim={activeClaim}
              recentFailed={recentFailedClaim}
              votes={claimVotes}
              colors={colors}
              onCreate={() => router.push('/claim/new')}
              onReclaim={handleReclaim}
              onCancel={handleCancelClaim}
              onValidate={handleValidateClaim}
              onRefresh={onRefresh}
            />

            {/* PR VEDETTE — preuve (passé) */}
            <PrVedetteCard
              pr={featuredPr}
              colors={colors}
              onPress={() => router.push('/prs')}
              onLongPress={openPrSheet}
            />

            {/* Historique title */}
            <Text style={[s.sectionTitle, { marginTop: spacing.s4, marginBottom: spacing.s4 }]}>
              HISTORIQUE
            </Text>
          </View>
        )}
        ListHeaderComponentStyle={s.headerContent}
        contentContainerStyle={s.contentContainer}
        renderSectionHeader={({ section }) => <Text style={s.sectionHeader}>{section.title}</Text>}
        renderItem={({ item }) =>
          item.kind === 'claim' ? (
            <ClaimHistoryRowInProfile claim={item.claim} colors={colors} />
          ) : (
            <HistoryRowInProfile
              item={item}
              onPress={() => router.push(`/history/${item.id}` as const)}
              colors={colors}
            />
          )
        }
        ItemSeparatorComponent={() => null}
        SectionSeparatorComponent={() => null}
        ListFooterComponent={() => (
          <View style={s.footerContainer}>
            <Pressable
              style={({ pressed }) => [s.deconnexionBtn, pressed && { opacity: 0.6 }]}
              onPress={() => void seDeconnecter()}
              disabled={deconnexionLoading}
            >
              {deconnexionLoading ? (
                <ActivityIndicator color={colors.textTertiary} size="small" />
              ) : (
                <Text style={s.deconnexionText}>Déconnexion</Text>
              )}
            </Pressable>
          </View>
        )}
      />

      {/* Calendrier du mois (même style que la semaine) */}
      <MonthCalendar
        visible={monthOpen}
        sessions={monthSessions}
        colors={colors}
        onClose={() => setMonthOpen(false)}
      />

      {/* Vitrine plein écran (grille + zoom) */}
      <VitrineModal
        visible={vitrineOpen}
        photos={photoGallery}
        colors={colors}
        onClose={() => setVitrineOpen(false)}
        onOpenSession={(id) => router.push(`/history/${id}` as const)}
        onChanged={onRefresh}
      />

      {/* Lightbox photo de profil */}
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxOpen(false)}
      >
        <Pressable style={s.lightboxBackdrop} onPress={() => setLightboxOpen(false)}>
          {avatarUrl && (
            <Image source={{ uri: avatarUrl }} style={s.lightboxImage} resizeMode="contain" />
          )}
          <Pressable
            style={s.lightboxClose}
            onPress={() => setLightboxOpen(false)}
            hitSlop={12}
            accessibilityLabel="Fermer"
          >
            <X size={24} color={colors.textPrimary} strokeWidth={2} />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Action sheet PR vedette — appui long sur la carte */}
      <Modal
        visible={prSheetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPrSheetOpen(false)}
      >
        <Pressable style={s.prSheetBackdrop} onPress={() => setPrSheetOpen(false)}>
          <Pressable style={s.prSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.prSheetHandle} />
            <Text style={s.prSheetTitle}>PR VEDETTE</Text>

            <Pressable
              style={({ pressed }) => [s.prSheetItem, pressed && { opacity: 0.6 }]}
              onPress={handleChangePr}
              accessibilityRole="button"
            >
              <Trophy size={18} color={colors.prGold} strokeWidth={2} />
              <Text style={s.prSheetItemText}>
                {featuredPr?.hidden ? 'Accrocher un PR vedette' : 'Choisir un autre record'}
              </Text>
            </Pressable>

            {/* Masquer : neutralise l'auto-pick → slot CTA. Caché si déjà masqué. */}
            {!featuredPr?.hidden && (
              <Pressable
                style={({ pressed }) => [s.prSheetItem, pressed && { opacity: 0.6 }]}
                onPress={handleHidePr}
                accessibilityRole="button"
              >
                <EyeOff size={18} color={colors.textSecondary} strokeWidth={2} />
                <Text style={s.prSheetItemText}>Masquer le PR vedette</Text>
              </Pressable>
            )}

            {featuredPr?.manual && (
              <Pressable
                style={({ pressed }) => [s.prSheetItem, pressed && { opacity: 0.6 }]}
                onPress={handleResetPr}
                accessibilityRole="button"
              >
                <RotateCcw size={18} color={colors.textSecondary} strokeWidth={2} />
                <Text style={s.prSheetItemText}>Revenir au choix automatique</Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [s.prSheetCancel, pressed && { opacity: 0.6 }]}
              onPress={() => setPrSheetOpen(false)}
              accessibilityRole="button"
            >
              <Text style={s.prSheetCancelText}>Annuler</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
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
    flexOne: { flex: 1 },
    headerContent: {},
    contentContainer: {
      paddingHorizontal: spacing.s5,
    },
    headerContainer: {
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s2,
      paddingBottom: spacing.s2,
    },

    // ── Top bar (nom centré + réglages) ──
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s2,
    },
    topBarCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: spacing.s2,
    },
    fullName: {
      ...typography.title,
      fontSize: 27,
      lineHeight: 32,
      color: colors.textPrimary,
      fontFamily: font.bold,
      flexShrink: 1,
      textAlign: 'center',
    },
    gearBtn: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // ── Identité (avatar dans le coin + stats sociales) ──
    identityRow: {
      position: 'relative',
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 85,
      // avatar absolu débordant de spacing.s5 à gauche → bord droit avatar à 65, + gouttière s5
      paddingLeft: 85,
      marginBottom: spacing.s4,
    },
    // Avatar épinglé dans le coin haut-gauche, remonté au-dessus de la barre titre.
    // Taille fixe 64 — ne pas redimensionner.
    avatarWrap: {
      position: 'absolute',
      left: -spacing.s2,
      top: spacing.s3,
      zIndex: 2,
    },
    avatarCircle: {
      width: 85,
      height: 85,
      borderRadius: 43,
      backgroundColor: colors.backgroundTertiary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarImage: {
      width: 85,
      height: 85,
      borderRadius: 43,
      backgroundColor: colors.backgroundTertiary,
    },
    avatarLetter: {
      ...typography.title,
      fontSize: 36,
      lineHeight: 40,
      fontFamily: font.black,
      color: colors.textSecondary,
    },
    socialStats: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'flex-start',
      paddingLeft: spacing.s6,
    },
    // Bande sous l'avatar : bio (gauche, extensible) + pile vitrine (droite).
    bioVitrineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.s3,
      marginBottom: spacing.s2,
    },
    bioBlock: {
      flex: 1,
    },
    bioText: {
      fontSize: 13,
      lineHeight: 17,
      fontFamily: font.regular,
      color: colors.textSecondary,
      letterSpacing: -0.1,
    },
    bioPlaceholder: {
      fontSize: 13,
      lineHeight: 17,
      fontFamily: font.medium,
      color: colors.textTertiary,
    },
    socialStat: {
      alignItems: 'center',
      flex: 1,
    },
    socialStatValue: {
      fontSize: 15,
      fontFamily: font.bold,
      color: colors.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 18,
      fontVariant: ['tabular-nums'],
    },
    socialStatLabel: {
      fontSize: 9,
      fontFamily: font.medium,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginTop: 1,
      textAlign: 'center',
    },
    claimsUnder: {
      fontSize: 11,
      fontFamily: font.medium,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      marginTop: spacing.s2,
    },

    proBadge: {
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      height: 22,
      paddingHorizontal: spacing.s2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    proBadgeText: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.background,
      letterSpacing: 1,
    },

    // ── Actions ──
    topBarActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      marginRight: -spacing.s2,
    },

    // ── Claim ──
    claimEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      paddingVertical: spacing.s4,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s4,
    },
    claimEmptyIcon: {
      width: 36,
      height: 36,
      borderRadius: radius.full,
      backgroundColor: `${colors.accent}1A`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    claimEmptyTitle: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },
    claimEmptySub: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: 1,
    },
    claimCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s4,
      paddingHorizontal: spacing.s4,
      paddingLeft: spacing.s4 + 3,
      marginBottom: spacing.s4,
      overflow: 'hidden',
    },
    claimAccentBar: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 3,
      backgroundColor: colors.accent,
    },
    claimHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s3,
    },
    claimTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
    },
    claimTagText: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.accent,
      letterSpacing: 1.2,
    },
    claimDeadline: {
      fontSize: 11,
      fontFamily: font.medium,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    claimTargetRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: spacing.s3,
      marginBottom: spacing.s3,
    },
    claimTargetValue: {
      fontSize: 28,
      fontFamily: font.extraBold,
      color: colors.textPrimary,
      letterSpacing: -0.8,
      fontVariant: ['tabular-nums'],
    },
    claimTargetUnit: {
      fontSize: 16,
      fontFamily: font.bold,
      color: colors.textSecondary,
    },
    claimExercise: {
      ...typography.body,
      fontSize: 14,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    claimProgressWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      marginBottom: spacing.s3,
    },
    claimProgressTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.backgroundTertiary,
      overflow: 'hidden',
    },
    claimProgressFill: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accent,
    },
    claimProgressLabel: {
      fontSize: 12,
      fontFamily: font.bold,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    claimVotesRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
    },
    claimVoteChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
    },
    claimVoteCount: {
      fontSize: 13,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    claimVoteLabel: {
      ...typography.caption,
      color: colors.textTertiary,
    },
    claimVoteSep: {
      color: colors.textTertiary,
      fontSize: 13,
    },

    // ── Actions claim actif (annuler / valider) ──
    claimActionsRow: {
      flexDirection: 'row',
      gap: spacing.s2,
      marginTop: spacing.s4,
    },
    claimCancelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s1,
      paddingVertical: spacing.s2,
      paddingHorizontal: spacing.s4,
      borderRadius: radius.full,
      backgroundColor: colors.backgroundTertiary,
    },
    claimCancelText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textSecondary,
    },
    claimValidateBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s2,
      paddingVertical: spacing.s2,
      borderRadius: radius.full,
      backgroundColor: colors.accent,
    },
    claimValidateText: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.background,
    },

    // ── Validation en cours (scan réel des séances) ──
    claimScanWrap: {
      gap: spacing.s3,
      marginTop: spacing.s2,
    },
    claimScanHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
    },
    claimScanEmoji: {
      fontSize: 16,
    },
    claimScanLabel: {
      ...typography.caption,
      fontFamily: font.bold,
      color: colors.textPrimary,
    },

    // ── Near-miss (claim raté, ORA-081) — discret, ni rouge ni accent ──
    nearMissCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.s4,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s4,
      gap: spacing.s2,
    },
    nearMissHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    nearMissTag: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.textSecondary,
      letterSpacing: 1.2,
    },
    nearMissGapLabel: {
      fontSize: 11,
      fontFamily: font.medium,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    nearMissTarget: {
      fontSize: 20,
      fontFamily: font.bold,
      color: colors.textSecondary,
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },
    nearMissReached: {
      ...typography.caption,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    nearMissActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      marginTop: spacing.s2,
    },
    reclaimBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s2,
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      paddingHorizontal: spacing.s5,
      height: touchTarget.min,
    },
    reclaimBtnText: {
      ...typography.body,
      fontFamily: font.bold,
      fontSize: 14,
      color: colors.background,
    },
    reclaimAltBtn: {
      justifyContent: 'center',
      height: touchTarget.min,
      paddingHorizontal: spacing.s2,
    },
    reclaimAltText: {
      ...typography.caption,
      fontFamily: font.medium,
      color: colors.textSecondary,
    },

    // ── PR vedette ──
    prVedetteCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: `${colors.prGold}24`,
      paddingVertical: spacing.s4,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s5,
    },
    prVedetteHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s3,
    },
    prVedetteTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
    },
    prVedetteTagText: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.prGold,
      letterSpacing: 1.2,
    },
    prVedetteBadge: {
      backgroundColor: `${colors.prGold}1A`,
      borderRadius: radius.full,
      paddingHorizontal: spacing.s2,
      paddingVertical: 2,
    },
    prVedetteBadgeText: {
      fontSize: 9,
      fontFamily: font.bold,
      color: colors.prGold,
      letterSpacing: 1,
    },
    prVedetteMain: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
    },
    // Corps aligné à droite → quinconce visuel vs la bande Claim (alignée à gauche)
    prVedetteTextCol: {
      flex: 1,
      alignItems: 'flex-end',
    },
    prVedetteValue: {
      fontSize: 32,
      fontFamily: font.black,
      color: colors.prGold,
      letterSpacing: -1,
      lineHeight: 36,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    prVedetteUnit: {
      fontSize: 18,
      fontFamily: font.bold,
      color: colors.prGold,
    },
    prVedetteExercise: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textPrimary,
      marginTop: 2,
      textAlign: 'right',
    },
    prVedetteDelta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: 'right',
    },
    prVedetteEmpty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingVertical: spacing.s4,
      paddingHorizontal: spacing.s4,
      marginBottom: spacing.s5,
    },
    prVedetteEmptyText: {
      ...typography.caption,
      color: colors.textTertiary,
      flex: 1,
    },

    // ── Action sheet PR vedette ──
    prSheetBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(10,10,15,0.55)',
      justifyContent: 'flex-end',
    },
    prSheet: {
      backgroundColor: colors.backgroundTertiary,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s3,
      paddingBottom: spacing.s8,
    },
    prSheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: radius.full,
      backgroundColor: colors.border,
      marginBottom: spacing.s4,
    },
    prSheetTitle: {
      fontSize: 10,
      fontFamily: font.bold,
      color: colors.textTertiary,
      letterSpacing: 1.2,
      marginBottom: spacing.s3,
    },
    prSheetItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s3,
      height: touchTarget.comfort,
    },
    prSheetItemText: {
      ...typography.body,
      fontFamily: font.medium,
      color: colors.textPrimary,
    },
    prSheetCancel: {
      alignItems: 'center',
      justifyContent: 'center',
      height: touchTarget.comfort,
      marginTop: spacing.s2,
      borderRadius: radius.md,
      backgroundColor: colors.backgroundSecondary,
    },
    prSheetCancelText: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.textSecondary,
    },

    // ── Stats card ──
    statsCard: {
      flexDirection: 'column',
      paddingVertical: spacing.s2,
      marginTop: spacing.s5,
      marginBottom: spacing.s5,
    },
    statHeroRow: {
      alignItems: 'center',
      paddingVertical: spacing.s2,
    },
    statSepH: {
      height: 1,
      backgroundColor: colors.separator,
      marginHorizontal: spacing.s4,
      marginBottom: spacing.s2,
    },
    statSecondaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statCol: {
      flex: 1,
      alignItems: 'center',
    },
    statValueSide: {
      ...typography.display,
      fontSize: 22,
      lineHeight: 24,
      letterSpacing: -0.5,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statValueHero: {
      ...typography.hero,
      fontSize: 34,
      lineHeight: 38,
      letterSpacing: -1,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      marginTop: spacing.s1,
      textAlign: 'center',
    },

    // ── Section label commun ──
    sectionLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: spacing.s3,
    },

    // ── Tooltip flottant (calendrier + graph) ──
    tooltip: {
      position: 'absolute',
      top: -54,
      zIndex: 10,
      alignItems: 'center',
      paddingVertical: spacing.s2,
      paddingHorizontal: spacing.s3,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.35,
      shadowRadius: 12,
      elevation: 6,
    },
    tooltipTitle: {
      fontSize: 10,
      fontFamily: font.medium,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    tooltipValue: {
      fontSize: 14,
      fontFamily: font.bold,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    tooltipPointer: {
      position: 'absolute',
      bottom: -5,
      width: 10,
      height: 10,
      backgroundColor: colors.backgroundTertiary,
      borderRightWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
      transform: [{ rotate: '45deg' }],
    },

    // ── Calendrier 7 jours ──
    weekInCard: {
      paddingTop: spacing.s1,
    },
    weekHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s3,
    },
    monthTriggerBtn: {
      width: 32,
      height: 32,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calWrap: {
      position: 'relative',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    weekCol: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.s2,
    },
    weekLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
    },
    weekLabelToday: {
      color: colors.textPrimary,
    },
    weekCell: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: 'transparent',
    },
    weekCellActive: {
      backgroundColor: colors.prGold,
      borderColor: colors.prGold,
    },
    weekCellToday: {
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    weekCellSelected: {
      borderColor: colors.accent,
      borderWidth: 1.5,
    },
    weekDayNumToday: {
      color: colors.textPrimary,
    },
    weekDayNum: {
      ...typography.caption,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
    },

    // ── Calendrier mensuel (modal) ──
    monthBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.s5,
    },
    monthCard: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.s5,
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.s5,
    },
    monthNavBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundTertiary,
    },
    monthTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    monthDowRow: {
      flexDirection: 'row',
      marginBottom: spacing.s2,
    },
    monthDowCol: {
      flex: 1,
      alignItems: 'center',
    },
    monthWeekRow: {
      flexDirection: 'row',
      marginBottom: spacing.s2,
    },
    monthDetail: {
      marginTop: spacing.s3,
      alignItems: 'center',
      minHeight: 20,
    },
    monthDetailText: {
      ...typography.body,
      fontSize: 13,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },

    // ── Volume hebdomadaire (graph interactif + axe Y discret) ──
    volTopGap: {
      height: spacing.s4,
    },
    volOuter: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    volAxisCol: {
      width: 40,
      height: 72,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      paddingRight: spacing.s2,
    },
    volAxisLabel: {
      fontSize: 9,
      fontFamily: font.medium,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
      lineHeight: 10,
    },
    volChartArea: {
      flex: 1,
      height: 72,
      position: 'relative',
    },
    volGrid: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 1,
      backgroundColor: colors.separator,
    },
    volSvg: {
      position: 'absolute',
      left: 0,
      top: 0,
    },
    volTouchLayer: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 5,
    },

    // ── Vitrine — pile compacte (aperçu profil) ──
    vitrineWrap: {
      alignItems: 'flex-end',
    },
    vitrineBtn: {
      paddingVertical: spacing.s1,
      paddingHorizontal: spacing.s2,
    },
    vitrineThumbs: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    vitrineThumb: {
      width: 36,
      height: 36,
      borderRadius: radius.sm,
      backgroundColor: colors.backgroundTertiary,
      borderWidth: 2,
      borderColor: colors.background,
    },
    // Hero — vignette agrandie en tête (photo épinglée ou la plus récente)
    vitrineHeroWrap: {
      zIndex: STACK_MAX, // au-dessus des petites vignettes empilées derrière
    },
    vitrineHero: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.backgroundTertiary,
      borderWidth: 2,
      borderColor: colors.background,
    },
    vitrineHeroPinned: {
      borderColor: colors.accent, // liseré accent = photo épinglée mise en avant
    },
    vitrinePinBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    vitrineMore: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    vitrineMoreText: {
      fontSize: 11,
      fontFamily: font.bold,
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    vitrineThumbEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      borderColor: colors.border,
    },

    // ── Vitrine — modal plein écran ──
    vitrineModalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(10,10,15,0.35)',
    },
    vitrineModalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.s5,
      paddingTop: spacing.s4,
      paddingBottom: spacing.s4,
    },
    vitrineModalTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      fontFamily: font.bold,
    },
    vitrineModalClose: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: -spacing.s2,
    },
    vitrineModalScroll: {
      paddingHorizontal: spacing.s5,
      paddingBottom: spacing.s8,
    },
    vitrineModalHint: {
      marginTop: spacing.s5,
      paddingHorizontal: spacing.s6,
    },

    // ── Grille photos (modal) ──
    galleryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.s2,
    },
    galleryTile: {
      borderRadius: radius.md,
      backgroundColor: colors.backgroundTertiary,
    },
    galleryAddTile: {
      borderRadius: radius.md,
      backgroundColor: colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.s1,
    },
    galleryAddLabel: {
      ...typography.caption,
      color: colors.accent,
      fontFamily: font.bold,
    },
    galleryPrivateBadge: {
      position: 'absolute',
      top: spacing.s2,
      left: spacing.s2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(10,10,15,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryPinBadge: {
      position: 'absolute',
      top: spacing.s2,
      right: spacing.s2,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    galleryEmptyText: {
      ...typography.caption,
      color: colors.textTertiary,
      textAlign: 'center',
    },

    // ── Historique ──
    sectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    sectionHeader: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      paddingTop: spacing.s6,
      paddingBottom: spacing.s3,
    },

    // ── Déconnexion ──
    footerContainer: {
      paddingVertical: spacing.s6,
      alignItems: 'center',
    },
    deconnexionBtn: {
      alignItems: 'center',
      paddingVertical: spacing.s5,
      minHeight: 44,
      justifyContent: 'center',
    },
    deconnexionText: {
      ...typography.body,
      color: colors.textSecondary,
    },

    // ── Lightbox ──
    lightboxBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.95)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxImage: {
      width: '90%',
      height: '70%',
    },
    lightboxClose: {
      position: 'absolute',
      top: 56,
      right: 24,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxPin: {
      position: 'absolute',
      top: 56,
      left: 24,
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lightboxCta: {
      position: 'absolute',
      bottom: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
      backgroundColor: colors.accent,
      borderRadius: radius.full,
      paddingHorizontal: spacing.s5,
      height: touchTarget.min,
    },
    lightboxCtaText: {
      ...typography.body,
      fontFamily: font.bold,
      fontSize: 14,
      color: colors.background,
    },
    lightboxDeleteBtn: {
      position: 'absolute',
      bottom: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: `${colors.error}40`,
      paddingHorizontal: spacing.s5,
      height: touchTarget.min,
    },
    lightboxDeleteText: {
      ...typography.body,
      fontFamily: font.bold,
      fontSize: 14,
      color: colors.error,
    },
  })
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s4,
    gap: spacing.s3,
  },
  dateBlock: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  centerCol: {
    flex: 1,
    minWidth: 0,
  },
  rightCol: {
    alignItems: 'flex-end',
    flexShrink: 0,
    gap: 2,
  },
})
