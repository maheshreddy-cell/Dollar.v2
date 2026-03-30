import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Users,
  BarChart2, GitBranch, Settings, DollarSign, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { ROLE_COLORS } from '../utils/roles'

// Nav items grouped by section.
// PreSales only sees Dashboard + FAQ.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: '/dashboard',         label: 'Dashboard',         icon: LayoutDashboard, roles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
      { to: '/deals',             label: 'My Deals',          icon: Briefcase,       roles: ['Agent'] },
      { to: '/metrics',           label: 'Metrics',           icon: BarChart2,       roles: ['Admin','SalesHead','VH','Manager','Agent'] },
      { to: '/assign-targets',    label: 'Assign Targets',    icon: DollarSign,      roles: ['Admin','SalesHead','VH','Manager'] },
      { to: '/team',              label: 'My Team',           icon: Users,           roles: ['Admin','SalesHead','VH','Manager'] },
      { to: '/org',               label: 'Org Chart',         icon: GitBranch,       roles: ['Admin','SalesHead','VH'] },
      { to: '/commission-config', label: 'Commission Config', icon: Settings,        roles: ['Admin'] },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/faq', label: 'FAQ / AI Help', icon: MessageCircle, roles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
    ],
  },
]

const VIEWAS_ALLOWED = ['/dashboard', '/deals', '/metrics', '/faq']

export default function Sidebar() {
  const { user, effectiveUser, isRole } = useAuth()
  const isViewAs = effectiveUser && effectiveUser.email !== user?.email

  return (
    <aside className="w-60 min-h-screen flex flex-col border-r border-gray-200 bg-gradient-to-b from-white to-gray-50/80">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-xl font-bold text-brand-700 tracking-tight">Dollar.v2</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter(item => {
            if (!isRole(...item.roles)) return false
            if (isViewAs) return VIEWAS_ALLOWED.includes(item.to)
            return true
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
                          ? 'bg-brand-50 text-brand-700 shadow-sm'
                          : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
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

      {/* User profile footer */}
      {user && (
        <div className="px-4 py-4 border-t border-gray-100 bg-white/60">
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
