import { useState, useEffect } from 'react'
import { UserPlus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, inviteUser } from '../services/api'
import InviteLinkModal from '../components/InviteLinkModal'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
}

const ROLE_HIERARCHY = {
  Admin:     ['SalesHead'],
  SalesHead: ['VH'],
  VH:        ['Manager'],
  Manager:   ['Agent'],
}

export default function Team() {
  const { user } = useAuth()

  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: '' })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [inviteLink, setInviteLink] = useState(null)

  const allowedRoles = ROLE_HIERARCHY[user?.role] ?? []

  useEffect(() => {
    getTeam(user.email)
      .then((data) => setTeam(data ?? []))
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }, [])

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) { setFormError('Name is required.'); return }
    if (!form.email.trim()) { setFormError('Email is required.'); return }
    if (!form.role) { setFormError('Role is required.'); return }
    setSubmitting(true)
    try {
      const token = await inviteUser({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        managerEmail: user?.email,
      })
      const link = window.location.origin + '/invite?token=' + token
      setInviteLink(link)
      setForm({ name: '', email: '', role: '' })
      setShowForm(false)
      // Refresh team
      getTeam(user.email).then((data) => setTeam(data ?? []))
    } catch (err) {
      setFormError(err?.message ?? 'Failed to send invite.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">My Team</h2>
        {allowedRoles.length > 0 && (
          <button
            onClick={() => { setShowForm((v) => !v); setFormError('') }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            {showForm ? <X size={16} /> : <UserPlus size={16} />}
            {showForm ? 'Cancel' : 'Invite New Member'}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleInvite}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">Invite New Member</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Full Name *
              </label>
              <input
                name="name"
                value={form.name}
                onChange={handleFormChange}
                required
                placeholder="Jane Doe"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Email *
              </label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleFormChange}
                required
                placeholder="jane@company.com"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Role *
              </label>
              <select
                name="role"
                value={form.role}
                onChange={handleFormChange}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select role…</option>
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>{r}</option>
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
            {submitting ? 'Sending Invite…' : 'Send Invite'}
          </button>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Direct Reports ({team.length})
          </p>
        </div>
        {team.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No team members yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {team.map((member) => (
              <div key={member.email} className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{member.name}</p>
                  <p className="text-xs text-gray-400">{member.email}</p>
                </div>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {member.role}
                </span>
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
