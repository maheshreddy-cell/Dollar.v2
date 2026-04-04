import { createContext, useContext, useState, useEffect } from 'react'

// mode: 'light' | 'auto' | 'dark'
// auto = follows system prefers-color-scheme
const ThemeContext = createContext({ mode: 'auto', dark: false, setMode: () => {} })

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    const saved = localStorage.getItem('dv2_theme_mode')
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
  })

  // Derived: is dark actually active right now?
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('dv2_theme_mode')
    if (saved === 'dark')  return true
    if (saved === 'light') return false
    return getSystemDark()
  })

  useEffect(() => {
    function apply(m) {
      const isDark = m === 'dark' || (m === 'auto' && getSystemDark())
      document.documentElement.classList.toggle('dark', isDark)
      setDark(isDark)
    }

    apply(mode)
    localStorage.setItem('dv2_theme_mode', mode)

    // Track system changes when in auto mode
    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      const handler = () => apply('auto')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [mode])

  const setMode = (m) => setModeState(m)

  // Legacy compat: toggle() still works (cycles light → auto → dark → light)
  const toggle = () => setModeState(m => m === 'light' ? 'auto' : m === 'auto' ? 'dark' : 'light')

  return (
    <ThemeContext.Provider value={{ mode, dark, setMode, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
