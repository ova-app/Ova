// ─── COLORS ──────────────────────────────────────────────────────────────────

export const dark = {
  // Fonds
  background:          '#0A0A0F',
  backgroundSecondary: '#12121A',
  backgroundTertiary:  '#1A1A24',

  // Texte
  textPrimary:   '#F0F0F5',
  textSecondary: '#7A7A8C',
  textTertiary:  '#4A4A5A',

  // Séparations
  separator:     'rgba(255,255,255,0.06)',
  border:        'rgba(240,240,245,0.07)',

  // Accent unique — CTA, PR actif, métrique hero UNIQUEMENT
  accent: '#FFDD00',

  // PR Podium
  prGold:     '#FAC775',
  prSilver:   '#C0C0C0',
  prBronze:   '#CD7F32',
  prExercice: '#9B59B6',

  // États sémantiques — vert/rouge = gain/perte/succès/erreur UNIQUEMENT
  success: '#00E673',
  error:   '#FF3B30',
  warning: '#FFD60A',

  // Champs
  inputBackground: '#1A1A24',
  switchBackground: '#4A4A5A',
}

export const light = {
  background:          '#F5F5FA',
  backgroundSecondary: '#FFFFFF',
  backgroundTertiary:  '#EBEBF0',

  textPrimary:   '#0A0A0F',
  textSecondary: '#5A5A6C',
  textTertiary:  '#9A9AAC',

  separator:     'rgba(10,10,15,0.06)',
  border:        'rgba(10,10,15,0.08)',

  accent: '#FFDD00',

  prGold:     '#FAC775',
  prSilver:   '#C0C0C0',
  prBronze:   '#CD7F32',
  prExercice: '#9B59B6',

  success: '#00C85A',
  error:   '#FF3B30',
  warning: '#FFD60A',

  inputBackground: '#EBEBF0',
  switchBackground: '#C0C0CC',
}

export type ThemeColors = typeof dark
export type ThemeName = 'dark' | 'light'
export const themes: Record<ThemeName, ThemeColors> = { dark, light }

// ─── TYPOGRAPHY ──────────────────────────────────────────────────────────────

export const font = {
  regular:         'Barlow_400Regular',
  medium:          'Barlow_500Medium',
  bold:            'Barlow_700Bold',
  extraBold:       'Barlow_800ExtraBold',
  black:           'Barlow_900Black',
  condensedBold:   'BarlowCondensed_700Bold',
  mono:            'JetBrainsMono_500Medium',
} as const

export const typography = {
  hero: {
    fontSize: 56, fontFamily: font.black,
    letterSpacing: -1.5, lineHeight: 60,
  },
  display: {
    fontSize: 40, fontFamily: font.extraBold,
    letterSpacing: -1.0, lineHeight: 44,
  },
  title: {
    fontSize: 24, fontFamily: font.bold,
    letterSpacing: -0.3, lineHeight: 30,
  },
  subtitle: {
    fontSize: 18, fontFamily: font.medium,
    letterSpacing: -0.2, lineHeight: 24,
  },
  body: {
    fontSize: 15, fontFamily: font.regular,
    letterSpacing: 0, lineHeight: 22,
  },
  caption: {
    fontSize: 12, fontFamily: font.medium,
    letterSpacing: 0.4, lineHeight: 16,
  },
  mono: {
    fontSize: 14, fontFamily: font.mono,
    letterSpacing: 0,
    // fontVariant: ['tabular-nums'] — ajouter sur le Text RN directement
  },
} as const

// ─── SPACING — grille 8pt ─────────────────────────────────────────────────────

export const spacing = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
} as const

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 9999,
} as const

export const touchTarget = {
  min:     44,
  comfort: 52,
  hero:    64,
} as const

// ─── ANIMATION ────────────────────────────────────────────────────────────────

export const spring = {
  snappy:   { damping: 20, stiffness: 600 },
  standard: { damping: 18, stiffness: 300 },
  bouncy:   { damping: 12, stiffness: 200 },
  gentle:   { damping: 25, stiffness: 120 },
} as const

export const duration = {
  fast:     150,
  standard: 250,
  emphasis: 400,
  dramatic: 700,
} as const