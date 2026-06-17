import { X } from 'lucide-react'
import { formatINR } from '../utils/commission'
import { computeHatTrickEarnings } from '../services/api'

// ── Stage config ─────────────────────────────────────────────────────────────
const STAGE = {
  PAID:           { label: 'Paid',      cls: 'bg-green-100 text-green-700'   },
  PARTIALLY_PAID: { label: 'Part Paid', cls: 'bg-blue-100 text-blue-700'     },
  ALMOST_THERE:   { label: 'Near Pay',  cls: 'bg-amber-100 text-amber-700'   },
  WIP:            { label: 'WIP',       cls: 'bg-orange-100 text-orange-600' },
  LOST:           { label: 'Lost',      cls: 'bg-red-100 text-red-600'       },
}

const STAGE_ORDER = ['PAID', 'PARTIALLY_PAID', 'ALMOST_THERE', 'WIP', 'LOST']

function fmtDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

// ── Individual deal row ───────────────────────────────────────────────────────
function DealRow({ deal, amountField, showPaidDate }) {
  const stage = STAGE[deal._stage] || STAGE.WIP
  const amount = deal[amountField] || deal.TotalValue || 0
  const date   = deal.PaymentDate || deal.Timestamp
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 truncate">
          {deal.LeadName || deal.CustomerName || '—'}
        </p>
        <p className="text-xs text-gray-400 truncate">
          {deal.Course || deal.Vertical || '—'}
          {date ? ` · ${fmtDate(date)}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${stage.cls}`}>
          {stage.label}
        </span>
        <span className="text-sm font-semibold text-gray-700">{formatINR(amount)}</span>
      </div>
    </div>
  )
}

// ── Views ─────────────────────────────────────────────────────────────────────

function DealsView({ grouped, amountField, showPaidDate, stageFilter }) {
  const stages = stageFilter || STAGE_ORDER
  const allDeals = stages.flatMap(s => (grouped?.groups?.[s] || []).map(d => ({ ...d, _stage: s })))
  if (!allDeals.length) return <p className="text-sm text-gray-400 text-center py-8">No deals found</p>
  const total = allDeals.reduce((sum, d) => sum + (d[amountField] || d.TotalValue || 0), 0)
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between py-3 mb-1">
        <span className="text-xs text-gray-400 font-medium">{allDeals.length} deal{allDeals.length !== 1 ? 's' : ''}</span>
        <span className="text-sm font-bold text-gray-700">{formatINR(total)}</span>
      </div>
      {stageFilter
        ? allDeals.map((d, i) => <DealRow key={i} deal={d} amountField={amountField} showPaidDate={showPaidDate} />)
        : STAGE_ORDER.map(s => {
            const deals = (grouped?.groups?.[s] || []).map(d => ({ ...d, _stage: s }))
            if (!deals.length) return null
            const stageTotal = deals.reduce((sum, d) => sum + (d.TotalValue || 0), 0)
            return (
              <div key={s} className="mb-3">
                <div className="flex items-center gap-2 py-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STAGE[s]?.cls}`}>{STAGE[s]?.label}</span>
                  <span className="text-xs text-gray-400">{deals.length} deal{deals.length !== 1 ? 's' : ''} · {formatINR(stageTotal)}</span>
                </div>
                {deals.map((d, i) => <DealRow key={i} deal={d} amountField={amountField} showPaidDate={showPaidDate} />)}
              </div>
            )
          })
      }
    </div>
  )
}

