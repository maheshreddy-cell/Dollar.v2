import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle, Phone, Star, TrendingUp } from 'lucide-react'
import { getCommissionConfig, addSlab, deleteSlab, PS_CALLS_SLABS, PS_SALES_SLABS } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { formatINR } from '../utils/commission'
import { AGENT_TARGET_PRESETS, PRESALES_TARGET_PRESETS } from '../utils/targetPresets'

const INITIAL_FORM = { slabName: '', maxTarget: '', commissionPct: '' }

const AGENT_PRESET_COLORS = {
  basic:   { badge: 'bg-blue-100 text-blue-700',   header: 'bg-blue-50 border-blue-200',   accent: 'text-blue-700'   },
  average: { badge: 'bg-green-100 text-green-700', header: 'bg-green-50 border-green-200', accent: 'text-green-700' },
  pro:     { badge: 'bg-purple-100 text-purple-700', header: 'bg-purple-50 border-purple-200', accent: 'text-purple-700' },
}

const PS_PRESET_COLORS = {
  'ps-basic':    { badge: 'bg-teal-100 text-teal-700',   header: 'bg-teal-50 border-teal-200',   accent: 'text-teal-700',   phase: 'M1' },
  'ps-warm-up':  { badge: 'bg-cyan-100 text-cyan-700',   header: 'bg-cyan-50 border-cyan-200',   accent: 'text-cyan-700',   phase: 'M2' },
  'ps-mob':      { badge: 'bg-orange-100 text-orange-700', header: 'bg-orange-50 border-orange-200', accent: 'text-orange-700', phase: 'M3' },
}

