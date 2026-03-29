// All API calls go directly to Apps Script — no Node.js backend needed
import { appsScript, clearCache } from './appsScript'
import { v4 as uuidv4 } from 'uuid'
import { AGENT_TARGET_PRESETS } from '../utils/targetPresets'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email, password) =>
  appsScript.login(email, password)

export const activateInvite = (token, password) =>
  appsScript.activateInvite(token, password)

export const getInviteInfo = (token) =>
  appsScript.getInviteInfo(token)

// ─── Deals ───────────────────────────────────────────────────────────────────

export const getDeals = async (filterEmail, month) => {
  const deals = await appsScript.getSalesSheet()
  return deals.filter(d =>
    (!filterEmail || d.Email === filterEmail.trim().toLowerCase()) &&
    (!month       || d.Month === month)
  )
}

export const getDealsForSubtree = async (emails, month) => {
  const deals = await appsScript.getSalesSheet()
  const lower = emails.map(e => e.trim().toLowerCase())
  return deals.filter(d =>
    lower.includes(d.Email) &&
    (!month || d.Month === month)
  )
}

export const createDeal = (data) => {
  // data: { email, customerName, docs, price, dealDate, month }
  const row = [
    uuidv4(),
    data.email,
    data.month,
    data.customerName,
    data.docs || '',
    Number(data.price),
    'Pending',
    data.dealDate,
    '',  // ClosedDate empty until cleared
  ]
  return appsScript.appendRow('Deals', row)
}

export const updateDeal = (id, status) => {
  const updates = { Status: status }
  if (status === 'Cleared') updates.ClosedDate = new Date().toISOString().split('T')[0]
  return appsScript.updateRow('Deals', 'ID', id, updates)
}

export const deleteDeal = (id) =>
  appsScript.deleteRow('Deals', 'ID', id)

// ─── Targets ──────────────────────────────────────────────────────────────────

export const getTargets = async (filterEmail, month) => {
  const targets = await appsScript.getSheet('Targets')
  const lowerEmail = filterEmail?.trim().toLowerCase()
  const filtered = targets.filter(t => {
    const email = String(tf(t, 'Email') ?? '').trim().toLowerCase()
    const mon   = normalizeMonth(tf(t, 'Month'))
    return (!filterEmail || email === lowerEmail) && (!month || mon === month)
  })
  // Sort newest-first so callers always get the latest assignment first
  return filtered.sort((a, b) => new Date(tf(b, 'AssignedAt') || 0) - new Date(tf(a, 'AssignedAt') || 0))
}

export const deleteTarget = async (email, month) => {
  const key = `${email.trim().toLowerCase()}_${month}`
  // Delete all rows for this email+month (may be multiple history entries)
  let deleted = true
  while (deleted) {
    try {
      await appsScript.deleteRow('Targets', 'Key', key)
    } catch {
      deleted = false
    }
  }
  clearCache()
}

export const assignTarget = async (data, assignerEmail) => {
  // data: { email, month, targetAmount, presetId, commissionPct, commissionStartDate, slabs }
  // For agents: presetId = "basic"|"average"|"pro" stored in CommissionPct; targetAmount is manager-set
  // For others: commissionPct = numeric %, slabs JSON in CommissionEndDate
  // Each assignment always appends a new row — duplicates are kept as history.
  // Latest entry (by AssignedAt) wins for commission/dashboard calculations.
  const key   = `${data.email.trim().toLowerCase()}_${data.month}`
  const email = data.email.trim().toLowerCase()
  const commissionPctValue = data.presetId ?? data.commissionPct ?? 0
  const slabsJson = data.slabs ? JSON.stringify(data.slabs) : ''
  const now   = new Date().toISOString()
  const row   = [key, email, data.month, Number(data.targetAmount), commissionPctValue, data.commissionStartDate || '', slabsJson, assignerEmail, now]

  const result = await appsScript.appendRow('Targets', row)
  clearCache()   // clear so next read picks up the new row
  return result
}

// ─── Users ────────────────────────────────────────────────────────────────────

export const getAllUsers = () => appsScript.getSheet('Users')

export const getTeam = async (managerEmail) => {
  const users = await appsScript.getSheet('Users')
  return users
    .filter(u => u.ManagerEmail === managerEmail)
    .map(stripSensitive)
}

export const getSubtree = async (rootEmail) => {
  const users = await appsScript.getSheet('Users')
  return buildSubtree(users.map(stripSensitive), rootEmail)
}

export const getSubtreeEmails = async (rootEmail) => {
  const users = await appsScript.getSheet('Users')
  return collectEmails(users, rootEmail)
}

