// Vercel cron job — syncs new rows from Google Sheet into Supabase sales table
// Runs every hour. New rows are detected by (agent_email, payment_date, total_sale_value).
import { createClient } from '@supabase/supabase-js'

const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/1vumM76Vr8NVB-2jG5StiAeVY-cM_hVoYE4gCaDEHm1s/export?format=csv&gid=0'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function parseDate(val) {
  if (!val) return null
  const s = String(val).trim().split('T')[0].split(' ')[0]
  // Try DD/MM/YYYY first (sheet format), then YYYY-MM-DD
  const dmY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2,'0')}-${dmY[1].padStart(2,'0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return null
}

function num(val) {
  if (!val) return null
  const v = String(val).replace(/₹/g, '').replace(/,/g, '').trim()
  const f = parseFloat(v)
  return isNaN(f) ? null : f
}

function pct(val) {
  if (!val) return null
  const v = String(val).trim()
  if (v.endsWith('%')) { const f = parseFloat(v); return isNaN(f) ? null : f / 100 }
  const f = parseFloat(v)
  return isNaN(f) ? null : f
}

function parseMonth(val) {
  if (!val) return null
  const s = String(val).trim()
  if (/^\d{4}-\d{2}$/.test(s)) return s
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' }
  const m = s.toLowerCase().match(/^([a-z]{3})\s+(\d{4})$/)
  if (m && months[m[1]]) return `${m[2]}-${months[m[1]]}`
  return s
}

function parseCSV(text) {
  const rows = []
  let cur = '', inQ = false, row = []
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { inQ = !inQ }
    else if (c === ',' && !inQ) { row.push(cur); cur = '' }
    else if ((c === '\n' || c === '\r') && !inQ) {
      if (c === '\r' && text[i+1] === '\n') i++
      row.push(cur); cur = ''
      rows.push(row); row = []
    } else { cur += c }
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

function col(row, idx) {
  return (row[idx] || '').replace(/^"|"$/g, '').trim()
}

export default async function handler(req, res) {
  // Allow manual trigger via GET, and Vercel cron via GET
  if (req.method !== 'GET') return res.status(405).end()

  try {
    // 1. Fetch sheet
    const r = await fetch(SHEET_CSV)
    if (!r.ok) throw new Error(`Sheet fetch failed: ${r.status}`)
    const text = await r.text()
    const rows = parseCSV(text).slice(1).filter(r => r.some(c => c.trim()))

    // 2. Fetch existing keys from Supabase
    const existing = new Set()
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('sales').select('agent_email,payment_date,total_sale_value')
        .range(from, from + 999)
      if (error) throw error
      ;(data || []).forEach(row => {
        existing.add(`${(row.agent_email||'').toLowerCase()}|${(String(row.payment_date||'')).slice(0,10)}|${row.total_sale_value}`)
      })
      if (!data || data.length < 1000) break
      from += 1000
    }

    // 3. Find new rows
    const newRows = []
    for (const row of rows) {
      const email = col(row, 1).toLowerCase()
      if (!email) continue
      const paymentDate = parseDate(col(row, 10))
      const totalVal = num(col(row, 6))
      const key = `${email}|${paymentDate || ''}|${totalVal}`
      if (existing.has(key)) continue

      const monthRaw = col(row, 24)
      newRows.push({
        timestamp:           col(row, 0) || null,
        agent_email:         email,
        lead_name:           col(row, 2) || null,
        course:              col(row, 3) || null,
        rating:              num(col(row, 5)),
        total_sale_value:    totalVal,
        payment_type:        col(row, 7) || null,
        profession:          col(row, 8) || null,
        lead_source:         col(row, 9) || null,
        payment_date:        paymentDate,
        paid_actual:         num(col(row, 20)),   // Col U
        loan_docs_collected: col(row, 21) || null,
        status:              col(row, 23) || null,
        month:               parseMonth(monthRaw),
        amount_cleared:      pct(col(row, 25)),
        team:                col(row, 26) || null,
        vertical:            col(row, 37) || null,
        t2_amount:           num(col(row, 39)),
      })
    }

    if (newRows.length === 0) {
      return res.status(200).json({ synced: 0, message: 'No new rows' })
    }

    // 4. Insert in batches of 500
    let inserted = 0
    for (let i = 0; i < newRows.length; i += 500) {
      const { error } = await supabase.from('sales').insert(newRows.slice(i, i + 500))
      if (error) throw error
      inserted += Math.min(500, newRows.length - i)
    }

    return res.status(200).json({ synced: inserted, total_sheet: rows.length, message: `Inserted ${inserted} new rows` })

  } catch (err) {
    console.error('sync-sales error:', err)
    return res.status(500).json({ error: err.message })
  }
}
