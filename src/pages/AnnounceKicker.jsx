import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, CheckCircle, ArrowLeft, Pencil, Trash2, ChevronDown, ChevronUp, Zap, BarChart2, Users } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { announceKicker, getKickers, updateKicker, deleteKicker, getSubtree, getDeals } from '../services/api'
import { formatINR } from '../utils/commission'
import { notifKickerAnnounced } from '../services/notifications'
import { notifyKickerAnnounced } from '../services/slack'

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKER_TYPES = [
  { value: 'team_sales',          label: '👥 Team Sales',               desc: 'Team hits X total sales → everyone gets payout',        unit: 'sales',   metric: 'team' },
  { value: 'team_revenue',        label: '👥 Team Revenue',             desc: 'Team hits X revenue total → everyone gets payout',      unit: 'revenue', metric: 'team' },
  { value: 'individual_sales',    label: '👤 Individual Sales',         desc: 'Each person hits X sales → they personally get payout', unit: 'sales',   metric: 'ind'  },
  { value: 'individual_revenue',  label: '👤 Individual Revenue',       desc: 'Each person hits X revenue → they get payout',          unit: 'revenue', metric: 'ind'  },
  { value: 'individual_or',       label: '⚡ Combo — Sales OR Revenue', desc: 'X sales OR Y revenue → person gets payout',             unit: 'or',      metric: 'ind'  },
  { value: 'individual_and',      label: '🎯 Combo — Sales AND Revenue',desc: 'X sales AND Y revenue → person gets payout',            unit: 'and',     metric: 'ind'  },
]

// Roles each announcer level can target
const ANNOUNCE_FOR = {
  Admin:     ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead'],
  SalesHead: ['Agent', 'PreSales', 'Manager', 'VH'],
  VH:        ['Agent', 'PreSales', 'Manager'],
  Manager:   ['Agent', 'PreSales'],
}

// Role hierarchy for "can manage" check (higher index = higher authority)
const ROLE_HIERARCHY = ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead', 'Admin']

const TODAY = new Date().toISOString().split('T')[0]

const EMPTY_SLAB = { threshold: '', salesThreshold: '', revenueThreshold: '', payout: '' }
function emptySlabs() { return [{ ...EMPTY_SLAB }, { ...EMPTY_SLAB }, { ...EMPTY_SLAB }, { ...EMPTY_SLAB }] }

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
  if (kicker.announcedBy === user?.email) return true
  const announcerIdx = ROLE_HIERARCHY.indexOf(kicker.announcedByRole)
  const userIdx      = ROLE_HIERARCHY.indexOf(user?.role)
  return userIdx > announcerIdx
}

