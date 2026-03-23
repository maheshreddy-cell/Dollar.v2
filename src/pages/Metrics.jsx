import { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, Percent } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getSummary, getLeaderboard } from '../services/api'
import MetricsCard from '../components/MetricsCard'
import { formatINR, getAchievementPct } from '../utils/commission'

export default function Metrics() {
  const { month } = useMonth()
  const { user } = useAuth()

  const [summary, setSummary] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([getSummary(user.email, month), getLeaderboard(user.email, month)])
      .then(([sRes, lRes]) => {
        setSummary(sRes)
        const sorted = [...(lRes ?? [])].sort((a, b) => b.achieved - a.achieved)
        setLeaderboard(sorted)
      })
      .catch(() => setError('Failed to load metrics.'))
      .finally(() => setLoading(false))
  }, [month])

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

  const achievedPct = summary
    ? getAchievementPct(summary.totalTarget, summary.totalAchieved)
    : 0

  const chartData = leaderboard.slice(0, 10).map((r) => ({
    name: r.name?.split(' ')[0] ?? r.email,
    achieved: r.achieved ?? 0,
    target: r.target ?? 0,
  }))

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Metrics — {month}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard
          title="Total Target"
          value={formatINR(summary?.totalTarget ?? 0)}
          icon={Target}
          color="blue"
        />
        <MetricsCard
          title="Total Achieved"
          value={formatINR(summary?.totalAchieved ?? 0)}
          icon={TrendingUp}
          color="green"
        />
        <MetricsCard
          title="Total Commission"
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

      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-5">
            Top 10 Agents — Achieved Amount
          </h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [formatINR(value), 'Achieved']}
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="achieved" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Leaderboard</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">#</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Target</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Achieved</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">%</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row, i) => {
                  const pct = getAchievementPct(row.target, row.achieved)
                  return (
                    <tr key={row.email ?? i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-400 font-medium">{i + 1}</td>
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-800">{row.name}</p>
                        <p className="text-xs text-gray-400">{row.email}</p>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-600">{formatINR(row.target)}</td>
                      <td className="px-5 py-3 text-right font-semibold text-gray-800">
                        {formatINR(row.achieved)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span
                          className={`text-xs font-semibold ${
                            pct >= 100
                              ? 'text-green-600'
                              : pct >= 50
                              ? 'text-blue-600'
                              : 'text-orange-500'
                          }`}
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-green-700 font-medium">
                        {formatINR(row.commission ?? 0)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
