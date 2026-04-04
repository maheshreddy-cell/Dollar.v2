import { useState, useEffect, useCallback } from 'react'
import { Zap, ChevronDown, ChevronUp, Clock, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getKickers, getDeals } from '../services/api'
import { formatINR } from '../utils/commission'

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKER_TYPES = [
  { value: 'team_sales',          label: '👥 Team Sales',               unit: 'sales',   metric: 'team' },
  { value: 'team_revenue',        label: '👥 Team Revenue',             unit: 'revenue', metric: 'team' },
  { value: 'individual_sales',    label: '👤 Individual Sales',         unit: 'sales',   metric: 'ind'  },
  { value: 'individual_revenue',  label: '👤 Individual Revenue',       unit: 'revenue', metric: 'ind'  },
  { value: 'individual_or',       label: '⚡ Combo — Sales OR Revenue', unit: 'or',      metric: 'ind'  },
  { value: 'individual_and',      label: '🎯 Combo — Sales AND Revenue',unit: 'and',     metric: 'ind'  },
]

// Roles that see all kickers (oversight view)
const OVERSIGHT_ROLES = ['Admin', 'SalesHead', 'VH']

// ── Date/time helpers ─────────────────────────────────────────────────────────
function kickerIsActive(k) {
  const now  = Date.now()
  const from = new Date(k.dateFrom).getTime()
  const to   = new Date(k.dateTo).getTime() + 86399999
  return now >= from && now <= to
}
function kickerIsPast(k) { return new Date(k.dateTo).getTime() + 86399999 < Date.now() }

function countdown(k) {
  const ms = new Date(k.dateTo).getTime() + 86399999 - Date.now()
  if (ms <= 0) return 'Ended'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h < 24) return `${h}h ${m}m left`
  return `${Math.ceil(ms / 86400000)} days left`
}

// ── Progress calculation ──────────────────────────────────────────────────────
function computeProgress(kicker, allDeals) {
  const from = new Date(kicker.dateFrom)
  const to   = new Date(kicker.dateTo); to.setHours(23, 59, 59)

  const inRange = allDeals.filter(d => {
    const dt = new Date(d.Timestamp || d.PaymentDate || 0)
    return dt >= from && dt <= to
  })

  const rawSales = inRange.length
  // Use TotalValue (projected revenue = full sale value) for kicker progress
  const revenue  = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
  const sales    = kicker.minSaleValue > 0
    ? inRange.filter(d => (d.TotalValue || 0) >= kicker.minSaleValue).length
    : rawSales

  const sorted = [...(kicker.slabs || [])].sort((a, b) => {
    const at = Number(a.threshold || a.salesThreshold || 0)
    const bt = Number(b.threshold || b.salesThreshold || 0)
    return at - bt
  })

  const type = kicker.type || 'team_sales'
  let activeSlab = null
  let nextSlab   = null

  for (const slab of sorted) {
    let hit = false
    if      (type === 'team_sales'       || type === 'individual_sales')    hit = sales   >= Number(slab.threshold)
    else if (type === 'team_revenue'     || type === 'individual_revenue')  hit = revenue >= Number(slab.threshold)
    else if (type === 'individual_or')   hit = sales >= Number(slab.salesThreshold) || revenue >= Number(slab.revenueThreshold)
    else if (type === 'individual_and')  hit = sales >= Number(slab.salesThreshold) && revenue >= Number(slab.revenueThreshold)
    if (hit) activeSlab = slab
    else if (!nextSlab) nextSlab = slab
  }

  return { sales, revenue, activeSlab, nextSlab, sorted }
}

// ── Slab label formatter ──────────────────────────────────────────────────────
function slabLabel(slab, type) {
  if (type === 'team_sales' || type === 'individual_sales')
    return `${slab.threshold} sales → ${formatINR(Number(slab.payout))}`
  if (type === 'team_revenue' || type === 'individual_revenue')
    return `${formatINR(Number(slab.threshold))} revenue → ${formatINR(Number(slab.payout))}`
  if (type === 'individual_or')
    return `${slab.salesThreshold} sales OR ${formatINR(Number(slab.revenueThreshold))} → ${formatINR(Number(slab.payout))}`
  if (type === 'individual_and')
    return `${slab.salesThreshold} sales AND ${formatINR(Number(slab.revenueThreshold))} → ${formatINR(Number(slab.payout))}`
  return ''
}

