/**
 * ORAVA — Session 05
 * app/exercise/_layout.tsx
 * Layout du groupe exercise — Stack sans header natif
 */

import { Stack } from 'expo-router'

export default function ExerciseLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="[id]" />
    </Stack>
  )
}