export const inviteUser = async (data) => {
  // data: { name, email, role, managerEmail }
  const result = await appsScript.createUser(data)
  return result.inviteToken
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export const getSummary = async (userEmail, month) => {
  const [targets, deals] = await Promise.all([
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])
  const lowerUser = userEmail?.trim().toLowerCase()
  const target = latestTarget(targets, lowerUser, month)
  if (!target) return {
    totalTarget: 0, totalAchieved: 0, totalCommission: 0, achievementPct: 0,
    totalSaleValue: 0, totalDeals: 0, loanDocs: {}, slabInfo: null,
  }

  // All deals for this agent+month (used for pipeline / loan docs breakdown)
  const agentDeals = deals.filter(d =>
    d.Email === lowerUser && d.Month === month
  )

  // Commission-eligible paid deals only
  const cleared = agentDeals.filter(d =>
    d.PaidActual > 0 &&
    isInCommissionPeriod(d.PaymentDate, tf(target, 'CommissionStartDate'), null)
  )

  const achieved        = cleared.reduce((s, d) => s + d.PaidActual, 0)
  const commission      = calcTieredCommission(achieved, target)
  const totalSaleValue  = agentDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)

  // Loan Documents Collected — count each unique dropdown value
  const loanDocs = {}
  for (const d of agentDeals) {
    const v = (d.LoanDocsCollected || '').trim() || '—'
    loanDocs[v] = (loanDocs[v] || 0) + 1
  }

  const tAmount     = Number(tf(target, 'TargetAmount') ?? 0)
  const slabInfo    = getSlabInfo(achieved, target)
  const presetLabel = resolvePresetLabel(tf(target, 'CommissionPct'))

  return {
    totalTarget:     tAmount,
    totalAchieved:   achieved,
    totalCommission: commission,
    achievementPct:  tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
    totalSaleValue,
    totalDeals:      cleared.length,
    loanDocs,
    slabInfo,
    commissionPct:   presetLabel ?? Number(tf(target, 'CommissionPct') ?? 0),
    commissionStart: tf(target, 'CommissionStartDate'),
  }
}

export const getLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])
  const emails = collectEmails(users, rootEmail).filter(e => e !== rootEmail)
  const agents = users.filter(u => emails.includes(u.Email) && u.Role === 'Agent')

  return agents.map(agent => {
    const target     = latestTarget(targets, agent.Email?.trim().toLowerCase(), month)
    const tAmount    = target ? Number(tf(target, 'TargetAmount') ?? 0) : 0
    const agentEmail = agent.Email.trim().toLowerCase()

    const agentDeals = deals.filter(d =>
      d.Email === agentEmail &&
      d.Month === month &&
      (!target || isInCommissionPeriod(d.PaymentDate, tf(target, 'CommissionStartDate'), null))
    )

    const paidDeals       = agentDeals.filter(d => d.PaidActual > 0)
    const achieved        = paidDeals.reduce((s, d) => s + d.PaidActual, 0)
    const dealsCount      = paidDeals.length
    const totalSaleValue  = agentDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)

    // Loan docs: count deals where LoanDocsCollected is a meaningful "yes" value
    const loanDocsTotal = agentDeals.length
    const loanDocsOk    = agentDeals.filter(d => {
      const v = (d.LoanDocsCollected || '').trim().toLowerCase()
      return v && !['no', 'pending', 'not collected', 'n/a', '-', ''].includes(v)
    }).length

    return {
      name:              agent.Name,
      email:             agent.Email,
      target:            tAmount,
      achieved,
      dealsCount,
      totalSaleValue,
      pendingCollection: Math.max(0, totalSaleValue - achieved),
      loanDocsOk,
      loanDocsTotal,
      pct:               tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
      commission:        target ? calcTieredCommission(achieved, target) : 0,
      slabInfo:          getSlabInfo(achieved, target),
    }
  }).sort((a, b) => b.achieved - a.achieved)
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export const getSalesAnalytics = async (month) => {
  const deals = await appsScript.getSalesSheet()
  const rows = deals.filter(d => !month || d.Month === month)

  const byTeam     = {}
  const byVertical = {}

  for (const d of rows) {
    const team     = d.Team     || 'Unassigned'
    const vertical = d.Vertical || 'Unassigned'
    const val      = d.PaidActual || 0

    if (!byTeam[team])         byTeam[team]     = { name: team,     achieved: 0, deals: 0 }
    byTeam[team].achieved    += val
    byTeam[team].deals       += 1

    if (!byVertical[vertical]) byVertical[vertical] = { name: vertical, achieved: 0, deals: 0 }
    byVertical[vertical].achieved += val
    byVertical[vertical].deals    += 1
  }

  return {
    byTeam:        Object.values(byTeam).sort((a, b) => b.achieved - a.achieved),
    byVertical:    Object.values(byVertical).sort((a, b) => b.achieved - a.achieved),
    totalAchieved: rows.reduce((s, d) => s + (d.PaidActual || 0), 0),
    totalDeals:    rows.length,
  }
}

