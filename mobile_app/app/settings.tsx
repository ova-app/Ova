import { useEffect, useState } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, Modal,
} from 'react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../lib/supabase'
import { useTheme } from '../context/ThemeContext'

// ─── Types ───────────────────────────────────────────────────────────────────

type WeightUnit = 'kg' | 'lbs'
type Visibility = 'public' | 'private'
type RestDefault = 'disabled' | '60' | '90' | '120' | '180'

// ─── Composant ───────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { colors, themeName, toggleTheme } = useTheme()

  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [vibration, setVibration] = useState(true)
  const [defaultRest, setDefaultRest] = useState<RestDefault>('90')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const [unit, vib, rest, vis] = await Promise.all([
      AsyncStorage.getItem('weight_unit'),
      AsyncStorage.getItem('vibration'),
      AsyncStorage.getItem('default_rest'),
      AsyncStorage.getItem('default_visibility'),
    ])
    if (unit === 'kg' || unit === 'lbs') setWeightUnit(unit)
    if (vib !== null) setVibration(vib !== 'false')
    if (rest) setDefaultRest(rest as RestDefault)
    if (vis === 'public' || vis === 'private') setVisibility(vis)
  }

  async function set<T extends string>(key: string, value: T, setter: (v: T) => void) {
    setter(value)
    await AsyncStorage.setItem(key, value)
  }

  async function handleSignOut() {
    Alert.alert('Se déconnecter ?', 'Tu devras te reconnecter pour accéder à Orava.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Déconnexion', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ])
  }

  async function handleDeleteAccount() {
    Alert.alert(
      'Supprimer mon compte',
      'Cette action est irréversible. Toutes vos données seront supprimées définitivement.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer', style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser()
              if (user) {
                await (supabase.auth as any).admin?.deleteUser(user.id)
              }
              await supabase.auth.signOut()
            } catch {
              await supabase.auth.signOut()
            }
          },
        },
      ]
    )
  }

  const c = colors

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { borderBottomColor: c.separator }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: c.accent }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: c.textPrimary }]}>Paramètres</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* ── Préférences ── */}
        <SectionTitle label="Préférences" colors={c} />

        <SettingCard colors={c}>
          <SettingRow label="Unité de poids" colors={c}>
            <SegmentControl
              options={[{ key: 'kg', label: 'kg' }, { key: 'lbs', label: 'lbs' }]}
              selected={weightUnit}
              onSelect={v => set('weight_unit', v as WeightUnit, setWeightUnit)}
              colors={c}
            />
          </SettingRow>

          <Divider colors={c} />

          <SettingRow label="Thème" colors={c}>
            <SegmentControl
              options={[{ key: 'dark', label: 'Sombre' }, { key: 'light', label: 'Clair' }]}
              selected={themeName}
              onSelect={() => toggleTheme()}
              colors={c}
            />
          </SettingRow>

          <Divider colors={c} />

          <SettingRow label="Vibration fin de repos" colors={c}>
            <Switch
              value={vibration}
              onValueChange={v => set('vibration', String(v), () => setVibration(v))}
              trackColor={{ false: c.separator, true: c.accent }}
              thumbColor="#fff"
            />
          </SettingRow>
        </SettingCard>

        {/* ── Entraînement ── */}
        <SectionTitle label="Entraînement" colors={c} />

        <SettingCard colors={c}>
          <View style={styles.restSection}>
            <Text style={[styles.settingLabel, { color: c.textPrimary }]}>Timer repos par défaut</Text>
            <View style={styles.restOptions}>
              {(['disabled', '60', '90', '120', '180'] as RestDefault[]).map(opt => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.restChip,
                    { backgroundColor: c.backgroundSecondary, borderColor: c.separator },
                    defaultRest === opt && { backgroundColor: c.accent, borderColor: c.accent },
                  ]}
                  onPress={() => set('default_rest', opt, setDefaultRest)}
                >
                  <Text style={[
                    styles.restChipText,
                    { color: c.textSecondary },
                    defaultRest === opt && { color: '#fff', fontWeight: '700' },
                  ]}>
                    {opt === 'disabled' ? 'Off' : `${opt}s`}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <Divider colors={c} />

          <SettingRow label="Visibilité des séances" colors={c}>
            <SegmentControl
              options={[{ key: 'public', label: 'Public' }, { key: 'private', label: 'Privé' }]}
              selected={visibility}
              onSelect={v => set('default_visibility', v as Visibility, setVisibility)}
              colors={c}
            />
          </SettingRow>
        </SettingCard>

        {/* ── Compte ── */}
        <SectionTitle label="Compte" colors={c} />

        <SettingCard colors={c}>
          <TouchableOpacity style={styles.actionRow} onPress={() => router.push('/edit-profile' as any)}>
            <Text style={[styles.actionLabel, { color: c.textPrimary }]}>Modifier mon profil</Text>
            <Text style={[styles.chevron, { color: c.textSecondary }]}>›</Text>
          </TouchableOpacity>

          <Divider colors={c} />

          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Alert.alert(
              'Changer le mot de passe',
              'Un e-mail de réinitialisation va être envoyé.',
              [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Envoyer', onPress: async () => {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user?.email) await supabase.auth.resetPasswordForEmail(user.email)
                  }
                },
              ]
            )}
          >
            <Text style={[styles.actionLabel, { color: c.textPrimary }]}>Changer mon mot de passe</Text>
            <Text style={[styles.chevron, { color: c.textSecondary }]}>›</Text>
          </TouchableOpacity>

          <Divider colors={c} />

          <TouchableOpacity style={styles.actionRow} onPress={handleSignOut}>
            <Text style={[styles.actionLabel, { color: c.accent }]}>Se déconnecter</Text>
          </TouchableOpacity>
        </SettingCard>

        {/* ── À propos ── */}
        <SectionTitle label="À propos" colors={c} />

        <SettingCard colors={c}>
          <TouchableOpacity style={styles.actionRow} onPress={() => setShowHelp(true)}>
            <Text style={[styles.actionLabel, { color: c.textPrimary }]}>Comment ça marche ?</Text>
            <Text style={[styles.chevron, { color: c.textSecondary }]}>›</Text>
          </TouchableOpacity>
        </SettingCard>

        {/* ── Données ── */}
        <SectionTitle label="Données" colors={c} />

        <SettingCard colors={c}>
          <TouchableOpacity style={styles.actionRow} onPress={handleDeleteAccount}>
            <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Supprimer mon compte</Text>
          </TouchableOpacity>
        </SettingCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} colors={c} />
    </View>
  )
}

