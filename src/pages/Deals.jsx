import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getDealsGrouped } from '../services/api'
import { useRefresh } from '../hooks/useRefresh'
import { formatINR } from '../utils/commission'

const STAGE_GROUPS = [
  {
    key: 'PAID',
    label: 'Paid',
    color: 'green',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    barColor: 'bg-green-500',
    defaultOpen: true,
  },
  {
    key: 'PARTIALLY_PAID',
    label: 'Partially Paid',
    color: 'orange',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    barColor: 'bg-orange-400',
    defaultOpen: true,
  },
  {
    key: 'ALMOST_THERE',
    label: 'Waiting for Disbursement',
    color: 'blue',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    barColor: 'bg-blue-500',
    defaultOpen: true,
  },
  {
    key: 'WIP',
    label: 'Work in Progress',
    color: 'amber',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    barColor: 'bg-amber-400',
    defaultOpen: false,
  },
  {
    key: 'LOST',
    label: 'Lost',
    color: 'red',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    barColor: 'bg-red-400',
    defaultOpen: false,
  },
]

export default function Deals() {
  const { effectiveUser } = useAuth()
  const { month } = useMonth()
  const tick = useRefresh()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openGroups, setOpenGroups] = useState(
    Object.fromEntries(STAGE_GROUPS.map(g => [g.key, g.defaultOpen]))
  )
  const [expandedDeals, setExpandedDeals] = useState({})

  useEffect(() => {
    if (!effectiveUser?.email) return
    if (tick === 0) setLoading(true)
    setError('')
    getDealsGrouped(effectiveUser.email, month)
      .then(res => { setData(res); setLoading(false) })
      .catch(() => { setError('Failed to load deals.'); setLoading(false) })
  }, [effectiveUser?.email, month, tick])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  )

  if (!data) return null

  const achievedPct = data.tAmount > 0 ? Math.min(100, (data.achieved / data.tAmount) * 100) : 0

  return (
    <>
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-16px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        .slide-in { animation: slideInLeft 0.28s ease both; }
      `}</style>

      <div className="space-y-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">My Deals</h2>
            <p className="text-sm text-gray-500">{month} · Pipeline overview</p>
          </div>
        </div>

        {/* Slim top summary bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-6 flex-wrap text-sm mb-4">
          <span className="text-gray-500">
            Target <span className="font-semibold text-gray-800">{formatINR(data.tAmount)}</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">
            Achieved{' '}
            <span className={`font-semibold ${achievedPct >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
              {achievedPct.toFixed(0)}%
            </span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">
            Tier <span className="font-semibold text-purple-600">{data.commissionPreset || 'Custom'}</span>
          </span>
        </div>

        {/* Pipeline summary row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Total Pipeline</p>
            <p className="text-lg font-bold text-gray-800">{formatINR(data.totalPipeline)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-xs text-green-600 mb-1">✅ Paid</p>
            <p className="text-lg font-bold text-green-700">{formatINR(data.paidAmount)}</p>
            <p className="text-xs text-green-500">
              {data.totalPipeline > 0 ? ((data.paidAmount / data.totalPipeline) * 100).toFixed(0) : 0}%
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-xs text-red-500 mb-1">⚠️ At Risk</p>
            <p className="text-lg font-bold text-red-600">{formatINR(data.atRiskAmount)}</p>
            <p className="text-xs text-red-400">
              {data.atRiskAmount > 0 ? ((data.atRiskAmount / data.totalPipeline) * 100).toFixed(0) : 0}%
            </p>
          </div>
        </div>

        {/* WIP slab hint card */}
        {data.wipSlabHint && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div>
                <p className="text-sm font-semibold text-purple-800">Pipeline Opportunity</p>
                <p className="text-sm text-purple-700 mt-0.5">
                  {formatINR(data.wipSlabHint.wipAmount)} in Work in Progress
                </p>
                {data.wipSlabHint.neededForSlab > 0 ? (
                  <p className="text-sm text-purple-600 mt-0.5">
                    Convert {formatINR(data.wipSlabHint.neededForSlab)} more → unlock {data.wipSlabHint.slabName}
                  </p>
                ) : (
                  <p className="text-sm text-green-600 font-semibold mt-0.5">
                    Your pipeline can unlock {data.wipSlabHint.slabName}! 🎯
                  </p>
                )}
                <p className="text-xs text-purple-500 mt-1">
                  💰 Earn {formatINR(data.wipSlabHint.slabPayout)} commission
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stage groups */}
        {STAGE_GROUPS.map((group, idx) => {
          const groupData = data.groups[group.key] || []
          const total = data.totals[group.key] || { value: 0, count: 0 }
          const pct = data.totalPipeline > 0 ? ((total.value / data.totalPipeline) * 100).toFixed(0) : 0
          const isOpen = openGroups[group.key]

          return (
            <div
              key={group.key}
              className={`slide-in rounded-xl border ${group.border} overflow-hidden mb-3`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Group header */}
              <button
                className={`w-full flex items-center justify-between px-4 py-3.5 ${group.bg} hover:brightness-95 transition-all`}
                onClick={() => setOpenGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-semibold text-sm ${group.text}`}>{group.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${group.bg} ${group.text} border ${group.border}`}>
                    {total.count} deal{total.count !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className={`text-sm font-bold ${group.text}`}>{formatINR(total.value)}</p>
                    <p className="text-xs text-gray-400">{pct}% of pipeline</p>
                  </div>
                  <div className="w-20 h-1.5 bg-white/60 rounded-full overflow-hidden hidden sm:block">
                    <div className={`h-full rounded-full ${group.barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  {isOpen
                    ? <ChevronDown size={16} className="text-gray-400" />
                    : <ChevronRight size={16} className="text-gray-400" />}
                </div>
              </button>

              {/* Deal cards */}
              {isOpen && (
                <div className="divide-y divide-gray-100 bg-white">
                  {groupData.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No deals in this stage</p>
                  ) : (
                    groupData.map((deal, di) => {
                      const dealKey = deal.LeadName + di
                      const isExpanded = expandedDeals[dealKey]
                      return (
                        <div key={dealKey}>
                          {/* Deal row */}
                          <button
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                            onClick={() => setExpandedDeals(prev => ({ ...prev, [dealKey]: !prev[dealKey] }))}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {isExpanded
                                ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                                : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-800 truncate">{deal.LeadName || '—'}</p>
                                <p className="text-xs text-gray-400">
                                  {deal.Timestamp
                                    ? new Date(deal.Timestamp).toLocaleDateString('en-IN')
                                    : deal.PaymentDate
                                      ? new Date(deal.PaymentDate).toLocaleDateString('en-IN')
                                      : '—'}
                                </p>
                              </div>
                              {deal.isAtRisk && (
                                <span className="ml-1 flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                                  <AlertTriangle size={10} /> At Risk
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-gray-700 shrink-0 ml-2">{formatINR(deal.TotalValue || 0)}</p>
                          </button>

                          {/* Expanded deal details */}
                          {isExpanded && (
                            <div className="px-10 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/50 border-t border-gray-100">
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Lead</p>
                                <p className="text-xs font-bold text-gray-700">{deal.LeadName || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Amount</p>
                                <p className="text-xs font-bold text-gray-700">{formatINR(deal.TotalValue || 0)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Course</p>
                                <p className="text-xs font-bold text-gray-700">{deal.Course || deal.Vertical || '—'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Stage</p>
                                <p className="text-xs font-bold text-gray-700">{deal.LoanDocsCollected || '—'}</p>
                              </div>
                              {deal.isAtRisk && (
                                <div className="col-span-2 sm:col-span-4 flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
                                  <AlertTriangle size={12} className="text-red-500 shrink-0" />
                                  <p className="text-xs text-red-600">
                                    {deal.daysInStage} day{deal.daysInStage !== 1 ? 's' : ''} in '{deal.LoanDocsCollected}' — follow up needed
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
