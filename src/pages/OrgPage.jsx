import { useState, useEffect } from 'react'
import { getSubtree } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import OrgTree from '../components/OrgTree'

export default function OrgPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getSubtree(user.email)
      .then((res) => setData(res))
      .catch(() => setError('Failed to load org chart.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-800">Org Chart</h2>
      <OrgTree data={data} />
    </div>
  )
}
