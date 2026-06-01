import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Camera, AlertCircle, Calendar } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { inputRecipe, InputState } from '@/constants/recipes'
import RulerPicker from '@/components/RulerPicker'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileForm {
  username: string
  fullName: string
  dateDay: string    // "DD"
  dateMonth: string  // "MM"
  dateYear: string   // "YYYY"
  poidsKg: string
  tailleCm: string
}

interface ProfileErrors {
  username?: string
  fullName?: string
  dateNaissance?: string
  poidsKg?: string
  tailleCm?: string
  global?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoToDateParts(iso: string): { day: string; month: string; year: string } {
  const p = iso.split('-')
  if (p.length === 3) return { day: p[2] ?? '', month: p[1] ?? '', year: p[0] ?? '' }
  return { day: '', month: '', year: '' }
}

function buildIsoDate(day: string, month: string, year: string): string | null {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) return null
  const d = parseInt(day, 10), m = parseInt(month, 10), y = parseInt(year, 10)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) return null
  return `${year}-${month}-${day}`
}

function getInitiales(fullName: string, username: string): string {
  if (fullName.trim()) {
    const words = fullName.trim().split(/\s+/)
    if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
    return (words[0][0] ?? '?').toUpperCase()
  }
  return username.trim().charAt(0).toUpperCase() || '?'
}

