// All API calls go directly to Apps Script — no Node.js backend needed
import { appsScript } from './appsScript'
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
  return targets.filter(t =>
    (!filterEmail || t.Email?.trim().toLowerCase() === lowerEmail) &&
    (!month       || t.Month === month)
  )
}

export const assignTarget = async (data, assignerEmail) => {
  // data: { email, month, targetAmount, presetId, commissionPct, commissionStartDate, slabs }
  // For agents: presetId = "basic"|"average"|"pro" stored in CommissionPct; targetAmount is manager-set
  // For others: commissionPct = numeric %, slabs JSON in CommissionEndDate
  const key = `${data.email.trim().toLowerCase()}_${data.month}`
  const commissionPctValue = data.presetId ?? data.commissionPct ?? 0
  const row = [
    key,
    data.email.trim().toLowerCase(),
    data.month,
    Number(data.targetAmount),         // manager-assigned target amount (e.g. 4L, 8L)
    commissionPctValue,                // "basic"/"average"/"pro" or numeric %
    data.commissionStartDate || '',
    data.slabs ? JSON.stringify(data.slabs) : '',
    assignerEmail,
    new Date().toISOString(),
  ]
  // Clear cache so subsequent reads see the new row
  const { clearCache } = await import('./appsScript')
  clearCache()
  return appsScript.upsertRow('Targets', 'Key', key, row)
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
  const target = targets.find(t => t.Email?.trim().toLowerCase() === lowerUser && t.Month === month)
  if (!target) return { totalTarget: 0, totalAchieved: 0, totalCommission: 0, achievementPct: 0 }

  // All rows for agent+month with actual payment count (no status filter)
  const cleared = deals.filter(d =>
    d.Email      === userEmail.trim().toLowerCase() &&
    d.Month      === month &&
    d.PaidActual  > 0 &&
    isInCommissionPeriod(d.PaymentDate, target.CommissionStartDate, null)
  )
  const achieved   = cleared.reduce((s, d) => s + d.PaidActual, 0)
  const commission = calcTieredCommission(achieved, target)

  const presetLabel = resolvePresetLabel(target.CommissionPct)
  return {
    totalTarget:     Number(target.TargetAmount),
    totalAchieved:   achieved,
    totalCommission: commission,
    achievementPct:  target.TargetAmount > 0 ? Math.min((achieved / Number(target.TargetAmount)) * 100, 999) : 0,
    commissionPct:   presetLabel ?? Number(target.CommissionPct),
    commissionStart: target.CommissionStartDate,
  }
}

export const getLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])
  const emails  = collectEmails(users, rootEmail).filter(e => e !== rootEmail)
  const agents  = users.filter(u => emails.includes(u.Email) && u.Role === 'Agent')

  return agents.map(agent => {
    const target  = targets.find(t => t.Email?.trim().toLowerCase() === agent.Email?.trim().toLowerCase() && t.Month === month)
    const tAmount = target ? Number(target.TargetAmount) : 0
    const pct     = target ? Number(target.CommissionPct) : 0

    const achieved = deals
      .filter(d =>
        d.Email      === agent.Email.trim().toLowerCase() &&
        d.Month      === month &&
        d.PaidActual  > 0 &&
        (!target || isInCommissionPeriod(d.PaymentDate, target.CommissionStartDate, null))
      )
      .reduce((s, d) => s + d.PaidActual, 0)

    return {
      name:       agent.Name,
      email:      agent.Email,
      target:     tAmount,
      achieved,
      pct:        tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
      commission: target ? calcTieredCommission(achieved, target) : 0,
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

function isInCommissionPeriod(closedDate, startDate, _endDate) {
  if (!startDate) return true
  if (!closedDate) return false
  return new Date(closedDate) >= new Date(startDate)
}

// Returns the preset label ("Basic","Average","Pro") if CommissionPct is a preset ID, else null
function resolvePresetLabel(commissionPct) {
  const id = String(commissionPct || '').trim().toLowerCase()
  const preset = AGENT_TARGET_PRESETS.find(p => p.id === id)
  return preset ? preset.label : null
}

function calcTieredCommission(achieved, target) {
  // 1. Check if CommissionPct is a preset ID ("basic","average","pro")
  const presetId = String(target.CommissionPct || '').trim().toLowerCase()
  const preset   = AGENT_TARGET_PRESETS.find(p => p.id === presetId)
  if (preset) {
    const sorted = [...preset.slabs].sort((a, b) => a.targetAmount - b.targetAmount)
    let rate = 0
    for (const slab of sorted) {
      if (achieved >= slab.targetAmount) rate = slab.commissionPct
    }
    return achieved * rate / 100
  }

  // 2. Fall back to slabs JSON stored in CommissionEndDate
  try {
    const slabs = JSON.parse(target.CommissionEndDate || '[]')
    if (Array.isArray(slabs) && slabs.length > 0) {
      const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
      let rate = 0
      for (const slab of sorted) {
        if (achieved >= Number(slab.targetAmount)) rate = Number(slab.commissionPct)
      }
      return achieved * rate / 100
    }
  } catch { /* fall through */ }

  // 3. Legacy flat rate
  return achieved * Number(target.CommissionPct) / 100
}
