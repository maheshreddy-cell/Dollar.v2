import { createContext, useContext, useState, useEffect } from 'react'

export const THEMES = ['light', 'dark', 'ocean']

const ThemeContext = createContext({ theme: 'light', setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('dollar_theme') || 'light' } catch { return 'light' }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try { localStorage.setItem('dollar_theme', theme) } catch {}
  }, [theme])

  function setTheme(t) {
    if (THEMES.includes(t)) setThemeState(t)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
