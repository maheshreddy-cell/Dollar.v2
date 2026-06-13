import { useState, useEffect } from 'react'
import { ChevronRight, CheckCircle, Trash2, PencilLine, Plus, Search } from 'lucide-react'
import { useNotificationSound } from '../hooks/useNotificationSound'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, getSubtree, assignTarget, deleteTarget, getTargets, assignManagerTarget, deleteManagerTarget, getManagerTargetHistory, getManagerSlabs, MANAGER_TARGET_PROGRAMS, parseSlabsField } from '../services/api'
import { formatINR } from '../utils/commission'
import { ALL_TARGET_PRESETS, AGENT_TARGET_PRESETS, PRESALES_TARGET_PRESETS } from '../utils/targetPresets'
import { clearCache } from '../services/supabase'
import { ROLE_COLORS } from '../utils/roles'

// Defined outside AssignTargets so React never remounts it on re-render
function SlabInputTable({ slabs, onUpdate, accentClass }) {
  return (
    <div className={`border rounded-xl overflow-hidden ${accentClass}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className={`text-[10px] font-semibold uppercase ${accentClass} border-b`}>
            <th className="px-3 py-2 text-left w-10 text-gray-400">S#</th>
            <th className="px-3 py-2 text-left text-gray-500">Target Amount (₹)</th>
            <th className="px-3 py-2 text-left text-gray-500">Commission %</th>
            <th className="px-3 py-2 text-right text-gray-400">Payout</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {slabs.map((s, i) => (
            <tr key={i} className="bg-white">
              <td className="px-3 py-1.5 text-xs font-bold text-gray-300">S{i+1}</td>
              <td className="px-3 py-1.5">
                <input type="number" value={s.targetAmount}
                  onChange={e => onUpdate(i, 'targetAmount', e.target.value)}
                  placeholder="e.g. 7200000"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
                {s.targetAmount && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(s.targetAmount))}</p>}
              </td>
              <td className="px-3 py-1.5">
                <input type="number" step="0.01" value={s.commissionPct}
                  onChange={e => onUpdate(i, 'commissionPct', e.target.value)}
                  placeholder="e.g. 0.1"
                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-brand-300" />
              </td>
              <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-500">
                {s.targetAmount && s.commissionPct ? formatINR(Number(s.targetAmount) * Number(s.commissionPct) / 100) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const PRESET_STYLES = {
  basic:        { card: 'border-blue-300 bg-blue-50 text-blue-800',      table: 'text-blue-700' },
  average:      { card: 'border-green-300 bg-green-50 text-green-800',    table: 'text-green-700' },
  pro:          { card: 'border-purple-300 bg-purple-50 text-purple-800', table: 'text-purple-700' },
  'ps-basic':   { card: 'border-teal-300 bg-teal-50 text-teal-800',      table: 'text-teal-700' },
  'ps-warm-up': { card: 'border-cyan-300 bg-cyan-50 text-cyan-800',      table: 'text-cyan-700' },
  'ps-mob':     { card: 'border-orange-300 bg-orange-50 text-orange-800', table: 'text-orange-700' },
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
  const [roleFilter,   setRoleFilter]   = useState('All')
  const [search,       setSearch]       = useState('')

  // Form month — independent of navbar so manager can set April while viewing March
  const [formMonth,    setFormMonth]    = useState(contextMonth)

  // Form state
  const [existingTarget,   setExisting]       = useState(false)
  const [success,          setSuccess]        = useState(false)
  const [submitting,       setSubmitting]     = useState(false)
  const [formError,        setFormError]      = useState('')

  // Chime when target is successfully assigned
  useNotificationSound(success)
  const [selectedPreset,   setSelectedPreset] = useState(null)
  const [agentTarget,      setAgentTarget]    = useState('')
  const [slabs,            setSlabs]          = useState([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])
  const [minCalls,         setMinCalls]       = useState('')
  const [psTeamWeight,     setPsTeamWeight]   = useState('300000') // 3L default contribution to manager's team target

  // History / delete state
  const [targetHistory,    setTargetHistory]  = useState([])
  const [historyLoading,   setHistoryLoading] = useState(false)
  const [confirmDeleteMonth, setConfirmDeleteMonth] = useState(null) // month string being confirmed
  const [deletingMonth,    setDeletingMonth]  = useState(null)

  // ── Manager-specific state ───────────────────────────────────────────────────
  const EMPTY_MGR_SLAB = { targetAmount: '', commissionPct: '' }
  const INIT_MGR_SLABS = () => [EMPTY_MGR_SLAB, EMPTY_MGR_SLAB, EMPTY_MGR_SLAB, EMPTY_MGR_SLAB]

  // Per-program slabs: { [programId]: { proj: [...], real: [...] } }
  const initAllProgramSlabs = () =>
    Object.fromEntries(MANAGER_TARGET_PROGRAMS.map(p => [p.id, { proj: INIT_MGR_SLABS(), real: INIT_MGR_SLABS() }]))

  const [mgrProjSlabs,    setMgrProjSlabs]   = useState(INIT_MGR_SLABS)
  const [mgrRealSlabs,    setMgrRealSlabs]   = useState(INIT_MGR_SLABS)
  const [mgrProgram,      setMgrProgram]     = useState('all')
  const [programSlabs,    setProgramSlabs]   = useState(initAllProgramSlabs)   // multi-program state
  // Personal contribution per program: { [programId]: string }
  const [progContrib,     setProgContrib]    = useState(() => Object.fromEntries(MANAGER_TARGET_PROGRAMS.map(p => [p.id, ''])))
  const [mgrHistory,      setMgrHistory]     = useState([])
  const [mgrHistoryLoad,  setMgrHistoryLoad] = useState(false)
  const [mgrSubmitting,   setMgrSubmitting]  = useState(false)
  const [mgrSuccess,      setMgrSuccess]     = useState(false)
  const [mgrError,        setMgrError]       = useState('')
  const [mgrConfirmDel,   setMgrConfirmDel]  = useState(null)
  const [mgrDeleting,     setMgrDeleting]    = useState(null)
  // Per-program save state: { [programId]: { submitting, success, error } }
  const [progSaveState,   setProgSaveState]  = useState({})

  // ── Individual target state (for Managers — personal sales target) ────────────
  const INIT_INDIV_SLABS = () => [EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB]
  const [indivTarget,     setIndivTarget]    = useState('')
  const [indivSlabs,      setIndivSlabs]     = useState(INIT_INDIV_SLABS)
  const [indivHistory,    setIndivHistory]   = useState([])
  const [indivHistLoad,   setIndivHistLoad]  = useState(false)
  const [indivSubmit,     setIndivSubmit]    = useState(false)
  const [indivSuccess,    setIndivSuccess]   = useState(false)
  const [indivError,      setIndivError]     = useState('')
  const [indivConfirmDel, setIndivConfirmDel]= useState(null)
  const [indivDeleting,   setIndivDeleting]  = useState(null)

  function getProgState(pid) {
    return progSaveState[pid] || { submitting: false, success: false, error: '' }
  }
  function setProgState(pid, patch) {
    setProgSaveState(prev => ({ ...prev, [pid]: { ...getProgState(pid), ...patch } }))
  }

  const isManagerMember     = ['Manager', 'VH'].includes(selected?.Role)
  const isAgent             = ['Agent', 'PreSales'].includes(selected?.Role)
  const presets             = selected?.Role === 'PreSales' ? PRESALES_TARGET_PRESETS : AGENT_TARGET_PRESETS
  const selectedPresetObj   = presets.find(p => p.id === selectedPreset) || null
  const isPresalesCallsBased = selected?.Role === 'PreSales' && selectedPresetObj?.type === 'presales-calls'

  // ── Load team ────────────────────────────────────────────────────────────────
  // Use effectiveUser so ViewAs mode scopes the team to the viewed person,
  // not the real admin's entire org.
  useEffect(() => {
    if (!effectiveUser?.email) return
    setLoading(true)
    setTeam([])
    setSelected(null)

    const viewEmail = effectiveUser.email
    const canSeeAll = ['Admin', 'SalesHead', 'VH'].includes(effectiveUser.role)
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
    if (!selected) { setTargetHistory([]); setMgrHistory([]); return }
    setConfirmDeleteMonth(null)
    setMgrConfirmDel(null)
    setMgrSuccess(false)
    setMgrError('')
    setMgrProjSlabs(INIT_MGR_SLABS())
    setMgrRealSlabs(INIT_MGR_SLABS())
    if (selected.Role === 'Manager') {
      reloadManagerHistory()
      reloadIndivHistory()
      // Load slabs for reference
      Promise.all([getManagerSlabs('Projected'), getManagerSlabs('Realised')])
        .then(([ps, rs]) => { setMgrProjSlabs(ps); setMgrRealSlabs(rs) })
        .catch(() => {})
    } else {
      reloadHistory()
    }
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

      if (['Agent', 'PreSales'].includes(selected.Role)) {
        const savedId = String(t.CommissionPct || '').trim().toLowerCase()
        const matched = presets.find(p => p.id === savedId)
        setSelectedPreset(matched?.id ?? null)
        const isCallsBased = matched?.type === 'presales-calls'
        if (isCallsBased) {
          setPsTeamWeight(t.TargetAmount ? String(t.TargetAmount) : '300000')
          setMinCalls(t.CommissionStartDate ? String(t.CommissionStartDate) : '40')
        } else {
          setAgentTarget(t.TargetAmount ? String(t.TargetAmount) : '')
        }
      } else {
        const { slabs: parsedSlabs } = parseSlabsField(t.CommissionEndDate)
        if (parsedSlabs.length) {
          setSlabs(parsedSlabs.map(s => ({ targetAmount: String(s.targetAmount ?? ''), commissionPct: String(s.commissionPct ?? '') })))
          return
        }
        setSlabs([
          { targetAmount: String(t.TargetAmount ?? ''), commissionPct: String(t.CommissionPct ?? '') },
          EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB,
        ])
      }
    }).catch(() => {})
  }, [selected, formMonth])

  // Auto-fill target amount and minCalls when preset changes
  useEffect(() => {
    if (!selectedPreset) return
    const preset = presets.find(p => p.id === selectedPreset)
    if (!preset) return
    if (preset.type === 'presales-calls') {
      setAgentTarget('0')
      setMinCalls(String(preset.defaultMinCalls || 40))
    } else if (preset.slabs?.length > 0 && !agentTarget) {
      setAgentTarget(String(preset.slabs[0].targetAmount))
    }
  }, [selectedPreset])

  function resetFormFields() {
    setExisting(false)
    setSelectedPreset(null)
    setAgentTarget('')
    setMinCalls('')
    setPsTeamWeight('300000')
    setSlabs([EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB, EMPTY_SLAB])
  }

  function parseMgrSlabs(json) {
    try {
      const arr = JSON.parse(json || '[]')
      if (Array.isArray(arr) && arr.length) {
        const padded = [...arr.map(s => ({ targetAmount: String(s.targetAmount ?? ''), commissionPct: String(s.commissionPct ?? '') }))]
        while (padded.length < 4) padded.push(EMPTY_MGR_SLAB)
        return padded
      }
    } catch { /* ignore */ }
    return INIT_MGR_SLABS()
  }

  function reloadManagerHistory() {
    setMgrHistoryLoad(true)
    getManagerTargetHistory(selected?.Email)
      .then(res => {
        const history = res ?? []
        setMgrHistory(history)
        // Pre-fill single-program form (legacy)
        loadSlabsForProgram(history, formMonth, mgrProgram)
        // Pre-fill ALL program slabs for multi-program view
        const newSlabs = initAllProgramSlabs()
        const newContrib = Object.fromEntries(MANAGER_TARGET_PROGRAMS.map(p => [p.id, '']))
        for (const p of MANAGER_TARGET_PROGRAMS) {
          const match = history.find(t =>
            String(t.Month || '').trim() === formMonth &&
            (t.programFilter || 'all') === p.id
          )
          if (match) {
            newSlabs[p.id] = {
              proj: parseMgrSlabs(match.ProjectedSlabs),
              real: parseMgrSlabs(match.RealisedSlabs),
            }
            // Read back personalContribution from ProjectedSlabs wrapper
            try {
              const parsed = JSON.parse(match.ProjectedSlabs || '[]')
              if (!Array.isArray(parsed) && parsed.personalContribution) {
                newContrib[p.id] = String(parsed.personalContribution)
              }
            } catch { /* ignore */ }
          }
        }
        setProgramSlabs(newSlabs)
        setProgContrib(newContrib)
        setProgSaveState({})
      })
      .catch(() => {})
      .finally(() => setMgrHistoryLoad(false))
  }

  // Load slabs from history for a specific month+program combo (used by single-prog form)
  function loadSlabsForProgram(history, month, program) {
    const match = history.find(t =>
      String(t.Month || '').trim() === month &&
      (t.programFilter || 'all') === (program || 'all')
    )
    if (match) {
      setMgrProjSlabs(parseMgrSlabs(match.ProjectedSlabs))
      setMgrRealSlabs(parseMgrSlabs(match.RealisedSlabs))
    } else {
      setMgrProjSlabs(INIT_MGR_SLABS())
      setMgrRealSlabs(INIT_MGR_SLABS())
    }
    // Also refresh multi-program slabs for the new month
    const newSlabs = initAllProgramSlabs()
    for (const p of MANAGER_TARGET_PROGRAMS) {
      const m = history.find(t =>
        String(t.Month || '').trim() === month &&
        (t.programFilter || 'all') === p.id
      )
      if (m) newSlabs[p.id] = { proj: parseMgrSlabs(m.ProjectedSlabs), real: parseMgrSlabs(m.RealisedSlabs) }
    }
    setProgramSlabs(newSlabs)
    setProgSaveState({})
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

  function reloadIndivHistory() {
    if (!selected?.Email) return
    setIndivHistLoad(true)
    getTargets(selected.Email, null)
      .then(res => {
        const byMonth = new Map()
        for (const t of (res ?? [])) {
          const m = normalizeMonth(t.Month ?? t.month)
          if (!byMonth.has(m)) byMonth.set(m, t)
        }
        const sorted = [...byMonth.values()].sort((a, b) => {
          const ma = normalizeMonth(a.Month ?? a.month)
          const mb = normalizeMonth(b.Month ?? b.month)
          return mb.localeCompare(ma)
        })
        setIndivHistory(sorted)
        // Pre-fill form from current month if exists
        const current = sorted.find(t => normalizeMonth(t.Month ?? t.month) === formMonth)
        if (current) {
          setIndivTarget(String(current.TargetAmount || ''))
          try {
            const parsed = JSON.parse(current.SlabsJson || '[]')
            if (Array.isArray(parsed) && parsed.length) {
              const padded = parsed.map(s => ({ targetAmount: String(s.targetAmount ?? ''), commissionPct: String(s.commissionPct ?? '') }))
              while (padded.length < 4) padded.push(EMPTY_SLAB)
              setIndivSlabs(padded); return
            }
          } catch { /* ignore */ }
          setIndivSlabs(INIT_INDIV_SLABS())
        } else {
          setIndivTarget('')
          setIndivSlabs(INIT_INDIV_SLABS())
        }
      })
      .catch(() => {})
      .finally(() => setIndivHistLoad(false))
  }

  async function handleSaveIndivTarget() {
    const filledSlabs = indivSlabs.filter(s => s.targetAmount && s.commissionPct)
    if (!indivTarget || filledSlabs.length === 0) {
      setIndivError('Enter a target amount and at least one commission slab.')
      return
    }
    setIndivSubmit(true)
    setIndivError('')
    setIndivSuccess(false)
    try {
      await assignTarget({
        email: selected.Email,
        month: formMonth,
        targetAmount: Number(indivTarget),
        slabs: filledSlabs,
      }, user.email)
      setIndivSuccess(true)
      await reloadIndivHistory()
      setTimeout(() => setIndivSuccess(false), 3000)
    } catch {
      setIndivError('Failed to save individual target.')
    } finally {
      setIndivSubmit(false)
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccess(false)

    if (isAgent) {
      if (!selectedPreset) { setFormError('Please select a commission rate type.'); return }
      if (!isPresalesCallsBased && (!agentTarget || Number(agentTarget) <= 0)) {
        setFormError('Enter a valid target amount.'); return
      }
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
        targetAmount:        isPresalesCallsBased ? Number(psTeamWeight || 300000) : (isAgent ? Number(agentTarget) : Math.max(...slabs.filter(s => s.targetAmount).map(s => Number(s.targetAmount)))),
        presetId:            isAgent ? selectedPreset : undefined,
        commissionPct:       isAgent ? undefined : Number(slabs.filter(s => s.targetAmount)[0]?.commissionPct ?? 0),
        commissionStartDate: isPresalesCallsBased ? String(minCalls || preset?.defaultMinCalls || 40) : undefined,
        slabs:               isPresalesCallsBased
          ? []
          : isAgent
            ? preset.slabs.map(s => ({ targetAmount: s.targetAmount, commissionPct: s.commissionPct }))
            : slabs.filter(s => s.targetAmount).map(s => ({ targetAmount: Number(s.targetAmount), commissionPct: Number(s.commissionPct) })),
      }, user.email)
      setSuccess(true)
      setExisting(true)
      clearCache()
      // Small delay so Apps Script has time to commit the write before we re-read
      await new Promise(r => setTimeout(r, 1200))
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
      if (mon === formMonth) {
        resetFormFields()
        setSuccess(false)
      }
      setConfirmDeleteMonth(null)
      await new Promise(r => setTimeout(r, 1200))
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
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">

          {/* Header */}
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Team ({team.length})
            </p>

            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-ios-gray6 border-0 rounded-ios focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {/* Role filter pills */}
            <div className="flex flex-wrap gap-1">
              {['All', 'Agent', 'PreSales', 'Manager', 'VH'].map(role => {
                const count = role === 'All'
                  ? team.length
                  : team.filter(m => m.Role === role).length
                if (count === 0 && role !== 'All') return null
                return (
                  <button
                    key={role}
                    onClick={() => setRoleFilter(role)}
                    className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors ${
                      roleFilter === role
                        ? 'bg-brand-500 text-white'
                        : 'bg-ios-gray6 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {role} {count > 0 && <span className="opacity-70">({count})</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          {team.length === 0 ? (
            <p className="text-sm text-gray-400 py-8 text-center">No team members found.</p>
          ) : (() => {
            const filtered = team.filter(m => {
              const matchRole = roleFilter === 'All' || m.Role === roleFilter
              const q = search.trim().toLowerCase()
              const matchSearch = !q || m.Name?.toLowerCase().includes(q) || m.Email?.toLowerCase().includes(q)
              return matchRole && matchSearch
            })
            return filtered.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No results for "{search || roleFilter}"</p>
            ) : (
              <div className="divide-y divide-gray-50 overflow-y-auto max-h-[65vh]">
                {filtered.map(member => (
                  <button
                    key={member.Email}
                    onClick={() => { setSelected(member); setFormMonth(contextMonth) }}
                    className={`w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                      selected?.Email === member.Email ? 'bg-brand-50' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{member.Name}</p>
                      <p className="text-xs text-gray-400 truncate">{member.Email}</p>
                      <span className={`inline-block mt-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {member.Role}
                      </span>
                    </div>
                    <ChevronRight size={15} className={`shrink-0 ml-2 ${selected?.Email === member.Email ? 'text-brand-500' : 'text-gray-300'}`} />
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        {/* ── Right pane ── */}
        <div className="lg:col-span-2 space-y-4">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">Select a team member to assign or manage their targets.</p>
            </div>
          ) : isManagerMember ? (
            /* ══ MANAGER: Projected + Realised targets form ══ */
            <div className="space-y-4">
              {/* Header */}
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{selected.Name}</p>
                  <p className="text-xs text-gray-400">{selected.Email} · {selected.Role}</p>
                </div>
                <span className="text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1 rounded-full">
                  {selected.Role} Targets
                </span>
              </div>

              {/* History table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assignment History</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Click Edit to load a month's slabs into the form below</p>
                </div>
                {mgrHistoryLoad ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
                  </div>
                ) : mgrHistory.length === 0 ? (
                  <p className="text-sm text-gray-400 py-6 text-center">No targets assigned yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-400 uppercase bg-gray-50 border-b border-gray-100">
                          <th className="px-4 py-2.5 text-left font-medium">Month</th>
                          <th className="px-4 py-2.5 text-left font-medium">Program</th>
                          <th className="px-4 py-2.5 text-left font-medium">Projected Slabs</th>
                          <th className="px-4 py-2.5 text-left font-medium">Realised Slabs</th>
                          <th className="px-4 py-2.5 text-center font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {mgrHistory.map(t => {
                          const mon = String(t.Month || '').trim()
                          const isDeleting  = mgrDeleting === mon
                          const isConfirm   = mgrConfirmDel === mon
                          const isEditing   = formMonth === mon
                          // Parse slabs for summary display
                          const pSlabs = (() => { try { const a = JSON.parse(t.ProjectedSlabs || '[]'); return Array.isArray(a) ? a.filter(s => s.targetAmount) : [] } catch { return [] } })()
                          const rSlabs = (() => { try { const a = JSON.parse(t.RealisedSlabs  || '[]'); return Array.isArray(a) ? a.filter(s => s.targetAmount) : [] } catch { return [] } })()
                          const pMax = pSlabs.length ? Math.max(...pSlabs.map(s => Number(s.targetAmount))) : 0
                          const rMax = rSlabs.length ? Math.max(...rSlabs.map(s => Number(s.targetAmount))) : 0
                          return (
                            <tr key={mon} className={`transition-colors ${isEditing ? 'bg-brand-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3">
                                <span className={`font-medium ${isEditing ? 'text-brand-700' : 'text-gray-700'}`}>{mon}</span>
                                {isEditing && <span className="ml-2 text-[10px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-semibold">editing</span>}
                              </td>
                              <td className="px-4 py-3">
                                {(() => {
                                  const prog = t.programFilter || 'all'
                                  const colors = { all: 'bg-gray-100 text-gray-600', genai: 'bg-purple-100 text-purple-700', pml: 'bg-blue-100 text-blue-700', bel: 'bg-green-100 text-green-700' }
                                  const label = MANAGER_TARGET_PROGRAMS.find(p => p.id === prog)?.label ?? prog
                                  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors[prog] ?? colors.all}`}>{label}</span>
                                })()}
                              </td>
                              <td className="px-4 py-3">
                                {pSlabs.length > 0 ? (
                                  <span className="text-xs text-blue-700 font-semibold">
                                    {pSlabs.length} slab{pSlabs.length > 1 ? 's' : ''} · up to {formatINR(pMax)}
                                  </span>
                                ) : <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {rSlabs.length > 0 ? (
                                  <span className="text-xs text-green-700 font-semibold">
                                    {rSlabs.length} slab{rSlabs.length > 1 ? 's' : ''} · up to {formatINR(rMax)}
                                  </span>
                                ) : <span className="text-xs text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isConfirm ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={async () => {
                                        setMgrDeleting(mon)
                                        try { await deleteManagerTarget(selected.Email, mon, t.programFilter || 'all'); reloadManagerHistory() }
                                        catch { setMgrError('Delete failed.') }
                                        finally { setMgrDeleting(null); setMgrConfirmDel(null) }
                                      }}
                                      disabled={isDeleting}
                                      className="text-xs text-red-600 hover:underline"
                                    >{isDeleting ? '…' : 'Confirm'}</button>
                                    <button onClick={() => setMgrConfirmDel(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                                  </span>
                                ) : (
                                  <span className="flex items-center justify-center gap-3">
                                    <button
                                      onClick={() => {
                                        setFormMonth(mon)
                                        setMgrProjSlabs(parseMgrSlabs(t.ProjectedSlabs))
                                        setMgrRealSlabs(parseMgrSlabs(t.RealisedSlabs))
                                        setMgrProgram(t.programFilter || 'all')
                                        setMgrSuccess(false)
                                        setMgrError('')
                                      }}
                                      className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1 transition-colors"
                                    >
                                      <PencilLine size={12} /> Edit
                                    </button>
                                    <button onClick={() => setMgrConfirmDel(mon)} className="text-gray-400 hover:text-red-500 transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* ── Month selector ── */}
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0">Month</label>
                <input
                  type="month"
                  value={formMonth}
                  onChange={e => {
                    setFormMonth(e.target.value)
                    loadSlabsForProgram(mgrHistory, e.target.value, mgrProgram)
                  }}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                {mgrHistory.filter(t => String(t.Month || '').trim() === formMonth).length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap ml-2">
                    <span className="text-[10px] text-gray-400">Active:</span>
                    {mgrHistory.filter(t => String(t.Month || '').trim() === formMonth).map(t => {
                      const pid = t.programFilter || 'all'
                      const lbl = MANAGER_TARGET_PROGRAMS.find(p => p.id === pid)?.label ?? pid
                      const dotC = { all: 'bg-gray-500', genai: 'bg-purple-500', pml: 'bg-blue-500', bel: 'bg-teal-500' }
                      return (
                        <span key={pid} className="flex items-center gap-1 text-[10px] font-semibold bg-gray-100 px-2 py-0.5 rounded-full text-gray-600">
                          <span className={`w-1.5 h-1.5 rounded-full ${dotC[pid] ?? 'bg-gray-400'}`} />
                          {lbl}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Per-program assignment cards (all visible at once) ── */}
              {MANAGER_TARGET_PROGRAMS.map(prog => {
                const pid     = prog.id
                const ps      = programSlabs[pid] || { proj: INIT_MGR_SLABS(), real: INIT_MGR_SLABS() }
                const pState  = getProgState(pid)
                const isSaved = mgrHistory.some(t =>
                  String(t.Month || '').trim() === formMonth && (t.programFilter || 'all') === pid
                )

                const COLORS = {
                  all:   { border: 'border-gray-200',   hdr: 'bg-gray-50 border-gray-100',     badge: 'bg-gray-100 text-gray-700',       btn: 'bg-gray-800 hover:bg-gray-900',   projHdr: 'bg-blue-50',  realHdr: 'bg-green-50'  },
                  genai: { border: 'border-purple-200', hdr: 'bg-purple-50 border-purple-100', badge: 'bg-purple-100 text-purple-700',   btn: 'bg-purple-600 hover:bg-purple-700', projHdr: 'bg-purple-50', realHdr: 'bg-purple-50/50' },
                  pml:   { border: 'border-blue-200',   hdr: 'bg-blue-50 border-blue-100',     badge: 'bg-blue-100 text-blue-700',       btn: 'bg-blue-600 hover:bg-blue-700',   projHdr: 'bg-blue-50',  realHdr: 'bg-blue-50/50' },
                  bel:   { border: 'border-teal-200',   hdr: 'bg-teal-50 border-teal-100',     badge: 'bg-teal-100 text-teal-700',       btn: 'bg-teal-600 hover:bg-teal-700',   projHdr: 'bg-teal-50',  realHdr: 'bg-teal-50/50' },
                }[pid] ?? { border: 'border-gray-200', hdr: 'bg-gray-50 border-gray-100', badge: 'bg-gray-100 text-gray-600', btn: 'bg-gray-700 hover:bg-gray-800', projHdr: 'bg-blue-50', realHdr: 'bg-green-50' }

                const updateProjSlab = (i, field, val) =>
                  setProgramSlabs(prev => ({ ...prev, [pid]: { ...prev[pid], proj: prev[pid].proj.map((r, idx) => idx === i ? { ...r, [field]: val } : r) } }))
                const updateRealSlab = (i, field, val) =>
                  setProgramSlabs(prev => ({ ...prev, [pid]: { ...prev[pid], real: prev[pid].real.map((r, idx) => idx === i ? { ...r, [field]: val } : r) } }))

                const handleSave = async () => {
                  setProgState(pid, { error: '', success: false, submitting: true })
                  const toSave = arr => arr.filter(s => s.targetAmount && s.commissionPct)
                    .map(s => ({ targetAmount: Number(s.targetAmount), commissionPct: Number(s.commissionPct) }))
                  const proj = toSave(ps.proj)
                  const real = toSave(ps.real)
                  if (!proj.length && !real.length) {
                    setProgState(pid, { error: 'Enter at least one slab.', submitting: false }); return
                  }
                  try {
                    await assignManagerTarget({
                      email: selected.Email,
                      month: formMonth,
                      projectedSlabs:      proj,
                      realisedSlabs:       real,
                      program:             pid,
                      personalContribution: Number(progContrib[pid] || 0),
                    }, user.email)
                    setProgState(pid, { success: true, submitting: false })
                    clearCache()
                    await new Promise(r => setTimeout(r, 1200))
                    reloadManagerHistory()
                  } catch (err) {
                    setProgState(pid, { error: err?.message ?? 'Failed to save.', submitting: false })
                  }
                }

                return (
                  <div key={pid} className={`bg-white rounded-xl border ${COLORS.border} overflow-hidden`}>
                    {/* Card header */}
                    <div className={`px-5 py-3.5 border-b ${COLORS.hdr} flex items-center justify-between`}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${COLORS.badge}`}>{prog.label}</span>
                        {isSaved && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-green-600">
                            <CheckCircle size={11} /> saved
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400">
                          {pid === 'all' ? 'All deals regardless of Course' : `Deals where Course contains "${prog.label}" keywords`}
                        </span>
                      </div>
                    </div>

                    <div className="px-5 py-4 space-y-4">

                      {/* ── Personal Contribution ── */}
                      <div className="flex items-center gap-3 bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-indigo-800">👤 Personal Contribution (₹)</p>
                          <p className="text-[11px] text-indigo-500 mt-0.5">Manager's own sales added on top of team deals</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-indigo-400 font-semibold">₹</span>
                            <input
                              type="number"
                              min="0"
                              value={progContrib[pid] || ''}
                              onChange={e => setProgContrib(prev => ({ ...prev, [pid]: e.target.value }))}
                              placeholder="0"
                              className="w-36 pl-6 pr-3 py-2 border border-indigo-200 bg-white rounded-lg text-sm font-semibold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                          </div>
                          {progContrib[pid] > 0 && (
                            <span className="text-xs font-semibold text-indigo-700 bg-indigo-100 px-2 py-1 rounded-lg whitespace-nowrap">
                              {formatINR(Number(progContrib[pid]))}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Projected + Realised side by side */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-1.5">📊 Projected Slabs <span className="font-normal text-gray-400 normal-case">(Team Sale Value)</span></p>
                          <SlabInputTable slabs={ps.proj} onUpdate={updateProjSlab} accentClass="border-blue-100" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-green-600 uppercase tracking-wide mb-1.5">✅ Realised Slabs <span className="font-normal text-gray-400 normal-case">(Collected Revenue)</span></p>
                          <SlabInputTable slabs={ps.real} onUpdate={updateRealSlab} accentClass="border-green-100" />
                        </div>
                      </div>

                      {/* Feedback + Save */}
                      {pState.success && (
                        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2">
                          <CheckCircle size={14} className="text-green-600" />
                          <p className="text-xs text-green-700 font-medium">{prog.label} targets saved for {formMonth}.</p>
                        </div>
                      )}
                      {pState.error && (
                        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2">{pState.error}</p>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={pState.submitting}
                        className={`w-full ${COLORS.btn} disabled:opacity-50 text-white font-semibold text-sm rounded-xl px-4 py-2.5 transition-colors`}
                      >
                        {pState.submitting ? `Saving ${prog.label}…` : `Save ${prog.label} Targets`}
                      </button>
                    </div>
                  </div>
                )
              })}

              {/* ══ INDIVIDUAL PERSONAL TARGET (for Manager) ══ — REMOVED */}
              {false && <div className="bg-white rounded-xl border border-indigo-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-indigo-900">👤 Individual Personal Target</p>
                    <p className="text-xs text-indigo-600 mt-0.5">Set {selected.Name}'s own sales target — tracked against their personal deals only</p>
                  </div>
                  <span className="text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-full">Personal · {formMonth}</span>
                </div>

                <div className="px-5 py-4 space-y-4">
                  {/* History */}
                  {indivHistory.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Assignment History</p>
                      <div className="space-y-1">
                        {indivHistory.map((t, i) => {
                          const m = normalizeMonth(t.Month ?? t.month)
                          let slabCount = 0
                          try { slabCount = JSON.parse(t.SlabsJson || '[]').filter(s => s.targetAmount).length } catch {}
                          return (
                            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-xs">
                              <span className="font-semibold text-gray-700">{m}</span>
                              <span className="text-gray-500">Target {t.TargetAmount ? `₹${Number(t.TargetAmount).toLocaleString('en-IN')}` : '—'} · {slabCount} slab{slabCount !== 1 ? 's' : ''}</span>
                              <div className="flex items-center gap-2">
                                <button onClick={() => { setFormMonth(m); reloadIndivHistory() }} className="text-brand-500 hover:underline font-medium text-[10px]">Edit</button>
                                {indivConfirmDel === m ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={async () => {
                                      setIndivDeleting(m)
                                      await deleteTarget(selected.Email, m).catch(() => {})
                                      setIndivConfirmDel(null); setIndivDeleting(null)
                                      reloadIndivHistory()
                                    }} disabled={indivDeleting === m} className="text-red-600 font-semibold text-[10px] hover:underline">
                                      {indivDeleting === m ? 'Deleting…' : 'Confirm'}
                                    </button>
                                    <button onClick={() => setIndivConfirmDel(null)} className="text-gray-400 text-[10px]">Cancel</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setIndivConfirmDel(m)} className="text-red-400 hover:text-red-600 text-[10px]">Delete</button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Target amount */}
                  <div>
                    <label className="ios-label mb-1.5 block">Personal Revenue Target (₹)</label>
                    <input
                      type="number"
                      value={indivTarget}
                      onChange={e => setIndivTarget(e.target.value)}
                      placeholder="e.g. 500000"
                      className="ios-input"
                    />
                  </div>

                  {/* Commission slabs */}
                  <div>
                    {/* Label + suggest buttons */}
                    <div className="flex items-center justify-between mb-2">
                      <label className="ios-label">Commission Slabs</label>
                      {/* Suggest buttons — one per program that has slabs saved for this month */}
                      <div className="flex flex-wrap gap-1.5 justify-end">
                        {MANAGER_TARGET_PROGRAMS.map(prog => {
                          const pid = prog.id
                          const ps  = programSlabs[pid]
                          const projFilled = (ps?.proj || []).filter(s => s.targetAmount && s.commissionPct)
                          const realFilled = (ps?.real || []).filter(s => s.targetAmount && s.commissionPct)
                          if (!projFilled.length && !realFilled.length) return null
                          const BADGE = {
                            all:   'bg-gray-100 text-gray-600 border-gray-200',
                            genai: 'bg-purple-50 text-purple-700 border-purple-200',
                            pml:   'bg-blue-50 text-blue-700 border-blue-200',
                            bel:   'bg-teal-50 text-teal-700 border-teal-200',
                          }[pid] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                          const applySlabs = (filled) => {
                            const padded = [...filled.map(s => ({ targetAmount: String(s.targetAmount), commissionPct: String(s.commissionPct) }))]
                            while (padded.length < 4) padded.push(EMPTY_SLAB)
                            setIndivSlabs(padded.slice(0, 4))
                            const maxT = Math.max(...filled.map(s => Number(s.targetAmount)))
                            if (!indivTarget) setIndivTarget(String(maxT))
                          }
                          return (
                            <div key={pid} className="flex items-center gap-0.5">
                              {projFilled.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => applySlabs(projFilled)}
                                  title={`Copy ${prog.label} projected slabs`}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors hover:opacity-80 ${BADGE}`}
                                >
                                  💡 {pid === 'all' ? 'Projected' : `${prog.label} Proj`}
                                </button>
                              )}
                              {realFilled.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => applySlabs(realFilled)}
                                  title={`Copy ${prog.label} realised slabs`}
                                  className={`text-[10px] font-semibold px-2 py-1 rounded-lg border transition-colors hover:opacity-80 bg-green-50 text-green-700 border-green-200`}
                                >
                                  💡 {pid === 'all' ? 'Realised' : `${prog.label} Real`}
                                </button>
                              )}
                            </div>
                          )
                        })}
                        {/* Clear button if any slab is filled */}
                        {indivSlabs.some(s => s.targetAmount || s.commissionPct) && (
                          <button
                            type="button"
                            onClick={() => setIndivSlabs(INIT_INDIV_SLABS())}
                            className="text-[10px] text-gray-400 hover:text-red-500 px-1.5 py-1 rounded-lg transition-colors"
                            title="Clear slabs"
                          >✕ Clear</button>
                        )}
                      </div>
                    </div>

                    {/* Slab rows */}
                    <div className="border border-indigo-100 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-[10px] font-semibold uppercase text-gray-400 bg-indigo-50 border-b border-indigo-100">
                            <th className="px-3 py-2 text-left w-8">#</th>
                            <th className="px-3 py-2 text-left">Target (₹)</th>
                            <th className="px-3 py-2 text-left">Commission %</th>
                            <th className="px-3 py-2 text-right">Payout</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {indivSlabs.map((slab, i) => (
                            <tr key={i} className="bg-white">
                              <td className="px-3 py-1.5 text-xs font-bold text-gray-300">S{i+1}</td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  placeholder="e.g. 500000"
                                  value={slab.targetAmount}
                                  onChange={e => setIndivSlabs(prev => prev.map((s, j) => j === i ? { ...s, targetAmount: e.target.value } : s))}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                                {slab.targetAmount && <p className="text-[10px] text-gray-400 mt-0.5">{formatINR(Number(slab.targetAmount))}</p>}
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="e.g. 5"
                                  value={slab.commissionPct}
                                  onChange={e => setIndivSlabs(prev => prev.map((s, j) => j === i ? { ...s, commissionPct: e.target.value } : s))}
                                  className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-right text-xs font-semibold text-gray-500">
                                {slab.targetAmount && slab.commissionPct
                                  ? formatINR(Number(slab.targetAmount) * Number(slab.commissionPct) / 100)
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Errors / success */}
                  {indivError   && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{indivError}</p>}
                  {indivSuccess && <p className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 font-semibold">✓ Individual target saved!</p>}

                  {/* Save */}
                  <button
                    onClick={handleSaveIndivTarget}
                    disabled={indivSubmit}
                    className="ios-btn w-full bg-indigo-600 hover:bg-indigo-700"
                  >
                    {indivSubmit ? 'Saving…' : `Save Individual Target for ${formMonth}`}
                  </button>
                </div>
              </div>}

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
                          <th className="px-4 py-2.5 text-center font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {targetHistory.map((t) => {
                          const mon      = normalizeMonth(t.Month ?? t.month)
                          const rate     = String(t.CommissionPct ?? t.commissionPct ?? '')
                          const preset   = ALL_TARGET_PRESETS.find(p => p.id === rate.trim().toLowerCase())
                          const rateLabel = preset ? `${preset.label} Tier` : (rate ? `${rate}%` : '—')
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
                                {(preset?.id === 'ps-basic' || preset?.id === 'ps-warm-up')
                                  ? <span className="text-teal-700 text-xs leading-tight">
                                      <span className="block">{t.CommissionStartDate || '40'} calls/mo</span>
                                      <span className="block text-gray-400 font-normal">{formatINR(Number(t.TargetAmount || 300000))} contribution</span>
                                    </span>
                                  : formatINR(Number(t.TargetAmount ?? t.targetAmount ?? 0))
                                }
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                                  preset?.id === 'basic'      ? 'bg-blue-50 text-blue-700' :
                                  preset?.id === 'average'    ? 'bg-green-50 text-green-700' :
                                  preset?.id === 'pro'        ? 'bg-purple-50 text-purple-700' :
                                  preset?.id === 'ps-basic'   ? 'bg-teal-50 text-teal-700' :
                                  preset?.id === 'ps-warm-up' ? 'bg-cyan-50 text-cyan-700' :
                                  preset?.id === 'ps-mob'     ? 'bg-orange-50 text-orange-700' :
                                                                'bg-gray-100 text-gray-600'
                                }`}>{rateLabel}</span>
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
                              if (preset.slabs?.length > 0) setAgentTarget(String(preset.slabs[0].targetAmount))
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

                    {selectedPreset && !isPresalesCallsBased && (
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

                    {isPresalesCallsBased && (
                      <div className="flex flex-wrap gap-4">
                        <div className="w-full sm:w-56">
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Min. Calls Required (default)</label>
                          <input
                            type="number"
                            min="0"
                            value={minCalls}
                            onChange={e => setMinCalls(e.target.value)}
                            placeholder="e.g. 40"
                            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          <p className="text-xs text-gray-400 mt-1">Minimum call target for this month</p>
                        </div>
                        <div className="w-full sm:w-56">
                          <label className="block text-xs font-medium text-gray-600 mb-1.5">Team Target Contribution (₹)</label>
                          <input
                            type="number"
                            min="0"
                            value={psTeamWeight}
                            onChange={e => setPsTeamWeight(e.target.value)}
                            placeholder="e.g. 300000"
                            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                          {psTeamWeight && <p className="text-xs text-gray-400 mt-1">= {formatINR(Number(psTeamWeight))} added to your team target</p>}
                        </div>
                      </div>
                    )}

                    {previewPreset && !isPresalesCallsBased && (
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

                    {isPresalesCallsBased && (
                      <div className="rounded-xl border border-teal-100 overflow-hidden">
                        <div className="px-4 py-2.5 bg-teal-50 border-b border-teal-100">
                          <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide">
                            📞 Calls Incentive Slabs
                          </p>
                        </div>
                        <table className="min-w-full text-sm">
                          <thead className="bg-teal-50/50">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Min. Calls</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Rate/Call</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Example (50 calls)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-teal-50">
                            {[{minCalls:40,ratePerCall:25},{minCalls:50,ratePerCall:30},{minCalls:65,ratePerCall:45}].map((s,i) => (
                              <tr key={i} className="hover:bg-teal-50/30">
                                <td className="px-4 py-2 font-semibold text-teal-700">{s.minCalls}+ calls</td>
                                <td className="px-4 py-2 text-right text-gray-700">₹{s.ratePerCall}/call</td>
                                <td className="px-4 py-2 text-right text-gray-500 text-xs">{formatINR(50 * s.ratePerCall)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="px-4 py-2.5 bg-cyan-50 border-t border-cyan-100">
                          <p className="text-xs font-semibold text-cyan-700 uppercase tracking-wide">
                            🎯 Sales Incentive Slabs
                          </p>
                        </div>
                        <table className="min-w-full text-sm">
                          <thead className="bg-cyan-50/50">
                            <tr>
                              <th className="text-left px-4 py-2 text-xs font-medium text-gray-400">Min. Sales</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Rate/Sale</th>
                              <th className="text-right px-4 py-2 text-xs font-medium text-gray-400">Total (at min)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-cyan-50">
                            {[{minSales:4,ratePerSale:500},{minSales:6,ratePerSale:750},{minSales:8,ratePerSale:1000},{minSales:10,ratePerSale:1500}].map((s,i) => (
                              <tr key={i} className="hover:bg-cyan-50/30">
                                <td className="px-4 py-2 font-semibold text-cyan-700">{s.minSales}+ sales</td>
                                <td className="px-4 py-2 text-right text-gray-700">₹{s.ratePerSale}/sale</td>
                                <td className="px-4 py-2 text-right text-gray-500 text-xs">{formatINR(s.minSales * s.ratePerSale)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {selectedPreset === 'ps-warm-up' && (
                          <div className="px-4 py-2.5 bg-amber-50 border-t border-amber-100">
                            <p className="text-xs text-amber-700">⚡ M2 progression: 8+ sales from calls → eligible for Agent role</p>
                          </div>
                        )}
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
