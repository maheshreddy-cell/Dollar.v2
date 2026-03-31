import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { LogOut, Eye, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getAllUsers, getSubtreeEmails } from '../services/api'

const PAGE_TITLES = {
  '/dashboard':        'Dashboard',
  '/my-targets':       'My Targets',
  '/deals':            'Deals',
  '/assign-targets':   'Assign Targets',
  '/team':             'My Team',
  '/metrics':          'Metrics',
  '/org':              'Org Chart',
  '/commission-config':'Commission Config',
  '/faq':              'FAQ & AI Help',
}

const MANAGER_ROLES = ['Admin', 'SalesHead', 'VH', 'Manager']

export default function Navbar() {
  const { user, logout, viewAs, setViewAs, clearViewAs } = useAuth()
  const { month, setMonth } = useMonth()
  const location = useLocation()

  const [allUsers, setAllUsers] = useState([])

  // Load agents for ViewAs — Admin sees everyone, managers see only their subtree agents/presales
  useEffect(() => {
    if (!user?.role || !MANAGER_ROLES.includes(user.role)) return

    if (user.role === 'Admin') {
      getAllUsers()
        .then(users => setAllUsers((users ?? []).filter(u => u.Email !== user.email)))
        .catch(() => {})
    } else {
      // SalesHead / VH / Manager: only agents & presales in their subtree
      Promise.all([getAllUsers(), getSubtreeEmails(user.email)])
        .then(([users, emails]) => {
          const subtree = new Set((emails ?? []).map(e => (e || '').trim().toLowerCase()))
          setAllUsers(
            (users ?? []).filter(u =>
              subtree.has((u.Email || '').trim().toLowerCase()) &&
              (u.Email || '').toLowerCase() !== (user.email || '').toLowerCase() &&
              ['Agent', 'PreSales'].includes(u.Role)
            )
          )
        })
        .catch(() => {})
    }
  }, [user])

  const title = PAGE_TITLES[location.pathname] ?? 'Dollar.v2'

  return (
    <>
      <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
        <h1 className="text-base font-semibold text-gray-800">{title}</h1>

        <div className="flex items-center gap-3">
          {/* View As — all manager hierarchy */}
          {MANAGER_ROLES.includes(user?.role) && allUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <Eye size={14} className="text-gray-400" />
              <select
                value={viewAs?.email ?? ''}
                onChange={e => {
                  if (!e.target.value) { clearViewAs(); return }
                  const u = allUsers.find(u => u.Email === e.target.value)
                  if (u) setViewAs({ email: u.Email, name: u.Name, role: u.Role, managerEmail: u.ManagerEmail })
                }}
                className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 max-w-[180px]"
              >
                <option value="">View as agent…</option>
                {allUsers.map(u => (
                  <option key={u.Email} value={u.Email}>{u.Name} ({u.Role})</option>
                ))}
              </select>
            </div>
          )}

          {/* Month picker */}
          <div className="flex items-center gap-2">
            <label htmlFor="month-picker" className="text-xs text-gray-500 font-medium">Month</label>
            <input
              id="month-picker"
              type="month"
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700"
            />
          </div>

          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      {/* View As banner */}
      {viewAs && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center justify-between">
          <p className="text-xs font-medium text-amber-800">
            Viewing as <span className="font-bold">{viewAs.name}</span>
            <span className="ml-1 text-amber-600">({viewAs.role} · {viewAs.email})</span>
          </p>
          <button
            onClick={clearViewAs}
            className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors"
          >
            <X size={13} /> Exit View
          </button>
        </div>
      )}
    </>
  )
}
