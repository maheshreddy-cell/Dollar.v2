import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Briefcase,
  Users,
  BarChart2,
  GitBranch,
  Settings,
  DollarSign,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['Admin', 'SalesHead', 'VH', 'Manager', 'Agent'],
  },
  {
    to: '/my-targets',
    label: 'My Targets',
    icon: Target,
    roles: ['Agent'],
  },
  {
    to: '/deals',
    label: 'Deals',
    icon: Briefcase,
    roles: ['Admin', 'SalesHead', 'VH', 'Manager', 'Agent'],
  },
  {
    to: '/assign-targets',
    label: 'Assign Targets',
    icon: DollarSign,
    roles: ['Admin', 'SalesHead', 'VH', 'Manager'],
  },
  {
    to: '/team',
    label: 'My Team',
    icon: Users,
    roles: ['Admin', 'SalesHead', 'VH', 'Manager'],
  },
  {
    to: '/metrics',
    label: 'Metrics',
    icon: BarChart2,
    roles: ['Admin', 'SalesHead', 'VH', 'Manager'],
  },
  {
    to: '/org',
    label: 'Org',
    icon: GitBranch,
    roles: ['Admin', 'SalesHead', 'VH'],
  },
  {
    to: '/commission-config',
    label: 'Commission Config',
    icon: Settings,
    roles: ['Admin'],
  },
]

const ROLE_COLORS = {
  Admin: 'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH: 'bg-blue-100 text-blue-700',
  Manager: 'bg-green-100 text-green-700',
  Agent: 'bg-gray-100 text-gray-700',
}

export default function Sidebar() {
  const { user, isRole } = useAuth()

  const visible = NAV.filter((item) => isRole(...item.roles))

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-gray-200 flex flex-col">
      <div className="px-5 py-5 border-b border-gray-100">
        <span className="text-xl font-bold text-brand-700 tracking-tight">Dollar.v2</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} className="flex-shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {user && (
        <div className="px-4 py-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
          <p className="text-xs text-gray-500 truncate mb-1">{user.email}</p>
          <span
            className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
              ROLE_COLORS[user.role] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {user.role}
          </span>
        </div>
      )}
    </aside>
  )
}
