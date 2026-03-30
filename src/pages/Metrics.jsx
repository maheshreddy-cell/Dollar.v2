import { useState, useEffect } from 'react'
import {
  Target, TrendingUp, DollarSign, Percent, BarChart2,
  Users, Activity, CheckCircle, AlertTriangle, ClipboardCheck,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { useMonth }  from '../contexts/MonthContext'
import { useAuth }   from '../contexts/AuthContext'
import { getSummary, getLeaderboard, getTeamSalesAnalytics } from '../services/api'
import { clearCache } from '../services/appsScript'
import MetricsCard   from '../components/MetricsCard'
import { formatINR, getAchievementPct } from '../utils/commission'

const COLORS = [
  '#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]
const REFRESH_MS = 30_000

// ── Helpers ───────────────────────────────────────────────────────────────────

function axisINR(v) {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}k`
  return `₹${v}`
}

function workingDaysLeft(month) {
  if (!month) return 0
  const [yr, mo] = month.split('-').map(Number)
  const now      = new Date()
  const lastDay  = new Date(yr, mo, 0)
  if (now > lastDay) return 0
  const cursor = new Date(now); cursor.setHours(0,0,0,0)
  let count = 0
  while (cursor <= lastDay) {
    const d = cursor.getDay()
    if (d !== 0 && d !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function workedDaysInMonth(month) {
  if (!month) return 0
  const [yr, mo] = month.split('-').map(Number)
  const firstDay = new Date(yr, mo - 1, 1)
  const lastDay  = new Date(yr, mo, 0)
  const now      = new Date()
  const endDate  = now > lastDay ? lastDay : now
  let count = 0
  const cur = new Date(firstDay)
  while (cur <= endDate) {
    const d = cur.getDay()
    if (d !== 0 && d !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Pulsing "Live" badge with seconds-ago counter */
function LiveBadge({ lastUpdated }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const sec = lastUpdated ? Math.floor((now - lastUpdated) / 1000) : null
  return (
    <div className="flex items-center gap-2 text-xs select-none">
      <span className="flex items-center gap-1.5 font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live · 30s
      </span>
      {sec !== null && (
        <span className="text-gray-400 hidden sm:inline">
          {sec < 5 ? 'Just refreshed' : `${sec}s ago`}
        </span>
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-gray-400" />
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
    </div>
  )
}

/** Progress bar row used in Performance by Team / Vertical */
function HorizontalBar({ label, value, max, color, deals, tsv }) {
  const pct    = max > 0 ? Math.min((value / max) * 100, 100) : 0
  const tsvPct = max > 0 ? Math.min(((tsv ?? 0) / max) * 100, 100) : 0
  return (
    <div className="space-y-1 group cursor-default">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 truncate max-w-[160px] group-hover:text-gray-900 transition-colors">
          {label}
        </span>
        <span className="text-gray-500 ml-2 shrink-0">
          {formatINR(value)} · {deals} deals
          {tsv != null && tsv > 0 && (
            <span className="text-blue-400 ml-1">(TSV {formatINR(tsv)})</span>
          )}
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden relative group-hover:h-3 transition-all duration-200">
        {/* Pipeline (TSV) layer */}
        {tsvPct > pct && (
          <div
            className="absolute h-full rounded-full bg-blue-100"
            style={{ width: `${tsvPct}%` }}
          />
        )}
        {/* Paid layer */}
        <div
          className="absolute h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

/** Rank number with color coding (no emojis) */
function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-sm font-bold text-yellow-500">1</span>
  if (rank === 2) return <span className="text-sm font-bold text-slate-400">2</span>
  if (rank === 3) return <span className="text-sm font-bold text-amber-700">3</span>
  return <span className="text-sm text-gray-400 font-medium">{rank}</span>
}

/** Slab eligibility pill */
function EligibilityBadge({ slabInfo }) {
  if (!slabInfo) return <span className="text-xs text-gray-300">—</span>
  if (slabInfo.eligible) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        Eligible
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
      ₹{Math.ceil((slabInfo.gapToSlab1 ?? 0) / 1000)}k to Slab 1
    </span>
  )
}

/** Circular SVG arc progress ring */
function ArcGauge({ pct = 0, color = '#3b82f6', size = 72 }) {
  const r     = size * 0.4
  const circ  = 2 * Math.PI * r
  const cx    = size / 2
  const cy    = size / 2
  const fill  = Math.min(pct, 100) / 100 * circ
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f1f5f9" strokeWidth={size * 0.1} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.1}
        strokeDasharray={`${fill} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }}
      />
      <text
        x={cx} y={cy + 5}
        textAnchor="middle"
        fontSize={size * 0.18}
        fontWeight="700"
        fill={color}
      >
        {Math.min(pct, 100).toFixed(0)}%
      </text>
    </svg>
  )
}

