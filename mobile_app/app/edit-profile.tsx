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
import {
  ChevronLeft,
  Camera,
  AlertCircle,
  Calendar,
  User,
  AtSign,
  Check,
} from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'
import {
  getProfileNameFields,
  saveProfileNameFields,
  splitFullName,
  joinFullName,
  type NameDisplay,
} from '@/lib/displayName'
import { getProfileBio, saveProfileBio, BIO_MAX } from '@/lib/profileBio'
import { useTheme } from '@/context/ThemeContext'
import { useWeightUnit } from '@/context/WeightUnitContext'
import { spacing, radius, typography, font, touchTarget } from '@/constants/theme'
import { inputRecipe, InputState } from '@/constants/recipes'
import RulerPicker from '@/components/RulerPicker'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileForm {
  username: string
  firstName: string
  lastName: string
  bio: string // bio courte (≤ BIO_MAX) affichée à droite de l'avatar sur le profil
  nameDisplay: NameDisplay // ce qui s'affiche en tête de profil
  dateDay: string // "DD"
  dateMonth: string // "MM"
  dateYear: string // "YYYY"
  poidsKg: string
  tailleCm: string
}

interface ProfileErrors {
  username?: string
  firstName?: string
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
  const d = parseInt(day, 10),
    m = parseInt(month, 10),
    y = parseInt(year, 10)
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2100) return null
  return `${year}-${month}-${day}`
}

function getInitiales(firstName: string, lastName: string, username: string): string {
  const f = firstName.trim()
  const l = lastName.trim()
  if (f && l) return `${f[0]}${l[0]}`.toUpperCase()
  if (f) return f[0].toUpperCase()
  return username.trim().charAt(0).toUpperCase() || '?'
}

