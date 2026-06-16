// Vercel cron — runs on the 8th of each month.
// Checks last month's sales against every still-pending kicker and auto-approves
// the ones that were qualified for, mirroring the in-app "Monthly Review" banner
// so kickers get flagged even if no admin opens the Kickers page that day.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const SALES_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1vumM76Vr8NVB-2jG5StiAeVY-cM_hVoYE4gCaDEHm1s/export?format=csv&gid=0'

function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (inQ && text[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (c === ',' && !inQ) {
      row.push(cur); cur = ''
    } else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); cur = ''
      rows.push(row); row = []
    } else {
      cur += c
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function safeParse(val, fallback = []) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
  return val
}

function unpackExtra(rawSlabs) {
  const parsed = safeParse(rawSlabs, [])
  if (Array.isArray(parsed)) {
    return { slabs: parsed, status: 'Approved', paidDate: '', notes: '', individualAmounts: {} }
  }
  return {
    slabs:             Array.isArray(parsed.slabs) ? parsed.slabs : [],
    status:            parsed.status            || 'Announced',
    paidDate:          parsed.paidDate          || '',
    notes:             parsed.notes             || '',
    individualAmounts: parsed.individualAmounts || {},
  }
}

// Matches src/pages/Kickers.jsx normalizeType() — collapses legacy 6-type
// values down to the current 3-type model (sales/revenue/collective).
function normalizeType(t) {
  if (t === 'collective') return 'collective'
  if (t === 'revenue' || t === 'team_revenue' || t === 'individual_revenue') return 'revenue'
  return 'sales'
}

export default async function handler(req, res) {
  try {
    const now       = new Date()
    const startLast = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const endLast   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)

    // Per-agent count + projected revenue for deals dated last calendar month
    // (col B = email, col G = projected total value, col K = payment date)
    const csvRes = await fetch(SALES_SHEET_CSV)
    if (!csvRes.ok) throw new Error(`Sheet fetch failed: ${csvRes.status}`)
    const rows = parseCSV(await csvRes.text())

    // perAgent[email] = { count, revenue } — both gated per-kicker by minSaleValue below
    const agentDeals = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const email = (r[1] || '').trim().toLowerCase()
      if (!email) continue
      const d = new Date(r[10] || r[0] || '')
      if (isNaN(d.getTime()) || d < startLast || d > endLast) continue
      const totalValue = parseFloat(String(r[6] || '').replace(/[,₹\s]/g, '')) || 0
      agentDeals.push({ email, totalValue })
    }

    const { data: kickerRows, error } = await supabase.from('kickers').select('*')
    if (error) throw error

    const approvedTitles = []

    for (const row of kickerRows || []) {
      const extra = unpackExtra(row.slabs)
      if (extra.status === 'Paid' || extra.status === 'Approved') continue

      const dateTo = new Date(row.date_to)
      if (isNaN(dateTo.getTime()) || dateTo < startLast || dateTo > endLast) continue

      const type     = normalizeType(row.type)
      const minVal    = Number(row.min_sale_value || 0)
      const qualifying = minVal > 0 ? agentDeals.filter(d => d.totalValue >= minVal) : agentDeals

      // Per-agent stats from qualifying deals only
      const perAgent = {}
      for (const d of qualifying) {
        perAgent[d.email] = perAgent[d.email] || { count: 0, revenue: 0 }
        perAgent[d.email].count++
        perAgent[d.email].revenue += d.totalValue
      }

      const sortedSlabs = [...extra.slabs].sort((a, b) =>
        Number(a.threshold || a.salesThreshold || a.revenueThreshold || 0) -
        Number(b.threshold || b.salesThreshold || b.revenueThreshold || 0))

      function slabHitFor(sales, revenue) {
        return sortedSlabs.some(s => {
          const t = Number(s.threshold || (type === 'revenue' ? s.revenueThreshold : s.salesThreshold) || 0)
          return type === 'revenue' ? revenue >= t : sales >= t
        })
      }

      let qualifies = false
      if (type === 'collective') {
        const totals = Object.values(perAgent).reduce(
          (acc, a) => { acc.count += a.count; acc.revenue += a.revenue; return acc },
          { count: 0, revenue: 0 }
        )
        qualifies = slabHitFor(totals.count, totals.revenue)
      } else {
        qualifies = Object.values(perAgent).some(a => slabHitFor(a.count, a.revenue)) ||
          Object.keys(extra.individualAmounts).length > 0
      }

      if (qualifies) {
        const newSlabs = JSON.stringify({ ...extra, status: 'Approved' })
        await supabase.from('kickers').update({ slabs: newSlabs }).eq('kicker_id', row.kicker_id)
        approvedTitles.push(row.title)
      }
    }

    res.status(200).json({ ok: true, approvedCount: approvedTitles.length, approvedTitles })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
}