function slabBarPct(slab, type, progress) {
  if (type === 'team_sales' || type === 'individual_sales')
    return Math.min((progress.sales / Math.max(Number(slab.threshold), 1)) * 100, 100)
  if (type === 'team_revenue' || type === 'individual_revenue')
    return Math.min((progress.revenue / Math.max(Number(slab.threshold), 1)) * 100, 100)
  if (type === 'individual_or') {
    const sp = progress.sales   / Math.max(Number(slab.salesThreshold),   1)
    const rp = progress.revenue / Math.max(Number(slab.revenueThreshold), 1)
    return Math.min(Math.max(sp, rp) * 100, 100)
  }
  if (type === 'individual_and') {
    const sp = progress.sales   / Math.max(Number(slab.salesThreshold),   1)
    const rp = progress.revenue / Math.max(Number(slab.revenueThreshold), 1)
    return Math.min(Math.min(sp, rp) * 100, 100)
  }
  return 0
}

function nudgeText(slab, type, progress) {
  if (type === 'team_sales' || type === 'individual_sales') {
    const gap = Number(slab.threshold) - progress.sales
    return gap > 0 ? `${gap} more sale${gap > 1 ? 's' : ''} to unlock ${formatINR(Number(slab.payout))}` : null
  }
  if (type === 'team_revenue' || type === 'individual_revenue') {
    const gap = Number(slab.threshold) - progress.revenue
    return gap > 0 ? `${formatINR(gap)} more revenue to unlock ${formatINR(Number(slab.payout))}` : null
  }
  if (type === 'individual_or') {
    const sg = Number(slab.salesThreshold) - progress.sales
    const rg = Number(slab.revenueThreshold) - progress.revenue
    if (sg <= 0 || rg <= 0) return null
    return `${sg} more sales OR ${formatINR(rg)} more revenue to unlock`
  }
  if (type === 'individual_and') {
    const sg = Number(slab.salesThreshold) - progress.sales
    const rg = Number(slab.revenueThreshold) - progress.revenue
    const parts = []
    if (sg > 0) parts.push(`${sg} more sales`)
    if (rg > 0) parts.push(`${formatINR(rg)} more revenue`)
    return parts.length ? parts.join(' AND ') + ' to unlock' : null
  }
  return null
}

