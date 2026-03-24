import { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, Percent } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useMonth } from '../contexts/MonthContext'
import { getSummary, getLeaderboard, getDeals } from '../services/api'
import MetricsCard from '../components/MetricsCard'
import DaysLeftBadge from '../components/DaysLeftBadge'
import { formatINR, getAchievementPct } from '../utils/commission'

export default function Dashboard() {
  const { user, effectiveUser, isRole } = useAuth()
  const { month } = useMonth()

  const [summary, setSummary] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [recentDeals, setRecentDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    const requests = [getSummary(effectiveUser.email, month)]
    if (['Admin','SalesHead','VH','Manager'].includes(effectiveUser.role)) {
      requests.push(getLeaderboard(effectiveUser.email, month))
    } else {
      requests.push(getDeals(effectiveUser.email, month))
    }

    Promise.all(requests)
      .then(([summaryRes, secondRes]) => {
        setSummary(summaryRes)
        if (['Admin','SalesHead','VH','Manager'].includes(effectiveUser.role)) {
          setLeaderboard((secondRes ?? []).slice(0, 5))
        } else {
          setRecentDeals((secondRes ?? []).slice(0, 5))
        }
      })
      .catch(() => setError('Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [month, effectiveUser?.email])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const achievedPct = summary
    ? getAchievementPct(summary.totalTarget, summary.totalAchieved)
    : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Welcome back, {effectiveUser?.name?.split(' ')[0]}
          </h2>
          <p className="text-sm text-gray-500">Here's your overview for {month}</p>
        </div>
        <DaysLeftBadge month={month} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="Total Target"
          value={formatINR(summary?.totalTarget ?? 0)}
          icon={Target}
          color="blue"
        />
        <MetricsCard
          title="Achieved"
          value={formatINR(summary?.totalAchieved ?? 0)}
          icon={TrendingUp}
          color="green"
        />
        <MetricsCard
          title="Commission Earned"
          value={formatINR(summary?.totalCommission ?? 0)}
          icon={DollarSign}
          color="purple"
        />
        <MetricsCard
          title="Achievement %"
          value={`${achievedPct.toFixed(1)}%`}
          icon={Percent}
          color={achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red'}
        />
      </div>

      {['Admin','SalesHead','VH','Manager'].includes(effectiveUser?.role) && leaderboard.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Top Performers — {month}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase">
                  <th className="pb-3 font-medium">#</th>
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium text-right">Target</th>
                  <th className="pb-3 font-medium text-right">Achieved</th>
                  <th className="pb-3 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row, i) => (
                  <tr key={row.email ?? i}>
                    <td className="py-2.5 pr-3 text-gray-400 font-medium">{i + 1}</td>
                    <td className="py-2.5 pr-3 font-medium text-gray-800">{row.name}</td>
                    <td className="py-2.5 pr-3 text-right text-gray-600">
                      {formatINR(row.target)}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-gray-800 font-medium">
                      {formatINR(row.achieved)}
                    </td>
                    <td className="py-2.5 text-right">
                      <span
                        className={`text-xs font-semibold ${
                          row.pct >= 100
                            ? 'text-green-600'
                            : row.pct >= 50
                            ? 'text-blue-600'
                            : 'text-orange-500'
                        }`}
                      >
                        {(row.pct ?? 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveUser?.role === 'Agent' && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Recent Deals</h3>
          {recentDeals.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No deals this month.</p>
          ) : (
            <div className="space-y-2">
              {recentDeals.map((deal) => (
                <div
                  key={deal.ID}
                  className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">{deal.CustomerName}</p>
                    <p className="text-xs text-gray-400">
                      {deal.DealDate ? new Date(deal.DealDate).toLocaleDateString('en-IN') : '—'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-800">
                      {formatINR(deal.Price)}
                    </p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        deal.Status === 'Cleared'
                          ? 'bg-green-100 text-green-700'
                          : deal.Status === 'AtRisk'
                          ? 'bg-red-100 text-red-700'
                          : deal.Status === 'OnHold'
                          ? 'bg-orange-100 text-orange-700'
                          : deal.Status === 'Lost'
                          ? 'bg-gray-100 text-gray-600'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {deal.Status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
