import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Circle } from 'react-native-svg'
import { AlertCircle } from 'lucide-react-native'
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'
import { inputRecipe, InputState } from '@/constants/recipes'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  nomUtilisateur: string
  email: string
  motDePasse: string
}

interface ErreurFormulaire {
  nomUtilisateur?: string
  email?: string
  motDePasse?: string
  global?: string
}

// ─── Logo Orava ───────────────────────────────────────────────────────────────

function LogoOrava(): React.JSX.Element {
  return (
    <Svg width={48} height={48} viewBox="0 0 100 100">
      <Circle cx="50" cy="50" r="42" stroke="#FFDD00" strokeWidth="6" fill="none" />
      <Circle cx="50" cy="50" r="28" stroke="#FFDD00" strokeWidth="6" fill="none" />
      <Circle cx="50" cy="50" r="6" fill="#FFDD00" />
    </Svg>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function RegisterScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [form, setForm] = useState<FormState>({
    nomUtilisateur: '',
    email: '',
    motDePasse: '',
  })
  const [erreurs, setErreurs] = useState<ErreurFormulaire>({})
  const [chargement, setChargement] = useState<boolean>(false)
  const [motDePasseVisible, setMotDePasseVisible] = useState<boolean>(false)
  const [nomUtilisateurFocused, setNomUtilisateurFocused] = useState<boolean>(false)
  const [emailFocused, setEmailFocused] = useState<boolean>(false)
  const [motDePasseFocused, setMotDePasseFocused] = useState<boolean>(false)

  function validerFormulaire(): boolean {
    const nouvellesErreurs: ErreurFormulaire = {}
    if (!form.nomUtilisateur.trim()) {
      nouvellesErreurs.nomUtilisateur = "Nom d'utilisateur requis"
    } else if (form.nomUtilisateur.trim().length < 3) {
      nouvellesErreurs.nomUtilisateur = '3 caractères minimum'
    } else if (!/^[a-zA-Z0-9_]+$/.test(form.nomUtilisateur.trim())) {
      nouvellesErreurs.nomUtilisateur = 'Lettres, chiffres et _ uniquement'
    }
    if (!form.email.trim()) {
      nouvellesErreurs.email = 'Email requis'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nouvellesErreurs.email = 'Email invalide'
    }
    if (!form.motDePasse) {
      nouvellesErreurs.motDePasse = 'Mot de passe requis'
    } else if (form.motDePasse.length < 8) {
      nouvellesErreurs.motDePasse = '8 caractères minimum'
    }
    setErreurs(nouvellesErreurs)
    return Object.keys(nouvellesErreurs).length === 0
  }

  async function creerCompte(): Promise<void> {
    if (!validerFormulaire()) return
    setChargement(true)
    setErreurs({})

    const { error } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.motDePasse,
      options: {
        data: {
          username: form.nomUtilisateur.trim().toLowerCase(),
        },
      },
    })

    setChargement(false)

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        setErreurs({ email: 'Cet email est déjà utilisé.' })
      } else {
        setErreurs({ global: 'Erreur lors de la création du compte.' })
      }
      return
    }

    router.replace('/onboarding')
  }

  const styles = buildStyles(colors)

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <LogoOrava />
          <Text style={styles.wordmark}>ORAVA</Text>
          <Text style={styles.tagline}>Chaque séance devient une œuvre.</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>

          {/* Nom d'utilisateur */}
          {(() => {
            const nomState: InputState =
              erreurs.nomUtilisateur ? 'error' :
              nomUtilisateurFocused ? 'active' :
              form.nomUtilisateur.length > 0 ? 'filled' : 'default'
            const r = inputRecipe(nomState, colors)
            return (
              <View style={styles.champGroupe}>
                <View style={r.container}>
                  <TextInput
                    style={r.input}
                    value={form.nomUtilisateur}
                    onChangeText={(v) => setForm(f => ({ ...f, nomUtilisateur: v }))}
                    onFocus={() => setNomUtilisateurFocused(true)}
                    onBlur={() => setNomUtilisateurFocused(false)}
                    placeholder="Nom d'utilisateur"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="username"
                    accessibilityLabel="Champ nom d'utilisateur"
                  />
                  {erreurs.nomUtilisateur ? (
                    <View style={r.icon}>
                      <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                {erreurs.nomUtilisateur ? (
                  <Text style={r.helper}>{erreurs.nomUtilisateur}</Text>
                ) : null}
              </View>
            )
          })()}

          {/* Email */}
          {(() => {
            const emailState: InputState =
              erreurs.email ? 'error' :
              emailFocused ? 'active' :
              form.email.length > 0 ? 'filled' : 'default'
            const r = inputRecipe(emailState, colors)
            return (
              <View style={styles.champGroupe}>
                <View style={r.container}>
                  <TextInput
                    style={r.input}
                    value={form.email}
                    onChangeText={(v) => setForm(f => ({ ...f, email: v }))}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                    placeholder="Adresse e-mail"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="emailAddress"
                    accessibilityLabel="Champ email"
                  />
                  {erreurs.email ? (
                    <View style={r.icon}>
                      <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                {erreurs.email ? (
                  <Text style={r.helper}>{erreurs.email}</Text>
                ) : null}
              </View>
            )
          })()}

          {/* Mot de passe */}
          {(() => {
            const mdpState: InputState =
              erreurs.motDePasse ? 'error' :
              motDePasseFocused ? 'active' :
              form.motDePasse.length > 0 ? 'filled' : 'default'
            const r = inputRecipe(mdpState, colors)
            return (
              <View style={styles.champGroupe}>
                <View style={r.container}>
                  <TextInput
                    style={r.input}
                    value={form.motDePasse}
                    onChangeText={(v) => setForm(f => ({ ...f, motDePasse: v }))}
                    onFocus={() => setMotDePasseFocused(true)}
                    onBlur={() => setMotDePasseFocused(false)}
                    placeholder="Mot de passe"
                    placeholderTextColor={colors.textTertiary}
                    secureTextEntry={!motDePasseVisible}
                    textContentType="newPassword"
                    accessibilityLabel="Champ mot de passe"
                  />
                  <Pressable
                    onPress={() => setMotDePasseVisible(v => !v)}
                    accessibilityLabel={motDePasseVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    hitSlop={8}
                  >
                    <Text style={styles.texteVisibilite}>
                      {motDePasseVisible ? 'Masquer' : 'Voir'}
                    </Text>
                  </Pressable>
                  {erreurs.motDePasse ? (
                    <View style={r.icon}>
                      <AlertCircle size={16} color={colors.error} strokeWidth={2} />
                    </View>
                  ) : null}
                </View>
                {erreurs.motDePasse ? (
                  <Text style={r.helper}>{erreurs.motDePasse}</Text>
                ) : null}
              </View>
            )
          })()}

          {/* Erreur globale */}
          {erreurs.global ? (
            <View style={styles.banniereErreur}>
              <Text style={styles.banniereErreurTexte}>{erreurs.global}</Text>
            </View>
          ) : null}

          {/* CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.cta,
              pressed && styles.ctaAppuye,
              chargement && styles.ctaDesactive,
            ]}
            onPress={creerCompte}
            disabled={chargement}
            accessibilityRole="button"
            accessibilityLabel="Créer mon compte"
          >
            {chargement ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.ctaTexte}>CRÉER MON COMPTE</Text>
            )}
          </Pressable>

          {/* Lien connexion */}
          <Pressable
            style={styles.lienConnexion}
            onPress={() => router.push('/auth/login')}
            accessibilityRole="link"
            accessibilityLabel="Se connecter"
          >
            <Text style={styles.lienTexte}>
              Déjà inscrit ?{' '}
              <Text style={styles.lienAccent}>Connexion</Text>
            </Text>
          </Pressable>

        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function buildStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.s6,
      paddingVertical: spacing.s12,
    },
    hero: {
      alignItems: 'center',
      marginBottom: spacing.s8,
    },
    wordmark: {
      fontSize: 20,
      fontFamily: font.condensedBold,
      color: colors.textPrimary,
      letterSpacing: 4,
      marginTop: spacing.s2,
    },
    tagline: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.s1,
    },
    form: {
      gap: spacing.s4,
    },
    champGroupe: {
      gap: spacing.s1,
    },
    texteVisibilite: {
      ...typography.caption,
      color: colors.textSecondary,
      paddingHorizontal: spacing.s2,
    },
    banniereErreur: {
      backgroundColor: `${colors.error}18`,
      borderRadius: radius.sm,
      padding: spacing.s3,
    },
    banniereErreurTexte: {
      ...typography.caption,
      color: colors.error,
      textAlign: 'center',
    },
    cta: {
      height: 52,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.s2,
    },
    ctaAppuye: {
      opacity: 0.85,
    },
    ctaDesactive: {
      opacity: 0.6,
    },
    ctaTexte: {
      fontSize: 14,
      fontFamily: font.bold,
      color: colors.background,
      letterSpacing: 1.5,
    },
    lienConnexion: {
      alignItems: 'center',
      paddingVertical: spacing.s3,
    },
    lienTexte: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    lienAccent: {
      color: colors.textPrimary,
      fontFamily: font.bold,
    },
  })
}
