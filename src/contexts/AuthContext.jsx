import { createContext, useContext, useState, useEffect, useRef } from 'react'
import { login as apiLogin, activateInvite as apiActivate, logUsage, logDuration } from '../services/api'
import { warmCache } from '../services/supabase'

const AuthContext = createContext(null)

const SESSION_KEY = 'dollarUser'

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function shouldLogToday(email) {
  const key = `dv2_usage_logged_${email}_${new Date().toLocaleDateString('en-CA')}`
  if (localStorage.getItem(key)) return false
  localStorage.setItem(key, '1')
  return true
}

// ─── Session timer hook ─────────────────────────────────────────────────────
// Tracks active time while the tab is visible. Flushes to the server every
// 5 minutes and on tab-hide / beforeunload so Usage Analytics can show
// time spent per user.
function useSessionTimer(user) {
  const startRef    = useRef(null)   // when visible period began
  const pendingRef  = useRef(0)      // seconds accumulated but not yet flushed

  const flush = (u) => {
    if (!u) return
    if (startRef.current) {
      pendingRef.current += (Date.now() - startRef.current) / 1000
      startRef.current = null
    }
    if (pendingRef.current >= 10) {
      logDuration(u, pendingRef.current)
      pendingRef.current = 0
    }
  }

  useEffect(() => {
    if (!user) return

    // Start timer if tab is already visible
    if (document.visibilityState === 'visible') startRef.current = Date.now()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flush(user)
      } else {
        startRef.current = Date.now()
      }
    }

    const onUnload = () => flush(user)

    // Flush every 5 minutes to avoid losing data on crash/forced close
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && startRef.current) {
        const elapsed = (Date.now() - startRef.current) / 1000
        pendingRef.current += elapsed
        startRef.current = Date.now()
        if (pendingRef.current >= 60) {
          logDuration(user, pendingRef.current)
          pendingRef.current = 0
        }
      }
    }, 5 * 60 * 1000)

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      flush(user)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [user?.email])
}
// ────────────────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => {
    const saved = readSession()
    if (saved) {
      warmCache()
      if (shouldLogToday(saved.email)) logUsage(saved)
    }
    return saved
  })
  const [viewAs, setViewAs]   = useState(null)

  const effectiveUser = viewAs || user

  useSessionTimer(user)

  const login = async (email, password) => {
    const userData = await apiLogin(email, password)
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    setUser(userData)
    setViewAs(null)
    warmCache()
    logUsage(userData)
    return userData
  }

  const activateInvite = async (token, password) => {
    const userData = await apiActivate(token, password)
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    setUser(userData)
    return userData
  }

  const logout = () => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
    setViewAs(null)
  }

  const isRole = (...roles) => {
    if (!user) return false
    return roles.includes(user.role)
  }

  return (
    <AuthContext.Provider value={{
      user,
      effectiveUser,
      viewAs,
      setViewAs,
      clearViewAs: () => setViewAs(null),
      loading: false,
      login,
      activateInvite,
      logout,
      isRole,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export default AuthContext
