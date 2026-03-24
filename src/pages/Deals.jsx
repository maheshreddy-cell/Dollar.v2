import { useState, useEffect } from 'react'
import { Plus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getDeals, createDeal } from '../services/api'
import DealTable from '../components/DealTable'

const INITIAL_FORM = {
  customerName: '',
  docs: '',
  price: '',
  dealDate: new Date().toISOString().split('T')[0],
}

export default function Deals() {
  const { user: realUser, effectiveUser, isRole } = useAuth()
  const { month } = useMonth()

  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const fetchDeals = () => {
    setLoading(true)
    const email = effectiveUser?.role === 'Agent' ? effectiveUser?.email : undefined
    getDeals(email, month)
      .then((data) => setDeals(data ?? []))
      .catch(() => setError('Failed to load deals.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDeals()
  }, [month])

  const handleFormChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.customerName.trim()) {
      setFormError('Customer name is required.')
      return
    }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      setFormError('Enter a valid deal amount.')
      return
    }
    setSubmitting(true)
    try {
      await createDeal({
        customerName: form.customerName.trim(),
        docs: form.docs.trim() || undefined,
        price: Number(form.price),
        dealDate: form.dealDate,
        month,
        email: realUser.email,
      })
      setForm(INITIAL_FORM)
      setShowForm(false)
      fetchDeals()
    } catch (err) {
      setFormError(err?.message ?? 'Failed to create deal.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-800">Deals — {month}</h2>
        {effectiveUser?.role === 'Agent' && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
          >
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Add Deal'}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl border border-gray-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-700">New Deal</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Customer Name *
              </label>
              <input
                name="customerName"
                value={form.customerName}
                onChange={handleFormChange}
                required
                placeholder="Customer name"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Amount (₹) *
              </label>
              <input
                name="price"
                type="number"
                min="1"
                value={form.price}
                onChange={handleFormChange}
                required
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Docs URL
              </label>
              <input
                name="docs"
                type="url"
                value={form.docs}
                onChange={handleFormChange}
                placeholder="https://..."
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Deal Date *
              </label>
              <input
                name="dealDate"
                type="date"
                value={form.dealDate}
                onChange={handleFormChange}
                required
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              {submitting ? 'Saving…' : 'Save Deal'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setFormError('') }}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      ) : (
        <DealTable deals={deals} onRefresh={fetchDeals} />
      )}
    </div>
  )
}