// Team-scoped analytics — filters deals to the subtree under rootEmail.
// Pass fullOrg=true (Admin) to skip email filter and count all deals.
export const getTeamSalesAnalytics = async (rootEmail, month, fullOrg = false) => {
  const [users, deals] = await Promise.all([
    fullOrg ? Promise.resolve([]) : appsScript.getSheet('Users'),
    appsScript.getSalesSheet(),
  ])

  let rows
  if (fullOrg) {
    rows = deals.filter(d => !month || d.Month === month)
  } else {
    const emails = collectEmails(users, rootEmail).map(e => e.trim().toLowerCase())
    rows = deals.filter(d => emails.includes(d.Email) && (!month || d.Month === month))
  }

  const byTeam     = {}
  const byVertical = {}

  for (const d of rows) {
    const team     = d.Team     || 'Unassigned'
    const vertical = d.Vertical || 'Unassigned'
    const val      = d.PaidActual || 0

    if (!byTeam[team])         byTeam[team]     = { name: team,     achieved: 0, deals: 0 }
    byTeam[team].achieved    += val
    byTeam[team].deals       += 1

    if (!byVertical[vertical]) byVertical[vertical] = { name: vertical, achieved: 0, deals: 0 }
    byVertical[vertical].achieved += val
    byVertical[vertical].deals    += 1
  }

  return {
    byTeam:        Object.values(byTeam).sort((a, b) => b.achieved - a.achieved),
    byVertical:    Object.values(byVertical).sort((a, b) => b.achieved - a.achieved),
    totalAchieved: rows.reduce((s, d) => s + (d.PaidActual || 0), 0),
    totalDeals:    rows.length,
  }
}

// ─── Commission Config ────────────────────────────────────────────────────────

export const getCommissionConfig = () => appsScript.getSheet('CommissionConfig')

export const addSlab = (data, createdBy) => {
  const row = [data.slabName, Number(data.maxTarget), Number(data.commissionPct), createdBy]
  return appsScript.appendRow('CommissionConfig', row)
}

export const deleteSlab = (slabName) =>
  appsScript.deleteRow('CommissionConfig', 'SlabName', slabName)

// ─── Helpers (internal) ───────────────────────────────────────────────────────

function stripSensitive(u) {
  const { PasswordHash, InviteToken, InviteExpiry, ...safe } = u
  return safe
}

function collectEmails(users, rootEmail) {
  const emails  = [rootEmail]
  const queue   = [rootEmail]
  while (queue.length) {
    const current  = queue.shift()
    const children = users.filter(u => u.ManagerEmail === current).map(u => u.Email)
    children.forEach(e => { emails.push(e); queue.push(e) })
  }
  return emails
}

function buildSubtree(users, rootEmail) {
  const root = users.find(u => u.Email === rootEmail)
  if (!root) return null
  return {
    ...root,
    children: users
      .filter(u => u.ManagerEmail === rootEmail)
      .map(u => buildSubtree(users, u.Email))
      .filter(Boolean),
  }
}

// Flexible field getter — handles column name casing/spacing differences
// from Apps Script (e.g. "email", " Email", "EMAIL" all resolve correctly)
function tf(row, name) {
  if (row[name] !== undefined) return row[name]
  const low = name.toLowerCase()
  const key = Object.keys(row).find(k => k.trim().toLowerCase() === low)
  return key !== undefined ? row[key] : undefined
}

// Normalizes month values from Google Sheets — Sheets auto-converts "2026-03"
// to a date, which Apps Script returns as an ISO string like "2026-02-28T18:30:00.000Z"
// (midnight IST = 18:30 UTC previous day). Converts back to "YYYY-MM".
function normalizeMonth(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (/^\d{4}-\d{2}$/.test(str)) return str
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    // Shift to IST (UTC+5:30) to get the correct local month
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return str
}

// Returns the most-recently-assigned target for a given email + month
function latestTarget(targets, lowerEmail, month) {
  return targets
    .filter(t => {
      const email = String(tf(t, 'Email') ?? '').trim().toLowerCase()
      const mon   = normalizeMonth(tf(t, 'Month'))
      return email === lowerEmail && mon === month
    })
    .sort((a, b) => new Date(tf(b, 'AssignedAt') || 0) - new Date(tf(a, 'AssignedAt') || 0))[0] ?? null
}