// ─── HelpModal ────────────────────────────────────────────────────────────────

const HELP_ITEMS = [
  { icon: '💪', title: 'Lance une séance', body: 'Appuie sur le bouton central (+) pour démarrer. Ajoute des exercices, saisis tes séries et valide.' },
  { icon: '⏱️', title: 'Timer de repos', body: 'Après chaque série validée, un timer se lance automatiquement. Tu peux le mettre en pause ou changer la durée.' },
  { icon: '⚡', title: 'PR Charge', body: 'Poids le plus lourd soulevé sur cet exercice, toutes séances confondues. Chaque set est comparé à ton top-3 historique → 🥇 record absolu, 🥈 2e meilleur poids, 🥉 3e meilleur poids.' },
  { icon: '🔥', title: 'PR Série', body: 'Volume maximum sur un seul set (poids × reps), toutes séances confondues. Même logique podium 🥇🥈🥉 — récompense les séries à la fois lourdes et longues.' },
  { icon: '💜', title: 'PR Exercice', body: 'Volume total d\'un exercice dans une séance (somme de tous tes sets), comparé à tes meilleures séances précédentes. Récompense quand tu bats ton record de volume sur cet exercice.' },
  { icon: '🏆', title: 'PR Séance', body: 'Volume total de la séance entière, comparé à tes meilleures séances. Le trophée apparaît dans le feed et l\'historique quand tu bats ton record de séance.' },
  { icon: '🏅', title: 'Armurerie des PRs', body: 'L\'icône trophée sur ton profil affiche le podium complet Or / Argent / Bronze pour chaque exercice, avec le poids, les reps et la date.' },
  { icon: '📊', title: 'Analytics', body: 'Accès via l\'icône graphe sur ton profil. Au programme : résumé (séances, volume, durée) · volume par semaine · répartition musculaire · régularité et streak · progression des charges · exercices les plus pratiqués · équilibre Push/Pull et Haut/Bas · compteurs de PRs battus sur la période.' },
  { icon: '👥', title: 'Fil social', body: 'Tes séances publiques apparaissent dans le fil de tes abonnés. Tu peux liker et commenter.' },
]

