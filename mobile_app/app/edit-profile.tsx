import React, { useState, useEffect } from 'react'
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
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronLeft, Calendar } from 'lucide-react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProfileForm {
  username: string
  fullName: string
  dateNaissance: string
  poidsKg: string
}

interface ProfileErrors {
  username?: string
  fullName?: string
  dateNaissance?: string
  poidsKg?: string
  global?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateForDisplay(isoDate: string): string {
  if (!isoDate) return ''
  const parts = isoDate.split('-')
  if (parts.length !== 3) return isoDate
  return `${parts[2]} / ${parts[1]} / ${parts[0]}`
}

function parseDateInput(input: string): string {
  // Accepte dd/mm/yyyy ou dd / mm / yyyy → yyyy-mm-dd
  const cleaned = input.replace(/\s/g, '').replace(/\//g, '/')
  const parts = cleaned.split('/')
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  }
  return input
}

function getInitiales(fullName: string, username: string): string {
  if (fullName.trim()) {
    const words = fullName.trim().split(/\s+/)
    if (words.length >= 2) {
      return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase()
    }
    return words[0][0].toUpperCase()
  }
  if (username.trim()) {
    return username.trim().charAt(0).toUpperCase()
  }
  return '?'
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function EditProfileScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [form, setForm] = useState<ProfileForm>({
    username: '',
    fullName: '',
    dateNaissance: '',
    poidsKg: '',
  })
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // ─── Load profil existant ──────────────────────────────────────────────────

  useEffect(() => {
    async function loadProfile(): Promise<void> {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          router.replace('/auth/login')
          return
        }
        setUserId(user.id)

        const { data, error } = await supabase
          .from('users')
          .select('username, full_name, avatar_url, date_naissance')
          .eq('id', user.id)
          .single()

        if (error) throw error

        // Récupérer dernier poids
        const { data: metricsData } = await supabase
          .from('body_metrics')
          .select('weight_kg')
          .eq('user_id', user.id)
          .order('measured_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        setAvatarUrl(data.avatar_url ?? null)
        setForm({
          username: data.username ?? '',
          fullName: data.full_name ?? '',
          dateNaissance: data.date_naissance
            ? formatDateForDisplay(data.date_naissance)
            : '',
          poidsKg: metricsData?.weight_kg ? String(metricsData.weight_kg) : '',
        })
      } catch {
        setErrors({ global: 'Impossible de charger le profil.' })
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [router])

  // ─── Validation ───────────────────────────────────────────────────────────

  function validate(): boolean {
    const newErrors: ProfileErrors = {}

    if (!form.username.trim()) {
      newErrors.username = "Nom d'utilisateur requis"
    } else if (form.username.length < 3) {
      newErrors.username = 'Minimum 3 caractères'
    }

    if (!form.fullName.trim()) {
      newErrors.fullName = 'Nom complet requis'
    }

    if (form.poidsKg) {
      const poids = parseFloat(form.poidsKg)
      if (isNaN(poids) || poids < 20 || poids > 500) {
        newErrors.poidsKg = 'Poids invalide (20–500 kg)'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function saveProfile(): Promise<void> {
    if (!validate() || !userId) return
    setSaving(true)
    setErrors({})

    try {
      const isoDate = form.dateNaissance
        ? parseDateInput(form.dateNaissance)
        : null

      const { error: userError } = await supabase
        .from('users')
        .update({
          username: form.username.trim(),
          full_name: form.fullName.trim(),
          date_naissance: isoDate,
        })
        .eq('id', userId)

      if (userError) throw userError

      if (form.poidsKg) {
        const poidsNum = parseFloat(form.poidsKg)
        if (!isNaN(poidsNum)) {
          const { error: metricsError } = await supabase
            .from('body_metrics')
            .insert({
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

  // ─── Avatar picker ────────────────────────────────────────────────────────

  async function pickAvatar(): Promise<void> {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      setAvatarUrl(result.assets[0].uri)
    }
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

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable
          style={s.backBtn}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityLabel="Retour"
        >
          <ChevronLeft size={24} color={colors.textPrimary} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Mon profil</Text>
        <Pressable
          style={s.saveBtn}
          onPress={() => void saveProfile()}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Sauvegarder"
        >
          {saving ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Text style={s.saveBtnLabel}>Sauvegarder</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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
          </Pressable>
          <Text style={s.avatarChangeLabel}>Changer la photo</Text>
        </View>

        {/* ── Erreur globale ── */}
        {errors.global ? (
          <View style={s.errorBanner}>
            <Text style={s.errorBannerText}>{errors.global}</Text>
          </View>
        ) : null}

        {/* ── Champs ── */}
        <View style={s.form}>

          {/* Nom d'utilisateur */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>NOM D'UTILISATEUR</Text>
            <TextInput
              style={[s.input, errors.username ? s.inputError : null]}
              value={form.username}
              onChangeText={(v) => setForm(f => ({ ...f, username: v }))}
              placeholder="@tonpseudo"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              accessibilityLabel="Nom d'utilisateur"
            />
            {errors.username ? (
              <Text style={s.fieldError}>{errors.username}</Text>
            ) : null}
          </View>

          {/* Nom complet */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>NOM COMPLET</Text>
            <TextInput
              style={[s.input, errors.fullName ? s.inputError : null]}
              value={form.fullName}
              onChangeText={(v) => setForm(f => ({ ...f, fullName: v }))}
              placeholder="Prénom Nom"
              placeholderTextColor={colors.textTertiary}
              textContentType="name"
              accessibilityLabel="Nom complet"
            />
            {errors.fullName ? (
              <Text style={s.fieldError}>{errors.fullName}</Text>
            ) : null}
          </View>

          {/* Date de naissance */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>DATE DE NAISSANCE</Text>
            <View style={[s.inputWithIcon, errors.dateNaissance ? s.inputError : null]}>
              <TextInput
                style={s.inputInner}
                value={form.dateNaissance}
                onChangeText={(v) => setForm(f => ({ ...f, dateNaissance: v }))}
                placeholder="jj / mm / aaaa"
                placeholderTextColor={colors.textTertiary}
                keyboardType="numeric"
                maxLength={14}
                accessibilityLabel="Date de naissance"
              />
              <View style={s.inputIconRight}>
                <Calendar size={16} color={colors.textTertiary} strokeWidth={1.5} />
              </View>
            </View>
            {errors.dateNaissance ? (
              <Text style={s.fieldError}>{errors.dateNaissance}</Text>
            ) : null}
          </View>

          {/* Poids */}
          <View style={s.fieldGroup}>
            <Text style={s.fieldLabel}>POIDS</Text>
            <View style={[s.inputWithIcon, errors.poidsKg ? s.inputError : null]}>
              <TextInput
                style={s.inputInner}
                value={form.poidsKg}
                onChangeText={(v) => setForm(f => ({ ...f, poidsKg: v }))}
                placeholder="70"
                placeholderTextColor={colors.textTertiary}
                keyboardType="decimal-pad"
                accessibilityLabel="Poids en kilogrammes"
              />
              <View style={s.inputIconRight}>
                <Text style={s.inputUnit}>kg</Text>
              </View>
            </View>
            {errors.poidsKg ? (
              <Text style={s.fieldError}>{errors.poidsKg}</Text>
            ) : null}
            <Text style={s.fieldNote}>
              {'Utilisé pour calculer tes métriques. '}
              <Text style={s.fieldNoteAccent}>Non visible.</Text>
            </Text>
          </View>

        </View>

        {/* ── Déconnexion ── */}
        <Pressable
          style={({ pressed }) => [s.deconnexionBtn, pressed && { opacity: 0.6 }]}
          onPress={() => void seDeconnecter()}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <Text style={s.deconnexionText}>Déconnexion</Text>
        </Pressable>

        <View style={s.bottomPad} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
    },

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
      minWidth: 44,
    },
    saveBtnLabel: {
      ...typography.body,
      fontFamily: font.bold,
      color: colors.accent,
    },

    // ── Scroll ──
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: spacing.s4,
    },

    // ── Avatar ──
    avatarSection: {
      alignItems: 'center',
      paddingTop: spacing.s6,
      paddingBottom: spacing.s6,
    },
    avatarWrap: {
      marginBottom: spacing.s2,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
    },
    avatarPlaceholder: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.backgroundSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: 24,
      fontFamily: font.bold,
      color: colors.accent,
      lineHeight: 28,
    },
    avatarChangeLabel: {
      ...typography.caption,
      color: colors.accent,
      marginTop: spacing.s1,
    },

    // ── Error ──
    errorBanner: {
      backgroundColor: `${colors.error}18`,
      borderRadius: radius.md,
      padding: spacing.s3,
      marginBottom: spacing.s4,
    },
    errorBannerText: {
      ...typography.caption,
      color: colors.error,
      textAlign: 'center',
    },

    // ── Form ──
    form: {
      gap: spacing.s5,
    },
    fieldGroup: {
      gap: spacing.s1,
    },
    fieldLabel: {
      ...typography.caption,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: spacing.s1,
    },
    input: {
      height: 52,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.s4,
      ...typography.body,
      color: colors.textPrimary,
    },
    inputWithIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.sm,
      height: 52,
      overflow: 'hidden',
    },
    inputInner: {
      flex: 1,
      height: 52,
      paddingHorizontal: spacing.s4,
      ...typography.body,
      color: colors.textPrimary,
    },
    inputError: {
      borderWidth: 1,
      borderColor: colors.error,
    },
    inputIconRight: {
      paddingHorizontal: spacing.s4,
      height: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    inputUnit: {
      ...typography.body,
      color: colors.textSecondary,
    },
    fieldError: {
      ...typography.caption,
      color: colors.error,
      marginTop: spacing.s1,
    },
    fieldNote: {
      ...typography.caption,
      color: colors.textTertiary,
      marginTop: spacing.s2,
    },
    fieldNoteAccent: {
      color: colors.accent,
    },

    // ── Déconnexion ──
    deconnexionBtn: {
      alignItems: 'center',
      paddingVertical: spacing.s5,
      marginTop: spacing.s8,
      minHeight: 52,
      justifyContent: 'center',
    },
    deconnexionText: {
      ...typography.body,
      color: colors.textTertiary,
    },

    bottomPad: {
      height: spacing.s12,
    },
  })
}
