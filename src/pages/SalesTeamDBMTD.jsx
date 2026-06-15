import { useState, useEffect, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts'
import { TrendingUp, Users, DollarSign, Award, RefreshCw } from 'lucide-react'
import { useMonth } from '../contexts/MonthContext'
import { appsScript } from '../services/supabase'
import { formatINR } from '../utils/commission'

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(m) {
  if (!m) return ''
  const [yr, mo] = m.split('-')
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${names[parseInt(mo,10)-1]} ${yr.slice(2)}`
}

function shortINR(v) {
  if (v >= 1e7) return `₹${(v/1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `₹${(v/1e5).toFixed(1)}L`
  if (v >= 1e3) return `₹${(v/1e3).toFixed(0)}K`
  return `₹${v}`
}

const TEAM_COLORS = [
  '#7C5CFC','#F5A623','#9B59B6','#3498DB','#2ECC71',
  '#E74C3C','#1ABC9C','#F39C12','#E67E22','#95A5A6',
]

const VERTICAL_COLORS = ['#7C5CFC', '#F5A623', '#2ECC71', '#E74C3C']

// Custom tooltip for dark-friendly display
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg">
      {label && <p className="font-semibold mb-1">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === 'number' && p.value > 1000 ? shortINR(p.value) : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'brand' }) {
  const colors = {
    brand:  { bg: 'bg-brand-50',  icon: 'bg-brand-500',  text: 'text-brand-600' },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-500',  text: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-500', text: 'text-purple-700' },
    orange: { bg: 'bg-orange-50', icon: 'bg-orange-500', text: 'text-orange-700' },
  }
  const c = colors[color] || colors.brand
  return (
    <div className={`${c.bg} rounded-2xl p-5 flex items-start gap-4`}>
      <div className={`${c.icon} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 mb-0.5 font-medium">{label}</p>
        <p className={`text-xl font-bold ${c.text} truncate`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm font-bold text-gray-800 mb-4">{title}</p>
      {children}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SalesTeamDBMTD() {
  const { month } = useMonth()
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = () => {
    setLoading(true)
    appsScript.getSalesSheet()
      .then(rows => {
        setSales(rows)
        setLastUpdated(new Date())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ── MTD (current month) stats ─────────────────────────────────────────────
  const mtd = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const totalProjected  = thisMonth.reduce((s, r) => s + (r.TotalValue  || 0), 0)
    const totalRealised   = thisMonth.reduce((s, r) => s + (r.PaidActual  || 0), 0)
    const totalSales      = thisMonth.length
    const realisationPct  = totalProjected > 0 ? ((totalRealised / totalProjected) * 100).toFixed(1) : '0.0'

    // Active agents this month (unique emails)
    const activeAgents = new Set(thisMonth.map(r => r.Email)).size

    // Top agent by realised
    const byAgent = {}
    thisMonth.forEach(r => {
      if (!r.Email) return
      byAgent[r.Email] = byAgent[r.Email] || { name: r.Email.split('@')[0].replace(/\./g,' ').replace(/\b\w/g, c => c.toUpperCase()), realised: 0 }
      byAgent[r.Email].realised += (r.PaidActual || 0)
    })
    const topAgentEntry = Object.values(byAgent).sort((a, b) => b.realised - a.realised)[0]

    return { totalProjected, totalRealised, totalSales, realisationPct, activeAgents, topAgent: topAgentEntry }
  }, [sales, month])

  // ── Monthly historical chart data ─────────────────────────────────────────
  const monthlyData = useMemo(() => {
    const map = {}
    sales.forEach(r => {
      if (!r.Month || !/^\d{4}-\d{2}$/.test(r.Month)) return
      if (!map[r.Month]) map[r.Month] = { month: r.Month, projected: 0, realised: 0 }
      map[r.Month].projected += (r.TotalValue || 0)
      map[r.Month].realised  += (r.PaidActual || 0)
    })
    return Object.values(map)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(d => ({ ...d, label: fmtMonth(d.month) }))
  }, [sales])

  // ── Top 10 agents (current month) ────────────────────────────────────────
  const top10Agents = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const map = {}
    thisMonth.forEach(r => {
      if (!r.Email) return
      const name = r.Email.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      if (!map[r.Email]) map[r.Email] = { name, realised: 0, projected: 0 }
      map[r.Email].realised  += (r.PaidActual  || 0)
      map[r.Email].projected += (r.TotalValue  || 0)
    })
    return Object.values(map)
      .sort((a, b) => b.realised - a.realised)
      .slice(0, 10)
  }, [sales, month])

  // ── Vertical revenue split (current month) ────────────────────────────────
  const verticalData = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const map = {}
    thisMonth.forEach(r => {
      const v = (r.Vertical || 'Unknown').trim()
      if (!v) return
      map[v] = (map[v] || 0) + (r.PaidActual || 0)
    })
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value }))
  }, [sales, month])

  // ── Monthly sales count by team ───────────────────────────────────────────
  const teamSalesCount = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const map = {}
    thisMonth.forEach(r => {
      const t = (r.Team || 'Unknown').trim()
      map[t] = (map[t] || 0) + 1
    })
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([team, count]) => ({ team, count }))
  }, [sales, month])

  // ── Team revenue breakdown ────────────────────────────────────────────────
  const teamRevenue = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const map = {}
    thisMonth.forEach(r => {
      const t = (r.Team || 'Unknown').trim()
      if (!map[t]) map[t] = { team: t, projected: 0, realised: 0 }
      map[t].projected += (r.TotalValue || 0)
      map[t].realised  += (r.PaidActual || 0)
    })
    return Object.values(map).sort((a, b) => b.projected - a.projected)
  }, [sales, month])

  // ── Leaderboard rows ──────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    const thisMonth = sales.filter(r => r.Month === month)
    const map = {}
    thisMonth.forEach(r => {
      if (!r.Email) return
      const name = r.Email.split('@')[0].split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      if (!map[r.Email]) map[r.Email] = { name, realised: 0, projected: 0, deals: 0, team: r.Team || '' }
      map[r.Email].realised  += (r.PaidActual || 0)
      map[r.Email].projected += (r.TotalValue || 0)
      map[r.Email].deals     += 1
    })
    return Object.values(map).sort((a, b) => b.realised - a.realised)
  }, [sales, month])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Team DB MTD</h1>
          <p className="text-sm text-gray-400 mt-0.5">All Verticals · Full Sales Team · {fmtMonth(month)}</p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-gray-400">
              Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 border border-brand-200 bg-brand-50 px-3 py-1.5 rounded-lg hover:bg-brand-100 transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={`Total Projected (${fmtMonth(month)})`}
          value={formatINR(mtd.totalProjected)}
          sub={`${mtd.activeAgents} active agents`}
          icon={TrendingUp}
          color="brand"
        />
        <StatCard
          label={`Total Realised (${fmtMonth(month)})`}
          value={formatINR(mtd.totalRealised)}
          sub={`${mtd.realisationPct}% realisation`}
          icon={DollarSign}
          color="green"
        />
        <StatCard
          label={`Total Sales (${fmtMonth(month)})`}
          value={mtd.totalSales}
          sub={fmtMonth(month)}
          icon={Users}
          color="purple"
        />
        <StatCard
          label="Top Agent"
          value={mtd.topAgent?.name || '—'}
          sub={mtd.topAgent ? formatINR(mtd.topAgent.realised) : ''}
          icon={Award}
          color="orange"
        />
      </div>

      {/* Row 1: Monthly Revenue + Top 10 Agents */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Monthly Revenue — Projected vs Realised">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barSize={6}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={shortINR} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="projected" name="Projected" fill="#7C5CFC" radius={[2,2,0,0]} />
              <Bar dataKey="realised"  name="Realised"  fill="#F5A623" radius={[2,2,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Section>

        <Section title={`Top 10 Agents — ${fmtMonth(month)}`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart
              data={top10Agents}
              layout="vertical"
              margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
              barSize={14}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={shortINR} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#374151' }} width={90} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="realised" name="Realised" radius={[0,4,4,0]}>
                {top10Agents.map((_, i) => (
                  <Cell key={i} fill={i === 0 ? '#7C5CFC' : '#A78BFA'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Row 2: Vertical Split + Team Sales Count */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Vertical Revenue Split">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={verticalData}
                cx="50%"
                cy="50%"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={3}
                dataKey="value"
              >
                {verticalData.map((_, i) => (
                  <Cell key={i} fill={VERTICAL_COLORS[i % VERTICAL_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatINR(v)} />
              <Legend
                formatter={(value, entry) => (
                  <span style={{ fontSize: 11, color: '#374151' }}>
                    {value} — {formatINR(entry.payload.value)}
                  </span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </Section>

        <Section title={`Monthly Sales by Team — ${fmtMonth(month)}`}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={teamSalesCount} margin={{ top: 0, right: 8, left: 0, bottom: 40 }} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="team" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Sales" radius={[4,4,0,0]}>
                {teamSalesCount.map((_, i) => (
                  <Cell key={i} fill={TEAM_COLORS[i % TEAM_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Section>
      </div>

      {/* Row 3: Team Revenue Breakdown */}
      <Section title="Team Revenue Breakdown — All Teams">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={teamRevenue} margin={{ top: 0, right: 8, left: 0, bottom: 40 }} barSize={10}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="team" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-30} textAnchor="end" />
            <YAxis tickFormatter={shortINR} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="projected" name="Projected" fill="#7C5CFC" radius={[2,2,0,0]} />
            <Bar dataKey="realised"  name="Realised"  fill="#F5A623" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* Leaderboard table */}
      <Section title={`Agent Leaderboard — ${fmtMonth(month)}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                <th className="text-left py-2 pr-4">#</th>
                <th className="text-left py-2 pr-4">Agent</th>
                <th className="text-left py-2 pr-4">Team</th>
                <th className="text-right py-2 pr-4">Deals</th>
                <th className="text-right py-2 pr-4">Projected</th>
                <th className="text-right py-2">Realised</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((a, i) => (
                <tr key={a.name} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="py-2.5 pr-4 text-gray-400 font-medium">{i + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-gray-800">{a.name}</td>
                  <td className="py-2.5 pr-4 text-gray-500 text-xs">{a.team}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{a.deals}</td>
                  <td className="py-2.5 pr-4 text-right text-gray-600">{formatINR(a.projected)}</td>
                  <td className="py-2.5 text-right font-semibold text-green-600">{formatINR(a.realised)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

    </div>
  )
}
