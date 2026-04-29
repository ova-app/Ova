export const dark = {
  background: '#1C1C1E',
  backgroundSecondary: '#2C2C2E',
  card: '#3A3A3C',
  textPrimary: '#FFFFFF',
  textSecondary: '#8E8E93',
  separator: '#3A3A3C',
  accent: '#D85A30',
  accentLight: '#FDE8DF',
  prAmber: '#FAC775',
  prOrange: '#D85A30',
  prGold: '#FFD700',
  prPurple: '#9B59B6',
  prSilver: '#C0C0C0',
  prBronze: '#CD7F32',
}

export const light = {
  background: '#FFFFFF',
  backgroundSecondary: '#F5F5F5',
  card: '#FFFFFF',
  textPrimary: '#1C1C1E',
  textSecondary: '#666666',
  separator: '#E5E5E5',
  accent: '#D85A30',
  accentLight: '#FDE8DF',
  prAmber: '#FAC775',
  prOrange: '#D85A30',
  prGold: '#FFD700',
  prPurple: '#9B59B6',
  prSilver: '#C0C0C0',
  prBronze: '#CD7F32',
}

export type ThemeColors = typeof dark
export type ThemeName = 'dark' | 'light'

export const themes: Record<ThemeName, ThemeColors> = { dark, light }