// ── Kicker progress computation ───────────────────────────────────────────────
function computeKickerProgress(kicker, allMembers, allDeals) {
  const from   = new Date(kicker.dateFrom).getTime()
  const to     = new Date(kicker.dateTo).getTime() + 86399999
  const minVal = Number(kicker.minSaleValue || 0)
  const type   = kicker.type || 'individual_sales'
  const isTeam     = type.startsWith('team_')
  const isRevType  = type === 'team_revenue' || type === 'individual_revenue'
  const isComboOr  = type === 'individual_or'
  const isComboAnd = type === 'individual_and'

  // Filter members targeted by this kicker
  const targetRoles = new Set(kicker.targetRoles || [])
  const targetTeams = kicker.targetTeams || ['ALL']
  const allTeams    = targetTeams.includes('ALL')

  const targetMembers = allMembers.filter(m => {
    if (!targetRoles.has(m.Role)) return false
    if (allTeams) return true
    if (targetTeams.some(t => t.toLowerCase() === (m.Email || '').toLowerCase())) return true
    if (targetTeams.some(t => t.toLowerCase() === (m.ManagerEmail || '').toLowerCase())) return true
    return false
  })

  // Filter deals: date range + min sale value + target agents only
  const targetEmails = new Set(targetMembers.map(m => (m.Email || '').toLowerCase()))
  const rangeDeals   = allDeals.filter(d => {
    if (!targetEmails.has(d.Email)) return false
    const ts = d.Timestamp || d.PaymentDate
    // Fallback: if no date field, use first day of the deal's month so it's still
    // counted for kickers covering that month (fixes missing-timestamp deals)
    const t = ts ? new Date(ts).getTime() : (d.Month ? new Date(d.Month + '-01').getTime() : NaN)
    if (isNaN(t) || t < from || t > to) return false
    if (minVal > 0 && (d.TotalValue || 0) < minVal) return false
    return true
  })

  // Build per-agent stats
  const stats = {}
  for (const m of targetMembers) {
    const key = (m.Email || '').toLowerCase()
    stats[key] = { name: m.Name || m.Email, email: m.Email, role: m.Role, sales: 0, revenue: 0 }
  }
  for (const d of rangeDeals) {
    if (stats[d.Email]) { stats[d.Email].sales++; stats[d.Email].revenue += d.TotalValue || 0 }
  }

  // Slabs sorted ascending (so we find highest hit via iteration)
  const slabs = (kicker.slabs || [])
    .filter(s => Number(s.payout) > 0)
    .sort((a, b) => {
      if (isComboOr || isComboAnd) return Number(a.salesThreshold) - Number(b.salesThreshold)
      return Number(a.threshold) - Number(b.threshold)
    })

  function getSlabHit(sales, revenue) {
    let best = null
    for (const s of slabs) {
      let hit = false
      if      (isComboOr)  hit = sales >= Number(s.salesThreshold)   || revenue >= Number(s.revenueThreshold)
      else if (isComboAnd) hit = sales >= Number(s.salesThreshold)   && revenue >= Number(s.revenueThreshold)
      else if (isRevType)  hit = revenue >= Number(s.threshold)
      else                 hit = sales   >= Number(s.threshold)
      if (hit) best = s
    }
    return best
  }

  const agentList = Object.values(stats)

  if (isTeam) {
    const totals   = agentList.reduce((acc, a) => { acc.sales += a.sales; acc.revenue += a.revenue; return acc }, { sales: 0, revenue: 0 })
    const slabHit  = getSlabHit(totals.sales, totals.revenue)
    return { kind: 'team', totals, slabHit, agents: agentList, payout: slabHit ? Number(slabHit.payout) : 0, slabs }
  } else {
    const agents      = agentList.map(a => { const sh = getSlabHit(a.sales, a.revenue); return { ...a, slabHit: sh, payout: sh ? Number(sh.payout) : 0 } })
    const eligible    = agents.filter(a => a.slabHit)
    return { kind: 'individual', agents, eligible: eligible.length, totalPayout: eligible.reduce((s, a) => s + a.payout, 0), slabs }
  }
}

