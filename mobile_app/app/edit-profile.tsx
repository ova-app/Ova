import { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

export default function EditProfileScreen() {
  const { colors } = useTheme()
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProfile() }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase
      .from('users')
      .select('username, full_name')
      .eq('id', user.id)
      .single()
    if (data) {
      setUsername(data.username ?? '')
      setFullName(data.full_name ?? '')
    }
    setLoading(false)
  }

  async function handleSave() {
    if (!username.trim()) {
      Alert.alert('Champ requis', 'Le nom d\'utilisateur ne peut pas être vide.')
      return
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { error } = await supabase
        .from('users')
        .update({ username: username.trim(), full_name: fullName.trim() || null })
        .eq('id', user.id)
      if (error) {
        Alert.alert('Erreur', error.message)
      } else {
        router.back()
      }
    }
    setSaving(false)
  }

  const c = colors

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} size="large" />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { borderBottomColor: c.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.textPrimary }]}>Modifier le profil</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Nom complet</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.card, borderColor: c.separator, color: c.textPrimary }]}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Prénom Nom"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.label, { color: c.textSecondary }]}>Nom d'utilisateur</Text>
          <TextInput
            style={[styles.input, { backgroundColor: c.card, borderColor: c.separator, color: c.textPrimary }]}
            value={username}
            onChangeText={setUsername}
            placeholder="@username"
            placeholderTextColor={c.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: c.accent, opacity: saving ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>Enregistrer</Text>
          }
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '700' },
  form: { padding: 20, gap: 20 },
  field: { gap: 8 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16,
  },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})