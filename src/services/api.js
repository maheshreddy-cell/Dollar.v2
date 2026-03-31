// All API calls go directly to Apps Script — no Node.js backend needed
import { appsScript, clearCache } from './appsScript'
import { v4 as uuidv4 } from 'uuid'
import { ALL_TARGET_PRESETS } from '../utils/targetPresets'

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

// Stage category definitions
const STAGE_MAP = {
  'payment cleared':          'PAID',
  'e-mandate signed':         'PARTIALLY_PAID',
  'part payment by airtribe': 'PARTIALLY_PAID',
  'waiting for disbursement': 'ALMOST_THERE',
  'awaiting for docs':        'WIP',
  'post_approval pending':    'WIP',
  'pushed for loan':          'WIP',
  'will pay by credit card':  'WIP',
  'access removed':           'LOST',
  'loan rejected':            'LOST',
}

function getStageCategory(loanDocValue) {
  const key = (loanDocValue || '').trim().toLowerCase()
  return STAGE_MAP[key] ?? 'WIP'
}

function workingDaysSince(dateStr) {
  if (!dateStr) return 0
  const start = new Date(dateStr)
  if (isNaN(start)) return 0
  const now = new Date()
  let count = 0
  const cur = new Date(start)
  while (cur < now) {
    const d = cur.getDay()
    if (d !== 0) count++ // Mon–Sat (skip Sunday only)
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

export const getDealsGrouped = async (email, month) => {
  const [targets, deals] = await Promise.all([
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])
  const lowerEmail = (email || '').trim().toLowerCase()
  const target = latestTarget(targets, lowerEmail, month)
  const tAmount = target ? Number(tf(target, 'TargetAmount') ?? 0) : 0

  const agentDeals = deals.filter(d =>
    d.Email === lowerEmail && d.Month === month
  )

  // Group by category
  const groups = { PAID: [], PARTIALLY_PAID: [], ALMOST_THERE: [], WIP: [], LOST: [] }
  for (const d of agentDeals) {
    const cat = getStageCategory(d.LoanDocsCollected)
    const daysInStage = workingDaysSince(d.Timestamp || d.PaymentDate)
    const isAtRisk = (
      ['awaiting for docs', 'post_approval pending'].includes(
        (d.LoanDocsCollected || '').trim().toLowerCase()
      ) &&
      daysInStage >= 3
    )
    groups[cat].push({ ...d, daysInStage, isAtRisk })
  }

  // Totals per group
  const totals = {}
  let totalPipeline = 0
  let atRiskAmount = 0
  for (const [cat, arr] of Object.entries(groups)) {
    const val = arr.reduce((s, d) => s + (d.TotalValue || 0), 0)
    totals[cat] = { value: val, count: arr.length }
    totalPipeline += val
    if (cat === 'WIP' || cat === 'ALMOST_THERE') {
      atRiskAmount += arr.filter(d => d.isAtRisk).reduce((s, d) => s + (d.TotalValue || 0), 0)
    }
  }

  const paidAmount = totals.PAID.value + totals.PARTIALLY_PAID.value
  const wipAmount = totals.WIP.value + totals.ALMOST_THERE.value

  // WIP slab hint: how much more needed to unlock next slab
  const achieved = groups.PAID.reduce((s, d) => s + (d.PaidActual || 0), 0)
  const slabInfo = getSlabInfo(achieved, target)
  let wipSlabHint = null
  if (slabInfo && wipAmount > 0) {
    if (!slabInfo.eligible && slabInfo.gapToSlab1 > 0) {
      wipSlabHint = {
        wipAmount,
        neededForSlab: slabInfo.gapToSlab1,
        slabName: 'Slab 1',
        slabPayout: slabInfo.firstSlabTarget * (slabInfo.slabs[0]?.commissionPct ?? 0) / 100,
        canReachSlab: wipAmount >= slabInfo.gapToSlab1,
      }
    } else if (slabInfo.nextSlab) {
      wipSlabHint = {
        wipAmount,
        neededForSlab: slabInfo.gapToNext,
        slabName: `Slab ${slabInfo.currentSlabIdx + 2}`,
        slabPayout: slabInfo.potentialAtNext,
        canReachSlab: wipAmount >= slabInfo.gapToNext,
      }
    }
  }

  return {
    groups,
    totals,
    totalPipeline,
    paidAmount,
    wipAmount,
    atRiskAmount,
    wipSlabHint,
    tAmount,
    commissionPreset: resolvePresetLabel(tf(target, 'CommissionPct')) ?? tf(target, 'CommissionPct'),
    achieved,
  }
}

// Aggregate deals for a list of agent emails — used for manager "All Team" view
export const getDealsGroupedForTeam = async (emails, month) => {
  const [targets, deals] = await Promise.all([
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])

  const lowerEmails = emails.map(e => (e || '').trim().toLowerCase())

  // Sum up targets across all team agents
  let tAmount = 0
  for (const email of lowerEmails) {
    const target = latestTarget(targets, email, month)
    if (target) tAmount += Number(tf(target, 'TargetAmount') ?? 0)
  }

  // All deals for the team in this month
  const teamDeals = deals.filter(d =>
    lowerEmails.includes((d.Email || '').trim().toLowerCase()) && d.Month === month
  )

  const groups = { PAID: [], PARTIALLY_PAID: [], ALMOST_THERE: [], WIP: [], LOST: [] }
  for (const d of teamDeals) {
    const cat = getStageCategory(d.LoanDocsCollected)
    const daysInStage = workingDaysSince(d.Timestamp || d.PaymentDate)
    const isAtRisk = (
      ['awaiting for docs', 'post_approval pending'].includes(
        (d.LoanDocsCollected || '').trim().toLowerCase()
      ) && daysInStage >= 3
    )
    groups[cat].push({ ...d, daysInStage, isAtRisk })
  }

  const totals = {}
  let totalPipeline = 0
  let atRiskAmount = 0
  for (const [cat, arr] of Object.entries(groups)) {
    const val = arr.reduce((s, d) => s + (d.TotalValue || 0), 0)
    totals[cat] = { value: val, count: arr.length }
    totalPipeline += val
    if (cat === 'WIP' || cat === 'ALMOST_THERE') {
      atRiskAmount += arr.filter(d => d.isAtRisk).reduce((s, d) => s + (d.TotalValue || 0), 0)
    }
  }

  const paidAmount = totals.PAID.value + totals.PARTIALLY_PAID.value
  const wipAmount  = totals.WIP.value  + totals.ALMOST_THERE.value
  const achieved   = groups.PAID.reduce((s, d) => s + (d.PaidActual || 0), 0)

  return {
    groups, totals, totalPipeline, paidAmount, wipAmount, atRiskAmount,
    wipSlabHint: null, tAmount, commissionPreset: null, achieved,
    isTeamView: true,
  }
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

  // If no deals found, scan for near-match emails (catches sheet typos)
  const suggestedEmails = agentDeals.length === 0
    ? findSimilarEmails(deals, lowerUser, month)
    : []

  // Commission-eligible paid deals only
  const cleared = agentDeals.filter(d =>
    d.PaidActual > 0 &&
    isInCommissionPeriod(d.PaymentDate, tf(target, 'CommissionStartDate'), null)
  )

  const achieved        = cleared.reduce((s, d) => s + d.PaidActual, 0)
  const commission      = calcTieredCommission(achieved, target)
  const totalSaleValue  = agentDeals.reduce((s, d) => s + (d.TotalValue  || 0), 0)
  const totalT2Amount   = agentDeals.reduce((s, d) => s + (d.T2Amount    || 0), 0)
  const totalKickers    = 0   // placeholder — kicker announcements not yet stored in sheets
  const totalMoneyMade  = commission + totalT2Amount + totalKickers

  // Loan Documents Collected — count each unique dropdown value
  const loanDocs = {}
  for (const d of agentDeals) {
    const v = (d.LoanDocsCollected || '').trim() || '—'
    loanDocs[v] = (loanDocs[v] || 0) + 1
  }

  const tAmount     = Number(tf(target, 'TargetAmount') ?? 0)
  const slabInfo    = getSlabInfo(achieved, target)
  const presetLabel = resolvePresetLabel(tf(target, 'CommissionPct'))

  // At-risk deals (stuck in review stages for 3+ working days)
  const atRiskDeals = agentDeals.filter(d => {
    const stage = (d.LoanDocsCollected || '').trim().toLowerCase()
    return ['awaiting for docs', 'post_approval pending'].includes(stage) &&
      workingDaysSince(d.Timestamp || d.PaymentDate) >= 3
  })
  const atRiskCount  = atRiskDeals.length
  const atRiskAmount = atRiskDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)

  // WIP pipeline opportunity
  const wipDeals = agentDeals.filter(d => {
    const cat = getStageCategory(d.LoanDocsCollected)
    return cat === 'WIP' || cat === 'ALMOST_THERE'
  })
  const wipAmount = wipDeals.reduce((s, d) => s + (d.TotalValue || 0), 0)
  let wipSlabHint = null
  if (slabInfo && wipAmount > 0) {
    if (!slabInfo.eligible && slabInfo.gapToSlab1 > 0) {
      wipSlabHint = {
        wipAmount,
        neededForSlab: slabInfo.gapToSlab1,
        slabName: 'Slab 1',
        slabPayout: slabInfo.firstSlabTarget * (slabInfo.slabs[0]?.commissionPct ?? 0) / 100,
        canReachSlab: wipAmount >= slabInfo.gapToSlab1,
      }
    } else if (slabInfo?.nextSlab) {
      wipSlabHint = {
        wipAmount,
        neededForSlab: slabInfo.gapToNext,
        slabName: `Slab ${slabInfo.currentSlabIdx + 2}`,
        slabPayout: slabInfo.potentialAtNext,
        canReachSlab: wipAmount >= slabInfo.gapToNext,
      }
    }
  }

  return {
    totalTarget:     tAmount,
    totalAchieved:   achieved,
    totalCommission: commission,
    totalT2Amount,
    totalKickers,
    totalMoneyMade,
    achievementPct:  tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
    totalSaleValue,
    totalDeals:      cleared.length,
    loanDocs,
    slabInfo,
    commissionPct:   presetLabel ?? Number(tf(target, 'CommissionPct') ?? 0),
    commissionStart: tf(target, 'CommissionStartDate'),
    suggestedEmails,
    wipAmount,
    wipSlabHint,
    atRiskCount,
    atRiskAmount,
  }
}

export const getLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
  ])
  const emails = collectEmails(users, rootEmail).filter(e => e !== rootEmail)
  const agents = users.filter(u => emails.includes(u.Email) && ['Agent', 'PreSales'].includes(u.Role))

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
    const totalSaleValue  = agentDeals.reduce((s, d) => s + (d.TotalValue  || 0), 0)
    const totalT2Amount   = agentDeals.reduce((s, d) => s + (d.T2Amount    || 0), 0)
    const commission      = target ? calcTieredCommission(achieved, target) : 0
    const moneyMade       = commission + totalT2Amount  // kickers = 0 until feature built

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
      totalT2Amount,
      moneyMade,
      pendingCollection: Math.max(0, totalSaleValue - achieved),
      loanDocsOk,
      loanDocsTotal,
      pct:               tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
      commission,
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
    const paid = d.PaidActual || 0
    const tsv  = d.TotalValue || 0
    const t2   = d.T2Amount   || 0

    if (!byTeam[team])         byTeam[team]     = { name: team,     achieved: 0, deals: 0, totalSaleValue: 0, totalT2Amount: 0 }
    byTeam[team].achieved       += paid
    byTeam[team].deals          += 1
    byTeam[team].totalSaleValue += tsv
    byTeam[team].totalT2Amount  += t2

    if (!byVertical[vertical]) byVertical[vertical] = { name: vertical, achieved: 0, deals: 0, totalSaleValue: 0, totalT2Amount: 0 }
    byVertical[vertical].achieved       += paid
    byVertical[vertical].deals          += 1
    byVertical[vertical].totalSaleValue += tsv
    byVertical[vertical].totalT2Amount  += t2
  }

  const totalAchieved  = rows.reduce((s, d) => s + (d.PaidActual || 0), 0)
  const totalSaleValue = rows.reduce((s, d) => s + (d.TotalValue  || 0), 0)
  const totalT2Amount  = rows.reduce((s, d) => s + (d.T2Amount    || 0), 0)

  const teamWipAmount = rows.filter(d => {
    const cat = getStageCategory(d.LoanDocsCollected)
    return cat === 'WIP' || cat === 'ALMOST_THERE'
  }).reduce((s, d) => s + (d.TotalValue || 0), 0)

  const teamWipAgentCount = new Set(
    rows.filter(d => {
      const cat = getStageCategory(d.LoanDocsCollected)
      return cat === 'WIP' || cat === 'ALMOST_THERE'
    }).map(d => d.Email)
  ).size

  return {
    byTeam:         Object.values(byTeam).sort((a, b) => b.achieved - a.achieved),
    byVertical:     Object.values(byVertical).sort((a, b) => b.achieved - a.achieved),
    totalAchieved,
    totalSaleValue,
    totalT2Amount,
    totalDeals:     rows.length,
    teamWipAmount,
    teamWipAgentCount,
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
  // Case-insensitive traversal — ManagerEmail entries in the sheet may not
  // exactly match the casing of the Email column.
  const emails  = [rootEmail]
  const visited = new Set([(rootEmail || '').trim().toLowerCase()])
  const queue   = [(rootEmail || '').trim().toLowerCase()]

  while (queue.length) {
    const current  = queue.shift()
    const children = users.filter(
      u => (u.ManagerEmail || '').trim().toLowerCase() === current
    )
    for (const u of children) {
      const lower = (u.Email || '').trim().toLowerCase()
      if (!visited.has(lower)) {
        visited.add(lower)
        emails.push(u.Email)
        queue.push(lower)
      }
    }
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
  const preset = ALL_TARGET_PRESETS.find(p => p.id === id)
  return preset ? preset.label : null
}

// Returns slab eligibility, gap-to-next-slab, potential earnings, and progress info
function getSlabInfo(achieved, target) {
  if (!target) return null
  const presetId = String(tf(target, 'CommissionPct') || '').trim().toLowerCase()
  const preset   = ALL_TARGET_PRESETS.find(p => p.id === presetId)

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
  const preset   = ALL_TARGET_PRESETS.find(p => p.id === presetId)
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

// Returns emails from the sheet that are suspiciously close to the profile
// email (edit distance ≤ 3) — used to surface typos to admins.
function findSimilarEmails(allDeals, profileEmail, month) {
  const lp = profileEmail.trim().toLowerCase()
  const candidates = [
    ...new Set(
      allDeals
        .filter(d => !month || d.Month === month)
        .map(d => d.Email)
        .filter(e => e && e !== lp)
    ),
  ]
  return candidates.filter(e => editDistance(lp, e) <= 3)
}

function editDistance(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}
