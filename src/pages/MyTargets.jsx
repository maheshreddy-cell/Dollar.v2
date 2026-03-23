import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getTargets, getDeals } from '../services/api'
import SlabDisplay from '../components/SlabDisplay'
import DaysLeftBadge from '../components/DaysLeftBadge'
import { formatINR, calculateCommission, getAchievementPct } from '../utils/commission'
import { Target, Calendar } from 'lucide-react'

const STATUS_COLORS = {
  Cleared:  'text-green-700 bg-green-50',
  Pending:  'text-yellow-700 bg-yellow-50',
  AtRisk:   'text-red-700 bg-red-50',
  OnHold:   'text-orange-700 bg-orange-50',
  Lost:     'text-gray-600 bg-gray-50',
}

export default function MyTargets() {
  const { user } = useAuth()
  const { month } = useMonth()

  const [target, setTarget] = useState(null)
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      getTargets(user?.email, month),
      getDeals(user?.email, month),
    ])
      .then(([tRes, dRes]) => {
        setTarget(tRes.length > 0 ? tRes[0] : null)
        setDeals(dRes ?? [])
      })
      .catch(() => setError('Failed to load targets.'))
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
    .filter((d) => d.Status === 'Cleared')
    .reduce((s, d) => s + Number(d.Price), 0)

  const breakdownByStatus = ['Cleared', 'Pending', 'AtRisk', 'OnHold', 'Lost'].map((s) => ({
    status: s,
    amount: deals.filter((d) => d.Status === s).reduce((acc, d) => acc + Number(d.Price), 0),
    count: deals.filter((d) => d.Status === s).length,
  }))

  const commissionPct = target.CommissionPct ?? target.commissionPct ?? 0
  const commissionEarned = calculateCommission(clearedAmount, commissionPct)

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
          <p className="text-2xl font-bold text-green-700">{commissionPct}%</p>
          {(target.SlabName ?? target.slabName) && (
            <p className="text-xs text-gray-400 mt-0.5">Slab: {target.SlabName ?? target.slabName}</p>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-start gap-2">
            <Calendar size={16} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium tracking-wide mb-1">
                Commission Period
              </p>
              {(target.CommissionStartDate ?? target.commissionStartDate) && (target.CommissionEndDate ?? target.commissionEndDate) ? (
                <p className="text-sm font-semibold text-gray-800">
                  {new Date(target.CommissionStartDate ?? target.commissionStartDate).toLocaleDateString('en-IN')}
                  {' — '}
                  {new Date(target.CommissionEndDate ?? target.commissionEndDate).toLocaleDateString('en-IN')}
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
    </div>
  )
}