// ── PreSales Phase Card ───────────────────────────────────────────────────────
function PSPhaseCard({ preset }) {
  const colors = PS_PRESET_COLORS[preset.id] ?? PS_PRESET_COLORS['ps-basic']
  const isCallsBased = preset.type === 'presales-calls'

  return (
    <div className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border overflow-hidden">
      {/* Header */}
      <div className={`px-5 py-3.5 border-b ${colors.header}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>
              {colors.phase}
            </span>
            <span className={`text-sm font-bold ${colors.accent}`}>{preset.label}</span>
          </div>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            isCallsBased ? 'bg-teal-100 text-teal-600' : 'bg-orange-100 text-orange-600'
          }`}>
            {isCallsBased ? '📞 Calls + Sales' : '📈 Revenue'}
          </span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{preset.description}</p>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {isCallsBased ? (
          <>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Phone size={12} className="text-teal-500 shrink-0" />
              <span className="dark:text-gray-400">Min. calls per month: <span className="font-bold text-gray-800 dark:text-gray-100">{preset.defaultMinCalls}</span></span>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Star size={12} className="text-cyan-500 shrink-0" />
              <span className="dark:text-gray-400">Incentive tracks: <span className="font-bold text-gray-800 dark:text-gray-100">Calls × rate + Sales × rate</span> (independent)</span>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">See Calls Incentive Rates & Sales Incentive Rates below ↓</p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <TrendingUp size={12} className="text-orange-500 shrink-0" />
              <span>Base revenue target: <span className="font-bold text-gray-800">{formatINR(preset.targetAmount)}</span></span>
            </div>
            {/* Revenue slabs table */}
            <table className="min-w-full text-sm mt-1">
              <thead>
                <tr className="bg-gray-50 dark:bg-surface-hover">
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Revenue (₹)</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Rate %</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preset.slabs.map((slab, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-surface-hover">
                    <td className="px-3 py-2 text-right text-gray-700">{formatINR(slab.targetAmount)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${colors.accent}`}>{slab.commissionPct}%</td>
                    <td className="px-3 py-2 text-right text-gray-600">{formatINR(slab.targetAmount * slab.commissionPct / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CommissionConfig() {
  const { user } = useAuth()
  const [slabs, setSlabs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [form, setForm] = useState(INITIAL_FORM)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [activeTab, setActiveTab] = useState('agent')

  const fetchSlabs = () => {
    return getCommissionConfig()
      .then((data) => {
        const sorted = [...(data ?? [])].sort((a, b) => a.MaxTarget - b.MaxTarget)
        setSlabs(sorted)
      })
      .catch(() => setError('Failed to load commission config.'))
  }

  useEffect(() => {
    fetchSlabs().finally(() => setLoading(false))
  }, [])

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.slabName.trim()) { setFormError('Slab name is required.'); return }
    if (!form.maxTarget || Number(form.maxTarget) <= 0) { setFormError('Enter a valid max target.'); return }
    if (!form.commissionPct || Number(form.commissionPct) <= 0) { setFormError('Enter a valid commission %.'); return }
    setSubmitting(true)
    try {
      await addSlab({
        SlabName: form.slabName.trim(),
        MaxTarget: Number(form.maxTarget),
        CommissionPct: Number(form.commissionPct),
      }, user.email)
      setForm(INITIAL_FORM)
      setShowForm(false)
      await fetchSlabs()
    } catch (err) {
      setFormError(err?.message ?? 'Failed to add slab.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (slabName) => {
    setDeleting(true)
    try {
      await deleteSlab(slabName)
      setConfirmDelete(null)
      await fetchSlabs()
    } catch (err) {
      setError(err?.message ?? 'Failed to delete slab.')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const TABS = [
    { id: 'agent',    label: 'Agent Rates' },
    { id: 'presales', label: 'PreSales Rates' },
    { id: 'other',    label: 'Manager / VH / SalesHead' },
  ]

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">Commission Config</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 dark:bg-surface-card rounded-xl p-1 w-fit flex-wrap border dark:border-surface-border">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-surface-muted text-gray-800 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Agent Presets Tab ── */}
      {activeTab === 'agent' && (
        <div className="space-y-5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Three fixed commission rate tiers for Agents. When assigning a target to an Agent, select one of these rate types.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {AGENT_TARGET_PRESETS.map((preset) => {
              const colors = AGENT_PRESET_COLORS[preset.id]
              return (
                <div key={preset.id} className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border overflow-hidden">
                  <div className={`px-5 py-3.5 border-b ${colors.header}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${colors.badge}`}>
                        {preset.label}
                      </span>
                      <span className="text-xs text-gray-500">{preset.description}</span>
                    </div>
                  </div>
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-surface-hover">
                      <tr>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Revenue (₹)</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Slab %</th>
                        <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {preset.slabs.map((slab, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-surface-hover">
                          <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">{formatINR(slab.targetAmount)}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${colors.accent}`}>{slab.commissionPct}%</td>
                          <td className="px-4 py-2.5 text-right text-gray-600">{formatINR(slab.targetAmount * slab.commissionPct / 100)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── PreSales Rates Tab ── */}
      {activeTab === 'presales' && (
        <div className="space-y-6">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            PreSales follows a 3-phase ramp-up model. M1 &amp; M2 use a calls + sales incentive track.
            M3 (Make or Break) transitions to a revenue target — same structure as Agent slabs.
          </p>

          {/* Phase preset cards */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">Phase Presets</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PRESALES_TARGET_PRESETS.map(preset => (
                <PSPhaseCard key={preset.id} preset={preset} />
              ))}
            </div>
          </div>

          {/* Calls incentive rates */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              📞 Calls Incentive Rates <span className="font-normal normal-case text-gray-400">(M1 &amp; M2 — rate × total calls scheduled)</span>
            </p>
            <div className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-teal-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-teal-700 uppercase">Min. Calls / Month</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-teal-700 uppercase">Rate per Call</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-teal-700 uppercase">Example (at threshold)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PS_CALLS_SLABS.map((slab, i) => (
                    <tr key={i} className="hover:bg-teal-50/30 dark:hover:bg-surface-hover">
                      <td className="px-5 py-3">
                        <span className="font-bold text-gray-800">{slab.minCalls}+ calls</span>
                        {i === 0 && <span className="ml-2 text-[10px] font-bold text-teal-600 bg-teal-100 px-1.5 py-0.5 rounded-full">Best</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-teal-700">₹{slab.ratePerCall} / call</td>
                      <td className="px-5 py-3 text-right text-gray-500 text-xs">
                        {slab.minCalls} calls → {formatINR(slab.minCalls * slab.ratePerCall)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 dark:bg-surface-hover">
                    <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 italic" colSpan={3}>
                      Below {PS_CALLS_SLABS[PS_CALLS_SLABS.length - 1].minCalls} calls → ₹0 (no incentive)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Sales incentive rates */}
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              🎯 Sales Incentive Rates <span className="font-normal normal-case text-gray-400">(M1 &amp; M2 — rate × total sales closed)</span>
            </p>
            <div className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border overflow-hidden">
              <table className="min-w-full text-sm">
                <thead className="bg-cyan-50">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-cyan-700 uppercase">Min. Sales / Month</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-cyan-700 uppercase">Rate per Sale</th>
                    <th className="text-right px-5 py-3 text-xs font-semibold text-cyan-700 uppercase">Example (at threshold)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {PS_SALES_SLABS.map((slab, i) => (
                    <tr key={i} className="hover:bg-cyan-50/30 dark:hover:bg-surface-hover">
                      <td className="px-5 py-3">
                        <span className="font-bold text-gray-800">{slab.minSales}+ sales</span>
                        {i === 0 && <span className="ml-2 text-[10px] font-bold text-cyan-600 bg-cyan-100 px-1.5 py-0.5 rounded-full">Best</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-cyan-700">₹{slab.ratePerSale.toLocaleString('en-IN')} / sale</td>
                      <td className="px-5 py-3 text-right text-gray-500 text-xs">
                        {slab.minSales} sales → {formatINR(slab.minSales * slab.ratePerSale)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 dark:bg-surface-hover">
                    <td className="px-5 py-3 text-xs text-gray-400 dark:text-gray-500 italic" colSpan={3}>
                      Below {PS_SALES_SLABS[PS_SALES_SLABS.length - 1].minSales} sales → ₹0 (no incentive)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Combined example */}
          <div className="bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/20 dark:to-cyan-950/20 border border-teal-100 dark:border-teal-900 rounded-xl px-5 py-4">
            <p className="text-xs font-bold text-teal-800 dark:text-teal-300 mb-2">💡 Example — Month with 55 calls &amp; 9 sales</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
              <div>
                <p className="text-gray-500">Calls slab</p>
                <p className="font-bold text-teal-700">50+ → ₹30/call</p>
              </div>
              <div>
                <p className="text-gray-500">Calls earnings</p>
                <p className="font-bold text-teal-700">55 × ₹30 = {formatINR(55 * 30)}</p>
              </div>
              <div>
                <p className="text-gray-500">Sales slab</p>
                <p className="font-bold text-cyan-700">8+ → ₹1,000/sale</p>
              </div>
              <div>
                <p className="text-gray-500">Sales earnings</p>
                <p className="font-bold text-cyan-700">9 × ₹1,000 = {formatINR(9 * 1000)}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-teal-100 dark:border-teal-900 flex items-center justify-between">
              <span className="text-xs text-teal-700 dark:text-teal-300 font-semibold">Total Incentive</span>
              <span className="text-base font-bold text-teal-800 dark:text-teal-200">{formatINR(55 * 30 + 9 * 1000)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Manager / VH / SalesHead Tab ── */}
      {activeTab === 'other' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Custom commission slabs for Managers, VH, and SalesHead.
            </p>
            <button
              onClick={() => { setShowForm((v) => !v); setFormError('') }}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Plus size={16} />
              Add Slab
            </button>
          </div>

          {showForm && (
            <form onSubmit={handleAdd} className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">New Slab</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Slab Name *</label>
                  <input
                    name="slabName"
                    value={form.slabName}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g. Manager-Gold"
                    className="w-full border border-gray-200 dark:border-surface-border dark:bg-surface-hover dark:text-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Max Target (₹) *</label>
                  <input
                    name="maxTarget"
                    type="number"
                    min="1"
                    value={form.maxTarget}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g. 5000000"
                    className="w-full border border-gray-200 dark:border-surface-border dark:bg-surface-hover dark:text-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Commission % *</label>
                  <input
                    name="commissionPct"
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={form.commissionPct}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g. 3.5"
                    className="w-full border border-gray-200 dark:border-surface-border dark:bg-surface-hover dark:text-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
                >
                  {submitting ? 'Saving…' : 'Save Slab'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setFormError('') }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="bg-white dark:bg-surface-card rounded-xl border border-gray-200 dark:border-surface-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 dark:border-surface-border">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Custom Slabs — sorted by Max Target</p>
            </div>

            {slabs.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500 py-10 text-center">No slabs configured.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-surface-hover">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Slab Name</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Max Target</th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Commission %</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {slabs.map((slab) => (
                    <tr key={slab.SlabName} className="hover:bg-gray-50 dark:hover:bg-surface-hover">
                      <td className="px-5 py-3.5 font-medium text-gray-800 dark:text-gray-200">{slab.SlabName}</td>
                      <td className="px-5 py-3.5 text-right text-gray-600 dark:text-gray-400">{formatINR(slab.MaxTarget)}</td>
                      <td className="px-5 py-3.5 text-right font-semibold text-green-700">{slab.CommissionPct}%</td>
                      <td className="px-5 py-3.5 text-right">
                        {confirmDelete === slab.SlabName ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-orange-600 flex items-center gap-1">
                              <AlertTriangle size={12} /> Confirm?
                            </span>
                            <button
                              onClick={() => handleDelete(slab.SlabName)}
                              disabled={deleting}
                              className="text-xs bg-red-100 text-red-700 hover:bg-red-200 px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                            >
                              {deleting ? '…' : 'Delete'}
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(slab.SlabName)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
