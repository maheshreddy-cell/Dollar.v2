import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { useRefresh } from '../hooks/useRefresh'
import { getManagerTargets, calcManagerCommission, getLeaderboard } from '../services/api'
import { formatINR } from '../utils/commission'
import { TrendingUp, CheckCircle2, AlertCircle, Target, Users } from 'lucide-react'

// Label indicators for each slab level
const SLAB_INDICATORS = ['①', '②', '③', '④', '⑤', '⑥']

function SlabTable({ slabs, teamMetric, label }) {
  if (!slabs.length) {
    return (
      <div className="text-xs text-gray-400 italic py-2">
        No {label} slabs configured yet. Ask your manager to set them up in Commission Config.
      </div>
    )
  }

  // slabs: [{targetAmount, commissionPct}] sorted ascending
  const qualifying = slabs
    .filter(s => teamMetric >= Number(s.targetAmount))
    .sort((a, b) => Number(b.targetAmount) - Number(a.targetAmount))
  const activeSlab = qualifying[0] ?? null
  const commission = activeSlab ? teamMetric * Number(activeSlab.commissionPct) / 100 : 0

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
            <th className="text-left py-2 pr-3">Slab</th>
            <th className="text-right py-2 pr-3">Target</th>
            <th className="text-right py-2 pr-3">Rate</th>
            <th className="text-right py-2">Payout at target</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {slabs.map((s, i) => {
            const isActive  = activeSlab === s
            const isReached = teamMetric >= Number(s.targetAmount)
            const pct       = Number(s.commissionPct)
            const payoutAtTarget = Number(s.targetAmount) * pct / 100

            return (
              <tr key={i} className={`transition-colors ${isActive ? 'bg-green-50' : isReached ? 'bg-gray-50/50' : ''}`}>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-base leading-none ${isActive ? 'text-green-600' : isReached ? 'text-gray-400' : 'text-gray-300'}`}>
                      {SLAB_INDICATORS[i] ?? `S${i + 1}`}
                    </span>
                    <span className={`text-xs font-semibold ${isActive ? 'text-green-700' : 'text-gray-600'}`}>
                      Slab {i + 1}
                    </span>
                    {isActive && (
                      <span className="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full tracking-wide">
                        Active
                      </span>
                    )}
                  </div>
                </td>
                <td className={`py-2.5 pr-3 text-right text-xs font-semibold ${isActive ? 'text-green-700' : isReached ? 'text-gray-500' : 'text-gray-400'}`}>
                  {formatINR(Number(s.targetAmount))}
                </td>
                <td className={`py-2.5 pr-3 text-right text-xs font-bold ${isActive ? 'text-green-600' : isReached ? 'text-blue-500' : 'text-gray-400'}`}>
                  {pct}%
                </td>
                <td className={`py-2.5 text-right text-xs font-semibold ${isActive ? 'text-green-700' : 'text-gray-400'}`}>
                  {formatINR(payoutAtTarget)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Commission summary */}
      <div className={`mt-3 rounded-xl px-4 py-3 flex items-center justify-between ${
        activeSlab ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-200'
      }`}>
        <div>
          <p className={`text-xs font-semibold ${activeSlab ? 'text-green-700' : 'text-gray-500'}`}>
            {activeSlab
              ? `Slab ${slabs.indexOf(activeSlab) + 1} active · ${Number(activeSlab.commissionPct)}% on ${formatINR(teamMetric)}`
              : 'No slab reached yet'}
          </p>
          {!activeSlab && slabs[0] && (
            <p className="text-xs text-gray-400 mt-0.5">
              {formatINR(Number(slabs[0].targetAmount) - teamMetric)} more to unlock Slab 1 ({SLAB_INDICATORS[0]})
            </p>
          )}
        </div>
        <p className={`text-lg font-bold ${activeSlab ? 'text-green-700' : 'text-gray-400'}`}>
          {formatINR(commission)}
        </p>
      </div>
    </div>
  )
}

function MetricCard({ label, value, subtext, color = 'gray', pct }) {
  const colors = {
    gray:   'text-gray-800',
    green:  'text-green-700',
    blue:   'text-blue-700',
    orange: 'text-orange-600',
    purple: 'text-purple-700',
  }
  return (
    <div className="text-center">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colors[color]}`}>{value}</p>
      {pct !== undefined && (
        <p className={`text-xs font-semibold mt-0.5 ${pct >= 100 ? 'text-green-600' : pct >= 75 ? 'text-orange-500' : 'text-red-500'}`}>
          {pct.toFixed(1)}%
        </p>
      )}
      {subtext && <p className="text-xs text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  )
}

export default function ManagerTargets() {
  const { effectiveUser } = useAuth()
  const { month } = useMonth()
  const tick = useRefresh()

  const [managerTarget, setManagerTarget] = useState(null)
  const [projSlabs, setProjSlabs]         = useState([])
  const [realSlabs, setRealSlabs]         = useState([])
  const [teamData, setTeamData]           = useState(null)
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')

  useEffect(() => {
    if (!effectiveUser?.email) return
    if (tick === 0) setLoading(true)
    setError('')

    Promise.all([
      getManagerTargets(effectiveUser.email, month),
      getLeaderboard(effectiveUser.email, month),
    ])
      .then(([targets, agents]) => {
        const latest = targets[0] ?? null
        setManagerTarget(latest)
        // Slabs come from the assignment, sorted ascending by targetAmount
        const sortAsc = arr => [...(arr || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
        setProjSlabs(sortAsc(latest?.projectedSlabs))
        setRealSlabs(sortAsc(latest?.realisedSlabs))

        const teamSaleValue = agents.reduce((s, a) => s + (a.totalSaleValue || 0), 0)
        const teamAchieved  = agents.reduce((s, a) => s + (a.achieved       || 0), 0)
        setTeamData({ teamSaleValue, teamAchieved, agentCount: agents.length })
        setLoading(false)
      })
      .catch(() => { setError('Failed to load targets.'); setLoading(false) })
  }, [effectiveUser?.email, month, tick])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  )

  // Highest slab level = the "assigned target" for display
  const projTarget = projSlabs.length ? Math.max(...projSlabs.map(s => Number(s.targetAmount))) : 0
  const realTarget = realSlabs.length ? Math.max(...realSlabs.map(s => Number(s.targetAmount))) : 0
  const teamSaleValue = teamData?.teamSaleValue ?? 0
  const teamAchieved  = teamData?.teamAchieved  ?? 0
  const agentCount    = teamData?.agentCount    ?? 0

  const projPct  = projTarget > 0 ? Math.min((teamSaleValue / projTarget) * 100, 999) : 0
  const realPct  = realTarget > 0 ? Math.min((teamAchieved  / realTarget) * 100, 999) : 0

  const projCommission = calcManagerCommission(teamSaleValue, projSlabs)
  const realCommission = calcManagerCommission(teamAchieved,  realSlabs)
  const totalCommission = projCommission + realCommission

  const noTargets = !managerTarget

  return (
    <div className="space-y-5 max-w-5xl mx-auto">

      {/* Welcome header */}
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-5">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Welcome back, {effectiveUser?.name?.split(' ')[0]}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Team overview for {month}</p>
          </div>
          <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-4 py-2">
            <Users size={15} className="text-brand-600" />
            <span className="text-sm font-semibold text-brand-700">{agentCount} agents in your team</span>
          </div>
        </div>

        {/* Summary metrics row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <MetricCard label="Team Sale Value"   value={formatINR(teamSaleValue)} color="gray"   subtext="All deals (pipeline)" />
          <MetricCard label="Team Achieved"     value={formatINR(teamAchieved)}  color="green"  subtext="Collected revenue" />
          <MetricCard label="Total Commission"  value={formatINR(totalCommission)} color="purple" subtext="Projected + Realised" />
          <MetricCard label="Agents Active"     value={agentCount}               color="blue"   subtext={`in ${month}`} />
        </div>
      </div>

      {noTargets && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">
            No targets assigned for {month} yet. Your VH or SalesHead will assign your Projected and Realised targets.
          </p>
        </div>
      )}

      {/* Two target cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Projected Targets */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-blue-600" />
              <p className="text-sm font-bold text-blue-800">Projected Targets</p>
            </div>
            <span className="text-xs text-blue-600 font-semibold">Team Sale Value based</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Assigned Target</p>
                <p className="text-base font-bold text-gray-800">
                  {projTarget > 0 ? formatINR(projTarget) : <span className="text-gray-400 text-sm">Not assigned</span>}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Sale Value</p>
                <p className="text-base font-bold text-blue-700">{formatINR(teamSaleValue)}</p>
              </div>
            </div>

            {/* Progress bar */}
            {projTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Achievement</span>
                  <span className={`font-bold ${projPct >= 100 ? 'text-green-600' : projPct >= 75 ? 'text-orange-500' : 'text-blue-600'}`}>
                    {projPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${projPct >= 100 ? 'bg-green-500' : projPct >= 75 ? 'bg-orange-400' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(projPct, 100)}%` }}
                  />
                </div>
                {projPct < 100 && projTarget > teamSaleValue && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {formatINR(projTarget - teamSaleValue)} more pipeline needed to hit 100%
                  </p>
                )}
              </div>
            )}

            {/* Commission earned */}
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${projCommission > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
              <p className="text-xs font-semibold text-gray-600">Projected Commission</p>
              <p className={`text-base font-bold ${projCommission > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {formatINR(projCommission)}
              </p>
            </div>

            {/* Slab table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={projSlabs} teamMetric={teamSaleValue} label="Projected" />
            </div>
          </div>
        </div>

        {/* Realised Revenue Targets */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-green-50 border-b border-green-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600" />
              <p className="text-sm font-bold text-green-800">Realised Revenue Targets</p>
            </div>
            <span className="text-xs text-green-600 font-semibold">Collected revenue based</span>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Assigned Target</p>
                <p className="text-base font-bold text-gray-800">
                  {realTarget > 0 ? formatINR(realTarget) : <span className="text-gray-400 text-sm">Not assigned</span>}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Achieved</p>
                <p className="text-base font-bold text-green-700">{formatINR(teamAchieved)}</p>
              </div>
            </div>

            {/* Progress bar */}
            {realTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Achievement</span>
                  <span className={`font-bold ${realPct >= 100 ? 'text-green-600' : realPct >= 75 ? 'text-orange-500' : 'text-green-600'}`}>
                    {realPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${realPct >= 100 ? 'bg-green-500' : realPct >= 75 ? 'bg-orange-400' : 'bg-green-400'}`}
                    style={{ width: `${Math.min(realPct, 100)}%` }}
                  />
                </div>
                {realPct < 100 && realTarget > teamAchieved && (
                  <p className="text-xs text-gray-400 mt-1.5">
                    {formatINR(realTarget - teamAchieved)} more needed to hit 100%
                  </p>
                )}
              </div>
            )}

            {/* Commission earned */}
            <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${realCommission > 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'}`}>
              <p className="text-xs font-semibold text-gray-600">Realised Commission</p>
              <p className={`text-base font-bold ${realCommission > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                {formatINR(realCommission)}
              </p>
            </div>

            {/* Slab table */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={realSlabs} teamMetric={teamAchieved} label="Realised" />
            </div>
          </div>
        </div>
      </div>

      {/* Total earnings summary */}
      {totalCommission > 0 && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-xl px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-purple-800">Total Commission This Month</p>
            <p className="text-xs text-purple-600 mt-0.5">
              Projected ({formatINR(projCommission)}) + Realised ({formatINR(realCommission)})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp size={20} className="text-purple-600" />
            <p className="text-2xl font-bold text-purple-800">{formatINR(totalCommission)}</p>
          </div>
        </div>
      )}

      {/* Sheet setup hint (only if no slabs configured) */}
      {projSlabs.length === 0 && realSlabs.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">📋 Google Sheet Setup Guide</p>
          <p className="text-xs text-gray-500 mb-2">Create a sheet called <code className="bg-white px-1 py-0.5 rounded border border-gray-200">ManagerSlabs</code> with these columns:</p>
          <div className="font-mono text-xs text-gray-500 bg-white border border-gray-200 rounded px-3 py-2">
            Type | SlabName | MaxTarget | CommissionPct | CreatedBy
          </div>
          <p className="text-xs text-gray-400 mt-2">Type = "Projected" or "Realised". MaxTarget in ₹ (e.g. 7200000 for 72 lakhs). CommissionPct as number (e.g. 0.1 for 0.1%).</p>
        </div>
      )}
    </div>
  )
}
