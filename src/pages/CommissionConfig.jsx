import { useState, useEffect } from 'react'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { getCommissionConfig, addSlab, deleteSlab } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { formatINR } from '../utils/commission'

const INITIAL_FORM = { slabName: '', maxTarget: '', commissionPct: '' }

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
    if (!form.maxTarget || Number(form.maxTarget) <= 0) {
      setFormError('Enter a valid max target.')
      return
    }
    if (!form.commissionPct || Number(form.commissionPct) <= 0) {
      setFormError('Enter a valid commission %.')
      return
    }
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">Commission Config</h2>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError('') }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Plus size={16} />
          Add Slab
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">New Slab</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Slab Name *
              </label>
              <input
                name="slabName"
                value={form.slabName}
                onChange={handleFormChange}
                required
                placeholder="e.g. Bronze"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Max Target (₹) *
              </label>
              <input
                name="maxTarget"
                type="number"
                min="1"
                value={form.maxTarget}
                onChange={handleFormChange}
                required
                placeholder="e.g. 500000"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Commission % *
              </label>
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
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Commission Slabs — sorted by Max Target
          </p>
        </div>

        {slabs.length === 0 ? (
          <p className="text-sm text-gray-400 py-10 text-center">No slabs configured.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  Slab Name
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  Max Target
                </th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">
                  Commission %
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {slabs.map((slab) => (
                <tr key={slab.SlabName} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{slab.SlabName}</td>
                  <td className="px-5 py-3.5 text-right text-gray-600">
                    {formatINR(slab.MaxTarget)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-semibold text-green-700">
                    {slab.CommissionPct}%
                  </td>
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
  )
}
