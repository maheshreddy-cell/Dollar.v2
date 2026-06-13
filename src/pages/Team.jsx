import { useState, useEffect, useRef } from 'react'
import { UserPlus, X, Users, GitBranch, ArrowRightLeft, CheckCircle, ChevronRight, Search, Trash2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { getTeam, inviteUser, getSubtree, reassignAgent, changeRole, deleteUser } from '../services/api'
import { clearCache } from '../services/appsScript'
import InviteLinkModal from '../components/InviteLinkModal'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
  PreSales:  'bg-teal-100 text-teal-700',
}

const ROLE_DOTS = {
  Admin:     'bg-red-400',
  SalesHead: 'bg-purple-400',
  VH:        'bg-blue-400',
  Manager:   'bg-green-400',
  Agent:     'bg-gray-400',
  PreSales:  'bg-teal-400',
}

// What roles each rank can invite
const INVITE_ROLES = {
  Admin:     ['SalesHead', 'VH', 'Manager', 'Agent', 'PreSales'],
  SalesHead: ['VH', 'Manager', 'Agent', 'PreSales'],
  VH:        ['Manager', 'Agent', 'PreSales'],
  Manager:   ['Agent', 'PreSales'],
}

// What roles each rank can assign to a member
const ROLE_CHANGE_TO = {
  Admin:     ['Agent', 'PreSales', 'Manager', 'VH', 'SalesHead'],
  SalesHead: ['Agent', 'PreSales', 'Manager', 'VH'],
  VH:        ['Agent', 'PreSales', 'Manager'],
  Manager:   ['Agent', 'PreSales'],
}

const CAN_REASSIGN_ROLES  = ['Admin', 'SalesHead', 'VH']
const CAN_CHANGE_ROLE     = ['Admin', 'SalesHead', 'VH', 'Manager']
const REASSIGNABLE_ROLES  = ['Agent', 'PreSales', 'Manager']

// Roles that can remove accounts, and what roles they can remove
const CAN_DELETE_ROLES = ['Admin', 'SalesHead', 'VH', 'Manager']
const DELETABLE_BY = {
  Admin:     ['SalesHead', 'VH', 'Manager', 'Agent', 'PreSales'],
  SalesHead: ['VH', 'Manager', 'Agent', 'PreSales'],
  VH:        ['Manager', 'Agent', 'PreSales'],
  Manager:   ['Agent', 'PreSales'],
}

function flattenTree(node, result = []) {
  if (!node) return result
  result.push(node)
  ;(node.children || []).forEach(child => flattenTree(child, result))
  return result
}

