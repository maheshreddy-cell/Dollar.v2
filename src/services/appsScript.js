// Direct Apps Script Web App client — no backend server needed

const BASE_URL = import.meta.env.VITE_APPS_SCRIPT_URL

if (!BASE_URL) {
  console.error('[appsScript] VITE_APPS_SCRIPT_URL is not set in .env')
}

// ─── In-memory GET cache (5 min TTL) ─────────────────────────────────────────
const _cache = new Map()
const CACHE_TTL = 5 * 60_000

// Generation counter — incremented on every clearCache().
// In-flight fetches capture their generation and only write to cache
// if it still matches, preventing stale warmCache responses from
// overwriting fresh data after a post-write cache clear.
let _gen = 0

function cacheGet(key) {
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data
  return null
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }) }

export function clearCache() {
  _cache.clear()
  _gen++   // invalidate any in-flight fetches
}

// ─── In-flight deduplication ──────────────────────────────────────────────────
const _inflight = new Map()

async function callGet(params) {
  const key = JSON.stringify(params)
  const cached = cacheGet(key)
  if (cached) return cached

  // Deduplicate concurrent identical requests
  if (_inflight.has(key)) return _inflight.get(key)

  const url = new URL(BASE_URL)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, v)
  })

  const gen = _gen   // capture generation at fetch start
  const promise = fetch(url.toString())
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'Apps Script error')
      // Only cache if clearCache() wasn't called while this fetch was in-flight
      if (_gen === gen) cacheSet(key, data.data)
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

// Flexible column getter — handles trailing/leading spaces in header names
function col(raw, name) {
  if (raw[name] !== undefined) return raw[name]
  const trimmed = name.trim()
  const key = Object.keys(raw).find(k => k.trim() === trimmed)
  return key !== undefined ? raw[key] : undefined
}

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
    Profession:    String(col(raw, 'Profession')   || '').trim(),
    Timestamp:     String(col(raw, 'Timestamp')    || ''),
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
  ]).catch(() => { /* silent — just a best-effort pre-fetch */ })
}
