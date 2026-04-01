import { useState, useEffect, useCallback } from 'react'
import { Zap, Plus, X, ChevronDown, ChevronUp, Trash2, Clock, Megaphone, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getKickers, announceKicker, deleteKicker, getSubtree, getDeals } from '../services/api'
import { formatINR } from '../utils/commission'

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKER_TYPES = [
  { value: 'team_sales',          label: '👥 Team Sales',             desc: 'Team hits X total sales → everyone gets payout',         unit: 'sales',   metric: 'team'   },
  { value: 'team_revenue',        label: '👥 Team Revenue',           desc: 'Team hits X revenue total → everyone gets payout',       unit: 'revenue', metric: 'team'   },
  { value: 'individual_sales',    label: '👤 Individual Sales',       desc: 'Each person hits X sales → they personally get payout',  unit: 'sales',   metric: 'ind'    },
  { value: 'individual_revenue',  label: '👤 Individual Revenue',     desc: 'Each person hits X revenue → they get payout',           unit: 'revenue', metric: 'ind'    },
  { value: 'individual_or',       label: '⚡ Combo — Sales OR Revenue', desc: 'X sales OR Y revenue → person gets payout',           unit: 'or',      metric: 'ind'    },
  { value: 'individual_and',      label: '🎯 Combo — Sales AND Revenue', desc: 'X sales AND Y revenue → person gets payout',         unit: 'and',     metric: 'ind'    },
]

// Roles each announcer level can target
const ANNOUNCE_FOR = {
  Admin:     ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead'],
  SalesHead: ['Agent', 'PreSales', 'Manager', 'VH'],
  VH:        ['Agent', 'PreSales', 'Manager'],
  Manager:   ['Agent', 'PreSales'],
}

const CAN_ANNOUNCE = Object.keys(ANNOUNCE_FOR)

const TODAY = new Date().toISOString().split('T')[0]

function flatTree(node, acc = []) {
  if (!node) return acc
  acc.push(node)
  ;(node.children || []).forEach(c => flatTree(c, acc))
  return acc
}