// ── KickerCard (view-only) ────────────────────────────────────────────────────
function KickerCard({ kicker, deals }) {
  const [expanded, setExpanded] = useState(false)

  const active   = kickerIsActive(kicker)
  const past     = kickerIsPast(kicker)
  const progress = computeProgress(kicker, deals)
  const type     = kicker.type || 'team_sales'
  const typeInfo = KICKER_TYPES.find(t => t.value === type)
  const isSales  = type.includes('sales') || type.includes('or') || type.includes('and')
  const isRev    = type.includes('revenue') || type.includes('or') || type.includes('and')
  const isTeam   = type.startsWith('team_')

  return (
    <div className={`bg-white dark:bg-surface-card rounded-2xl border shadow-sm overflow-hidden transition-all ${
      kicker.pinned ? 'border-yellow-300 dark:border-yellow-700 ring-2 ring-yellow-100 dark:ring-yellow-900/30' : 'border-gray-200 dark:border-surface-border'
    } ${past ? 'opacity-60' : ''}`}>
      {/* Top accent */}
      <div className={`h-1.5 ${past ? 'bg-gray-300' : 'bg-gradient-to-r from-brand-500 via-purple-500 to-pink-400'}`} />

      <div className="px-5 py-4 space-y-3">
        {/* Header row */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {kicker.pinned && <span className="text-[10px] font-bold uppercase bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded-full">📌 Pinned</span>}
            {active && !past && <span className="text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>}
            {past && <span className="text-[10px] font-bold uppercase bg-gray-100 dark:bg-surface-muted text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">Ended</span>}
            <span className="text-[10px] font-semibold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-full">{typeInfo?.label}</span>
          </div>
          <h3 className="text-base font-bold text-gray-900 dark:text-white leading-snug">{kicker.title}</h3>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400 dark:text-gray-500">
            <span>📅 {kicker.dateFrom} → {kicker.dateTo}</span>
            {!past && <span className={`font-semibold ${countdown(kicker).includes('h') ? 'text-orange-500' : 'text-gray-500'}`}>⏱ {countdown(kicker)}</span>}
            <span>By {kicker.announcedBy} ({kicker.announcedByRole})</span>
          </div>

          {/* Target chips */}
          <div className="flex flex-wrap gap-1 mt-2">
            {(kicker.targetRoles || []).map(r => (
              <span key={r} className="text-[10px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full">{r}</span>
            ))}
            {(kicker.targetTeams || []).includes('ALL')
              ? <span className="text-[10px] font-semibold bg-gray-100 dark:bg-surface-muted text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">All Teams</span>
              : <span className="text-[10px] font-semibold bg-gray-100 dark:bg-surface-muted text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full">{(kicker.targetTeams || []).length} team(s)</span>
            }
            {kicker.minSaleValue > 0 && (
              <span className="text-[10px] font-semibold bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">Min sale {formatINR(kicker.minSaleValue)}</span>
            )}
          </div>
        </div>

        {/* Message toggle */}
        {kicker.message && (
          <div>
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Hide announcement' : 'View full announcement'}
            </button>
            {expanded && (
              <div className="mt-2 bg-gray-50 dark:bg-surface-hover border border-gray-100 dark:border-surface-border rounded-xl px-4 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                {kicker.message}
              </div>
            )}
          </div>
        )}

        {/* Live progress stats */}
        {active && (
          <div className="flex gap-2">
            {isSales && (
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${isTeam ? 'bg-blue-50 dark:bg-blue-900/20' : 'bg-indigo-50 dark:bg-indigo-900/20'}`}>
                <p className="text-xl font-black text-blue-700">{progress.sales}</p>
                <p className="text-[10px] text-blue-500 font-semibold">{isTeam ? 'Team' : 'Your'} Sales</p>
              </div>
            )}
            {isRev && (
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${isTeam ? 'bg-green-50 dark:bg-green-900/20' : 'bg-teal-50 dark:bg-teal-900/20'}`}>
                <p className="text-sm font-black text-green-700">{formatINR(progress.revenue)}</p>
                <p className="text-[10px] text-green-500 font-semibold">{isTeam ? 'Team' : 'Your'} Revenue</p>
              </div>
            )}
            {progress.activeSlab && (
              <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-black text-amber-700">{formatINR(Number(progress.activeSlab.payout))}</p>
                <p className="text-[10px] text-amber-600 font-semibold">🎉 Earned!</p>
              </div>
            )}
          </div>
        )}

        {/* Slabs with progress bars */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">Incentive Slabs</p>
          {progress.sorted.map((slab, i) => {
            const hitIdx = progress.activeSlab ? progress.sorted.indexOf(progress.activeSlab) : -1
            const isHit  = hitIdx >= i
            const isNext = !isHit && progress.nextSlab === slab
            const barPct = slabBarPct(slab, type, progress)
            const nudge  = isNext && active ? nudgeText(slab, type, progress) : null
            const label  = slabLabel(slab, type)

            return (
              <div key={i} className={`rounded-xl border p-3 transition-all ${
                isHit  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900' :
                isNext ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                         'bg-gray-50 dark:bg-surface-hover border-gray-100 dark:border-surface-border'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isHit ? 'text-green-600' : isNext ? 'text-amber-500' : 'text-gray-400'}`}>
                      {'①②③④⑤⑥'[i] ?? `${i + 1}`}
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</span>
                  </div>
                  <div className="flex gap-1">
                    {isHit  && <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded-full">✓ Hit!</span>}
                    {isNext && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded-full">↑ Next</span>}
                  </div>
                </div>

                {active && (
                  <>
                    <div className="h-2 bg-gray-200 dark:bg-surface-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isHit ? 'bg-green-500' : isNext ? 'bg-amber-400' : 'bg-gray-300'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      {nudge && <p className="text-[10px] font-semibold text-amber-600">{nudge}</p>}
                      <p className={`text-[10px] font-bold ml-auto ${isHit ? 'text-green-600' : isNext ? 'text-amber-500' : 'text-gray-400'}`}>{barPct.toFixed(0)}%</p>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Kickers() {
  const { user, effectiveUser } = useAuth()
  const { month } = useMonth()

  const [kickers,   setKickers]   = useState([])
  const [deals,     setDeals]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('active')
  const [manMode,   setManMode]   = useState('forMe') // 'forMe' | 'forMyTeam' — Manager only

  const isManager   = user?.role === 'Manager'
  const isOversight = OVERSIGHT_ROLES.includes(user?.role)

  function isVisible(k) {
    if (isOversight) return true
    const roles = k.targetRoles || []
    if (!roles.includes(effectiveUser?.role)) return false
    const teams = k.targetTeams || []
    if (teams.includes('ALL')) return true
    if (teams.includes(effectiveUser?.email)) return true
    if (teams.includes(effectiveUser?.managerEmail)) return true
    return false
  }

  const load = useCallback(async () => {
    if (!effectiveUser?.email) return
    setLoading(true)
    try {
      const [ks, ds] = await Promise.all([
        getKickers(),
        getDeals(null, month),
      ])
      setKickers(ks)
      setDeals(ds)
    } catch { /* show empty */ }
    finally { setLoading(false) }
  }, [effectiveUser?.email, month])

  useEffect(() => { load() }, [load])

  // For Manager: split into "For Me" (received) and "For My Team" (announced)
  const forMeKickers     = isManager ? kickers.filter(isVisible) : []
  const forMyTeamKickers = isManager ? kickers.filter(k => k.announcedBy === user?.email) : []

  // For oversight and non-manager roles: all visible kickers
  const allVisible = isOversight
    ? kickers
    : isManager
      ? (manMode === 'forMe' ? forMeKickers : forMyTeamKickers)
      : kickers.filter(isVisible)

  const active    = allVisible.filter(k => kickerIsActive(k) && !kickerIsPast(k)).sort((a, b) => b.pinned - a.pinned)
  const past      = allVisible.filter(k => kickerIsPast(k)).sort((a, b) => new Date(b.dateTo) - new Date(a.dateTo))
  const displayed = tab === 'active' ? active : past

  function dealsFor(k) {
    const isTeam = k.type?.startsWith('team_')
    if (isTeam) return deals
    return deals.filter(d => d.Email === effectiveUser?.email)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 flex items-center justify-center">
          <Zap size={18} className="text-purple-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900 dark:text-white">My Kickers</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">Your active incentives & bonus opportunities</p>
        </div>
      </div>

      {/* Manager mode toggle */}
      {isManager && (
        <div className="flex gap-1 bg-gray-100 dark:bg-surface-card rounded-xl p-1 w-fit border dark:border-surface-border">
          <button onClick={() => { setManMode('forMe'); setTab('active') }}
            className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${manMode === 'forMe' ? 'bg-white dark:bg-surface-muted text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <Zap size={13} className="text-purple-500" />
            For Me ({forMeKickers.filter(k => kickerIsActive(k) && !kickerIsPast(k)).length} active)
          </button>
          <button onClick={() => { setManMode('forMyTeam'); setTab('active') }}
            className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${manMode === 'forMyTeam' ? 'bg-white dark:bg-surface-muted text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            <Users size={13} className="text-brand-500" />
            For My Team ({forMyTeamKickers.filter(k => kickerIsActive(k) && !kickerIsPast(k)).length} active)
          </button>
        </div>
      )}

      {/* Active/Past tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('active')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'active' ? 'bg-white dark:bg-surface-muted text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          <Zap size={13} className="text-purple-500" />
          Active ({active.length})
        </button>
        <button onClick={() => setTab('past')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'past' ? 'bg-white dark:bg-surface-muted text-gray-800 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
          <Clock size={13} />
          Past ({past.length})
        </button>
      </div>

      {/* Cards */}
      {displayed.length === 0 ? (
        <div className="bg-white dark:bg-surface-card rounded-2xl border border-gray-200 dark:border-surface-border p-12 flex flex-col items-center gap-3 text-center">
          <Zap size={32} className="text-gray-200" />
          <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">
            {tab === 'active'
              ? isManager && manMode === 'forMyTeam'
                ? 'No active kickers announced to your team yet.'
                : 'No active kickers right now. Stay tuned!'
              : 'No past kickers to show.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayed.map(k => (
            <KickerCard key={k.id} kicker={k} deals={dealsFor(k)} />
          ))}
        </div>
      )}
    </div>
  )
}
