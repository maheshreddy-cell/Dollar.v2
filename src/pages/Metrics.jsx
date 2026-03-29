import { useState, useEffect } from 'react'
import {
  Target, TrendingUp, DollarSign, Percent, BarChart2,
  Users, Activity, CheckCircle, AlertTriangle, ClipboardCheck,
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
  const start    = new Date(yr, mo - 1, 1)
  if (now > lastDay) return 0
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
  const { month }               = useMonth()
  const { effectiveUser: user } = useAuth()
  const isAgent                 = user?.role === 'Agent'

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

  // ── Derived values ─────────────────────────────────────────────────────────
  const achievedPct  = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0
  const projectedPct = isAgent && (summary?.totalTarget ?? 0) > 0
    ? Math.min(999, ((summary.totalSaleValue ?? 0) / summary.totalTarget) * 100)
    : 0

  const daysLeft   = workingDaysLeft(month)
  const recTarget  = summary?.totalTarget   ?? 0
  const recAchieved = summary?.totalAchieved ?? 0
  const recGap     = Math.max(0, recTarget - recAchieved)
  const dailyRate  = recGap > 0 && daysLeft > 0 ? Math.ceil(recGap / daysLeft) : 0

  const chartData   = leaderboard.slice(0, 10).map(r => ({
    name:     r.name?.split(' ')[0] ?? r.email,
    achieved: r.achieved ?? 0,
  }))

  const teamMax     = analytics?.byTeam?.[0]?.achieved     || 1
  const verticalMax = analytics?.byVertical?.[0]?.achieved || 1

  const isAdmin  = user?.role === 'Admin'
  const orgLabel = isAdmin ? 'Org' : 'Team'

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Metrics — {month}</h2>

      {/* ═══════════════════════════════════════════════
          AGENT VIEW
      ═══════════════════════════════════════════════ */}
      {isAgent && (
        <>
          {/* 6-card KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricsCard
              title="My Target"
              value={formatINR(summary?.totalTarget ?? 0)}
              icon={Target} color="blue"
            />
            <MetricsCard
              title="Total Sale Value"
              value={formatINR(summary?.totalSaleValue ?? 0)}
              sub="Pipeline value (all deals)"
              icon={TrendingUp} color="blue"
            />
            <MetricsCard
              title="Achieved (Paid)"
              value={formatINR(summary?.totalAchieved ?? 0)}
              sub={`${summary?.totalDeals ?? 0} paid deal${(summary?.totalDeals ?? 0) !== 1 ? 's' : ''}`}
              icon={TrendingUp} color="green"
            />
            <MetricsCard
              title="Commission Earned"
              value={formatINR(summary?.totalCommission ?? 0)}
              sub={
                summary?.slabInfo
                  ? summary.slabInfo.eligible
                    ? '✓ Slab eligible'
                    : `₹${Math.round((summary.slabInfo.gapToSlab1 ?? 0) / 1000)}k to reach Slab 1`
                  : undefined
              }
              icon={DollarSign} color="purple"
            />
            <MetricsCard
              title="Achievement %"
              value={`${achievedPct.toFixed(1)}%`}
              sub={
                summary?.slabInfo
                  ? `Slab 1 at ${formatINR(summary.slabInfo.firstSlabTarget)}`
                  : undefined
              }
              icon={Percent}
              color={achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red'}
            />
            <MetricsCard
              title="Projected"
              value={`${projectedPct.toFixed(1)}%`}
              sub="If full pipeline pays in full"
              icon={BarChart2}
              color={projectedPct >= 100 ? 'green' : projectedPct >= 75 ? 'orange' : 'blue'}
            />
          </div>

          {/* Eligibility banner */}
          {(summary?.totalTarget ?? 0) > 0 && (
            achievedPct >= 100 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Eligible to Claim Incentives ✓</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    You have met 100% of your monthly target. Raise your incentive claim with your manager.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <AlertTriangle size={20} className="text-orange-500 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-orange-800">Need to Recover More</p>
                    <p className="text-xs text-orange-600 mt-0.5">
                      {formatINR(recGap)} more needed to hit 100% target and unlock full incentive claim.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-xs font-semibold text-orange-700 bg-orange-100 border border-orange-300 px-3 py-1.5 rounded-lg">
                  {achievedPct.toFixed(1)}% achieved
                </span>
              </div>
            )
          )}

          {/* Slab Progress & Earnings Potential */}
          {(summary?.slabInfo?.slabs?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <SectionHeader icon={Target} title="Slab Progress & Earnings Potential" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {summary.slabInfo.slabs.map((slab, i) => {
                  const threshold = Number(slab.targetAmount)
                  const rate      = Number(slab.commissionPct)
                  const achieved  = summary.totalAchieved ?? 0
                  const hit       = achieved >= threshold
                  const gap       = Math.max(0, threshold - achieved)
                  const potential = Math.round(threshold * rate / 100)
                  const fillPct   = Math.min(100, (achieved / threshold) * 100)
                  return (
                    <div
                      key={i}
                      className={`p-3 rounded-xl border ${
                        hit ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-600">Slab {i + 1}</span>
                        {hit ? (
                          <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">✓ Hit</span>
                        ) : (
                          <span className="text-[10px] font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full">Not yet</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-gray-800">{formatINR(threshold)}</p>
                      <p className="text-[11px] text-gray-500">{rate}% commission</p>
                      <p className="text-[11px] font-semibold text-purple-700 mt-0.5">
                        Potential: {formatINR(potential)}
                      </p>
                      {!hit && gap > 0 && (
                        <p className="text-[10px] text-orange-600 mt-0.5">{formatINR(gap)} to go</p>
                      )}
                      <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${hit ? 'bg-green-500' : 'bg-brand-500'}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Loan Documents Collected breakdown */}
          {Object.keys(summary?.loanDocs ?? {}).length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <SectionHeader icon={ClipboardCheck} title="Loan Documents Collected" />
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.loanDocs)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count]) => (
                    <span
                      key={label}
                      className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200"
                    >
                      <span>{label}</span>
                      <span className="bg-white text-gray-600 px-1.5 py-0.5 rounded-full text-[10px] font-bold border border-gray-200">
                        {count}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════
          MANAGER / ADMIN VIEW — 4 KPI cards (no ASP)
      ═══════════════════════════════════════════════ */}
      {!isAgent && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricsCard
            title="Team Target"
            value={formatINR(summary?.totalTarget ?? 0)}
            icon={Target} color="blue"
          />
          <MetricsCard
            title="Team Achieved"
            value={formatINR(summary?.totalAchieved ?? 0)}
            icon={TrendingUp} color="green"
          />
          <MetricsCard
            title="Team Incentives"
            value={formatINR(summary?.totalCommission ?? 0)}
            icon={DollarSign} color="purple"
          />
          <MetricsCard
            title="Achievement %"
            value={`${achievedPct.toFixed(1)}%`}
            icon={Percent}
            color={achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red'}
          />
        </div>
      )}

      {/* ── Team Revenue + Deals (no ASP tile) ── */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{orgLabel} Revenue ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatINR(analytics.totalAchieved)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-500">{orgLabel} Deals ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.totalDeals.toLocaleString('en-IN')}</p>
          </div>
        </div>
      )}

      {/* ── Recovery Snapshot (both roles) ── */}
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

      {/* ── Agent Leaderboard ── */}
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
