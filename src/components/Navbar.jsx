import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LogOut, Eye, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getAllUsers } from '../services/api'

const PAGE_TITLES = {
  '/dashboard':        'Dashboard',
  '/my-targets':       'My Targets',
  '/deals':            'Deals',
  '/assign-targets':   'Assign Targets',
  '/team':             'My Team',
  '/metrics':          'Metrics',
  '/org':              'Org Chart',
  '/commission-config':'Commission Config',
  '/manager-targets':  'My Targets',
  '/ai-help':          'AI Help & Docs',
  '/permissions':      'Permissions',
  '/kickers':          'Kickers',
  '/announce-kicker':  'Announce Kicker',
  '/usage':            'Usage Analytics',
}

export default function Navbar() {
  const { user, logout, viewAs, setViewAs, clearViewAs } = useAuth()
  const { month, setMonth } = useMonth()
  const location = useLocation()

  const [allUsers, setAllUsers] = useState([])

  useEffect(() => {
    if (user?.role !== 'Admin') return
    getAllUsers()
      .then(users => setAllUsers((users ?? []).filter(u => u.Email !== user?.email)))
      .catch(() => {})
  }, [user])

  const title = PAGE_TITLES[location.pathname] ?? 'Dollar.v2'

  return (
    <>
      {/* iOS-style frosted glass top bar */}
      <header className="h-14 ios-glass border-b border-ios-separator flex items-center justify-between px-5 shrink-0 sticky top-0 z-10">
        <h1 className="text-[17px] font-semibold text-gray-900 tracking-ios-tight">{title}</h1>

        <div className="flex items-center gap-2">
          {/* View As — Admin only */}
          {user?.role === 'Admin' && allUsers.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Eye size={13} className="text-ios-gray1" />
              <select
                value={viewAs?.email ?? ''}
                onChange={e => {
                  if (!e.target.value) { clearViewAs(); return }
                  const u = allUsers.find(u => u.Email === e.target.value)
                  if (u) setViewAs({ email: u.Email, name: u.Name, role: u.Role, managerEmail: u.ManagerEmail })
                }}
                className="text-xs bg-ios-gray6 border-0 rounded-ios px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 max-w-[175px] cursor-pointer"
              >
                <option value="">View as…</option>
                {allUsers.map(u => (
                  <option key={u.Email} value={u.Email}>{u.Name} ({u.Role})</option>
                ))}
              </select>
            </div>
          )}

          {/* Month picker */}
          <div className="flex items-center gap-1.5 bg-ios-gray6 rounded-ios px-2.5 py-1.5">
            <label htmlFor="month-picker" className="text-[11px] text-ios-gray1 font-medium select-none">Month</label>
            <input
              id="month-picker"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="text-[12px] bg-transparent border-0 focus:outline-none text-gray-800 font-medium cursor-pointer"
            />
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-[13px] text-ios-gray1 hover:text-red-500 transition-colors px-2.5 py-1.5 rounded-ios hover:bg-red-50"
          >
            <LogOut size={14} strokeWidth={1.8} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* View As banner — iOS-style amber */}
      {viewAs && (
        <div className="bg-amber-50 border-b border-amber-100 px-5 py-2 flex items-center justify-between">
          <p className="text-[12px] font-medium text-amber-800">
            Viewing as <span className="font-semibold">{viewAs.name}</span>
            <span className="ml-1 text-amber-600 font-normal">({viewAs.role} · {viewAs.email})</span>
          </p>
          <button
            onClick={clearViewAs}
            className="flex items-center gap-1 text-[12px] font-medium text-amber-700 hover:text-amber-900 transition-colors bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-full"
          >
            <X size={11} /> Exit View
          </button>
        </div>
      )}
    </>
  )
}