// ── Member Detail Panel (slide-over) ─────────────────────────────────────────
function MemberPanel({ member, allMembers, user, canReassign, canChangeRole, canDelete, onClose, onDone }) {
  const availableRoles   = ROLE_CHANGE_TO[user?.role] ?? []
  const managerOptions   = allMembers.filter(m =>
    m.Email !== member.Email && !['Agent', 'PreSales'].includes(m.Role)
  )

  const [roleVal,        setRoleVal]        = useState(member.Role)
  const [managerVal,     setManagerVal]     = useState(member.ManagerEmail ?? '')
  const [managerSearch,  setManagerSearch]  = useState('')
  const [savingRole,     setSavingRole]     = useState(false)
  const [savingManager,  setSavingManager]  = useState(false)
  const [roleSuccess,    setRoleSuccess]    = useState(false)
  const [managerSuccess, setManagerSuccess] = useState(false)
  const [error,          setError]          = useState('')
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

  const filteredManagers = managerOptions.filter(m =>
    m.Name?.toLowerCase().includes(managerSearch.toLowerCase()) ||
    m.Email?.toLowerCase().includes(managerSearch.toLowerCase()) ||
    m.Role?.toLowerCase().includes(managerSearch.toLowerCase())
  )

  async function handleRoleChange() {
    if (roleVal === member.Role) return
    setSavingRole(true); setError('')
    try {
      await changeRole(member.Email, roleVal)
      setRoleSuccess(true)
      setTimeout(() => { setRoleSuccess(false); onDone() }, 1200)
    } catch (e) { setError(e?.message ?? 'Failed to change role.') }
    finally { setSavingRole(false) }
  }

  async function handleManagerChange() {
    if (!managerVal || managerVal === member.ManagerEmail) return
    setSavingManager(true); setError('')
    try {
      await reassignAgent(member.Email, managerVal)
      setManagerSuccess(true)
      setTimeout(() => { setManagerSuccess(false); onDone() }, 1200)
    } catch (e) { setError(e?.message ?? 'Failed to reassign.') }
    finally { setSavingManager(false) }
  }

  async function handleDelete() {
    setDeleting(true); setError('')
    try {
      await deleteUser(member.Email)
      onDone()
      onClose()
    } catch (e) { setError(e?.message ?? 'Failed to remove account.'); setDeleting(false); setConfirmDelete(false) }
  }

  const currentManager = allMembers.find(m => m.Email === member.ManagerEmail)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col animate-slide-in-right border-l">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="text-sm font-bold text-gray-800">Member Details</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Member card */}
          <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-lg font-bold text-brand-700 flex-shrink-0">
              {member.Name?.charAt(0) ?? '?'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{member.Name}</p>
              <p className="text-xs text-gray-500 truncate">{member.Email}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'}`}>
                  {member.Role}
                </span>
                {member.Status === 'pending' && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                    Pending
                  </span>
                )}
              </div>
              {currentManager && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Reports to: <span className="font-medium text-gray-600">{currentManager.Name}</span>
                  <span className="ml-1 text-gray-400">({currentManager.Role})</span>
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {/* ── Change Role ── */}
          {canChangeRole && availableRoles.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-green-50 border-b border-green-100">
                <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Change Role</p>
                <p className="text-[11px] text-green-600 mt-0.5">Update this member's role in the org</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {availableRoles.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleVal(r)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                        roleVal === r
                          ? `${ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-700'} border-current`
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ROLE_DOTS[r] ?? 'bg-gray-300'}`} />
                      {r}
                      {r === member.Role && <span className="ml-auto text-[10px] opacity-60">current</span>}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleRoleChange}
                  disabled={savingRole || roleVal === member.Role}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {roleSuccess ? <><CheckCircle size={14} /> Role Updated!</> : savingRole ? 'Saving…' : 'Save Role Change'}
                </button>
              </div>
            </div>
          )}

          {/* ── Change Manager ── */}
          {canReassign && REASSIGNABLE_ROLES.includes(member.Role) && (
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Change Manager</p>
                <p className="text-[11px] text-blue-600 mt-0.5">Move {member.Name} to a different manager</p>
              </div>
              <div className="p-4 space-y-3">
                {/* Search */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={managerSearch}
                    onChange={e => setManagerSearch(e.target.value)}
                    placeholder="Search managers…"
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {/* Manager list */}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {filteredManagers.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-3">No managers found</p>
                  ) : filteredManagers.map(m => (
                    <button
                      key={m.Email}
                      type="button"
                      onClick={() => setManagerVal(m.Email)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all ${
                        managerVal === m.Email
                          ? 'border-brand-400 bg-brand-50'
                          : m.Email === member.ManagerEmail
                          ? 'border-gray-200 bg-gray-50'
                          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-[11px] font-bold text-brand-700 flex-shrink-0">
                        {m.Name?.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate">{m.Name}</p>
                        <p className="text-[10px] text-gray-400 truncate">{m.Email}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[m.Role] ?? 'bg-gray-100 text-gray-500'}`}>
                          {m.Role}
                        </span>
                        {m.Email === member.ManagerEmail && (
                          <span className="text-[10px] text-gray-400">current</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleManagerChange}
                  disabled={savingManager || !managerVal || managerVal === member.ManagerEmail}
                  className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {managerSuccess ? <><CheckCircle size={14} /> Manager Updated!</> : savingManager ? 'Saving…' : 'Save Manager Change'}
                </button>
              </div>
            </div>
          )}

          {!canChangeRole && !canReassign && !canDelete && (
            <div className="bg-gray-50 rounded-2xl p-5 text-center">
              <p className="text-sm text-gray-400">You can view this member's details but don't have permission to make changes.</p>
            </div>
          )}

          {/* ── Danger Zone: Remove Account ── */}
          {canDelete && (
            <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Danger Zone</p>
                <p className="text-[11px] text-red-600 mt-0.5">Permanently remove {member.Name} from the platform</p>
              </div>
              <div className="p-4">
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    <Trash2 size={14} />
                    Remove Account
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-700 leading-relaxed">
                        This will permanently delete <strong>{member.Name}</strong>'s account. Their deals and targets history will be preserved. This cannot be undone.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={deleting}
                        className="flex-1 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-semibold py-2.5 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                      >
                        {deleting ? 'Removing…' : <><Trash2 size={13} /> Yes, Remove</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Team() {
  const { user, effectiveUser } = useAuth()
  const { can } = usePermissions()

  const [tab, setTab]               = useState('direct')
  const [directTeam, setDirectTeam] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  // Invite form
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState({ name: '', email: '', role: '', managerEmail: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState('')
  const [inviteLink, setInviteLink] = useState(null)

  // Member panel
  const [selectedMember, setSelectedMember] = useState(null)

  // Filter + search
  const [roleFilter, setRoleFilter] = useState('All')
  const [teamSearch, setTeamSearch] = useState('')

  const roleReassignKey = { SalesHead: 'saleshead_reassign', VH: 'vh_reassign' }
  const canReassign   = CAN_REASSIGN_ROLES.includes(user?.role) && can('enable_reassignment') &&
    (user?.role === 'Admin' || can(roleReassignKey[user?.role] ?? 'enable_reassignment'))
  const canChangeRole = CAN_CHANGE_ROLE.includes(user?.role)
  const allowedRoles  = INVITE_ROLES[user?.role] ?? []

  const managerOptions = [
    { Email: user?.email, Name: (user?.name ?? '') + ' (you)', Role: user?.role },
    ...allMembers.filter(m => !['Agent', 'PreSales'].includes(m.Role)),
  ]

  const loadTeam = () => {
    if (!effectiveUser?.email) return
    setLoading(true)
    const viewEmail = effectiveUser.email
    Promise.all([getTeam(viewEmail), getSubtree(viewEmail)])
      .then(([direct, tree]) => {
        setDirectTeam(direct ?? [])
        setAllMembers(flattenTree(tree).filter(m => m.Email !== viewEmail))
      })
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTeam() }, [effectiveUser?.email])

  const handleInvite = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim())  { setFormError('Name is required.'); return }
    if (!form.email.trim()) { setFormError('Email is required.'); return }
    if (!form.role)         { setFormError('Role is required.'); return }
    setSubmitting(true)
    try {
      const token = await inviteUser({
        name:         form.name.trim(),
        email:        form.email.trim().toLowerCase(),
        role:         form.role,
        managerEmail: form.managerEmail || user?.email,
      })
      setInviteLink(window.location.origin + '/invite?token=' + token)
      setForm({ name: '', email: '', role: '', managerEmail: '' })
      setShowForm(false)
      loadTeam()
    } catch (err) {
      setFormError(err?.message ?? 'Failed to create invite.')
    } finally {
      setSubmitting(false)
    }
  }

  const baseList = tab === 'direct' ? directTeam : allMembers
  const displayed = baseList.filter(m => {
    const matchRole   = roleFilter === 'All' || m.Role === roleFilter
    const q           = teamSearch.toLowerCase()
    const matchSearch = !q || m.Name?.toLowerCase().includes(q) || m.Email?.toLowerCase().includes(q)
    return matchRole && matchSearch
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const canOpenPanel = canChangeRole || canReassign

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">My Team</h2>
        {allowedRoles.length > 0 && (
          <button
            onClick={() => { setShowForm(v => !v); setFormError('') }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            {showForm ? <X size={16} /> : <UserPlus size={16} />}
            {showForm ? 'Cancel' : 'Invite New Member'}
          </button>
        )}
      </div>

      {/* Invite form */}
      {showForm && (
        <form onSubmit={handleInvite} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Invite New Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name *</label>
              <input name="name" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required placeholder="Jane Doe"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label>
              <input name="email" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required placeholder="jane@company.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Role *</label>
              <select name="role" value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                <option value="">Select role…</option>
                {allowedRoles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reports To *</label>
              <select name="managerEmail" value={form.managerEmail || user?.email} onChange={e => setForm(p => ({ ...p, managerEmail: e.target.value }))} required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                {managerOptions.map(m => (
                  <option key={m.Email} value={m.Email}>{m.Name} — {m.Role}</option>
                ))}
              </select>
            </div>
          </div>
          {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{formError}</div>}
          <button type="submit" disabled={submitting}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
            {submitting ? 'Creating Invite…' : 'Send Invite'}
          </button>
        </form>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button onClick={() => { setTab('direct'); setRoleFilter('All'); setTeamSearch('') }}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'direct' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Users size={14} /> Direct Reports ({directTeam.length})
        </button>
        <button onClick={() => { setTab('all'); setRoleFilter('All'); setTeamSearch('') }}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${tab === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <GitBranch size={14} /> All Members ({allMembers.length})
        </button>
      </div>

      {/* Member list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 space-y-2.5">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {tab === 'direct' ? `Direct Reports` : `All Members in Subtree`}
              <span className="ml-1.5 font-normal opacity-60">({displayed.length}{displayed.length !== baseList.length ? ` of ${baseList.length}` : ''})</span>
            </p>
            {canOpenPanel && (
              <p className="text-[10px] text-gray-400">Click a member to view &amp; edit</p>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={teamSearch}
              onChange={e => setTeamSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Role filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {['All', 'Agent', 'PreSales', 'Manager', 'VH'].map(role => {
              const count = role === 'All' ? baseList.length : baseList.filter(m => m.Role === role).length
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
                  {role} <span className="opacity-70">({count})</span>
                </button>
              )
            })}
          </div>
        </div>

        {displayed.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">
            {baseList.length === 0 ? 'No members yet.' : 'No members match your filter.'}
          </p>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map(member => (
              <div
                key={member.Email}
                onClick={() => setSelectedMember(member)}
                className={`flex items-center justify-between px-4 py-3.5 transition-colors ${canOpenPanel ? 'cursor-pointer hover:bg-brand-50/50' : 'hover:bg-gray-50/60'}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                    {member.Name?.charAt(0) ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{member.Name}</p>
                    <p className="text-xs text-gray-400 truncate">{member.Email}</p>
                    {tab === 'all' && member.ManagerEmail && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Reports to: {member.ManagerEmail}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {member.Role}
                  </span>
                  {member.Status === 'pending' && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">Pending</span>
                  )}
                  {canOpenPanel && (
                    <ChevronRight size={15} className="text-gray-300" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite link modal */}
      {inviteLink && <InviteLinkModal inviteLink={inviteLink} onClose={() => setInviteLink(null)} />}

      {/* Member detail panel */}
      {selectedMember && (
        <MemberPanel
          member={selectedMember}
          allMembers={[
            { Email: user?.email, Name: user?.name, Role: user?.role },
            ...allMembers,
          ]}
          user={user}
          canReassign={canReassign}
          canChangeRole={canChangeRole}
          canDelete={
            CAN_DELETE_ROLES.includes(user?.role) &&
            (DELETABLE_BY[user?.role] ?? []).includes(selectedMember?.Role) &&
            selectedMember?.Email !== user?.email
          }
          onClose={() => setSelectedMember(null)}
          onDone={() => { setSelectedMember(null); loadTeam() }}
        />
      )}
    </div>
  )
}
