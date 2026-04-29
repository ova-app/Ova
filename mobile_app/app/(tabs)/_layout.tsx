import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { Tabs, router } from 'expo-router'
import { Users, Dumbbell, CirclePlus, CalendarDays, CircleUser } from 'lucide-react-native'
import { useWorkout } from '../../context/WorkoutContext'
import { useTheme } from '../../context/ThemeContext'

// ─── FAB ─────────────────────────────────────────────────────────────────────

function FABButton() {
  const workout = useWorkout()
  const { colors } = useTheme()
  const [showConfirm, setShowConfirm] = useState(false)

  function handlePress() {
    if (workout.status === 'active') {
      router.push('/workout/session')
    } else {
      setShowConfirm(true)
    }
  }

  function handleConfirm() {
    setShowConfirm(false)
    router.push('/workout/session')
  }

  return (
    <>
      <TouchableOpacity style={styles.fabWrapper} onPress={handlePress} activeOpacity={0.85}>
        <View style={styles.fab}>
          <CirclePlus color="#fff" size={28} strokeWidth={1.8} />
          {workout.status === 'active' && (
            <View style={[styles.activeDot, { borderColor: colors.background }]} />
          )}
        </View>
      </TouchableOpacity>

      <Modal
        visible={showConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Lancer une séance ?</Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
              Ton timer et tes sets seront enregistrés.
            </Text>
            <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleConfirm}>
              <Text style={styles.modalBtnPrimaryText}>Commencer</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalBtnSecondary} onPress={() => setShowConfirm(false)}>
              <Text style={[styles.modalBtnSecondaryText, { color: colors.textSecondary }]}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export default function TabsLayout() {
  const { colors } = useTheme()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.separator, height: 80, paddingBottom: 16 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Fil',
          tabBarLabel: 'Fil',
          tabBarIcon: ({ color, size }) => <Users color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historique',
          tabBarLabel: 'Historique',
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="start"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarButton: () => <FABButton />,
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Bibliothèque',
          tabBarLabel: 'Biblio.',
          tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size - 2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarLabel: 'Profil',
          tabBarIcon: ({ color, size }) => <CircleUser color={color} size={size - 2} />,
        }}
      />
    </Tabs>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fabWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#D85A30',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D85A30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 8,
  },
  activeDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FAC775',
    borderWidth: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    alignItems: 'stretch',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  modalBtnPrimary: {
    backgroundColor: '#D85A30',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  modalBtnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBtnSecondary: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
  },
})