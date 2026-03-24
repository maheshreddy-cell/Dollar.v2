import { createContext, useContext, useState } from 'react'
import { login as apiLogin, activateInvite as apiActivate } from '../services/api'

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

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(() => readSession())
  const [viewAs, setViewAs]   = useState(null)   // { email, name, role, managerEmail }

  // What all pages see for data fetching — real user unless Admin is impersonating
  const effectiveUser = viewAs || user

  const login = async (email, password) => {
    const userData = await apiLogin(email, password)
    localStorage.setItem(SESSION_KEY, JSON.stringify(userData))
    setUser(userData)
    setViewAs(null)
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
