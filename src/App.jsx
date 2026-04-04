import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { MonthProvider } from './contexts/MonthContext'
import { PermissionsProvider } from './contexts/PermissionsContext'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'

// Eagerly load auth pages (needed before app shell renders)
import Login from './pages/Login'
import InviteActivate from './pages/InviteActivate'

// Lazy-load all app pages for instant navigation after first visit
const Dashboard        = lazy(() => import('./pages/Dashboard'))
const Deals            = lazy(() => import('./pages/Deals'))
const AssignTargets    = lazy(() => import('./pages/AssignTargets'))
const Team             = lazy(() => import('./pages/Team'))
const Metrics          = lazy(() => import('./pages/Metrics'))
const OrgPage          = lazy(() => import('./pages/OrgPage'))
const CommissionConfig = lazy(() => import('./pages/CommissionConfig'))
const ManagerTargets   = lazy(() => import('./pages/ManagerTargets'))
const FAQ              = lazy(() => import('./pages/FAQ'))
const Permissions      = lazy(() => import('./pages/Permissions'))
const Kickers          = lazy(() => import('./pages/Kickers'))
const AnnounceKicker   = lazy(() => import('./pages/AnnounceKicker'))

// Prefetch all page chunks in the background after login so navigation is instant
const LAZY_CHUNKS = [
  () => import('./pages/Dashboard'),
  () => import('./pages/Deals'),
  () => import('./pages/AssignTargets'),
  () => import('./pages/Team'),
  () => import('./pages/Metrics'),
  () => import('./pages/OrgPage'),
  () => import('./pages/CommissionConfig'),
  () => import('./pages/ManagerTargets'),
  () => import('./pages/FAQ'),
  () => import('./pages/Permissions'),
  () => import('./pages/Kickers'),
  () => import('./pages/AnnounceKicker'),
]

function PrefetchChunks() {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      LAZY_CHUNKS.forEach(fn => requestIdleCallback(fn, { timeout: 5000 }))
    } else {
      LAZY_CHUNKS.forEach((fn, i) => setTimeout(fn, i * 150 + 500))
    }
  }, [])
  return null
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600" />
    </div>
  )
}

function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#faf9f5] dark:bg-surface-dark">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6 dark:bg-surface-dark">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}<PrefetchChunks /></>
}

function RequireRole({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <PermissionsProvider>
      <MonthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite" element={<InviteActivate />} />

          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/my-targets" element={<Navigate to="/deals" replace />} />
            <Route
              path="/deals"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH', 'Manager', 'Agent', 'PreSales']}>
                  <Deals />
                </RequireRole>
              }
            />

            <Route
              path="/assign-targets"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH', 'Manager']}>
                  <AssignTargets />
                </RequireRole>
              }
            />
            <Route
              path="/team"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH', 'Manager']}>
                  <Team />
                </RequireRole>
              }
            />
            <Route
              path="/metrics"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH', 'Manager', 'Agent', 'PreSales']}>
                  <Metrics />
                </RequireRole>
              }
            />
            <Route
              path="/org"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH', 'Manager']}>
                  <OrgPage />
                </RequireRole>
              }
            />
            <Route
              path="/commission-config"
              element={
                <RequireRole roles={['Admin', 'SalesHead', 'VH']}>
                  <CommissionConfig />
                </RequireRole>
              }
            />
            <Route
              path="/manager-targets"
              element={
                <RequireRole roles={['Manager', 'Admin']}>
                  <ManagerTargets />
                </RequireRole>
              }
            />
            <Route path="/faq" element={<FAQ />} />
            <Route
              path="/kickers"
              element={
                <RequireRole roles={['Admin','SalesHead','VH','Manager','Agent','PreSales']}>
                  <Kickers />
                </RequireRole>
              }
            />
            <Route
              path="/announce-kicker"
              element={
                <RequireRole roles={['Admin','SalesHead','VH','Manager']}>
                  <AnnounceKicker />
                </RequireRole>
              }
            />
            <Route
              path="/permissions"
              element={
                <RequireRole roles={['Admin','SalesHead','VH']}>
                  <Permissions />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MonthProvider>
      </PermissionsProvider>
    </AuthProvider>
    </ThemeProvider>
  )
}
