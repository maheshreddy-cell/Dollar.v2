import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, ChevronDown, ChevronUp, Pencil } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getKickers, getDeals, getAllUsers, computeHatTrickEarnings, logHatTrickAchievement, logKickerEarning, getPreSalesSummary, PS_CALLS_SLABS, PS_SALES_SLABS } from '../services/api'
import { formatINR } from '../utils/commission'
import { useRefresh } from '../hooks/useRefresh'

// ── Hat Trick Card (permanent always-on default kicker) ───────────────────────
function HatTrickCard({ deals, agentEmail, agentName, month, tab }) {
  // computeHatTrickEarnings counts ALL deals across all time — we filter for display below
  const { byDate } = computeHatTrickEarnings(deals)

  // Today's key (IST)
  const now    = new Date()
  const istNow = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const todayKey = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,'0')}-${String(istNow.getUTCDate()).padStart(2,'0')}`
  const todayMonth = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,'0')}`

  // Filter hat trick days to the selected month only
  const viewMonth = month || todayMonth
  const monthEntries = Object.entries(byDate)
    .filter(([date, n]) => n >= 3 && date.startsWith(viewMonth))
    .sort(([a], [b]) => a.localeCompare(b))
  const days   = monthEntries.length
  const amount = days * 1000

  const todayCount = byDate[todayKey] || 0
  const todayPct   = Math.min((todayCount / 3) * 100, 100)
  const todayGap   = Math.max(3 - todayCount, 0)

  // On Past tab — hide the card entirely if no achievements this month
  if (tab === 'past' && monthEntries.length === 0) return null

  // Auto-log new hat trick achievements to Kickers sheet (dedup: track in sessionStorage)
  useEffect(() => {
    const hatTrickDays = Object.entries(byDate).filter(([, n]) => n >= 3)
    if (!hatTrickDays.length || !agentEmail) return
    const loggedKey = `ht_logged_${agentEmail}`
    let alreadyLogged = []
    try { alreadyLogged = JSON.parse(sessionStorage.getItem(loggedKey) || '[]') } catch {}
    const toLog = hatTrickDays.filter(([date]) => !alreadyLogged.includes(date))
    if (!toLog.length) return
    toLog.forEach(([date, count]) => {
      logHatTrickAchievement({
        agentEmail,
        agentName: agentName || agentEmail,
        date,
        month: todayMonth,
        dealCount: count,
      })
    })
    try {
      sessionStorage.setItem(loggedKey, JSON.stringify([...alreadyLogged, ...toLog.map(([d]) => d)]))
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(byDate), agentEmail])

  return (
    <div className="bg-white rounded-2xl border border-orange-200 shadow-sm overflow-hidden ring-2 ring-orange-100">
      {/* Gradient accent */}
      <div className="h-1.5 bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />

      <div className="px-5 py-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Approved</span>
              <span className="text-[10px] font-bold uppercase bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">🏏 Always Active</span>
              <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>
              <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">👤 Individual Sales</span>
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">All Programs</span>
            </div>
            <h3 className="text-base font-bold text-gray-900 leading-snug">🏏 Hat Trick Kicker</h3>
            <p className="text-xs text-gray-500 mt-0.5">Close 3 deals in a single day — earn ₹1,000 bonus. Every time. No limit.</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-orange-500">{formatINR(amount)}</p>
            <p className="text-[10px] text-orange-400 font-semibold">{days} hat trick{days !== 1 ? 's' : ''} this month</p>
          </div>
        </div>

        {/* Today's progress — only shown on Active tab */}
        {tab !== 'past' && (
          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-orange-700">Today's progress</p>
              <p className="text-xs font-bold text-orange-600">{todayCount} / 3 deals</p>
            </div>
            <div className="h-2.5 bg-orange-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${todayPct >= 100 ? 'bg-green-500' : 'bg-orange-400'}`}
                style={{ width: `${todayPct}%` }}
              />
            </div>
            <p className="text-[11px] text-orange-500 mt-1.5 font-medium">
              {todayPct >= 100
                ? '🎉 Hat trick unlocked today! ₹1,000 earned!'
                : todayGap === 1
                  ? '🔥 One more close today to unlock ₹1,000!'
                  : `${todayGap} more paid deal${todayGap !== 1 ? 's' : ''} today to unlock ₹1,000`
              }
            </p>
          </div>
        )}

        {/* Monthly hat trick log — filtered to selected month */}
        {monthEntries.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              Hat Trick Days — {new Date(viewMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </p>
            {monthEntries.map(([date, count]) => (
              <div key={date} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-green-700">
                  🏏 {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — {count} deals
                </span>
                <span className="text-xs font-bold text-green-600">+₹1,000</span>
              </div>
            ))}
          </div>
        )}

        {/* Rule box */}
        <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">How it works</p>
          <div className="space-y-1 text-xs text-gray-600">
            <p>→ Close <strong>3 deals</strong> on the same calendar day (any status counts)</p>
            <p>→ Earn <strong>₹1,000</strong> bonus automatically — all programs count</p>
            <p>→ Repeatable every day — no cap on hat tricks per month</p>
            <p>→ Applies to all roles: Agent, PreSales, Manager</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── PreSales Calls & Sales Card ───────────────────────────────────────────────
function PSCallsCard({ psSummary }) {
  if (!psSummary) return (
    <div className="bg-white rounded-2xl border border-teal-200 p-6 text-center text-xs text-gray-400">
      Loading calls data…
    </div>
  )

  const { callsCount, salesCount, callsEarnings, salesEarnings, totalEarnings,
          currentCallSlab, nextCallSlab, currentSalesSlab, nextSalesSlab } = psSummary

  // Calls progress bar
  const maxCallSlab    = PS_CALLS_SLABS[0]?.minCalls || 65
  const callsPct       = Math.min((callsCount / maxCallSlab) * 100, 100)
  const maxSalesSlab   = PS_SALES_SLABS[0]?.minSales || 10
  const salesPct       = Math.min((salesCount / maxSalesSlab) * 100, 100)

  return (
    <div className="bg-white rounded-2xl border border-teal-200 shadow-sm overflow-hidden ring-2 ring-teal-50">
      <div className="h-1.5 bg-gradient-to-r from-teal-400 via-cyan-400 to-blue-400" />

      <div className="px-5 py-4 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ Approved</span>
              <span className="text-[10px] font-bold uppercase bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">📞 Always Active</span>
              <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">👤 PreSales Only</span>
            </div>
            <h3 className="text-base font-bold text-gray-900 leading-snug">📞 PreSales Incentive</h3>
            <p className="text-xs text-gray-500 mt-0.5">Earn per unique call + per closed sale. Resets monthly.</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black text-teal-500">{formatINR(totalEarnings)}</p>
            <p className="text-[10px] text-teal-400 font-semibold">total earned</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-2">
          <div className="flex-1 bg-teal-50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-xl font-black text-teal-700">{callsCount}</p>
            <p className="text-[10px] text-teal-500 font-semibold">Unique Calls</p>
          </div>
          <div className="flex-1 bg-cyan-50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-xl font-black text-cyan-700">{salesCount}</p>
            <p className="text-[10px] text-cyan-500 font-semibold">Sales Closed</p>
          </div>
          <div className="flex-1 bg-blue-50 rounded-xl px-3 py-2.5 text-center">
            <p className="text-sm font-black text-blue-700">{formatINR(totalEarnings)}</p>
            <p className="text-[10px] text-blue-500 font-semibold">Earned</p>
          </div>
        </div>

        {/* Calls slab progress */}
        <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-teal-700">📞 Calls Slab Progress</p>
            <p className="text-xs font-bold text-teal-600">{callsCount} / {maxCallSlab} calls</p>
          </div>
          <div className="h-2.5 bg-teal-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${currentCallSlab ? 'bg-teal-500' : 'bg-teal-300'}`}
              style={{ width: `${callsPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-semibold ${currentCallSlab ? 'text-teal-600' : 'text-gray-400'}`}>
              {currentCallSlab ? `✅ ₹${currentCallSlab.ratePerCall}/call (${callsCount} calls = ${formatINR(callsEarnings)})` : 'No slab reached yet'}
            </span>
            {nextCallSlab && (
              <span className="text-orange-500 font-medium">
                🎯 {nextCallSlab.minCalls - callsCount} more → ₹{nextCallSlab.ratePerCall}/call
              </span>
            )}
          </div>
          {/* All call slabs */}
          <div className="space-y-1 pt-1">
            {PS_CALLS_SLABS.slice().reverse().map((s, i) => {
              const hit = callsCount >= s.minCalls
              return (
                <div key={i} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${hit ? 'bg-teal-100 text-teal-700 font-semibold' : 'bg-white text-gray-400'}`}>
                  <span>{s.minCalls}+ calls</span>
                  <span>₹{s.ratePerCall}/call {hit ? '✓' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Sales slab progress */}
        <div className="bg-cyan-50 border border-cyan-100 rounded-xl px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-cyan-700">🎯 Sales Slab Progress</p>
            <p className="text-xs font-bold text-cyan-600">{salesCount} / {maxSalesSlab} sales</p>
          </div>
          <div className="h-2.5 bg-cyan-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${currentSalesSlab ? 'bg-cyan-500' : 'bg-cyan-300'}`}
              style={{ width: `${salesPct}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={`font-semibold ${currentSalesSlab ? 'text-cyan-600' : 'text-gray-400'}`}>
              {currentSalesSlab ? `✅ ₹${formatINR(currentSalesSlab.ratePerSale)}/sale (${salesCount} sales = ${formatINR(salesEarnings)})` : 'No slab reached yet'}
            </span>
            {nextSalesSlab && (
              <span className="text-orange-500 font-medium">
                🎯 {nextSalesSlab.minSales - salesCount} more → {formatINR(nextSalesSlab.ratePerSale)}/sale
              </span>
            )}
          </div>
          {/* All sales slabs */}
          <div className="space-y-1 pt-1">
            {PS_SALES_SLABS.slice().reverse().map((s, i) => {
              const hit = salesCount >= s.minSales
              return (
                <div key={i} className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs ${hit ? 'bg-cyan-100 text-cyan-700 font-semibold' : 'bg-white text-gray-400'}`}>
                  <span>{s.minSales}+ sales</span>
                  <span>{formatINR(s.ratePerSale)}/sale {hit ? '✓' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKER_TYPES = [
  { value: 'sales',           label: '🎯 Kicker on Sales',          unit: 'sales'   },
  { value: 'revenue',         label: '💰 Kicker on Revenue',        unit: 'revenue' },
  { value: 'sales_or_revenue',label: '⚡ Sales OR Revenue',          unit: 'both'    },
  { value: 'collective',      label: '🤝 Collective Team Kicker',   unit: 'sales'   },
]

function normalizeType(t) {
  if (t === 'collective') return 'collective'
  if (t === 'sales_or_revenue') return 'sales_or_revenue'
  if (t === 'revenue' || t === 'team_revenue' || t === 'individual_revenue') return 'revenue'
  return 'sales'
}

// Roles that see all kickers (oversight view)
const OVERSIGHT_ROLES = ['Admin', 'SalesHead', 'VH']

// ── Date/time helpers ─────────────────────────────────────────────────────────
function kickerIsActive(k) {
  const now  = Date.now()
  const from = new Date(k.dateFrom).getTime()
  const to   = new Date(k.dateTo).getTime() + 86399999
  return now >= from && now <= to
}
function kickerIsPast(k) { return new Date(k.dateTo).getTime() + 86399999 < Date.now() }

function countdown(k) {
  const ms = new Date(k.dateTo).getTime() + 86399999 - Date.now()
  if (ms <= 0) return 'Ended'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  if (h < 24) return `${h}h ${m}m left`
  return `${Math.ceil(ms / 86400000)} days left`
}

// ── Progress calculation ──────────────────────────────────────────────────────
function computeProgress(kicker, allDeals, myEmail) {
  const from = new Date(kicker.dateFrom)
  const to   = new Date(kicker.dateTo); to.setHours(23, 59, 59)

  // PaymentDate is normalized to YYYY-MM-DD by parseSheetDate() — primary date source.
  // Timestamp is raw DD/MM/YYYY from Indian-locale Sheets (JS misparses as M/D/YYYY).
  // Month field is the fallback when PaymentDate is empty.
  const kickerMonth = kicker.dateFrom?.substring(0, 7)
  const inRange = allDeals.filter(d => {
    if (d.PaymentDate) {
      const dt = new Date(d.PaymentDate)
      if (!isNaN(dt.getTime())) return dt >= from && dt <= to
    }
    return kickerMonth ? d.Month === kickerMonth : false
  })

  const minVal   = kicker.minSaleValue > 0 ? kicker.minSaleValue : 0
  const rawSales = inRange.length
  const revenue  = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
  const sales    = minVal > 0
    ? inRange.filter(d => (d.TotalValue || 0) >= minVal).length
    : rawSales

  // Individual contribution — used for collective kicker display
  const myContribution = myEmail
    ? inRange.filter(d => {
        if ((d.Email || '').toLowerCase() !== myEmail.toLowerCase()) return false
        if (minVal > 0 && (d.TotalValue || 0) < minVal) return false
        return true
      }).length
    : 0

  // Per-agent contribution map — count + revenue per agent, used for contributor lists
  const contributorsMap = {}
  for (const d of inRange) {
    if (minVal > 0 && (d.TotalValue || 0) < minVal) continue
    const email = (d.Email || '').toLowerCase()
    if (email) {
      if (!contributorsMap[email]) contributorsMap[email] = { count: 0, revenue: 0 }
      contributorsMap[email].count++
      contributorsMap[email].revenue += d.TotalValue || 0
    }
  }

  const type         = normalizeType(kicker.type || 'sales')
  const isRev        = type === 'revenue'
  const isSalesOrRev = type === 'sales_or_revenue'
  const sorted = [...(kicker.slabs || [])].sort((a, b) => {
    const at = Number(a.threshold || a.salesThreshold || a.revenueThreshold || 0)
    const bt = Number(b.threshold || b.salesThreshold || b.revenueThreshold || 0)
    return at - bt
  })

  let activeSlab = null
  let nextSlab   = null

  for (const slab of sorted) {
    let hit
    if (isSalesOrRev) {
      const tS = Number(slab.salesThreshold || 0)
      const tR = Number(slab.revenueThreshold || 0)
      const op = slab.operator === 'AND' ? 'AND' : 'OR'
      hit = op === 'AND'
        ? (tS > 0 ? sales >= tS : true) && (tR > 0 ? revenue >= tR : true)
        : (tS > 0 && sales >= tS) || (tR > 0 && revenue >= tR)
    } else {
      const t = Number(slab.threshold || (isRev ? slab.revenueThreshold : slab.salesThreshold) || 0)
      hit = isRev ? revenue >= t : sales >= t
    }
    if (hit) activeSlab = slab
    else if (!nextSlab) nextSlab = slab
  }

  return { sales, revenue, activeSlab, nextSlab, sorted, myContribution, contributorsMap, isSalesOrRev }
}

// ── Slab label formatter ──────────────────────────────────────────────────────
function slabLabel(slab, type) {
  const t = normalizeType(type)
  if (t === 'sales_or_revenue') {
    const tS = Number(slab.salesThreshold || 0)
    const tR = Number(slab.revenueThreshold || 0)
    const op = slab.operator === 'AND' ? 'AND' : 'OR'
    return `${tS} sale${tS !== 1 ? 's' : ''} ${op} ${formatINR(tR)} → ${formatINR(Number(slab.payout))}`
  }
  const threshold = Number(slab.threshold || (t === 'revenue' ? slab.revenueThreshold : slab.salesThreshold) || 0)
  if (t === 'revenue') return `${formatINR(threshold)} revenue → ${formatINR(Number(slab.payout))}`
  return `${threshold} sales → ${formatINR(Number(slab.payout))}`
}

function slabBarPct(slab, type, progress) {
  const t = normalizeType(type)
  if (t === 'sales_or_revenue') {
    const tS = Number(slab.salesThreshold || 1)
    const tR = Number(slab.revenueThreshold || 1)
    return Math.max(
      Math.min((progress.sales   / Math.max(tS, 1)) * 100, 100),
      Math.min((progress.revenue / Math.max(tR, 1)) * 100, 100),
    )
  }
  const threshold = Number(slab.threshold || (t === 'revenue' ? slab.revenueThreshold : slab.salesThreshold) || 1)
  if (t === 'revenue') return Math.min((progress.revenue / Math.max(threshold, 1)) * 100, 100)
  return Math.min((progress.sales / Math.max(threshold, 1)) * 100, 100)
}

function nudgeText(slab, type, progress) {
  const t = normalizeType(type)
  if (t === 'sales_or_revenue') {
    const tS = Number(slab.salesThreshold || 0)
    const tR = Number(slab.revenueThreshold || 0)
    const op = slab.operator === 'AND' ? 'AND' : 'OR'
    const gapS = tS > 0 ? tS - progress.sales   : 0
    const gapR = tR > 0 ? tR - progress.revenue : 0
    if (op === 'AND') {
      const parts = []
      if (gapS > 0) parts.push(`${gapS} more sale${gapS > 1 ? 's' : ''}`)
      if (gapR > 0) parts.push(`${formatINR(gapR)} more revenue`)
      if (!parts.length) return null
      return `Need ${parts.join(' AND ')} to unlock ${formatINR(Number(slab.payout))}`
    }
    if (gapS <= 0 || gapR <= 0) return null
    const pctS = tS > 0 ? progress.sales   / tS : 0
    const pctR = tR > 0 ? progress.revenue / tR : 0
    if (pctS >= pctR)
      return `${gapS} more sale${gapS > 1 ? 's' : ''} to unlock ${formatINR(Number(slab.payout))}`
    return `${formatINR(gapR)} more revenue to unlock ${formatINR(Number(slab.payout))}`
  }
  if (t === 'revenue') {
    const gap = Number(slab.threshold || slab.revenueThreshold || 0) - progress.revenue
    return gap > 0 ? `${formatINR(gap)} more revenue to unlock ${formatINR(Number(slab.payout))}` : null
  }
  const gap = Number(slab.threshold || slab.salesThreshold || 0) - progress.sales
  return gap > 0 ? `${gap} more sale${gap > 1 ? 's' : ''} to unlock ${formatINR(Number(slab.payout))}` : null
}

// ── KickerCard (view-only) ────────────────────────────────────────────────────
function KickerCard({ kicker, deals, agentEmail, agentName, isManagerViewer, isOversight, teamMap }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  // Auto-expand for manager kickers in oversight so team stats are immediately visible
  const isInitiallyExpanded = isOversight &&
    (kicker.targetRoles || []).includes('Manager') &&
    !(kicker.targetRoles || []).includes('Agent') &&
    !(kicker.targetRoles || []).includes('PreSales')
  const [showContributors, setShowContributors] = useState(isInitiallyExpanded)

  const active    = kickerIsActive(kicker)
  const past      = kickerIsPast(kicker)
  const origType  = kicker.type || 'sales'
  const type      = normalizeType(origType)

  // IC kicker = targets Agent or PreSales. For these, dealsFor() passes ALL deals
  // so we can build the earners list. We filter to own email for personal progress.
  const isICKicker = (kicker.targetRoles || []).some(r => r === 'Agent' || r === 'PreSales')
  const myOnlyDeals = (isICKicker && !isOversight && agentEmail)
    ? deals.filter(d => (d.Email || '').toLowerCase() === agentEmail.toLowerCase())
    : null

  // Personal progress — uses own-deals-only for IC kicker viewers, all deals for oversight.
  // Collective kickers always use all deals so the full contributors map is visible to every agent.
  let progress = computeProgress(kicker, (type === 'collective' ? deals : (myOnlyDeals ?? deals)), type === 'collective' ? agentEmail : undefined)

  // Individual payout override — admin can set a custom amount for a specific
  // person, taking precedence over the slab-derived payout once applied.
  if (type !== 'collective' && !origType.startsWith('team_')) {
    const override = (kicker.individualAmounts || {})[(agentEmail || '').toLowerCase()]
    if (override != null) {
      progress = { ...progress, activeSlab: { ...(progress.activeSlab || {}), payout: override } }
    }
  }

  // Auto-log when a kicker slab is earned — fires once per kicker+slab combo per session
  useEffect(() => {
    if (!progress.activeSlab || !agentEmail) return
    // Collective: only log if this agent actually contributed — no contribution = no earning
    if (type === 'collective' && !(progress.myContribution > 0)) return
    const now     = new Date()
    const istNow  = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    const today   = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,'0')}-${String(istNow.getUTCDate()).padStart(2,'0')}`
    const month   = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth()+1).padStart(2,'0')}`
    const dedupKey = `kicker_logged_${agentEmail}_${kicker.id}_${progress.activeSlab.payout}`
    try { if (sessionStorage.getItem(dedupKey)) return } catch {}
    logKickerEarning({
      agentEmail,
      agentName: agentName || agentEmail,
      date:       today,
      month,
      kickerType: kicker.title || type,
      details:    `Slab hit: ${slabLabel(progress.activeSlab, origType)} | ${isTeam ? 'Team' : 'Individual'} kicker`,
      amount:     (type === 'collective'
        ? (collectivePerAgent
            ? Number(progress.activeSlab.payout)
            : progress.myContribution * Number(progress.activeSlab.payout))
        : Number(progress.activeSlab.payout)) || 0,
    })
    try { sessionStorage.setItem(dedupKey, '1') } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.activeSlab?.payout, agentEmail, kicker.id])
  const typeInfo     = KICKER_TYPES.find(t => t.value === type) ?? KICKER_TYPES[0]
  const isSales      = type === 'sales'
  const isRev        = type === 'revenue'
  const isSalesOrRev = type === 'sales_or_revenue'
  const isCollective = type === 'collective'
  const isTeam       = origType.startsWith('team_')

  // Sorted contributors list for collective kickers
  const collectivePerAgent = isCollective && kicker.collectiveMode === 'per_agent'
  const contributors = isCollective
    ? Object.entries(progress.contributorsMap || {}).map(([email, { count }]) => {
        const earns = !!(progress.activeSlab && count > 0)
        const payout = earns
          ? (collectivePerAgent ? Number(progress.activeSlab.payout) : count * Number(progress.activeSlab.payout))
          : 0
        const displayName = email.split('@')[0].split(/[._-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
        return { email, count, earns, payout, displayName }
      }).sort((a, b) => b.payout - a.payout || b.count - a.count)
    : []

  // Per-agent earners list — oversight OR any viewer of an IC kicker.
  // For IC kicker non-oversight: contributorsMap is built from all deals (passed by dealsFor).
  // For oversight: same, since dealsFor already returns all deals.
  // We use progress.contributorsMap directly — it's always computed from the full deal set
  // because myOnlyDeals is only used for the personal stats box above.
  const allDealsProgress = myOnlyDeals
    ? computeProgress(kicker, deals, undefined)
    : null
  const earnerContributorsMap = (allDealsProgress || progress).contributorsMap

  const agentEarners = ((isOversight || isICKicker) && !isCollective)
    ? Object.entries(earnerContributorsMap || {}).map(([email, { count, revenue }]) => {
        const displayName = email.split('@')[0].split(/[._-]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
        let hitSlab = null
        for (const slab of progress.sorted) {
          let slabHit
          if (isSalesOrRev) {
            const tS = Number(slab.salesThreshold || 0)
            const tR = Number(slab.revenueThreshold || 0)
            const op = slab.operator === 'AND' ? 'AND' : 'OR'
            slabHit = op === 'AND'
              ? (tS > 0 ? count >= tS : true) && (tR > 0 ? revenue >= tR : true)
              : (tS > 0 && count >= tS) || (tR > 0 && revenue >= tR)
          } else {
            const t = Number(slab.threshold || (isRev ? slab.revenueThreshold : slab.salesThreshold) || 0)
            slabHit = isRev ? revenue >= t : count >= t
          }
          if (slabHit) hitSlab = slab
        }
        const override = (kicker.individualAmounts || {})[email]
        const payout = override != null ? Number(override) : (hitSlab ? Number(hitSlab.payout) : 0)
        return { email, displayName, count, revenue, payout, hit: !!hitSlab || override != null }
      }).sort((a, b) => b.payout - a.payout || b.revenue - a.revenue || b.count - a.count)
    : []

  // Manager kicker earners — group deals by d.Team (column AA) → map to manager
  // Used by oversight viewers so each manager row shows their TEAM's combined sales
  const isManagerKicker = !isICKicker && !isCollective &&
    (kicker.targetRoles || []).includes('Manager') &&
    !(kicker.targetRoles || []).includes('Agent') &&
    !(kicker.targetRoles || []).includes('PreSales')

  const managerEarners = (isOversight && isManagerKicker && teamMap && Object.keys(teamMap).length > 0)
    ? (() => {
        const from        = new Date(kicker.dateFrom)
        const to          = new Date(kicker.dateTo); to.setHours(23, 59, 59)
        const minVal      = Number(kicker.minSaleValue || 0)
        const targetTeams = kicker.targetTeams || ['ALL']
        const allTeams    = targetTeams.includes('ALL')
        const targetSet   = new Set(targetTeams.map(e => e.toLowerCase()))
        const byMgr  = {}
        for (const d of deals) {
          if (d.PaymentDate) {
            const dt = new Date(d.PaymentDate)
            if (isNaN(dt) || dt < from || dt > to) continue
          } else if (d.Month) {
            const km = kicker.dateFrom?.substring(0, 7)
            if (!km || d.Month !== km) continue
          } else continue
          if (minVal > 0 && (d.TotalValue || 0) < minVal) continue
          const teamName = (d.Team || '').trim().toLowerCase()
          const mgr = teamMap[teamName]
          if (!mgr) continue
          // Only include managers explicitly targeted by this kicker
          if (!allTeams && !targetSet.has(mgr.email)) continue
          if (!byMgr[mgr.email]) byMgr[mgr.email] = { email: mgr.email, displayName: mgr.name, count: 0, revenue: 0 }
          byMgr[mgr.email].count++
          byMgr[mgr.email].revenue += d.TotalValue || 0
        }
        return Object.values(byMgr).map(m => {
          let hitSlab = null
          for (const slab of progress.sorted) {
            const t = Number(slab.threshold || (isRev ? slab.revenueThreshold : slab.salesThreshold) || 0)
            if (isRev ? m.revenue >= t : m.count >= t) hitSlab = slab
          }
          const override = (kicker.individualAmounts || {})[m.email]
          const payout = override != null ? Number(override) : (hitSlab ? Number(hitSlab.payout) : 0)
          return { ...m, payout, hit: !!hitSlab || override != null }
        }).sort((a, b) => b.payout - a.payout || b.revenue - a.revenue || b.count - a.count)
      })()
    : null

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      kicker.pinned ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-200'
    }`}>
      {/* Top accent */}
      <div className={`h-1.5 ${past ? 'bg-gray-300' : 'bg-gradient-to-r from-brand-500 via-purple-500 to-pink-400'}`} />

      <div className="px-5 py-4 space-y-3">
        {/* Header row */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              kicker.status === 'Paid' ? 'bg-green-100 text-green-700' :
              kicker.status === 'Approved' ? 'bg-indigo-100 text-indigo-700' :
              'bg-amber-100 text-amber-700'
            }`}>
              {kicker.status === 'Paid' ? '💰 Paid' : kicker.status === 'Approved' ? '✓ Approved' : '⏳ Pending Approval'}
            </span>
            {kicker.pinned && <span className="text-[10px] font-bold uppercase bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">📌 Pinned</span>}
            {active && !past && <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>}
            {past && <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Ended</span>}
            <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">{typeInfo?.label}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-gray-900 leading-snug">{kicker.title}</h3>
            {isOversight && (
              <button
                onClick={() => navigate('/announce-kicker', { state: { editKicker: kicker } })}
                className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                title="Edit kicker"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-xs text-gray-400">
            <span>📅 {kicker.dateFrom} → {kicker.dateTo}</span>
            {!past && <span className={`font-semibold ${countdown(kicker).includes('h') ? 'text-orange-500' : 'text-gray-500'}`}>⏱ {countdown(kicker)}</span>}
            <span>By {kicker.announcedBy} ({kicker.announcedByRole})</span>
          </div>

          {/* Target chips */}
          <div className="flex flex-wrap gap-1 mt-2">
            {(kicker.targetRoles || []).map(r => (
              <span key={r} className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">{r}</span>
            ))}
            {(kicker.targetTeams || []).includes('ALL')
              ? <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">All Teams</span>
              : <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{(kicker.targetTeams || []).length} team(s)</span>
            }
            {kicker.minSaleValue > 0 && (
              <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">Min sale {formatINR(kicker.minSaleValue)}</span>
            )}
          </div>
        </div>

        {/* Message toggle */}
        {kicker.message && (
          <div>
            <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-800 font-medium">
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? 'Hide announcement' : 'View full announcement'}
            </button>
            {expanded && (
              <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">
                {kicker.message}
              </div>
            )}
          </div>
        )}

        {/* Progress stats — show for both active and past */}
        {(active || past) && (
          <>
            {isCollective ? (
              /* Collective: show team total + my contribution */
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-blue-50 border border-blue-100">
                    <p className="text-xl font-black text-blue-700">{progress.sales}</p>
                    <p className="text-[10px] text-blue-500 font-semibold">Team Total Sales</p>
                  </div>
                  <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-indigo-50 border border-indigo-100">
                    <p className="text-xl font-black text-indigo-700">{progress.myContribution}</p>
                    <p className="text-[10px] text-indigo-500 font-semibold">Your Contribution</p>
                  </div>
                  {progress.activeSlab && progress.myContribution > 0 ? (
                    <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-green-50 border border-green-200">
                      <p className="text-sm font-black text-green-700">{formatINR(collectivePerAgent ? Number(progress.activeSlab.payout) : progress.myContribution * Number(progress.activeSlab.payout))}</p>
                      <p className="text-[10px] text-green-600 font-semibold">🎉 You Earn!</p>
                    </div>
                  ) : progress.activeSlab && progress.myContribution === 0 ? (
                    <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-red-50 border border-red-200">
                      <p className="text-sm font-black text-red-400">₹0</p>
                      <p className="text-[10px] text-red-500 font-semibold">No Contribution</p>
                    </div>
                  ) : (
                    <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-gray-50 border border-gray-100">
                      <p className="text-sm font-black text-gray-400">—</p>
                      <p className="text-[10px] text-gray-400 font-semibold">Team not there yet</p>
                    </div>
                  )}
                </div>
                {progress.myContribution === 0 && progress.activeSlab && (
                  <p className="text-[11px] text-red-600 font-semibold bg-red-50 rounded-lg px-3 py-2">
                    ❌ Team hit the target but you didn't contribute — no payout for you this time.
                  </p>
                )}
                {progress.myContribution === 0 && !progress.activeSlab && active && (
                  <p className="text-[11px] text-amber-600 font-semibold bg-amber-50 rounded-lg px-3 py-2">
                    ⚡ Make a sale to become a contributor — team earnings count only if you contributed!
                  </p>
                )}
                {progress.myContribution > 0 && progress.activeSlab && (
                  <p className="text-[11px] text-green-700 font-semibold bg-green-50 rounded-lg px-3 py-2">
                    {collectivePerAgent
                      ? `🎉 Team hit the target! You contributed ${progress.myContribution} sale${progress.myContribution !== 1 ? 's' : ''} — you earn ${formatINR(Number(progress.activeSlab.payout))} as a contributor.`
                      : `🎉 Team hit the target! You contributed ${progress.myContribution} sale${progress.myContribution !== 1 ? 's' : ''} × ${formatINR(Number(progress.activeSlab.payout))}/sale = ${formatINR(progress.myContribution * Number(progress.activeSlab.payout))} is yours.`
                    }
                  </p>
                )}
                {/* Contributors toggle */}
                {contributors.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowContributors(v => !v)}
                      className="flex items-center justify-between w-full text-xs text-brand-600 hover:text-brand-800 font-semibold mt-1"
                    >
                      <span>👥 {contributors.length} contributor{contributors.length !== 1 ? 's' : ''}{progress.activeSlab ? (collectivePerAgent ? ` — ${formatINR(Number(progress.activeSlab.payout))}/agent` : ` — ${formatINR(Number(progress.activeSlab.payout))}/sale`) : ''}</span>
                      {showContributors ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {showContributors && (
                      <div className="mt-2 space-y-1">
                        {contributors.map((c, i) => (
                          <div key={c.email} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                            c.earns ? 'bg-green-50 border border-green-100' : 'bg-gray-50 border border-gray-100'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-400 font-mono w-4 text-right">{i + 1}</span>
                              <span className={`font-semibold ${c.earns ? 'text-green-700' : 'text-gray-600'}`}>{c.displayName}</span>
                              <span className="text-gray-400">{c.count} sale{c.count !== 1 ? 's' : ''}</span>
                            </div>
                            <span className={`font-bold ${c.earns ? 'text-green-700' : 'text-gray-400'}`}>
                              {c.earns ? formatINR(c.payout) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Individual / manager / revenue */
              <div className="space-y-2">
                <div className="flex gap-2">
                  {isManagerViewer ? (
                    /* Manager view: always show both team sales count + team revenue */
                    <>
                      <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-indigo-50 border border-indigo-100">
                        <p className="text-xl font-black text-indigo-700">{progress.sales}</p>
                        <p className="text-[10px] text-indigo-500 font-semibold">Team Sales</p>
                      </div>
                      <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-teal-50 border border-teal-100">
                        <p className="text-sm font-black text-teal-700">{formatINR(progress.revenue)}</p>
                        <p className="text-[10px] text-teal-500 font-semibold">Team Revenue</p>
                      </div>
                      {progress.activeSlab ? (
                        <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-green-50 border border-green-200">
                          <p className="text-sm font-black text-green-700">{formatINR(Number(progress.activeSlab.payout))}</p>
                          <p className="text-[10px] text-green-600 font-semibold">🎉 {past ? 'Earned' : 'Earned!'}</p>
                        </div>
                      ) : (
                        <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-gray-50 border border-gray-100">
                          <p className="text-sm font-black text-gray-400">—</p>
                          <p className="text-[10px] text-gray-400 font-semibold">{past ? 'Not Hit' : 'Not Yet'}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {isOversight && managerEarners ? (
                        /* Oversight on manager kicker: show aggregate team sales + revenue + slab hits */
                        <>
                          <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-indigo-50 border border-indigo-100">
                            <p className="text-xl font-black text-indigo-700">{managerEarners.reduce((s, a) => s + a.count, 0)}</p>
                            <p className="text-[10px] text-indigo-500 font-semibold">Team Sales</p>
                          </div>
                          <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-teal-50 border border-teal-100">
                            <p className="text-sm font-black text-teal-700">{formatINR(managerEarners.reduce((s, a) => s + a.revenue, 0))}</p>
                            <p className="text-[10px] text-teal-500 font-semibold">Team Revenue</p>
                          </div>
                          <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-green-50 border border-green-200">
                            <p className="text-xl font-black text-green-700">{managerEarners.filter(a => a.hit).length}</p>
                            <p className="text-[10px] text-green-600 font-semibold">Slab Hit</p>
                          </div>
                          <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-purple-50 border border-purple-100">
                            <p className="text-sm font-black text-purple-700">{formatINR(managerEarners.reduce((s, a) => s + a.payout, 0))}</p>
                            <p className="text-[10px] text-purple-500 font-semibold">Total Payout</p>
                          </div>
                        </>
                      ) : (
                        <>
                          {(isSales || isTeam || isSalesOrRev) && (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-indigo-50 border border-indigo-100">
                              <p className="text-xl font-black text-indigo-700">{isOversight ? agentEarners.length : progress.sales}</p>
                              <p className="text-[10px] text-indigo-500 font-semibold">{isOversight ? 'Active' : 'Your'}{isOversight ? '' : ' Sales'}</p>
                            </div>
                          )}
                          {(isRev || isSalesOrRev) && !isOversight && (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-teal-50 border border-teal-100">
                              <p className="text-sm font-black text-teal-700">{formatINR(progress.revenue)}</p>
                              <p className="text-[10px] text-teal-500 font-semibold">Your Revenue</p>
                            </div>
                          )}
                          {isOversight ? (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-green-50 border border-green-200">
                              <p className="text-xl font-black text-green-700">{agentEarners.filter(a => a.hit).length}</p>
                              <p className="text-[10px] text-green-600 font-semibold">Slab Hit</p>
                            </div>
                          ) : progress.activeSlab ? (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-green-50 border border-green-200">
                              <p className="text-sm font-black text-green-700">{formatINR(Number(progress.activeSlab.payout))}</p>
                              <p className="text-[10px] text-green-600 font-semibold">🎉 {past ? 'Earned' : 'Earned!'}</p>
                            </div>
                          ) : (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-gray-50 border border-gray-100">
                              <p className="text-sm font-black text-gray-400">—</p>
                              <p className="text-[10px] text-gray-400 font-semibold">{past ? 'Not Hit' : 'Not Yet'}</p>
                            </div>
                          )}
                          {isOversight && (
                            <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-purple-50 border border-purple-100">
                              <p className="text-sm font-black text-purple-700">{formatINR(agentEarners.reduce((s, a) => s + a.payout, 0))}</p>
                              <p className="text-[10px] text-purple-500 font-semibold">Total Payout</p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

                {/* Earners list — manager kickers show per-manager team totals; IC kickers show per-agent */}
                {(() => {
                  const earners = managerEarners ?? (((isOversight || isICKicker) && agentEarners.length > 0) ? agentEarners : null)
                  if (!earners || earners.length === 0) return null
                  const isTeamList = !!managerEarners
                  const earnedCount = earners.filter(a => a.hit).length
                  return (
                    <div>
                      <button
                        onClick={() => setShowContributors(v => !v)}
                        className="flex items-center justify-between w-full text-xs text-brand-600 hover:text-brand-800 font-semibold mt-1"
                      >
                        <span>
                          {isTeamList
                            ? `👥 ${earners.length} manager${earners.length !== 1 ? 's' : ''} · ${earnedCount} earned`
                            : isOversight
                              ? `👥 ${earners.length} agent${earners.length !== 1 ? 's' : ''} · ${earnedCount} earned`
                              : `🏆 ${earnedCount} agent${earnedCount !== 1 ? 's' : ''} earned this kicker`
                          }
                        </span>
                        {showContributors ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                      {showContributors && (
                        <div className="mt-2 space-y-1">
                          {earners.filter(a => isOversight || isTeamList || a.hit).map((a, i) => (
                            <div key={a.email} className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs ${
                              a.hit
                                ? 'bg-green-50 border border-green-100'
                                : isTeamList
                                  ? 'bg-red-50 border border-red-100'
                                  : 'bg-gray-50 border border-gray-100'
                            }`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-gray-400 font-mono w-4 text-right shrink-0">{i + 1}</span>
                                <span className={`font-semibold ${a.hit ? 'text-green-700' : isTeamList ? 'text-red-600' : 'text-gray-600'}`}>{a.displayName}</span>
                                {isTeamList ? (
                                  <span className={a.hit ? 'text-green-600' : 'text-red-400'}>{a.count} deal{a.count !== 1 ? 's' : ''} · {formatINR(a.revenue)}</span>
                                ) : isSalesOrRev ? (
                                  <span className="text-gray-400">{a.count} sale{a.count !== 1 ? 's' : ''} · {formatINR(a.revenue)}</span>
                                ) : (
                                  <span className="text-gray-400">
                                    {isRev ? formatINR(a.revenue) : `${a.count} sale${a.count !== 1 ? 's' : ''}`}
                                  </span>
                                )}
                              </div>
                              <span className={`font-bold shrink-0 ${a.hit ? 'text-green-700' : isTeamList ? 'text-red-400' : 'text-gray-400'}`}>
                                {a.hit ? formatINR(a.payout) : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}
          </>
        )}

        {/* Slab summary */}
        {progress.sorted.length > 0 && (
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Reward Tiers</p>
            <div className="space-y-1">
              {progress.sorted.map((slab, i) => {
                const payout = Number(slab.payout)
                const hit = progress.activeSlab
                  ? progress.sorted.indexOf(progress.activeSlab) >= i
                  : false
                let label
                if (isSalesOrRev) {
                  const tS = Number(slab.salesThreshold || 0)
                  const tR = Number(slab.revenueThreshold || 0)
                  const op = slab.operator === 'AND' ? 'AND' : 'OR'
                  label = `${tS} sale${tS !== 1 ? 's' : ''} ${op} ${formatINR(tR)}`
                } else {
                  const t = Number(slab.threshold || (isRev ? slab.revenueThreshold : slab.salesThreshold) || 0)
                  label = isRev ? formatINR(t) : `${t} sale${t !== 1 ? 's' : ''}`
                }
                return (
                  <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-3 py-1.5 ${
                    hit ? 'bg-green-100 text-green-700 font-semibold' : 'text-gray-500'
                  }`}>
                    <span>{label}</span>
                    <span className={`font-bold ${hit ? 'text-green-700' : 'text-gray-700'}`}>
                      {hit ? '✓ ' : ''}{formatINR(payout)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Kickers() {
  const { user, effectiveUser } = useAuth()
  const { month, setMonth } = useMonth()
  const tick = useRefresh()

  const [kickers,      setKickers]      = useState([])
  const [deals,        setDeals]        = useState([])
  const [users,        setUsers]        = useState([])
  const [psSummary,    setPsSummary]    = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [roleFilter,   setRoleFilter]   = useState('All')   // 'All' | 'Agents' | 'Managers' | 'VHs'
  const [statusFilter, setStatusFilter] = useState('All')   // oversight only

  const isManager      = effectiveUser?.role === 'Manager'
  const isPreSales     = effectiveUser?.role === 'PreSales'
  const isOversight    = OVERSIGHT_ROLES.includes(effectiveUser?.role) && effectiveUser?.email === user?.email
  // Full oversight = Admin or SalesHead (see ALL kickers with no filtering)
  const isFullOversight = (effectiveUser?.role === 'Admin' || effectiveUser?.role === 'SalesHead') && effectiveUser?.email === user?.email

  function isVisible(k) {
    const roles    = k.targetRoles || []
    const teams    = k.targetTeams || []
    const myEmail  = (effectiveUser?.email || '').toLowerCase()
    const myRole   = effectiveUser?.role

    const isICKicker      = roles.includes('Agent') || roles.includes('PreSales')
    const isManagerKicker = !isICKicker && roles.includes('Manager')
    const isVHKicker      = !isICKicker && !isManagerKicker && roles.includes('VH')

    // Rule 1: IC kickers (targeted at Agent/PreSales) are visible to everyone
    if (isICKicker) return true

    // Rules 2 & 3: Manager kickers — not visible to Agent/PreSales
    if (isManagerKicker) {
      if (myRole === 'Agent' || myRole === 'PreSales') return false
      if (myRole === 'Manager') {
        if (teams.includes('ALL')) return true
        if (teams.some(t => t.toLowerCase() === myEmail)) return true
        if (teams.includes(effectiveUser?.managerEmail)) return true
        return false
      }
      return true // Admin, SalesHead, VH see all manager kickers
    }

    // Rules 4 & 5: VH kickers — only that specific VH + Admin/SalesHead
    if (isVHKicker) {
      if (myRole === 'Admin' || myRole === 'SalesHead') return true
      if (myRole === 'VH') {
        if (teams.includes('ALL')) return true
        return teams.some(t => t.toLowerCase() === myEmail)
      }
      return false
    }

    // Fallback for any other role combinations
    if (!roles.includes(myRole)) return false
    if (teams.includes('ALL')) return true
    if (teams.some(t => t.toLowerCase() === myEmail)) return true
    if (teams.includes(effectiveUser?.managerEmail)) return true
    return false
  }

  const load = useCallback(async () => {
    if (!effectiveUser?.email) return
    setLoading(true)
    try {
      // Load ALL deals (no month filter) so past kickers on different months still compute correctly
      const fetches = [getKickers(), getDeals(null, null), getAllUsers()]
      if (isPreSales) fetches.push(getPreSalesSummary(effectiveUser.email, month))
      const [ks, ds, us, psData] = await Promise.all(fetches)
      setKickers(ks)
      setDeals(ds)
      setUsers(us || [])
      if (psData) setPsSummary(psData)
    } catch { /* show empty */ }
    finally { setLoading(false) }
  }, [effectiveUser?.email, effectiveUser?.role, month, tick])

  useEffect(() => { load() }, [load])

  // teamMap: lowercase team name → { email, name } for all managers
  // Used by KickerCard to aggregate manager-targeted kickers by team (d.Team column AA)
  const teamMap = useMemo(() => {
    const map = {}
    for (const u of users) {
      if (u.Role !== 'Manager') continue
      const email = (u.Email || '').toLowerCase()
      const name  = u.Name || u.Email || ''
      // Use stored Team field if present, else derive from first name
      let teamName = (u.Team || '').trim().toLowerCase()
      if (!teamName) {
        const firstName = name.trim().split(' ')[0].toLowerCase()
        if (firstName) teamName = `team ${firstName}`
      }
      if (teamName) map[teamName] = { email, name }
    }
    return map
  }, [users])

  // All kickers visible to this user (VH scoped via isVisible; Admin/SalesHead see all)
  const allVisible = isFullOversight ? kickers : kickers.filter(isVisible)

  // Filter to kickers whose date range overlaps the selected month
  const monthStart = new Date(month + '-01')
  const monthEnd   = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59)
  const monthVisible = allVisible.filter(k => {
    if (!k.dateFrom || !k.dateTo) return true
    return new Date(k.dateFrom) <= monthEnd && new Date(k.dateTo) >= monthStart
  })

  // Role category filter
  function matchesRoleFilter(k) {
    const roles = k.targetRoles || []
    if (roleFilter === 'Agents')   return roles.includes('Agent') || roles.includes('PreSales')
    if (roleFilter === 'Managers') return roles.includes('Manager') && !roles.includes('Agent') && !roles.includes('PreSales')
    if (roleFilter === 'VHs')      return roles.includes('VH')
    return true
  }

  const displayed = monthVisible
    .filter(matchesRoleFilter)
    .filter(k => isOversight && statusFilter !== 'All' ? k.status === statusFilter : true)
    .sort((a, b) => new Date(b.dateFrom) - new Date(a.dateFrom))

  function dealsFor(k) {
    if (k.type?.startsWith('team_')) return deals
    const type = normalizeType(k.type || 'sales')

    // Oversight (Admin/SalesHead/VH): show aggregate across all agents
    if (isOversight) return deals

    // IC kicker (targets Agent/PreSales): pass all deals so KickerCard can
    // show the earners list. The card filters to own email for personal progress.
    const isICKicker = (k.targetRoles || []).some(r => r === 'Agent' || r === 'PreSales')
    if (isICKicker) return deals

    // Collective: return all targeted agents' combined deals
    if (type === 'collective') {
      const targetTeams = k.targetTeams || ['ALL']
      if (targetTeams.includes('ALL')) return deals
      const emailSet = new Set(targetTeams.map(e => e.toLowerCase()))
      return deals.filter(d => emailSet.has((d.Email || '').toLowerCase()))
    }

    // Manager-targeted kicker: count team sales via d.Team column
    const targetsManagers = (k.targetRoles || []).includes('Manager') &&
      !(k.targetRoles || []).includes('Agent') &&
      !(k.targetRoles || []).includes('PreSales')
    if (isManager && targetsManagers) {
      const myTeam    = (effectiveUser?.team || '').trim().toLowerCase()
      const firstName = (effectiveUser?.name || '').trim().split(' ')[0].toLowerCase()
      const teamFallback = firstName ? `team ${firstName}` : ''
      const teamToMatch  = myTeam || teamFallback
      const kickerMonth  = (k.dateFrom || '').substring(0, 7) // "2026-06"
      const from = k.dateFrom ? new Date(k.dateFrom) : null
      const to   = k.dateTo  ? new Date(k.dateTo + 'T23:59:59') : null
      if (teamToMatch) {
        return deals.filter(d => {
          if ((d.Team || '').trim().toLowerCase() !== teamToMatch) return false
          // PaymentDate is normalized YYYY-MM-DD by parseSheetDate — use it for precise filtering
          if (d.PaymentDate && from && to) {
            const dt = new Date(d.PaymentDate)
            if (!isNaN(dt.getTime())) return dt >= from && dt <= to
          }
          // Fallback to Month when PaymentDate is missing
          return kickerMonth ? d.Month === kickerMonth : false
        })
      }
    }
    return deals.filter(d => (d.Email || '').toLowerCase() === (effectiveUser?.email || '').toLowerCase())
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Header + month picker */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
            <Zap size={18} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Kickers</h2>
            <p className="text-xs text-gray-400">Incentives announced for the month</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
          <span className="text-[11px] text-gray-500 font-medium">Month</span>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="text-xs bg-transparent border-0 focus:outline-none text-gray-800 font-semibold cursor-pointer"
          />
        </div>
      </div>

      {/* Role category filter */}
      <div className="flex flex-wrap gap-1.5">
        {['All', 'Agents', 'Managers', 'VHs'].map(f => (
          <button key={f} onClick={() => setRoleFilter(f)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              roleFilter === f ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {f}
          </button>
        ))}
        {/* Status filter — oversight roles only */}
        {isOversight && (
          <>
            <span className="self-center text-gray-200 select-none">|</span>
            {['Announced', 'Approved', 'Paid'].map(s => (
              <button key={s} onClick={() => setStatusFilter(prev => prev === s ? 'All' : s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  statusFilter === s ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}>
                {s}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Hat Trick & PreSales always-on cards */}
      <HatTrickCard
        deals={deals.filter(d => d.Email === effectiveUser?.email)}
        agentEmail={effectiveUser?.email}
        agentName={effectiveUser?.name}
        month={month}
        tab="active"
      />
      {isPreSales && <PSCallsCard psSummary={psSummary} />}

      {/* Kicker cards */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 flex flex-col items-center gap-3 text-center">
          <Zap size={32} className="text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">No kickers for this month.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {displayed.map(k => (
            <KickerCard
              key={k.id}
              kicker={k}
              deals={dealsFor(k)}
              agentEmail={effectiveUser?.email}
              agentName={effectiveUser?.name}
              isManagerViewer={isManager && (k.targetRoles || []).includes('Manager') && !(k.targetRoles || []).includes('Agent')}
              isOversight={isOversight}
              teamMap={teamMap}
            />
          ))}
        </div>
      )}
    </div>
  )
}
