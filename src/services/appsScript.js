// Direct Apps Script Web App client — no backend server needed

const BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

if (!BASE_URL) {
  console.error('[appsScript] VITE_APPS_SCRIPT_URL is not set in .env')
}

async function callGet(params) {
  const url = new URL(BASE_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const res  = await fetch(url.toString())
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Apps Script error')
  return data.data
}

async function callPost(params, body = {}) {
  const url = new URL(BASE_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  // Use text/plain to avoid CORS preflight — Apps Script parses postData.contents
  const res = await fetch(url.toString(), {
    method:   'POST',
    headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
    body:     JSON.stringify(body),
    redirect: 'follow',
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Apps Script error')
  return data.data
}

// ─── Real sheet column mapper ─────────────────────────────────────────────────

function normalizeMonth(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (/^\d{4}-\d{2}$/.test(str)) return str  // already YYYY-MM
  const names = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12
  }
  const lower = str.toLowerCase()
  let monthNum = null
  for (const [name, num] of Object.entries(names)) {
    if (lower.includes(name)) { monthNum = num; break }
  }
  const yearMatch = str.match(/\b(20\d{2})\b/)
  if (monthNum && yearMatch) {
    return `${yearMatch[1]}-${String(monthNum).padStart(2,'0')}`
  }
  return str
}

function mapSaleRow(raw) {
  return {
    Email:       (raw['Agent Email address'] || '').trim().toLowerCase(),
    LeadName:    raw['Lead Name'] || '',
    TotalValue:  Number(raw['Total sale Value']) || 0,
    PaidActual:  Number(raw['Paid - Actual'])    || 0,
    PaymentDate: raw['Payment date'] || '',
    Month:       normalizeMonth(raw['Month']),
    Team:        raw['Team']     || '',
    Vertical:    raw['VERTICAL'] || '',
  }
}

export const appsScript = {
  // Reads
  getSheet:       (sheet)  => callGet({ action: 'getSheet', sheet }),
  getSalesSheet:  ()       => callGet({ action: 'getSheet', sheet: 'Sales done raw dump' }).then(rows => rows.map(mapSaleRow)),
  getInviteInfo:  (token)  => callGet({ action: 'getInviteInfo', token }),

  // Auth writes
  login:          (email, password)                  => callPost({ action: 'login' },          { email, password }),
  activateInvite: (token, password)                  => callPost({ action: 'activateInvite' }, { token, password }),
  createUser:     (data)                             => callPost({ action: 'createUser' },      data),

  // Generic writes
  appendRow:      (sheet, row)                       => callPost({ action: 'appendRow',  sheet }, { row }),
  updateRow:      (sheet, matchCol, matchVal, updates) => callPost({ action: 'updateRow', sheet }, { matchCol, matchVal, updates }),
  deleteRow:      (sheet, matchCol, matchVal)        => callPost({ action: 'deleteRow',  sheet }, { matchCol, matchVal }),
  upsertRow:      (sheet, matchCol, matchVal, row)   => callPost({ action: 'upsertRow',  sheet }, { matchCol, matchVal, row }),
}
