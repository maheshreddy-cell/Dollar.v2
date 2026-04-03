import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Megaphone, X, CheckCircle, ArrowLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { announceKicker, getSubtree } from '../services/api'
import { formatINR } from '../utils/commission'

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

const TODAY = new Date().toISOString().split('T')[0]

const EMPTY_SLAB = { threshold: '', salesThreshold: '', revenueThreshold: '', payout: '' }
function emptySlabs() { return [EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB] }

function flatTree(node, acc = []) {
  if (!node) return acc
  acc.push(node)
  ;(node.children || []).forEach(c => flatTree(c, acc))
  return acc
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnnounceKicker() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    title: '', message: '', type: 'team_sales', minSaleValue: '',
    dateFrom: TODAY, dateTo: TODAY,
    targetTeams: ['ALL'], targetRoles: [],
    pinned: false, slabs: emptySlabs(),
  })
  const [managers,    setManagers]    = useState([])
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState(false)

  const eligibleRoles = ANNOUNCE_FOR[user?.role] ?? []
  const typeInfo      = KICKER_TYPES.find(t => t.value === form.type)
  const isCombo       = form.type === 'individual_or' || form.type === 'individual_and'

  useEffect(() => {
    if (!user?.email) return
    getSubtree(user.email).then(tree => {
      const all = flatTree(tree).filter(m => m.Email !== user.email && ['Manager','VH','SalesHead'].includes(m.Role))
      setManagers(all)
    }).catch(() => {})
  }, [user?.email])

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

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim())             { setError('Title is required.'); return }
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
    } catch (err) {
      setError(err?.message ?? 'Failed to announce kicker.')
      setSubmitting(false)
    }
  }

  if (success) return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="bg-white rounded-2xl border border-green-200 p-12 flex flex-col items-center gap-4 text-center shadow-sm">
        <CheckCircle size={48} className="text-green-500" />
        <p className="text-lg font-bold text-green-700">Kicker announced! 🎉</p>
        <p className="text-sm text-gray-400">Your incentive is now live for the selected teams and roles.</p>
        <div className="flex gap-3 mt-2">
          <button onClick={() => navigate('/kickers')} className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            View Kickers
          </button>
          <button onClick={() => { setSuccess(false); setForm({ title: '', message: '', type: 'team_sales', minSaleValue: '', dateFrom: TODAY, dateTo: TODAY, targetTeams: ['ALL'], targetRoles: [], pinned: false, slabs: emptySlabs() }) }}
            className="border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Announce Another
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-5">

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
          <p className="text-xs text-gray-400">Create a new incentive for your team</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-5 py-4 bg-gradient-to-r from-brand-50 to-purple-50 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">New Kicker Details</p>
          <p className="text-xs text-gray-400 mt-0.5">
            As <span className="font-semibold text-brand-700">{user?.role}</span> you can announce kickers for: {eligibleRoles.join(', ')}
          </p>
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
            <button type="button" onClick={() => navigate('/kickers')}
              className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-sm py-3 rounded-xl transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={submitting || eligibleRoles.length === 0}
              className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold text-sm py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
              <Megaphone size={15} />
              {submitting ? 'Announcing…' : 'Announce Kicker 🚀'}
            </button>
          </div>

        </div>
      </form>
    </div>
  )
}
