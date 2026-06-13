import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getTargets, getDeals, getKickers } from '../services/api'
import { useNotificationSound } from '../hooks/useNotificationSound'
import SlabDisplay from '../components/SlabDisplay'
import DaysLeftBadge from '../components/DaysLeftBadge'
import { formatINR, calculateCommission, getAchievementPct } from '../utils/commission'
import { AGENT_TARGET_PRESETS } from '../utils/targetPresets'
import { Target, Calendar, Award, Zap } from 'lucide-react'

const STATUS_COLORS = {
  Cleared:  'text-green-700 bg-green-50',
  Pending:  'text-yellow-700 bg-yellow-50',
  AtRisk:   'text-red-700 bg-red-50',
  OnHold:   'text-orange-700 bg-orange-50',
  Lost:     'text-gray-600 bg-gray-50',
}

export default function MyTargets() {
  const { effectiveUser: user } = useAuth()
  const { month } = useMonth()

  const [target, setTarget] = useState(null)
  const [deals, setDeals] = useState([])
  const [kickerEarnings, setKickerEarnings] = useState(0)
  const [kickerDetails, setKickerDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      getTargets(user?.email, month),
      getDeals(user?.email, month),
      getKickers().catch(() => []),
      getDeals().catch(() => []),
    ])
      .then(([tRes, dRes, allKickers, allDeals]) => {
        setTarget(tRes.length > 0 ? tRes[0] : null)
        setDeals(dRes ?? [])

        // Compute kicker earnings for this user
        const email      = (user?.email || '').trim().toLowerCase()
        const role       = user?.role || ''
        let totalKickers = 0
        const details    = []

        for (const k of allKickers) {
          if (!(k.targetRoles || []).includes(role)) continue
          const from = new Date(k.dateFrom).getTime()
          const to   = new Date(k.dateTo).getTime() + 86399999
          if (Date.now() < from) continue

          const inRange = allDeals.filter(d => {
            if ((d.Email || '').trim().toLowerCase() !== email) return false
            const dt = new Date(d.Timestamp || d.PaymentDate || 0).getTime()
            return dt >= from && dt <= to
          })
          const sales   = (k.minSaleValue > 0
            ? inRange.filter(d => (d.TotalValue || 0) >= k.minSaleValue)
            : inRange).length
          const revenue = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)

          const sorted = [...(k.slabs || [])].sort(
            (a, b) => Number(a.threshold || a.salesThreshold || 0) - Number(b.threshold || b.salesThreshold || 0)
          )
          let earnedSlab = null
          for (const slab of sorted) {
            let hit = false
            if      (k.type === 'team_sales'      || k.type === 'individual_sales')   hit = sales   >= Number(slab.threshold)
            else if (k.type === 'team_revenue'     || k.type === 'individual_revenue') hit = revenue >= Number(slab.threshold)
            else if (k.type === 'individual_or')   hit = sales >= Number(slab.salesThreshold) || revenue >= Number(slab.revenueThreshold)
            else if (k.type === 'individual_and')  hit = sales >= Number(slab.salesThreshold) && revenue >= Number(slab.revenueThreshold)
            if (hit) earnedSlab = slab
          }
          if (earnedSlab) {
            const payout = Number(earnedSlab.payout || 0)
            totalKickers += payout
            details.push({ title: k.title, payout, dateFrom: k.dateFrom, dateTo: k.dateTo })
          }
        }
        setKickerEarnings(totalKickers)
        setKickerDetails(details)
      })
      .catch(() => setError('Failed to load targets.'))
      .finally(() => setLoading(false))
  }, [month, user?.email, user?.role])

  // Chime when a target is present for this month (daily briefing + new assignment)
  useNotificationSound(target ? 1 : 0, { playOnMount: true })

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

  if (!target) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <Target size={40} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm">No target assigned for {month}.</p>
      </div>
    )
  }

  const clearedAmount = deals
    .filter((d) => d.PaidActual > 0)
    .reduce((s, d) => s + d.PaidActual, 0)

  const breakdownByStatus = ['Cleared', 'Pending', 'AtRisk', 'OnHold', 'Lost'].map((s) => ({
    status: s,
    amount: deals.filter((d) => d.Status === s).reduce((acc, d) => acc + (d.TotalValue || 0), 0),
    count: deals.filter((d) => d.Status === s).length,
  }))

  const commissionPct = target.CommissionPct ?? target.commissionPct ?? 0
  const commissionEarned = calculateCommission(clearedAmount, commissionPct)

  // Resolve preset label ("Pro Tier") when CommissionPct is a preset ID
  const presetMatch = AGENT_TARGET_PRESETS.find(
    p => p.id === String(commissionPct).trim().toLowerCase()
  )
  const commissionRateDisplay = presetMatch
    ? `${presetMatch.label} Tier`
    : `${commissionPct}%`

  // CommissionEndDate column is repurposed to store slabs JSON — only show it
  // as a date when it's actually a parseable date string (not JSON)
  const endDateRaw   = target.CommissionEndDate ?? target.commissionEndDate ?? ''
  const endDateIsValid = endDateRaw &&
    !String(endDateRaw).trim().startsWith('[') &&
    !isNaN(new Date(endDateRaw).getTime())
  const startDateRaw = target.CommissionStartDate ?? target.commissionStartDate

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">My Targets — {month}</h2>
        <DaysLeftBadge month={month} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-1">
            Target Amount
          </p>
          <p className="text-2xl font-bold text-brand-700">{formatINR(target.TargetAmount ?? target.targetAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-1">
            Commission Rate
          </p>
          <p className="text-2xl font-bold text-green-700">{commissionRateDisplay}</p>
          {presetMatch && (
            <p className="text-xs text-gray-400 mt-0.5">{presetMatch.description}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-2">
            <Calendar size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-1">
                Commission Period
              </p>
              {startDateRaw ? (
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(startDateRaw).toLocaleDateString('en-IN')}
                  {endDateIsValid && (
                    <> — {new Date(endDateRaw).toLocaleDateString('en-IN')}</>
                  )}
                </p>
              ) : (
                <p className="text-sm text-gray-400">Not set</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <SlabDisplay
        target={target.TargetAmount ?? target.targetAmount}
        achieved={clearedAmount}
        commission={commissionEarned}
        commissionPct={commissionPct}
      />

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Deal Breakdown</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {breakdownByStatus.map(({ status, amount, count }) => (
            <div
              key={status}
              className={`rounded-xl p-4 ${STATUS_COLORS[status] ?? 'bg-gray-50 text-gray-700'}`}
            >
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">
                {status}
              </p>
              <p className="text-lg font-bold">{formatINR(amount)}</p>
              <p className="text-xs opacity-70 mt-0.5">
                {count} deal{count !== 1 ? 's' : ''}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Kicker Earnings ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 bg-yellow-50 border-b border-yellow-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award size={15} className="text-yellow-600" />
            <p className="text-sm font-bold text-yellow-800">Kicker Earnings</p>
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${kickerEarnings > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
            {formatINR(kickerEarnings)}
          </span>
        </div>
        <div className="px-5 py-4">
          {kickerDetails.length > 0 ? (
            <div className="space-y-2">
              {kickerDetails.map((k, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{k.title}</p>
                    <p className="text-[10px] text-gray-400">{k.dateFrom} → {k.dateTo}</p>
                  </div>
                  <span className="text-sm font-bold text-yellow-700">{formatINR(k.payout)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wide">Total Kicker Earnings</p>
                <p className="text-base font-bold text-yellow-700">{formatINR(kickerEarnings)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <Zap size={16} className="text-gray-300 shrink-0" />
              <div>
                <p className="text-sm text-gray-500 font-medium">No kicker slabs hit yet</p>
                <p className="text-xs text-gray-400 mt-0.5">Kickers announced for your role will appear here once you hit a slab.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Total Money Made strip ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap text-sm text-gray-500">
          <span>Commission <span className="font-semibold text-green-700">{formatINR(commissionEarned)}</span></span>
          <span className="text-gray-300">+</span>
          <span>Kickers <span className={`font-semibold ${kickerEarnings > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{formatINR(kickerEarnings)}</span></span>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total Money Made</p>
          <p className="text-2xl font-bold text-gray-900">{formatINR(commissionEarned + kickerEarnings)}</p>
        </div>
      </div>
    </div>
  )
}
