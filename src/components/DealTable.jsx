import { useState } from 'react'
import { updateDeal } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

const STATUS_STYLES = {
  Pending:  'bg-yellow-100 text-yellow-700',
  Cleared:  'bg-green-100 text-green-700',
  AtRisk:   'bg-red-100 text-red-700',
  OnHold:   'bg-orange-100 text-orange-700',
  Lost:     'bg-gray-100 text-gray-600',
}

const ALL_STATUSES = ['Pending', 'Cleared', 'AtRisk', 'OnHold', 'Lost']

export default function DealTable({ deals, onRefresh }) {
  const { user } = useAuth()
  const [updatingId, setUpdatingId] = useState(null)

  const handleStatusChange = async (deal, newStatus) => {
    setUpdatingId(deal._id ?? deal.id)
    try {
      await updateDeal(deal._id ?? deal.id, newStatus)
      onRefresh?.()
    } catch (err) {
      console.error('Failed to update deal status', err)
    } finally {
      setUpdatingId(null)
    }
  }

  const isOwn = (deal) => deal.agentEmail === user?.email

  if (!deals || deals.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">No deals found.</div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Docs</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Amount (₹)</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Deal Date</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Closed Date</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {deals.map((deal) => {
            const id = deal._id ?? deal.id
            const canEdit = isOwn(deal)
            return (
              <tr key={id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">{deal.customerName}</td>
                <td className="px-4 py-3 text-gray-500">
                  {deal.docs ? (
                    <a
                      href={deal.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 hover:underline"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-800">
                  {Number(deal.amount).toLocaleString('en-IN')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${
                      STATUS_STYLES[deal.status] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {deal.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {deal.dealDate ? new Date(deal.dealDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {deal.closedDate ? new Date(deal.closedDate).toLocaleDateString('en-IN') : '—'}
                </td>
                <td className="px-4 py-3">
                  {canEdit ? (
                    <select
                      value={deal.status}
                      disabled={updatingId === id}
                      onChange={(e) => handleStatusChange(deal, e.target.value)}
                      className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
