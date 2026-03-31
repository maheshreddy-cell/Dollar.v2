import { useState, useEffect } from 'react'
import { ChevronRight, CheckCircle, Trash2, PencilLine, Plus } from 'lucide-react'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, getSubtree, assignTarget, deleteTarget, getTargets } from '../services/api'
import { formatINR } from '../utils/commission'
import { ALL_TARGET_PRESETS, AGENT_TARGET_PRESETS, PRESALES_TARGET_PRESETS } from '../utils/targetPresets'
import { clearCache } from '../services/appsScript'
import { ROLE_COLORS } from '../utils/roles'

const PRESET_STYLES = {
  basic:      { card: 'border-blue-300 bg-blue-50 text-blue-800',     table: 'text-blue-700' },
  average:    { card: 'border-green-300 bg-green-50 text-green-800',   table: 'text-green-700' },
  pro:        { card: 'border-purple-300 bg-purple-50 text-purple-800', table: 'text-purple-700' },
  'ps-starter': { card: 'border-teal-300 bg-teal-50 text-teal-800',   table: 'text-teal-700' },
  'ps-mid':     { card: 'border-cyan-300 bg-cyan-50 text-cyan-800',    table: 'text-cyan-700' },
  'ps-full':    { card: 'border-indigo-300 bg-indigo-50 text-indigo-800', table: 'text-indigo-700' },
}

const EMPTY_SLAB = { targetAmount: '', commissionPct: '' }

function normalizeMonth(raw) {
  if (!raw) return '—'
  const str = String(raw).trim()
  if (/^\d{4}-\d{2}$/.test(str)) return str
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return str
}

