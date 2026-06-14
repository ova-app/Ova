import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Helper haptique central (rules/ui.md) ────────────────────────────────────
// Taxonomie unique + respect du toggle `settings_vibration` (opt-out réunion).
// Règle : le haptique SUIT le visuel — jamais avant. Aucun haptique pendant le
// reveal Myo (le visuel suffit).
//
// Cache mémoire `_enabled` pour éviter un `await AsyncStorage` à chaque tap.
// À rafraîchir au boot / à l'ouverture d'un écran (refreshHapticsSetting) et à
// chaque changement du toggle settings (setHapticsEnabled).

let _enabled = true

export async function refreshHapticsSetting(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem('settings_vibration')
    _enabled = v !== 'false'
  } catch {
    _enabled = true
  }
}

export function setHapticsEnabled(enabled: boolean): void {
  _enabled = enabled
}

export function hapticsEnabled(): boolean {
  return _enabled
}

// chaque log set, navigation
export function tap(): void {
  if (!_enabled) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
}

// sélection exercice, snap WheelPicker
export function select(): void {
  if (!_enabled) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

// PR bronze/argent — déclencher 800ms après le flash visuel
export function prBronzeSilver(): void {
  if (!_enabled) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
}

// PR or — déclencher 800ms après le flash visuel
export function prGold(): void {
  if (!_enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

// Fantôme battu — double pulse (Medium + 120ms + Medium)
export function ghostBeaten(): void {
  if (!_enabled) return
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  setTimeout(() => {
    if (_enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
  }, 120)
}

export function errorHaptic(): void {
  if (!_enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
}

// fin de séance enregistrée
export function sessionSave(): void {
  if (!_enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}

// fin de timer de repos (validation série) — remplace l'ancien Vibration.vibrate brut (ORA-041)
export function timerDone(): void {
  if (!_enabled) return
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
}
