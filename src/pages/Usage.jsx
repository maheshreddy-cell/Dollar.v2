import { useState, useEffect, useMemo } from 'react'
import { getUsageLog } from '../services/api'
import { RefreshCw } from 'lucide-react'

const AVATAR_COLORS = [
  '#7C6FCD','#5B8FF9','#4CAF8A','#E07B4F',
  '#D45FAB','#6B7FD4','#4ABBB5','#E05C5C',
  '#B8860B','#20A0A0','#7B5EA7','#C0634F',
]

const ROLE_META = {
  Admin:     { label: 'Admin',         color: '#fee2e2', text: '#b91c1c' },
  SalesHead: { label: 'Sales Head',    color: '#ede9fe', text: '#7c3aed' },
  VH:        { label: 'Vertical Head', color: '#dbeafe', text: '#1d4ed8' },
  Manager:   { label: 'Team Lead',     color: '#dcfce7', text: '#15803d' },
  Agent:     { label: 'Agent',         color: '#f3f4f6', text: '#374151' },
  PreSales:  { label: 'Ops / Growth',  color: '#ccfbf1', text: '#0f766e' },
}

function avatarColor(email) {
  let h = 0
  for (let i = 0; i < email.length; i++) h = email.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

function initials(name, email) {
  const src = name || email || '?'
  const parts = src.trim().split(/\s+/)
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : src.slice(0, 2).toUpperCase()
}

function relTime(ts) {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (m < 1)   return 'Just now'
  if (m < 60)  return `${m}m ago`
  if (h < 24)  return `${h}h ${m % 60}m ago`
  if (d === 1)  return 'Yesterday'
  return `${d}d ago`
}

function todayStr() { return new Date().toLocaleDateString('en-CA') }
function isOnline(ts) { return !!ts && Date.now() - new Date(ts).getTime() < 15 * 60 * 1000 }

function fmtTime(seconds) {
  if (!seconds || seconds < 60) return seconds > 0 ? `${Math.round(seconds)}s` : '—'
  const m = Math.floor(seconds / 60)
  const h = Math.floor(m / 60)
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`
}

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

  const { users, onlineNow, activeToday, totalLogins, totalTodaySeconds } = useMemo(() => {
    const t = todayStr()
    const norm = rows.map(r => ({
      timestamp:       r.Timestamp       || r.timestamp || '',
      date:            r.Date            || r.date      || (r.Timestamp || '').slice(0, 10) || '',
      email:           (r.Email          || r.email     || '').toLowerCase(),
      name:            r.Name            || r.name      || '',
      role:            r.Role            || r.role      || '',
      durationSeconds: Number(r.DurationSeconds ?? r.duration_seconds ?? 0),
    })).filter(r => r.email)

    const byUser = {}
    for (const r of norm) {
      if (!byUser[r.email]) byUser[r.email] = { email: r.email, name: r.name, role: r.role, total: 0, todayCount: 0, todaySeconds: 0, lastSeen: '' }
      byUser[r.email].total++
      if (r.date === t) {
        byUser[r.email].todayCount++
        byUser[r.email].todaySeconds += r.durationSeconds
      }
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

    const totalTodaySeconds = users.reduce((s, u) => s + (u.todaySeconds || 0), 0)

    return {
      users,
      onlineNow:        users.filter(u => isOnline(u.lastSeen)).length,
      activeToday:      users.filter(u => u.lastSeen?.slice(0, 10) === t).length,
      totalLogins:      rows.length,
      totalTodaySeconds,
    }
  }, [rows])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  const t = todayStr()
  const maxLogins = Math.max(...users.map(u => u.total), 1) // fallback for bar when no time data

  return (
    <div className="min-h-full -m-6 bg-[#eeecf9] p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
          <h2 className="text-sm font-bold text-gray-800 tracking-wide">Platform Usage</h2>
          <span className="text-[11px] font-semibold bg-white text-gray-500 px-2.5 py-0.5 rounded-full border border-gray-200">{t}</span>
        </div>
        <div className="flex items-center gap-3">
          {refreshed && (
            <span className="text-[11px] text-gray-400">
              Updated {refreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Online Now */}
        <div className="rounded-2xl bg-white border border-green-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <p className="text-[11px] font-bold text-green-700 uppercase tracking-widest">Online Now</p>
          </div>
          <p className="text-5xl font-black text-green-600 leading-none">{onlineNow}</p>
        </div>

        {/* Active Today */}
        <div className="rounded-2xl bg-white border border-blue-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-sm bg-blue-500" />
            <p className="text-[11px] font-bold text-blue-700 uppercase tracking-widest">Active Today</p>
          </div>
          <p className="text-5xl font-black text-blue-600 leading-none">{activeToday}</p>
        </div>

        {/* Total Time */}
        <div className="rounded-2xl bg-white border border-orange-100 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-orange-500 text-sm font-black">⏱</span>
            <p className="text-[11px] font-bold text-orange-700 uppercase tracking-widest">Total Time</p>
          </div>
          <p className="text-4xl font-black text-orange-500 leading-none">{totalTodaySeconds >= 60 ? fmtTime(totalTodaySeconds) : `${totalLogins} logins`}</p>
        </div>
      </div>

      {/* User card grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {users.map(u => {
          const online      = isOnline(u.lastSeen)
          const todayActive = !online && u.lastSeen?.slice(0, 10) === t
          const role        = ROLE_META[u.role] || { label: u.role || '—', color: '#f3f4f6', text: '#374151' }
          const color       = avatarColor(u.email)
          const hasTime     = u.todaySeconds > 0
          const timeLabel   = hasTime ? fmtTime(u.todaySeconds) : (u.todayCount > 0 ? `${u.todayCount} logins` : '—')
          const subLabel    = hasTime ? 'time today' : (u.todayCount > 0 ? 'today' : 'no activity today')
          const maxSecs     = Math.max(...users.map(x => x.todaySeconds), 1)
          const barPct      = hasTime ? Math.max(4, Math.round((u.todaySeconds / maxSecs) * 100)) : Math.max(4, Math.round((u.total / maxLogins) * 100))
          const barColor    = online ? '#22c55e' : todayActive ? '#3b82f6' : '#d1d5db'

          return (
            <div
              key={u.email}
              className="bg-white rounded-2xl overflow-hidden flex flex-col"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
            >
              <div className="p-4 flex flex-col gap-2 flex-1">
                {/* Top row: avatar + status */}
                <div className="flex items-start justify-between">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {initials(u.name, u.email)}
                  </div>

                  {online ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Online
                    </span>
                  ) : todayActive ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-600">Today</span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">Inactive</span>
                  )}
                </div>

                {/* Name + email */}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate leading-tight">{u.name || u.email}</p>
                  <p className="text-[10px] text-gray-400 truncate">{u.email}</p>
                </div>

                {/* Role badge */}
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit"
                  style={{ backgroundColor: role.color, color: role.text }}
                >
                  {role.label}
                </span>

                {/* Time / activity */}
                <div className="mt-1">
                  <p className="text-2xl font-black leading-none" style={{ color: online ? '#16a34a' : todayActive ? '#2563eb' : '#9ca3af' }}>
                    {timeLabel}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{subLabel}</p>
                </div>

                {/* Last seen */}
                <p className="text-[10px] text-gray-400 mt-auto">
                  last seen: <span className="font-semibold text-gray-600">{relTime(u.lastSeen)}</span>
                </p>
              </div>

              {/* Bottom progress bar */}
              <div className="h-1 bg-gray-100 w-full">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${online || todayActive ? 100 : barPct}%`, backgroundColor: barColor }}
                />
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
