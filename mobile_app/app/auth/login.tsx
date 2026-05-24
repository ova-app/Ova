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
import { supabase } from '@/lib/supabase'
import { useTheme } from '@/context/ThemeContext'
import { spacing, radius, typography, font } from '@/constants/theme'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormState {
  email: string
  motDePasse: string
}

interface ErreurFormulaire {
  email?: string
  motDePasse?: string
  global?: string
}

// ─── Logo Orava — bull's-eye cercle jaune ────────────────────────────────────

function LogoOrava({ accent, bg }: { accent: string; bg: string }): React.JSX.Element {
  return (
    <View
      style={{
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: bg,
        }}
      />
    </View>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function LoginScreen(): React.JSX.Element {
  const { colors } = useTheme()
  const router = useRouter()

  const [form, setForm] = useState<FormState>({ email: '', motDePasse: '' })
  const [erreurs, setErreurs] = useState<ErreurFormulaire>({})
  const [chargement, setChargement] = useState<boolean>(false)
  const [motDePasseVisible, setMotDePasseVisible] = useState<boolean>(false)

  function validerFormulaire(): boolean {
    const nouvellesErreurs: ErreurFormulaire = {}
    if (!form.email.trim()) {
      nouvellesErreurs.email = 'Email requis'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nouvellesErreurs.email = 'Email invalide'
    }
    if (!form.motDePasse) {
      nouvellesErreurs.motDePasse = 'Mot de passe requis'
    }
    setErreurs(nouvellesErreurs)
    return Object.keys(nouvellesErreurs).length === 0
  }

  async function seConnecter(): Promise<void> {
    if (!validerFormulaire()) return
    setChargement(true)
    setErreurs({})

    const { error } = await supabase.auth.signInWithPassword({
      email: form.email.trim().toLowerCase(),
      password: form.motDePasse,
    })

    setChargement(false)

    if (error) {
      setErreurs({ global: 'Email ou mot de passe incorrect.' })
      return
    }

    router.replace('/(tabs)/feed')
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
          <LogoOrava accent={colors.accent} bg={colors.background} />
          <Text style={styles.wordmark}>ORAVA</Text>
          <Text style={styles.tagline}>Chaque séance devient une œuvre.</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>

          {/* Email */}
          <View style={styles.champGroupe}>
            <TextInput
              style={[styles.input, erreurs.email ? styles.inputErreur : null]}
              value={form.email}
              onChangeText={(v) => setForm(f => ({ ...f, email: v }))}
              placeholder="Adresse e-mail"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              accessibilityLabel="Champ email"
            />
            {erreurs.email ? (
              <Text style={styles.texteErreur}>{erreurs.email}</Text>
            ) : null}
          </View>

          {/* Mot de passe */}
          <View style={styles.champGroupe}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={[
                  styles.input,
                  styles.inputAvecBouton,
                  erreurs.motDePasse ? styles.inputErreur : null,
                ]}
                value={form.motDePasse}
                onChangeText={(v) => setForm(f => ({ ...f, motDePasse: v }))}
                placeholder="Mot de passe"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry={!motDePasseVisible}
                textContentType="password"
                accessibilityLabel="Champ mot de passe"
              />
              <Pressable
                style={styles.boutonVisibilite}
                onPress={() => setMotDePasseVisible(v => !v)}
                accessibilityLabel={motDePasseVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                hitSlop={8}
              >
                <Text style={styles.texteVisibilite}>
                  {motDePasseVisible ? 'Masquer' : 'Voir'}
                </Text>
              </Pressable>
            </View>
            {erreurs.motDePasse ? (
              <Text style={styles.texteErreur}>{erreurs.motDePasse}</Text>
            ) : null}
          </View>

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
            onPress={seConnecter}
            disabled={chargement}
            accessibilityRole="button"
            accessibilityLabel="Se connecter"
          >
            {chargement ? (
              <ActivityIndicator color={colors.background} size="small" />
            ) : (
              <Text style={styles.ctaTexte}>SE CONNECTER</Text>
            )}
          </Pressable>

          {/* Lien inscription */}
          <Pressable
            style={styles.lienInscription}
            onPress={() => router.push('/auth/register')}
            accessibilityRole="link"
            accessibilityLabel="Créer un compte"
          >
            <Text style={styles.lienTexte}>
              Pas encore de compte ?{' '}
              <Text style={styles.lienAccent}>S'inscrire</Text>
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
      marginBottom: spacing.s10,
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
    input: {
      height: 52,
      backgroundColor: colors.backgroundTertiary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.s4,
      ...typography.body,
      color: colors.textPrimary,
    },
    inputWrapper: {
      position: 'relative',
    },
    inputAvecBouton: {
      paddingRight: 72,
    },
    boutonVisibilite: {
      position: 'absolute',
      right: spacing.s4,
      top: 0,
      bottom: 0,
      justifyContent: 'center',
    },
    texteVisibilite: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    inputErreur: {
      borderWidth: 1,
      borderColor: colors.error,
    },
    texteErreur: {
      ...typography.caption,
      color: colors.error,
      marginTop: spacing.s1,
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
    lienInscription: {
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
