import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Users,
  BarChart2, GitBranch, Settings, DollarSign, MessageCircle,
  Sun, Moon,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { ROLE_COLORS } from '../utils/roles'

// Role-based nav — each role sees exactly the pages they have access to.
// When in ViewAs mode the viewed person's role is used, not the real user's.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/dashboard',         label: 'Dashboard',         icon: LayoutDashboard, roles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
      { to: '/deals',             label: 'Deals',             icon: Briefcase,       roles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
      { to: '/metrics',           label: 'Metrics',           icon: BarChart2,       roles: ['Admin','SalesHead','VH','Manager','Agent'] },
      { to: '/assign-targets',    label: 'Assign Targets',    icon: DollarSign,      roles: ['Admin','SalesHead','VH','Manager'] },
      { to: '/team',              label: 'My Team',           icon: Users,           roles: ['Admin','SalesHead','VH','Manager'] },
      { to: '/org',               label: 'Org Chart',         icon: GitBranch,       roles: ['Admin','SalesHead','VH','Manager'] },
      { to: '/commission-config', label: 'Commission Config', icon: Settings,        roles: ['Admin','SalesHead','VH'] },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/faq', label: 'FAQ', icon: MessageCircle, roles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
    ],
  },
]

export default function Sidebar() {
  const { user, effectiveUser, isRole } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const isViewAs = effectiveUser && effectiveUser.email !== user?.email

  return (
    <aside className="w-60 min-h-screen flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gradient-to-b from-white to-gray-50/80 dark:from-gray-900 dark:to-gray-900">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100 dark:border-gray-700">
        <span className="text-xl font-bold text-brand-700 tracking-tight">Dollar.v2</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter(item => {
            // In ViewAs mode: show pages the viewed person's role can access
            // Not in ViewAs: show pages the real logged-in user can access
            if (isViewAs) return item.roles.includes(effectiveUser.role)
            return isRole(...item.roles)
          })
          if (!visible.length) return null
          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 shadow-sm dark:bg-brand-900/30 dark:text-brand-400'
                          : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-100'
                      }`
                    }
                  >
                    <Icon size={17} className="flex-shrink-0" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Theme toggle — visible to all users */}
      <div className="px-3 pb-2">
        <button
          onClick={toggleTheme}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 hover:text-gray-900 dark:hover:bg-gray-700/60 dark:hover:text-gray-100 transition-colors"
        >
          {theme === 'dark'
            ? <Sun size={16} className="text-amber-400" />
            : <Moon size={16} className="text-gray-500" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>

      {/* User profile footer — shows who is actually logged in */}
      {user && (
        <div className="px-4 py-4 border-t border-gray-100 dark:border-gray-700 bg-white/60 dark:bg-gray-800/60">
          <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
          <p className="text-xs text-gray-500 truncate mb-1">{user.email}</p>
          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
            {user.role}
          </span>
        </div>
      )}
    </aside>
  )
}
