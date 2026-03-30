import { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, Percent, BarChart2, AlertTriangle, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getSummary, getLeaderboard, getDeals, getTeamSalesAnalytics } from '../services/api'
import { clearCache } from '../services/appsScript'
import MetricsCard from '../components/MetricsCard'
import DaysLeftBadge from '../components/DaysLeftBadge'
import { formatINR, getAchievementPct } from '../utils/commission'

const MANAGER_ROLES = ['Admin', 'SalesHead', 'VH', 'Manager']
const REFRESH_MS    = 30_000

export default function Dashboard() {
  const { effectiveUser } = useAuth()
  const { month } = useMonth()

  const [summary,      setSummary]      = useState(null)
  const [leaderboard,  setLeaderboard]  = useState([])
  const [recentDeals,  setRecentDeals]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [tick,         setTick]         = useState(0)

  const isManager = MANAGER_ROLES.includes(effectiveUser?.role)

  // 30-second live refresh
  useEffect(() => {
    const id = setInterval(() => { clearCache(); setTick(t => t + 1) }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (tick === 0) setLoading(true)
    setError('')

    if (isManager) {
      Promise.all([
        getLeaderboard(effectiveUser.email, month),
        getTeamSalesAnalytics(effectiveUser.email, month, effectiveUser.role === 'Admin'),
      ])
        .then(([rows, anal]) => {
          const totalTarget     = rows.reduce((s, r) => s + r.target,               0)
          const totalCommission = rows.reduce((s, r) => s + (r.commission ?? 0),    0)
          const totalAchieved   = anal?.totalAchieved  ?? rows.reduce((s, r) => s + r.achieved,             0)
          const totalSaleValue  = anal?.totalSaleValue ?? rows.reduce((s, r) => s + (r.totalSaleValue ?? 0), 0)
          setSummary({
            totalTarget,
            totalAchieved,
            totalCommission,
            totalSaleValue,
            achievementPct: totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
          })
          setLeaderboard(rows)
        })
        .catch(() => setError('Failed to load dashboard data.'))
        .finally(() => setLoading(false))
    } else {
      Promise.all([
        getSummary(effectiveUser.email, month),
        getDeals(effectiveUser.email, month),
      ])
        .then(([summaryRes, dealsRes]) => {
          setSummary(summaryRes)
          setRecentDeals((dealsRes ?? []).slice(0, 5))
        })
        .catch(() => setError('Failed to load dashboard data.'))
        .finally(() => setLoading(false))
    }
  }, [month, effectiveUser?.email, tick])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const achievedPct   = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0
  const projectedPct  = summary && (summary.totalTarget ?? 0) > 0
    ? Math.min(999, ((summary.totalSaleValue ?? 0) / summary.totalTarget) * 100)
    : 0
  const gap           = Math.max(0, (summary?.totalTarget ?? 0) - (summary?.totalAchieved ?? 0))

  // 6 KPI cards — same structure for both roles
  const cards = [
    {
      title: isManager ? 'Team Target'     : 'My Target',
      value: formatINR(summary?.totalTarget ?? 0),
      icon: Target, color: 'blue',
    },
    {
      title: isManager ? 'Team Sale Value' : 'Total Sale Value',
      value: formatINR(summary?.totalSaleValue ?? 0),
      sub:   'Pipeline (all deals)',
      icon: TrendingUp, color: 'blue',
    },
    {
      title: isManager ? 'Team Achieved'   : 'Achieved (Paid)',
      value: formatINR(summary?.totalAchieved ?? 0),
      sub:   isManager ? undefined : `${summary?.totalDeals ?? 0} paid deal${(summary?.totalDeals ?? 0) !== 1 ? 's' : ''}`,
      icon: TrendingUp, color: 'green',
    },
    {
      title: isManager ? 'Total Incentives': 'Commission Earned',
      value: formatINR(summary?.totalCommission ?? 0),
      icon: DollarSign, color: 'purple',
    },
    {
      title: 'Achievement %',
      value: `${achievedPct.toFixed(1)}%`,
      sub:   gap > 0 ? `₹${formatINR(gap)} gap` : 'Target hit',
      icon: Percent,
      color: achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red',
    },
    {
      title: 'Projected %',
      value: `${projectedPct.toFixed(1)}%`,
      sub:   'If full pipeline pays',
      icon: BarChart2,
      color: projectedPct >= 100 ? 'green' : projectedPct >= 75 ? 'orange' : 'blue',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Welcome back, {effectiveUser?.name?.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-500">
            {isManager ? 'Team overview for' : "Here's your overview for"} {month}
          </p>
        </div>
        <DaysLeftBadge month={month} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 6 KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <MetricsCard key={card.title} {...card} />
        ))}
      </div>

      {/* ── AGENT ONLY sections ── */}
      {!isManager && (
        <>
          {/* No-data hint */}
          {(summary?.totalTarget ?? 0) > 0 && (summary?.totalSaleValue ?? 0) === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-800">
                <strong>No deal data found for this period.</strong> If you have submitted deals,
                verify that the email used in your sales submission matches your profile email:
                <span className="font-mono ml-1 bg-amber-100 px-1 rounded text-xs">{effectiveUser?.email}</span>
              </div>
            </div>
          )}

          {/* Eligibility banner */}
          {(summary?.totalTarget ?? 0) > 0 && (
            achievedPct >= 100 ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
                <CheckCircle size={18} className="text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Eligible to Claim Incentives</p>
                  <p className="text-xs text-green-600 mt-0.5">You've hit 100% of your target. Raise your claim with your manager.</p>
                </div>
              </div>
            ) : (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-orange-500 shrink-0" />
                  <p className="text-sm text-orange-800">
                    <strong>{formatINR(gap)}</strong> more needed to reach 100% and unlock your incentive claim.
                  </p>
                </div>
                <span className="text-xs font-semibold bg-orange-100 border border-orange-300 text-orange-700 px-3 py-1 rounded-lg">
                  {achievedPct.toFixed(1)}% achieved
                </span>
              </div>
            )
          )}

          {/* Mini Slab Progress */}
          {(summary?.slabInfo?.slabs?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Incentive Slab Progress</h3>
              <div className="space-y-2.5">
                {summary.slabInfo.slabs.map((slab, i) => {
                  const threshold = Number(slab.targetAmount)
                  const rate      = Number(slab.commissionPct)
                  const achieved  = summary.totalAchieved ?? 0
                  const hit       = achieved >= threshold
                  const fillPct   = threshold > 0 ? Math.min(100, (achieved / threshold) * 100) : 0
                  const potential = Math.round(threshold * rate / 100)
                  return (
                    <div key={i} className={`rounded-xl border px-4 py-3 ${hit ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-gray-600">Slab {i + 1}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${hit ? 'text-green-700 bg-green-100' : 'text-orange-700 bg-orange-100'}`}>
                            {hit ? 'Hit' : 'Not yet'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-medium text-gray-700">{formatINR(threshold)}</span>
                          <span className="text-xs text-gray-400 ml-1">@ {rate}%</span>
                          <span className="text-xs font-semibold text-purple-700 ml-2">= {formatINR(potential)}</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${hit ? 'bg-green-500' : 'bg-blue-500'}`}
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Deals */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Deals</h3>
            {recentDeals.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No deals this month.</p>
            ) : (
              <div className="space-y-2">
                {recentDeals.map((deal) => (
                  <div
                    key={deal.ID || deal.LeadName}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800">{deal.LeadName || deal.CustomerName}</p>
                      <p className="text-xs text-gray-400">
                        {deal.PaymentDate ? new Date(deal.PaymentDate).toLocaleDateString('en-IN') : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">{formatINR(deal.TotalValue || deal.PaidActual)}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        deal.Status === 'Cleared'  ? 'bg-green-100 text-green-700'  :
                        deal.Status === 'AtRisk'   ? 'bg-red-100 text-red-700'      :
                        deal.Status === 'OnHold'   ? 'bg-orange-100 text-orange-700' :
                                                     'bg-yellow-100 text-yellow-700'
                      }`}>
                        {deal.Status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── MANAGER ONLY sections ── */}
      {isManager && leaderboard.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">Team Performance — {month}</h3>
            <span className="text-xs text-gray-400">{leaderboard.length} agent{leaderboard.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left w-8 font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                  <th className="px-4 py-3 text-right font-medium">Pipeline</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 font-medium min-w-[200px]">Slab Progress</th>
                  <th className="px-4 py-3 text-center font-medium">Eligibility</th>
                  <th className="px-4 py-3 text-right font-medium">Incentive</th>
                  <th className="px-4 py-3 text-center font-medium">Docs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row, i) => {
                  const si = row.slabInfo
                  return (
                    <tr key={row.email ?? i} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3.5 text-gray-400 text-xs font-medium">{i + 1}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-800">{row.name}</p>
                        {si?.presetLabel ? (
                          <span className={`mt-0.5 inline-block text-xs px-1.5 py-0.5 rounded font-medium ${
                            si.presetId === 'basic'   ? 'bg-blue-50 text-blue-600' :
                            si.presetId === 'average' ? 'bg-green-50 text-green-600' :
                                                        'bg-purple-50 text-purple-600'
                          }`}>{si.presetLabel}</span>
                        ) : (
                          <span className="text-xs text-gray-300">No target</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-sm font-medium text-gray-700">{formatINR(row.totalSaleValue)}</p>
                        {row.pendingCollection > 0 && (
                          <p className="text-xs text-orange-500">+{formatINR(row.pendingCollection)} pending</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="text-sm font-semibold text-gray-800">{formatINR(row.achieved)}</p>
                        <p className="text-xs text-gray-400">of {formatINR(row.target)}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        {si ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    !si.eligible ? 'bg-red-400' :
                                    si.nextSlab   ? 'bg-blue-500' : 'bg-green-500'
                                  }`}
                                  style={{ width: `${si.progressPct}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-8 text-right">{si.progressPct.toFixed(0)}%</span>
                            </div>
                            {si.nextSlab ? (
                              <p className="text-xs text-gray-400 leading-snug">
                                {formatINR(si.gapToNext)} to Slab {si.currentSlabIdx + 2}
                                <span className="text-green-600 font-medium"> → {formatINR(si.potentialAtNext)}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-green-600 font-medium">Max slab reached</p>
                            )}
                          </div>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {si ? (
                          si.eligible ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full">
                              ✓ Eligible
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-block text-xs font-medium bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-full">
                                Not Eligible
                              </span>
                              <p className="text-xs text-red-400">↑ {formatINR(si.gapToSlab1)} to recover</p>
                            </div>
                          )
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <p className="font-semibold text-purple-600">{formatINR(row.commission)}</p>
                        {si?.nextSlab && (
                          <p className="text-xs text-gray-400">→ {formatINR(si.potentialAtNext)} next</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        {row.loanDocsTotal > 0 ? (
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                            row.loanDocsOk === row.loanDocsTotal ? 'bg-green-50 text-green-700' :
                            row.loanDocsOk > 0                  ? 'bg-yellow-50 text-yellow-700' :
                                                                   'bg-gray-100 text-gray-500'
                          }`}>
                            {row.loanDocsOk}/{row.loanDocsTotal}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
