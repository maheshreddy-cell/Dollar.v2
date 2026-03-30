import { useState, useEffect } from 'react'
import { UserPlus, X, Users, GitBranch } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, inviteUser, getSubtree } from '../services/api'
import InviteLinkModal from '../components/InviteLinkModal'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
}

// What roles each rank can invite
const INVITE_ROLES = {
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

export default function Team() {
  const { user } = useAuth()
  const [tab, setTab] = useState('direct')
  const [directTeam, setDirectTeam] = useState([])
  const [allMembers, setAllMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: '', managerEmail: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [inviteLink, setInviteLink] = useState(null)

  const allowedRoles = INVITE_ROLES[user?.role] ?? []

  // Potential managers = current user + all non-Agent subtree members
  const managerOptions = [
    { Email: user?.email, Name: user?.name + ' (you)', Role: user?.role },
    ...allMembers.filter(m => m.Role !== 'Agent'),
  ]

  const loadTeam = () => {
    setLoading(true)
    Promise.all([
      getTeam(user.email),
      getSubtree(user.email),
    ])
      .then(([direct, tree]) => {
        setDirectTeam(direct ?? [])
        const all = flattenTree(tree).filter(m => m.Email !== user.email)
        setAllMembers(all)
      })
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadTeam() }, [])

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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Reports To (Manager) *</label>
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
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
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
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {tab === 'direct' ? `Direct Reports (${directTeam.length})` : `All Members in Subtree (${allMembers.length})`}
          </p>
        </div>
        {displayed.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No members yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {displayed.map(member => (
              <div key={member.Email} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{member.Name}</p>
                  <p className="text-xs text-gray-400">{member.Email}</p>
                  {tab === 'all' && member.ManagerEmail && (
                    <p className="text-xs text-gray-400 mt-0.5">Reports to: {member.ManagerEmail}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      ROLE_COLORS[member.Role] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {member.Role}
                  </span>
                  {member.Status === 'pending' && (
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                      Pending
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {inviteLink && (
        <InviteLinkModal
          inviteLink={inviteLink}
          onClose={() => setInviteLink(null)}
        />
      )}
    </div>
  )
}
