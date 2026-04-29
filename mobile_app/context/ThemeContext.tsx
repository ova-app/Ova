import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { themes, ThemeColors, ThemeName } from '../constants/theme'

interface ThemeContextValue {
  themeName: ThemeName
  colors: ThemeColors
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider')
  return ctx
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeName, setThemeName] = useState<ThemeName>('dark')

  useEffect(() => {
    AsyncStorage.getItem('theme').then(value => {
      if (value === 'light' || value === 'dark') setThemeName(value)
    })
  }, [])

  function toggleTheme() {
    const next: ThemeName = themeName === 'dark' ? 'light' : 'dark'
    setThemeName(next)
    AsyncStorage.setItem('theme', next)
  }

  return (
    <ThemeContext.Provider value={{ themeName, colors: themes[themeName], toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}