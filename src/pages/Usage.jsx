import { useState, useEffect, useMemo } from 'react'
import { getUsageLog } from '../services/api'
import { Users, TrendingUp, Calendar, Clock, RefreshCw } from 'lucide-react'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
  PreSales:  'bg-teal-100 text-teal-700',
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d)) return dateStr
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })
}

function today() { return new Date().toLocaleDateString('en-CA') }

function last14Days() {
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toLocaleDateString('en-CA'))
  }
  return days
}

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export default function Usage() {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshed, setRefreshed] = useState(null)

  const load = async () => {
    setLoading(true)
    const data = await getUsageLog()
    setRows(Array.isArray(data) ? data : [])
    setRefreshed(new Date())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Derived stats ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const t = today()

    // Normalise rows — Sheets returns objects; field names may vary
    const normalised = rows.map(r => ({
      timestamp: r.Timestamp || r.timestamp || '',
      date:      r.Date      || r.date      || (r.Timestamp || '').slice(0, 10) || '',
      email:     (r.Email    || r.email     || '').toLowerCase(),
      name:      r.Name      || r.name      || '',
      role:      r.Role      || r.role      || '',
    })).filter(r => r.email)

    // Today's unique users
    const todayEmails   = [...new Set(normalised.filter(r => r.date === t).map(r => r.email))]
    // This week (last 7 days)
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 6)
    const weekStartStr = weekStart.toLocaleDateString('en-CA')
    const weekEmails    = [...new Set(normalised.filter(r => r.date >= weekStartStr).map(r => r.email))]
    // All time unique users
    const allEmails     = [...new Set(normalised.map(r => r.email))]

    // Per-day counts for bar chart (last 14 days)
    const days = last14Days()
    const perDay = days.map(d => {
      const unique = new Set(normalised.filter(r => r.date === d).map(r => r.email)).size
      const total  = normalised.filter(r => r.date === d).length
      return { date: d, unique, total }
    })

    // Per-user breakdown
    const byUser = {}
    for (const r of normalised) {
      if (!byUser[r.email]) {
        byUser[r.email] = { email: r.email, name: r.name, role: r.role, count: 0, lastSeen: '' }
      }
      byUser[r.email].count++
      if (r.timestamp > byUser[r.email].lastSeen) {
        byUser[r.email].lastSeen  = r.timestamp
        byUser[r.email].name      = r.name  // keep latest
        byUser[r.email].role      = r.role
      }
    }
    const users = Object.values(byUser).sort((a, b) => b.count - a.count)

    // Recent logins (last 20)
    const recent = [...normalised]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 20)

    return { todayEmails, weekEmails, allEmails, perDay, users, recent }
  }, [rows])

  const maxBar = Math.max(...stats.perDay.map(d => d.unique), 1)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Usage Analytics</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Who's logged in and when — updated on every login
            {refreshed && <> · refreshed {refreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-xl px-3 py-2 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Active Today',    value: stats.todayEmails.length,  sub: 'unique users',     icon: <Clock size={16} className="text-green-600" />,  bg: 'bg-green-50 border-green-100' },
          { label: 'Active This Week',value: stats.weekEmails.length,   sub: 'last 7 days',      icon: <Calendar size={16} className="text-blue-600" />, bg: 'bg-blue-50 border-blue-100' },
          { label: 'Total Users',     value: stats.allEmails.length,    sub: 'ever logged in',   icon: <Users size={16} className="text-purple-600" />,  bg: 'bg-purple-50 border-purple-100' },
          { label: 'Total Logins',    value: rows.length,               sub: 'all time',         icon: <TrendingUp size={16} className="text-brand-600" />, bg: 'bg-brand-50 border-brand-100' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
            <div className="flex items-center gap-2 mb-2">{c.icon}<p className="text-xs font-semibold text-gray-600">{c.label}</p></div>
            <p className="text-3xl font-black text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* DAU bar chart — last 14 days */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-sm font-bold text-gray-800 mb-4">Daily Active Users — Last 14 Days</p>
        <div className="flex items-end gap-1.5 h-36">
          {stats.perDay.map(({ date, unique }) => {
            const pct = maxBar > 0 ? (unique / maxBar) * 100 : 0
            const isToday = date === today()
            return (
              <div key={date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="relative w-full flex flex-col justify-end" style={{ height: '100px' }}>
                  {unique > 0 && (
                    <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap z-10">
                      {unique} user{unique !== 1 ? 's' : ''}
                    </div>
                  )}
                  <div
                    className={`w-full rounded-t-md transition-all ${isToday ? 'bg-brand-500' : unique > 0 ? 'bg-brand-200' : 'bg-gray-100'}`}
                    style={{ height: `${Math.max(pct, unique > 0 ? 8 : 4)}%` }}
                  />
                </div>
                <p className={`text-[9px] font-medium ${isToday ? 'text-brand-700 font-bold' : 'text-gray-400'}`}>
                  {shortDate(date)}
                </p>
              </div>
            )
          })}
        </div>
        <p className="text-[10px] text-gray-400 mt-2 text-center">Hover over a bar to see the count · today is highlighted</p>
      </div>

      {/* Per-user breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-800">Per-User Breakdown</p>
          <p className="text-xs text-gray-400">{stats.users.length} users total</p>
        </div>
        {stats.users.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No login data yet. Logs are recorded on each login.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">User</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Total Logins</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.users.map((u, i) => (
                <tr key={u.email} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{u.name || u.email}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {u.role || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className={`text-sm font-bold ${i === 0 ? 'text-brand-700' : 'text-gray-700'}`}>{u.count}</span>
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-gray-500">{fmt(u.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent logins feed */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">Recent Logins</p>
          <p className="text-xs text-gray-400 mt-0.5">Last 20 sessions</p>
        </div>
        {stats.recent.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No logins recorded yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {stats.recent.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                    {(r.name || r.email)[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{r.name || r.email}</p>
                    <p className="text-xs text-gray-400">{r.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[r.role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {r.role}
                  </span>
                  <p className="text-xs text-gray-400 text-right">{fmt(r.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
