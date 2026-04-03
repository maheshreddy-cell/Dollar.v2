import { useState, useEffect } from 'react'
import { UserPlus, X, Users, GitBranch, ArrowRightLeft, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { usePermissions } from '../contexts/PermissionsContext'
import { getTeam, inviteUser, getSubtree, reassignAgent } from '../services/api'
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

// What roles each rank can invite
const INVITE_ROLES = {
  Admin:     ['SalesHead', 'VH', 'Manager', 'Agent', 'PreSales'],
  SalesHead: ['VH', 'Manager', 'Agent', 'PreSales'],
  VH:        ['Manager', 'Agent', 'PreSales'],
  Manager:   ['Agent', 'PreSales'],
}

// Roles that can reassign agents
const CAN_REASSIGN_ROLES = ['Admin', 'SalesHead', 'VH']

// Roles eligible to be reassigned (moved between managers)
const REASSIGNABLE_ROLES = ['Agent', 'PreSales', 'Manager']

function flattenTree(node, result = []) {
  if (!node) return result
  result.push(node)
  ;(node.children || []).forEach(child => flattenTree(child, result))
  return result
}

// ── Reassign Modal ────────────────────────────────────────────────────────────
function ReassignModal({ member, managers, onClose, onDone }) {
  const [newManager, setNewManager] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [done, setDone]             = useState(false)

  const validManagers = managers.filter(
    m => m.Email !== member.Email && m.Email !== member.ManagerEmail
  )

  async function handleSubmit(e) {
    e.preventDefault()
    if (!newManager) { setError('Please select a new manager.'); return }
    setSubmitting(true)
    setError('')
    try {
      await reassignAgent(member.Email, newManager)
      clearCache()
      setDone(true)
      setTimeout(() => { onDone(); onClose() }, 1200)
    } catch (err) {
      setError(err?.message ?? 'Failed to reassign. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
              <ArrowRightLeft size={17} className="text-brand-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Reassign Member</p>
              <p className="text-xs text-gray-400">Move to a different manager</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
            <CheckCircle size={36} className="text-green-500" />
            <p className="text-sm font-semibold text-green-700">Successfully reassigned!</p>
            <p className="text-xs text-gray-400">{member.Name} has been moved.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            {/* Member info */}
            <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700">
                {member.Name?.charAt(0) ?? '?'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{member.Name}</p>
                <p className="text-xs text-gray-400">{member.Email}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'}`}>
                    {member.Role}
                  </span>
                  {member.ManagerEmail && (
                    <span className="text-[10px] text-gray-400">
                      Currently → {member.ManagerEmail}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* New manager picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Reassign To
              </label>
              <select
                value={newManager}
                onChange={e => setNewManager(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select new manager…</option>
                {validManagers.map(m => (
                  <option key={m.Email} value={m.Email}>
                    {m.Name} ({m.Role}) — {m.Email}
                  </option>
                ))}
              </select>
              {validManagers.length === 0 && (
                <p className="text-xs text-amber-600 mt-1.5">No other managers available in your subtree.</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !newManager}
                className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
              >
                {submitting ? 'Moving…' : 'Confirm Reassign'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Team() {
  const { user, effectiveUser } = useAuth()
  const { can } = usePermissions()

  const [tab, setTab]             = useState('direct')
  const [directTeam, setDirectTeam] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')

  // Invite form
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState({ name: '', email: '', role: '', managerEmail: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [inviteLink, setInviteLink] = useState(null)

  // Reassign
  const [reassignTarget, setReassignTarget] = useState(null)

  const roleReassignKey = { SalesHead: 'saleshead_reassign', VH: 'vh_reassign' }
  const canReassign = CAN_REASSIGN_ROLES.includes(user?.role) && can('enable_reassignment') &&
    (user?.role === 'Admin' || can(roleReassignKey[user?.role] ?? 'enable_reassignment'))
  const allowedRoles = INVITE_ROLES[user?.role] ?? []

  // Potential managers for invite form and reassign dropdown
  const managerOptions = [
    { Email: user?.email, Name: user?.name + ' (you)', Role: user?.role },
    ...allMembers.filter(m => !['Agent', 'PreSales'].includes(m.Role)),
  ]

  const loadTeam = () => {
    if (!effectiveUser?.email) return
    setLoading(true)
    const viewEmail = effectiveUser.email
    Promise.all([
      getTeam(viewEmail),
      getSubtree(viewEmail),
    ])
      .then(([direct, tree]) => {
        setDirectTeam(direct ?? [])
        const all = flattenTree(tree).filter(m => m.Email !== viewEmail)
        setAllMembers(all)
      })
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTeam() }, [effectiveUser?.email])

  const handleInvite = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.email.trim()) { setFormError('Email is required.'); return }
    if (!form.role) { setFormError('Role is required.'); return }
    setSubmitting(true)
    try {
      const token = await inviteUser({
        name:         form.name.trim(),
        email:        form.email.trim().toLowerCase(),
        role:         form.role,
        managerEmail: form.managerEmail || user?.email,
      })
      const link = window.location.origin + '/invite?token=' + token
      setInviteLink(link)
      setForm({ name: '', email: '', role: '', managerEmail: '' })
      setShowForm(false)
      loadTeam()
    } catch (err) {
      setFormError(err?.message ?? 'Failed to create invite.')
    } finally {
      setSubmitting(false)
    }
  }

  const displayed = tab === 'direct' ? directTeam : allMembers

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

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
        <form
          onSubmit={handleInvite}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">Invite New Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Full Name *</label>
              <input
                name="name"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="Jane Doe"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Email *</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                placeholder="jane@company.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Role *</label>
              <select
                name="role"
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select role…</option>
                {allowedRoles.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reports To *</label>
              <select
                name="managerEmail"
                value={form.managerEmail || user?.email}
                onChange={e => setForm(p => ({ ...p, managerEmail: e.target.value }))}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {managerOptions.map(m => (
                  <option key={m.Email} value={m.Email}>
                    {m.Name} — {m.Role}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {submitting ? 'Creating Invite…' : 'Send Invite'}
          </button>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('direct')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            tab === 'direct' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={14} />
          Direct Reports ({directTeam.length})
        </button>
        <button
          onClick={() => setTab('all')}
          className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
            tab === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <GitBranch size={14} />
          All Members ({allMembers.length})
        </button>
      </div>

      {/* Member list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {tab === 'direct'
              ? `Direct Reports (${directTeam.length})`
              : `All Members in Subtree (${allMembers.length})`}
          </p>
          {canReassign && (
            <p className="text-[10px] text-gray-400 flex items-center gap-1">
              <ArrowRightLeft size={10} /> Click Reassign to move a member
            </p>
          )}
        </div>

        {displayed.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No members yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map(member => (
              <div key={member.Email} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Avatar */}
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
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                      Pending
                    </span>
                  )}
                  {/* Reassign button — only for Admin/SalesHead/VH and reassignable roles */}
                  {canReassign && REASSIGNABLE_ROLES.includes(member.Role) && (
                    <button
                      onClick={() => setReassignTarget(member)}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 border border-brand-200 hover:border-brand-400 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition-colors font-medium"
                    >
                      <ArrowRightLeft size={11} />
                      Reassign
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invite link modal */}
      {inviteLink && (
        <InviteLinkModal inviteLink={inviteLink} onClose={() => setInviteLink(null)} />
      )}

      {/* Reassign modal */}
      {reassignTarget && (
        <ReassignModal
          member={reassignTarget}
          managers={managerOptions.filter(m => !['Agent', 'PreSales'].includes(m.Role))}
          onClose={() => setReassignTarget(null)}
          onDone={() => { setReassignTarget(null); loadTeam() }}
        />
      )}
    </div>
  )
}
