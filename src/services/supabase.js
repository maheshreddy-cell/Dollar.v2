// Supabase data layer — replaces appsScript.js
// All requests go through /api/db (Vercel serverless) so the service key stays server-side.

const BASE_URL = '/api/db'

// ─── In-memory cache (55s TTL) ────────────────────────────────────────────────
const _cache = new Map()
const CACHE_TTL = 55_000
let _gen = 0

function cacheGet(key) {
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data
  return null
}
function cacheSet(key, data) { _cache.set(key, { data, ts: Date.now() }) }

// ─── localStorage cache (5 min TTL) ──────────────────────────────────────────
const LS_PREFIX = 'dv2_'
const LS_TTL    = 5 * 60 * 1000

function _lsKey(key) {
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
  try { localStorage.setItem(_lsKey(key), JSON.stringify({ d: data, t: Date.now() })) } catch {}
}

export function clearCache() {
  _cache.clear()
  _gen++
  try {
    Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX)).forEach(k => localStorage.removeItem(k))
  } catch {}
}

export function clearSheetCache(sheetName) {
  const key = JSON.stringify({ action: 'getSheet', sheet: sheetName })
  _cache.delete(key)
  try { localStorage.removeItem(_lsKey(key)) } catch {}
}

// ─── In-flight deduplication ──────────────────────────────────────────────────
const _inflight = new Map()

function _bgFetch(key, url) {
  if (_inflight.has(key)) return
  const gen = _gen
  const promise = fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'DB error')
      if (_gen === gen) { cacheSet(key, data.data); lsWrite(key, data.data) }
      _inflight.delete(key)
      return data.data
    })
    .catch(() => { _inflight.delete(key) })
  _inflight.set(key, promise)
}

async function callGet(params) {
  const key = JSON.stringify(params)

  const mem = cacheGet(key)
  if (mem) return mem

  const ls = lsRead(key)
  if (ls) {
    cacheSet(key, ls)
    const url = BASE_URL + '?' + new URLSearchParams(params).toString()
    _bgFetch(key, url)
    return ls
  }

  if (_inflight.has(key)) return _inflight.get(key)

  const url = BASE_URL + '?' + new URLSearchParams(params).toString()
  const gen = _gen
  const promise = fetch(url)
    .then(r => r.json())
    .then(data => {
      if (!data.success) throw new Error(data.error || 'DB error')
      if (_gen === gen) { cacheSet(key, data.data); lsWrite(key, data.data) }
      _inflight.delete(key)
      return data.data
    })
    .catch(err => { _inflight.delete(key); throw err })
  _inflight.set(key, promise)
  return promise
}

async function callPost(params, body = {}) {
  const url = BASE_URL + '?' + new URLSearchParams(params).toString()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, ...body }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'DB error')
  return data.data
}

export const appsScript = {
  getSheet:       (sheet)  => callGet({ action: 'getSheet', sheet }),
  // Sales data is already mapped server-side — no mapSaleRow needed
  getSalesSheet:  ()       => callGet({ action: 'getSheet', sheet: 'Sales done raw dump' }),
  getInviteInfo:  (token)  => callGet({ action: 'getInviteInfo', token }),

  login:          (email, password)                    => callPost({ action: 'login' },          { email, password }),
  activateInvite: (token, password)                    => callPost({ action: 'activateInvite' }, { token, password }),
  createUser:     (data)                               => callPost({ action: 'createUser' },      data),

  appendRow:      (sheet, row)                         => callPost({ action: 'appendRow',  sheet }, { row }),
  updateRow:      (sheet, matchCol, matchVal, updates) => callPost({ action: 'updateRow',  sheet }, { matchCol, matchVal, updates }),
  deleteRow:      (sheet, matchCol, matchVal)          => callPost({ action: 'deleteRow',  sheet }, { matchCol, matchVal }),
}

export function warmCache() {
  Promise.all([
    callGet({ action: 'getSheet', sheet: 'Users' }),
    callGet({ action: 'getSheet', sheet: 'Targets' }),
    callGet({ action: 'getSheet', sheet: 'Sales done raw dump' }),
    callGet({ action: 'getSheet', sheet: 'CommissionConfig' }),
    callGet({ action: 'getSheet', sheet: 'Kickers' }),
  ]).catch(() => {})
}