function CommissionView({ grouped, summary }) {
  const allDeals = Object.values(grouped?.groups || {}).flat()
  const t2Deals  = allDeals.filter(d => (d.T2Amount || 0) > 0)
  const htResult = computeHatTrickEarnings(allDeals)
  const htDays   = Object.entries(htResult.byDate || {}).filter(([, n]) => n >= 3)

  return (
    <div className="px-4 pb-4 space-y-4">

      {/* Commission slab */}
      <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
        <p className="text-xs font-bold text-purple-500 uppercase tracking-wide mb-2">Commission</p>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-500">Achieved</span>
          <span className="font-semibold text-gray-800">{formatINR(summary?.totalAchieved ?? 0)}</span>
        </div>
        {summary?.slabInfo && (
          <div className="flex justify-between text-sm mb-1">
            <span className="text-gray-500">
              {summary.slabInfo.eligible ? `Slab rate` : 'Not yet eligible'}
            </span>
            <span className="font-semibold text-gray-700">
              {summary.slabInfo.eligible
                ? `${summary.slabInfo.currentRate ?? '—'}%`
                : `₹${Math.ceil((summary.slabInfo.gapToSlab1 ?? 0) / 1000)}k to Slab 1`}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm border-t border-purple-200 pt-2 mt-2">
          <span className="font-semibold text-purple-700">Commission Earned</span>
          <span className="font-bold text-purple-700">{formatINR(summary?.totalCommission ?? 0)}</span>
        </div>
      </div>

      {/* T+2 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-500 uppercase tracking-wide mb-2">
          T+2 Day Bonus · {formatINR(summary?.totalT2Amount ?? 0)}
        </p>
        {t2Deals.length === 0
          ? <p className="text-xs text-gray-400">No T+2 bonuses yet</p>
          : t2Deals.map((d, i) => (
              <div key={i} className="flex justify-between text-sm py-1 border-b border-blue-100 last:border-0">
                <span className="text-gray-700 truncate">{d.LeadName || '—'}</span>
                <span className="font-semibold text-blue-700 shrink-0 ml-2">{formatINR(d.T2Amount)}</span>
              </div>
            ))
        }
      </div>

      {/* Hat Trick */}
      <div className="bg-green-50 border border-green-100 rounded-xl p-4">
        <p className="text-xs font-bold text-green-500 uppercase tracking-wide mb-2">
          Hat Trick Bonus · {formatINR(htResult.amount)}
        </p>
        {htDays.length === 0
          ? <p className="text-xs text-gray-400">No hat-trick days yet (need 3 paid deals in 1 day)</p>
          : htDays.map(([date, count]) => (
              <div key={date} className="flex justify-between text-sm py-1">
                <span className="text-gray-700">{fmtDate(date)} — {count} paid deals</span>
                <span className="font-semibold text-green-700">₹1,000</span>
              </div>
            ))
        }
      </div>

      {/* Other kickers */}
      {(summary?.totalKickers ?? 0) > htResult.amount && (
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs font-bold text-orange-500 uppercase tracking-wide mb-2">Other Kickers</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Kicker bonuses earned</span>
            <span className="font-semibold text-orange-700">{formatINR((summary?.totalKickers ?? 0) - htResult.amount)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamView({ leaderboard, metric }) {
  const CFG = {
    pipeline:   { field: 'totalSaleValue', label: 'Pipeline',  color: 'text-blue-600'   },
    achieved:   { field: 'achieved',       label: 'Achieved',  color: 'text-green-600'  },
    commission: { field: 'commission',     label: 'Commission',color: 'text-purple-600' },
    moneyMade:  { field: 'moneyMade',      label: 'Earned',    color: 'text-purple-600' },
    target:     { field: 'target',         label: 'Target',    color: 'text-blue-600'   },
  }
  const cfg = CFG[metric] || CFG.pipeline
  const sorted = [...(leaderboard || [])].sort((a, b) => (b[cfg.field] || 0) - (a[cfg.field] || 0))

  if (!sorted.length) return <p className="text-sm text-gray-400 text-center py-8">No team data</p>

  const total = sorted.reduce((s, r) => s + (r[cfg.field] || 0), 0)
  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between py-3 border-b border-gray-100 mb-1">
        <span className="text-xs text-gray-400 font-medium">{sorted.length} agents</span>
        <span className="text-sm font-bold text-gray-700">Total {formatINR(total)}</span>
      </div>
      {sorted.map((row, i) => {
        const pct = total > 0 ? ((row[cfg.field] || 0) / total) * 100 : 0
        return (
          <div key={row.email || i} className="py-2.5 border-b border-gray-50 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 w-4">{i + 1}</span>
                <span className="text-sm font-medium text-gray-800">{row.name}</span>
              </div>
              <span className={`text-sm font-bold ${cfg.color}`}>{formatINR(row[cfg.field] || 0)}</span>
            </div>
            <div className="ml-6">
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-current rounded-full opacity-40 transition-all" style={{ width: `${pct}%`, color: 'inherit' }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DrillDownModal({ open, onClose, title, type, payload, loading }) {
  if (!open) return null

  function renderBody() {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
        </div>
      )
    }
    if (!payload) return <p className="text-sm text-gray-400 text-center py-8">No data</p>

    switch (type) {
      case 'pipeline':
        return <DealsView grouped={payload.grouped} amountField="TotalValue" showPaidDate={false} />
      case 'achieved':
        return <DealsView grouped={payload.grouped} amountField="PaidActual" showPaidDate stageFilter={['PAID', 'PARTIALLY_PAID']} />
      case 'commission':
        return <CommissionView grouped={payload.grouped} summary={payload.summary} />
      case 'team_pipeline':
        return <TeamView leaderboard={payload.leaderboard} metric="pipeline" />
      case 'team_achieved':
        return <TeamView leaderboard={payload.leaderboard} metric="achieved" />
      case 'team_commission':
        return <TeamView leaderboard={payload.leaderboard} metric="moneyMade" />
      case 'team_target':
        return <TeamView leaderboard={payload.leaderboard} metric="target" />
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet panel */}
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[82vh] flex flex-col shadow-2xl">

        {/* Drag handle (mobile) */}
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-1 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 pb-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {renderBody()}
        </div>
      </div>
    </div>
  )
}
