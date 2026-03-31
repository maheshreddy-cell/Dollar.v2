import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { MonthProvider } from './contexts/MonthContext'
import Sidebar from './components/Sidebar'
import Navbar from './components/Navbar'

import Login from './pages/Login'
import InviteActivate from './pages/InviteActivate'
import Dashboard from './pages/Dashboard'
import Deals from './pages/Deals'
import AssignTargets from './pages/AssignTargets'
import Team from './pages/Team'
import Metrics from './pages/Metrics'
import OrgPage from './pages/OrgPage'
import CommissionConfig from './pages/CommissionConfig'
import FAQ from './pages/FAQ'

function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F9F8F6] dark:bg-gray-900">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
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
  return children
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
    <AuthProvider>
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
            <Route path="/faq" element={<FAQ />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </MonthProvider>
    </AuthProvider>
  )
}
