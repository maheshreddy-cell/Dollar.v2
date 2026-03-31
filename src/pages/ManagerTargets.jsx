import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { useRefresh } from '../hooks/useRefresh'
import { getManagerTargets, calcManagerCommissionInfo, getLeaderboard } from '../services/api'
import { formatINR } from '../utils/commission'
import { TrendingUp, TrendingDown, Target, CheckCircle2, Users, Zap, Clock, AlertCircle } from 'lucide-react'

const SLAB_INDICATORS = ['①', '②', '③', '④', '⑤', '⑥']

// ── Working-day helpers ─────────────────────────────────────────────────────
function workingDaysInfo(month) {
  const [year, mon] = (month || '').split('-').map(Number)
  if (!year || !mon) return { elapsed: 0, remaining: 0, total: 0 }
  const today    = new Date()
  const firstDay = new Date(year, mon - 1, 1)
  const lastDay  = new Date(year, mon, 0)
  let elapsed = 0, remaining = 0, total = 0
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) {   // exclude Sunday
      total++
      if (d < today)       elapsed++
      else                 remaining++
    }
  }
  return { elapsed, remaining, total }
}

// ── Slab table ───────────────────────────────────────────────────────────────
function SlabTable({ slabs, teamMetric }) {
  if (!slabs.length) return (
    <p className="text-xs text-gray-400 italic py-2">No slabs configured yet.</p>
  )
  const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
  const info   = calcManagerCommissionInfo(teamMetric, sorted)

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
          {sorted.map((s, i) => {
            const isActive  = info.activeSlab === s
            const isReached = teamMetric >= Number(s.targetAmount)
            const pct       = Number(s.commissionPct)
            return (
              <tr key={i} className={`transition-colors ${isActive ? 'bg-green-50' : isReached ? 'bg-gray-50/40' : ''}`}>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-base leading-none ${isActive ? 'text-green-600' : isReached ? 'text-gray-400' : 'text-gray-300'}`}>
                      {SLAB_INDICATORS[i] ?? `S${i+1}`}
                    </span>
                    <span className={`text-xs font-semibold ${isActive ? 'text-green-700' : 'text-gray-600'}`}>Slab {i+1}</span>
                    {isActive && <span className="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>}
                  </div>
                </td>
                <td className={`py-2.5 pr-3 text-right text-xs font-semibold ${isActive ? 'text-green-700' : isReached ? 'text-gray-500' : 'text-gray-400'}`}>
                  {formatINR(Number(s.targetAmount))}
                </td>
                <td className={`py-2.5 pr-3 text-right text-xs font-bold ${isActive ? 'text-green-600' : isReached ? 'text-blue-500' : 'text-gray-400'}`}>
                  {pct}%
                </td>
                <td className={`py-2.5 text-right text-xs font-semibold ${isActive ? 'text-green-700' : 'text-gray-400'}`}>
                  {formatINR(Number(s.targetAmount) * pct / 100)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Commission summary row */}
      <div className={`mt-3 rounded-xl px-4 py-3 flex items-center justify-between border ${
        info.isPartial ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}>
        <div>
          {info.isPartial ? (
            <>
              <p className="text-xs font-semibold text-amber-700">
                Provisional · {Number(info.nextSlab?.commissionPct)}% rate (Slab 1 not yet reached)
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {formatINR(info.gapToNext)} more to be fully eligible for Slab 1
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-green-700">
                Slab {SLAB_INDICATORS[info.slabIdx]} active · {Number(info.activeSlab?.commissionPct)}% on {formatINR(teamMetric)}
              </p>
              {info.nextSlab && (
                <p className="text-xs text-green-600 mt-0.5">
                  {formatINR(info.gapToNext)} more to unlock Slab {SLAB_INDICATORS[info.slabIdx + 1]}
                </p>
              )}
            </>
          )}
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold ${info.isPartial ? 'text-amber-600' : 'text-green-700'}`}>
            {formatINR(info.commission)}
          </p>
          {info.isPartial && <p className="text-[9px] text-amber-500 uppercase tracking-wide">provisional</p>}
        </div>
      </div>
    </div>
  )
}

// ── Intelligence panel ───────────────────────────────────────────────────────
function IntelligencePanel({ slabs, teamMetric, label, color, wdInfo }) {
  if (!slabs.length) return null
  const sorted     = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
  const info       = calcManagerCommissionInfo(teamMetric, sorted)
  const { elapsed, remaining, total } = wdInfo

  const dailyRate     = elapsed > 0 ? teamMetric / elapsed : 0
  const projectedEnd  = dailyRate * total
  const borderColor   = color === 'blue' ? 'border-blue-100' : 'border-green-100'
  const bgColor       = color === 'blue' ? 'bg-blue-50/60' : 'bg-green-50/60'
  const textColor     = color === 'blue' ? 'text-blue-700' : 'text-green-700'
  const badgeBg       = color === 'blue' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4 space-y-3`}>
      <div className="flex items-center gap-2">
        <Zap size={14} className={textColor} />
        <p className={`text-xs font-bold uppercase tracking-wide ${textColor}`}>{label} — Earning Intelligence</p>
      </div>

      {/* Key pace stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-lg p-2.5 text-center">
          <Clock size={12} className="text-gray-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-gray-800">{remaining}</p>
          <p className="text-[10px] text-gray-400">days left</p>
        </div>
        <div className="bg-white rounded-lg p-2.5 text-center">
          <TrendingUp size={12} className="text-gray-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-gray-800">{formatINR(dailyRate)}</p>
          <p className="text-[10px] text-gray-400">daily rate</p>
        </div>
        <div className={`rounded-lg p-2.5 text-center ${projectedEnd >= Number(sorted[0]?.targetAmount) ? 'bg-green-100' : 'bg-amber-50'}`}>
          <Target size={12} className="text-gray-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-gray-800">{formatINR(projectedEnd)}</p>
          <p className="text-[10px] text-gray-400">at this pace</p>
        </div>
      </div>

      {/* Slab gap indicators */}
      <div className="space-y-2">
        {sorted.map((s, i) => {
          const gap        = Math.max(0, Number(s.targetAmount) - teamMetric)
          const isReached  = teamMetric >= Number(s.targetAmount)
          const dailyNeed  = remaining > 0 ? gap / remaining : Infinity
          const payout     = Number(s.targetAmount) * Number(s.commissionPct) / 100

          return (
            <div key={i} className={`rounded-lg px-3 py-2 flex items-center justify-between ${isReached ? 'bg-green-100' : 'bg-white'}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-sm ${isReached ? 'text-green-600' : 'text-gray-400'}`}>{SLAB_INDICATORS[i]}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold truncate ${isReached ? 'text-green-700' : 'text-gray-600'}`}>
                    {isReached
                      ? `✓ Slab ${i+1} reached — ${formatINR(Number(s.targetAmount))}`
                      : `Slab ${i+1}: ${formatINR(gap)} more needed`}
                  </p>
                  {!isReached && remaining > 0 && (
                    <p className="text-[10px] text-gray-400">
                      Need {formatINR(dailyNeed)}/day for {remaining} days · earns {formatINR(payout)}
                    </p>
                  )}
                  {!isReached && remaining === 0 && (
                    <p className="text-[10px] text-red-400">Month ended — slab not reached</p>
                  )}
                </div>
              </div>
              <span className={`text-xs font-bold ml-2 shrink-0 ${isReached ? 'text-green-600' : 'text-gray-400'}`}>
                {formatINR(payout)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Next slab unlock message */}
      {!info.isPartial && info.nextSlab && remaining > 0 && (
        <div className={`rounded-lg px-3 py-2 flex items-center gap-2 ${badgeBg}`}>
          <TrendingUp size={12} className={textColor} />
          <p className={`text-xs font-semibold ${textColor}`}>
            Push {formatINR(info.gapToNext)} more ({formatINR(info.gapToNext / remaining)}/day) to unlock the next slab!
          </p>
        </div>
      )}
      {info.isPartial && remaining > 0 && info.nextSlab && (
        <div className="rounded-lg px-3 py-2 flex items-center gap-2 bg-amber-100">
          <AlertCircle size={12} className="text-amber-600" />
          <p className="text-xs font-semibold text-amber-700">
            {formatINR(info.gapToNext)} more in {remaining} days ({formatINR(info.gapToNext / remaining)}/day) to become eligible
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function ManagerTargets() {
  const { effectiveUser } = useAuth()
  const { month }         = useMonth()
  const tick              = useRefresh()

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
        const sortAsc = arr => [...(arr || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
        setProjSlabs(sortAsc(latest?.projectedSlabs))
        setRealSlabs(sortAsc(latest?.realisedSlabs))
        const teamSaleValue = agents.reduce((s, a) => s + (a.totalSaleValue || 0), 0)
        const teamAchieved  = agents.reduce((s, a) => s + (a.achieved || 0), 0)
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

  const teamSaleValue = teamData?.teamSaleValue ?? 0
  const teamAchieved  = teamData?.teamAchieved  ?? 0
  const agentCount    = teamData?.agentCount    ?? 0
  const wdInfo        = workingDaysInfo(month)

  const projTarget  = projSlabs.length ? Math.max(...projSlabs.map(s => Number(s.targetAmount))) : 0
  const realTarget  = realSlabs.length ? Math.max(...realSlabs.map(s => Number(s.targetAmount))) : 0
  const projPct     = projTarget > 0 ? Math.min((teamSaleValue / projTarget) * 100, 999) : 0
  const realPct     = realTarget > 0 ? Math.min((teamAchieved  / realTarget) * 100, 999) : 0

  const projInfo    = calcManagerCommissionInfo(teamSaleValue, projSlabs)
  const realInfo    = calcManagerCommissionInfo(teamAchieved,  realSlabs)
  const totalCommission = projInfo.commission + realInfo.commission
  const totalIsPartial  = projInfo.isPartial || realInfo.isPartial

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
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
              <Clock size={14} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">{wdInfo.remaining} working days left</span>
            </div>
            <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
              <Users size={14} className="text-brand-600" />
              <span className="text-sm font-semibold text-brand-700">{agentCount} agents</span>
            </div>
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Team Sale Value</p>
            <p className="text-lg font-bold text-gray-800">{formatINR(teamSaleValue)}</p>
            <p className="text-[10px] text-gray-400">All deals (pipeline)</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Team Achieved</p>
            <p className="text-lg font-bold text-green-700">{formatINR(teamAchieved)}</p>
            <p className="text-[10px] text-gray-400">Collected revenue</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Total Commission</p>
            <p className={`text-lg font-bold ${totalIsPartial ? 'text-amber-600' : 'text-purple-700'}`}>
              {formatINR(totalCommission)}
            </p>
            <p className="text-[10px] text-gray-400">{totalIsPartial ? 'provisional estimate' : 'Projected + Realised'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Agents Active</p>
            <p className="text-lg font-bold text-blue-700">{agentCount}</p>
            <p className="text-[10px] text-gray-400">in {month}</p>
          </div>
        </div>
      </div>

      {noTargets && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">No targets assigned for {month} yet. Your VH or SalesHead will assign your Projected and Realised targets.</p>
        </div>
      )}

      {/* Two target cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Projected ── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={15} className="text-blue-600" />
              <p className="text-sm font-bold text-blue-800">Projected Targets</p>
            </div>
            <span className="text-xs text-blue-600 font-semibold">Team Sale Value based</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Highest Slab Target</p>
                <p className="text-base font-bold text-gray-800">{projTarget > 0 ? formatINR(projTarget) : <span className="text-gray-400 text-sm">Not set</span>}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Sale Value</p>
                <p className="text-base font-bold text-blue-700">{formatINR(teamSaleValue)}</p>
              </div>
            </div>
            {projTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Achievement</span>
                  <span className={`font-bold ${projPct >= 100 ? 'text-green-600' : projPct >= 75 ? 'text-orange-500' : 'text-blue-600'}`}>{projPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${projPct >= 100 ? 'bg-green-500' : projPct >= 75 ? 'bg-orange-400' : 'bg-blue-500'}`} style={{ width: `${Math.min(projPct, 100)}%` }} />
                </div>
                {projTarget > teamSaleValue && <p className="text-xs text-gray-400 mt-1.5">{formatINR(projTarget - teamSaleValue)} more pipeline to hit top slab</p>}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={projSlabs} teamMetric={teamSaleValue} />
            </div>
            {projSlabs.length > 0 && (
              <IntelligencePanel slabs={projSlabs} teamMetric={teamSaleValue} label="Projected" color="blue" wdInfo={wdInfo} />
            )}
          </div>
        </div>

        {/* ── Realised ── */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-green-50 border-b border-green-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-600" />
              <p className="text-sm font-bold text-green-800">Realised Revenue Targets</p>
            </div>
            <span className="text-xs text-green-600 font-semibold">Collected revenue based</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Highest Slab Target</p>
                <p className="text-base font-bold text-gray-800">{realTarget > 0 ? formatINR(realTarget) : <span className="text-gray-400 text-sm">Not set</span>}</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Achieved</p>
                <p className="text-base font-bold text-green-700">{formatINR(teamAchieved)}</p>
              </div>
            </div>
            {realTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Achievement</span>
                  <span className={`font-bold ${realPct >= 100 ? 'text-green-600' : realPct >= 75 ? 'text-orange-500' : 'text-green-600'}`}>{realPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${realPct >= 100 ? 'bg-green-500' : realPct >= 75 ? 'bg-orange-400' : 'bg-green-400'}`} style={{ width: `${Math.min(realPct, 100)}%` }} />
                </div>
                {realTarget > teamAchieved && <p className="text-xs text-gray-400 mt-1.5">{formatINR(realTarget - teamAchieved)} more to hit top slab</p>}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={realSlabs} teamMetric={teamAchieved} />
            </div>
            {realSlabs.length > 0 && (
              <IntelligencePanel slabs={realSlabs} teamMetric={teamAchieved} label="Realised" color="green" wdInfo={wdInfo} />
            )}
          </div>
        </div>
      </div>

      {/* Total earnings banner */}
      <div className={`border rounded-xl px-6 py-4 flex items-center justify-between ${totalIsPartial ? 'bg-amber-50 border-amber-200' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200'}`}>
        <div>
          <p className={`text-sm font-bold ${totalIsPartial ? 'text-amber-800' : 'text-purple-800'}`}>
            {totalIsPartial ? 'Estimated Commission This Month' : 'Total Commission This Month'}
          </p>
          <p className={`text-xs mt-0.5 ${totalIsPartial ? 'text-amber-600' : 'text-purple-600'}`}>
            Projected ({formatINR(projInfo.commission)}{projInfo.isPartial ? ' est.' : ''}) + Realised ({formatINR(realInfo.commission)}{realInfo.isPartial ? ' est.' : ''})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp size={20} className={totalIsPartial ? 'text-amber-500' : 'text-purple-600'} />
          <div className="text-right">
            <p className={`text-2xl font-bold ${totalIsPartial ? 'text-amber-700' : 'text-purple-800'}`}>{formatINR(totalCommission)}</p>
            {totalIsPartial && <p className="text-[9px] text-amber-500 uppercase tracking-wide">provisional — unlock slabs to confirm</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
