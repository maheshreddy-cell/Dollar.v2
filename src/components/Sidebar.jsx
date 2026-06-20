import { NavLink } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, Briefcase, Users,
  BarChart2, GitBranch, Settings, DollarSign, Star, Shield, Zap, Megaphone, Activity, Sparkles, Bell, TrendingUp,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { useTheme } from '../contexts/ThemeContext'
import { ROLE_COLORS } from '../utils/roles'
import { getUnreadCount } from '../services/notifications'

// color = [bgHex, iconHex] when inactive — inline styles bypass Tailwind purge
const NAV_BASE = [
  {
    label: null,
    items: [
      { to: '/dashboard',         label: 'Dashboard',         icon: LayoutDashboard, color: ['#DBEAFE', '#2563EB'],
        baseRoles: ['Admin','SalesHead','VH','Manager'],
        permAdd: { agent_dashboard: 'Agent', presales_dashboard: 'PreSales' } },
      { to: '/deals',             label: 'Deals',             icon: Briefcase,       color: ['#FFEDD5', '#EA580C'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_deals: 'Manager', agent_deals: 'Agent', presales_deals: 'PreSales' } },
      { to: '/sales-db-mtd',      label: 'Sales Team DB MTD', icon: TrendingUp,      color: ['#DCFCE7', '#16A34A'],
        baseRoles: ['Admin','SalesHead','VH'] },
      { to: '/metrics',           label: 'Metrics',           icon: BarChart2,       color: ['#EDE9FE', '#7C3AED'],
        baseRoles: ['Admin','SalesHead','VH','Agent'],
        permAdd: { presales_metrics: 'PreSales', manager_metrics: 'Manager' } },
      { to: '/assign-targets',    label: 'Assign Targets',    icon: DollarSign,      color: ['#D1FAE5', '#059669'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_assign: 'Manager' } },
      { to: '/manager-targets',   label: 'My Targets',        icon: Star,            color: ['#FEF3C7', '#D97706'],
        baseRoles: ['Manager'],
        permAdd: { agent_targets: 'Agent', presales_targets: 'PreSales', vh_my_targets: 'VH', saleshead_my_targets: 'SalesHead' } },
      { to: '/team',              label: 'My Team',           icon: Users,           color: ['#CFFAFE', '#0891B2'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_team: 'Manager', agent_team: 'Agent', presales_team: 'PreSales' } },
      { to: '/org',               label: 'Org Chart',         icon: GitBranch,       color: ['#FCE7F3', '#DB2777'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_org: 'Manager', agent_org: 'Agent', presales_org: 'PreSales' } },
      { to: '/commission-config', label: 'Commission Config', icon: Settings,        color: ['#F1F5F9', '#475569'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_commission: 'Manager', agent_commission: 'Agent', presales_commission: 'PreSales' } },
      { to: '/kickers',           label: 'My Kickers',        icon: Zap,             color: ['#FEF9C3', '#CA8A04'],
        baseRoles: ['Admin','SalesHead','VH'],
        permAdd: { manager_kickers: 'Manager', agent_kickers: 'Agent', presales_kickers: 'PreSales' } },
      { to: '/announce-kicker',   label: 'Announce Kicker',   icon: Megaphone,       color: ['#FEE2E2', '#DC2626'],
        baseRoles: ['Admin'],
        permAdd: { saleshead_announce_kicker: 'SalesHead', vh_announce_kicker: 'VH', manager_announce_kicker: 'Manager' } },
      { to: '/permissions',       label: 'Permissions',       icon: Shield,          color: ['#FFE4E6', '#E11D48'],
        baseRoles: ['Admin'],
        permAdd: { saleshead_permissions: 'SalesHead', vh_permissions: 'VH' } },
      { to: '/usage',             label: 'Usage Analytics',   icon: Activity,        color: ['#CCFBF1', '#0D9488'],
        baseRoles: ['Admin'] },
      { to: '/notifications',     label: 'Notifications',     icon: Bell,            color: ['#E0E7FF', '#4338CA'],
        baseRoles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'], badge: true },
    ],
  },
  {
    label: 'Support',
    items: [
      { to: '/ai-help', label: 'AI Help & Docs', icon: Sparkles, color: ['#F3E8FF', '#9333EA'],
        baseRoles: ['Admin','SalesHead','VH','Manager','Agent','PreSales'] },
    ],
  },
]

export default function Sidebar() {
  const { user, effectiveUser, isRole } = useAuth()
  const { can } = usePermissions()
  const { theme } = useTheme()
  const isDark = theme === 'dark' || theme === 'ocean'
  const isViewAs = effectiveUser && effectiveUser.email !== user?.email

  const [unread, setUnread] = useState(0)
  useEffect(() => {
    const refresh = () => setUnread(getUnreadCount(user?.email))
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [user?.email])

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
    <aside className="w-60 min-h-screen flex flex-col bg-white border-r border-ios-separator">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] bg-brand-500 flex items-center justify-center shadow-ios-sm">
            <DollarSign size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[17px] font-semibold text-gray-900 tracking-ios-tight">Dollar.v2</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 pb-4 space-y-5 overflow-y-auto">
        {NAV_BASE.map((group, gi) => {
          const visible = group.items.filter(item => {
            const roles = effectiveRoles(item)
            if (isViewAs) return roles.includes(effectiveUser?.role)
            return isRole(...roles)
          })
          if (!visible.length) return null
          return (
            <div key={gi}>
              {group.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-ios-wide text-ios-gray1">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {visible.map(({ to, label, icon: Icon, badge: showBadge, color = [] }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-brand-50 text-brand-600'
                          : isDark
                            ? 'text-[--t-text-2] hover:bg-[--t-surface-2]'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all duration-150 ${isActive ? 'bg-brand-500 shadow-sm' : ''}`}
                          style={isActive ? {} : isDark
                            ? { backgroundColor: 'var(--t-surface-3)' }
                            : { backgroundColor: color[0] }}
                        >
                          <Icon
                            size={14}
                            strokeWidth={2}
                            className={isActive ? 'text-white' : ''}
                            style={isActive ? {} : isDark
                              ? { color: 'var(--t-brand)' }
                              : { color: color[1] }}
                          />
                        </span>
                        <span className={`flex-1 ${isActive ? 'text-brand-600 font-semibold' : isDark ? 'text-[--t-text-2]' : 'text-gray-700'}`}>
                          {label}
                        </span>
                        {showBadge && unread > 0 && (
                          <span className="min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>

      {/* User profile footer */}
      {user && (
        <div className="px-4 py-4 border-t border-ios-separator">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-brand-500 flex items-center justify-center shrink-0 shadow-ios-sm">
              <span className="text-white text-xs font-semibold">
                {user.name?.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-gray-900 truncate tracking-ios-tight">{user.name}</p>
              <p className="text-[11px] text-ios-gray1 truncate">{user.email}</p>
            </div>
          </div>
          <div className="mt-2.5">
            <span className={`inline-block text-[11px] font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {user.role}
            </span>
          </div>
        </div>
      )}
    </aside>
  )
}
