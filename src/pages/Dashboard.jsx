import { useState, useEffect } from 'react'
import {
  DollarSign, AlertTriangle, CheckCircle, Zap, Award,
  Target, TrendingUp, BarChart2, Percent,
} from 'lucide-react'
import { useAuth }   from '../contexts/AuthContext'
import { useMonth }  from '../contexts/MonthContext'
import { getSummary, getLeaderboard, getTeamSalesAnalytics } from '../services/api'
import MetricsCard   from '../components/MetricsCard'
import FadeIn        from '../components/FadeIn'
import DaysLeftBadge from '../components/DaysLeftBadge'
import { useRefresh } from '../hooks/useRefresh'
import { useBackground } from '../hooks/useBackground'
import { MANAGER_ROLES } from '../utils/roles'
import { formatINR, getAchievementPct } from '../utils/commission'

// Preset slab badge color
const PRESET_COLOR = {
  basic:   'bg-blue-50 text-blue-600',
  average: 'bg-green-50 text-green-600',
  pro:     'bg-purple-50 text-purple-600',
}

function workingDaysLeft(month) {
  if (!month) return 0
  const [yr, mo] = month.split('-').map(Number)
  const now = new Date()
  const lastDay = new Date(yr, mo, 0)
  if (now > lastDay) return 0
  const cursor = new Date(now); cursor.setHours(0, 0, 0, 0)
  let count = 0
  while (cursor <= lastDay) {
    if (cursor.getDay() !== 0) count++ // Mon-Sat (skip Sunday only)
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

function calendarDaysLeft(month) {
  if (!month) return 0
  const [yr, mo] = month.split('-').map(Number)
  const lastDay = new Date(yr, mo, 0)
  const now = new Date(); now.setHours(0, 0, 0, 0)
  if (now > lastDay) return 0
  return Math.ceil((lastDay - now) / (1000 * 60 * 60 * 24)) + 1
}

function getMotivMessages(name, achieved, target, wipSlabHint) {
  const firstName = (name || '').split(' ')[0]
  const pct = target > 0 ? Math.round((achieved / target) * 100) : 0
  return [
    // Data-driven
    wipSlabHint?.neededForSlab > 0
      ? `🔥 ${formatINR(wipSlabHint.neededForSlab)} away from ${wipSlabHint.slabName}. Close strong!`
      : pct >= 100
        ? `🏆 Target achieved! You're eligible for incentives!`
        : `🔥 You're ${pct}% there. Push hard this week!`,
    // Warm
    `Keep going ${firstName}, every deal counts! 💪`,
    // Short + emoji
    `🎯 ${pct}% done! 🚀 Sprint to finish!`,
  ]
}

export default function Dashboard() {
  const { effectiveUser, user } = useAuth()
  const { month }               = useMonth()
  const bgStyle                 = useBackground()

  const [summary,     setSummary]     = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [motivIdx,    setMotivIdx]    = useState(0)

  const isManager = MANAGER_ROLES.includes(effectiveUser?.role)
  const tick      = useRefresh()

  // Rotate motivational message every 120s
  useEffect(() => {
    const id = setInterval(() => setMotivIdx(i => (i + 1) % 3), 120_000)
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
          const totalTarget     = rows.reduce((s, r) => s + r.target,             0)
          const totalCommission = rows.reduce((s, r) => s + (r.commission  ?? 0), 0)
          const totalAchieved   = anal?.totalAchieved  ?? rows.reduce((s, r) => s + r.achieved, 0)
          const totalSaleValue  = anal?.totalSaleValue ?? rows.reduce((s, r) => s + (r.totalSaleValue ?? 0), 0)
          const totalT2Amount   = anal?.totalT2Amount  ?? rows.reduce((s, r) => s + (r.totalT2Amount  ?? 0), 0)
          setSummary({
            totalTarget, totalAchieved, totalCommission,
            totalT2Amount, totalMoneyMade: totalCommission + totalT2Amount,
            totalSaleValue,
            achievementPct: totalTarget > 0 ? (totalAchieved / totalTarget) * 100 : 0,
            teamWipAmount: anal?.teamWipAmount ?? 0,
            teamWipAgentCount: anal?.teamWipAgentCount ?? 0,
          })
          setLeaderboard(rows)
        })
        .catch(() => setError('Failed to load dashboard data.'))
        .finally(() => setLoading(false))
    } else {
      getSummary(effectiveUser.email, month)
        .then((summaryRes) => {
          setSummary(summaryRes)
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

  const achievedPct  = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0
  const projectedPct = summary && (summary.totalTarget ?? 0) > 0
    ? Math.min(999, ((summary.totalSaleValue ?? 0) / summary.totalTarget) * 100)
    : 0
  const gap = Math.max(0, (summary?.totalTarget ?? 0) - (summary?.totalAchieved ?? 0))

  const managerCards = [
    {
      title: 'Team Target',
      value: formatINR(summary?.totalTarget ?? 0),
      icon: Target, color: 'blue',
    },
    {
      title: 'Team Sale Value',
      value: formatINR(summary?.totalSaleValue ?? 0),
      sub:   'Pipeline (all deals)',
      icon: TrendingUp, color: 'blue',
    },
    {
      title: 'Team Achieved',
      value: formatINR(summary?.totalAchieved ?? 0),
      icon: TrendingUp, color: 'green',
    },
    {
      title: 'Total Money Made',
      value: formatINR(summary?.totalMoneyMade ?? 0),
      sub:   `Commission ${formatINR(summary?.totalCommission ?? 0)} · T+2 ${formatINR(summary?.totalT2Amount ?? 0)}`,
      icon: DollarSign, color: 'purple', highlight: false,
    },
    {
      title: 'Achievement %',
      value: `${achievedPct.toFixed(1)}%`,
      sub:   gap > 0 ? `${formatINR(gap)} to go` : 'Target hit! 🎉',
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

  const slabSub = summary?.slabInfo?.eligible
    ? 'Slab eligible ✓'
    : summary?.slabInfo
      ? `₹${Math.ceil((summary.slabInfo.gapToSlab1 ?? 0) / 1000)}k to Slab 1`
      : undefined

  return (
    <div className="space-y-6">

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ══════════════════════════════════
          AGENT VIEW
      ══════════════════════════════════ */}
      {!isManager && (
        <div className="space-y-4">

          {/* ── Header with background and motivational note ── */}
          <FadeIn>
            <div
              className="relative rounded-2xl overflow-hidden mb-2"
              style={bgStyle ? { ...bgStyle, minHeight: 140 } : { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', minHeight: 140 }}
            >
              {/* Overlay */}
              <div className="absolute inset-0 bg-white/75 backdrop-blur-[2px]" />
              <div className="relative px-6 py-5 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">
                    Welcome back, {effectiveUser?.name?.split(' ')[0]} ✨
                  </h2>
                  {/* Mini stat row */}
                  {summary && (summary.totalTarget ?? 0) > 0 && (
                    <div className="flex items-center gap-4 mt-1 flex-wrap">
                      <span className="text-sm text-gray-600">Target <span className="font-bold text-gray-800">{formatINR(summary.totalTarget)}</span></span>
                      <span className="text-gray-300 text-xs">|</span>
                      <span className="text-sm text-gray-600"><span className={`font-bold ${achievedPct >= 100 ? 'text-green-600' : 'text-orange-600'}`}>{achievedPct.toFixed(0)}%</span> done</span>
                      <span className="text-gray-300 text-xs">|</span>
                      <span className="text-sm text-gray-600">Earned <span className="font-medium text-purple-600">{formatINR(summary.totalMoneyMade ?? 0)}</span></span>
                    </div>
                  )}
                  {/* Rotating motivational note */}
                  {summary && (
                    <p className="text-sm text-gray-700 mt-2 font-medium transition-all duration-500">
                      {getMotivMessages(effectiveUser?.name, summary.totalAchieved ?? 0, summary.totalTarget ?? 0, summary.wipSlabHint)[motivIdx]}
                    </p>
                  )}
                </div>
                <DaysLeftBadge month={month} />
              </div>
            </div>
          </FadeIn>

          {/* No-data / email-mismatch hint */}
          {(summary?.totalTarget ?? 0) > 0 && (summary?.totalSaleValue ?? 0) === 0 && (
            <FadeIn delay={260}>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div className="text-sm text-amber-800 space-y-2 min-w-0">
                  <p>
                    <strong>No deal data found for this period.</strong> The email in the sales sheet
                    doesn't match the profile email:{' '}
                    <span className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-xs">{effectiveUser?.email}</span>
                  </p>
                  {(summary?.suggestedEmails?.length ?? 0) > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
                      <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
                        ⚠ Email mismatch detected in sales sheet:
                      </p>
                      {summary.suggestedEmails.map(e => (
                        <div key={e} className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-mono bg-red-100 text-red-800 px-2 py-0.5 rounded">{e}</span>
                          <span className="text-red-500">→ should be →</span>
                          <span className="font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded">{effectiveUser?.email}</span>
                        </div>
                      ))}
                      <p className="text-xs text-red-600 mt-1">
                        {effectiveUser?.email !== user?.email
                          ? 'Exit "View As" and re-select this agent to reload the updated email.'
                          : 'Fix the Agent Email address in "Sales done raw dump" Google Sheet.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </FadeIn>
          )}

          {/* Eligibility banner */}
          {(summary?.totalTarget ?? 0) > 0 && (
            <FadeIn delay={280}>
              {achievedPct >= 100 ? (
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
              )}
            </FadeIn>
          )}

          {/* ── At-risk deals warning ── */}
          {(summary?.atRiskCount ?? 0) > 0 && (
            <FadeIn delay={295}>
              {(() => {
                const n = summary.atRiskCount
                const urgency = n >= 4 ? 'critical' : n >= 2 ? 'high' : 'medium'
                const cfg = {
                  critical: {
                    wrap:  'bg-red-50 border-red-300',
                    icon:  'text-red-500',
                    title: 'text-red-800',
                    body:  'text-red-700',
                    bar:   'bg-red-500',
                    badge: 'bg-red-100 text-red-700 border-red-200',
                    emoji: '🚨',
                  },
                  high: {
                    wrap:  'bg-orange-50 border-orange-300',
                    icon:  'text-orange-500',
                    title: 'text-orange-800',
                    body:  'text-orange-700',
                    bar:   'bg-orange-400',
                    badge: 'bg-orange-100 text-orange-700 border-orange-200',
                    emoji: '⚠️',
                  },
                  medium: {
                    wrap:  'bg-amber-50 border-amber-200',
                    icon:  'text-amber-500',
                    title: 'text-amber-800',
                    body:  'text-amber-700',
                    bar:   'bg-amber-400',
                    badge: 'bg-amber-100 text-amber-700 border-amber-200',
                    emoji: '⚠️',
                  },
                }[urgency]

                const messages = {
                  critical: `${n} deals are at risk — your manager will likely reassign these soon. Take action immediately.`,
                  high:     `${n} deals have been stuck for 3+ working days. Follow up now before your manager reassigns them.`,
                  medium:   `1 deal is stuck in review for 3+ days. A quick follow-up can save this sale.`,
                }

                return (
                  <div className={`rounded-xl border px-5 py-4 ${cfg.wrap}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none mt-0.5">{cfg.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className={`text-sm font-bold ${cfg.title}`}>
                            {n} deal{n !== 1 ? 's' : ''} at risk
                          </p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                            {formatINR(summary.atRiskAmount)} at stake
                          </span>
                        </div>
                        <p className={`text-xs leading-relaxed ${cfg.body}`}>
                          {messages[urgency]}
                        </p>
                        {/* Mini deal pills */}
                        <p className={`text-xs mt-2 font-medium ${cfg.body} opacity-80`}>
                          👉 Go to <strong>Deals</strong> → Work in Progress to act on these now
                        </p>
                      </div>
                      {/* Radial-ish fill indicator */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div className="relative w-11 h-11">
                          <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
                            <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                            <circle
                              cx="18" cy="18" r="15" fill="none"
                              stroke={urgency === 'critical' ? '#ef4444' : urgency === 'high' ? '#f97316' : '#f59e0b'}
                              strokeWidth="3"
                              strokeDasharray={`${Math.min(100, (n / Math.max(1, (summary?.totalDeals ?? n) + n)) * 94)} 94`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className={`absolute inset-0 flex items-center justify-center text-xs font-extrabold ${cfg.title}`}>{n}</span>
                        </div>
                        <span className={`text-[10px] font-medium ${cfg.body}`}>at risk</span>
                      </div>
                    </div>
                  </div>
                )
              })()}
            </FadeIn>
          )}

          {/* ── Incentives Breakdown — BIG (first) ── */}
          <FadeIn delay={300}>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">💰 Incentives Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                <MetricsCard
                  title="Incentives Earned"
                  value={formatINR(summary?.totalCommission ?? 0)}
                  icon={DollarSign} color="purple" sub={slabSub}
                />
                <MetricsCard
                  title="T+2 Day Incentives"
                  value={formatINR(summary?.totalT2Amount ?? 0)}
                  icon={Zap} color="blue"
                  sub="On-time payment bonus (per deal)"
                />
                <MetricsCard
                  title="Kickers Earned"
                  value={formatINR(summary?.totalKickers ?? 0)}
                  icon={Award} color="green"
                  sub="Confirmed by manager"
                />
              </div>
              {/* Total Incentives — hero row */}
              <div className="rounded-xl px-5 py-4 bg-purple-50 border-2 border-purple-200 ring-1 ring-purple-100 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-purple-500 mb-0.5">Total Incentives</p>
                  <p className="text-2xl font-semibold text-purple-700">{formatINR(summary?.totalMoneyMade ?? 0)}</p>
                  <div className="flex flex-col gap-0.5 mt-1.5">
                    <p className="text-xs text-purple-500">Commission <span className="font-semibold text-purple-700">{formatINR(summary?.totalCommission ?? 0)}</span></p>
                    <p className="text-xs text-purple-500">T+2 <span className="font-semibold text-purple-700">{formatINR(summary?.totalT2Amount ?? 0)}</span></p>
                    <p className="text-xs text-purple-500">Kickers <span className="font-semibold text-purple-700">{formatINR(summary?.totalKickers ?? 0)}</span></p>
                  </div>
                </div>
                <DollarSign size={36} className="text-purple-300 shrink-0" />
              </div>
            </div>
          </FadeIn>

          {/* WIP Pipeline Opportunity card */}
          {summary?.wipSlabHint && (
            <FadeIn delay={340}>
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">💡</span>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-purple-800 mb-1">Pipeline Opportunity</p>
                    <p className="text-sm text-purple-700">
                      {formatINR(summary.wipSlabHint.wipAmount)} in Work in Progress
                    </p>
                    {summary.wipSlabHint.neededForSlab > 0 ? (
                      <p className="text-sm text-purple-600 mt-1">
                        Convert {formatINR(summary.wipSlabHint.neededForSlab)} more → unlock {summary.wipSlabHint.slabName}
                      </p>
                    ) : (
                      <p className="text-sm text-green-600 font-semibold mt-1">
                        Your pipeline covers {summary.wipSlabHint.slabName}! 🎯
                      </p>
                    )}
                    <p className="text-xs text-purple-500 mt-1.5">
                      💰 Earn {formatINR(summary.wipSlabHint.slabPayout)} commission · 🎯 You're halfway there — one push this week!
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>
          )}

          {/* ── Recovery Snapshot — BIG (below Incentives) ── */}
          {(summary?.totalTarget ?? 0) > 0 && (
            <FadeIn delay={380}>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">📊 Performance Snapshot</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Target</p>
                    <p className="text-sm font-bold text-gray-800">{formatINR(summary.totalTarget)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Achieved</p>
                    <p className="text-sm font-bold text-green-600">{formatINR(summary.totalAchieved)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Sale Value</p>
                    <p className="text-sm font-bold text-blue-600">{formatINR(summary.totalSaleValue)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Proj %</p>
                    <p className={`text-sm font-bold ${projectedPct >= 100 ? 'text-green-600' : 'text-orange-600'}`}>{projectedPct.toFixed(0)}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 pt-3 border-t border-gray-100">
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Gap to Target</p>
                    <p className="text-sm font-bold text-orange-600">{formatINR(gap)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Days Left</p>
                    <div className="flex flex-col items-center gap-0.5">
                      <p className="text-sm font-bold text-gray-800">{workingDaysLeft(month)} <span className="text-xs font-normal text-gray-400">working</span></p>
                      <p className="text-xs text-gray-400">{calendarDaysLeft(month)} calendar</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Need/Day</p>
                    <p className="text-sm font-bold text-red-600">
                      {workingDaysLeft(month) > 0 ? formatINR(Math.ceil(gap / workingDaysLeft(month))) : '—'}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-0.5">Daily Avg (Paid)</p>
                    {(() => {
                      const [yr, mo] = month.split('-').map(Number)
                      const firstDay = new Date(yr, mo - 1, 1)
                      const now = new Date()
                      const endDate = now < new Date(yr, mo, 0) ? now : new Date(yr, mo, 0)
                      let worked = 0
                      const cur = new Date(firstDay)
                      while (cur <= endDate) { if (cur.getDay() !== 0) worked++; cur.setDate(cur.getDate() + 1) }
                      return <p className="text-sm font-bold text-gray-700">{worked > 0 ? formatINR(Math.round(summary.totalAchieved / worked)) : '—'}</p>
                    })()}
                  </div>
                </div>
              </div>
            </FadeIn>
          )}

        </div>
      )}

      {/* ══════════════════════════════════
          MANAGER VIEW
      ══════════════════════════════════ */}
      {isManager && (
        <div className="space-y-6">

          {/* ── Manager Header ── */}
          <FadeIn>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Welcome back, {effectiveUser?.name?.split(' ')[0]}
                </h2>
                <p className="text-sm text-gray-500">
                  Team overview for {month}
                </p>
              </div>
              <DaysLeftBadge month={month} />
            </div>
          </FadeIn>

          {/* ── KPI cards — staggered fade-in ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {managerCards.map((card, i) => (
              <FadeIn key={card.title} delay={i * 40}>
                <MetricsCard {...card} />
              </FadeIn>
            ))}
          </div>

          {/* ── Leaderboard ── */}
          {leaderboard.length > 0 && (
            <FadeIn delay={240}>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Team Performance — {month}</h3>
                  <span className="text-xs text-gray-400">{leaderboard.length} agent{leaderboard.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1120px] w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-3 text-left w-8 font-medium">#</th>
                        <th className="px-4 py-3 text-left font-medium">Agent</th>
                        <th className="px-4 py-3 text-right font-medium">Pipeline</th>
                        <th className="px-4 py-3 text-right font-medium">Paid</th>
                        <th className="px-4 py-3 font-medium min-w-[180px]">Slab Progress</th>
                        <th className="px-4 py-3 text-center font-medium">Eligibility</th>
                        <th className="px-4 py-3 text-right font-medium">Commission</th>
                        <th className="px-4 py-3 text-right font-medium">T+2</th>
                        <th className="px-4 py-3 text-right font-medium">Money Made</th>
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
                              {si?.presetLabel
                                ? <span className={`mt-0.5 inline-block text-xs px-1.5 py-0.5 rounded font-medium ${PRESET_COLOR[si.presetId] ?? PRESET_COLOR.pro}`}>{si.presetLabel}</span>
                                : <span className="text-xs text-gray-300">No target</span>
                              }
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
                                          !si.eligible ? 'bg-red-400' : si.nextSlab ? 'bg-blue-500' : 'bg-green-500'
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
                            <td className="px-4 py-3.5 text-right">
                              <p className="text-sm font-medium text-blue-600">{formatINR(row.totalT2Amount ?? 0)}</p>
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <p className="text-sm font-medium text-purple-700">{formatINR(row.moneyMade ?? 0)}</p>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              {row.loanDocsTotal > 0 ? (
                                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                  row.loanDocsOk === row.loanDocsTotal ? 'bg-green-50 text-green-700'
                                  : row.loanDocsOk > 0                  ? 'bg-yellow-50 text-yellow-700'
                                  :                                        'bg-gray-100 text-gray-500'
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
            </FadeIn>
          )}

          {/* Team WIP Pipeline card */}
          {summary?.teamWipAmount > 0 && (
            <FadeIn delay={300}>
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center gap-4">
                <span className="text-2xl">📊</span>
                <div>
                  <p className="text-sm font-semibold text-indigo-800">Team Pipeline in Progress</p>
                  <p className="text-sm text-indigo-700 mt-0.5">
                    {formatINR(summary.teamWipAmount)} across {summary.teamWipAgentCount ?? 'multiple'} agent{(summary.teamWipAgentCount ?? 2) !== 1 ? 's' : ''} in WIP or Almost There stages
                  </p>
                </div>
              </div>
            </FadeIn>
          )}

        </div>
      )}

    </div>
  )
}