// ── Date/time helpers ─────────────────────────────────────────────────────────
function kickerIsActive(k) {
  const now  = Date.now()
  const from = new Date(k.dateFrom).getTime()
  const to   = new Date(k.dateTo).getTime() + 86399999 // end of day
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
function computeProgress(kicker, allDeals) {
  const from = new Date(kicker.dateFrom)
  const to   = new Date(kicker.dateTo); to.setHours(23, 59, 59)

  const inRange = allDeals.filter(d => {
    const dt = new Date(d.Timestamp || d['Payment date'] || d.DealDate || 0)
    return dt >= from && dt <= to
  })

  const rawSales = inRange.length
  const revenue  = inRange.reduce((s, d) => s + Number(d['Total sale Value'] || 0), 0)
  const sales    = kicker.minSaleValue > 0
    ? inRange.filter(d => Number(d['Total sale Value'] || 0) >= kicker.minSaleValue).length
    : rawSales

  const sorted = [...(kicker.slabs || [])].sort((a, b) => {
    const at = Number(a.threshold || a.salesThreshold || 0)
    const bt = Number(b.threshold || b.salesThreshold || 0)
    return at - bt
  })

  const type = kicker.type || 'team_sales'
  let activeSlab = null
  let nextSlab   = null

  for (const slab of sorted) {
    let hit = false
    if      (type === 'team_sales'       || type === 'individual_sales')    hit = sales   >= Number(slab.threshold)
    else if (type === 'team_revenue'     || type === 'individual_revenue')  hit = revenue >= Number(slab.threshold)
    else if (type === 'individual_or')   hit = sales >= Number(slab.salesThreshold) || revenue >= Number(slab.revenueThreshold)
    else if (type === 'individual_and')  hit = sales >= Number(slab.salesThreshold) && revenue >= Number(slab.revenueThreshold)
    if (hit) activeSlab = slab
    else if (!nextSlab) nextSlab = slab
  }

  return { sales, revenue, activeSlab, nextSlab, sorted }
}

// ── Slab label formatter ──────────────────────────────────────────────────────
function slabLabel(slab, type) {
  if (type === 'team_sales' || type === 'individual_sales')
    return `${slab.threshold} sales → ${formatINR(Number(slab.payout))}`
  if (type === 'team_revenue' || type === 'individual_revenue')
    return `${formatINR(Number(slab.threshold))} revenue → ${formatINR(Number(slab.payout))}`
  if (type === 'individual_or')
    return `${slab.salesThreshold} sales OR ${formatINR(Number(slab.revenueThreshold))} → ${formatINR(Number(slab.payout))}`
  if (type === 'individual_and')
    return `${slab.salesThreshold} sales AND ${formatINR(Number(slab.revenueThreshold))} → ${formatINR(Number(slab.payout))}`
  return ''
}

function slabBarPct(slab, type, progress) {
  if (type === 'team_sales' || type === 'individual_sales') {
    return Math.min((progress.sales / Math.max(Number(slab.threshold), 1)) * 100, 100)
  }
  if (type === 'team_revenue' || type === 'individual_revenue') {
    return Math.min((progress.revenue / Math.max(Number(slab.threshold), 1)) * 100, 100)
  }
  if (type === 'individual_or') {
    const sp = progress.sales   / Math.max(Number(slab.salesThreshold),   1)
    const rp = progress.revenue / Math.max(Number(slab.revenueThreshold), 1)
    return Math.min(Math.max(sp, rp) * 100, 100)
  }
  if (type === 'individual_and') {
    const sp = progress.sales   / Math.max(Number(slab.salesThreshold),   1)
    const rp = progress.revenue / Math.max(Number(slab.revenueThreshold), 1)
    return Math.min(Math.min(sp, rp) * 100, 100)
  }
  return 0
}

function nudgeText(slab, type, progress) {
  if (type === 'team_sales' || type === 'individual_sales') {
    const gap = Number(slab.threshold) - progress.sales
    return gap > 0 ? `${gap} more sale${gap > 1 ? 's' : ''} to unlock ${formatINR(Number(slab.payout))}` : null
  }
  if (type === 'team_revenue' || type === 'individual_revenue') {
    const gap = Number(slab.threshold) - progress.revenue
    return gap > 0 ? `${formatINR(gap)} more revenue to unlock ${formatINR(Number(slab.payout))}` : null
  }
  if (type === 'individual_or') {
    const sg = Number(slab.salesThreshold) - progress.sales
    const rg = Number(slab.revenueThreshold) - progress.revenue
    if (sg <= 0 || rg <= 0) return null
    return `${sg} more sales OR ${formatINR(rg)} more revenue to unlock`
  }
  if (type === 'individual_and') {
    const sg = Number(slab.salesThreshold) - progress.sales
    const rg = Number(slab.revenueThreshold) - progress.revenue
    const parts = []
    if (sg > 0) parts.push(`${sg} more sales`)
    if (rg > 0) parts.push(`${formatINR(rg)} more revenue`)
    return parts.length ? parts.join(' AND ') + ' to unlock' : null
  }
  return null
}

// ── KickerCard ────────────────────────────────────────────────────────────────
function KickerCard({ kicker, deals, canDelete, onDelete }) {
  const [expanded, setExpanded]     = useState(false)
  const [delConfirm, setDelConfirm] = useState(false)

  const active   = kickerIsActive(kicker)
  const past     = kickerIsPast(kicker)
  const progress = computeProgress(kicker, deals)
  const type     = kicker.type || 'team_sales'
  const typeInfo = KICKER_TYPES.find(t => t.value === type)
  const isSales  = type.includes('sales') || type.includes('or') || type.includes('and')
  const isRev    = type.includes('revenue') || type.includes('or') || type.includes('and')
  const isTeam   = type.startsWith('team_')

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
      kicker.pinned ? 'border-yellow-300 ring-2 ring-yellow-100' : 'border-gray-200'
    } ${past ? 'opacity-60' : ''}`}>
      {/* Top accent */}
      <div className={`h-1.5 ${past ? 'bg-gray-300' : 'bg-gradient-to-r from-brand-500 via-purple-500 to-pink-400'}`} />

      <div className="px-5 py-4 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {kicker.pinned && <span className="text-[10px] font-bold uppercase bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">📌 Pinned</span>}
              {active && !past && <span className="text-[10px] font-bold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full animate-pulse">🟢 Live</span>}
              {past && <span className="text-[10px] font-bold uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">Ended</span>}
              <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">{typeInfo?.label}</span>
            </div>
            <h3 className="text-base font-bold text-gray-900 leading-snug">{kicker.title}</h3>

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

          {/* Delete */}
          {canDelete && (
            <div className="flex-shrink-0">
              {delConfirm ? (
                <div className="flex gap-2">
                  <button onClick={() => onDelete(kicker.id)} className="text-xs text-red-600 font-semibold hover:underline">Delete</button>
                  <button onClick={() => setDelConfirm(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                </div>
              ) : (
                <button onClick={() => setDelConfirm(true)} className="text-gray-300 hover:text-red-400 transition-colors">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          )}
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

        {/* Live progress stats */}
        {active && (
          <div className="flex gap-2">
            {isSales && (
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${isTeam ? 'bg-blue-50' : 'bg-indigo-50'}`}>
                <p className="text-xl font-black text-blue-700">{progress.sales}</p>
                <p className="text-[10px] text-blue-500 font-semibold">{isTeam ? 'Team' : 'Your'} Sales</p>
              </div>
            )}
            {isRev && (
              <div className={`flex-1 rounded-xl px-3 py-2.5 text-center ${isTeam ? 'bg-green-50' : 'bg-teal-50'}`}>
                <p className="text-sm font-black text-green-700">{formatINR(progress.revenue)}</p>
                <p className="text-[10px] text-green-500 font-semibold">{isTeam ? 'Team' : 'Your'} Revenue</p>
              </div>
            )}
            {progress.activeSlab && (
              <div className="flex-1 rounded-xl px-3 py-2.5 text-center bg-amber-50 border border-amber-200">
                <p className="text-sm font-black text-amber-700">{formatINR(Number(progress.activeSlab.payout))}</p>
                <p className="text-[10px] text-amber-600 font-semibold">🎉 Earned!</p>
              </div>
            )}
          </div>
        )}

        {/* Slabs with progress bars */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Incentive Slabs</p>
          {progress.sorted.map((slab, i) => {
            const hitIdx   = progress.activeSlab ? progress.sorted.indexOf(progress.activeSlab) : -1
            const isHit    = hitIdx >= i
            const isNext   = !isHit && progress.nextSlab === slab
            const barPct   = slabBarPct(slab, type, progress)
            const nudge    = isNext && active ? nudgeText(slab, type, progress) : null
            const label    = slabLabel(slab, type)

            return (
              <div key={i} className={`rounded-xl border p-3 transition-all ${
                isHit  ? 'bg-green-50 border-green-200' :
                isNext ? 'bg-amber-50 border-amber-200' :
                         'bg-gray-50 border-gray-100'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isHit ? 'text-green-600' : isNext ? 'text-amber-500' : 'text-gray-400'}`}>
                      {'①②③④⑤⑥'[i] ?? `${i + 1}`}
                    </span>
                    <span className="text-xs font-semibold text-gray-700">{label}</span>
                  </div>
                  <div className="flex gap-1">
                    {isHit  && <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">✓ Hit!</span>}
                    {isNext && <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">↑ Next</span>}
                  </div>
                </div>

                {/* Progress bar */}
                {active && (
                  <>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isHit ? 'bg-green-500' : isNext ? 'bg-amber-400' : 'bg-gray-300'}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      {nudge && <p className="text-[10px] font-semibold text-amber-600">{nudge}</p>}
                      <p className={`text-[10px] font-bold ml-auto ${isHit ? 'text-green-600' : isNext ? 'text-amber-500' : 'text-gray-400'}`}>{barPct.toFixed(0)}%</p>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Announce Form ─────────────────────────────────────────────────────────────
const EMPTY_SLAB = { threshold: '', salesThreshold: '', revenueThreshold: '', payout: '' }
function emptySlabs() { return [EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB] }

function AnnounceForm({ user, onDone, onCancel }) {
  const [form, setForm] = useState({
    title: '', message: '', type: 'team_sales', minSaleValue: '',
    dateFrom: TODAY, dateTo: TODAY,
    targetTeams: ['ALL'], targetRoles: [],
    pinned: false, slabs: emptySlabs(),
  })
  const [managers, setManagers]     = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState(false)

  const eligibleRoles = ANNOUNCE_FOR[user.role] ?? []
  const typeInfo      = KICKER_TYPES.find(t => t.value === form.type)
  const isCombo       = form.type === 'individual_or' || form.type === 'individual_and'

  useEffect(() => {
    getSubtree(user.email).then(tree => {
      const all = flatTree(tree).filter(m => m.Email !== user.email && ['Manager','VH','SalesHead'].includes(m.Role))
      setManagers(all)
    }).catch(() => {})
  }, [user.email])

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }))

  function toggleTeam(email) {
    if (email === 'ALL') { setField('targetTeams', ['ALL']); return }
    setForm(p => {
      const prev = p.targetTeams.filter(t => t !== 'ALL')
      return { ...p, targetTeams: prev.includes(email) ? prev.filter(t => t !== email) : [...prev, email] }
    })
  }

  function toggleRole(role) {
    setForm(p => ({ ...p, targetRoles: p.targetRoles.includes(role) ? p.targetRoles.filter(r => r !== role) : [...p.targetRoles, role] }))
  }

  function setSlab(i, field, val) {
    setForm(p => ({ ...p, slabs: p.slabs.map((s, idx) => idx === i ? { ...s, [field]: val } : s) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())           { setError('Title is required.'); return }
    if (!form.dateFrom || !form.dateTo) { setError('Date range is required.'); return }
    if (form.targetRoles.length === 0)  { setError('Select at least one target role.'); return }
    const filledSlabs = form.slabs.filter(s => s.payout !== '')
    if (!filledSlabs.length)            { setError('Add at least one slab.'); return }

    setSubmitting(true); setError('')
    try {
      await announceKicker({
        ...form,
        slabs: filledSlabs.map(s => ({
          threshold:        Number(s.threshold        || 0),
          salesThreshold:   Number(s.salesThreshold   || 0),
          revenueThreshold: Number(s.revenueThreshold || 0),
          payout:           Number(s.payout           || 0),
        })),
        minSaleValue: Number(form.minSaleValue || 0),
      }, user.email, user.role)
      setSuccess(true)
      setTimeout(onDone, 1000)
    } catch (err) {
      setError(err?.message ?? 'Failed to announce kicker.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) return (
    <div className="bg-white rounded-2xl border border-green-200 p-10 flex flex-col items-center gap-3 text-center">
      <CheckCircle size={36} className="text-green-500" />
      <p className="text-sm font-bold text-green-700">Kicker announced! 🎉</p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-5 py-4 bg-gradient-to-r from-brand-50 to-purple-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-brand-600" />
          <p className="text-sm font-bold text-gray-800">Announce New Kicker</p>
        </div>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
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
            placeholder="Paste your Slack-style announcement message here…"
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

        {/* Min sale value (for sales types) */}
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
              className="text-xs text-brand-600 font-semibold border border-brand-200 bg-brand-50 px-2.5 py-2 rounded-xl hover:bg-brand-100 whitespace-nowrap">Today Only</button>
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
                {m.Name} ({m.Role})
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
                    <td className="px-3 py-2 font-bold text-gray-400">S{i+1}</td>
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

        <button type="submit" disabled={submitting}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
          <Megaphone size={15} />
          {submitting ? 'Announcing…' : 'Announce Kicker 🚀'}
        </button>
      </div>
    </form>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Kickers() {
  const { user, effectiveUser } = useAuth()
  const { month } = useMonth()

  const [kickers, setKickers]     = useState([])
  const [deals, setDeals]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [tab, setTab]             = useState('active')
  const [announcing, setAnnouncing] = useState(false)

  const canAnnounce = CAN_ANNOUNCE.includes(user?.role)

  // Visibility check: can this user see this kicker?
  function isVisible(k) {
    if (k.announcedBy === effectiveUser?.email) return true
    const roles = k.targetRoles || []
    if (!roles.includes(effectiveUser?.role)) return false
    const teams = k.targetTeams || []
    if (teams.includes('ALL')) return true
    if (teams.includes(effectiveUser?.email)) return true
    if (teams.includes(effectiveUser?.managerEmail)) return true
    return false
  }

  const load = useCallback(async () => {
    if (!effectiveUser?.email) return
    setLoading(true)
    try {
      const [ks, ds] = await Promise.all([
        getKickers(),
        getDeals(null, month),  // load all deals for the month for progress calc
      ])
      setKickers(ks)
      // For team kickers, deals are already all loaded; individual will be filtered by email client-side
      setDeals(ds)
    } catch { /* show empty */ }
    finally { setLoading(false) }
  }, [effectiveUser?.email, month])

  useEffect(() => { load() }, [load])

  const visible  = kickers.filter(isVisible)
  const active   = visible.filter(k => kickerIsActive(k) && !kickerIsPast(k)).sort((a, b) => b.pinned - a.pinned)
  const past     = visible.filter(k => kickerIsPast(k)).sort((a, b) => new Date(b.dateTo) - new Date(a.dateTo))
  const displayed = tab === 'active' ? active : past

  async function handleDelete(id) {
    await deleteKicker(id)
    setKickers(prev => prev.filter(k => k.id !== id))
  }

  function canDelete(k) {
    return k.announcedBy === user?.email || user?.role === 'Admin'
      || (user?.role === 'SalesHead' && !['Admin'].includes(k.announcedByRole))
  }

  // For individual kickers, scope deals to the current user
  function dealsFor(k) {
    const isTeam = k.type?.startsWith('team_')
    if (isTeam) return deals // all deals for team progress
    return deals.filter(d => d.Email === effectiveUser?.email)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
            <Zap size={18} className="text-purple-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Kickers</h2>
            <p className="text-xs text-gray-400">Special incentives & bonus opportunities</p>
          </div>
        </div>
        {canAnnounce && !announcing && (
          <button onClick={() => setAnnouncing(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
            <Plus size={15} /> Announce Kicker
          </button>
        )}
      </div>

      {/* Announce form */}
      {announcing && (
        <AnnounceForm
          user={user}
          onCancel={() => setAnnouncing(false)}
          onDone={() => { setAnnouncing(false); load() }}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('active')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'active' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Zap size={13} className="text-purple-500" />
          Active ({active.length})
        </button>
        <button onClick={() => setTab('past')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'past' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Clock size={13} />
          Past ({past.length})
        </button>
      </div>

      {/* Cards */}
      {displayed.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 flex flex-col items-center gap-3 text-center">
          <Zap size={32} className="text-gray-200" />
          <p className="text-sm font-semibold text-gray-400">
            {tab === 'active' ? 'No active kickers right now. Stay tuned!' : 'No past kickers to show.'}
          </p>
          {canAnnounce && tab === 'active' && (
            <button onClick={() => setAnnouncing(true)} className="text-xs text-brand-600 hover:underline font-semibold">
              + Announce the first kicker
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {displayed.map(k => (
            <KickerCard
              key={k.id}
              kicker={k}
              deals={dealsFor(k)}
              canDelete={canDelete(k)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}
