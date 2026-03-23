import { useState, useEffect } from 'react'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getTeam, assignTarget, getTargets, getCommissionConfig } from '../services/api'
import { getSlabForTarget, formatINR } from '../utils/commission'
import { ChevronRight, CheckCircle } from 'lucide-react'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
}

export default function AssignTargets() {
  const { month } = useMonth()
  const { user } = useAuth()

  const [team, setTeam] = useState([])
  const [slabs, setSlabs] = useState([])
  const [selected, setSelected] = useState(null)
  const [existingTarget, setExistingTarget] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    targetAmount: '',
    commissionStartDate: '',
    commissionEndDate: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    Promise.all([getTeam(user.email), getCommissionConfig()])
      .then(([teamData, commData]) => {
        setTeam(teamData ?? [])
        setSlabs(commData ?? [])
      })
      .catch(() => setError('Failed to load team.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selected) return
    setExistingTarget(null)
    getTargets(selected.email, month)
      .then((res) => {
        if (res.length > 0) {
          setExistingTarget(res[0])
          setForm({
            targetAmount: res[0].TargetAmount ?? '',
            commissionStartDate: res[0].CommissionStartDate?.split('T')[0] ?? '',
            commissionEndDate: res[0].CommissionEndDate?.split('T')[0] ?? '',
          })
        } else {
          setForm({ targetAmount: '', commissionStartDate: '', commissionEndDate: '' })
        }
      })
      .catch(() => {
        setForm({ targetAmount: '', commissionStartDate: '', commissionEndDate: '' })
      })
  }, [selected, month])

  const matchedSlab = form.targetAmount
    ? getSlabForTarget(Number(form.targetAmount), slabs)
    : null

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setSuccess(false)
    if (!form.targetAmount || Number(form.targetAmount) <= 0) {
      setFormError('Enter a valid target amount.')
      return
    }
    setSubmitting(true)
    try {
      await assignTarget({
        email: selected.email,
        month,
        targetAmount: Number(form.targetAmount),
        commissionStartDate: form.commissionStartDate || undefined,
        commissionEndDate: form.commissionEndDate || undefined,
        slabName: matchedSlab?.SlabName,
        commissionPct: matchedSlab?.CommissionPct,
      }, user.email)
      setSuccess(true)
      setExistingTarget({
        TargetAmount: Number(form.targetAmount),
        CommissionStartDate: form.commissionStartDate,
        CommissionEndDate: form.commissionEndDate,
        slabName: matchedSlab?.SlabName,
        commissionPct: matchedSlab?.CommissionPct,
      })
    } catch (err) {
      setFormError(err?.message ?? 'Failed to assign target.')
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
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Assign Targets — {month}</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
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
            <div className="divide-y divide-gray-50">
              {team.map((member) => (
                <button
                  key={member.email}
                  onClick={() => { setSelected(member); setSuccess(false); setFormError('') }}
                  className={`w-full text-left px-4 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors ${
                    selected?.email === member.email ? 'bg-brand-50' : ''
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{member.name}</p>
                    <p className="text-xs text-gray-400">{member.email}</p>
                    <span
                      className={`inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>
                  <ChevronRight
                    size={16}
                    className={`flex-shrink-0 ${
                      selected?.email === member.email ? 'text-brand-600' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Assignment form */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center h-full flex items-center justify-center">
              <p className="text-gray-400 text-sm">Select a team member to assign a target.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{selected.name}</h3>
                  <p className="text-xs text-gray-400">{selected.email}</p>
                </div>
                {existingTarget && (
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">
                    Target exists for {month}
                  </span>
                )}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Target Amount (₹) *
                  </label>
                  <input
                    name="targetAmount"
                    type="number"
                    min="1"
                    value={form.targetAmount}
                    onChange={handleFormChange}
                    required
                    placeholder="e.g. 500000"
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                {matchedSlab && (
                  <div className="bg-brand-50 border border-brand-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-medium text-brand-700">
                      Applicable Slab: <span className="font-bold">{matchedSlab.SlabName}</span>
                    </p>
                    <p className="text-xs text-brand-600 mt-0.5">
                      Commission: <span className="font-bold">{matchedSlab.CommissionPct}%</span>
                      {' '}(max target: {formatINR(matchedSlab.MaxTarget)})
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Commission Start Date
                    </label>
                    <input
                      name="commissionStartDate"
                      type="date"
                      value={form.commissionStartDate}
                      onChange={handleFormChange}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">
                      Commission End Date
                    </label>
                    <input
                      name="commissionEndDate"
                      type="date"
                      value={form.commissionEndDate}
                      onChange={handleFormChange}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                {formError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                {success && (
                  <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                    <CheckCircle size={16} />
                    Target assigned successfully.
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
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
