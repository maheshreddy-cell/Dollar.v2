import { useState, useEffect } from 'react'
import { ChevronDown, ChevronRight, AlertTriangle, Bell, Users, Layers, Building2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getDealsGrouped, getDealsGroupedForTeam, getLeaderboard, getTeam } from '../services/api'
import { useRefresh } from '../hooks/useRefresh'
import { formatINR } from '../utils/commission'

const ALL_SENTINEL = '__all__' // sentinel for "All …" picker option

// The 5 pipeline groups — each shows actual LoanDocsCollected sub-stages inside
const STAGE_GROUPS = [
  {
    key: 'PAID',
    label: 'Paid',
    bg: 'bg-green-50',
    border: 'border-green-200',
    text: 'text-green-700',
    barColor: 'bg-green-500',
    subBg: 'bg-green-50/40',
    defaultOpen: true,
    atRiskStages: [],
  },
  {
    key: 'PARTIALLY_PAID',
    label: 'Partially Paid',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    barColor: 'bg-orange-400',
    subBg: 'bg-orange-50/40',
    defaultOpen: true,
    atRiskStages: [],
  },
  {
    key: 'ALMOST_THERE',
    label: 'Waiting for Disbursement',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-700',
    barColor: 'bg-blue-500',
    subBg: 'bg-blue-50/40',
    defaultOpen: true,
    atRiskStages: [],
  },
  {
    key: 'WIP',
    label: 'Work in Progress',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    barColor: 'bg-amber-400',
    subBg: 'bg-amber-50/40',
    defaultOpen: false,
    atRiskStages: ['awaiting for docs', 'post_approval pending'],
  },
  {
    key: 'LOST',
    label: 'Lost',
    bg: 'bg-red-50',
    border: 'border-red-200',
    text: 'text-red-700',
    barColor: 'bg-red-400',
    subBg: 'bg-red-50/40',
    defaultOpen: false,
    atRiskStages: [],
  },
]

// Which roles see which hierarchy levels
const SH_ROLES    = ['SalesHead', 'Admin']         // VH → Team → Agent pickers
const VH_ROLES    = ['SalesHead', 'Admin', 'VH']   // Team → Agent pickers
const MGR_ROLES   = ['Admin', 'SalesHead', 'VH', 'Manager']  // at least Agent picker

