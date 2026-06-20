import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Megaphone, CheckCircle, ArrowLeft, Pencil, Trash2, ChevronDown, ChevronUp, Zap, BarChart2, Users, ClipboardCheck, BadgeCheck, Plus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { announceKicker, getKickers, updateKicker, setKickerStatus, deleteKicker, getSubtree, getAllUsers, getDeals, packSlabsCol } from '../services/api'
import { formatINR } from '../utils/commission'
import { notifKickerAnnounced } from '../services/notifications'
import { notifyKickerAnnounced } from '../services/slack'

// ── Status workflow ──────────────────────────────────────────────────────────
const STATUSES = ['Announced', 'Approved', 'Paid']
const STATUS_COLORS = {
  Announced: 'bg-amber-100 text-amber-700',
  Approved:  'bg-indigo-100 text-indigo-700',
  Paid:      'bg-green-100 text-green-700',
}

function prevMonthLabel() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' })
}
function isReviewDue() { return new Date().getDate() >= 8 }
const REVIEW_KEY = 'dv2_kicker_reviewed_month'

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKER_TYPES = [
  { value: 'sales',              label: '🎯 Kicker on Sales',            desc: 'Each person independently hits X sales → earns payout',                     unit: 'sales'   },
  { value: 'revenue',            label: '💰 Kicker on Revenue',          desc: 'Each person hits X revenue amount → earns payout',                           unit: 'revenue' },
  { value: 'collective',         label: '🤝 Collective Team Kicker',     desc: 'Entire team hits X combined sales together → every contributor earns payout', unit: 'sales'   },
  { value: 'sales_or_revenue',   label: '⚡ Sales OR Revenue',           desc: 'Hit either X sales count OR Y revenue — whichever is reached first earns the payout', unit: 'both' },
  { value: 'weekly_target_pct',  label: '📊 Weekly % Target (Managers)', desc: 'Managers earn based on % of their weekly payment target achieved (Sun–Sat). Each manager can have a different target.', unit: 'pct' },
  { value: 'team_month_end',     label: '📋 Month-End Team Kicker',      desc: 'Each agent gets their own individual sales target with 2 slabs. Payouts are the same for everyone; only the thresholds differ per agent.', unit: 'sales' },
]

// Returns the Sunday of the week containing `date`
function getWeekSunday(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}
// Returns the Saturday of the week containing `date`
function getWeekSaturday(date = new Date()) {
  const d = new Date(date)
  d.setDate(d.getDate() + (6 - d.getDay()))
  return d.toISOString().split('T')[0]
}

// Normalize old 6-type values to the new type system (for existing DB records)
function normalizeType(t) {
  if (t === 'collective') return 'collective'
  if (t === 'sales_or_revenue') return 'sales_or_revenue'
  if (t === 'weekly_target_pct') return 'weekly_target_pct'
  if (t === 'team_month_end') return 'team_month_end'
  if (t === 'revenue' || t === 'team_revenue' || t === 'individual_revenue') return 'revenue'
  return 'sales' // covers 'sales', 'team_sales', 'individual_sales', 'individual_or', 'individual_and', null
}

// Roles each announcer level can target
const ANNOUNCE_FOR = {
  Admin:     ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead'],
  'Sales Ops': ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead'],
  SalesHead: ['Agent', 'PreSales', 'Manager', 'VH'],
  VH:        ['Agent', 'PreSales', 'Manager'],
  Manager:   ['Agent', 'PreSales'],
}

// Role hierarchy for "can manage" check (higher index = higher authority)
const ROLE_HIERARCHY = ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead', 'Sales Ops', 'Admin']

const TODAY = new Date().toISOString().split('T')[0]

const EMPTY_SLAB = { threshold: '', salesThreshold: '', revenueThreshold: '', payout: '', operator: 'OR' }
function emptySlabs() { return [{ ...EMPTY_SLAB }, { ...EMPTY_SLAB }] }

function flatTree(node, acc = []) {
  if (!node) return acc
  acc.push(node)
  ;(node.children || []).forEach(c => flatTree(c, acc))
  return acc
}

function kickerIsActive(k) {
  const now  = Date.now()
  const from = new Date(k.dateFrom).getTime()
  const to   = new Date(k.dateTo).getTime() + 86399999
  return now >= from && now <= to
}
function kickerIsPast(k) { return new Date(k.dateTo).getTime() + 86399999 < Date.now() }

// Can the current user manage (edit/delete) this kicker?
function canManage(kicker, user) {
  if (!user) return false
  // VH and Admin (HOS) can edit all kickers regardless of who announced them
  if (user.role === 'Admin' || user.role === 'VH' || user.role === 'SalesHead' || user.role === 'Sales Ops') return true
  if (kicker.announcedBy === user?.email) return true
  const announcerIdx = ROLE_HIERARCHY.indexOf(kicker.announcedByRole)
  const userIdx      = ROLE_HIERARCHY.indexOf(user?.role)
  return userIdx > announcerIdx
}

