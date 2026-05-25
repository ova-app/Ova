import React from 'react'
import { View, StyleSheet, Image } from 'react-native'
import { Tabs } from 'expo-router'
import { Plus, BookOpen } from 'lucide-react-native'
import { dark, spacing, radius } from '@/constants/theme'

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: dark.accent,
        tabBarInactiveTintColor: dark.textSecondary,
      }}
    >
      <Tabs.Screen
        name="feed"
        options={{
          title: '',
          tabBarIcon: ({ color }) => (
            <View style={styles.logoContainer}>
              <View
                style={[
                  styles.logoBg,
                  { borderColor: color === dark.accent ? dark.accent : dark.textSecondary },
                ]}
              >
                <View style={styles.logoInnerRing}>
                  <View style={styles.logoCenterDot} />
                </View>
              </View>
            </View>
          ),
          tabBarLabel: () => null,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault()
            navigation.navigate('/(tabs)/feed')
          },
        })}
      />

      <Tabs.Screen
        name="start"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={styles.fabContainer}>
              <Plus size={32} color={dark.background} strokeWidth={2.5} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault()
            navigation.navigate('workout/session')
          },
        })}
      />

      <Tabs.Screen
        name="library"
        options={{
          title: '',
          tabBarIcon: ({ color }) => (
            <BookOpen size={24} color={color} strokeWidth={1.5} />
          ),
          tabBarLabel: () => null,
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
    paddingTop: spacing.s2,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  logoContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: dark.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  logoInnerRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: dark.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCenterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dark.accent,
  },
  fabContainer: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: dark.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.s3,
    shadowColor: dark.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
})
