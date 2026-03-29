import { useState, useEffect } from 'react'
import {
  Target, TrendingUp, DollarSign, Percent, BarChart2,
  Users, Activity, ShoppingCart,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getSummary, getLeaderboard, getTeamSalesAnalytics } from '../services/api'
import MetricsCard from '../components/MetricsCard'
import { formatINR, getAchievementPct } from '../utils/commission'

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6']

// ── Helpers ───────────────────────────────────────────────────────────────────

// Compact INR for chart axes: ₹1.2Cr, ₹5.8L, ₹72k
function axisINR(v) {
  if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(1)}Cr`
  if (v >= 100_000)    return `₹${(v / 100_000).toFixed(1)}L`
  if (v >= 1_000)      return `₹${(v / 1_000).toFixed(0)}k`
  return `₹${v}`
}

// Working days from today (or month start if future) to end of given "YYYY-MM" month
function workingDaysLeft(month) {
  if (!month) return 0
  const [yr, mo] = month.split('-').map(Number)
  const now      = new Date()
  const lastDay  = new Date(yr, mo, 0)              // last day of the month
  const start    = new Date(yr, mo - 1, 1)          // first day of the month

  // If the month is already over, 0 days left
  if (now > lastDay) return 0

  // Start from today if we're inside the month, else from month start
  const cursor = new Date(Math.max(now, start))
  cursor.setHours(0, 0, 0, 0)

  let count = 0
  const end = new Date(lastDay)
  end.setHours(23, 59, 59)
  while (cursor <= end) {
    const d = cursor.getDay()
    if (d !== 0 && d !== 6) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-gray-400" />
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
    </div>
  )
}

function HorizontalBar({ label, value, max, color, deals }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 truncate max-w-[160px]">{label}</span>
        <span className="text-gray-500 ml-2 shrink-0">{formatINR(value)} · {deals} deals</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-base">🥇</span>
  if (rank === 2) return <span className="text-base">🥈</span>
  if (rank === 3) return <span className="text-base">🥉</span>
  return <span className="text-sm text-gray-400 font-medium">{rank}</span>
}

function EligibilityBadge({ slabInfo }) {
  if (!slabInfo) return <span className="text-xs text-gray-300">—</span>
  if (slabInfo.eligible) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
        ✓ Eligible
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
      ₹{(slabInfo.gapToSlab1 / 1000).toFixed(0)}k to Slab 1
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Metrics() {
  const { month }                        = useMonth()
  const { effectiveUser: user }          = useAuth()
  const isAgent                          = user?.role === 'Agent'

  const [summary,     setSummary]     = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [analytics,   setAnalytics]   = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setError('')

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
          // Derive team-wide totals from leaderboard (same approach as Dashboard)
          const teamTarget     = lb.reduce((s, r) => s + r.target,     0)
          const teamAchieved   = lb.reduce((s, r) => s + r.achieved,   0)
          const teamCommission = lb.reduce((s, r) => s + (r.commission ?? 0), 0)
          setSummary({
            totalTarget:     teamTarget,
            totalAchieved:   teamAchieved,
            totalCommission: teamCommission,
            achievementPct:  teamTarget > 0 ? Math.min((teamAchieved / teamTarget) * 100, 999) : 0,
          })
          setAnalytics(res2)
        }
      })
      .catch(() => setError('Failed to load metrics.'))
      .finally(() => setLoading(false))
  }, [month, user?.email])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const achievedPct  = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0
  const asp          = analytics && analytics.totalDeals > 0
    ? analytics.totalAchieved / analytics.totalDeals
    : null

  const daysLeft     = workingDaysLeft(month)
  const recTarget    = summary?.totalTarget   ?? 0
  const recAchieved  = summary?.totalAchieved ?? 0
  const recGap       = Math.max(0, recTarget - recAchieved)
  const dailyRate    = recGap > 0 && daysLeft > 0 ? Math.ceil(recGap / daysLeft) : 0

  const chartData    = leaderboard.slice(0, 10).map(r => ({
    name:     r.name?.split(' ')[0] ?? r.email,
    achieved: r.achieved ?? 0,
  }))

  const teamMax     = analytics?.byTeam?.[0]?.achieved     || 1
  const verticalMax = analytics?.byVertical?.[0]?.achieved || 1

  const isAdmin = user?.role === 'Admin'
  const orgLabel = isAdmin ? 'Org' : 'Team'

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Metrics — {month}</h2>

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricsCard
          title={isAgent ? 'My Target'   : 'Team Target'}
          value={formatINR(summary?.totalTarget ?? 0)}
          icon={Target} color="blue"
        />
        <MetricsCard
          title={isAgent ? 'My Achieved'   : 'Team Achieved'}
          value={formatINR(summary?.totalAchieved ?? 0)}
          icon={TrendingUp} color="green"
        />
        <MetricsCard
          title={isAgent ? 'My Commission' : 'Team Incentives'}
          value={formatINR(summary?.totalCommission ?? 0)}
          icon={DollarSign} color="purple"
        />
        <MetricsCard
          title="Achievement %"
          value={`${achievedPct.toFixed(1)}%`}
          icon={Percent}
          color={achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red'}
        />
        {!isAgent && (
          <MetricsCard
            title="Team ASP"
            value={asp != null ? formatINR(Math.round(asp)) : '—'}
            sub="Avg revenue per deal"
            icon={ShoppingCart} color="blue"
          />
        )}
      </div>

      {/* ── Team Revenue / Deals / ASP big numbers ── */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{orgLabel} Revenue ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatINR(analytics.totalAchieved)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{orgLabel} Deals ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.totalDeals.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{orgLabel} ASP ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">
              {asp != null ? formatINR(Math.round(asp)) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* ── Recovery Snapshot ── */}
      {recTarget > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SectionHeader icon={Activity} title="Recovery Snapshot" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Target</p>
              <p className="text-sm font-bold text-gray-800">{formatINR(recTarget)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Achieved</p>
              <p className="text-sm font-bold text-green-700">{formatINR(recAchieved)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Gap</p>
              {recGap <= 0
                ? <p className="text-sm font-bold text-green-600">On Track ✓</p>
                : <p className="text-sm font-bold text-red-500">{formatINR(recGap)}</p>
              }
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Working Days Left</p>
              <p className="text-sm font-bold text-gray-800">{daysLeft}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Daily Run Rate Needed</p>
              {recGap <= 0
                ? <p className="text-sm font-bold text-green-600">—</p>
                : <p className={`text-sm font-bold ${daysLeft === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {daysLeft > 0 ? formatINR(dailyRate) : 'No days left'}
                  </p>
              }
            </div>
          </div>
          {recGap > 0 && daysLeft > 0 && (
            <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, (recAchieved / recTarget) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Top 10 Agents bar chart ── */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <SectionHeader icon={BarChart2} title="Top 10 Agents — Achieved Amount" />
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
                formatter={v => [formatINR(v), 'Achieved']}
                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
              />
              <Bar dataKey="achieved" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Performance by Team / Vertical ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {analytics?.byTeam?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={Users} title="Performance by Team" />
            <div className="space-y-3">
              {analytics.byTeam.map((t, i) => (
                <HorizontalBar
                  key={t.name} label={t.name} value={t.achieved}
                  max={teamMax} deals={t.deals} color={COLORS[i % COLORS.length]}
                />
              ))}
            </div>
          </div>
        )}
        {analytics?.byVertical?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <SectionHeader icon={BarChart2} title="Performance by Vertical" />
            <div className="space-y-3">
              {analytics.byVertical.map((v, i) => (
                <HorizontalBar
                  key={v.name} label={v.name} value={v.achieved}
                  max={verticalMax} deals={v.deals} color={COLORS[i % COLORS.length]}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Agent Leaderboard table ── */}
      {leaderboard.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Agent Leaderboard</h3>
            <span className="text-xs text-gray-400">{leaderboard.length} agents</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase w-12">#</th>
                  <th className="text-left   px-5 py-3 text-xs font-medium text-gray-500 uppercase">Agent</th>
                  <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Achieved</th>
                  <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Deals</th>
                  <th className="text-right  px-5 py-3 text-xs font-medium text-gray-500 uppercase">Incentive</th>
                  <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row, i) => (
                  <tr key={row.email ?? i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center">
                      <RankBadge rank={i + 1} />
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-gray-800">{row.name}</p>
                      <p className="text-xs text-gray-400">{row.email}</p>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-500 text-xs">{formatINR(row.target)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatINR(row.achieved)}</td>
                    <td className="px-5 py-3 text-right text-gray-600">{row.dealsCount ?? 0}</td>
                    <td className="px-5 py-3 text-right text-green-700 font-medium">{formatINR(row.commission ?? 0)}</td>
                    <td className="px-5 py-3 text-center">
                      <EligibilityBadge slabInfo={row.slabInfo} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
