import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Briefcase, Users,
  BarChart2, GitBranch, Settings, DollarSign, MessageCircle, Star, Shield, Zap, Megaphone,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { ROLE_COLORS } from '../utils/roles'

// Base nav definition — roles arrays are the minimum always-visible set.
// PermissionsContext can expand them at runtime.
const NAV_BASE = [
  {
    label: null,
    items: [
      { to: '/dashboard',         label: 'Dashboard',         icon: LayoutDashboard, baseRoles: ['Admin','SalesHead','VH','Manager'],
        permAdd: { agent_dashboard: 'Agent', presales_dashboard: 'PreSales' } },
      { to: '/deals',             label: 'Deals',             icon: Briefcase,       baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_deals: 'Manager', agent_deals: 'Agent', presales_deals: 'PreSales' } },
      { to: '/metrics',           label: 'Metrics',           icon: BarChart2,       baseRoles: ['Admin','SalesHead','VH','Agent'],
        permAdd: { presales_metrics: 'PreSales', manager_metrics: 'Manager' } },
      { to: '/assign-targets',    label: 'Assign Targets',    icon: DollarSign,      baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_assign: 'Manager' } },
      { to: '/manager-targets',   label: 'My Targets',        icon: Star,            baseRoles: ['Manager'],
        permAdd: { agent_targets: 'Agent', presales_targets: 'PreSales', vh_my_targets: 'VH', saleshead_my_targets: 'SalesHead' } },
      { to: '/team',              label: 'My Team',           icon: Users,           baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_team: 'Manager', agent_team: 'Agent', presales_team: 'PreSales' } },
      { to: '/org',               label: 'Org Chart',         icon: GitBranch,       baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_org: 'Manager', agent_org: 'Agent', presales_org: 'PreSales' } },
      { to: '/commission-config', label: 'Commission Config', icon: Settings,        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_commission: 'Manager', agent_commission: 'Agent', presales_commission: 'PreSales' } },
      { to: '/kickers',           label: 'Kickers',           icon: Zap,             baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_kickers: 'Manager', agent_kickers: 'Agent', presales_kickers: 'PreSales' } },
      { to: '/announce-kicker',   label: 'Announce Kicker',   icon: Megaphone,       baseRoles: ['Admin'],
        permAdd: { saleshead_announce_kicker: 'SalesHead', vh_announce_kicker: 'VH', manager_announce_kicker: 'Manager' } },
      { to: '/permissions',       label: 'Permissions',       icon: Shield,          baseRoles: ['Admin'],
        permAdd: { saleshead_permissions: 'SalesHead', vh_permissions: 'VH' } },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/faq', label: 'FAQ', icon: MessageCircle, baseRoles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
    ],
  },
]

export default function Sidebar() {
  const { user, effectiveUser, isRole } = useAuth()
  const { can } = usePermissions()
  const isViewAs = effectiveUser && effectiveUser.email !== user?.email

  // Compute effective roles for a nav item (base + any unlocked by permissions)
  function effectiveRoles(item) {
    const roles = [...item.baseRoles]
    if (item.permAdd) {
      for (const [permKey, role] of Object.entries(item.permAdd)) {
        if (can(permKey) && !roles.includes(role)) roles.push(role)
      }
    }
    return roles
  }

  return (
    <aside className="w-60 min-h-screen flex flex-col border-r border-gray-200 bg-gradient-to-b from-white to-gray-50/80">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-xl font-bold text-brand-700 tracking-tight">Dollar.v2</span>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
        {NAV_BASE.map((group, gi) => {
          const visible = group.items.filter(item => {
            const roles = effectiveRoles(item)
            if (isViewAs) return roles.includes(effectiveUser.role)
            return isRole(...roles)
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
