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

export const appsScript = {
  // Reads
  getSheet:       (sheet)                            => callGet({ action: 'getSheet', sheet }),
  getInviteInfo:  (token)                            => callGet({ action: 'getInviteInfo', token }),

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