export default function Deals() {
  const { effectiveUser, user } = useAuth()
  const { month } = useMonth()
  const tick = useRefresh()

  const role = effectiveUser?.role
  const isManagerRole = MGR_ROLES.includes(role)
  const isVHLevel     = VH_ROLES.includes(role)    // shows Team (manager) dropdown
  const isSHLevel     = SH_ROLES.includes(role)    // shows VH dropdown

  // ── VH picker (SalesHead/Admin only) ────────────────────────────────────
  const [vhList, setVhList]         = useState([])  // { email, name }[]
  const [selectedVH, setSelectedVH] = useState(null) // null = All VHs

  // ── Team/manager picker (VH + SalesHead) ────────────────────────────────
  const [teamList, setTeamList]         = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null) // null = All Teams

  // ── Agent picker (all manager roles) ────────────────────────────────────
  const [teamAgents, setTeamAgents]     = useState([])
  const [selectedAgent, setSelectedAgent] = useState(null) // null | { email, name } | { email: ALL_SENTINEL }

  // ── Deals state ─────────────────────────────────────────────────────────
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [openGroups, setOpenGroups] = useState(
    Object.fromEntries(STAGE_GROUPS.map(g => [g.key, g.defaultOpen]))
  )
  const [expandedDeals, setExpandedDeals] = useState({})

  const isViewAs = effectiveUser && user && effectiveUser.email !== user.email

  // ── Load VH list for SalesHead/Admin ────────────────────────────────────
  useEffect(() => {
    if (!isSHLevel || !effectiveUser?.email) return
    setSelectedVH(null)
    setTeamList([])
    setSelectedTeam(null)
    getTeam(effectiveUser.email)
      .then(users => setVhList(users.filter(u => u.Role === 'VH').map(u => ({ email: u.Email, name: u.Name }))))
      .catch(() => setVhList([]))
  }, [effectiveUser?.email, isSHLevel])

  // ── Load Team (manager) list when VH scope changes ───────────────────────
  // VH: always load managers under themselves
  // SalesHead: load managers under selectedVH (only when a VH is selected)
  useEffect(() => {
    if (!isVHLevel || !effectiveUser?.email) return
    setSelectedTeam(null)

    const teamRootEmail = isSHLevel
      ? selectedVH?.email   // SalesHead: only load teams when VH is selected
      : effectiveUser.email  // VH: always load their own teams

    if (!teamRootEmail) { setTeamList([]); return }

    getTeam(teamRootEmail)
      .then(users => setTeamList(users.filter(u => u.Role === 'Manager').map(u => ({ email: u.Email, name: u.Name }))))
      .catch(() => setTeamList([]))
  }, [effectiveUser?.email, selectedVH, isVHLevel, isSHLevel])

  // ── Agent scope root: deepest selected level ─────────────────────────────
  // Manager: their own email
  // VH: selectedTeam?.email || vhEmail
  // SalesHead: selectedTeam?.email || selectedVH?.email || shEmail
  const agentScopeRoot = selectedTeam?.email
    || (isSHLevel ? selectedVH?.email : null)
    || effectiveUser?.email

  // ── Load agents in scope ─────────────────────────────────────────────────
  useEffect(() => {
    if (!isManagerRole || !agentScopeRoot) return
    setSelectedAgent(null)
    getLeaderboard(agentScopeRoot, month)
      .then(rows => {
        setTeamAgents(rows)
        setSelectedAgent({ email: ALL_SENTINEL, name: 'All' })
      })
      .catch(() => setTeamAgents([]))
  }, [agentScopeRoot, month, isManagerRole])

  // ── Determine what email/mode to fetch deals for ─────────────────────────
  const isAllAgents = isManagerRole && selectedAgent?.email === ALL_SENTINEL
  const dealEmail   = isManagerRole ? selectedAgent?.email : effectiveUser?.email

  useEffect(() => {
    if (!dealEmail) { setLoading(false); return }
    if (tick === 0) setLoading(true)
    setError('')

    const fetchPromise = isAllAgents
      ? getDealsGroupedForTeam(teamAgents.map(a => a.email), month)
      : getDealsGrouped(dealEmail, month)

    fetchPromise
      .then(res => { setData(res); setLoading(false) })
      .catch(() => { setError('Failed to load deals.'); setLoading(false) })
  }, [dealEmail, month, tick, teamAgents.length, isAllAgents])

  // ── Helpers ──────────────────────────────────────────────────────────────
  // Build page title based on what is selected
  const pageTitle = (() => {
    if (!isManagerRole) return isViewAs ? `${effectiveUser.name}'s Deals` : 'My Deals'
    if (!isAllAgents && selectedAgent) return `${selectedAgent.name}'s Deals`
    if (selectedTeam) return `${selectedTeam.name}'s Team — All Agents (${teamAgents.length})`
    if (isSHLevel && selectedVH) return `${selectedVH.name}'s VH — All Agents (${teamAgents.length})`
    return `All Team Deals (${teamAgents.length} agents)`
  })()

  // ── Render loading / error states ────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
  )

  if (isManagerRole && teamAgents.length === 0 && !loading) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
      No agents found in this scope for {month}. Make sure agents are assigned under the selected hierarchy.
    </div>
  )

  if (!data) return null

  const achievedPct  = data.tAmount > 0 ? Math.min(100, (data.achieved / data.tAmount) * 100) : 0
  const totalAtRisk  = STAGE_GROUPS.flatMap(g => data.groups[g.key] || []).filter(d => d.isAtRisk).length

  // Picker style shared
  const pickerCls = "text-sm border border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500 text-gray-700 bg-white"

  return (
    <>
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(-16px); opacity: 0; }
          to   { transform: translateX(0);     opacity: 1; }
        }
        .slide-in { animation: slideInLeft 0.28s ease both; }
      `}</style>

      <div className="space-y-0">
        {/* Page header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{pageTitle}</h2>
            <p className="text-sm text-gray-500">{month} · Pipeline overview</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">

            {/* ── VH picker (SalesHead / Admin) ── */}
            {isSHLevel && vhList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Building2 size={13} className="text-gray-400" />
                <select
                  value={selectedVH?.email ?? ALL_SENTINEL}
                  onChange={e => {
                    const val = e.target.value
                    if (val === ALL_SENTINEL) {
                      setSelectedVH(null)
                    } else {
                      const vh = vhList.find(v => v.email === val)
                      if (vh) setSelectedVH(vh)
                    }
                    setSelectedTeam(null)
                    setSelectedAgent(null)
                  }}
                  className={pickerCls}
                >
                  <option value={ALL_SENTINEL}>🏢 All VHs ({vhList.length})</option>
                  <option disabled>──────────</option>
                  {vhList.map(v => (
                    <option key={v.email} value={v.email}>{v.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Team picker (VH, or SalesHead with VH selected) ── */}
            {isVHLevel && teamList.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Layers size={13} className="text-gray-400" />
                <select
                  value={selectedTeam?.email ?? ALL_SENTINEL}
                  onChange={e => {
                    const val = e.target.value
                    if (val === ALL_SENTINEL) {
                      setSelectedTeam(null)
                    } else {
                      const tm = teamList.find(t => t.email === val)
                      if (tm) setSelectedTeam(tm)
                    }
                    setSelectedAgent(null)
                  }}
                  className={pickerCls}
                >
                  <option value={ALL_SENTINEL}>👥 All Teams ({teamList.length})</option>
                  <option disabled>──────────</option>
                  {teamList.map(t => (
                    <option key={t.email} value={t.email}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* ── Agent picker (all manager roles) ── */}
            {isManagerRole && teamAgents.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Users size={13} className="text-gray-400" />
                <select
                  value={selectedAgent?.email ?? ALL_SENTINEL}
                  onChange={e => {
                    const val = e.target.value
                    if (val === ALL_SENTINEL) {
                      setSelectedAgent({ email: ALL_SENTINEL, name: 'All' })
                    } else {
                      const agent = teamAgents.find(a => a.email === val)
                      if (agent) setSelectedAgent({ email: agent.email, name: agent.name })
                    }
                  }}
                  className={pickerCls}
                >
                  <option value={ALL_SENTINEL}>👤 All Agents ({teamAgents.length})</option>
                  <option disabled>──────────</option>
                  {teamAgents.map(a => (
                    <option key={a.email} value={a.email}>{a.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* At-risk alert banner */}
            {totalAtRisk > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
                <Bell size={14} className="text-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-700">
                  {totalAtRisk} at-risk deal{totalAtRisk !== 1 ? 's' : ''} — may need reassignment
                </p>
              </div>
            )}
          </div>
        </div>

        {/* At-risk notice for agents (not shown to managers) */}
        {!isManagerRole && !isViewAs && totalAtRisk > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3 mb-4">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-800">
                {totalAtRisk} deal{totalAtRisk !== 1 ? 's' : ''} flagged At Risk
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                These deals have been stuck in their stage for 3+ working days. Follow up now — your manager can see this and may reassign if no action is taken.
              </p>
            </div>
          </div>
        )}

        {/* Slim summary bar */}
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-3 flex items-center gap-6 flex-wrap text-sm mb-4">
          <span className="text-gray-500">
            Target <span className="font-semibold text-gray-800">{formatINR(data.tAmount)}</span>
          </span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">
            Achieved{' '}
            <span className={`font-semibold ${achievedPct >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
              {achievedPct.toFixed(0)}%
            </span>
          </span>
          {!isAllAgents && data.commissionPreset && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">
                Tier <span className="font-semibold text-purple-600">{data.commissionPreset}</span>
              </span>
            </>
          )}
          {isAllAgents && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-gray-500">
                Agents <span className="font-semibold text-gray-800">{teamAgents.length}</span>
              </span>
            </>
          )}
        </div>

        {/* Pipeline summary row */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400 mb-1">Total Pipeline</p>
            <p className="text-lg font-bold text-gray-800">{formatINR(data.totalPipeline)}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-xs text-green-600 mb-1">Paid</p>
            <p className="text-lg font-bold text-green-700">{formatINR(data.paidAmount)}</p>
            <p className="text-xs text-green-500">
              {data.totalPipeline > 0 ? ((data.paidAmount / data.totalPipeline) * 100).toFixed(0) : 0}%
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-xs text-red-500 mb-1">At Risk</p>
            <p className="text-lg font-bold text-red-600">{formatINR(data.atRiskAmount)}</p>
            <p className="text-xs text-red-400">
              {data.atRiskAmount > 0 && data.totalPipeline > 0
                ? ((data.atRiskAmount / data.totalPipeline) * 100).toFixed(0)
                : 0}%
            </p>
          </div>
        </div>

        {/* WIP slab hint */}
        {data.wipSlabHint && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div>
                <p className="text-sm font-semibold text-purple-800">Pipeline Opportunity</p>
                <p className="text-sm text-purple-700 mt-0.5">
                  {formatINR(data.wipSlabHint.wipAmount)} in Work in Progress
                </p>
                {data.wipSlabHint.neededForSlab > 0 ? (
                  <p className="text-sm text-purple-600 mt-0.5">
                    Convert {formatINR(data.wipSlabHint.neededForSlab)} more → unlock {data.wipSlabHint.slabName}
                  </p>
                ) : (
                  <p className="text-sm text-green-600 font-semibold mt-0.5">
                    Your pipeline can unlock {data.wipSlabHint.slabName}! 🎯
                  </p>
                )}
                <p className="text-xs text-purple-500 mt-1">
                  💰 Earn {formatINR(data.wipSlabHint.slabPayout)} commission
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stage groups */}
        {STAGE_GROUPS.map((group, idx) => {
          const groupData = data.groups[group.key] || []
          const total     = data.totals[group.key] || { value: 0, count: 0 }
          const pct       = data.totalPipeline > 0
            ? ((total.value / data.totalPipeline) * 100).toFixed(0)
            : 0
          const isOpen      = openGroups[group.key]
          const groupAtRisk = groupData.filter(d => d.isAtRisk).length

          // Sub-group by actual LoanDocsCollected value
          const subGroupMap = {}
          for (const deal of groupData) {
            const stage = (deal.LoanDocsCollected || '').trim() || 'Unknown'
            if (!subGroupMap[stage]) subGroupMap[stage] = []
            subGroupMap[stage].push(deal)
          }
          const subGroupEntries  = Object.entries(subGroupMap)
          const showSubHeaders   = subGroupEntries.length > 1

          return (
            <div
              key={group.key}
              className={`slide-in rounded-xl border ${group.border} overflow-hidden mb-3`}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {/* Group header */}
              <button
                className={`w-full flex items-center justify-between px-4 py-3.5 ${group.bg} hover:brightness-95 transition-all`}
                onClick={() => setOpenGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
              >
                <div className="flex items-center gap-3">
                  <span className={`font-semibold text-sm ${group.text}`}>{group.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${group.bg} ${group.text} border ${group.border}`}>
                    {total.count} deal{total.count !== 1 ? 's' : ''}
                  </span>
                  {groupAtRisk > 0 && (
                    <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                      <AlertTriangle size={10} /> {groupAtRisk} at risk
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right hidden sm:block">
                    <p className={`text-sm font-bold ${group.text}`}>{formatINR(total.value)}</p>
                    <p className="text-xs text-gray-400">{pct}% of pipeline</p>
                  </div>
                  <div className="w-20 h-1.5 bg-white/60 rounded-full overflow-hidden hidden sm:block">
                    <div className={`h-full rounded-full ${group.barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                  {isOpen
                    ? <ChevronDown size={16} className="text-gray-400" />
                    : <ChevronRight size={16} className="text-gray-400" />}
                </div>
              </button>

              {/* Deal cards */}
              {isOpen && (
                <div className="bg-white">
                  {groupData.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No deals in this stage</p>
                  ) : (
                    subGroupEntries.map(([stageName, stageDeals]) => {
                      const isAtRiskStage  = group.atRiskStages.includes(stageName.toLowerCase())
                      const stageTotal     = stageDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)
                      const stageAtRiskCnt = stageDeals.filter(d => d.isAtRisk).length

                      return (
                        <div key={stageName}>
                          {showSubHeaders && (
                            <div className={`px-4 py-2 ${group.subBg} border-b border-gray-100 flex items-center justify-between`}>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-gray-700">{stageName}</span>
                                {isAtRiskStage && (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                    <AlertTriangle size={9} /> At Risk Stage
                                  </span>
                                )}
                                {stageAtRiskCnt > 0 && (
                                  <span className="text-[10px] font-medium text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                                    {stageAtRiskCnt} flagged
                                  </span>
                                )}
                              </div>
                              <span className="text-xs text-gray-400 shrink-0">
                                {stageDeals.length} deal{stageDeals.length !== 1 ? 's' : ''} · {formatINR(stageTotal)}
                              </span>
                            </div>
                          )}

                          <div className="divide-y divide-gray-100">
                            {stageDeals.map((deal, di) => {
                              const dealKey    = `${deal.LeadName}-${group.key}-${stageName}-${di}`
                              const isExpanded = expandedDeals[dealKey]
                              return (
                                <div key={dealKey}>
                                  <button
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                                    onClick={() => setExpandedDeals(prev => ({ ...prev, [dealKey]: !prev[dealKey] }))}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {isExpanded
                                        ? <ChevronDown size={14} className="text-gray-400 shrink-0" />
                                        : <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">{deal.LeadName || '—'}</p>
                                        <p className="text-xs text-gray-400">
                                          {deal.Timestamp
                                            ? new Date(deal.Timestamp).toLocaleDateString('en-IN')
                                            : deal.PaymentDate
                                              ? new Date(deal.PaymentDate).toLocaleDateString('en-IN')
                                              : '—'}
                                          {isAllAgents && deal.Email && (
                                            <span className="ml-2 text-gray-400">
                                              · {teamAgents.find(a => a.email === deal.Email)?.name ?? deal.Email}
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      {deal.isAtRisk && (
                                        <span className="ml-1 flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full shrink-0">
                                          <AlertTriangle size={10} /> At Risk
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm font-bold text-gray-700 shrink-0 ml-2">{formatINR(deal.TotalValue || 0)}</p>
                                  </button>

                                  {isExpanded && (
                                    <div className="px-10 pb-3 bg-gray-50/50 border-t border-gray-100">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Lead</p>
                                          <p className="text-xs font-bold text-gray-700">{deal.LeadName || '—'}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Amount</p>
                                          <p className="text-xs font-bold text-gray-700">{formatINR(deal.TotalValue || 0)}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Course</p>
                                          <p className="text-xs font-bold text-gray-700">{deal.Course || deal.Vertical || '—'}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-semibold uppercase text-gray-400 mb-0.5">Stage</p>
                                          <p className="text-xs font-bold text-gray-700">{deal.LoanDocsCollected || '—'}</p>
                                        </div>
                                      </div>
                                      {deal.isAtRisk && (
                                        <div className="mt-2 flex items-start gap-2 bg-red-50 rounded-lg px-3 py-2.5 border border-red-100">
                                          <AlertTriangle size={13} className="text-red-500 shrink-0 mt-0.5" />
                                          <div>
                                            <p className="text-xs font-semibold text-red-700">At Risk — Action Required</p>
                                            <p className="text-xs text-red-600 mt-0.5">
                                              {deal.daysInStage} working day{deal.daysInStage !== 1 ? 's' : ''} stuck in "{deal.LoanDocsCollected}".
                                              Follow up immediately — your manager can see this and may reassign the deal.
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
