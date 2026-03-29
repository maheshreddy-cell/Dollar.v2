import { useState, useEffect } from 'react'
import { ChevronRight, CheckCircle, Trash2 } from 'lucide-react'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, getSubtree, assignTarget, deleteTarget, getTargets } from '../services/api'
import { formatINR } from '../utils/commission'
import { AGENT_TARGET_PRESETS } from '../utils/targetPresets'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
}

const PRESET_STYLES = {
  basic:   { card: 'border-blue-300 bg-blue-50 text-blue-800',   table: 'text-blue-700' },
  average: { card: 'border-green-300 bg-green-50 text-green-800', table: 'text-green-700' },
  pro:     { card: 'border-purple-300 bg-purple-50 text-purple-800', table: 'text-purple-700' },
}

const EMPTY_SLAB = { targetAmount: '', commissionPct: '' }

export default function AssignTargets() {
  const { month } = useMonth()
  const { user }  = useAuth()

  const [team, setTeam]               = useState([])
  const [selected, setSelected]       = useState(null)
  const [existingTarget, setExisting] = useState(false)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [formError, setFormError]     = useState('')

  // Shared
  const [commissionStartDate, setCommissionStartDate] = useState('')

  // Agent-specific
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [agentTarget, setAgentTarget]       = useState('')   // manager-entered target amount

  // Non-agent
  const [slabs, setSlabs] = useState([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])

  const isAgent = selected?.Role === 'Agent'

  // ── Load team ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const canSeeAll = ['Admin', 'SalesHead'].includes(user.role)
    const fetch = canSeeAll
      ? getSubtree(user.email).then(tree => {
          const flat = []
          const walk = n => { if (!n) return; flat.push(n); (n.children || []).forEach(walk) }
          walk(tree)
          return flat.filter(m => m.Email !== user.email)
        })
      : getTeam(user.email).then(d => d ?? [])

    fetch
      .then(setTeam)
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Load existing target when member selected ────────────────────────────────
  useEffect(() => {
    if (!selected) return
    setExisting(false)
    setSuccess(false)
    setFormError('')
    setConfirmDelete(false)
    setSelectedPreset(null)
    setAgentTarget('')
    setSlabs([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])
    setCommissionStartDate('')

    getTargets(selected.Email, month).then(res => {
      if (!res.length) return
      const t = res[0]
      setExisting(true)
      setCommissionStartDate(t.CommissionStartDate?.split('T')[0] ?? '')

      if (selected.Role === 'Agent') {
        const savedId = String(t.CommissionPct || '').trim().toLowerCase()
        const matched = AGENT_TARGET_PRESETS.find(p => p.id === savedId)
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
  }, [selected, month])

  // Auto-fill target amount when preset changes (first slab threshold as default)
  useEffect(() => {
    if (!selectedPreset) return
    const preset = AGENT_TARGET_PRESETS.find(p => p.id === selectedPreset)
    if (preset && !agentTarget) {
      setAgentTarget(String(preset.slabs[0].targetAmount))
    }
  }, [selectedPreset])

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
      const preset = isAgent ? AGENT_TARGET_PRESETS.find(p => p.id === selectedPreset) : null
      await assignTarget({
        email:               selected.Email,
        month,
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
    } catch (err) {
      setFormError(err?.message ?? 'Failed to assign target.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setFormError('')
    try {
      await deleteTarget(selected.Email, month)
      setExisting(false)
      setSuccess(false)
      setConfirmDelete(false)
      setSelectedPreset(null)
      setAgentTarget('')
      setSlabs([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])
      setCommissionStartDate('')
    } catch {
      setFormError('Failed to delete target.')
    } finally {
      setDeleting(false)
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

  const previewPreset = selectedPreset ? AGENT_TARGET_PRESETS.find(p => p.id === selectedPreset) : null

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Assign Targets — {month}</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Team list */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Direct Reports ({team.length})
            </p>
          </div>
          {team.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No direct reports.</p>
          ) : (
            <div className="divide-y divide-gray-50 overflow-y-auto max-h-[70vh]">
              {team.map(member => (
                <button
                  key={member.Email}
                  onClick={() => setSelected(member)}
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

        {/* Form */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">Select a team member to assign a target.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{selected.Name}</h3>
                  <p className="text-xs text-gray-400">{selected.Email}</p>
                </div>
                {existingTarget && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
                      Target exists for {month}
                    </span>
                    {confirmDelete ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-red-600 font-medium">Confirm delete?</span>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={deleting}
                          className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
                        >
                          {deleting ? 'Deleting…' : 'Yes, delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Commission Start Date */}
              <div className="w-full sm:w-64">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Commission Start Date</label>
                <input
                  type="date"
                  value={commissionStartDate}
                  onChange={e => setCommissionStartDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {isAgent ? (
                <div className="space-y-4">
                  {/* Preset selector */}
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide block mb-2">
                      Commission Rate Type
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                      {AGENT_TARGET_PRESETS.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setSelectedPreset(preset.id)
                            // Reset target so auto-fill kicks in
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

                  {/* Target amount input */}
                  {selectedPreset && (
                    <div className="w-full sm:w-64">
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">
                        Target Amount (₹)
                      </label>
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

                  {/* Preview commission slabs */}
                  {previewPreset && (
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          {previewPreset.label} — Commission Slabs
                        </p>
                      </div>
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Revenue (₹)</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Rate</th>
                            <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Commission</th>
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
                /* Non-agent: manual slabs */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Commission Slabs</label>
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
                  <CheckCircle size={16} /> Target assigned successfully.
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
              >
                {submitting ? 'Saving…' : existingTarget ? 'Update Target' : 'Assign Target'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
