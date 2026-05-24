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
          <LogoOrava accent={colors.accent} bg={colors.background} />
          <Text style={styles.wordmark}>ORAVA</Text>
          <Text style={styles.tagline}>Chaque séance devient une œuvre.</Text>
        </View>

        {/* Formulaire */}
        <View style={styles.form}>

          {/* Nom d'utilisateur */}
          <View style={styles.champGroupe}>
            <TextInput
              style={[styles.input, erreurs.nomUtilisateur ? styles.inputErreur : null]}
              value={form.nomUtilisateur}
              onChangeText={(v) => setForm(f => ({ ...f, nomUtilisateur: v }))}
              placeholder="Nom d'utilisateur"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              accessibilityLabel="Champ nom d'utilisateur"
            />
            {erreurs.nomUtilisateur ? (
              <Text style={styles.texteErreur}>{erreurs.nomUtilisateur}</Text>
            ) : null}
          </View>

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
                textContentType="newPassword"
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
