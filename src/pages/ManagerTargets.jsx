import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { useRefresh } from '../hooks/useRefresh'
import { getManagerTargets, calcManagerCommissionInfo, getLeaderboard, getKickers, getDeals } from '../services/api'
import { formatINR } from '../utils/commission'
import { TrendingUp, Target, CheckCircle2, Users, Zap, Clock, AlertCircle, Award } from 'lucide-react'

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
    if (d.getDay() !== 0) {
      total++
      if (d < today) elapsed++
      else           remaining++
    }
  }
  return { elapsed, remaining, total }
}

// ── Slab table with absolute progress bars ──────────────────────────────────
function SlabTable({ slabs, teamMetric, accentColor = 'blue' }) {
  if (!slabs.length) return (
    <p className="text-xs text-gray-400 italic py-2">No slabs configured yet.</p>
  )
  const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
  const info   = calcManagerCommissionInfo(teamMetric, sorted)

  const ac = {
    blue:  { bar: 'bg-blue-500',  text: 'text-blue-700',  subtxt: 'text-blue-500'  },
    green: { bar: 'bg-green-500', text: 'text-green-700', subtxt: 'text-green-500' },
  }[accentColor] ?? { bar: 'bg-blue-500', text: 'text-blue-700', subtxt: 'text-blue-500' }

  return (
    <div className="space-y-2.5">
      {sorted.map((s, i) => {
        const target    = Number(s.targetAmount)
        const pct       = Number(s.commissionPct)
        const payout    = target * pct / 100
        const isReached = teamMetric >= target
        const isActive  = info.activeSlab === s
        // ABSOLUTE progress: how far is the metric toward this slab's target
        const barPct    = target > 0 ? Math.min((teamMetric / target) * 100, 100) : 0
        const gap       = Math.max(0, target - teamMetric)

        const barClass = isReached ? 'bg-green-500' : barPct > 0 ? ac.bar : 'bg-gray-200'

        return (
          <div
            key={i}
            className={`rounded-xl border p-3 transition-all ${
              isActive
                ? 'border-green-300 bg-green-50 ring-2 ring-green-200'
                : isReached
                  ? 'border-green-200 bg-green-50/40'
                  : 'border-gray-100 bg-gray-50/60'
            }`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`text-lg leading-none font-bold ${
                  isReached ? 'text-green-500' : barPct > 40 ? ac.text : 'text-gray-300'
                }`}>
                  {SLAB_INDICATORS[i] ?? `S${i+1}`}
                </span>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-bold ${isReached ? 'text-green-700' : 'text-gray-700'}`}>
                      Slab {i + 1}
                    </span>
                    {isActive && (
                      <span className="text-[9px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">Active</span>
                    )}
                    {isReached && !isActive && (
                      <span className="text-[9px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">✓ Passed</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Target {formatINR(target)} · {pct}%
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${isReached ? 'text-green-700' : 'text-gray-500'}`}>
                  {formatINR(payout)}
                </p>
                <p className="text-[10px] text-gray-400">payout</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1">
              <div
                className={`h-full rounded-full transition-all duration-700 ${barClass}`}
                style={{ width: `${barPct}%` }}
              />
            </div>

            {/* Bar labels */}
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-gray-400">
                {formatINR(Math.min(teamMetric, target))} of {formatINR(target)}
              </p>
              <p className={`text-[10px] font-bold ${isReached ? 'text-green-600' : barPct > 0 ? ac.subtxt : 'text-gray-400'}`}>
                {barPct.toFixed(0)}%
              </p>
            </div>

            {/* Status line */}
            {isReached ? (
              <p className="text-[10px] font-semibold text-green-600">✓ Slab reached!</p>
            ) : (
              <p className={`text-[10px] font-semibold ${barPct >= 70 ? 'text-orange-500' : barPct > 0 ? ac.text : 'text-gray-400'}`}>
                {formatINR(gap)} more → unlock {formatINR(payout)} payout
              </p>
            )}
          </div>
        )
      })}

      {/* Commission footer */}
      <div className={`rounded-xl px-4 py-3 flex items-center justify-between border ${
        info.isPartial ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'
      }`}>
        <div>
          {info.isPartial ? (
            <>
              <p className="text-xs font-semibold text-amber-700">
                Provisional · {Number(info.nextSlab?.commissionPct)}% rate applied
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {formatINR(info.gapToNext)} more to lock in Slab 1
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-green-700">
                {SLAB_INDICATORS[info.slabIdx]} active · {Number(info.activeSlab?.commissionPct)}% on {formatINR(teamMetric)}
              </p>
              {info.nextSlab && (
                <p className="text-xs text-green-600 mt-0.5">
                  {formatINR(info.gapToNext)} more → unlock {SLAB_INDICATORS[info.slabIdx + 1]}
                </p>
              )}
            </>
          )}
        </div>
        <div className="text-right">
          <p className={`text-xl font-bold ${info.isPartial ? 'text-amber-600' : 'text-green-700'}`}>
            {formatINR(info.commission)}
          </p>
          {info.isPartial && (
            <p className="text-[9px] text-amber-500 uppercase tracking-wide font-semibold">provisional</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 4-box intelligence row ──────────────────────────────────────────────────
function IntelligenceRow({ projSlabs, realSlabs, teamSaleValue, teamAchieved, wdInfo, projInfo, realInfo, totalCommission, totalIsPartial }) {
  const { elapsed, remaining } = wdInfo

  const projRate     = elapsed > 0 ? teamSaleValue / elapsed : 0
  const realRate     = elapsed > 0 ? teamAchieved  / elapsed : 0
  const projNext     = projInfo.nextSlab ? Number(projInfo.nextSlab.targetAmount) : 0
  const realNext     = realInfo.nextSlab ? Number(realInfo.nextSlab.targetAmount) : 0

  const boxes = [
    {
      key: 'proj',
      icon: <Target size={15} className="text-blue-500" />,
      label: 'Projected Pace',
      bg: 'bg-blue-50 border-blue-100',
      labelColor: 'text-blue-700',
      rows: [
        { label: 'Daily rate',   value: formatINR(projRate),                  color: 'text-gray-800' },
        { label: 'Proj. month-end', value: formatINR(projRate * (elapsed + remaining)), color: projRate * (elapsed + remaining) >= projNext ? 'text-green-600' : 'text-orange-500' },
        { label: 'Commission',   value: formatINR(projInfo.commission),        color: projInfo.isPartial ? 'text-amber-600' : 'text-green-700' },
        { label: projInfo.isPartial ? 'Gap to Slab 1' : 'Gap to next slab', value: projInfo.gapToNext > 0 ? formatINR(projInfo.gapToNext) : '—', color: 'text-gray-600' },
      ],
    },
    {
      key: 'real',
      icon: <CheckCircle2 size={15} className="text-green-500" />,
      label: 'Realised Pace',
      bg: 'bg-green-50 border-green-100',
      labelColor: 'text-green-700',
      rows: [
        { label: 'Daily rate',   value: formatINR(realRate),                  color: 'text-gray-800' },
        { label: 'Proj. month-end', value: formatINR(realRate * (elapsed + remaining)), color: realRate * (elapsed + remaining) >= realNext ? 'text-green-600' : 'text-orange-500' },
        { label: 'Commission',   value: formatINR(realInfo.commission),        color: realInfo.isPartial ? 'text-amber-600' : 'text-green-700' },
        { label: realInfo.isPartial ? 'Gap to Slab 1' : 'Gap to next slab', value: realInfo.gapToNext > 0 ? formatINR(realInfo.gapToNext) : '—', color: 'text-gray-600' },
      ],
    },
    {
      key: 'total',
      icon: <TrendingUp size={15} className={totalIsPartial ? 'text-amber-500' : 'text-purple-500'} />,
      label: 'Total Commission',
      bg: totalIsPartial ? 'bg-amber-50 border-amber-100' : 'bg-purple-50 border-purple-100',
      labelColor: totalIsPartial ? 'text-amber-700' : 'text-purple-700',
      rows: [
        { label: 'Projected',    value: `${formatINR(projInfo.commission)}${projInfo.isPartial ? ' est.' : ''}`, color: projInfo.isPartial ? 'text-amber-600' : 'text-green-700' },
        { label: 'Realised',     value: `${formatINR(realInfo.commission)}${realInfo.isPartial ? ' est.' : ''}`, color: realInfo.isPartial ? 'text-amber-600' : 'text-green-700' },
        { label: 'Combined',     value: formatINR(totalCommission),            color: totalIsPartial ? 'text-amber-700 font-extrabold' : 'text-purple-700 font-extrabold' },
        { label: totalIsPartial ? 'Status' : 'Status', value: totalIsPartial ? 'provisional' : 'confirmed', color: totalIsPartial ? 'text-amber-500' : 'text-green-600' },
      ],
    },
    {
      key: 'days',
      icon: <Clock size={15} className="text-gray-500" />,
      label: 'Days & Velocity',
      bg: 'bg-gray-50 border-gray-100',
      labelColor: 'text-gray-700',
      rows: [
        { label: 'Days elapsed',  value: String(elapsed),  color: 'text-gray-800' },
        { label: 'Days left',     value: remaining > 0 ? String(remaining) : 'Month closed', color: remaining === 0 ? 'text-red-500' : remaining <= 3 ? 'text-orange-500' : 'text-gray-800' },
        { label: 'Proj need/day', value: projInfo.gapToNext > 0 && remaining > 0 ? formatINR(projInfo.gapToNext / remaining) : '—', color: 'text-blue-600' },
        { label: 'Real need/day', value: realInfo.gapToNext > 0 && remaining > 0 ? formatINR(realInfo.gapToNext / remaining) : '—', color: 'text-green-600' },
      ],
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {boxes.map(box => (
        <div key={box.key} className={`rounded-xl border p-4 ${box.bg}`}>
          <div className="flex items-center gap-1.5 mb-3">
            {box.icon}
            <p className={`text-xs font-bold uppercase tracking-wide ${box.labelColor}`}>{box.label}</p>
          </div>
          <div className="space-y-2">
            {box.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <p className="text-[10px] text-gray-400">{r.label}</p>
                <p className={`text-xs font-semibold ${r.color}`}>{r.value}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
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
  const [kickerEarnings, setKickerEarnings] = useState(0)
  const [kickerDetails, setKickerDetails]   = useState([]) // [{title, payout}]
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState('')

  useEffect(() => {
    if (!effectiveUser?.email) return
    if (tick === 0) setLoading(true)
    setError('')

    const email = effectiveUser.email
    const role  = effectiveUser.role

    Promise.all([
      getManagerTargets(email, month),
      getLeaderboard(email, month),
      getKickers().catch(() => []),
      getDeals().catch(() => []),
    ])
      .then(([targets, agents, allKickers, allDeals]) => {
        const latest = targets[0] ?? null
        setManagerTarget(latest)
        const sortAsc = arr => [...(arr || [])].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
        setProjSlabs(sortAsc(latest?.projectedSlabs))
        setRealSlabs(sortAsc(latest?.realisedSlabs))
        const teamSaleValue = agents.reduce((s, a) => s + (a.totalSaleValue || 0), 0)
        const teamAchieved  = agents.reduce((s, a) => s + (a.achieved || 0), 0)
        setTeamData({ teamSaleValue, teamAchieved, agentCount: agents.length })

        // Compute kicker earnings for this manager from active/past kickers
        const lowerEmail = email.trim().toLowerCase()
        let totalKickers = 0
        const details = []
        for (const k of allKickers) {
          if (!(k.targetRoles || []).includes(role)) continue
          const from = new Date(k.dateFrom).getTime()
          const to   = new Date(k.dateTo).getTime() + 86399999
          if (Date.now() < from) continue // not started yet

          const inRange = allDeals.filter(d => {
            if ((d.Email || '').trim().toLowerCase() !== lowerEmail) return false
            const dt = new Date(d.Timestamp || d.PaymentDate || 0).getTime()
            return dt >= from && dt <= to
          })
          const sales   = (k.minSaleValue > 0 ? inRange.filter(d => (d.TotalValue || 0) >= k.minSaleValue) : inRange).length
          const revenue = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)

          const sorted = [...(k.slabs || [])].sort((a, b) => Number(a.threshold || a.salesThreshold || 0) - Number(b.threshold || b.salesThreshold || 0))
          let earnedSlab = null
          for (const slab of sorted) {
            let hit = false
            if      (k.type === 'team_sales'       || k.type === 'individual_sales')    hit = sales   >= Number(slab.threshold)
            else if (k.type === 'team_revenue'     || k.type === 'individual_revenue')  hit = revenue >= Number(slab.threshold)
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
        setLoading(false)
      })
      .catch(() => { setError('Failed to load targets.'); setLoading(false) })
  }, [effectiveUser?.email, effectiveUser?.role, month, tick])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )
  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  )

  const teamSaleValue   = teamData?.teamSaleValue ?? 0
  const teamAchieved    = teamData?.teamAchieved  ?? 0
  const agentCount      = teamData?.agentCount    ?? 0
  const wdInfo          = workingDaysInfo(month)

  const projTarget      = projSlabs.length ? Math.max(...projSlabs.map(s => Number(s.targetAmount))) : 0
  const realTarget      = realSlabs.length ? Math.max(...realSlabs.map(s => Number(s.targetAmount))) : 0
  const projPct         = projTarget > 0 ? Math.min((teamSaleValue / projTarget) * 100, 999) : 0
  const realPct         = realTarget > 0 ? Math.min((teamAchieved  / realTarget) * 100, 999) : 0

  const projInfo        = calcManagerCommissionInfo(teamSaleValue, projSlabs)
  const realInfo        = calcManagerCommissionInfo(teamAchieved,  realSlabs)
  const totalCommission = projInfo.commission + realInfo.commission
  const totalIsPartial  = projInfo.isPartial || realInfo.isPartial

  const hasSlabs = projSlabs.length > 0 || realSlabs.length > 0

  return (
    <div className="space-y-4 max-w-5xl mx-auto">

      {/* ── Welcome header ── */}
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
            <p className="text-xs text-gray-400 mb-1">Commission</p>
            <p className={`text-lg font-bold ${totalIsPartial ? 'text-amber-600' : 'text-purple-700'}`}>
              {formatINR(totalCommission)}
            </p>
            <p className="text-[10px] text-gray-400">{totalIsPartial ? 'provisional estimate' : 'Proj + Realised'}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Kicker Earnings</p>
            <p className={`text-lg font-bold ${kickerEarnings > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{formatINR(kickerEarnings)}</p>
            <p className="text-[10px] text-gray-400">{kickerDetails.length > 0 ? `${kickerDetails.length} slab${kickerDetails.length > 1 ? 's' : ''} hit` : 'no slabs hit'}</p>
          </div>
        </div>

        {/* Total Money Made strip */}
        <div className="mt-5 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4 flex-wrap text-sm text-gray-500">
            <span>Commission <span className={`font-semibold ${totalIsPartial ? 'text-amber-600' : 'text-purple-700'}`}>{formatINR(totalCommission)}</span></span>
            <span className="text-gray-300">+</span>
            <span>Kickers <span className={`font-semibold ${kickerEarnings > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>{formatINR(kickerEarnings)}</span></span>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Total Money Made</p>
            <p className="text-2xl font-bold text-gray-900">{formatINR(totalCommission + kickerEarnings)}</p>
          </div>
        </div>
      </div>

      {/* ── No targets banner ── */}
      {!managerTarget && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertCircle size={16} className="text-amber-500 shrink-0" />
          <p className="text-sm text-amber-800">No targets assigned for {month} yet. Your VH or SalesHead will assign your Projected and Realised targets.</p>
        </div>
      )}

      {/* ── 4-box intelligence row (above slab cards) ── */}
      {hasSlabs && (
        <IntelligenceRow
          projSlabs={projSlabs}
          realSlabs={realSlabs}
          teamSaleValue={teamSaleValue}
          teamAchieved={teamAchieved}
          wdInfo={wdInfo}
          projInfo={projInfo}
          realInfo={realInfo}
          totalCommission={totalCommission}
          totalIsPartial={totalIsPartial}
        />
      )}

      {/* ── Two target cards ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Projected */}
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
                <p className="text-base font-bold text-gray-800">
                  {projTarget > 0 ? formatINR(projTarget) : <span className="text-gray-400 text-sm">Not set</span>}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Sale Value</p>
                <p className="text-base font-bold text-blue-700">{formatINR(teamSaleValue)}</p>
              </div>
            </div>
            {projTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Overall achievement</span>
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
                {projTarget > teamSaleValue && (
                  <p className="text-xs text-gray-400 mt-1.5">{formatINR(projTarget - teamSaleValue)} more pipeline to hit top slab</p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={projSlabs} teamMetric={teamSaleValue} accentColor="blue" />
            </div>
          </div>
        </div>

        {/* Realised */}
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
                <p className="text-base font-bold text-gray-800">
                  {realTarget > 0 ? formatINR(realTarget) : <span className="text-gray-400 text-sm">Not set</span>}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Team Achieved</p>
                <p className="text-base font-bold text-green-700">{formatINR(teamAchieved)}</p>
              </div>
            </div>
            {realTarget > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1.5">
                  <span>Overall achievement</span>
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
                {realTarget > teamAchieved && (
                  <p className="text-xs text-gray-400 mt-1.5">{formatINR(realTarget - teamAchieved)} more to hit top slab</p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Commission Slabs</p>
              <SlabTable slabs={realSlabs} teamMetric={teamAchieved} accentColor="green" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Kicker Earnings card ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                <p className="text-xs text-gray-400 mt-0.5">Kickers announced by your VH or SalesHead will appear here once you hit a slab.</p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