async function uploadAvatarToStorage(localUri: string, uid: string): Promise<string | null> {
  try {
    const response = await fetch(localUri)
    const blob = await response.blob()
    const rawExt = localUri.split('.').pop()?.split('?')[0]?.toLowerCase()
    const ext = rawExt === 'png' ? 'png' : 'jpg'
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
    const path = `${uid}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { upsert: true, contentType })

    if (error) throw error

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return `${data.publicUrl}?t=${Date.now()}`
  } catch {
    return null
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const dayRef = useRef<TextInput>(null)
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)

  const [form, setForm] = useState<ProfileForm>({
    username: '',
    fullName: '',
    dateDay: '',
    dateMonth: '',
    dateYear: '',
    poidsKg: '',
    tailleCm: '',
  })
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarLocalUri, setAvatarLocalUri] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [usernameFocused, setUsernameFocused] = useState(false)
  const [fullNameFocused, setFullNameFocused] = useState(false)
  const [showPoidsRuler, setShowPoidsRuler] = useState(false)
  const [showTailleRuler, setShowTailleRuler] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadProfile = useCallback(async (isRefresh = false): Promise<void> => {
    if (!isRefresh) setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/auth/login'); return }
      setUserId(user.id)

      const { data, error } = await supabase
        .from('users')
        .select('username, full_name, avatar_url, date_naissance, height_cm')
        .eq('id', user.id)
        .single()

      if (error) throw error

      const { data: metricsData } = await supabase
        .from('body_metrics')
        .select('weight_kg')
        .eq('user_id', user.id)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const dateParts = data.date_naissance ? isoToDateParts(data.date_naissance) : { day: '', month: '', year: '' }

      setAvatarUrl((data as { avatar_url?: string | null }).avatar_url ?? null)
      setAvatarLocalUri(null)
      setForm({
        username: (data as { username?: string | null }).username ?? '',
        fullName: (data as { full_name?: string | null }).full_name ?? '',
        dateDay: dateParts.day,
        dateMonth: dateParts.month,
        dateYear: dateParts.year,
        poidsKg: metricsData?.weight_kg ? String(metricsData.weight_kg) : '',
        tailleCm: (data as { height_cm?: number | null }).height_cm
          ? String((data as { height_cm?: number | null }).height_cm)
          : '',
      })
      setErrors({})
    } catch {
      setErrors({ global: 'Impossible de charger le profil.' })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [router])

  useEffect(() => { void loadProfile() }, [loadProfile])

  const onRefresh = useCallback((): void => {
    setRefreshing(true)
    void loadProfile(true)
  }, [loadProfile])

  function validate(): boolean {
    const e: ProfileErrors = {}
    if (!form.username.trim()) e.username = "Nom d'utilisateur requis"
    else if (form.username.length < 3) e.username = 'Minimum 3 caractères'
    if (!form.fullName.trim()) e.fullName = 'Nom complet requis'

    const hasAnyDatePart = form.dateDay || form.dateMonth || form.dateYear
    if (hasAnyDatePart && !buildIsoDate(form.dateDay, form.dateMonth, form.dateYear)) {
      e.dateNaissance = 'Date invalide — format : jj / mm / aaaa'
    }

    if (form.poidsKg) {
      const p = parseFloat(form.poidsKg)
      if (isNaN(p) || p < 20 || p > 500) e.poidsKg = 'Poids invalide (20–500 kg)'
    }
    if (form.tailleCm) {
      const t = parseFloat(form.tailleCm)
      if (isNaN(t) || t < 100 || t > 250) e.tailleCm = 'Taille invalide (100–250 cm)'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function saveProfile(): Promise<void> {
    if (!validate() || !userId) return
    setSaving(true)
    setErrors({})

    try {
      let finalAvatarUrl = avatarUrl

      if (avatarLocalUri) {
        const uploaded = await uploadAvatarToStorage(avatarLocalUri, userId)
        if (!uploaded) {
          setErrors({ global: "Impossible d'uploader la photo. Réessaie." })
          setSaving(false)
          return
        }
        finalAvatarUrl = uploaded
        setAvatarUrl(uploaded)
        setAvatarLocalUri(null)
      }

      const isoDate = buildIsoDate(form.dateDay, form.dateMonth, form.dateYear)

      const { error: userError } = await supabase
        .from('users')
        .update({
          username: form.username.trim(),
          full_name: form.fullName.trim(),
          date_naissance: isoDate,
          avatar_url: finalAvatarUrl,
          height_cm: form.tailleCm ? parseFloat(form.tailleCm) : null,
        })
        .eq('id', userId)

      if (userError) throw userError

      if (form.poidsKg) {
        const poidsNum = parseFloat(form.poidsKg)
        if (!isNaN(poidsNum)) {
          const { error: metricsError } = await supabase.from('body_metrics').insert({
            user_id: userId,
            weight_kg: poidsNum,
            measured_at: new Date().toISOString(),
          })
          if (metricsError) throw metricsError
        }
      }

      router.back()
    } catch {
      setErrors({ global: 'Erreur lors de la sauvegarde.' })
    } finally {
      setSaving(false)
    }
  }

  async function pickAvatar(): Promise<void> {
    Alert.alert('Photo de profil', 'Choisir depuis…', [
      {
        text: 'Galerie',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission refusée', "Accorde l'accès à la galerie dans les Réglages.")
            return
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
          if (!result.canceled && result.assets[0]) {
            setAvatarUrl(result.assets[0].uri)
            setAvatarLocalUri(result.assets[0].uri)
          }
        },
      },
      {
        text: 'Caméra',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync()
          if (status !== 'granted') {
            Alert.alert('Permission refusée', "Accorde l'accès à la caméra dans les Réglages.")
            return
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          })
          if (!result.canceled && result.assets[0]) {
            setAvatarUrl(result.assets[0].uri)
            setAvatarLocalUri(result.assets[0].uri)
          }
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ])
  }

  async function seDeconnecter(): Promise<void> {
    await supabase.auth.signOut()
    router.replace('/auth/login')
  }

  const s = buildStyles(colors)
  const initiales = getInitiales(form.fullName, form.username)

  if (loading) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const dateHasError = !!errors.dateNaissance
  const dateIsFilled = form.dateDay.length > 0 || form.dateMonth.length > 0 || form.dateYear.length > 0

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Modifier le profil</Text>
        <Pressable
          style={s.saveBtn}
          onPress={() => void saveProfile()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Enregistrer"
        >
          {saving
            ? <ActivityIndicator color={colors.accent} size="small" />
            : <Text style={s.saveBtnLabel}>Enregistrer</Text>
          }
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >

        {/* ── Avatar ── */}
        <View style={s.avatarSection}>
          <Pressable
            style={s.avatarWrap}
            onPress={() => void pickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Changer la photo de profil"
          >
            {avatarUrl
              ? <Image source={{ uri: avatarUrl }} style={s.avatar} />
              : (
                <View style={s.avatarPlaceholder}>
                  <Text style={s.avatarInitials}>{initiales}</Text>
                </View>
              )
            }
            <View style={s.cameraBadge}>
              <Camera size={14} color={colors.background} strokeWidth={2.5} />
            </View>
          </Pressable>
          <Text style={s.avatarLabel}>
            {avatarLocalUri ? 'Photo sélectionnée · non enregistrée' : 'Modifier la photo'}
          </Text>
        </View>

        {/* ── Erreur globale ── */}
        {errors.global ? (
          <View style={s.errorBanner}>
            <AlertCircle size={14} color={colors.error} strokeWidth={2} />
            <Text style={s.errorBannerText}>{errors.global}</Text>
          </View>
        ) : null}

        {/* ── Section Identité ── */}
        <Text style={s.sectionLabel}>IDENTITÉ</Text>
        <View style={s.sectionCard}>

          {/* Nom d'utilisateur */}
          {(() => {
            const state: InputState =
              errors.username ? 'error' :
              usernameFocused ? 'active' :
              form.username.length > 0 ? 'filled' : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>NOM D&apos;UTILISATEUR</Text>
                <View style={[r.container, s.transparentInput]}>
                  <TextInput
                    style={r.input}
                    value={form.username}
                    onChangeText={v => setForm(f => ({ ...f, username: v }))}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => setUsernameFocused(false)}
                    placeholder="@tonpseudo"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                  />
                  {errors.username
                    ? <View style={r.icon}><AlertCircle size={16} color={colors.error} strokeWidth={2} /></View>
                    : null
                  }
                </View>
                {errors.username ? <Text style={r.helper}>{errors.username}</Text> : null}
              </View>
            )
          })()}

          <View style={s.fieldSep} />

          {/* Nom complet */}
          {(() => {
            const state: InputState =
              errors.fullName ? 'error' :
              fullNameFocused ? 'active' :
              form.fullName.length > 0 ? 'filled' : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>NOM COMPLET</Text>
                <View style={[r.container, s.transparentInput]}>
                  <TextInput
                    style={r.input}
                    value={form.fullName}
                    onChangeText={v => setForm(f => ({ ...f, fullName: v }))}
                    onFocus={() => setFullNameFocused(true)}
                    onBlur={() => setFullNameFocused(false)}
                    placeholder="Prénom Nom"
                    placeholderTextColor={colors.textTertiary}
                    textContentType="name"
                  />
                  {errors.fullName
                    ? <View style={r.icon}><AlertCircle size={16} color={colors.error} strokeWidth={2} /></View>
                    : null
                  }
                </View>
                {errors.fullName ? <Text style={r.helper}>{errors.fullName}</Text> : null}
              </View>
            )
          })()}

        </View>

        {/* ── Section Mesures ── */}
        <Text style={s.sectionLabel}>MESURES</Text>
        <View style={s.sectionCard}>

          {/* Date de naissance — 3 champs séparés */}
          <View style={s.fieldGroup}>
            <View style={s.dateHeader}>
              <Text style={[s.dateLabel, dateHasError && { color: colors.error }]}>
                DATE DE NAISSANCE
              </Text>
              <Calendar size={14} color={dateHasError ? colors.error : colors.textTertiary} strokeWidth={1.5} />
            </View>
            <View style={[s.dateRow, dateHasError && s.dateRowError]}>
              {/* JJ */}
              <View style={s.dateSegment}>
                <TextInput
                  ref={dayRef}
                  style={[s.dateInput, { color: form.dateDay ? colors.textPrimary : colors.textTertiary }]}
                  value={form.dateDay}
                  onChangeText={v => {
                    const d = v.replace(/\D/g, '').slice(0, 2)
                    setForm(f => ({ ...f, dateDay: d }))
                    if (d.length === 2) monthRef.current?.focus()
                  }}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && form.dateDay === '') {
                      // nothing to go back to
                    }
                  }}
                  placeholder="JJ"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  maxLength={2}
                  returnKeyType="next"
                />
              </View>
              <Text style={s.dateSep}>/</Text>
              {/* MM */}
              <View style={s.dateSegment}>
                <TextInput
                  ref={monthRef}
                  style={[s.dateInput, { color: form.dateMonth ? colors.textPrimary : colors.textTertiary }]}
                  value={form.dateMonth}
                  onChangeText={v => {
                    const d = v.replace(/\D/g, '').slice(0, 2)
                    setForm(f => ({ ...f, dateMonth: d }))
                    if (d.length === 2) yearRef.current?.focus()
                  }}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && form.dateMonth === '') {
                      dayRef.current?.focus()
                    }
                  }}
                  placeholder="MM"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  maxLength={2}
                  returnKeyType="next"
                />
              </View>
              <Text style={s.dateSep}>/</Text>
              {/* AAAA */}
              <View style={[s.dateSegment, s.dateYearSegment]}>
                <TextInput
                  ref={yearRef}
                  style={[s.dateInput, { color: form.dateYear ? colors.textPrimary : colors.textTertiary }]}
                  value={form.dateYear}
                  onChangeText={v => {
                    const d = v.replace(/\D/g, '').slice(0, 4)
                    setForm(f => ({ ...f, dateYear: d }))
                  }}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && form.dateYear === '') {
                      monthRef.current?.focus()
                    }
                  }}
                  placeholder="AAAA"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="numeric"
                  maxLength={4}
                  returnKeyType="done"
                />
              </View>
            </View>
            {dateHasError ? (
              <View style={s.dateError}>
                <AlertCircle size={12} color={colors.error} strokeWidth={2} />
                <Text style={[s.dateErrorText, { color: colors.error }]}>{errors.dateNaissance}</Text>
              </View>
            ) : null}
          </View>

          <View style={s.fieldSep} />

          {/* Taille */}
          {(() => {
            const state: InputState = errors.tailleCm ? 'error' : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>TAILLE</Text>
                {showTailleRuler ? (
                  <View style={s.rulerWrap}>
                    <RulerPicker
                      value={form.tailleCm ? parseFloat(form.tailleCm) : 170}
                      min={140}
                      max={220}
                      step={1}
                      unit="cm"
                      onChange={v => setForm(f => ({ ...f, tailleCm: String(v) }))}
                      colors={colors}
                    />
                    <Pressable
                      style={s.rulerDoneBtn}
                      onPress={() => setShowTailleRuler(false)}
                    >
                      <Text style={s.rulerDoneBtnText}>Valider</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[r.container, s.transparentInput]}
                    onPress={() => setShowTailleRuler(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Modifier la taille"
                  >
                    <Text style={[r.input, { color: form.tailleCm ? colors.textPrimary : colors.textTertiary }]}>
                      {form.tailleCm ? `${form.tailleCm} cm` : 'Non renseignée'}
                    </Text>
                  </Pressable>
                )}
                {errors.tailleCm ? <Text style={r.helper}>{errors.tailleCm}</Text> : null}
              </View>
            )
          })()}

          <View style={s.fieldSep} />

          {/* Poids */}
          {(() => {
            const state: InputState = errors.poidsKg ? 'error' : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>POIDS</Text>
                {showPoidsRuler ? (
                  <View style={s.rulerWrap}>
                    <RulerPicker
                      value={form.poidsKg ? parseFloat(form.poidsKg) : 70}
                      min={20}
                      max={200}
                      step={0.5}
                      unit="kg"
                      onChange={v => setForm(f => ({ ...f, poidsKg: String(v) }))}
                      colors={colors}
                    />
                    <Pressable
                      style={s.rulerDoneBtn}
                      onPress={() => setShowPoidsRuler(false)}
                    >
                      <Text style={s.rulerDoneBtnText}>Valider</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={[r.container, s.transparentInput]}
                    onPress={() => setShowPoidsRuler(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Modifier le poids"
                  >
                    <Text style={[r.input, { color: form.poidsKg ? colors.textPrimary : colors.textTertiary }]}>
                      {form.poidsKg ? `${form.poidsKg} kg` : 'Non renseigné'}
                    </Text>
                  </Pressable>
                )}
                {errors.poidsKg ? <Text style={r.helper}>{errors.poidsKg}</Text> : null}
              </View>
            )
          })()}

        </View>

        {/* ── Déconnexion ── */}
        <Pressable
          style={({ pressed }) => [s.decoBtn, pressed && { opacity: 0.5 }]}
          onPress={() => void seDeconnecter()}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Text style={s.decoText}>Se déconnecter</Text>
        </Pressable>

        <View style={s.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    centered: { alignItems: 'center', justifyContent: 'center' },

    // ── Header ──
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
    saveBtn: {
      height: 44,
      justifyContent: 'center',
      alignItems: 'flex-end',
      minWidth: 80,
    },
    saveBtnLabel: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.accent,
    },

    // ── Scroll ──
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: spacing.s4,
      paddingTop: spacing.s2,
    },

    // ── Avatar ──
    avatarSection: {
      alignItems: 'center',
      paddingVertical: spacing.s6,
    },
    avatarWrap: {
      width: 88,
      height: 88,
      borderRadius: 44,
      borderWidth: 2,
      borderColor: colors.accent,
      padding: 3,
      position: 'relative',
    },
    avatar: {
      width: '100%',
      height: '100%',
      borderRadius: 38,
    },
    avatarPlaceholder: {
      flex: 1,
      borderRadius: 38,
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      ...typography.title,
      color: colors.accent,
    },
    cameraBadge: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.background,
    },
    avatarLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      marginTop: spacing.s3,
    },

    // ── Error ──
    errorBanner: {
      backgroundColor: `${colors.error}18`,
      borderRadius: radius.md,
      padding: spacing.s3,
      marginBottom: spacing.s4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
    },
    errorBannerText: {
      ...typography.caption,
      color: colors.error,
      flex: 1,
    },

    // ── Sections ──
    sectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      letterSpacing: 1,
      marginTop: spacing.s5,
      marginBottom: spacing.s2,
      marginLeft: spacing.s1,
    },
    sectionCard: {
      backgroundColor: colors.backgroundSecondary,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s4,
      gap: spacing.s4,
    },
    fieldSep: {
      height: 1,
      backgroundColor: colors.separator,
      marginHorizontal: -spacing.s4,
    },
    fieldGroup: {
      gap: spacing.s2,
    },
    transparentInput: {
      backgroundColor: 'transparent',
    },

    // ── Date ──
    dateHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s2,
    },
    dateLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: touchTarget.comfort,
      paddingHorizontal: spacing.s4,
      gap: spacing.s1,
    },
    dateRowError: {
      borderColor: colors.error,
      backgroundColor: `${colors.error}08`,
    },
    dateSegment: {
      flex: 1,
      alignItems: 'center',
    },
    dateYearSegment: {
      flex: 2,
    },
    dateInput: {
      ...typography.body,
      textAlign: 'center',
      paddingVertical: spacing.s3,
      width: '100%',
      fontVariant: ['tabular-nums'],
    },
    dateSep: {
      ...typography.body,
      color: colors.textTertiary,
    },
    dateError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.s1,
      marginTop: spacing.s1,
    },
    dateErrorText: {
      ...typography.caption,
    },

    // ── RulerPicker ──
    rulerWrap: {
      gap: spacing.s4,
      paddingTop: spacing.s2,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.md,
      padding: spacing.s4,
    },
    rulerDoneBtn: {
      backgroundColor: colors.accent,
      height: touchTarget.min,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rulerDoneBtnText: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.background,
    },

    // ── Déconnexion ──
    decoBtn: {
      alignItems: 'center',
      marginTop: spacing.s8,
      paddingVertical: spacing.s5,
      minHeight: touchTarget.comfort,
      justifyContent: 'center',
    },
    decoText: {
      ...typography.body,
      color: colors.textTertiary,
    },

    bottomPad: { height: spacing.s12 },
  })
}
