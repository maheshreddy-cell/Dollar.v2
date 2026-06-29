import { useState, useEffect, useMemo } from 'react'
import { getUsageLog } from '../services/api'
import { RefreshCw } from 'lucide-react'

const AVATAR_COLORS = [
  'bg-purple-400', 'bg-blue-500', 'bg-green-500', 'bg-orange-400',
  'bg-pink-500',   'bg-indigo-500', 'bg-teal-500', 'bg-red-400',
  'bg-yellow-500', 'bg-cyan-500',   'bg-violet-500', 'bg-rose-400',
]

const ROLE_META = {
  Admin:     { label: 'Admin',      color: 'bg-red-100 text-red-700' },
  SalesHead: { label: 'Sales Head', color: 'bg-purple-100 text-purple-700' },
  VH:        { label: 'VH',         color: 'bg-blue-100 text-blue-700' },
  Manager:   { label: 'Team Lead',  color: 'bg-green-100 text-green-700' },
  Agent:     { label: 'Agent',      color: 'bg-gray-100 text-gray-600' },
  PreSales:  { label: 'PreSales',   color: 'bg-teal-100 text-teal-700' },
}

function avatarColor(email) {
  let h = 0
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function relTime(ts) {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ${m % 60}m ago`
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

function todayStr() { return new Date().toLocaleDateString('en-CA') }
function isOnline(ts) { return !!ts && Date.now() - new Date(ts).getTime() < 15 * 60 * 1000 }

export default function Usage() {
  const [rows,      setRows]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [refreshed, setRefreshed] = useState(null)

  const load = async () => {
    setLoading(true)
    const data = await getUsageLog()
    setRows(Array.isArray(data) ? data : [])
    setRefreshed(new Date())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const { users, onlineNow, activeToday, totalLogins } = useMemo(() => {
    const t = todayStr()
    const norm = rows.map(r => ({
      timestamp: r.Timestamp || r.timestamp || '',
      date:      r.Date      || r.date      || (r.Timestamp || '').slice(0, 10) || '',
      email:     (r.Email    || r.email     || '').toLowerCase(),
      name:      r.Name      || r.name      || '',
      role:      r.Role      || r.role      || '',
    })).filter(r => r.email)

    const byUser = {}
    for (const r of norm) {
      if (!byUser[r.email]) byUser[r.email] = { email: r.email, name: r.name, role: r.role, total: 0, todayCount: 0, lastSeen: '' }
      byUser[r.email].total++
      if (r.date === t) byUser[r.email].todayCount++
      if (r.timestamp > byUser[r.email].lastSeen) {
        byUser[r.email].lastSeen = r.timestamp
        byUser[r.email].name     = r.name
        byUser[r.email].role     = r.role
      }
    }

    const users = Object.values(byUser).sort((a, b) => {
      const ao = isOnline(a.lastSeen), bo = isOnline(b.lastSeen)
      if (ao !== bo) return bo - ao
      const at = a.lastSeen?.slice(0, 10) === t, bt = b.lastSeen?.slice(0, 10) === t
      if (at !== bt) return bt - at
      return b.total - a.total
    })

    return {
      users,
      onlineNow:   users.filter(u => isOnline(u.lastSeen)).length,
      activeToday: users.filter(u => u.lastSeen?.slice(0, 10) === t).length,
      totalLogins: rows.length,
    }
  }, [rows])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  const t = todayStr()

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-gray-900">Platform Usage</h2>
          <span className="text-xs font-medium bg-gray-100 text-gray-500 px-2.5 py-0.5 rounded-full">{t}</span>
        </div>
        <div className="flex items-center gap-2">
          {refreshed && <span className="text-xs text-gray-400">Updated {refreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
          <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-green-50 border border-green-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-widest">Online Now</p>
          </div>
          <p className="text-4xl font-black text-green-700">{onlineNow}</p>
        </div>
        <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-widest">Active Today</p>
          </div>
          <p className="text-4xl font-black text-blue-700">{activeToday}</p>
        </div>
        <div className="rounded-2xl bg-orange-50 border border-orange-100 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            <p className="text-[11px] font-bold text-orange-700 uppercase tracking-widest">Total Logins</p>
          </div>
          <p className="text-4xl font-black text-orange-700">{totalLogins}</p>
        </div>
      </div>

      {/* User card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {users.map(u => {
          const online     = isOnline(u.lastSeen)
          const todayActive = !online && u.lastSeen?.slice(0, 10) === t
          const role       = ROLE_META[u.role] || { label: u.role || '—', color: 'bg-gray-100 text-gray-600' }
          const initials   = (u.name || u.email).slice(0, 2).toUpperCase()
          const count      = u.todayCount > 0 ? u.todayCount : u.total
          const countLabel = u.todayCount > 0 ? 'logins today' : 'total logins'

          return (
            <div key={u.email} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-2 relative overflow-hidden">

              {/* Status badge */}
              <div className="absolute top-3 right-3">
                {online ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Online
                  </span>
                ) : todayActive ? (
                  <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Today</span>
                ) : (
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactive</span>
                )}
              </div>

              {/* Avatar */}
              <div className={`w-10 h-10 rounded-full ${avatarColor(u.email)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                {initials}
              </div>

              {/* Name + email */}
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate pr-14">{u.name || u.email}</p>
                <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
              </div>

              {/* Role */}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit ${role.color}`}>
                {role.label}
              </span>

              {/* Login count */}
              <div className="mt-0.5">
                <p className="text-2xl font-black text-gray-900 leading-none">{count}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{countLabel}</p>
              </div>

              {/* Last seen */}
              <p className="text-[10px] text-gray-400">
                last seen: <span className="font-semibold text-gray-600">{relTime(u.lastSeen)}</span>
              </p>

              {/* Bottom progress bar */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-100">
                <div
                  className={`h-full transition-all ${online ? 'bg-green-400' : todayActive ? 'bg-blue-400' : 'bg-gray-200'}`}
                  style={{ width: online || todayActive ? '100%' : `${Math.min(100, (u.total / Math.max(...users.map(x => x.total), 1)) * 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