/** Animated fade-in-up wrapper with configurable delay */
function FadeIn({ children, delay = 0 }) {
  return (
    <div
      className="animate-fade-in-up"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {children}
    </div>
  )
}

/** Small stat box for Recovery Snapshot rows */
function StatBox({ label, value, sub, valueClass = 'text-gray-800' }) {
  return (
    <div className="rounded-lg p-2.5 hover:bg-white/60 transition-colors cursor-default group">
      <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${valueClass} group-hover:brightness-90 transition-all`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Metrics() {
  const { month }               = useMonth()
  const { effectiveUser: user } = useAuth()
  const isAgent                 = user?.role === 'Agent'

  const [summary,     setSummary]     = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [analytics,   setAnalytics]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [tick,        setTick]        = useState(0)

  // ── 30-second live refresh ──────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      clearCache()
      setTick(t => t + 1)
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  // ── Data fetch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    setError('')
    if (tick === 0) setLoading(true)   // full spinner only on first load

    const promises = isAgent
      ? [getSummary(user.email, month), Promise.resolve([]), Promise.resolve(null)]
      : [
          getLeaderboard(user.email, month),
          getTeamSalesAnalytics(user.email, month, user.role === 'Admin'),
          Promise.resolve(null),
        ]

    Promise.all(promises)
      .then(([res1, res2]) => {
        if (isAgent) {
          setSummary(res1)
          setLeaderboard([])
          setAnalytics(null)
        } else {
          const lb = [...(res1 ?? [])].sort((a, b) => b.achieved - a.achieved)
          setLeaderboard(lb)
          const teamTarget     = lb.reduce((s, r) => s + r.target,               0)
          const teamCommission = lb.reduce((s, r) => s + (r.commission ?? 0),    0)
          // Prefer analytics totals — includes all subtree emails (manager's
          // own deals + agents). Leaderboard only counts Agent-role users.
          const teamAchieved  = res2?.totalAchieved  ?? lb.reduce((s, r) => s + r.achieved,             0)
          const teamSaleValue = res2?.totalSaleValue ?? lb.reduce((s, r) => s + (r.totalSaleValue ?? 0), 0)
          setSummary({
            totalTarget:     teamTarget,
            totalAchieved:   teamAchieved,
            totalCommission: teamCommission,
            totalSaleValue:  teamSaleValue,
            achievementPct:  teamTarget > 0 ? Math.min((teamAchieved / teamTarget) * 100, 999) : 0,
          })
          setAnalytics(res2)
        }
        setLastUpdated(new Date())
      })
      .catch(() => setError('Failed to load metrics. Retrying in 30s…'))
      .finally(() => setLoading(false))
  }, [month, user?.email, tick])

  // ── Loading / error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const achievedPct  = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0
  const projectedPct = (summary?.totalTarget ?? 0) > 0
    ? Math.min(999, ((summary.totalSaleValue ?? 0) / summary.totalTarget) * 100)
    : 0

  const daysLeft      = workingDaysLeft(month)
  const workedDays    = workedDaysInMonth(month)
  const recTarget     = summary?.totalTarget    ?? 0
  const recAchieved   = summary?.totalAchieved  ?? 0
  const recSaleValue  = summary?.totalSaleValue ?? 0
  const recGap        = Math.max(0, recTarget - recAchieved)
  const dailyNeeded   = recGap > 0 && daysLeft > 0   ? Math.ceil(recGap       / daysLeft)   : 0
  const dailyAvgPaid  = workedDays > 0                ? Math.ceil(recAchieved  / workedDays)  : 0
  const dailyAvgProj  = workedDays > 0                ? Math.ceil(recSaleValue / workedDays)  : 0

  const chartData = leaderboard.slice(0, 10).map(r => ({
    name:     r.name?.split(' ')[0] ?? r.email,
    achieved: r.achieved            ?? 0,
    tsv:      r.totalSaleValue      ?? 0,
  }))

  const teamMax     = (analytics?.byTeam?.[0]?.totalSaleValue  || analytics?.byTeam?.[0]?.achieved)     || 1
  const verticalMax = (analytics?.byVertical?.[0]?.totalSaleValue || analytics?.byVertical?.[0]?.achieved) || 1

  const isAdmin  = user?.role === 'Admin'
  const orgLabel = isAdmin ? 'Org' : 'Team'

  // ── KPI card definitions ─────────────────────────────────────────────────────
  const agentCards = [
    {
      title: 'My Target',
      value: formatINR(summary?.totalTarget ?? 0),
      icon: Target, color: 'blue',
    },
    {
      title: 'Total Sale Value',
      value: formatINR(summary?.totalSaleValue ?? 0),
      sub: 'Pipeline value (all deals)',
      icon: TrendingUp, color: 'blue',
    },
    {
      title: 'Achieved (Paid)',
      value: formatINR(summary?.totalAchieved ?? 0),
      sub: `${summary?.totalDeals ?? 0} paid deal${(summary?.totalDeals ?? 0) !== 1 ? 's' : ''}`,
      icon: TrendingUp, color: 'green',
    },
    {
      title: 'Commission Earned',
      value: formatINR(summary?.totalCommission ?? 0),
      sub: summary?.slabInfo
        ? summary.slabInfo.eligible
          ? 'Slab eligible'
          : `₹${Math.ceil((summary.slabInfo.gapToSlab1 ?? 0) / 1000)}k to Slab 1`
        : undefined,
      icon: DollarSign, color: 'purple',
    },
    {
      title: 'Achievement %',
      value: `${achievedPct.toFixed(1)}%`,
      sub: summary?.slabInfo ? `Slab 1 at ${formatINR(summary.slabInfo.firstSlabTarget)}` : undefined,
      icon: Percent,
      color: achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red',
    },
    {
      title: 'Projected',
      value: `${projectedPct.toFixed(1)}%`,
      sub: 'If full pipeline pays in full',
      icon: BarChart2,
      color: projectedPct >= 100 ? 'green' : projectedPct >= 75 ? 'orange' : 'blue',
    },
  ]

  const managerCards = [
    { title: `${orgLabel} Target`,     value: formatINR(recTarget),                       icon: Target,    color: 'blue'   },
    { title: `${orgLabel} Sale Value`, value: formatINR(recSaleValue), sub: 'Full pipeline', icon: TrendingUp,color: 'blue'   },
    { title: `${orgLabel} Achieved`,   value: formatINR(recAchieved),                     icon: TrendingUp,color: 'green'  },
    { title: `${orgLabel} Incentives`, value: formatINR(summary?.totalCommission ?? 0),    icon: DollarSign,color: 'purple' },
    {
      title: 'Achievement %',
      value: `${achievedPct.toFixed(1)}%`,
      icon: Percent,
      color: achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red',
    },
    {
      title: 'Projected %',
      value: `${projectedPct.toFixed(1)}%`,
      sub: 'If full pipeline pays in full',
      icon: BarChart2,
      color: projectedPct >= 100 ? 'green' : projectedPct >= 75 ? 'orange' : 'blue',
    },
  ]

  const cards = isAgent ? agentCards : managerCards

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="space-y-6 relative"
      style={{
        backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1px)',
        backgroundSize:  '22px 22px',
      }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Metrics — {month}</h2>
        <LiveBadge lastUpdated={lastUpdated} />
      </div>

      {/* ── KPI Cards (6-grid for all roles) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <FadeIn key={card.title} delay={i * 55}>
            <MetricsCard {...card} />
          </FadeIn>
        ))}
      </div>

      {/* ══════════════════════════════════════
          AGENT-ONLY SECTIONS
      ══════════════════════════════════════ */}
      {isAgent && (
        <>
          {/* Eligibility Banner */}
          {recTarget > 0 && (
            <FadeIn delay={380}>
              {achievedPct >= 100 ? (
                <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3 hover:shadow-sm transition-shadow">
                  <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Eligible to Claim Incentives</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      You have hit 100% of your monthly target. Raise your incentive claim with your manager.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={20} className="text-orange-500 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-orange-800">Need to Recover More</p>
                      <p className="text-xs text-orange-600 mt-0.5">
                        {formatINR(recGap)} more needed to reach 100% and unlock incentive claim.
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 px-3 py-1.5 rounded-lg">
                    {achievedPct.toFixed(1)}% achieved
                  </span>
                </div>
              )}
            </FadeIn>
          )}

          {/* Slab Progress — arc gauge cards */}
          {(summary?.slabInfo?.slabs?.length ?? 0) > 0 && (
            <FadeIn delay={440}>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
                <SectionHeader icon={Target} title="Slab Progress & Earnings Potential" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {summary.slabInfo.slabs.map((slab, i) => {
                    const threshold = Number(slab.targetAmount)
                    const rate      = Number(slab.commissionPct)
                    const achieved  = summary.totalAchieved ?? 0
                    const hit       = achieved >= threshold
                    const gap       = Math.max(0, threshold - achieved)
                    const potential = Math.round(threshold * rate / 100)
                    const fillPct   = threshold > 0 ? Math.min(100, (achieved / threshold) * 100) : 0
                    return (
                      <div
                        key={i}
                        className={`p-3 rounded-xl border text-center transition-all duration-200
                          hover:shadow-md hover:scale-[1.03] cursor-default
                          ${hit ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-600">Slab {i + 1}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                            ${hit ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'}`}>
                            {hit ? 'Hit' : 'Not yet'}
                          </span>
                        </div>
                        <ArcGauge pct={fillPct} color={hit ? '#10b981' : '#3b82f6'} size={76} />
                        <p className="text-sm font-bold text-gray-800 mt-1">{formatINR(threshold)}</p>
                        <p className="text-[11px] text-gray-500">{rate}% commission</p>
                        <p className="text-[11px] font-semibold text-purple-700 mt-0.5">
                          Potential: {formatINR(potential)}
                        </p>
                        {!hit && gap > 0 && (
                          <p className="text-[10px] text-orange-600 mt-0.5">{formatINR(gap)} to go</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </FadeIn>
          )}

          {/* Loan Documents Collected */}
          {Object.keys(summary?.loanDocs ?? {}).length > 0 && (
            <FadeIn delay={500}>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
                <SectionHeader icon={ClipboardCheck} title="Loan Documents Collected" />
                <div className="flex flex-wrap gap-2">
                  {Object.entries(summary.loanDocs)
                    .sort((a, b) => b[1] - a[1])
                    .map(([label, count]) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full
                          bg-gray-100 text-gray-700 border border-gray-200
                          hover:bg-gray-200 transition-colors cursor-default"
                      >
                        {label}
                        <span className="bg-white text-gray-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-gray-200">
                          {count}
                        </span>
                      </span>
                    ))}
                </div>
              </div>
            </FadeIn>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          MANAGER / ADMIN SECTIONS
      ══════════════════════════════════════ */}
      {!isAgent && analytics && (
        <FadeIn delay={370}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-default">
              <p className="text-xs text-gray-500">{orgLabel} Revenue ({month})</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{formatINR(analytics.totalAchieved)}</p>
              <p className="text-xs text-blue-500 mt-0.5">Pipeline: {formatINR(analytics.totalSaleValue ?? 0)}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-default">
              <p className="text-xs text-gray-500">{orgLabel} Deals ({month})</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.totalDeals.toLocaleString('en-IN')}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Avg TSV: {analytics.totalDeals > 0 ? formatINR(Math.round((analytics.totalSaleValue ?? 0) / analytics.totalDeals)) : '—'} / deal
              </p>
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Recovery Snapshot (both roles — enhanced) ── */}
      {recTarget > 0 && (
        <FadeIn delay={isAgent ? 560 : 420}>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={Activity} title="Recovery Snapshot" />

            {/* Row 1: core numbers */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pb-4 border-b border-gray-100">
              <StatBox label="Target"       value={formatINR(recTarget)} />
              <StatBox label="Achieved"     value={formatINR(recAchieved)}  valueClass="text-green-700" />
              <StatBox
                label="Sale Value"
                value={formatINR(recSaleValue)}
                sub={`Proj ${projectedPct.toFixed(0)}%`}
                valueClass="text-blue-700"
              />
              <StatBox
                label="Gap to Target"
                value={recGap <= 0 ? 'On Track' : formatINR(recGap)}
                valueClass={recGap <= 0 ? 'text-green-600' : 'text-red-500'}
              />
            </div>

            {/* Row 2: daily rates */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3">
              <StatBox label="Days Left"         value={`${daysLeft} working`} />
              <StatBox
                label="Daily Rate Needed"
                value={recGap <= 0 || daysLeft <= 0 ? '—' : formatINR(dailyNeeded)}
                valueClass={recGap <= 0 ? 'text-green-600' : 'text-orange-600'}
                sub="To close gap"
              />
              <StatBox
                label="Daily Avg (Paid)"
                value={formatINR(dailyAvgPaid)}
                sub="Current pace"
                valueClass="text-gray-700"
              />
              <StatBox
                label="Daily Avg (Pipeline)"
                value={formatINR(dailyAvgProj)}
                sub="Projected pace"
                valueClass="text-blue-600"
              />
            </div>

            {/* Dual progress bar: paid vs pipeline vs target */}
            <div className="mt-4 space-y-1">
              <div className="flex justify-between text-[10px] text-gray-400 px-0.5">
                <span className="text-green-500 font-medium">Paid {achievedPct.toFixed(0)}%</span>
                <span className="text-blue-400 font-medium">Pipeline {projectedPct.toFixed(0)}%</span>
                <span className="text-gray-400">Target 100%</span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden relative">
                {/* Pipeline bar (behind) */}
                <div
                  className="absolute h-full bg-blue-100 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, projectedPct)}%` }}
                />
                {/* Paid bar (front) */}
                <div
                  className="absolute h-full bg-green-500 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, achievedPct)}%` }}
                />
              </div>
            </div>
          </div>
        </FadeIn>
      )}

      {/* ── Top 10 Agents — Achieved vs Pipeline bar chart ── */}
      {chartData.length > 0 && (
        <FadeIn delay={isAgent ? 0 : 480}>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={BarChart2} title="Top 10 Agents — Achieved vs Pipeline" />
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false}
                />
                <YAxis
                  tickFormatter={axisINR}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false} tickLine={false} width={64}
                />
                <Tooltip
                  formatter={(v, name) => [formatINR(v), name === 'tsv' ? 'Pipeline (TSV)' : 'Paid']}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                {/* Pipeline bar (lighter, behind) */}
                <Bar dataKey="tsv" fill="#bfdbfe" radius={[4, 4, 0, 0]} name="tsv" />
                {/* Paid bar (colored, front) */}
                <Bar dataKey="achieved" radius={[4, 4, 0, 0]} name="achieved">
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </FadeIn>
      )}

      {/* ── Performance by Team / Vertical ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {analytics?.byTeam?.length > 0 && (
          <FadeIn delay={540}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
              <SectionHeader icon={Users} title="Performance by Team" />
              <div className="space-y-3">
                {analytics.byTeam.map((t, i) => (
                  <HorizontalBar
                    key={t.name} label={t.name} value={t.achieved}
                    max={teamMax} deals={t.deals} color={COLORS[i % COLORS.length]}
                    tsv={t.totalSaleValue}
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}
        {analytics?.byVertical?.length > 0 && (
          <FadeIn delay={580}>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm p-5">
              <SectionHeader icon={BarChart2} title="Performance by Vertical" />
              <div className="space-y-3">
                {analytics.byVertical.map((v, i) => (
                  <HorizontalBar
                    key={v.name} label={v.name} value={v.achieved}
                    max={verticalMax} deals={v.deals} color={COLORS[i % COLORS.length]}
                    tsv={v.totalSaleValue}
                  />
                ))}
              </div>
            </div>
          </FadeIn>
        )}
      </div>

      {/* ── Agent Leaderboard ── */}
      {leaderboard.length > 0 && (
        <FadeIn delay={600}>
          <div className="bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Agent Leaderboard</h3>
              <span className="text-xs text-gray-400">{leaderboard.length} agents</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50/80">
                  <tr>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase w-10">#</th>
                    <th className="text-left   px-5 py-3 text-xs font-medium text-gray-500 uppercase">Agent</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Target</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Sale Value</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Achieved</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Proj %</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Deals</th>
                    <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Incentive</th>
                    <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaderboard.map((row, i) => {
                    const rowProj = row.target > 0
                      ? Math.min(999, ((row.totalSaleValue ?? 0) / row.target) * 100)
                      : 0
                    return (
                      <tr
                        key={row.email ?? i}
                        className="hover:bg-blue-50/40 transition-colors duration-150 cursor-default group"
                      >
                        <td className="px-4 py-3 text-center"><RankBadge rank={i + 1} /></td>
                        <td className="px-5 py-3">
                          <p className="font-medium text-gray-800 group-hover:text-blue-700 transition-colors">{row.name}</p>
                          <p className="text-xs text-gray-400">{row.email}</p>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-500 text-xs">{formatINR(row.target)}</td>
                        <td className="px-5 py-3 text-right text-blue-600 text-xs font-medium">{formatINR(row.totalSaleValue ?? 0)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatINR(row.achieved)}</td>
                        <td className="px-5 py-3 text-right text-xs">
                          <span className={
                            rowProj >= 100 ? 'font-semibold text-green-600'
                            : rowProj >= 70  ? 'text-orange-600'
                            : 'text-gray-400'
                          }>
                            {rowProj.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right text-gray-600">{row.dealsCount ?? 0}</td>
                        <td className="px-5 py-3 text-right text-green-700 font-medium">{formatINR(row.commission ?? 0)}</td>
                        <td className="px-5 py-3 text-center"><EligibilityBadge slabInfo={row.slabInfo} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </FadeIn>
      )}
    </div>
  )
}
