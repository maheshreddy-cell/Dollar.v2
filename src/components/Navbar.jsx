import { useLocation } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/my-targets': 'My Targets',
  '/deals': 'Deals',
  '/assign-targets': 'Assign Targets',
  '/team': 'My Team',
  '/metrics': 'Metrics',
  '/org': 'Org Chart',
  '/commission-config': 'Commission Config',
}

export default function Navbar() {
  const { logout } = useAuth()
  const { month, setMonth } = useMonth()
  const location = useLocation()

  const title = PAGE_TITLES[location.pathname] ?? 'Dollar.v2'

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-base font-semibold text-gray-800">{title}</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label htmlFor="month-picker" className="text-xs text-gray-500 font-medium">
            Month
          </label>
          <input
            id="month-picker"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
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
  )
}