function HelpModal({ visible, onClose, colors }: {
  visible: boolean; onClose: () => void
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[helpStyles.container, { backgroundColor: colors.background }]}>
        <View style={[helpStyles.header, { borderBottomColor: colors.separator }]}>
          <Text style={[helpStyles.title, { color: colors.textPrimary }]}>Comment ça marche ?</Text>
          <TouchableOpacity onPress={onClose} style={helpStyles.closeBtn}>
            <Text style={[helpStyles.closeText, { color: colors.accent }]}>Fermer</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={helpStyles.content} showsVerticalScrollIndicator={false}>
          {HELP_ITEMS.map((item, idx) => (
            <View key={idx} style={[helpStyles.item, { backgroundColor: colors.card, borderColor: colors.separator }]}>
              <Text style={helpStyles.itemIcon}>{item.icon}</Text>
              <View style={helpStyles.itemText}>
                <Text style={[helpStyles.itemTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                <Text style={[helpStyles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}

const helpStyles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 24, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 16, fontWeight: '600' },
  content: { padding: 20, gap: 12 },
  item: {
    flexDirection: 'row', gap: 14, borderRadius: 14, borderWidth: 1,
    padding: 16, alignItems: 'flex-start',
  },
  itemIcon: { fontSize: 26, marginTop: 2 },
  itemText: { flex: 1, gap: 4 },
  itemTitle: { fontSize: 15, fontWeight: '700' },
  itemBody: { fontSize: 13, lineHeight: 19 },
})

// ─── Sous-composants ─────────────────────────────────────────────────────────

function SectionTitle({ label, colors }: { label: string; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{label}</Text>
  )
}

function SettingCard({ children, colors }: { children: React.ReactNode; colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.separator }]}>
      {children}
    </View>
  )
}

function SettingRow({ label, children, colors }: {
  label: string; children: React.ReactNode; colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={styles.row}>
      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>{label}</Text>
      {children}
    </View>
  )
}

function Divider({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return <View style={[styles.divider, { backgroundColor: colors.separator }]} />
}

function SegmentControl({ options, selected, onSelect, colors }: {
  options: { key: string; label: string }[]
  selected: string
  onSelect: (key: string) => void
  colors: ReturnType<typeof useTheme>['colors']
}) {
  return (
    <View style={[styles.segment, { backgroundColor: colors.backgroundSecondary }]}>
      {options.map(opt => (
        <TouchableOpacity
          key={opt.key}
          style={[
            styles.segmentItem,
            selected === opt.key && { backgroundColor: colors.accent },
          ]}
          onPress={() => onSelect(opt.key)}
        >
          <Text style={[
            styles.segmentText,
            { color: selected === opt.key ? '#fff' : colors.textSecondary },
            selected === opt.key && { fontWeight: '700' },
          ]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 58, paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  backText: { fontSize: 28, fontWeight: '300', lineHeight: 30 },
  title: { fontSize: 18, fontWeight: '700' },
  content: { padding: 20, gap: 4 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 20, marginBottom: 8, paddingHorizontal: 4,
  },
  card: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  settingLabel: { fontSize: 15, flex: 1 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  actionLabel: { fontSize: 15 },
  chevron: { fontSize: 20 },
  segment: {
    flexDirection: 'row', borderRadius: 8, padding: 2,
  },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6 },
  segmentText: { fontSize: 13 },
  restSection: { paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
  restOptions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  restChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
  },
  restChipText: { fontSize: 13 },
})