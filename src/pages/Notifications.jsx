import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ExternalLink } from 'lucide-react'
import { getNotifications, markAllRead } from '../services/notifications'
import { useAuth } from '../contexts/AuthContext'

function getRelativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

const TYPE_META = {
  target:  { color: 'border-l-brand-500 bg-brand-50/40',  icon: '🎯', label: 'Targets' },
  kicker:  { color: 'border-l-purple-500 bg-purple-50/40', icon: '🚀', label: 'Kickers' },
  at_risk: { color: 'border-l-red-500 bg-red-50/40',      icon: '🚨', label: 'At-Risk' },
  team:    { color: 'border-l-green-500 bg-green-50/40',   icon: '👋', label: 'Team' },
  general: { color: 'border-l-gray-400 bg-gray-50/40',     icon: '📢', label: 'General' },
}

const LINK_LABELS = {
  '/assign-targets': 'View Assign Targets',
  '/manager-targets': 'View My Targets',
  '/kickers':         'View Kickers',
  '/deals':           'View Deals',
  '/team':            'View My Team',
  '/dashboard':       'View Dashboard',
  '/metrics':         'View Metrics',
  '/commission-config': 'View Incentive Config',
}

export default function Notifications() {
  const [notifs, setNotifs] = useState([])
  const navigate = useNavigate()
  const { effectiveUser } = useAuth()

  useEffect(() => {
    setNotifs(getNotifications(effectiveUser?.email))
    markAllRead()
  }, [effectiveUser?.email])

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center">
          <Bell size={16} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Notifications</h2>
          <p className="text-[11px] text-gray-400">Target assignments, kicker announcements, at-risk alerts & team updates</p>
        </div>
      </div>

      {/* Notification feed */}
      {notifs.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center space-y-3 py-20">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
            <Bell size={28} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">No notifications yet</p>
          <p className="text-xs text-gray-400 max-w-xs">
            When targets are assigned, kickers are announced, at-risk payments are flagged, or team members are invited — updates will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifs.map((n) => {
            const meta = TYPE_META[n.type] || TYPE_META.general
            const ago = getRelativeTime(n.ts)
            const linkLabel = n.link ? (LINK_LABELS[n.link] || 'View Details') : null

            return (
              <div key={n.id}
                className={`border border-gray-100 border-l-4 rounded-xl px-4 py-3 space-y-1.5 ${meta.color}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{n.icon || meta.icon}</span>
                    <span className="text-sm font-semibold text-gray-800">{n.title}</span>
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">{ago}</span>
                </div>
                {n.body && <p className="text-xs text-gray-600 leading-relaxed pl-7">{n.body}</p>}
                {linkLabel && (
                  <button
                    onClick={() => navigate(n.link)}
                    className="flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:text-brand-700 pl-7 pt-0.5 transition-colors"
                  >
                    <ExternalLink size={10} />
                    {linkLabel}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
