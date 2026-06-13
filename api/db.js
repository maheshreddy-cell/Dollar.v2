// Vercel serverless function — Supabase data layer (replaces Google Apps Script)
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const TABLE = {
  'Users':               'users',
  'Targets':             'targets',
  'Sales done raw dump': 'sales',
  'CommissionConfig':    'commission_config',
  'Kickers':             'kickers',
  'KickerEarnings':      'kicker_earnings',
  'presales calls':      'presales_calls',
  'UserActivity':        'user_activity',
  'Usage_Log':           'user_activity',
  'PreSalesSales':       'presales_sales',
  'ManagerSlabs':        'manager_slabs',
  'Deals':               'deals',
}

const toSheet = {
  users:             r => ({ Email: r.email, Name: r.name, Role: r.role, ManagerEmail: r.manager_email, PasswordHash: r.password_hash, InviteToken: r.invite_token, InviteExpiry: r.invite_expiry, Status: r.status, Team: r.team, CreatedAt: r.created_at }),
  targets:           r => ({ Key: r.key, Email: r.email, Month: r.month, TargetAmount: r.target_amount, CommissionPct: r.commission_pct, CommissionStartDate: r.commission_start_date, CommissionEndDate: r.commission_end_date, AssignedBy: r.assigned_by, AssignedAt: r.assigned_at }),
  sales:             r => ({ Email: r.agent_email || '', LeadName: r.lead_name || '', CustomerEmail: r.customer_email || '', TotalValue: Number(r.total_sale_value) || 0, PaidActual: Number(r.paid_actual) || 0, AmountCleared: Number(r.amount_cleared) || 0, PaymentDate: r.payment_date || '', Month: r.month || '', Team: r.team || '', Vertical: r.vertical || '', Status: r.status || '', Course: r.course || '', Rating: r.rating, PaymentType: r.payment_type || '', Profession: r.profession || '', Timestamp: r.timestamp || '', LoanDocsCollected: r.loan_docs_collected || '', T2Amount: Number(r.t2_amount) || 0 }),
  commission_config: r => ({ Key: r.key, ManagerEmail: r.manager_email, Month: r.month, ProjectedSlabs: r.projected_slabs, RealisedSlabs: r.realised_slabs, AssignedBy: r.assigned_by, AssignedAt: r.assigned_at, ProgramFilter: r.program_filter || 'all' }),
  kickers:           r => ({ KickerId: r.kicker_id, Title: r.title, Message: r.message, Type: r.type, MinSaleValue: r.min_sale_value || 0, DateFrom: r.date_from, DateTo: r.date_to, Slabs: r.slabs, TargetTeams: r.target_teams, TargetRoles: r.target_roles, Pinned: String(r.pinned || false), AnnouncedBy: r.announced_by, AnnouncedByRole: r.announced_by_role, AnnouncedAt: r.announced_at }),
  kicker_earnings:   r => ({ Date: r.date, Month: r.month, AgentEmail: r.agent_email, AgentName: r.agent_name, KickerType: r.kicker_type, Details: r.details, Amount: r.amount, LoggedAt: r.logged_at }),
  presales_calls:    r => ({ Timestamp: r.timestamp, 'Email address': r.email_address, Course: r.course, 'Learner Name': r.learner_name, 'Learner PH': r.learner_ph, 'Lead source': r.lead_source, Date: r.date, 'Assigned to ': r.assigned_to, Month: r.month }),
  user_activity:     r => ({ Timestamp: r.timestamp, Date: r.date, Email: r.email, Name: r.name, Role: r.role }),
  presales_sales:    r => ({ PreSalesEmail: r.presales_email, Month: r.month, LeadName: r.lead_name, Amount: r.amount }),
  manager_slabs:     r => ({ Type: r.type, SlabName: r.slab_name, MaxTarget: r.max_target, CommissionPct: r.commission_pct, CreatedBy: r.created_by }),
  deals:             r => ({ ID: r.id, Email: r.email, Month: r.month, CustomerName: r.customer_name, Docs: r.docs, Price: r.price, Status: r.status, DealDate: r.deal_date, ClosedDate: r.closed_date }),
}

const colMap = {
  users:             { Email: 'email', Name: 'name', Role: 'role', ManagerEmail: 'manager_email', PasswordHash: 'password_hash', InviteToken: 'invite_token', Status: 'status', Team: 'team' },
  targets:           { Key: 'key', Email: 'email', Month: 'month' },
  commission_config: { Key: 'key', ManagerEmail: 'manager_email' },
  kickers:           { KickerId: 'kicker_id', Title: 'title', Message: 'message', Type: 'type', MinSaleValue: 'min_sale_value', DateFrom: 'date_from', DateTo: 'date_to', Slabs: 'slabs', TargetTeams: 'target_teams', TargetRoles: 'target_roles', Pinned: 'pinned', AnnouncedBy: 'announced_by' },
  deals:             { ID: 'id', Status: 'status', ClosedDate: 'closed_date' },
}

const arrayOrder = {
  targets:           ['key','email','month','target_amount','commission_pct','commission_start_date','commission_end_date','assigned_by','assigned_at'],
  kickers:           ['kicker_id','title','message','type','min_sale_value','date_from','date_to','slabs','target_teams','target_roles','pinned','announced_by','announced_by_role','announced_at'],
  commission_config: ['key','manager_email','month','projected_slabs','realised_slabs','assigned_by','assigned_at','program_filter'],
  deals:             ['id','email','month','customer_name','docs','price','status','deal_date','closed_date'],
}

