import { createContext, useContext, useEffect } from 'react'

// Dark theme removed — app is light-only.
// ThemeProvider kept so existing useTheme() calls don't break.
const ThemeContext = createContext({ mode: 'light', dark: false, setMode: () => {}, toggle: () => {} })

export function ThemeProvider({ children }) {
  useEffect(() => {
    // Always force light mode — remove dark class if it was stored from before
    document.documentElement.classList.remove('dark')
    localStorage.removeItem('dv2_theme_mode')
  }, [])

  return (
    <ThemeContext.Provider value={{ mode: 'light', dark: false, setMode: () => {}, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
