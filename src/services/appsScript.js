// Direct Apps Script Web App client — no backend server needed

const BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

if (!BASE_URL) {
  console.error('[appsScript] VITE_APPS_SCRIPT_URL is not set in .env')
}

// ─── In-memory GET cache (55 s TTL) ──────────────────────────────────────────
const _cache = new Map()
const CACHE_TTL = 55_000

// Generation counter — incremented on every clearCache() to invalidate in-flight fetches
let _gen = 0

function cacheGet(key) {
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data
  return null
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }) }

// ─── localStorage persistent cache (5 min TTL — survives page refresh) ───────
const LS_PREFIX = 'dv2_'
const LS_TTL    = 5 * 60 * 1000

function _lsKey(key) {
  // short deterministic key from params string
  let h = 5381
  for (let i = 0; i < key.length; i++) h = (h * 33 ^ key.charCodeAt(i)) >>> 0
  return LS_PREFIX + h.toString(36)
}

function lsRead(key) {
  try {
    const raw = localStorage.getItem(_lsKey(key))
    if (!raw) return null
    const { d, t } = JSON.parse(raw)
    return (Date.now() - t < LS_TTL) ? d : null
  } catch { return null }
}

function lsWrite(key, data) {
  try {
    localStorage.setItem(_lsKey(key), JSON.stringify({ d: data, t: Date.now() }))
  } catch {}
}

export function clearCache() {
  _cache.clear()
  _gen++
  // Clear all dv2_ entries from localStorage too
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k))
  } catch {}
}

// ─── In-flight deduplication ──────────────────────────────────────────────────
const _inflight = new Map()

// Fire-and-forget background network fetch — updates caches without blocking
function _bgFetch(key, params) {
  if (_inflight.has(key)) return
  const url = new URL(BASE_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const gen = _gen
  const promise = fetch(url.toString())
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'Apps Script error')
      if (_gen === gen) { cacheSet(key, data.data); lsWrite(key, data.data) }
      _inflight.delete(key)
      return data.data
    })
    .catch(err => { _inflight.delete(key); throw err })
  _inflight.set(key, promise)
}

async function callGet(params) {
  const key = JSON.stringify(params)

  // 1. Hot in-memory cache — zero latency
  const mem = cacheGet(key)
  if (mem) return mem

  // 2. Stale-while-revalidate from localStorage — instant on revisit/refresh
  //    Returns immediately and refreshes in background
  const ls = lsRead(key)
  if (ls) {
    cacheSet(key, ls)          // warm in-memory so next call is even faster
    _bgFetch(key, params)      // silently refresh in background
    return ls
  }

  // 3. Full network fetch (only on very first load per sheet)
  if (_inflight.has(key)) return _inflight.get(key)

  const url = new URL(BASE_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })
  const gen = _gen
  const promise = fetch(url.toString())
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'Apps Script error')
      if (_gen === gen) { cacheSet(key, data.data); lsWrite(key, data.data) }
      _inflight.delete(key)
      return data.data
    })
    .catch(err => { _inflight.delete(key); throw err })
  _inflight.set(key, promise)
  return promise
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

// Flexible column getter — handles trailing/leading spaces AND case differences in header names
function col(raw, name) {
  if (raw[name] !== undefined) return raw[name]
  const low = name.trim().toLowerCase()
  const key = Object.keys(raw).find(k => k.trim().toLowerCase() === low)
  return key !== undefined ? raw[key] : undefined
}

function normalizeMonth(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (!str) return ''

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) return str

  // ISO date / date-only strings — Google Sheets returns these when cells are
  // date-formatted.  Shift to IST (UTC+5:30) so "2026-02-28T18:30:00.000Z"
  // correctly resolves to "2026-03" instead of "2026-02".
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
      return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
    }
  }

  // Named month strings: "March 2026", "Mar 2026", "march-2026" etc.
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
    return `${yearMatch[1]}-${String(monthNum).padStart(2, '0')}`
  }

  // Last resort: try generic Date parse + IST shift
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
  }

  return str
}

function mapSaleRow(raw) {
  return {
    Email:         (col(raw, 'Agent Email address') || '').trim().toLowerCase(),
    LeadName:      String(col(raw, 'Lead Name') || '').trim(),
    CustomerEmail: String(col(raw, 'Customer E-mail id') || '').trim(),
    TotalValue:    Number(col(raw, 'Total sale Value'))  || 0,
    PaidActual:    Number(col(raw, 'Paid - Actual'))     || 0,
    AmountCleared: Number(col(raw, 'Amount cleared'))    || 0,
    PaymentDate:   String(col(raw, 'Payment date') || ''),
    Month:         normalizeMonth(col(raw, 'Month')),
    Team:          String(col(raw, 'Team')    || '').trim(),
    Vertical:      String(col(raw, 'VERTICAL') || '').trim(),
    Status:        String(col(raw, 'Status')  || '').trim(),
    Course:        String(col(raw, 'Course')  || '').trim(),
    Rating:        String(col(raw, 'Rating')  || '').trim(),
    PaymentType:   String(col(raw, 'Payment Type') || '').trim(),
    Profession:       String(col(raw, 'Profession')              || '').trim(),
    Timestamp:        String(col(raw, 'Timestamp')              || ''),
    LoanDocsCollected:String(col(raw, 'Loan Documents Collected')|| '').trim(),
    T2Amount:         Number(col(raw, 'T+2 Amount'))              || 0,
  }
}

export const appsScript = {
  // Reads
  getSheet:       (sheet)  => callGet({ action: 'getSheet', sheet }),
  getSalesSheet:  ()       => callGet({ action: 'getSheet', sheet: 'Sales done raw dump' }).then(rows => rows.map(mapSaleRow)),
  getInviteInfo:  (token)  => callGet({ action: 'getInviteInfo', token }),

  // Auth writes
  login:          (email, password)                    => callPost({ action: 'login' },          { email, password }),
  activateInvite: (token, password)                    => callPost({ action: 'activateInvite' }, { token, password }),
  createUser:     (data)                               => callPost({ action: 'createUser' },      data),

  // Generic writes
  appendRow:      (sheet, row)                         => callPost({ action: 'appendRow',  sheet }, { row }),
  updateRow:      (sheet, matchCol, matchVal, updates) => callPost({ action: 'updateRow',  sheet }, { matchCol, matchVal, updates }),
  deleteRow:      (sheet, matchCol, matchVal)          => callPost({ action: 'deleteRow',  sheet }, { matchCol, matchVal }),
}

// Pre-warms the cache by fetching the three most-used sheets in parallel.
// Call this immediately after login so data is ready before the user navigates.
export function warmCache() {
  Promise.all([
    callGet({ action: 'getSheet', sheet: 'Users' }),
    callGet({ action: 'getSheet', sheet: 'Targets' }),
    callGet({ action: 'getSheet', sheet: 'Sales done raw dump' }),
    callGet({ action: 'getSheet', sheet: 'CommissionConfig' }),
    callGet({ action: 'getSheet', sheet: 'Kickers' }),
  ]).catch(() => { /* silent — just a best-effort pre-fetch */ })
}