async function uploadAvatarToStorage(localUri: string, uid: string): Promise<string | null> {
  try {
    // En React Native, fetch(uri).blob() produit souvent un blob de 0 octet → upload vide
    // ou rejeté ("Impossible d'uploader la photo"). arrayBuffer() est le chemin fiable
    // recommandé par Supabase pour RN.
    const response = await fetch(localUri)
    const arrayBuffer = await response.arrayBuffer()
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error('Fichier image vide (0 octet)')
    }

    const rawExt = localUri.split('.').pop()?.split('?')[0]?.toLowerCase()
    const ext = rawExt === 'png' ? 'png' : 'jpg'
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg'
    const path = `${uid}/avatar.${ext}`

    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, arrayBuffer, { upsert: true, contentType })

    if (error) throw error

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    return `${data.publicUrl}?t=${Date.now()}`
  } catch (e) {
    log.error('[edit-profile] uploadAvatarToStorage', e)
    return null
  }
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const { unit: weightUnit, toKg, toDisplay } = useWeightUnit()
  const router = useRouter()

  const dayRef = useRef<TextInput>(null)
  const monthRef = useRef<TextInput>(null)
  const yearRef = useRef<TextInput>(null)

  const [form, setForm] = useState<ProfileForm>({
    username: '',
    firstName: '',
    lastName: '',
    bio: '',
    nameDisplay: 'full_name',
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
  const [firstNameFocused, setFirstNameFocused] = useState(false)
  const [lastNameFocused, setLastNameFocused] = useState(false)
  const [showPoidsRuler, setShowPoidsRuler] = useState(false)
  const [showTailleRuler, setShowTailleRuler] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadProfile = useCallback(
    async (isRefresh = false): Promise<void> => {
      if (!isRefresh) setLoading(true)
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/login')
          return
        }
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

        const dateParts = data.date_naissance
          ? isoToDateParts(data.date_naissance)
          : { day: '', month: '', year: '' }
        const fullName = (data as { full_name?: string | null }).full_name ?? ''

        // Colonnes décomposées + préférence + bio : lectures isolées (no-op pré-migration).
        // Repli sur le découpage de full_name tant que first_name/last_name sont vides.
        const [nameFields, bio] = await Promise.all([
          getProfileNameFields(user.id),
          getProfileBio(user.id),
        ])
        const split = splitFullName(fullName)
        const firstName = nameFields?.first_name ?? split.firstName
        const lastName = nameFields?.last_name ?? split.lastName

        setAvatarUrl((data as { avatar_url?: string | null }).avatar_url ?? null)
        setAvatarLocalUri(null)
        setForm({
          username: (data as { username?: string | null }).username ?? '',
          firstName,
          lastName,
          bio: bio ?? '',
          nameDisplay: nameFields?.name_display ?? 'full_name',
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
    },
    [router]
  )

  useEffect(() => {
    void loadProfile()
  }, [loadProfile])

  const onRefresh = useCallback((): void => {
    setRefreshing(true)
    void loadProfile(true)
  }, [loadProfile])

  function validate(): boolean {
    const e: ProfileErrors = {}
    if (!form.username.trim()) e.username = "Nom d'utilisateur requis"
    else if (form.username.length < 3) e.username = 'Minimum 3 caractères'
    if (!form.firstName.trim()) e.firstName = 'Prénom requis'

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
      const fullName = joinFullName(form.firstName, form.lastName)

      // full_name (concaténation) reste écrit dans la requête principale → lectures
      // existantes (feed, profil) intactes même avant la migration des nouvelles colonnes.
      const { error: userError } = await supabase
        .from('users')
        .update({
          username: form.username.trim(),
          full_name: fullName,
          date_naissance: isoDate,
          avatar_url: finalAvatarUrl,
          height_cm: form.tailleCm ? parseFloat(form.tailleCm) : null,
        })
        .eq('id', userId)

      if (userError) throw userError

      // Colonnes décomposées + préférence d'affichage : écriture isolée best-effort
      // (no-op silencieux tant que la migration profile_name_fields.sql n'est pas appliquée).
      await saveProfileNameFields(userId, {
        firstName: form.firstName,
        lastName: form.lastName,
        nameDisplay: form.nameDisplay,
      })

      // Bio : écriture isolée best-effort (no-op tant que ora085_profile_bio.sql non appliquée).
      await saveProfileBio(userId, form.bio)

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
  const initiales = getInitiales(form.firstName, form.lastName, form.username)

  if (loading) {
    return (
      <View style={[s.root, s.centered]}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    )
  }

  const dateHasError = !!errors.dateNaissance
  const dateIsFilled =
    form.dateDay.length > 0 || form.dateMonth.length > 0 || form.dateYear.length > 0

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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
          {saving ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={s.saveBtnLabel}>Enregistrer</Text>
          )}
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
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={s.avatar} />
            ) : (
              <View style={s.avatarPlaceholder}>
                <Text style={s.avatarInitials}>{initiales}</Text>
              </View>
            )}
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
            const state: InputState = errors.username
              ? 'error'
              : usernameFocused
                ? 'active'
                : form.username.length > 0
                  ? 'filled'
                  : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>NOM D&apos;UTILISATEUR</Text>
                <View style={[r.container, s.transparentInput]}>
                  <TextInput
                    style={r.input}
                    value={form.username}
                    onChangeText={(v) => setForm((f) => ({ ...f, username: v }))}
                    onFocus={() => setUsernameFocused(true)}
                    onBlur={() => setUsernameFocused(false)}
                    placeholder="@tonpseudo"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                  />
                  {errors.username ? (
                    <View style={r.icon}>
                      <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                {errors.username ? <Text style={r.helper}>{errors.username}</Text> : null}
              </View>
            )
          })()}

          <View style={s.fieldSep} />

          {/* Prénom */}
          {(() => {
            const state: InputState = errors.firstName
              ? 'error'
              : firstNameFocused
                ? 'active'
                : form.firstName.length > 0
                  ? 'filled'
                  : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>PRÉNOM</Text>
                <View style={[r.container, s.transparentInput]}>
                  <TextInput
                    style={r.input}
                    value={form.firstName}
                    onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                    onFocus={() => setFirstNameFocused(true)}
                    onBlur={() => setFirstNameFocused(false)}
                    placeholder="Prénom"
                    placeholderTextColor={colors.textTertiary}
                    textContentType="givenName"
                  />
                  {errors.firstName ? (
                    <View style={r.icon}>
                      <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                {errors.firstName ? <Text style={r.helper}>{errors.firstName}</Text> : null}
              </View>
            )
          })()}

          <View style={s.fieldSep} />

          {/* Nom */}
          {(() => {
            const state: InputState = lastNameFocused
              ? 'active'
              : form.lastName.length > 0
                ? 'filled'
                : 'default'
            const r = inputRecipe(state, colors)
            return (
              <View style={s.fieldGroup}>
                <Text style={r.label}>NOM</Text>
                <View style={[r.container, s.transparentInput]}>
                  <TextInput
                    style={r.input}
                    value={form.lastName}
                    onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                    onFocus={() => setLastNameFocused(true)}
                    onBlur={() => setLastNameFocused(false)}
                    placeholder="Nom"
                    placeholderTextColor={colors.textTertiary}
                    textContentType="familyName"
                  />
                </View>
              </View>
            )
          })()}

          <View style={s.fieldSep} />

          {/* Bio — présentation courte affichée à droite de l'avatar sur le profil */}
          <View style={s.fieldGroup}>
            <View style={s.bioHeader}>
              <Text style={s.bioLabel}>BIO</Text>
              <Text
                style={[s.bioCounter, form.bio.length >= BIO_MAX && { color: colors.accent }]}
                allowFontScaling={false}
              >
                {form.bio.length}/{BIO_MAX}
              </Text>
            </View>
            <View style={s.bioInputWrap}>
              <TextInput
                style={s.bioInput}
                value={form.bio}
                onChangeText={(v) => setForm((f) => ({ ...f, bio: v }))}
                placeholder="Quelques mots sur toi — objectif, style, devise…"
                placeholderTextColor={colors.textTertiary}
                multiline
                maxLength={BIO_MAX}
                textAlignVertical="top"
                scrollEnabled={false}
              />
            </View>
          </View>

          <View style={s.fieldSep} />

          {/* Préférence d'affichage du profil */}
          <View style={s.fieldGroup}>
            <Text style={s.displayPrefLabel}>AFFICHER SUR LE PROFIL</Text>
            <View style={s.displayPrefRow}>
              {[
                {
                  key: 'full_name' as NameDisplay,
                  Icon: User,
                  title: 'Nom complet',
                  sample: joinFullName(form.firstName, form.lastName) || 'Prénom Nom',
                },
                {
                  key: 'username' as NameDisplay,
                  Icon: AtSign,
                  title: "Nom d'utilisateur",
                  sample: form.username ? `@${form.username}` : '@pseudo',
                },
              ].map(({ key, Icon, title, sample }) => {
                const selected = form.nameDisplay === key
                return (
                  <Pressable
                    key={key}
                    style={[s.displayPrefOption, selected && s.displayPrefOptionActive]}
                    onPress={() => setForm((f) => ({ ...f, nameDisplay: key }))}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={title}
                  >
                    <View style={s.displayPrefOptionHead}>
                      <Icon
                        size={15}
                        color={selected ? colors.accent : colors.textTertiary}
                        strokeWidth={2}
                      />
                      {selected && <Check size={14} color={colors.accent} strokeWidth={2.5} />}
                    </View>
                    <Text style={[s.displayPrefTitle, selected && { color: colors.textPrimary }]}>
                      {title}
                    </Text>
                    <Text style={s.displayPrefSample} numberOfLines={1}>
                      {sample}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
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
              <Calendar
                size={14}
                color={dateHasError ? colors.error : colors.textTertiary}
                strokeWidth={1.5}
              />
            </View>
            <View style={[s.dateRow, dateHasError && s.dateRowError]}>
              {/* JJ */}
              <View style={s.dateSegment}>
                <TextInput
                  ref={dayRef}
                  style={[
                    s.dateInput,
                    { color: form.dateDay ? colors.textPrimary : colors.textTertiary },
                  ]}
                  value={form.dateDay}
                  onChangeText={(v) => {
                    const d = v.replace(/\D/g, '').slice(0, 2)
                    setForm((f) => ({ ...f, dateDay: d }))
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
                  style={[
                    s.dateInput,
                    { color: form.dateMonth ? colors.textPrimary : colors.textTertiary },
                  ]}
                  value={form.dateMonth}
                  onChangeText={(v) => {
                    const d = v.replace(/\D/g, '').slice(0, 2)
                    setForm((f) => ({ ...f, dateMonth: d }))
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
                  style={[
                    s.dateInput,
                    { color: form.dateYear ? colors.textPrimary : colors.textTertiary },
                  ]}
                  value={form.dateYear}
                  onChangeText={(v) => {
                    const d = v.replace(/\D/g, '').slice(0, 4)
                    setForm((f) => ({ ...f, dateYear: d }))
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
                <Text style={[s.dateErrorText, { color: colors.error }]}>
                  {errors.dateNaissance}
                </Text>
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
                      onChange={(v) => setForm((f) => ({ ...f, tailleCm: String(v) }))}
                      colors={colors}
                    />
                    <Pressable style={s.rulerDoneBtn} onPress={() => setShowTailleRuler(false)}>
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
                    <Text
                      style={[
                        r.input,
                        { color: form.tailleCm ? colors.textPrimary : colors.textTertiary },
                      ]}
                    >
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
                      value={
                        form.poidsKg
                          ? Math.round(toDisplay(parseFloat(form.poidsKg)) * 2) / 2
                          : Math.round(toDisplay(70))
                      }
                      min={weightUnit === 'lbs' ? 45 : 20}
                      max={weightUnit === 'lbs' ? 440 : 200}
                      step={weightUnit === 'lbs' ? 1 : 0.5}
                      unit={weightUnit}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          // Saisie dans l'unité d'affichage → stockée en kg (1 décimale).
                          poidsKg: String(Math.round(toKg(v) * 10) / 10),
                        }))
                      }
                      colors={colors}
                    />
                    <Pressable style={s.rulerDoneBtn} onPress={() => setShowPoidsRuler(false)}>
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
                    <Text
                      style={[
                        r.input,
                        { color: form.poidsKg ? colors.textPrimary : colors.textTertiary },
                      ]}
                    >
                      {form.poidsKg
                        ? `${Math.round(toDisplay(parseFloat(form.poidsKg)) * 2) / 2} ${weightUnit}`
                        : 'Non renseigné'}
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

    // ── Préférence d'affichage du nom ──
    displayPrefLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    displayPrefRow: {
      flexDirection: 'row',
      gap: spacing.s3,
    },
    displayPrefOption: {
      flex: 1,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.backgroundTertiary,
      paddingVertical: spacing.s3,
      paddingHorizontal: spacing.s3,
      gap: spacing.s1,
      minHeight: touchTarget.comfort,
    },
    displayPrefOptionActive: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}12`,
    },
    displayPrefOptionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 16,
    },
    displayPrefTitle: {
      ...typography.body,
      fontSize: 14,
      fontFamily: font.bold,
      color: colors.textSecondary,
    },
    displayPrefSample: {
      ...typography.caption,
      color: colors.textTertiary,
    },

    // ── Bio ──
    bioHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bioLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    bioCounter: {
      ...typography.caption,
      color: colors.textTertiary,
      fontVariant: ['tabular-nums'],
    },
    bioInputWrap: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.s4,
      paddingVertical: spacing.s3,
      minHeight: 76,
    },
    bioInput: {
      ...typography.body,
      color: colors.textPrimary,
      padding: 0,
      minHeight: 48,
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
