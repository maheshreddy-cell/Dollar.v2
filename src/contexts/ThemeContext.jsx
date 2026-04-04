import { createContext, useContext } from 'react'

// Dark theme removed. Always light.
// Immediately purge any leftover dark class + localStorage key.
if (typeof window !== 'undefined') {
  document.documentElement.classList.remove('dark')
  localStorage.removeItem('dv2_theme_mode')
  localStorage.removeItem('dv2_theme')
}

const ThemeContext = createContext({ mode: 'light', dark: false, setMode: () => {}, toggle: () => {} })

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={{ mode: 'light', dark: false, setMode: () => {}, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