export default function AssignTargets() {
  const { month: contextMonth } = useMonth()
  const { user, effectiveUser } = useAuth()

  const [team,         setTeam]         = useState([])
  const [selected,     setSelected]     = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')

  // Form month — independent of navbar so manager can set April while viewing March
  const [formMonth,    setFormMonth]    = useState(contextMonth)

  // Form state
  const [existingTarget,   setExisting]       = useState(false)
  const [success,          setSuccess]        = useState(false)
  const [submitting,       setSubmitting]     = useState(false)
  const [formError,        setFormError]      = useState('')
  const [commissionStartDate, setCommissionStartDate] = useState('')
  const [selectedPreset,   setSelectedPreset] = useState(null)
  const [agentTarget,      setAgentTarget]    = useState('')
  const [slabs,            setSlabs]          = useState([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])

  // History / delete state
  const [targetHistory,    setTargetHistory]  = useState([])
  const [historyLoading,   setHistoryLoading] = useState(false)
  const [confirmDeleteMonth, setConfirmDeleteMonth] = useState(null) // month string being confirmed
  const [deletingMonth,    setDeletingMonth]  = useState(null)

  const isAgent   = ['Agent', 'PreSales'].includes(selected?.Role)
  const presets   = selected?.Role === 'PreSales' ? PRESALES_TARGET_PRESETS : AGENT_TARGET_PRESETS

  // ── Load team ────────────────────────────────────────────────────────────────
  // Use effectiveUser so ViewAs mode scopes the team to the viewed person,
  // not the real admin's entire org.
  useEffect(() => {
    if (!effectiveUser?.email) return
    setLoading(true)
    setTeam([])
    setSelected(null)

    const viewEmail = effectiveUser.email
    const canSeeAll = ['Admin', 'SalesHead'].includes(effectiveUser.role)
    const fetch = canSeeAll
      ? getSubtree(viewEmail).then(tree => {
          const flat = []
          const walk = n => { if (!n) return; flat.push(n); (n.children || []).forEach(walk) }
          walk(tree)
          return flat.filter(m => m.Email !== viewEmail)
        })
      : getTeam(viewEmail).then(d => d ?? [])

    fetch
      .then(setTeam)
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }, [effectiveUser?.email, effectiveUser?.role])

  // ── When member selected: reset form + reload history ────────────────────────
  useEffect(() => {
    if (!selected) { setTargetHistory([]); return }
    setConfirmDeleteMonth(null)
    reloadHistory()
  }, [selected])

  // ── When formMonth changes: reload existing target into form ──────────────────
  useEffect(() => {
    if (!selected) return
    resetFormFields()
    setFormError('')
    setSuccess(false)
    setConfirmDeleteMonth(null)

    getTargets(selected.Email, formMonth).then(res => {
      if (!res.length) { setExisting(false); return }
      const t = res[0]
      setExisting(true)
      setCommissionStartDate(t.CommissionStartDate?.split('T')[0] ?? '')

      if (['Agent', 'PreSales'].includes(selected.Role)) {
        const savedId = String(t.CommissionPct || '').trim().toLowerCase()
        const matched = presets.find(p => p.id === savedId)
        setSelectedPreset(matched?.id ?? null)
        setAgentTarget(t.TargetAmount ? String(t.TargetAmount) : '')
      } else {
        try {
          const parsed = JSON.parse(t.CommissionEndDate || '[]')
          if (Array.isArray(parsed) && parsed.length) {
            setSlabs(parsed.map(s => ({ targetAmount: String(s.targetAmount ?? ''), commissionPct: String(s.commissionPct ?? '') })))
            return
          }
        } catch { /* fall through */ }
        setSlabs([
          { targetAmount: String(t.TargetAmount ?? ''), commissionPct: String(t.CommissionPct ?? '') },
          EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB,
        ])
      }
    }).catch(() => {})
  }, [selected, formMonth])

  // Auto-fill target amount when preset changes
  useEffect(() => {
    if (!selectedPreset) return
    const preset = presets.find(p => p.id === selectedPreset)
    if (preset && !agentTarget) setAgentTarget(String(preset.slabs[0].targetAmount))
  }, [selectedPreset])

  function resetFormFields() {
    setExisting(false)
    setSelectedPreset(null)
    setAgentTarget('')
    setSlabs([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])
    setCommissionStartDate('')
  }

  function reloadHistory() {
    setHistoryLoading(true)
    getTargets(selected?.Email, null)
      .then(res => {
        // Deduplicate by month, keep latest per month
        const byMonth = new Map()
        for (const t of (res ?? [])) {
          const m = normalizeMonth(t.Month ?? t.month)
          if (!byMonth.has(m)) byMonth.set(m, t)
        }
        setTargetHistory([...byMonth.values()].sort((a, b) => {
          const ma = normalizeMonth(a.Month ?? a.month)
          const mb = normalizeMonth(b.Month ?? b.month)
          return mb.localeCompare(ma) // newest first
        }))
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccess(false)

    if (isAgent) {
      if (!selectedPreset) { setFormError('Please select a commission rate type.'); return }
      if (!agentTarget || Number(agentTarget) <= 0) { setFormError('Enter a valid target amount.'); return }
    } else {
      const filled = slabs.filter(s => s.targetAmount !== '' || s.commissionPct !== '')
      if (!filled.length) { setFormError('Add at least one slab.'); return }
      for (let i = 0; i < filled.length; i++) {
        if (!filled[i].targetAmount || Number(filled[i].targetAmount) <= 0) { setFormError(`Slab ${i+1}: target amount required.`); return }
        if (filled[i].commissionPct === '' || Number(filled[i].commissionPct) < 0) { setFormError(`Slab ${i+1}: commission % required.`); return }
      }
    }

    setSubmitting(true)
    try {
      const preset = isAgent ? presets.find(p => p.id === selectedPreset) : null
      await assignTarget({
        email:               selected.Email,
        month:               formMonth,
        targetAmount:        isAgent ? Number(agentTarget) : Math.max(...slabs.filter(s => s.targetAmount).map(s => Number(s.targetAmount))),
        presetId:            isAgent ? selectedPreset : undefined,
        commissionPct:       isAgent ? undefined : Number(slabs.filter(s => s.targetAmount)[0]?.commissionPct ?? 0),
        commissionStartDate: commissionStartDate || undefined,
        slabs:               isAgent
          ? preset.slabs.map(s => ({ targetAmount: s.targetAmount, commissionPct: s.commissionPct }))
          : slabs.filter(s => s.targetAmount).map(s => ({ targetAmount: Number(s.targetAmount), commissionPct: Number(s.commissionPct) })),
      }, user.email)
      setSuccess(true)
      setExisting(true)
      clearCache()
      reloadHistory()
    } catch (err) {
      setFormError(err?.message ?? 'Failed to assign target.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Delete a specific month's target ─────────────────────────────────────────
  const handleDeleteMonth = async (mon) => {
    setDeletingMonth(mon)
    try {
      await deleteTarget(selected.Email, mon)
      clearCache()
      // If we deleted the currently-shown month, reset form
      if (mon === formMonth) {
        resetFormFields()
        setSuccess(false)
      }
      setConfirmDeleteMonth(null)
      reloadHistory()
    } catch {
      setFormError('Failed to delete target.')
    } finally {
      setDeletingMonth(null)
    }
  }

  const updateSlab = (i, field, val) =>
    setSlabs(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const previewPreset = selectedPreset ? presets.find(p => p.id === selectedPreset) : null

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Assign Targets</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Team list ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Team ({team.length})
            </p>
          </div>
          {team.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No team members found.</p>
          ) : (
            <div className="divide-y divide-gray-50 overflow-y-auto max-h-[75vh]">
              {team.map(member => (
                <button
                  key={member.Email}
                  onClick={() => { setSelected(member); setFormMonth(contextMonth) }}
                  className={`w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                    selected?.Email === member.Email ? 'bg-brand-50' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{member.Name}</p>
                    <p className="text-xs text-gray-400">{member.Email}</p>
                    <span className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'}`}>
                      {member.Role}
                    </span>
                  </div>
                  <ChevronRight size={16} className={selected?.Email === member.Email ? 'text-brand-600' : 'text-gray-300'} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right pane ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">Select a team member to assign or manage their targets.</p>
            </div>
          ) : (
            <>
              {/* ── Target History table ── */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{selected.Name}</p>
                    <p className="text-xs text-gray-400">{selected.Email}</p>
                  </div>
                  <button
                    onClick={() => {
                      // prompt for a new month
                      const next = prompt('Enter month to assign (YYYY-MM):', formMonth)
                      if (next && /^\d{4}-\d{2}$/.test(next.trim())) setFormMonth(next.trim())
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-600 border border-brand-200 hover:bg-brand-50 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus size={13} /> New Month
                  </button>
                </div>

                {historyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
                  </div>
                ) : targetHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No targets assigned yet. Use the form below to assign the first one.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left font-medium">Month</th>
                          <th className="px-4 py-2.5 text-right font-medium">Target</th>
                          <th className="px-4 py-2.5 text-left font-medium">Tier / Rate</th>
                          <th className="px-4 py-2.5 text-left font-medium">Incentive Start</th>
                          <th className="px-4 py-2.5 text-center font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {targetHistory.map((t) => {
                          const mon      = normalizeMonth(t.Month ?? t.month)
                          const rate     = String(t.CommissionPct ?? t.commissionPct ?? '')
                          const preset   = ALL_TARGET_PRESETS.find(p => p.id === rate.trim().toLowerCase())
                          const rateLabel = preset ? `${preset.label} Tier` : (rate ? `${rate}%` : '—')
                          const start    = t.CommissionStartDate ?? t.commissionStartDate ?? ''
                          const isCurrent = mon === formMonth
                          const isDeleting = deletingMonth === mon
                          const isConfirm  = confirmDeleteMonth === mon

                          return (
                            <tr key={mon} className={`transition-colors ${isCurrent ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3">
                                <span className={`font-medium ${isCurrent ? 'text-brand-700' : 'text-gray-700'}`}>{mon}</span>
                                {isCurrent && <span className="ml-2 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-semibold">editing</span>}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-800">
                                {formatINR(Number(t.TargetAmount ?? t.targetAmount ?? 0))}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  preset?.id === 'basic'   ? 'bg-blue-50 text-blue-700' :
                                  preset?.id === 'average' ? 'bg-green-50 text-green-700' :
                                  preset?.id === 'pro'     ? 'bg-purple-50 text-purple-700' :
                                                             'bg-gray-100 text-gray-600'
                                }`}>{rateLabel}</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-400">
                                {start ? start.split('T')[0] : '—'}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {/* Edit button */}
                                  <button
                                    type="button"
                                    onClick={() => setFormMonth(mon)}
                                    className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 px-2 py-1 rounded-lg transition-colors"
                                  >
                                    <PencilLine size={11} /> Edit
                                  </button>

                                  {/* Delete inline confirm */}
                                  {isConfirm ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={isDeleting}
                                        onClick={() => handleDeleteMonth(mon)}
                                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg font-medium disabled:opacity-60"
                                      >
                                        {isDeleting ? '…' : 'Confirm'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteMonth(null)}
                                        className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteMonth(mon)}
                                      className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 border border-red-100 hover:border-red-300 px-2 py-1 rounded-lg transition-colors"
                                    >
                                      <Trash2 size={11} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Assignment form ── */}
              <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
                {/* Month picker inside the form */}
                <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-gray-100">
                  <div>
                    <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                      Assigning target for
                    </p>
                    <input
                      type="month"
                      value={formMonth}
                      onChange={e => setFormMonth(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  {existingTarget && (
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-full font-medium">
                      Target exists for {formMonth} — editing
                    </span>
                  )}
                </div>

                {/* Incentive Start Date */}
                <div className="w-full sm:w-64">
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">Incentive Start Date</label>
                  <input
                    type="date"
                    value={commissionStartDate}
                    onChange={e => setCommissionStartDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {isAgent ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">
                        Commission Rate Type
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {presets.map(preset => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              setSelectedPreset(preset.id)
                              setAgentTarget(String(preset.slabs[0].targetAmount))
                            }}
                            className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                              selectedPreset === preset.id
                                ? PRESET_STYLES[preset.id].card
                                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                            }`}
                          >
                            <p className="text-sm font-semibold">{preset.label}</p>
                            <p className="text-xs mt-0.5 opacity-70">{preset.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedPreset && (
                      <div className="w-full sm:w-64">
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Target Amount (₹)</label>
                        <input
                          type="number"
                          min="1"
                          value={agentTarget}
                          onChange={e => setAgentTarget(e.target.value)}
                          placeholder="e.g. 800000"
                          className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        {agentTarget && (
                          <p className="text-xs text-gray-400 mt-1">= {formatINR(Number(agentTarget))}</p>
                        )}
                      </div>
                    )}

                    {previewPreset && (
                      <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            {previewPreset.label} — Incentive Slabs
                          </p>
                        </div>
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Revenue (₹)</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Rate</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Incentive</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {previewPreset.slabs.map((s, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 text-right text-gray-700">{formatINR(s.targetAmount)}</td>
                                <td className={`px-4 py-2 text-right font-semibold ${PRESET_STYLES[previewPreset.id].table}`}>{s.commissionPct}%</td>
                                <td className="px-4 py-2 text-right text-gray-600">{formatINR(s.targetAmount * s.commissionPct / 100)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Incentive Slabs</label>
                      <button
                        type="button"
                        onClick={() => setSlabs(prev => [...prev, { ...EMPTY_SLAB }])}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        + Add Slab
                      </button>
                    </div>
                    <div className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-3 px-1">
                      <div />
                      <p className="text-xs font-medium text-gray-400">Min. Threshold (₹)</p>
                      <p className="text-xs font-medium text-gray-400">Commission %</p>
                      <div />
                    </div>
                    {slabs.map((slab, i) => (
                      <div key={i} className="grid grid-cols-[2rem_1fr_1fr_2rem] gap-3 items-center">
                        <span className="text-xs font-semibold text-gray-400 text-center">S{i+1}</span>
                        <input
                          type="number" min="0" placeholder="e.g. 500000"
                          value={slab.targetAmount}
                          onChange={e => updateSlab(i, 'targetAmount', e.target.value)}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <input
                          type="number" min="0" max="100" step="0.1" placeholder="e.g. 2"
                          value={slab.commissionPct}
                          onChange={e => updateSlab(i, 'commissionPct', e.target.value)}
                          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                        <button
                          type="button"
                          onClick={() => slabs.length > 1 && setSlabs(prev => prev.filter((_, idx) => idx !== i))}
                          disabled={slabs.length <= 1}
                          className="text-gray-300 hover:text-red-400 disabled:opacity-0 text-lg leading-none"
                        >×</button>
                      </div>
                    ))}
                    {slabs.some(s => s.targetAmount) && (
                      <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3 flex items-center justify-between">
                        <p className="text-xs font-medium text-brand-700">Top Slab Target</p>
                        <p className="text-sm font-bold text-brand-700">
                          {formatINR(Math.max(...slabs.map(s => Number(s.targetAmount) || 0)))}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{formError}</div>
                )}
                {success && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                    <CheckCircle size={16} /> Target assigned for {formMonth} successfully.
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
                >
                  {submitting ? 'Saving…' : existingTarget ? `Update ${formMonth}` : `Assign for ${formMonth}`}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
