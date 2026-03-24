import { useState, useEffect } from 'react'
import { Target, TrendingUp, DollarSign, Percent, BarChart2, Users } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { useMonth } from '../contexts/MonthContext'
import { useAuth } from '../contexts/AuthContext'
import { getSummary, getLeaderboard, getSalesAnalytics } from '../services/api'
import MetricsCard from '../components/MetricsCard'
import { formatINR, getAchievementPct } from '../utils/commission'

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#06b6d4','#f97316','#84cc16']

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-gray-400" />
      <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
    </div>
  )
}

function HorizontalBar({ label, value, max, color, deals }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-gray-700 truncate max-w-[160px]">{label}</span>
        <span className="text-gray-500 ml-2 shrink-0">{formatINR(value)} · {deals} deals</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

export default function Metrics() {
  const { month } = useMonth()
  const { user } = useAuth()

  const [summary, setSummary]       = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [analytics, setAnalytics]   = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')

  useEffect(() => {
    setLoading(true)
    setError('')
    Promise.all([
      getSummary(user.email, month),
      getLeaderboard(user.email, month),
      getSalesAnalytics(month),
    ])
      .then(([sRes, lRes, aRes]) => {
        setSummary(sRes)
        setLeaderboard([...(lRes ?? [])].sort((a, b) => b.achieved - a.achieved))
        setAnalytics(aRes)
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
      <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
    )
  }

  const achievedPct = summary ? getAchievementPct(summary.totalTarget, summary.totalAchieved) : 0

  const chartData = leaderboard.slice(0, 10).map(r => ({
    name:     r.name?.split(' ')[0] ?? r.email,
    achieved: r.achieved ?? 0,
    target:   r.target   ?? 0,
  }))

  const teamMax     = analytics?.byTeam?.[0]?.achieved     || 1
  const verticalMax = analytics?.byVertical?.[0]?.achieved || 1

  return (
    <div className="space-y-6">
      <h2 className="text-base font-semibold text-gray-800">Metrics — {month}</h2>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricsCard title="My Target"          value={formatINR(summary?.totalTarget     ?? 0)} icon={Target}    color="blue"   />
        <MetricsCard title="My Achieved"        value={formatINR(summary?.totalAchieved   ?? 0)} icon={TrendingUp} color="green"  />
        <MetricsCard title="My Commission"      value={formatINR(summary?.totalCommission ?? 0)} icon={DollarSign} color="purple" />
        <MetricsCard title="Achievement %"      value={`${achievedPct.toFixed(1)}%`}             icon={Percent}
          color={achievedPct >= 100 ? 'green' : achievedPct >= 50 ? 'orange' : 'red'} />
      </div>

      {/* Org-wide stats from raw sales sheet */}
      {analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Org Revenue ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{formatINR(analytics.totalAchieved)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">Total Deals Closed ({month})</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{analytics.totalDeals}</p>
          </div>
        </div>
      )}

      {/* Agent leaderboard bar chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <SectionHeader icon={BarChart2} title="Top 10 Agents — Achieved Amount" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => [formatINR(v), 'Achieved']} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
              <Bar dataKey="achieved" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* By Team */}
        {analytics?.byTeam?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={Users} title="Performance by Team" />
            <div className="space-y-3">
              {analytics.byTeam.map((t, i) => (
                <HorizontalBar key={t.name} label={t.name} value={t.achieved} max={teamMax} deals={t.deals} color={COLORS[i % COLORS.length]} />
              ))}
            </div>
          </div>
        )}

        {/* By Vertical */}
        {analytics?.byVertical?.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <SectionHeader icon={BarChart2} title="Performance by Vertical" />
            <div className="space-y-3">
              {analytics.byVertical.map((v, i) => (
                <HorizontalBar key={v.name} label={v.name} value={v.achieved} max={verticalMax} deals={v.deals} color={COLORS[i % COLORS.length]} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full leaderboard table */}
      {leaderboard.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Agent Leaderboard</h3>
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
                      <td className="px-5 py-3 text-right font-semibold text-gray-800">{formatINR(row.achieved)}</td>
                      <td className="px-5 py-3 text-right">
                        <span className={`text-xs font-semibold ${pct >= 100 ? 'text-green-600' : pct >= 50 ? 'text-blue-600' : 'text-orange-500'}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right text-green-700 font-medium">{formatINR(row.commission ?? 0)}</td>
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