// ── Kicker progress computation ───────────────────────────────────────────────
function computeKickerProgress(kicker, allMembers, allDeals) {
  const from      = new Date(kicker.dateFrom).getTime()
  const to        = new Date(kicker.dateTo).getTime() + 86399999
  const minVal    = Number(kicker.minSaleValue || 0)
  const origType  = kicker.type || 'sales'
  const isTeam    = origType.startsWith('team_')
  const type      = normalizeType(origType)
  const isRevType = type === 'revenue'

  const targetRoles = new Set(kicker.targetRoles || [])
  const targetTeams = kicker.targetTeams || ['ALL']
  const allTeams    = targetTeams.includes('ALL')

  // Manager-targeted kicker: each manager earns based on their TEAM's sales
  // (matched via d.Team column which stores values like "Team Kedar", "Team Swati")
  const targetingManagers = targetRoles.has('Manager') &&
    !targetRoles.has('Agent') && !targetRoles.has('PreSales')

  const targetMembers = allMembers.filter(m => {
    if (!targetRoles.has(m.Role)) return false
    if (allTeams) return true
    if (targetTeams.some(t => t.toLowerCase() === (m.Email || '').toLowerCase())) return true
    if (targetTeams.some(t => t.toLowerCase() === (m.ManagerEmail || '').toLowerCase())) return true
    return false
  })

  // Build per-member stats
  const stats = {}
  for (const m of targetMembers) {
    const key = (m.Email || '').toLowerCase()
    stats[key] = { name: m.Name || m.Email, email: m.Email, role: m.Role, team: m.Team || '', sales: 0, revenue: 0 }
  }

  // Helper: does deal fall in date window + meet min value?
  function inWindow(d) {
    // PaymentDate is normalized to YYYY-MM-DD by parseSheetDate — reliable for new Date().
    // Timestamp is raw DD/MM/YYYY from Indian-locale Google Sheets — JS misparses it as
    // M/D/YYYY (e.g. "12/6/2026" → December 6), so we ignore it entirely.
    // Fall back to Month field when PaymentDate is empty.
    let inDateRange = false
    if (d.PaymentDate) {
      const dt = new Date(d.PaymentDate).getTime()
      if (!isNaN(dt)) inDateRange = dt >= from && dt <= to
    } else if (d.Month) {
      const kickerMonth = kicker.dateFrom?.substring(0, 7)
      inDateRange = kickerMonth ? d.Month === kickerMonth : false
    }
    if (!inDateRange) return false
    if (minVal > 0 && (d.TotalValue || 0) < minVal) return false
    return true
  }

  if (targetingManagers) {
    // Build teamName → managerEmail map from each manager's Team field
    const teamToMgr = {}
    for (const m of targetMembers) {
      if (m.Team) teamToMgr[(m.Team || '').trim().toLowerCase()] = (m.Email || '').toLowerCase()
    }
    const teamSet = new Set(Object.keys(teamToMgr))

    for (const d of allDeals) {
      if (!inWindow(d)) continue
      const dTeam = (d.Team || '').trim().toLowerCase()
      if (!teamSet.has(dTeam)) continue
      const mgrEmail = teamToMgr[dTeam]
      if (mgrEmail && stats[mgrEmail]) {
        stats[mgrEmail].sales++
        stats[mgrEmail].revenue += d.TotalValue || 0
      }
    }
  } else {
    const targetEmails = new Set(targetMembers.map(m => (m.Email || '').toLowerCase()))
    for (const d of allDeals) {
      if (!inWindow(d)) continue
      const dealEmail = (d.Email || '').toLowerCase()
      if (targetEmails.has(dealEmail) && stats[dealEmail]) {
        stats[dealEmail].sales++
        stats[dealEmail].revenue += d.TotalValue || 0
      }
    }
  }

  // Slabs sorted ascending (so we find highest hit via iteration)
  const slabs = (kicker.slabs || [])
    .filter(s => Number(s.payout) > 0)
    .sort((a, b) => Number(a.threshold || a.salesThreshold || 0) - Number(b.threshold || b.salesThreshold || 0))

  const isWeeklyPct = type === 'weekly_target_pct'
  const weeklyTargets = kicker.weeklyTargets || {}

  function getSlabHit(sales, revenue, email) {
    let best = null
    for (const s of slabs) {
      let hit
      if (isWeeklyPct) {
        const weeklyTarget = Number(weeklyTargets[(email || '').toLowerCase()] || 0)
        const pct = weeklyTarget > 0 ? (revenue / weeklyTarget) * 100 : 0
        hit = pct >= Number(s.threshold || 0)
      } else {
        const t = Number(s.threshold || (isRevType ? s.revenueThreshold : s.salesThreshold) || 0)
        hit = isRevType ? revenue >= t : sales >= t
      }
      if (hit) best = s
    }
    return best
  }

  const agentList = Object.values(stats)

  const isCollective = type === 'collective'

  // Weekly % target — each manager is evaluated independently based on their own weekly target
  if (isWeeklyPct) {
    const agents = agentList.map(a => {
      const weeklyTarget = Number(weeklyTargets[(a.email || '').toLowerCase()] || 0)
      const pct = weeklyTarget > 0 ? Math.round((a.revenue / weeklyTarget) * 100) : 0
      const sh = getSlabHit(a.sales, a.revenue, a.email)
      return { ...a, weeklyTarget, pct, slabHit: sh, payout: sh ? Number(sh.payout) : 0 }
    })
    const eligible = agents.filter(a => a.slabHit)
    return { kind: 'weekly_pct', agents, eligible: eligible.length, totalPayout: eligible.reduce((s, a) => s + a.payout, 0), slabs }
  }

  // Month-end team kicker — per-agent custom thresholds, shared payout amounts
  const agentTargets = kicker.agentTargets || {}
  if (type === 'team_month_end') {
    const s1Payout = Number(slabs[0]?.payout || 0)
    const s2Payout = Number(slabs[1]?.payout || 0)
    const agents = agentList.map(a => {
      const key = (a.email || '').toLowerCase()
      const targets = agentTargets[key] || {}
      const s1 = Number(targets.s1 || 0)
      const s2 = Number(targets.s2 || 0)
      let slabHit = null, payout = 0, slabLabel = null
      if (s2 > 0 && a.sales >= s2) { slabHit = 's2'; payout = s2Payout; slabLabel = `S2: ${s2} sales` }
      else if (s1 > 0 && a.sales >= s1) { slabHit = 's1'; payout = s1Payout; slabLabel = `S1: ${s1} sales` }
      return { ...a, s1, s2, s1Payout, s2Payout, slabHit, payout, slabLabel, hasTarget: s1 > 0 || s2 > 0 }
    })
    const eligible = agents.filter(a => a.slabHit)
    return { kind: 'month_end', agents, eligible: eligible.length, totalPayout: eligible.reduce((s, a) => s + a.payout, 0), s1Payout, s2Payout }
  }

  if (isTeam || isCollective) {
    const totals  = agentList.reduce((acc, a) => { acc.sales += a.sales; acc.revenue += a.revenue; return acc }, { sales: 0, revenue: 0 })
    const slabHit = getSlabHit(totals.sales, totals.revenue)

    if (isCollective) {
      // Every agent who contributed ≥ 1 sale earns when the team threshold is hit
      const agents     = agentList.map(a => ({
        ...a,
        slabHit: (a.sales > 0 && slabHit) ? slabHit : null,
        payout:  (a.sales > 0 && slabHit) ? Number(slabHit.payout) : 0,
      }))
      const eligible   = agents.filter(a => a.payout > 0)
      return { kind: 'collective', totals, slabHit, agents, eligible: eligible.length, totalPayout: eligible.reduce((s, a) => s + a.payout, 0), slabs }
    }

    return { kind: 'team', totals, slabHit, agents: agentList, payout: slabHit ? Number(slabHit.payout) : 0, slabs }
  } else {
    const overrides = kicker.individualAmounts || {}
    const agents   = agentList.map(a => {
      const sh = getSlabHit(a.sales, a.revenue, a.email)
      const override = overrides[(a.email || '').toLowerCase()]
      const payout = override != null ? Number(override) : (sh ? Number(sh.payout) : 0)
      return { ...a, slabHit: sh, payout, hasOverride: override != null }
    })
    const eligible = agents.filter(a => a.slabHit || a.hasOverride)
    return { kind: 'individual', agents, eligible: eligible.length, totalPayout: eligible.reduce((s, a) => s + a.payout, 0), slabs }
  }
}

