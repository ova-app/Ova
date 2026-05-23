import { Tabs, useRouter } from 'expo-router'
import { TouchableOpacity, View, StyleSheet } from 'react-native'
import { Home, BookOpen, History, User } from 'lucide-react-native'
import { dark, spacing, radius } from '@/constants/theme'
import { Dumbbell } from 'lucide-react-native'

function FabButton() {
  const router = useRouter()
  return (
    <TouchableOpacity
      style={styles.fab}
      onPress={() => router.push('/workout/session')}
      activeOpacity={0.85}
    >
      <Dumbbell size={24} color="#0A0A0F" />
    </TouchableOpacity>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: dark.accent,
        tabBarInactiveTintColor: dark.textTertiary,
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarIcon: ({ color }) => <History size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="start"
        options={{
          tabBarIcon: () => <FabButton />,
          tabBarStyle: { display: 'none' },
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          tabBarIcon: ({ color }) => <BookOpen size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => <User size={22} color={color} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: dark.backgroundSecondary,
    borderTopColor: dark.separator,
    borderTopWidth: 1,
    height: 64,
    paddingBottom: spacing.s2,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: dark.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.s3,
  },
})