// ── ProgressPanel ─────────────────────────────────────────────────────────────
function ProgressPanel({ kicker, progress }) {
  const type      = kicker.type || 'individual_sales'
  const isRevType = type === 'team_revenue' || type === 'individual_revenue'
  const isCombo   = type === 'individual_or' || type === 'individual_and'

  function slabLabel(s, idx) {
    if (isCombo)    return `S${idx+1}: ${s.salesThreshold} sales ${type === 'individual_or' ? 'OR' : 'AND'} ${formatINR(Number(s.revenueThreshold))}`
    if (isRevType)  return `S${idx+1}: ${formatINR(Number(s.threshold))}`
    return `S${idx+1}: ${s.threshold} sales`
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
                {(isRevType || isCombo) && <th className="text-right pb-1 font-semibold">Revenue</th>}
                <th className="text-right pb-1 font-semibold">Slab</th>
                <th className="text-right pb-1 font-semibold">Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map(a => (
                <tr key={a.email} className={a.slabHit ? 'bg-green-50/40' : ''}>
                  <td className="py-1 text-gray-700 font-medium">{a.name}</td>
                  {!isRevType && <td className="py-1 text-right text-gray-600">{a.sales}</td>}
                  {(isRevType || isCombo) && <td className="py-1 text-right text-gray-600">{formatINR(a.revenue)}</td>}
                  <td className="py-1 text-right">
                    {a.slabHit
                      ? <span className="text-green-600 font-bold">S{progress.slabs.indexOf(a.slabHit)+1} ✓</span>
                      : <span className="text-gray-400">—</span>
                    }
                  </td>
                  <td className="py-1 text-right font-semibold text-green-700">{a.payout > 0 ? formatINR(a.payout) : '—'}</td>
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
function ManageCard({ kicker, onEdit, onDelete, progress }) {
  const [delConfirm,    setDelConfirm]    = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [showProgress,  setShowProgress]  = useState(false)

  const active  = kickerIsActive(kicker)
  const past    = kickerIsPast(kicker)

  const statusBadge = past
    ? <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Ended</span>
    : active
      ? <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>
      : <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Upcoming</span>

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden ${past ? 'opacity-70' : ''}`}>
      <div className={`h-1 ${past ? 'bg-gray-200' : 'bg-gradient-to-r from-brand-500 via-purple-500 to-pink-400'}`} />
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1 mb-1">
              {statusBadge}
              {kicker.pinned && <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">📌</span>}
            </div>
            <p className="text-sm font-bold text-gray-900 leading-snug">{kicker.title}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">
              {kicker.dateFrom} → {kicker.dateTo} · by {kicker.announcedByRole}
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
              const type = kicker.type || 'team_sales'
              let desc = ''
              if (type === 'team_sales' || type === 'individual_sales')
                desc = `${s.threshold} sales → ${formatINR(Number(s.payout))}`
              else if (type === 'team_revenue' || type === 'individual_revenue')
                desc = `${formatINR(Number(s.threshold))} → ${formatINR(Number(s.payout))}`
              else if (type === 'individual_or')
                desc = `${s.salesThreshold} sales OR ${formatINR(Number(s.revenueThreshold))} → ${formatINR(Number(s.payout))}`
              else if (type === 'individual_and')
                desc = `${s.salesThreshold} sales AND ${formatINR(Number(s.revenueThreshold))} → ${formatINR(Number(s.payout))}`
              return <p key={i} className="text-[10px] text-gray-600">S{i+1}: {desc}</p>
            })}
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
              {showProgress ? 'Hide Progress' : 'View Agent Progress'}
              {progress.kind === 'individual' && progress.eligible > 0 && (
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

  // Redirect PreSales/Agent — they cannot announce kickers (check actual login role)
  useEffect(() => {
    if (user?.role === 'PreSales' || user?.role === 'Agent') {
      navigate('/kickers', { replace: true })
    }
  }, [user?.role, navigate])

  const BLANK_FORM = {
    title: '', message: '', type: 'team_sales', minSaleValue: '',
    dateFrom: TODAY, dateTo: TODAY,
    targetTeams: ['ALL'], targetRoles: [],
    pinned: false, slabs: emptySlabs(),
  }

  const [form,        setForm]        = useState(BLANK_FORM)
  const [editingId,   setEditingId]   = useState(null)   // null = new, string = editing existing
  const [managers,    setManagers]    = useState([])
  const [allKickers,  setAllKickers]  = useState([])
  const [allDeals,    setAllDeals]    = useState([])
  const [subtreeAll,  setSubtreeAll]  = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  // Use effectiveUser for role-scoping (respects Admin "view as" impersonation)
  const activeUser    = effectiveUser || user
  const eligibleRoles = ANNOUNCE_FOR[activeUser?.role] ?? []
  const typeInfo      = KICKER_TYPES.find(t => t.value === form.type)
  const isCombo       = form.type === 'individual_or' || form.type === 'individual_and'

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

  const loadData = useCallback(async () => {
    const rootEmail = activeUser?.email
    if (!rootEmail) return
    setLoadingList(true)
    try {
      const [ks, tree, deals] = await Promise.all([
        getKickers(),
        getSubtree(rootEmail).catch(() => null),
        getDeals().catch(() => []),
      ])
      setAllKickers(ks)
      setAllDeals(deals)

      const allMembers = flatTree(tree).filter(m => (m.Email || '').toLowerCase() !== rootEmail.toLowerCase())
      setSubtreeAll(allMembers)

      // "Which Teams?" form field — scope to the effective user's role
      if (activeUser?.role === 'Manager') {
        // Manager targets their own direct agents
        setManagers(allMembers.filter(m => (m.ManagerEmail || '').toLowerCase() === rootEmail.toLowerCase()))
      } else {
        const managerRoles = activeUser?.role === 'VH'
          ? ['Manager']
          : activeUser?.role === 'SalesHead'
            ? ['VH', 'Manager']
            : ['VH', 'Manager', 'SalesHead'] // Admin
        setManagers(allMembers.filter(m => managerRoles.includes(m.Role)))
      }
    } catch {}
    finally { setLoadingList(false) }
  }, [activeUser?.email, activeUser?.role])

  useEffect(() => { loadData() }, [loadData])

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function toggleTeam(email) {
    if (email === 'ALL') { setField('targetTeams', ['ALL']); return }
    setForm(p => {
      const prev = p.targetTeams.filter(t => t !== 'ALL')
      return { ...p, targetTeams: prev.includes(email) ? prev.filter(t => t !== email) : [...prev, email] }
    })
  }

  function toggleRole(role) {
    setForm(p => ({
      ...p,
      targetRoles: p.targetRoles.includes(role)
        ? p.targetRoles.filter(r => r !== role)
        : [...p.targetRoles, role],
    }))
  }

  function setSlab(i, field, val) {
    setForm(p => ({ ...p, slabs: p.slabs.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }))
  }

  function handleEdit(kicker) {
    // Pad slabs to 4 rows
    const padded = [...kicker.slabs]
    while (padded.length < 4) padded.push({ ...EMPTY_SLAB })
    setForm({
      title:        kicker.title,
      message:      kicker.message,
      type:         kicker.type || 'team_sales',
      minSaleValue: kicker.minSaleValue || '',
      dateFrom:     kicker.dateFrom,
      dateTo:       kicker.dateTo,
      targetTeams:  kicker.targetTeams || ['ALL'],
      targetRoles:  kicker.targetRoles || [],
      pinned:       kicker.pinned || false,
      slabs:        padded,
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
    if (!form.title.trim())             { setError('Title is required.'); return }
    if (!form.dateFrom || !form.dateTo) { setError('Date range is required.'); return }
    if (form.targetRoles.length === 0)  { setError('Select at least one target role.'); return }
    const filledSlabs = form.slabs.filter(s => s.payout !== '')
    if (!filledSlabs.length)            { setError('Add at least one slab.'); return }

    setSubmitting(true); setError('')
    const cleanSlabs = filledSlabs.map(s => ({
      threshold:        Number(s.threshold        || 0),
      salesThreshold:   Number(s.salesThreshold   || 0),
      revenueThreshold: Number(s.revenueThreshold || 0),
      payout:           Number(s.payout           || 0),
    }))

    try {
      if (editingId) {
        await updateKicker(editingId, {
          Title:       form.title,
          Message:     form.message || '',
          Type:        form.type,
          MinSaleValue:Number(form.minSaleValue || 0),
          DateFrom:    form.dateFrom,
          DateTo:      form.dateTo,
          Slabs:       JSON.stringify(cleanSlabs),
          TargetTeams: JSON.stringify(form.targetTeams || ['ALL']),
          TargetRoles: JSON.stringify(form.targetRoles || []),
          Pinned:      form.pinned ? 'true' : 'false',
        })
      } else {
        await announceKicker({ ...form, slabs: cleanSlabs, minSaleValue: Number(form.minSaleValue || 0) }, activeUser.email, activeUser.role)
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

      {/* ── Manage existing kickers ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-purple-500" />
          <p className="text-sm font-bold text-gray-800">Your Kickers to Manage</p>
          <span className="text-[10px] font-semibold bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">{manageable.length}</span>
        </div>

        {loadingList ? (
          <div className="flex items-center justify-center h-16">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
          </div>
        ) : manageable.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-6 text-center">
            <p className="text-xs text-gray-400">No kickers yet. Create one below.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {manageable.sort((a, b) => new Date(b.announcedAt) - new Date(a.announcedAt)).map(k => (
              <ManageCard
                key={k.id}
                kicker={k}
                onEdit={handleEdit}
                onDelete={handleDelete}
                progress={progressMap[k.id] ?? null}
              />
            ))}
          </div>
        )}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

          {/* Min sale value */}
          {(form.type.includes('sales') || form.type.includes('or') || form.type.includes('and')) && (
            <div>
              <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1.5">Minimum Sale Value (optional)</label>
              <input type="number" value={form.minSaleValue} onChange={e => setField('minSaleValue', e.target.value)}
                placeholder="e.g. 50000 — only sales above this count"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          )}

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
            </div>
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

          {/* Target Teams */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Which Teams?</label>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => toggleTeam('ALL')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  form.targetTeams.includes('ALL') ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                All Teams
              </button>
              {managers.map(m => (
                <button key={m.Email} type="button" onClick={() => toggleTeam(m.Email)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    form.targetTeams.includes(m.Email) ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}>
                  {m.Name || m.Email} {activeUser?.role === 'Manager' ? '' : `(${m.Role})`}
                </button>
              ))}
            </div>
          </div>

          {/* Slabs */}
          <div>
            <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Incentive Slabs (up to 4)</label>
            <div className="rounded-xl overflow-hidden border border-gray-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className={`text-[10px] font-bold uppercase ${isCombo ? 'bg-purple-50 text-purple-600' : 'bg-brand-50 text-brand-600'}`}>
                    <th className="px-3 py-2 text-left w-8">#</th>
                    {isCombo ? (
                      <>
                        <th className="px-3 py-2 text-left">Sales Threshold</th>
                        <th className="px-3 py-2 text-left">Revenue Threshold (₹)</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-left">{typeInfo?.unit === 'sales' ? 'Sales Count' : 'Revenue (₹)'}</th>
                    )}
                    <th className="px-3 py-2 text-left">Payout (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {form.slabs.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-bold text-gray-400">S{i + 1}</td>
                      {isCombo ? (
                        <>
                          <td className="px-2 py-2">
                            <input type="number" value={s.salesThreshold} onChange={e => setSlab(i, 'salesThreshold', e.target.value)}
                              placeholder="e.g. 2" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                          </td>
                          <td className="px-2 py-2">
                            <input type="number" value={s.revenueThreshold} onChange={e => setSlab(i, 'revenueThreshold', e.target.value)}
                              placeholder="e.g. 125000" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                            {s.revenueThreshold && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(s.revenueThreshold))}</p>}
                          </td>
                        </>
                      ) : (
                        <td className="px-2 py-2">
                          <input type="number" value={s.threshold} onChange={e => setSlab(i, 'threshold', e.target.value)}
                            placeholder={typeInfo?.unit === 'sales' ? 'e.g. 15' : 'e.g. 1250000'}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400" />
                          {s.threshold && typeInfo?.unit !== 'sales' && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(s.threshold))}</p>}
                        </td>
                      )}
                      <td className="px-2 py-2">
                        <input type="number" value={s.payout} onChange={e => setSlab(i, 'payout', e.target.value)}
                          placeholder="e.g. 1000" className="w-full border border-green-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-400" />
                        {s.payout && <p className="text-[10px] text-green-600 mt-0.5 font-semibold">{formatINR(Number(s.payout))}</p>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pin toggle */}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setField('pinned', !form.pinned)}
              className={`relative w-11 h-6 rounded-full transition-colors ${form.pinned ? 'bg-yellow-400' : 'bg-gray-200'}`}>
              <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.pinned ? 'translate-x-5' : ''}`} />
            </button>
            <span className="text-sm text-gray-600 font-medium">📌 Pin this kicker to top</span>
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