// ── ProgressPanel ─────────────────────────────────────────────────────────────
function ProgressPanel({ kicker, progress }) {
  const isRevType = normalizeType(kicker.type) === 'revenue'

  if (progress.kind === 'weekly_pct') {
    const { agents, eligible, totalPayout, slabs } = progress
    return (
      <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{eligible} eligible</span>
          <span className="text-gray-400">{agents.length - eligible} not yet</span>
          {totalPayout > 0 && <span className="ml-auto font-bold text-gray-700">Total payout: {formatINR(totalPayout)}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left pb-1 font-semibold">Manager</th>
                <th className="text-right pb-1 font-semibold">Target</th>
                <th className="text-right pb-1 font-semibold">Revenue</th>
                <th className="text-right pb-1 font-semibold">%</th>
                <th className="text-right pb-1 font-semibold">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...agents].sort((a, b) => b.pct - a.pct).map(a => {
                const nextSlab = slabs.find(s => Number(s.threshold) > a.pct)
                const barPct   = Math.min(a.pct, nextSlab ? Number(nextSlab.threshold) : (a.slabHit ? 100 : 0))
                const barMax   = nextSlab ? Number(nextSlab.threshold) : 100
                const barWidth = barMax > 0 ? Math.min((a.pct / barMax) * 100, 100) : 0
                return (
                  <tr key={a.email} className={a.slabHit ? 'bg-green-50/40' : ''}>
                    <td className="py-1.5 text-gray-700 font-medium">{a.name}</td>
                    <td className="py-1 text-right text-gray-500">{a.weeklyTarget > 0 ? formatINR(a.weeklyTarget) : '—'}</td>
                    <td className="py-1 text-right text-gray-600">{formatINR(a.revenue)}</td>
                    <td className="py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${a.slabHit ? 'bg-green-500' : 'bg-brand-400'}`} style={{ width: `${barWidth}%` }} />
                        </div>
                        <span className={`font-semibold ${a.pct >= 100 ? 'text-green-600' : 'text-gray-600'}`}>{a.pct}%</span>
                      </div>
                    </td>
                    <td className="py-1 text-right font-semibold text-green-700">
                      {a.payout > 0 ? formatINR(a.payout) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (progress.kind === 'month_end') {
    const { agents, eligible, totalPayout, s1Payout, s2Payout } = progress
    return (
      <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
        <div className="flex items-center gap-3 text-[10px]">
          <span className="font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{eligible} earned</span>
          <span className="text-gray-400">{agents.length - eligible} not yet</span>
          {totalPayout > 0 && <span className="ml-auto font-bold text-gray-700">Total payout: {formatINR(totalPayout)}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left pb-1 font-semibold">Agent</th>
                <th className="text-right pb-1 font-semibold">S1 Target</th>
                <th className="text-right pb-1 font-semibold">S2 Target</th>
                <th className="text-right pb-1 font-semibold">Sales</th>
                <th className="text-right pb-1 font-semibold">Slab</th>
                <th className="text-right pb-1 font-semibold">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...agents].filter(a => a.hasTarget).sort((a, b) => b.sales - a.sales).map(a => (
                <tr key={a.email} className={a.slabHit ? 'bg-green-50/40' : ''}>
                  <td className="py-1.5 text-gray-700 font-medium">{a.name}</td>
                  <td className="py-1 text-right text-gray-500">{a.s1 > 0 ? `${a.s1} sales` : '—'}</td>
                  <td className="py-1 text-right text-gray-500">{a.s2 > 0 ? `${a.s2} sales` : '—'}</td>
                  <td className="py-1 text-right font-semibold text-gray-700">{a.sales}</td>
                  <td className="py-1 text-right">
                    {a.slabHit === 's2'
                      ? <span className="text-green-600 font-bold">S2 ✓</span>
                      : a.slabHit === 's1'
                        ? <span className="text-blue-600 font-bold">S1 ✓</span>
                        : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-1 text-right font-semibold text-green-700">
                    {a.payout > 0 ? formatINR(a.payout) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  function slabLabel(s, idx) {
    if (isRevType) return `S${idx+1}: ${formatINR(Number(s.threshold || s.revenueThreshold || 0))}`
    return `S${idx+1}: ${s.threshold || s.salesThreshold || 0} sales`
  }

  if (progress.kind === 'collective') {
    const { totals, slabHit, agents, eligible, totalPayout, slabs } = progress
    const nextSlab  = slabs.find(s => !slabHit || Number(s.payout) > Number(slabHit.payout))
    const threshold = nextSlab
      ? Number(nextSlab.threshold || nextSlab.salesThreshold || 0)
      : (slabHit ? Number(slabHit.threshold || slabHit.salesThreshold || 0) : 1)
    const pct = Math.min(100, Math.round((totals.sales / Math.max(threshold, 1)) * 100))

    return (
      <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
        {/* Team collective bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-500">
            <span className="font-semibold text-blue-700">🤝 Team total: {totals.sales} sales</span>
            <span>{slabHit ? `Slab hit ✓` : (nextSlab ? `Next: ${nextSlab.threshold || 0} sales` : '')}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${slabHit ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
          </div>
          {slabHit && (
            <p className="text-[10px] font-bold text-green-700">
              ✅ Threshold hit! {eligible} contributor{eligible !== 1 ? 's' : ''} earn {formatINR(Number(slabHit.payout))} each · Total payout: {formatINR(totalPayout)}
            </p>
          )}
        </div>
        {/* Per-agent contribution */}
        {agents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-1 font-semibold">Agent</th>
                  <th className="text-right pb-1 font-semibold">Contrib.</th>
                  <th className="text-right pb-1 font-semibold">Earns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[...agents].sort((a, b) => b.sales - a.sales).map(a => (
                  <tr key={a.email} className={a.payout > 0 ? 'bg-green-50/40' : ''}>
                    <td className="py-1 text-gray-700 font-medium">{a.name}</td>
                    <td className="py-1 text-right text-gray-600">{a.sales} sale{a.sales !== 1 ? 's' : ''}</td>
                    <td className="py-1 text-right font-semibold text-green-700">{a.payout > 0 ? formatINR(a.payout) : (a.sales > 0 ? '—' : <span className="text-gray-300">0</span>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  if (progress.kind === 'team') {
    const { totals, slabHit, agents, payout, slabs } = progress
    // Progress bar toward next slab
    const nextSlab  = slabs.find(s => !slabHit || Number(s.payout) > Number(slabHit.payout))
    const threshold = nextSlab
      ? (isRevType ? Number(nextSlab.threshold) : Number(nextSlab.threshold))
      : (slabHit ? (isRevType ? Number(slabHit.threshold) : Number(slabHit.threshold)) : 1)
    const current   = isRevType ? totals.revenue : totals.sales
    const pct       = Math.min(100, Math.round((current / threshold) * 100))

    return (
      <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
        {/* Team total */}
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex justify-between text-[10px] text-gray-500">
              <span className="font-semibold">{isRevType ? formatINR(current) : `${current} sales`}</span>
              <span>{slabHit ? `Slab ${progress.slabs.indexOf(slabHit)+1} hit ✓` : (nextSlab ? `Next: ${slabLabel(nextSlab, slabs.indexOf(nextSlab))}` : 'No threshold set')}</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${slabHit ? 'bg-green-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
          {slabHit && <span className="text-xs font-bold text-green-600">{formatINR(payout)}</span>}
        </div>
        {/* Per-agent contribution */}
        {agents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-400 border-b border-gray-100">
                  <th className="text-left pb-1 font-semibold">Agent</th>
                  <th className="text-right pb-1 font-semibold">Sales</th>
                  <th className="text-right pb-1 font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {agents.sort((a,b) => b.sales - a.sales).map(a => (
                  <tr key={a.email}>
                    <td className="py-1 text-gray-700 font-medium">{a.name}</td>
                    <td className="py-1 text-right text-gray-600">{a.sales}</td>
                    <td className="py-1 text-right text-gray-600">{formatINR(a.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  // Individual
  const { agents, eligible, totalPayout } = progress
  const sorted = [...agents].sort((a, b) => {
    if (b.payout !== a.payout) return b.payout - a.payout
    if (isRevType) return b.revenue - a.revenue
    return b.sales - a.sales
  })

  return (
    <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
      <div className="flex items-center gap-3 text-[10px]">
        <span className="font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{eligible} eligible</span>
        <span className="text-gray-400">{agents.length - eligible} not yet</span>
        {totalPayout > 0 && <span className="ml-auto font-bold text-gray-700">Total payout: {formatINR(totalPayout)}</span>}
      </div>
      {agents.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left pb-1 font-semibold">Agent</th>
                {!isRevType && <th className="text-right pb-1 font-semibold">Sales</th>}
                {isRevType && <th className="text-right pb-1 font-semibold">Revenue</th>}
                <th className="text-right pb-1 font-semibold">Slab</th>
                <th className="text-right pb-1 font-semibold">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(a => (
                <tr key={a.email} className={a.slabHit ? 'bg-green-50/40' : ''}>
                  <td className="py-1 text-gray-700 font-medium">{a.name}</td>
                  {!isRevType && <td className="py-1 text-right text-gray-600">{a.sales}</td>}
                  {isRevType && <td className="py-1 text-right text-gray-600">{formatINR(a.revenue)}</td>}
                  <td className="py-1 text-right">
                    {a.slabHit
                      ? <span className="text-green-600 font-bold">S{progress.slabs.indexOf(a.slabHit)+1} ✓</span>
                      : a.hasOverride
                        ? <span className="text-purple-500 font-semibold">override</span>
                        : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="py-1 text-right font-semibold text-green-700">
                    {a.payout > 0 ? formatINR(a.payout) : '—'}
                    {a.hasOverride && <span className="ml-1 text-[9px] text-purple-400">✏️</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[10px] text-gray-400 text-center py-2">No agents match this kicker's targeting yet.</p>
      )}
    </div>
  )
}

// ── Compact ManageCard ────────────────────────────────────────────────────────
function ManageCard({ kicker, onEdit, onDelete, onStatusChange, progress }) {
  const [delConfirm,    setDelConfirm]    = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [showProgress,  setShowProgress]  = useState(false)

  const active  = kickerIsActive(kicker)
  const past    = kickerIsPast(kicker)

  const liveBadge = past
    ? <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Ended</span>
    : active
      ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>
      : <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Upcoming</span>

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`h-1 ${past ? 'bg-gray-200' : 'bg-gradient-to-r from-brand-500 via-purple-500 to-pink-400'}`} />
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1 mb-1">
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${STATUS_COLORS[kicker.status] || STATUS_COLORS.Announced}`}>
                {kicker.status || 'Announced'}
              </span>
              {liveBadge}
              {kicker.pinned && <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">📌</span>}
            </div>
            <p className="text-sm font-bold text-gray-900 leading-snug">{kicker.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {kicker.dateFrom} → {kicker.dateTo} · by {kicker.announcedByRole}
              {kicker.status === 'Paid' && kicker.paidDate && ` · Paid ${kicker.paidDate}`}
            </p>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(kicker.targetRoles || []).map(r => (
                <span key={r} className="text-[10px] font-semibold bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full">{r}</span>
              ))}
              {(kicker.targetTeams || []).includes('ALL')
                ? <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">All Teams</span>
                : <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{(kicker.targetTeams || []).length} team(s)</span>
              }
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {kicker.status !== 'Approved' && kicker.status !== 'Paid' && (
              <button onClick={() => onStatusChange(kicker, 'Approved')}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors">
                Approve
              </button>
            )}
            {kicker.status !== 'Paid' && (
              <button onClick={() => onStatusChange(kicker, 'Paid')}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors">
                Mark Paid
              </button>
            )}
            <button onClick={() => setExpanded(v => !v)} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <button onClick={() => onEdit(kicker)} className="p-1.5 text-gray-400 hover:text-brand-600 transition-colors" title="Edit">
              <Pencil size={14} />
            </button>
            {delConfirm ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => onDelete(kicker.id)} className="text-[11px] font-bold text-red-600 hover:underline">Confirm</button>
                <button onClick={() => setDelConfirm(false)} className="text-[11px] text-gray-400 hover:underline">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setDelConfirm(true)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Delete">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Slabs summary */}
        {expanded && (kicker.slabs || []).length > 0 && (
          <div className="mt-3 space-y-1 border-t border-gray-100 pt-2">
            <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Slabs</p>
            {kicker.slabs.map((s, i) => {
              const nt = normalizeType(kicker.type)
              let desc
              if (nt === 'weekly_target_pct') {
                desc = `${s.threshold || 0}% of weekly target → ${formatINR(Number(s.payout))}`
              } else if (nt === 'team_month_end') {
                desc = `S${i + 1} payout → ${formatINR(Number(s.payout))} (per-agent thresholds)`
              } else if (nt === 'sales_or_revenue') {
                const tS  = Number(s.salesThreshold || 0)
                const tR  = Number(s.revenueThreshold || 0)
                const op  = s.operator === 'AND' ? 'AND' : 'OR'
                desc = `${tS} sale${tS !== 1 ? 's' : ''} ${op} ${formatINR(tR)} → ${formatINR(Number(s.payout))}`
              } else if (nt === 'revenue') {
                desc = `${formatINR(Number(s.threshold || s.revenueThreshold || 0))} → ${formatINR(Number(s.payout))}`
              } else {
                desc = `${s.threshold || s.salesThreshold || 0} sales → ${formatINR(Number(s.payout))}`
              }
              return <p key={i} className="text-[10px] text-gray-600">S{i+1}: {desc}</p>
            })}
            {Object.keys(kicker.individualAmounts || {}).length > 0 && (
              <p className="text-[10px] text-purple-500 mt-1">
                ✏️ {Object.keys(kicker.individualAmounts).length} individual override(s)
              </p>
            )}
          </div>
        )}

        {expanded && kicker.notes && (
          <div className="mt-3 text-[10px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            📝 {kicker.notes}
          </div>
        )}

        {/* Progress toggle + panel (active kickers only) */}
        {active && progress && (
          <>
            <button
              onClick={() => setShowProgress(v => !v)}
              className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-brand-600 hover:text-brand-800 transition-colors"
            >
              {showProgress ? <ChevronUp size={12} /> : <BarChart2 size={12} />}
              {showProgress ? 'Hide Progress' : 'View Progress'}
              {(progress.kind === 'individual' || progress.kind === 'weekly_pct' || progress.kind === 'month_end') && progress.eligible > 0 && (
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                  {progress.eligible} eligible
                </span>
              )}
              {progress.kind === 'team' && progress.slabHit && (
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full text-[10px] font-bold">✓ Team hit!</span>
              )}
            </button>
            {showProgress && <ProgressPanel kicker={kicker} progress={progress} />}
          </>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnnounceKicker() {
  const { user, effectiveUser } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Redirect PreSales/Agent — they cannot announce kickers (check actual login role)
  useEffect(() => {
    if (user?.role === 'PreSales' || user?.role === 'Agent') {
      navigate('/kickers', { replace: true })
    }
  }, [user?.role, navigate])

  const BLANK_FORM = {
    title: '', message: '', type: 'sales', minSaleValue: '',
    dateFrom: TODAY, dateTo: TODAY,
    targetTeams: ['ALL'], targetRoles: [],
    pinned: false, slabs: emptySlabs(),
    status: 'Announced', paidDate: '', notes: '', individualOverridesText: '',
    collectiveMode: 'per_sale',
    weeklyTargets: {},      // { email: weeklyRevenueTarget } for weekly_target_pct type
    agentTargets:  {},      // { email: { s1: N, s2: M } } for team_month_end type
    monthEndPayouts: { s1: '', s2: '' }, // shared payout amounts for team_month_end
  }

  const [form,        setForm]        = useState(BLANK_FORM)
  const [editingId,   setEditingId]   = useState(null)
  const [managers,    setManagers]    = useState([])
  const [allKickers,  setAllKickers]  = useState([])
  const [allDeals,    setAllDeals]    = useState([])
  const [subtreeAll,  setSubtreeAll]  = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)
  const [manageTab,      setManageTab]      = useState('live') // 'live' | 'past'
  const [agentSearch,    setAgentSearch]    = useState('')
  const [agentPickerOpen, setAgentPickerOpen] = useState(false)

  // ── Monthly review banner state ──────────────────────────────────────────
  const [reviewDismissed, setReviewDismissed] = useState(true)
  const reviewMonth = prevMonthLabel()

  // Use effectiveUser for role-scoping (respects Admin "view as" impersonation)
  const activeUser    = effectiveUser || user
  const eligibleRoles = ANNOUNCE_FOR[activeUser?.role] ?? []
  const typeInfo      = KICKER_TYPES.find(t => t.value === form.type) ?? KICKER_TYPES[0]

  const manageable = allKickers.filter(k => canManage(k, user))

  // Pre-compute progress for each active manageable kicker
  const progressMap = {}
  if (allDeals.length > 0 && subtreeAll.length > 0) {
    for (const k of manageable) {
      if (kickerIsActive(k)) {
        progressMap[k.id] = computeKickerProgress(k, subtreeAll, allDeals)
      }
    }
  }

  // ── Monthly review: kickers whose date range fell in last month, not yet Paid ──
  const lastMonthBounds = useMemo(() => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
    return { start, end }
  }, [])

  const lastMonthKickers = useMemo(() => {
    if (!isReviewDue()) return []
    return manageable.filter(k => {
      if (k.status === 'Paid') return false
      const to = new Date(k.dateTo)
      return to >= lastMonthBounds.start && to <= lastMonthBounds.end
    })
  }, [manageable, lastMonthBounds])

  const lastMonthProgress = {}
  if (allDeals.length > 0 && subtreeAll.length > 0) {
    for (const k of lastMonthKickers) {
      lastMonthProgress[k.id] = computeKickerProgress(k, subtreeAll, allDeals)
    }
  }

  const qualifiedLastMonth = lastMonthKickers.filter(k => {
    const p = lastMonthProgress[k.id]
    if (!p) return false
    return (p.kind === 'team' || p.kind === 'collective') ? !!p.slabHit : p.eligible > 0
  })

  useEffect(() => {
    if (!isReviewDue()) { setReviewDismissed(true); return }
    const dismissedMonth = localStorage.getItem(REVIEW_KEY)
    setReviewDismissed(dismissedMonth === reviewMonth)
  }, [reviewMonth])

  async function handleStatusChange(kicker, status) {
    setAllKickers(prev => prev.map(k => k.id === kicker.id ? { ...k, status, paidDate: status === 'Paid' ? new Date().toISOString().split('T')[0] : k.paidDate } : k))
    await setKickerStatus(kicker, status)
  }

  async function approveQualifiedLastMonth() {
    await Promise.all(qualifiedLastMonth.map(k => setKickerStatus(k, 'Approved')))
    setAllKickers(prev => prev.map(k => qualifiedLastMonth.find(q => q.id === k.id) ? { ...k, status: 'Approved' } : k))
    localStorage.setItem(REVIEW_KEY, reviewMonth)
    setReviewDismissed(true)
  }

  function dismissReview() {
    localStorage.setItem(REVIEW_KEY, reviewMonth)
    setReviewDismissed(true)
  }

  const loadData = useCallback(async () => {
    const rootEmail = activeUser?.email
    if (!rootEmail) return
    setLoadingList(true)
    try {
      // Admin/SalesHead/VH can target anyone — fetch all users instead of just their subtree
      const isOrgWide = ['Admin', 'SalesHead', 'VH', 'Sales Ops'].includes(activeUser?.role)
      const [ks, membersRaw, deals] = await Promise.all([
        getKickers(),
        isOrgWide
          ? getAllUsers().catch(() => null)
          : getSubtree(rootEmail).catch(() => null),
        getDeals().catch(() => []),
      ])
      setAllKickers(ks)
      setAllDeals(deals)

      const allMembers = isOrgWide
        ? (membersRaw || []).filter(m => (m.Email || '').toLowerCase() !== rootEmail.toLowerCase())
        : flatTree(membersRaw).filter(m => (m.Email || '').toLowerCase() !== rootEmail.toLowerCase())
      setSubtreeAll(allMembers)

      // "Which Teams?" form field — scope to the effective user's role
      if (activeUser?.role === 'Manager') {
        setManagers(allMembers.filter(m => (m.ManagerEmail || '').toLowerCase() === rootEmail.toLowerCase()))
      } else {
        const managerRoles = activeUser?.role === 'VH'
          ? ['Manager']
          : activeUser?.role === 'SalesHead'
            ? ['VH', 'Manager']
            : ['VH', 'Manager', 'SalesHead'] // Admin / Sales Ops
        setManagers(allMembers.filter(m => managerRoles.includes(m.Role)))
      }
    } catch {}
    finally { setLoadingList(false) }
  }, [activeUser?.email, activeUser?.role])

  useEffect(() => { loadData() }, [loadData])

  // Auto-open edit mode when navigated from Kickers page with a kicker in state
  useEffect(() => {
    const kicker = location.state?.editKicker
    if (!kicker) return
    handleEdit(kicker)
    // Clear state so back-navigation doesn't re-trigger
    window.history.replaceState({}, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.editKicker?.id])

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function toggleTeam(email) {
    if (email === 'ALL') { setField('targetTeams', ['ALL']); return }
    setForm(p => {
      const prev = p.targetTeams.filter(t => t !== 'ALL')
      return { ...p, targetTeams: prev.includes(email) ? prev.filter(t => t !== email) : [...prev, email] }
    })
  }

  function toggleRole(role) {
    setAgentSearch('')
    setAgentPickerOpen(false)
    setForm(p => {
      const newRoles = p.targetRoles.includes(role)
        ? p.targetRoles.filter(r => r !== role)
        : [...p.targetRoles, role]
      // Default targetTeams to ALL whenever roles change — user can narrow down via pickers
      return { ...p, targetRoles: newRoles, targetTeams: ['ALL'] }
    })
  }

  function setSlab(i, field, val) {
    setForm(p => ({ ...p, slabs: p.slabs.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }))
  }
  function addSlab() {
    setForm(p => ({ ...p, slabs: [...p.slabs, { ...EMPTY_SLAB }] }))
  }
  function removeSlab(i) {
    setForm(p => ({ ...p, slabs: p.slabs.filter((_, idx) => idx !== i) }))
  }

  function handleEdit(kicker) {
    const padded = [...(kicker.slabs || []).filter(s => s.payout !== '' && Number(s.payout) > 0), { ...EMPTY_SLAB }]
    setForm({
      title:        kicker.title,
      message:      kicker.message,
      type:         normalizeType(kicker.type || 'sales'),
      minSaleValue: kicker.minSaleValue || '',
      dateFrom:     kicker.dateFrom,
      dateTo:       kicker.dateTo,
      targetTeams:  kicker.targetTeams || ['ALL'],
      targetRoles:  kicker.targetRoles || [],
      pinned:       kicker.pinned || false,
      slabs:        padded,
      status:       kicker.status || 'Announced',
      paidDate:     kicker.paidDate || '',
      notes:        kicker.notes || '',
      individualOverridesText: Object.entries(kicker.individualAmounts || {}).map(([e, a]) => `${e},${a}`).join('\n'),
      collectiveMode:    kicker.collectiveMode || 'per_sale',
      weeklyTargets:     kicker.weeklyTargets  || {},
      agentTargets:      kicker.agentTargets   || {},
      monthEndPayouts:   {
        s1: kicker.slabs?.[0]?.payout ?? '',
        s2: kicker.slabs?.[1]?.payout ?? '',
      },
    })
    setEditingId(kicker.id)
    setError('')
    setSuccess(false)
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleCancelEdit() {
    setForm(BLANK_FORM)
    setEditingId(null)
    setError('')
  }

  async function handleDelete(id) {
    await deleteKicker(id)
    setAllKickers(prev => prev.filter(k => k.id !== id))
    if (editingId === id) handleCancelEdit()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())                    { setError('Title is required.'); return }
    if (!form.dateFrom || !form.dateTo)        { setError('Date range is required.'); return }
    const isMonthEnd = form.type === 'team_month_end'
    if (!isMonthEnd && form.type !== 'weekly_target_pct' && (!form.minSaleValue || Number(form.minSaleValue) <= 0)) { setError('Minimum Sale Value is required.'); return }
    if (form.targetRoles.length === 0)         { setError('Select at least one target role.'); return }
    if (isMonthEnd) {
      if (!form.monthEndPayouts.s1 || Number(form.monthEndPayouts.s1) <= 0) { setError('S1 payout amount is required.'); return }
      if (!form.monthEndPayouts.s2 || Number(form.monthEndPayouts.s2) <= 0) { setError('S2 payout amount is required.'); return }
    } else {
      const filledSlabs = form.slabs.filter(s => s.payout !== '')
      if (!filledSlabs.length) { setError('Add at least one slab.'); return }
    }

    setSubmitting(true); setError('')

    // For month_end: slabs store only the shared payout amounts (no thresholds — those are per-agent)
    let cleanSlabs
    if (isMonthEnd) {
      cleanSlabs = [
        { threshold: 0, payout: Number(form.monthEndPayouts.s1) },
        { threshold: 0, payout: Number(form.monthEndPayouts.s2) },
      ]
    } else {
      const filledSlabs = form.slabs.filter(s => s.payout !== '')
      cleanSlabs = filledSlabs.map(s => ({
        threshold:        Number(s.threshold        || 0),
        salesThreshold:   Number(s.salesThreshold   || 0),
        revenueThreshold: Number(s.revenueThreshold || 0),
        payout:           Number(s.payout           || 0),
        operator:         s.operator === 'AND' ? 'AND' : 'OR',
      }))
    }

    // Parse "email,amount" lines into an { email: amount } override map
    const individualAmounts = {}
    ;(form.individualOverridesText || '').split('\n').forEach(line => {
      const [email, amt] = line.split(',').map(s => s.trim())
      if (email && amt && !isNaN(Number(amt))) individualAmounts[email.toLowerCase()] = Number(amt)
    })

    try {
      if (editingId) {
        await updateKicker(editingId, {
          Title:       form.title,
          Message:     form.message || '',
          Type:        form.type,
          MinSaleValue:Number(form.minSaleValue || 0),
          DateFrom:    form.dateFrom,
          DateTo:      form.dateTo,
          Slabs:       packSlabsCol({ slabs: cleanSlabs, status: form.status, paidDate: form.paidDate, notes: form.notes, individualAmounts, collectiveMode: form.collectiveMode, weeklyTargets: form.weeklyTargets, agentTargets: form.agentTargets }),
          TargetTeams: JSON.stringify(form.targetTeams || ['ALL']),
          TargetRoles: JSON.stringify(form.targetRoles || []),
          Pinned:      form.pinned ? 'true' : 'false',
        })
      } else {
        await announceKicker({ ...form, slabs: cleanSlabs, minSaleValue: Number(form.minSaleValue || 0), individualAmounts, weeklyTargets: form.weeklyTargets, agentTargets: form.agentTargets }, activeUser.email, activeUser.role)
      }
      notifKickerAnnounced({ title: form.title, isEdit: !!editingId })
      notifyKickerAnnounced({
        title:       form.title,
        message:     form.message,
        type:        form.type,
        dateFrom:    form.dateFrom,
        dateTo:      form.dateTo,
        targetRoles: form.targetRoles || [],
        slabs:       cleanSlabs,
        announcerName: activeUser?.name || activeUser?.email || '',
        isEdit:      !!editingId,
      })
      setSuccess(true)
      setForm(BLANK_FORM)
      setEditingId(null)
      // Refresh list
      loadData()
    } catch (err) {
      setError(err?.message ?? 'Failed to save kicker.')
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/kickers')} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
          <Megaphone size={18} className="text-brand-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Announce Kicker</h2>
          <p className="text-xs text-gray-400">Create & manage incentives for your team</p>
        </div>
      </div>

      {/* Success banner */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-green-700">
            {editingId ? 'Kicker updated!' : 'Kicker announced! 🎉'} Your incentive is now live.
          </p>
          <button onClick={() => setSuccess(false)} className="ml-auto text-green-400 hover:text-green-600 text-xs">✕</button>
        </div>
      )}

      {/* ── Monthly Review Banner ── */}
      {!reviewDismissed && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-amber-100">
            <div className="flex items-center gap-2">
              <ClipboardCheck size={16} className="text-amber-600" />
              <p className="text-sm font-bold text-amber-800">Monthly Kicker Review — {reviewMonth}</p>
            </div>
            <button onClick={dismissReview} className="text-amber-400 hover:text-amber-600 text-sm">✕</button>
          </div>
          <div className="px-4 py-3">
            {lastMonthKickers.length === 0 ? (
              <p className="text-xs text-amber-700">No pending {reviewMonth} kickers to review. All settled or none announced.</p>
            ) : (
              <>
                <p className="text-xs text-amber-700 mb-2">
                  {qualifiedLastMonth.length} of {lastMonthKickers.length} {reviewMonth} kicker(s) have qualifying sales:
                  {' '}{qualifiedLastMonth.map(k => `"${k.title}"`).join(', ') || 'none yet'}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={approveQualifiedLastMonth} disabled={qualifiedLastMonth.length === 0}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white disabled:opacity-40 hover:bg-amber-600 transition-colors flex items-center gap-1.5">
                    <BadgeCheck size={13} /> Approve Qualified Kickers
                  </button>
                  <button onClick={dismissReview} className="text-xs text-amber-600 hover:underline">Skip</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Manage existing kickers ── */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-purple-500" />
            <p className="text-sm font-bold text-gray-800">Your Kickers to Manage</p>
            <span className="text-[10px] font-semibold bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{manageable.length}</span>
          </div>
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
            <button type="button" onClick={() => setManageTab('live')}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${manageTab === 'live' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              🟢 Live
            </button>
            <button type="button" onClick={() => setManageTab('past')}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ${manageTab === 'past' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Past
            </button>
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
          </div>
        ) : (() => {
          const filtered = manageable
            .sort((a, b) => new Date(b.announcedAt) - new Date(a.announcedAt))
            .filter(k => manageTab === 'live' ? !kickerIsPast(k) : kickerIsPast(k))
          if (filtered.length === 0) return (
            <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-6 text-center">
              <p className="text-xs text-gray-400">{manageTab === 'live' ? 'No live kickers.' : 'No past kickers.'}</p>
            </div>
          )
          return (
            <div className="space-y-2">
              {filtered.map(k => (
                <ManageCard
                  key={k.id}
                  kicker={k}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  progress={progressMap[k.id] ?? null}
                />
              ))}
            </div>
          )
        })()}
      </div>

      {/* ── Create / Edit form ── */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-gradient-to-r from-brand-50 to-purple-50 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">
              {editingId ? '✏️ Edit Kicker' : 'New Kicker'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              As <span className="font-semibold text-brand-700">{activeUser?.role}</span> you can announce kickers for: {eligibleRoles.join(', ')}
            </p>
          </div>
          {editingId && (
            <button type="button" onClick={handleCancelEdit}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded-lg">
              Cancel Edit
            </button>
          )}
        </div>

        <div className="px-5 py-5 space-y-5">

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Kicker Title *</label>
            <input value={form.title} onChange={e => setField('title', e.target.value)}
              placeholder="e.g. Month-End Push — Let's Go!"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Motivational Message (optional)</label>
            <textarea rows={4} value={form.message} onChange={e => setField('message', e.target.value)}
              placeholder="Paste your announcement message here…"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Kicker Type *</label>
            <div className="grid grid-cols-1 gap-2">
              {KICKER_TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setField('type', t.value)}
                  className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                    form.type === t.value ? 'border-brand-400 bg-brand-50 text-brand-800 font-semibold' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <p className="font-semibold">{t.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Collective payout mode — only shown when collective is selected */}
          {form.type === 'collective' && (
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">How is the payout calculated? *</label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setField('collectiveMode', 'per_sale')}
                  className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                    form.collectiveMode === 'per_sale'
                      ? 'border-brand-400 bg-brand-50 text-brand-800 font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <p className="font-semibold">💰 Per Sale</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Agent earns payout × number of sales they contributed (3 sales = 3× payout)</p>
                </button>
                <button type="button" onClick={() => setField('collectiveMode', 'per_agent')}
                  className={`text-left px-3 py-2.5 rounded-xl border text-xs transition-all ${
                    form.collectiveMode === 'per_agent'
                      ? 'border-brand-400 bg-brand-50 text-brand-800 font-semibold'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  <p className="font-semibold">🧑 Per Agent</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Every contributing agent gets 1× payout, regardless of how many sales they made</p>
                </button>
              </div>
            </div>
          )}

          {/* Min sale value — required */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Minimum Sale Value *</label>
            <input type="number" value={form.minSaleValue} onChange={e => setField('minSaleValue', e.target.value)}
              placeholder="e.g. 50000 — only deals above this value count"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {form.minSaleValue && <p className="text-[10px] text-gray-400 mt-1">Deals below {formatINR(Number(form.minSaleValue))} won't count toward this kicker</p>}
          </div>

          {/* Date range */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Date Range *</label>
            <div className="flex items-center gap-3">
              <input type="date" value={form.dateFrom} onChange={e => setField('dateFrom', e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={form.dateTo} onChange={e => setField('dateTo', e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
              <button type="button" onClick={() => { setField('dateFrom', TODAY); setField('dateTo', TODAY) }}
                className="text-xs text-brand-600 font-semibold border border-brand-200 bg-brand-50 px-2.5 py-2 rounded-xl hover:bg-brand-100 whitespace-nowrap">
                Today Only
              </button>
              {form.type === 'weekly_target_pct' && (
                <button type="button" onClick={() => { setField('dateFrom', getWeekSunday()); setField('dateTo', getWeekSaturday()) }}
                  className="text-xs text-purple-700 font-semibold border border-purple-200 bg-purple-50 px-2.5 py-2 rounded-xl hover:bg-purple-100 whitespace-nowrap">
                  This Week
                </button>
              )}
            </div>
            {form.dateFrom && form.dateTo && (() => {
              const days = Math.round((new Date(form.dateTo) - new Date(form.dateFrom)) / 86400000) + 1
              if (days < 1) return <p className="text-[11px] text-red-500 mt-1">End date must be on or after start date</p>
              return <p className="text-[11px] text-brand-600 font-semibold mt-1">{days} day{days !== 1 ? 's' : ''}</p>
            })()}
          </div>

          {/* Target Roles */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Who Is This For? *</label>
            <div className="flex flex-wrap gap-2">
              {eligibleRoles.map(role => (
                <button key={role} type="button" onClick={() => toggleRole(role)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    form.targetRoles.includes(role) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {role}
                </button>
              ))}
            </div>
            {eligibleRoles.length === 0 && (
              <p className="text-xs text-red-500 mt-1">Your role is not authorized to announce kickers.</p>
            )}
          </div>

          {/* Target Teams — manager-level roles */}
          {form.targetRoles.some(r => ['Manager', 'VH', 'SalesHead'].includes(r)) && (() => {
            const managerLevelRoles = ['Manager', 'VH', 'SalesHead']
            const selectedMgrRoles  = form.targetRoles.filter(r => managerLevelRoles.includes(r))
            const filteredManagers  = managers.filter(m => selectedMgrRoles.includes(m.Role))
            const allLabel = selectedMgrRoles.length === 1
              ? `All ${selectedMgrRoles[0]}s`
              : 'All Selected'
            return (
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                  Which {selectedMgrRoles.join(' / ')}s?
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleTeam('ALL')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      form.targetTeams.includes('ALL') ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {allLabel}
                  </button>
                  {filteredManagers.map(m => (
                    <button key={m.Email} type="button" onClick={() => toggleTeam(m.Email)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        form.targetTeams.includes(m.Email) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}>
                      {m.Name || m.Email}
                      {selectedMgrRoles.length > 1 && <span className="ml-1 text-[10px] opacity-60">({m.Role})</span>}
                    </button>
                  ))}
                  {filteredManagers.length === 0 && (
                    <p className="text-xs text-gray-400">No {selectedMgrRoles.join('/')}s available.</p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Agent picker — searchable dropdown when Agent or PreSales is selected */}
          {form.targetRoles.some(r => ['Agent', 'PreSales'].includes(r)) && (() => {
            const agentRoles  = form.targetRoles.filter(r => ['Agent', 'PreSales'].includes(r))
            const agentPool   = subtreeAll.filter(m => agentRoles.includes(m.Role))
            const isAll       = form.targetTeams.includes('ALL')
            const selCount    = isAll ? agentPool.length : form.targetTeams.length
            const filtered    = agentPool.filter(a =>
              !agentSearch ||
              (a.Name  || '').toLowerCase().includes(agentSearch.toLowerCase()) ||
              (a.Email || '').toLowerCase().includes(agentSearch.toLowerCase())
            )

            return (
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                  Which Agents?
                </label>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Summary toggle row */}
                  <button type="button" onClick={() => setAgentPickerOpen(v => !v)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-sm">
                    <span className="font-semibold text-gray-700">
                      {isAll
                        ? `All ${agentPool.length} agent${agentPool.length !== 1 ? 's' : ''}`
                        : `${selCount} of ${agentPool.length} selected`}
                    </span>
                    <ChevronDown size={14} className={`text-gray-400 transition-transform ${agentPickerOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {agentPickerOpen && (
                    <div className="border-t border-gray-100">
                      {/* Search */}
                      <div className="px-3 py-2 border-b border-gray-100">
                        <input
                          value={agentSearch}
                          onChange={e => setAgentSearch(e.target.value)}
                          placeholder="Search agents…"
                          className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>

                      {/* Select All */}
                      <button type="button" onClick={() => toggleTeam('ALL')}
                        className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold border-b border-gray-50 transition-colors ${
                          isAll ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-600'
                        }`}>
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[10px] font-bold ${
                          isAll ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300'
                        }`}>
                          {isAll && '✓'}
                        </span>
                        Select All ({agentPool.length})
                      </button>

                      {/* Agent list */}
                      <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                        {filtered.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-4">No agents found.</p>
                        ) : filtered.map(a => {
                          const sel = !isAll && form.targetTeams.includes(a.Email)
                          return (
                            <button key={a.Email} type="button" onClick={() => toggleTeam(a.Email)}
                              className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-xs transition-colors ${
                                sel ? 'bg-brand-50 text-brand-700' : 'hover:bg-gray-50 text-gray-600'
                              }`}>
                              <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 text-[10px] font-bold ${
                                sel ? 'bg-brand-600 border-brand-600 text-white' : 'border-gray-300'
                              }`}>
                                {sel && '✓'}
                              </span>
                              <span className="font-medium flex-1 text-left">{a.Name || a.Email}</span>
                              <span className="text-[10px] text-gray-400">{a.Role}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
                {!isAll && (
                  <p className="text-[10px] text-brand-600 font-semibold mt-1">
                    {selCount} agent{selCount !== 1 ? 's' : ''} selected
                  </p>
                )}
              </div>
            )
          })()}

          {/* Weekly target per manager — only for weekly_target_pct type */}
          {form.type === 'weekly_target_pct' && form.targetRoles.includes('Manager') && (() => {
            const targetedManagers = managers.filter(m => m.Role === 'Manager' && (
              form.targetTeams.includes('ALL') ||
              form.targetTeams.some(t => t.toLowerCase() === (m.Email || '').toLowerCase())
            ))
            if (targetedManagers.length === 0) return null
            return (
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                  Weekly Revenue Target per Manager *
                </label>
                <p className="text-[11px] text-gray-400 mb-2">Set each manager's weekly payment collection target (₹). Their % achievement of this determines which slab they hit.</p>
                <div className="rounded-xl overflow-hidden border border-purple-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-bold uppercase bg-purple-50 text-purple-700">
                        <th className="px-3 py-2 text-left">Manager</th>
                        <th className="px-3 py-2 text-left">Weekly Target (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-50">
                      {targetedManagers.map(m => {
                        const email = (m.Email || '').toLowerCase()
                        return (
                          <tr key={email}>
                            <td className="px-3 py-2 text-gray-700 font-medium">{m.Name || m.Email}</td>
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                value={form.weeklyTargets[email] ?? ''}
                                onChange={e => setForm(p => ({
                                  ...p,
                                  weeklyTargets: { ...p.weeklyTargets, [email]: e.target.value === '' ? '' : Number(e.target.value) }
                                }))}
                                placeholder="e.g. 500000"
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                              />
                              {form.weeklyTargets[email] > 0 && (
                                <p className="text-[10px] text-purple-600 mt-0.5 font-semibold">{formatINR(Number(form.weeklyTargets[email]))}</p>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Month-End: shared payout amounts + per-agent target table */}
          {form.type === 'team_month_end' && (() => {
            // Build the pool of selected agents to assign targets to
            const agentRoles = form.targetRoles.filter(r => ['Agent', 'PreSales'].includes(r))
            const agentPool  = subtreeAll.filter(m => agentRoles.includes(m.Role))
            const isAll      = form.targetTeams.includes('ALL')
            const selectedAgents = isAll
              ? agentPool
              : agentPool.filter(a => form.targetTeams.some(t => t.toLowerCase() === (a.Email || '').toLowerCase()))
            return (
              <div className="space-y-4">
                {/* Global payout amounts */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Payout Amounts (same for all agents)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-blue-200 overflow-hidden">
                      <div className="bg-blue-50 px-3 py-1.5 text-[10px] font-bold text-blue-700 uppercase">S1 — First Target Hit</div>
                      <div className="px-3 py-2">
                        <input type="number" value={form.monthEndPayouts.s1}
                          onChange={e => setForm(p => ({ ...p, monthEndPayouts: { ...p.monthEndPayouts, s1: e.target.value } }))}
                          placeholder="e.g. 3000"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                        {form.monthEndPayouts.s1 > 0 && <p className="text-[10px] text-blue-600 mt-0.5 font-semibold">{formatINR(Number(form.monthEndPayouts.s1))}</p>}
                      </div>
                    </div>
                    <div className="rounded-xl border border-green-200 overflow-hidden">
                      <div className="bg-green-50 px-3 py-1.5 text-[10px] font-bold text-green-700 uppercase">S2 — Stretch Target Hit</div>
                      <div className="px-3 py-2">
                        <input type="number" value={form.monthEndPayouts.s2}
                          onChange={e => setForm(p => ({ ...p, monthEndPayouts: { ...p.monthEndPayouts, s2: e.target.value } }))}
                          placeholder="e.g. 5000"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                        {form.monthEndPayouts.s2 > 0 && <p className="text-[10px] text-green-600 mt-0.5 font-semibold">{formatINR(Number(form.monthEndPayouts.s2))}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Per-agent targets */}
                {selectedAgents.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">
                      Sales Target per Agent
                    </label>
                    <p className="text-[11px] text-gray-400 mb-2">Set S1 and S2 sales count targets for each agent. Leave blank to exclude an agent from this kicker.</p>
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-[10px] font-bold uppercase bg-gray-50 text-gray-500">
                            <th className="px-3 py-2 text-left">Agent</th>
                            <th className="px-3 py-2 text-center w-28 bg-blue-50 text-blue-700">S1 Sales</th>
                            <th className="px-3 py-2 text-center w-28 bg-green-50 text-green-700">S2 Sales</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedAgents.map(a => {
                            const email = (a.Email || '').toLowerCase()
                            const targets = form.agentTargets[email] || {}
                            return (
                              <tr key={email} className="hover:bg-gray-50/50">
                                <td className="px-3 py-2 text-gray-700 font-medium">{a.Name || a.Email}</td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={targets.s1 ?? ''}
                                    onChange={e => setForm(p => ({
                                      ...p,
                                      agentTargets: { ...p.agentTargets, [email]: { ...( p.agentTargets[email] || {}), s1: e.target.value === '' ? '' : Number(e.target.value) } }
                                    }))}
                                    placeholder="e.g. 6"
                                    className="w-full border border-blue-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                </td>
                                <td className="px-2 py-1.5">
                                  <input type="number" value={targets.s2 ?? ''}
                                    onChange={e => setForm(p => ({
                                      ...p,
                                      agentTargets: { ...p.agentTargets, [email]: { ...( p.agentTargets[email] || {}), s2: e.target.value === '' ? '' : Number(e.target.value) } }
                                    }))}
                                    placeholder="e.g. 8"
                                    className="w-full border border-green-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-400" />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {Object.values(form.agentTargets).filter(t => t?.s1 || t?.s2).length} of {selectedAgents.length} agents have targets set
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Slabs — hidden for team_month_end (uses monthEndPayouts + agentTargets instead) */}
          {form.type === 'team_month_end' ? null : <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Incentive Slabs</label>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-bold uppercase bg-brand-50 text-brand-600">
                    <th className="px-3 py-2 text-left w-8">#</th>
                    {form.type === 'sales_or_revenue' ? (
                      <>
                        <th className="px-3 py-2 text-left">Sales Count</th>
                        <th className="px-2 py-2 text-center w-16">AND/OR</th>
                        <th className="px-3 py-2 text-left">Revenue (₹)</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-left">
                        {form.type === 'weekly_target_pct' ? '% of Weekly Target'
                          : typeInfo.unit === 'revenue' ? 'Revenue (₹)'
                          : form.type === 'collective' ? 'Combined Team Sales'
                          : 'Sales Count'}
                      </th>
                    )}
                    <th className="px-3 py-2 text-left">Payout (₹)</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.slabs.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-bold text-gray-400">S{i + 1}</td>
                      {form.type === 'sales_or_revenue' ? (
                        <>
                          <td className="px-2 py-2">
                            <input type="number" value={s.salesThreshold} onChange={e => setSlab(i, 'salesThreshold', e.target.value)}
                              placeholder="e.g. 3"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setSlab(i, 'operator', s.operator === 'AND' ? 'OR' : 'AND')}
                              className={`px-2 py-1 rounded-full text-[10px] font-bold border transition-colors ${
                                s.operator === 'AND'
                                  ? 'bg-orange-100 text-orange-700 border-orange-300'
                                  : 'bg-blue-100 text-blue-700 border-blue-300'
                              }`}
                            >
                              {s.operator === 'AND' ? 'AND' : 'OR'}
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={s.revenueThreshold} onChange={e => setSlab(i, 'revenueThreshold', e.target.value)}
                              placeholder="e.g. 180000"
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                            {s.revenueThreshold && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(s.revenueThreshold))}</p>}
                          </td>
                        </>
                      ) : (
                        <td className="px-2 py-2">
                          <input type="number" value={s.threshold} onChange={e => setSlab(i, 'threshold', e.target.value)}
                            placeholder={form.type === 'weekly_target_pct' ? 'e.g. 70' : typeInfo.unit === 'revenue' ? 'e.g. 1250000' : 'e.g. 15'}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                          {s.threshold && form.type === 'weekly_target_pct' && <p className="text-[10px] text-purple-600 mt-0.5 font-semibold">{s.threshold}% of target</p>}
                          {s.threshold && typeInfo.unit === 'revenue' && form.type !== 'weekly_target_pct' && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(s.threshold))}</p>}
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <input type="number" value={s.payout} onChange={e => setSlab(i, 'payout', e.target.value)}
                          placeholder="e.g. 1000" className="w-full border border-green-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                        {s.payout && <p className="text-[10px] text-green-600 mt-0.5 font-semibold">{formatINR(Number(s.payout))}</p>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {form.slabs.length > 1 && (
                          <button type="button" onClick={() => removeSlab(i)}
                            className="p-1 text-gray-300 hover:text-red-400 transition-colors rounded">
                            <X size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-gray-100">
                <button type="button" onClick={addSlab}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors">
                  <Plus size={13} /> Add Slab
                </button>
              </div>
            </div>
          </div>}

          {/* Pin toggle */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setField('pinned', !form.pinned)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.pinned ? 'bg-yellow-400' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pinned ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-gray-600 font-medium">📌 Pin this kicker to top</span>
          </div>

          {/* Status workflow */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Status</label>
            <div className="flex gap-2">
              {STATUSES.map(s => {
                const isSalesOpsLocked = activeUser?.role === 'Sales Ops' && s !== 'Announced'
                return (
                  <button key={s} type="button"
                    onClick={() => !isSalesOpsLocked && setField('status', s)}
                    disabled={isSalesOpsLocked}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isSalesOpsLocked
                        ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                        : form.status === s ? STATUS_COLORS[s] + ' border-transparent' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}>
                    {s}
                  </button>
                )
              })}
            </div>
            {activeUser?.role === 'Sales Ops'
              ? <p className="text-[10px] text-amber-600 mt-1 font-semibold">🔒 Sales Ops kickers require approval — only Hassaan can move to Approved/Paid.</p>
              : <p className="text-[10px] text-gray-400 mt-1">New kickers start as "Announced" — approve once qualification is confirmed, mark Paid once payroll processes it.</p>
            }
          </div>

          {/* Individual overrides */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Individual Payout Overrides (optional)</label>
            <textarea rows={3} value={form.individualOverridesText} onChange={e => setField('individualOverridesText', e.target.value)}
              placeholder={'one per line: email,amount\ne.g. deepika.pal@airtribe.live,5000'}
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
            <p className="text-[10px] text-gray-400 mt-1">Overrides the slab-derived payout for specific people — useful for one-off custom amounts.</p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Internal Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="Any context for payroll/admin — not shown to agents the way the announcement message is"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="flex gap-3">
            {editingId ? (
              <button type="button" onClick={handleCancelEdit}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-sm py-3 rounded-xl transition-colors">
                Cancel Edit
              </button>
            ) : (
              <button type="button" onClick={() => navigate('/kickers')}
                className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-sm py-3 rounded-xl transition-colors">
                Back to Kickers
              </button>
            )}
            <button type="submit" disabled={submitting || eligibleRoles.length === 0}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Megaphone size={15} />
              {submitting ? 'Saving…' : editingId ? 'Save Changes' : 'Announce Kicker 🚀'}
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}