const objToDb = {
  user_activity:   o => ({ timestamp: o.Timestamp, date: o.Date, email: o.Email, name: o.Name, role: o.Role }),
  kicker_earnings: o => ({ date: o.Date, month: o.Month, agent_email: o.AgentEmail, agent_name: o.AgentName, kicker_type: o.KickerType, details: o.Details, amount: o.Amount, logged_at: o.LoggedAt }),
}

function dbCol(table, sheetCol) {
  return colMap[table]?.[sheetCol] ?? sheetCol.toLowerCase().replace(/ /g, '_')
}

// Supabase caps a single select at 1000 rows. Fetch all rows in 1000-row pages.
async function selectAll(table) {
  const PAGE = 1000
  let from = 0
  let all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) return { data: null, error }
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { data: all, error: null }
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex')
}

// Read raw body from Vercel request stream — Vercel does NOT auto-parse JSON
function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', chunk => { data += chunk.toString() })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const ok   = (data)      => res.status(200).json({ success: true,  data })
  const fail = (msg, s=400) => res.status(s).json({ success: false, error: msg })

  // GET requests — action + params from query string
  if (req.method === 'GET') {
    const { action, sheet, token } = req.query

    if (action === 'getSheet') {
      const table = TABLE[sheet]
      if (!table) return ok([])
      const { data, error } = await selectAll(table)
      if (error) return fail(error.message)
      const mapper = toSheet[table] || (r => r)
      return ok((data || []).map(mapper))
    }

    if (action === 'getInviteInfo') {
      const { data, error } = await supabase.from('users').select('email,name,role,invite_expiry').eq('invite_token', token).single()
      if (error || !data) return fail('Invalid or expired invite token')
      if (data.invite_expiry && new Date(data.invite_expiry) < new Date()) return fail('Invite token has expired')
      return ok({ email: data.email, name: data.name, role: data.role })
    }

    return fail('Unknown action')
  }

  // POST requests — read body from stream
  const body = await readBody(req)
  const action = body.action || req.query.action

  if (action === 'login') {
    const { email, password } = body
    const hash = sha256(password)
    const { data, error } = await supabase.from('users').select('email,name,role,manager_email,team,status,password_hash').eq('email', (email || '').trim().toLowerCase()).single()
    if (error || !data) return fail('User not found')
    if (data.status === 'invited') return fail('Account not activated yet')
    if (data.password_hash !== hash) return fail('Invalid password')
    return ok({ email: data.email, name: data.name, role: data.role, managerEmail: data.manager_email, team: data.team })
  }

  if (action === 'activateInvite') {
    const { token, password } = body
    const { data: user, error } = await supabase.from('users').select('email,name,role,invite_expiry').eq('invite_token', token).single()
    if (error || !user) return fail('Invalid invite token')
    if (user.invite_expiry && new Date(user.invite_expiry) < new Date()) return fail('Invite token has expired')
    await supabase.from('users').update({ password_hash: sha256(password), invite_token: null, invite_expiry: null, status: 'active' }).eq('email', user.email)
    return ok({ email: user.email, name: user.name, role: user.role })
  }

  if (action === 'createUser') {
    const { name, email, role, managerEmail } = body
    const inviteToken = crypto.randomUUID()
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase.from('users').upsert({ email: (email || '').trim().toLowerCase(), name, role, manager_email: managerEmail, invite_token: inviteToken, invite_expiry: inviteExpiry, status: 'invited', created_at: new Date().toISOString() })
    if (error) return fail(error.message)
    return ok({ inviteToken })
  }

  if (action === 'appendRow') {
    const { sheet, row } = body
    const table = TABLE[sheet]
    if (!table) return ok({ appended: true })
    let record
    if (Array.isArray(row)) {
      const cols = arrayOrder[table]
      if (!cols) return fail(`No column order for: ${table}`)
      record = Object.fromEntries(cols.map((c, i) => [c, row[i] ?? null]))
    } else if (objToDb[table]) {
      record = objToDb[table](row)
    } else {
      record = Object.fromEntries(Object.entries(row).map(([k, v]) => [dbCol(table, k), v]))
    }
    const { error } = await supabase.from(table).insert(record)
    if (error) return fail(error.message)
    return ok({ appended: true })
  }

  if (action === 'updateRow') {
    const { sheet, matchCol, matchVal, updates } = body
    const table = TABLE[sheet]
    if (!table) return ok({ updated: true })
    const dbUpdates = Object.fromEntries(Object.entries(updates).map(([k, v]) => [dbCol(table, k), v]))
    const { error } = await supabase.from(table).update(dbUpdates).eq(dbCol(table, matchCol), matchVal)
    if (error) return fail(error.message)
    return ok({ updated: true })
  }

  if (action === 'deleteRow') {
    const { sheet, matchCol, matchVal } = body
    const table = TABLE[sheet]
    if (!table) return ok({ deleted: true })
    const { error } = await supabase.from(table).delete().eq(dbCol(table, matchCol), matchVal).limit(1)
    if (error) return fail(error.message)
    return ok({ deleted: true })
  }

  return fail('Unknown action')
}