function isInCommissionPeriod(closedDate, startDate, _endDate) {
  // If either date is missing, include the deal — don't penalise missing PaymentDate
  if (!startDate || !closedDate) return true
  return new Date(closedDate) >= new Date(startDate)
}

// Returns the preset label ("Basic","Average","Pro") if CommissionPct is a preset ID, else null
function resolvePresetLabel(commissionPct) {
  const id = String(commissionPct || '').trim().toLowerCase()
  const preset = AGENT_TARGET_PRESETS.find(p => p.id === id)
  return preset ? preset.label : null
}

// Returns slab eligibility, gap-to-next-slab, potential earnings, and progress info
function getSlabInfo(achieved, target) {
  if (!target) return null
  const presetId = String(tf(target, 'CommissionPct') || '').trim().toLowerCase()
  const preset   = AGENT_TARGET_PRESETS.find(p => p.id === presetId)

  let slabs = []
  if (preset) {
    slabs = [...preset.slabs].sort((a, b) => a.targetAmount - b.targetAmount)
  } else {
    try {
      const parsed = JSON.parse(tf(target, 'CommissionEndDate') || '[]')
      if (Array.isArray(parsed) && parsed.length) {
        slabs = [...parsed].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
      }
    } catch { /* fall through */ }
  }
  if (!slabs.length) return null

  const firstSlab  = slabs[0]
  const eligible   = achieved >= Number(firstSlab.targetAmount)
  const gapToSlab1 = Math.max(0, Number(firstSlab.targetAmount) - achieved)

  // Highest slab threshold the agent has crossed
  let currentSlabIdx = -1
  for (let i = 0; i < slabs.length; i++) {
    if (achieved >= Number(slabs[i].targetAmount)) currentSlabIdx = i
  }

  const nextSlabIdx    = currentSlabIdx + 1
  const nextSlab       = nextSlabIdx < slabs.length ? slabs[nextSlabIdx] : null
  const gapToNext      = nextSlab ? Math.max(0, Number(nextSlab.targetAmount) - achieved) : 0
  const potentialAtNext = nextSlab
    ? Number(nextSlab.targetAmount) * Number(nextSlab.commissionPct) / 100
    : 0

  // Progress bar: % of the way from current slab floor to next slab ceiling
  const progressFrom = currentSlabIdx >= 0 ? Number(slabs[currentSlabIdx].targetAmount) : 0
  const progressTo   = nextSlab
    ? Number(nextSlab.targetAmount)
    : Number(slabs[slabs.length - 1].targetAmount)
  const progressPct  = progressTo > progressFrom
    ? Math.min(100, Math.max(0, ((achieved - progressFrom) / (progressTo - progressFrom)) * 100))
    : 100

  return {
    presetId:      preset ? presetId : null,
    presetLabel:   preset ? preset.label : null,
    slabs,
    eligible,
    gapToSlab1,
    currentSlabIdx,
    nextSlab,
    gapToNext,
    potentialAtNext,
    progressPct,
    firstSlabTarget: Number(firstSlab.targetAmount),
  }
}

function calcTieredCommission(achieved, target) {
  if (!achieved || achieved <= 0) return 0

  // 1. Check if CommissionPct is a preset ID ("basic","average","pro")
  const presetId = String(tf(target, 'CommissionPct') || '').trim().toLowerCase()
  const preset   = AGENT_TARGET_PRESETS.find(p => p.id === presetId)
  if (preset) {
    const sorted = [...preset.slabs].sort((a, b) => a.targetAmount - b.targetAmount)
    let rate = sorted[0]?.commissionPct ?? 0
    for (const slab of sorted) {
      if (achieved >= slab.targetAmount) rate = slab.commissionPct
    }
    return achieved * rate / 100
  }

  // 2. Fall back to slabs JSON stored in CommissionEndDate
  try {
    const slabs = JSON.parse(tf(target, 'CommissionEndDate') || '[]')
    if (Array.isArray(slabs) && slabs.length > 0) {
      const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
      let rate = Number(sorted[0]?.commissionPct ?? 0)
      for (const slab of sorted) {
        if (achieved >= Number(slab.targetAmount)) rate = Number(slab.commissionPct)
      }
      return achieved * rate / 100
    }
  } catch { /* fall through */ }

  // 3. Legacy flat rate
  return achieved * Number(tf(target, 'CommissionPct') ?? 0) / 100
}
