import { Suspense, lazy, useEffect, Component } from 'react'
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
const Usage            = lazy(() => import('./pages/Usage'))
const AIHelp           = lazy(() => import('./pages/AIHelp'))
const Notifications    = lazy(() => import('./pages/Notifications'))
const SalesTeamDBMTD   = lazy(() => import('./pages/SalesTeamDBMTD'))

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
  () => import('./pages/AIHelp'),
  () => import('./pages/SalesTeamDBMTD'),
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

class PageErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 max-w-md w-full">
            <p className="text-sm font-semibold text-red-700 mb-1">Something went wrong on this page</p>
            <p className="text-xs text-red-500 font-mono break-all">{this.state.error?.message}</p>
            <button
              className="mt-3 text-xs text-red-600 underline"
              onClick={() => this.setState({ error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--t-bg)' }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">
          <PageErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </PageErrorBoundary>
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
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH', 'Manager', 'Agent', 'PreSales']}>
                  <Deals />
                </RequireRole>
              }
            />

            <Route
              path="/assign-targets"
              element={
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH', 'Manager']}>
                  <AssignTargets />
                </RequireRole>
              }
            />
            <Route
              path="/team"
              element={
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH', 'Manager']}>
                  <Team />
                </RequireRole>
              }
            />
            <Route
              path="/metrics"
              element={
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH', 'Manager', 'Agent', 'PreSales']}>
                  <Metrics />
                </RequireRole>
              }
            />
            <Route
              path="/org"
              element={
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH', 'Manager']}>
                  <OrgPage />
                </RequireRole>
              }
            />
            <Route
              path="/commission-config"
              element={
                <RequireRole roles={['Admin', 'Sales Ops', 'SalesHead', 'VH']}>
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
            <Route path="/faq" element={<Navigate to="/ai-help" replace />} />
            <Route path="/ai-help" element={<AIHelp />} />
            <Route
              path="/kickers"
              element={
                <RequireRole roles={['Admin','Sales Ops','SalesHead','VH','Manager','Agent','PreSales']}>
                  <Kickers />
                </RequireRole>
              }
            />
            <Route
              path="/announce-kicker"
              element={
                <RequireRole roles={['Admin','Sales Ops','SalesHead','VH','Manager']}>
                  <AnnounceKicker />
                </RequireRole>
              }
            />
            <Route
              path="/permissions"
              element={
                <RequireRole roles={['Admin','Sales Ops','SalesHead','VH']}>
                  <Permissions />
                </RequireRole>
              }
            />
            <Route
              path="/usage"
              element={
                <RequireRole roles={['Admin','Sales Ops']}>
                  <Usage />
                </RequireRole>
              }
            />
            <Route path="/notifications" element={<Notifications />} />
            <Route
              path="/sales-db-mtd"
              element={
                <RequireRole roles={['Admin','Sales Ops','SalesHead','VH']}>
                  <SalesTeamDBMTD />
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
