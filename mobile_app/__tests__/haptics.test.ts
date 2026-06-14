/**
 * lib/haptics.ts — helper haptique central (rules/ui.md, ORA-041).
 *
 * expo-haptics est mocké. On teste :
 *   - chaque helper appelle la bonne API expo-haptics quand activé
 *   - refreshHapticsSetting lit settings_vibration ('false' → désactivé)
 *   - setHapticsEnabled gate tous les helpers (opt-out réunion)
 *   - ghostBeaten = double pulse (Medium + 120ms + Medium)
 */

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Error: 'error', Warning: 'warning' },
}))

import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  tap,
  select,
  prGold,
  prBronzeSilver,
  ghostBeaten,
  errorHaptic,
  sessionSave,
  timerDone,
  refreshHapticsSetting,
  setHapticsEnabled,
  hapticsEnabled,
} from '../lib/haptics'

const mockImpact = Haptics.impactAsync as jest.Mock
const mockNotif = Haptics.notificationAsync as jest.Mock

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  setHapticsEnabled(true) // reset l'état module entre tests
})

describe('helpers haptiques — activé', () => {
  it('tap → impact Light', () => {
    tap()
    expect(mockImpact).toHaveBeenCalledWith('light')
  })

  it('select & prBronzeSilver → impact Medium', () => {
    select()
    prBronzeSilver()
    expect(mockImpact).toHaveBeenCalledTimes(2)
    expect(mockImpact).toHaveBeenNthCalledWith(1, 'medium')
    expect(mockImpact).toHaveBeenNthCalledWith(2, 'medium')
  })

  it('prGold / sessionSave / timerDone → notification Success', () => {
    prGold()
    sessionSave()
    timerDone()
    expect(mockNotif).toHaveBeenCalledTimes(3)
    expect(mockNotif).toHaveBeenCalledWith('success')
  })

  it('errorHaptic → notification Error', () => {
    errorHaptic()
    expect(mockNotif).toHaveBeenCalledWith('error')
  })
})

describe('ghostBeaten — double pulse', () => {
  it('déclenche deux impacts Medium espacés de 120ms', () => {
    jest.useFakeTimers()
    ghostBeaten()
    expect(mockImpact).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(120)
    expect(mockImpact).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })
})

describe('gating — settings_vibration', () => {
  it('refreshHapticsSetting("false") désactive tous les helpers', async () => {
    await AsyncStorage.setItem('settings_vibration', 'false')
    await refreshHapticsSetting()
    expect(hapticsEnabled()).toBe(false)
    tap()
    select()
    prGold()
    timerDone()
    expect(mockImpact).not.toHaveBeenCalled()
    expect(mockNotif).not.toHaveBeenCalled()
  })

  it('refreshHapticsSetting(absent) garde activé (défaut)', async () => {
    await refreshHapticsSetting()
    expect(hapticsEnabled()).toBe(true)
    tap()
    expect(mockImpact).toHaveBeenCalledWith('light')
  })

  it('setHapticsEnabled(false) gate immédiatement', () => {
    setHapticsEnabled(false)
    tap()
    timerDone()
    expect(mockImpact).not.toHaveBeenCalled()
    expect(mockNotif).not.toHaveBeenCalled()
  })
})
