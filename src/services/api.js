// All data operations go through Supabase via /api/db (Vercel serverless)
import { appsScript, clearCache, clearSheetCache } from './supabase'

// Supabase JSONB columns come back as already-parsed JS objects/arrays.
// Google Sheets returned JSON strings. This handles both cases safely.
function safeParse(val, fallback = []) {
  if (val === null || val === undefined) return fallback
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return fallback } }
  return val // already parsed by Supabase JSONB
}
import { v4 as uuidv4 } from 'uuid'
import { ALL_TARGET_PRESETS } from '../utils/targetPresets'

// ─── Program definitions ──────────────────────────────────────────────────────
export const MANAGER_TARGET_PROGRAMS = [
  { id: 'all',   label: 'All Programs', short: 'All',   keywords: null },
  { id: 'genai', label: 'GenAI',        short: 'GenAI', keywords: ['genai', 'gen ai', 'generative ai', 'gen-ai', 'gen_ai'] },
  { id: 'pml',   label: 'PML',          short: 'PML',   keywords: ['pml'] },
  { id: 'bel',   label: 'BEL',          short: 'BEL',   keywords: ['bel'] },
]

export function filterDealsByProgram(deals, programId) {
  if (!programId || programId === 'all') return deals
  const prog = MANAGER_TARGET_PROGRAMS.find(p => p.id === programId)
  if (!prog || !prog.keywords) return deals
  return deals.filter(d => {
    const course = (d.Course || '').toLowerCase()
    return prog.keywords.some(kw => course.includes(kw))
  })
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email, password) =>
  appsScript.login(email, password)

export const logUsage = (user) => {
  const now = new Date()
  const date = now.toLocaleDateString('en-CA') // YYYY-MM-DD in local time
  const payload = {
    Timestamp: now.toISOString(),
    Date: date,
    Email: user.email,
    Name: user.name,
    Role: user.role,
  }
  appsScript.appendRow('Usage_Log',    payload).catch(() => {}) // legacy log
  appsScript.appendRow('UserActivity', payload).catch(() => {}) // fire-and-forget, never block login
}

export const getUsageLog = () => {
  // Always bypass cache so online status and recent activity are accurate
  clearSheetCache('Usage_Log')
  clearSheetCache('UserActivity')
  return appsScript.getSheet('Usage_Log').catch(() => [])
}

export async function updateBio(email, bio) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'updateBio', email, bio }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to update bio')
}

export async function removeProfilePhoto(email) {
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'removePhoto', email }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error || 'Failed to remove photo')
}

// Inserts a duration heartbeat row so per-user time-spent can be computed
export const logDuration = (user, durationSeconds) => {
  if (!durationSeconds || durationSeconds < 10) return
  const now = new Date()
  appsScript.appendRow('UserActivity', {
    Timestamp:       now.toISOString(),
    Date:            now.toLocaleDateString('en-CA'),
    Email:           user.email,
    Name:            user.name,
    Role:            user.role,
    DurationSeconds: Math.round(durationSeconds),
  }).catch(() => {})
}

export const activateInvite = (token, password) =>
  appsScript.activateInvite(token, password)

// Resizes image client-side to max 400px, then uploads to Supabase Storage
export async function uploadProfilePhoto(email, file) {
  const resized = await resizeImage(file, 400)
  const base64  = resized.split(',')[1]
  const mimeType = resized.split(';')[0].split(':')[1]
  const res = await fetch('/api/db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'uploadPhoto', email, photoBase64: base64, mimeType }),
  })
  const data = await res.json()
  if (!res.ok || !data.success) throw new Error(data.error || 'Upload failed')
  return data.data?.url
}

function resizeImage(file, maxPx) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = url
  })
}

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

function parseAnyDate(dateStr) {
  if (!dateStr) return null
  // Handle DD/MM/YYYY or DD/MM/YYYY HH:MM:SS from Indian-locale Google Sheets
  const dmy = (dateStr + '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (dmy) return new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`)
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

function workingDaysSince(dateStr) {
  if (!dateStr) return 0
  const start = parseAnyDate(dateStr)
  if (!start) return 0
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
    commissionPreset: target ? (resolvePresetLabel(tf(target, 'CommissionPct')) ?? tf(target, 'CommissionPct')) : null,
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

// All deals for every member in the manager's org subtree (any role, no commission-period filter).
// Includes the manager's own deals, and also catches deals tagged by Team column name.
export const getTeamDealsForMonth = async (rootEmail, month) => {
  const [users, deals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSalesSheet(),
  ])
  const rootLower = (rootEmail || '').trim().toLowerCase()

  // Include rootEmail itself + all subtree members
  const allEmails = collectEmails(users, rootEmail)   // no exclusion of rootEmail
  const emailSet  = new Set(allEmails.map(e => (e || '').trim().toLowerCase()))

  // Also find the manager's Team name(s) from the Users sheet — handles deals
  // that are tagged by team name in the Team column rather than exact agent email.
  // Collect team names from all subtree members (including manager themselves).
  const subtreeTeamNames = new Set(
    allEmails
      .map(e => {
        const u = users.find(u2 => (u2.Email || '').trim().toLowerCase() === (e || '').trim().toLowerCase())
        return (u?.Team || '').trim().toLowerCase()
      })
      .filter(Boolean)
  )

  return deals.filter(d => {
    const emailMatch = emailSet.has((d.Email || '').trim().toLowerCase())
    const teamMatch  = subtreeTeamNames.size > 0 && subtreeTeamNames.has((d.Team || '').trim().toLowerCase())
    const monthMatch = !month || d.Month === month
    return (emailMatch || teamMatch) && monthMatch
  })
}

export const getDealsForSubtree = async (emails, month) => {
  const deals = await appsScript.getSalesSheet()
  const lower = new Set(emails.map(e => (e || '').trim().toLowerCase()))
  return deals.filter(d =>
    lower.has((d.Email || '').trim().toLowerCase()) &&
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

// Parses the CommissionEndDate field which may be:
//   old format → JSON array  [{ targetAmount, commissionPct }, ...]
//   new format → JSON object { slabs: [...], teamWeightage: N }
// Always returns { slabs: [], teamWeightage: 0 }
export function parseSlabsField(json) {
  const parsed = safeParse(json, [])
  if (Array.isArray(parsed)) return { slabs: parsed, teamWeightage: 0 }
  return {
    slabs:         Array.isArray(parsed.slabs) ? parsed.slabs : [],
    teamWeightage: Number(parsed.teamWeightage ?? 0),
  }
}

export const assignTarget = async (data, assignerEmail) => {
  // data: { email, month, targetAmount, presetId, commissionPct, commissionStartDate, slabs, teamWeightage }
  // For agents: presetId = "basic"|"average"|"pro" stored in CommissionPct; targetAmount is manager-set
  // For others: commissionPct = numeric %, slabs JSON in CommissionEndDate
  // Each assignment always appends a new row — duplicates are kept as history.
  // Latest entry (by AssignedAt) wins for commission/dashboard calculations.
  const key   = `${data.email.trim().toLowerCase()}_${data.month}`
  const email = data.email.trim().toLowerCase()
  const commissionPctValue = data.presetId ?? data.commissionPct ?? 0
  // Store slabs + optional teamWeightage in CommissionEndDate column
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
  const users  = await appsScript.getSheet('Users')
  const lowerM = (managerEmail || '').trim().toLowerCase()
  return users
    .filter(u => (u.ManagerEmail || '').trim().toLowerCase() === lowerM)
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

export const getSummary = async (userEmail, month, userRole = 'Agent') => {
  const [targets, deals, allKickers] = await Promise.all([
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
    appsScript.getSheet('Kickers').catch(() => []),
  ])
  const lowerUser = userEmail?.trim().toLowerCase()
  const target = latestTarget(targets, lowerUser, month)
  if (!target) {
    // No commission target but kickers can still be earned — compute them separately
    const agentDealsAll = deals.filter(d => d.Email === lowerUser && d.Month === month)
    const totalKickers = computeKickerEarningsForAgent(userRole, agentDealsAll, allKickers, deals, lowerUser)
    return {
      totalTarget: 0, totalAchieved: 0, totalCommission: 0, achievementPct: 0,
      totalSaleValue: 0, totalDeals: 0, loanDocs: {}, slabInfo: null,
      totalKickers, totalT2Amount: 0, totalMoneyMade: totalKickers,
    }
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
  const totalKickers    = computeKickerEarningsForAgent(userRole, agentDeals, allKickers, deals, lowerUser)
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
    atRiskDeals,
  }
}

export const getLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals, allKickers, allPsCalls] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
    appsScript.getSheet('Kickers').catch(() => []),
    getDeduplicatedPresalesCalls().catch(() => []),
  ])
  const emails = collectEmails(users, rootEmail).filter(e => e !== rootEmail)
  const agents = users.filter(u => emails.includes(u.Email) && ['Agent', 'PreSales'].includes(u.Role))

  return agents.map(agent => {
    const target     = latestTarget(targets, agent.Email?.trim().toLowerCase(), month)
    const tAmount    = target ? Number(tf(target, 'TargetAmount') ?? 0) : 0
    const agentEmail = agent.Email.trim().toLowerCase()
    const isPS       = (agent.Role || '') === 'PreSales'

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
    const kickerEarnings  = computeKickerEarningsForAgent(agent.Role || 'Agent', agentDeals, allKickers, deals, agentEmail)
    const moneyMade       = commission + totalT2Amount + kickerEarnings

    // Loan docs: count "payment cleared" as done, everything else as pending
    const loanDocsDone    = agentDeals.filter(d =>
      (d.LoanDocsCollected || '').trim().toLowerCase() === 'payment cleared'
    ).length
    const loanDocsPending = agentDeals.length - loanDocsDone

    // PreSales: count unique calls from the presales calls sheet for this month
    const callsCount = isPS
      ? allPsCalls.filter(r => r.agentEmail === agentEmail && (!month || r.month === month)).length
      : null

    return {
      name:              agent.Name,
      email:             agent.Email,
      role:              agent.Role || 'Agent',
      target:            tAmount,
      achieved,
      dealsCount,
      totalSaleValue,
      totalT2Amount,
      kickerEarnings,
      moneyMade,
      pendingCollection: Math.max(0, totalSaleValue - achieved),
      loanDocsDone,
      loanDocsPending,
      pct:               tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
      commission,
      slabInfo:          getSlabInfo(achieved, target),
      callsCount,        // non-null only for PreSales agents
    }
  }).sort((a, b) => b.achieved - a.achieved)
}

// Returns direct subordinate managers/VHs with their team aggregates
export const getManagersLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals, allKickers] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSalesSheet(),
    appsScript.getSheet('Kickers').catch(() => []),
  ])

  // Get direct reports of rootEmail who are Manager or VH
  const rootLower = (rootEmail || '').trim().toLowerCase()
  const directReports = users.filter(u =>
    (u.ManagerEmail || '').trim().toLowerCase() === rootLower &&
    ['Manager', 'VH'].includes(u.Role)
  )

  return directReports.map(mgr => {
    const mgrEmail = (mgr.Email || '').trim().toLowerCase()
    // Collect all emails in this manager's subtree (agents under them)
    const subtreeEmails = collectEmails(users, mgrEmail).map(e => e.trim().toLowerCase())
    const teamEmails    = subtreeEmails.filter(e => e !== mgrEmail)

    // All deals from agents under this manager for the month
    const teamDeals = deals.filter(d =>
      teamEmails.includes((d.Email || '').trim().toLowerCase()) &&
      (!month || d.Month === month)
    )

    const pipeline     = teamDeals.reduce((s, d) => s + (d.TotalValue  || 0), 0)
    const paid         = teamDeals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
    const t2           = teamDeals.reduce((s, d) => s + (d.T2Amount || 0), 0)

    // Commission + kicker earnings: sum per agent under this manager
    const agentUsers = users.filter(u => teamEmails.includes((u.Email || '').trim().toLowerCase()) && ['Agent','PreSales'].includes(u.Role))
    let totalCommission = 0
    let totalKickers    = 0
    for (const agent of agentUsers) {
      const aEmail      = (agent.Email || '').trim().toLowerCase()
      const target      = latestTarget(targets, aEmail, month)
      const aDeals      = teamDeals.filter(d => (d.Email||'').trim().toLowerCase() === aEmail)
      const aPaid       = aDeals.filter(d => d.PaidActual > 0).reduce((s, d) => s + d.PaidActual, 0)
      if (target) totalCommission += calcTieredCommission(aPaid, target)
      totalKickers += computeKickerEarningsForAgent(agent.Role || 'Agent', aDeals, allKickers, deals, aEmail)
    }

    const loanDocsDone    = teamDeals.filter(d => (d.LoanDocsCollected || '').trim().toLowerCase() === 'payment cleared').length
    const loanDocsPending = teamDeals.length - loanDocsDone

    return {
      name:           mgr.Name || mgr.Email,
      email:          mgr.Email,
      role:           mgr.Role,
      agentCount:     agentUsers.length,
      pipeline,
      paid,
      commission:     totalCommission,
      t2,
      kickerEarnings: totalKickers,
      moneyMade:      totalCommission + t2 + totalKickers,
      loanDocsDone,
      loanDocsPending,
    }
  }).sort((a, b) => b.paid - a.paid)
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
// Single "CommissionConfig" sheet handles both agent slabs and manager targets.
// Column layout:
//   SlabName | MaxTarget | CommissionPct | CreatedBy | Type | ManagerEmail | Month | ProjectedSlabs | RealisedSlabs | AssignedBy | AssignedAt
// Rows where Type is blank or "AgentSlab" → agent commission slabs
// Rows where Type = "ManagerTarget"        → manager projected/realised targets

// CommissionConfig sheet is now used exclusively for manager targets.
// Agent commission presets (Basic/Average/Pro) are hardcoded in targetPresets.js.
export const getCommissionConfig = async () => []
export const addSlab    = async () => ({ success: true })
export const deleteSlab = async () => ({ success: true })

// ─── PreSales Incentive Slabs (fixed per SOP) ─────────────────────────────────
export const PS_CALLS_SLABS = [
  { minCalls: 65, ratePerCall: 45 },
  { minCalls: 50, ratePerCall: 30 },
  { minCalls: 40, ratePerCall: 25 },
]

export const PS_SALES_SLABS = [
  { minSales: 10, ratePerSale: 1500 },
  { minSales:  8, ratePerSale: 1000 },
  { minSales:  6, ratePerSale:  750 },
  { minSales:  4, ratePerSale:  500 },
]

export function computePSCallsEarnings(callsCount) {
  const slab = PS_CALLS_SLABS.find(s => callsCount >= s.minCalls)
  return slab ? callsCount * slab.ratePerCall : 0
}

export function computePSSalesEarnings(salesCount) {
  const slab = PS_SALES_SLABS.find(s => salesCount >= s.minSales)
  return slab ? salesCount * slab.ratePerSale : 0
}

// ── Presales calls sheet helpers ───────────────────────────────────────────────
// Each row in "presales calls" = 1 scheduled call.
// Month is derived from Timestamp (col A) which Apps Script returns as ISO UTC string.
// No deduplication — every row for this agent in this month counts as 1 call.

function mapPresalesCallRow(raw) {
  // Timestamp comes back as ISO UTC string e.g. "2026-04-09T08:23:16.000Z"
  const rawTs = tf(raw, 'Timestamp') || ''
  const ts    = rawTs ? new Date(rawTs) : null
  // Convert UTC → IST to get correct month
  const month = ts && !isNaN(ts.getTime())
    ? (() => {
        const ist = new Date(ts.getTime() + 5.5 * 60 * 60 * 1000)
        return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
      })()
    : ''

  return {
    agentEmail:  (tf(raw, 'Email address') || '').trim().toLowerCase(),
    month,
    learnerPH:   String(tf(raw, 'Learner PH')   || '').replace(/\D/g, ''),
    learnerName: String(tf(raw, 'Learner Name')  || '').trim(),
    course:      String(tf(raw, 'Course')        || '').trim(),
  }
}

// Fetches the "presales calls" sheet and returns all rows mapped + filtered.
// Always bypasses cache so fresh data is returned every time.
export async function getPresalesCalls() {
  try {
    clearSheetCache('presales calls')
    const raw = await appsScript.getSheet('presales calls').catch(() => [])
    return (raw || []).map(mapPresalesCallRow).filter(r => r.agentEmail && r.month)
  } catch {
    return []
  }
}

// Keep old name as alias so getLeaderboard still works
export const getDeduplicatedPresalesCalls = getPresalesCalls

// Reads "presales calls" + PreSalesSales sheets and computes incentive summary.
export const getPreSalesSummary = async (email, month) => {
  const lower = (email || '').trim().toLowerCase()
  const [allCalls, salesRaw] = await Promise.all([
    getPresalesCalls().catch(() => []),
    appsScript.getSheet('PreSalesSales').catch(() => []),
  ])

  const myCalls = allCalls.filter(r =>
    r.agentEmail === lower &&
    (!month || r.month === month)
  )
  const mySales = (salesRaw || []).filter(r =>
    (r.PreSalesEmail || '').trim().toLowerCase() === lower &&
    (!month || normalizeMonth(r.Month) === month)
  )

  const callsCount = myCalls.length
  const salesCount = mySales.length

  const callsEarnings = computePSCallsEarnings(callsCount)
  const salesEarnings = computePSSalesEarnings(salesCount)
  const totalEarnings = callsEarnings + salesEarnings

  const currentCallSlab  = PS_CALLS_SLABS.find(s => callsCount >= s.minCalls) || null
  const nextCallSlab     = PS_CALLS_SLABS.slice().reverse().find(s => callsCount < s.minCalls) || null
  const currentSalesSlab = PS_SALES_SLABS.find(s => salesCount >= s.minSales) || null
  const nextSalesSlab    = PS_SALES_SLABS.slice().reverse().find(s => salesCount < s.minSales) || null

  return {
    callsCount, salesCount,
    callsEarnings, salesEarnings, kickerEarnings: 0,
    totalEarnings,
    currentCallSlab, nextCallSlab,
    currentSalesSlab, nextSalesSlab,
  }
}

// ─── Kicker helpers (shared) ──────────────────────────────────────────────────
// Note: parseKickerRow is defined later (hoisted) near getKickers()

// ── Hat Trick Kicker (always-on default) ─────────────────────────────────────
// 3 deals (any status) in the same calendar day (IST) = ₹1,000 bonus.
// Applies to ALL programs, ALL roles. No start/end date — always active.
export function computeHatTrickEarnings(agentDeals) {
  const byDate = {}
  for (const d of (agentDeals || [])) {
    // PaymentDate is YYYY-MM-DD (pre-normalised by parseSheetDate) — always parses correctly.
    // Timestamp is raw DD/MM/YYYY HH:MM:SS from the sheet and misparses in JS — skip it.
    const raw = d.PaymentDate || d.Month
    if (!raw) continue
    let key
    if (d.PaymentDate) {
      // YYYY-MM-DD — parse as UTC then convert to IST date
      const ts = new Date(d.PaymentDate)
      if (isNaN(ts.getTime())) continue
      const ist = new Date(ts.getTime() + 5.5 * 60 * 60 * 1000)
      key = `${ist.getUTCFullYear()}-${String(ist.getUTCMonth()+1).padStart(2,'0')}-${String(ist.getUTCDate()).padStart(2,'0')}`
    } else {
      // No PaymentDate — fall back to Month (YYYY-MM), use 1st of month as key
      key = d.Month + '-01'
    }
    byDate[key] = (byDate[key] || 0) + 1
  }
  const hatTrickDays = Object.values(byDate).filter(n => n >= 3).length
  return { amount: hatTrickDays * 1000, days: hatTrickDays, byDate }
}

// ── Auto-log ANY kicker earning to KickerEarnings sheet ──────────────────────
// Single function used for ALL kicker types (Hat Trick, individual slabs, team slabs).
// The Kickers tab is for kicker config only — achievements go to KickerEarnings.
// Caller must deduplicate before calling (sessionStorage-based in components).
export async function logKickerEarning({ agentEmail, agentName, date, month, kickerType, details, amount }) {
  try {
    await appsScript.appendRow('KickerEarnings', {
      Date:       date,
      Month:      month,
      AgentEmail: agentEmail,
      AgentName:  agentName,
      KickerType: kickerType,
      Details:    details,
      Amount:     amount,
      LoggedAt:   new Date().toISOString(),
    })
  } catch (e) {
    // fire-and-forget — never block UI
  }
}

// Kept for backward compat — delegates to logKickerEarning
export async function logHatTrickAchievement({ agentEmail, agentName, date, month, dealCount }) {
  return logKickerEarning({
    agentEmail, agentName, date, month,
    kickerType: 'Hat Trick',
    details:    `${dealCount} deals on ${date}`,
    amount:     1000,
  })
}

// Compute kicker payout earned by a single agent.
// agentDeals: ALL deals for the agent (no month filter required beyond what caller provides).
// Counts past + active kickers — a kicker that has ended still counts if the agent hit it.
function computeKickerEarningsForAgent(agentRole, agentDeals, allKickers, allDeals, agentEmail) {
  allDeals   = allDeals   || []
  agentEmail = (agentEmail || '').trim().toLowerCase()

  let total = computeHatTrickEarnings(agentDeals).amount
  for (const raw of (allKickers || [])) {
    // Accept pre-parsed objects (from getKickers()) or raw sheet rows
    const k = (raw && raw.id) ? raw : parseKickerRow(raw)
    if (!k.id) continue
    if (!k.targetRoles.includes(agentRole)) continue

    const from = new Date(k.dateFrom).getTime()
    const to   = new Date(k.dateTo).getTime() + 86399999
    if (Date.now() < from) continue

    const rawType = k.type || 'sales'

    // Date filter — PaymentDate (YYYY-MM-DD) as primary, Month as fallback
    const kickerMonth = (k.dateFrom || '').substring(0, 7)
    function inDateRange(d) {
      if (d.PaymentDate) {
        const dt = new Date(d.PaymentDate).getTime()
        if (!isNaN(dt)) return dt >= from && dt <= to
      }
      return kickerMonth ? d.Month === kickerMonth : false
    }

    // team_month_end: per-agent S1/S2 thresholds stored in agentTargets, not slabs
    if (rawType === 'team_month_end') {
      if (!agentEmail) continue
      const targets = k.agentTargets?.[agentEmail] || k.agentTargets?.[agentEmail.toLowerCase()]
      if (!targets) continue
      const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
      const inRange = agentDeals.filter(inDateRange)
      const sales = minVal > 0 ? inRange.filter(d => (d.TotalValue || 0) >= minVal).length : inRange.length
      const s1Target = Number(targets.s1 || 0)
      const s2Target = Number(targets.s2 || 0)
      const s1Payout = Number(k.slabs[0]?.payout || 0)
      const s2Payout = Number(k.slabs[1]?.payout || 0)
      if (s2Target > 0 && sales >= s2Target)       total += s2Payout
      else if (s1Target > 0 && sales >= s1Target)  total += s1Payout
      continue
    }

    // weekly_target_pct: revenue vs per-person weekly target (percentage threshold)
    if (rawType === 'weekly_target_pct') {
      if (!agentEmail) continue
      const weeklyTarget = Number((k.weeklyTargets || {})[agentEmail] || 0)
      if (!weeklyTarget) continue
      const inRange    = agentDeals.filter(inDateRange)
      const revenue    = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
      const achievedPct = Math.round((revenue / weeklyTarget) * 100)
      const sorted2    = [...k.slabs].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0))
      let earnedSlab2  = null
      for (const slab of sorted2) {
        if (achievedPct >= Number(slab.threshold || 0)) earnedSlab2 = slab
      }
      if (earnedSlab2) total += Number(earnedSlab2.payout || 0)
      continue
    }

    // Normalize type for all other kicker types
    const type = rawType === 'collective' ? 'collective'
               : (rawType === 'revenue' || rawType === 'team_revenue' || rawType === 'individual_revenue') ? 'revenue'
               : 'sales'

    let sales = 0, revenue = 0, teamSales = 0, agentContrib = 0

    if (type === 'collective') {
      if (!allDeals.length || !agentEmail) continue
      const targetTeams = k.targetTeams || ['ALL']
      const emailSet = targetTeams.includes('ALL') ? null : new Set(targetTeams.map(e => e.toLowerCase()))
      const teamDeals = allDeals.filter(d => {
        if (!inDateRange(d)) return false
        if (emailSet && !emailSet.has((d.Email || '').toLowerCase())) return false
        return true
      })
      const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
      teamSales = teamDeals.filter(d => minVal <= 0 || (d.TotalValue || 0) >= minVal).length
      agentContrib = teamDeals.filter(d =>
        (d.Email || '').toLowerCase() === agentEmail &&
        (minVal <= 0 || (d.TotalValue || 0) >= minVal)
      ).length
    } else {
      const inRange = agentDeals.filter(inDateRange)
      const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
      revenue = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
      sales   = minVal > 0 ? inRange.filter(d => (d.TotalValue || 0) >= minVal).length : inRange.length
    }

    const sorted = [...k.slabs].sort((a, b) =>
      Number(a.threshold || a.salesThreshold || a.revenueThreshold || 0) -
      Number(b.threshold || b.salesThreshold || b.revenueThreshold || 0)
    )
    let earnedSlab = null
    for (const slab of sorted) {
      const t = Number(slab.threshold || (type === 'revenue' ? slab.revenueThreshold : slab.salesThreshold) || 0)
      let hit = false
      if      (type === 'sales')      hit = sales >= t
      else if (type === 'revenue')    hit = revenue >= t
      else if (type === 'collective') hit = teamSales >= t
      if (hit) earnedSlab = slab
    }
    if (earnedSlab) {
      if (type === 'collective') {
        total += k.collectiveMode === 'per_agent'
          ? (agentContrib > 0 ? Number(earnedSlab.payout || 0) : 0)
          : agentContrib * Number(earnedSlab.payout || 0)
      } else {
        total += Number(earnedSlab.payout || 0)
      }
    }
  }
  return total
}

// Returns per-kicker breakdown for dashboard drill-down modal
export function computeKickerBreakdown(agentRole, agentDeals, allKickers, allDeals, agentEmail) {
  allDeals   = allDeals   || []
  agentEmail = (agentEmail || '').trim().toLowerCase()
  const rows = []

  const hatTrick = computeHatTrickEarnings(agentDeals)
  if (hatTrick.amount > 0) {
    rows.push({ title: '🎩 Hat Trick Bonus', type: 'hat_trick', dateFrom: '', dateTo: '', status: 'Announced', amount: hatTrick.amount })
  }

  for (const raw of (allKickers || [])) {
    // Accept pre-parsed objects (from getKickers()) or raw sheet rows
    const k = (raw && raw.id) ? raw : parseKickerRow(raw)
    if (!k.id) continue
    if (!k.targetRoles.includes(agentRole)) continue

    const from = new Date(k.dateFrom).getTime()
    const to   = new Date(k.dateTo).getTime() + 86399999
    if (Date.now() < from) continue

    const rawType = k.type || 'sales'
    const kickerMonth = (k.dateFrom || '').substring(0, 7)
    const inRange_ = (d) => {
      if (d.PaymentDate) { const dt = new Date(d.PaymentDate).getTime(); if (!isNaN(dt)) return dt >= from && dt <= to }
      return kickerMonth ? d.Month === kickerMonth : false
    }

    let amount = 0

    if (rawType === 'team_month_end') {
      if (!agentEmail) continue
      const targets = k.agentTargets?.[agentEmail] || k.agentTargets?.[agentEmail.toLowerCase()]
      if (!targets) continue
      const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
      const sales = agentDeals.filter(inRange_).filter(d => minVal <= 0 || (d.TotalValue || 0) >= minVal).length
      const s1Target = Number(targets.s1 || 0); const s2Target = Number(targets.s2 || 0)
      const s1Payout = Number(k.slabs[0]?.payout || 0); const s2Payout = Number(k.slabs[1]?.payout || 0)
      if (s2Target > 0 && sales >= s2Target)      amount = s2Payout
      else if (s1Target > 0 && sales >= s1Target) amount = s1Payout
    } else if (rawType === 'weekly_target_pct') {
      if (!agentEmail) continue
      const weeklyTarget = Number((k.weeklyTargets || {})[agentEmail] || 0)
      if (!weeklyTarget) continue
      const inRange    = agentDeals.filter(inRange_)
      const revenue    = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
      const achievedPct = Math.round((revenue / weeklyTarget) * 100)
      const sorted2    = [...k.slabs].sort((a, b) => Number(a.threshold || 0) - Number(b.threshold || 0))
      let earnedSlab2  = null
      for (const slab of sorted2) {
        if (achievedPct >= Number(slab.threshold || 0)) earnedSlab2 = slab
      }
      if (earnedSlab2) amount = Number(earnedSlab2.payout || 0)
    } else {
      const type = rawType === 'collective' ? 'collective'
                 : (rawType === 'revenue' || rawType === 'team_revenue' || rawType === 'individual_revenue') ? 'revenue'
                 : 'sales'
      let sales = 0, revenue = 0, teamSales = 0, agentContrib = 0
      if (type === 'collective') {
        if (!allDeals.length || !agentEmail) continue
        const targetTeams = k.targetTeams || ['ALL']
        const emailSet = targetTeams.includes('ALL') ? null : new Set(targetTeams.map(e => e.toLowerCase()))
        const teamDeals = allDeals.filter(d => inRange_(d) && (!emailSet || emailSet.has((d.Email || '').toLowerCase())))
        const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
        teamSales    = teamDeals.filter(d => minVal <= 0 || (d.TotalValue || 0) >= minVal).length
        agentContrib = teamDeals.filter(d => (d.Email || '').toLowerCase() === agentEmail && (minVal <= 0 || (d.TotalValue || 0) >= minVal)).length
      } else {
        const inRange = agentDeals.filter(inRange_)
        const minVal = k.minSaleValue > 0 ? k.minSaleValue : 0
        revenue = inRange.reduce((s, d) => s + (d.TotalValue || 0), 0)
        sales   = minVal > 0 ? inRange.filter(d => (d.TotalValue || 0) >= minVal).length : inRange.length
      }
      const sorted = [...k.slabs].sort((a, b) =>
        Number(a.threshold || a.salesThreshold || a.revenueThreshold || 0) -
        Number(b.threshold || b.salesThreshold || b.revenueThreshold || 0)
      )
      let earnedSlab = null
      for (const slab of sorted) {
        const t = Number(slab.threshold || (type === 'revenue' ? slab.revenueThreshold : slab.salesThreshold) || 0)
        const hit = type === 'sales' ? sales >= t : type === 'revenue' ? revenue >= t : teamSales >= t
        if (hit) earnedSlab = slab
      }
      if (earnedSlab) {
        amount = type === 'collective'
          ? (k.collectiveMode === 'per_agent' ? (agentContrib > 0 ? Number(earnedSlab.payout || 0) : 0) : agentContrib * Number(earnedSlab.payout || 0))
          : Number(earnedSlab.payout || 0)
      }
    }

    if (amount > 0) rows.push({ title: k.title, type: k.type, dateFrom: k.dateFrom, dateTo: k.dateTo, status: k.status, amount })
  }
  return rows
}

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
  const lower = (rootEmail || '').trim().toLowerCase()
  const root  = users.find(u => (u.Email || '').trim().toLowerCase() === lower)
  if (!root) return null
  return {
    ...root,
    children: users
      .filter(u => (u.ManagerEmail || '').trim().toLowerCase() === lower)
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
    const { slabs: parsed } = parseSlabsField(tf(target, 'CommissionEndDate'))
    if (parsed.length) {
      slabs = [...parsed].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
    }
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

export function calcTieredCommission(achieved, target) {
  if (!achieved || achieved <= 0) return 0

  // 1. Check if CommissionPct is a preset ID ("basic","average","pro")
  const presetId = String(tf(target, 'CommissionPct') || '').trim().toLowerCase()
  const preset   = ALL_TARGET_PRESETS.find(p => p.id === presetId)
  if (preset) {
    const sorted = [...preset.slabs].sort((a, b) => a.targetAmount - b.targetAmount)
    let rate = 0
    for (const slab of sorted) {
      if (achieved >= slab.targetAmount) rate = slab.commissionPct
    }
    return achieved * rate / 100
  }

  // 2. Fall back to slabs JSON stored in CommissionEndDate
  {
    const { slabs } = parseSlabsField(tf(target, 'CommissionEndDate'))
    if (slabs.length > 0) {
      const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
      let rate = 0
      for (const slab of sorted) {
        if (achieved >= Number(slab.targetAmount)) rate = Number(slab.commissionPct)
      }
      return achieved * rate / 100
    }
  }

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

// ─── Manager Targets (stored in CommissionConfig sheet) ──────────────────────
// Sheet: CommissionConfig
// Columns: Key | ManagerEmail | Month | ProjectedSlabs | RealisedSlabs | AssignedBy | AssignedAt
// Key = "mgr_email_month"  (unique per manager per month, used for deletion)
// ProjectedSlabs / RealisedSlabs = JSON  [{targetAmount, commissionPct}]

function parseMgrSlabsJson(json) {
  const parsed = safeParse(json, [])
  if (Array.isArray(parsed)) return parsed
  return Array.isArray(parsed.slabs) ? parsed.slabs : []
}

function parseMgrPersonalContrib(json) {
  try {
    const parsed = safeParse(json, [])
    if (Array.isArray(parsed)) return 0
    return Number(parsed.personalContribution ?? 0)
  } catch { return 0 }
}

function toMgrRecord(r) {
  return {
    ...r,
    Month:               normalizeMonth(r.Month),
    projectedSlabs:      parseMgrSlabsJson(r.ProjectedSlabs),
    realisedSlabs:       parseMgrSlabsJson(r.RealisedSlabs),
    personalContribution: parseMgrPersonalContrib(r.ProjectedSlabs),
    programFilter:       String(r.ProgramFilter || 'all').trim().toLowerCase() || 'all',
  }
}

export const getManagerTargets = async (managerEmail, month) => {
  const rows = await appsScript.getSheet('CommissionConfig')
  const lower = (managerEmail ?? '').trim().toLowerCase()
  const filtered = rows
    .filter(r => {
      const em  = String(r.ManagerEmail || '').trim().toLowerCase()
      const mon = normalizeMonth(r.Month)
      return em === lower && (!month || mon === month)
    })
    .sort((a, b) => new Date(b.AssignedAt || 0) - new Date(a.AssignedAt || 0))

  // Deduplicate by program — keep latest per program
  const byProgram = new Map()
  for (const r of filtered) {
    const prog = String(r.ProgramFilter || 'all').trim().toLowerCase() || 'all'
    if (!byProgram.has(prog)) byProgram.set(prog, toMgrRecord(r))
  }
  return [...byProgram.values()]
}

export const getManagerTargetHistory = async (managerEmail) => {
  const rows = await appsScript.getSheet('CommissionConfig')
  const lower = (managerEmail ?? '').trim().toLowerCase()
  const filtered = rows.filter(r => String(r.ManagerEmail || '').trim().toLowerCase() === lower)
  const byKey = new Map()
  for (const r of filtered.sort((a, b) => new Date(b.AssignedAt || 0) - new Date(a.AssignedAt || 0))) {
    const mon  = normalizeMonth(r.Month)
    const prog = String(r.ProgramFilter || 'all').trim().toLowerCase() || 'all'
    const key  = `${mon}___${prog}`
    if (mon && !byKey.has(key)) byKey.set(key, toMgrRecord(r))
  }
  return [...byKey.values()].sort((a, b) => {
    const mc = (b.Month || '').localeCompare(a.Month || '')
    if (mc !== 0) return mc
    return (a.programFilter || 'all').localeCompare(b.programFilter || 'all')
  })
}

export const assignManagerTarget = async (data, assignerEmail) => {
  const prog = (data.program && data.program !== 'all') ? `_${data.program}` : ''
  const key  = `mgr_${data.email.trim().toLowerCase()}_${data.month}${prog}`
  const pc = Number(data.personalContribution ?? 0)
  const row  = [
    key,
    data.email.trim().toLowerCase(),
    data.month,
    JSON.stringify({ slabs: data.projectedSlabs ?? [], personalContribution: pc }),
    JSON.stringify(data.realisedSlabs ?? []),
    assignerEmail,
    new Date().toISOString(),
    data.program ?? 'all',
  ]
  const result = await appsScript.appendRow('CommissionConfig', row)
  clearCache()
  return result
}

export const deleteManagerTarget = async (email, month, program = 'all') => {
  const prog = (program && program !== 'all') ? `_${program}` : ''
  const key  = `mgr_${email.trim().toLowerCase()}_${month}${prog}`
  let deleted = true
  while (deleted) {
    try { await appsScript.deleteRow('CommissionConfig', 'Key', key) }
    catch { deleted = false }
  }
  clearCache()
}

// Reads from the "ManagerSlabs" sheet.
// Expected columns: Type | SlabName | MaxTarget | CommissionPct | CreatedBy
// Type = "Projected" | "Realised"
export const getManagerSlabs = async (type) => {
  const rows = await appsScript.getSheet('ManagerSlabs')
  const filtered = type
    ? rows.filter(r => String(r.Type || '').trim() === type)
    : rows
  return filtered.sort((a, b) => Number(a.MaxTarget) - Number(b.MaxTarget))
}

// Full commission info — proportional partial earn + eligibility metadata
// Returns { commission, isPartial, activeSlab, nextSlab, gapToNext, slabIdx }
export function calcManagerCommissionInfo(teamMetric, slabs) {
  const empty = { commission: 0, isPartial: true, activeSlab: null, nextSlab: null, gapToNext: 0, slabIdx: -1 }
  if (!slabs?.length) return empty
  const sorted = [...slabs].sort((a, b) => Number(a.targetAmount) - Number(b.targetAmount))
  const qualifying = sorted.filter(s => teamMetric >= Number(s.targetAmount))
  const activeSlab = qualifying.length > 0 ? qualifying[qualifying.length - 1] : null
  const slabIdx    = activeSlab ? sorted.indexOf(activeSlab) : -1
  const nextSlab   = activeSlab
    ? sorted.find(s => Number(s.targetAmount) > Number(activeSlab.targetAmount)) ?? null
    : sorted[0]
  const gapToNext  = nextSlab ? Math.max(0, Number(nextSlab.targetAmount) - teamMetric) : 0

  if (activeSlab) {
    return { commission: teamMetric * Number(activeSlab.commissionPct) / 100, isPartial: false, activeSlab, nextSlab, gapToNext, slabIdx }
  }
  // Below slab 1 — no commission until first threshold is hit
  const s0 = sorted[0]
  return { commission: 0, isPartial: true, activeSlab: null, nextSlab: s0, gapToNext, slabIdx: -1 }
}

export function calcManagerCommission(teamMetric, slabs) {
  return calcManagerCommissionInfo(teamMetric, slabs).commission
}

// ── Kickers ───────────────────────────────────────────────────────────────────
// Slabs column holds either:
//  - a bare array (legacy rows)              → [{ threshold, payout, ... }, ...]
//  - a packed object (new workflow fields)   → { slabs: [...], status, paidDate, notes, individualAmounts }
// This avoids any DB schema change — new fields ride inside the existing jsonb column.
function unpackSlabsCol(raw) {
  const parsed = safeParse(raw, [])
  if (Array.isArray(parsed)) {
    // Legacy kicker — no workflow data yet. Treat as already-live so nothing
    // changes visually for kickers announced before this revamp.
    return { slabs: parsed, status: 'Approved', paidDate: '', notes: '', individualAmounts: {} }
  }
  return {
    slabs:             Array.isArray(parsed.slabs) ? parsed.slabs : [],
    status:            parsed.status            || 'Announced',
    paidDate:          parsed.paidDate          || '',
    notes:             parsed.notes             || '',
    individualAmounts: parsed.individualAmounts || {},
    collectiveMode:    parsed.collectiveMode    || 'per_sale',
    weeklyTargets:     parsed.weeklyTargets     || {},
    agentTargets:      parsed.agentTargets      || {},  // { email: { s1: N, s2: M } } for team_month_end
  }
}

export function packSlabsCol({ slabs, status, paidDate, notes, individualAmounts, collectiveMode, weeklyTargets, agentTargets }) {
  return JSON.stringify({
    slabs:             slabs || [],
    status:            status || 'Announced',
    paidDate:          paidDate || '',
    notes:             notes || '',
    individualAmounts: individualAmounts || {},
    collectiveMode:    collectiveMode || 'per_sale',
    weeklyTargets:     weeklyTargets || {},
    agentTargets:      agentTargets  || {},
  })
}

function parseKickerRow(r) {
  const safeArr = (key) => { const v = safeParse(r[key], []); return Array.isArray(v) ? v : [] }
  const extra = unpackSlabsCol(r.Slabs)
  return {
    id:                r.KickerId    || '',
    title:             r.Title       || '',
    message:           r.Message     || '',
    type:              r.Type        || 'team_sales',
    minSaleValue:      Number(r.MinSaleValue || 0),
    dateFrom:          r.DateFrom    || '',
    dateTo:            r.DateTo      || '',
    slabs:             extra.slabs,
    status:            extra.status,            // 'Announced' | 'Approved' | 'Paid'
    paidDate:          extra.paidDate,
    notes:             extra.notes,
    individualAmounts: extra.individualAmounts,  // { email: customAmount }
    collectiveMode:    extra.collectiveMode,     // 'per_sale' | 'per_agent'
    weeklyTargets:     extra.weeklyTargets,      // { email: weeklyRevenueTarget }
    agentTargets:      extra.agentTargets,       // { email: { s1: N, s2: M } } for team_month_end
    targetTeams:       safeArr('TargetTeams'),
    targetRoles:       safeArr('TargetRoles'),
    pinned:            r.Pinned === 'true' || r.Pinned === true,
    announcedBy:       r.AnnouncedBy     || '',
    announcedByRole:   r.AnnouncedByRole || '',
    announcedAt:       r.AnnouncedAt     || '',
  }
}

export async function getKickers() {
  try {
    const rows = await appsScript.getSheet('Kickers')
    return (rows || []).map(parseKickerRow).filter(k => k.id)
  } catch { return [] }
}

// Compute a manager's own kicker earnings (manager-role kickers evaluated on team revenue)
export async function getManagerOwnKickerEarnings(managerEmail) {
  const [users, deals, allKickers] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSalesSheet(),
    appsScript.getSheet('Kickers').catch(() => []),
  ])
  const lowerEmail = (managerEmail || '').trim().toLowerCase()
  const teamEmails = collectEmails(users, managerEmail).map(e => e.trim().toLowerCase())
  const teamDeals  = deals.filter(d => teamEmails.includes((d.Email || '').trim().toLowerCase()))
  return computeKickerEarningsForAgent('Manager', teamDeals, allKickers, deals, lowerEmail)
}

export async function announceKicker(data, announcerEmail, announcerRole) {
  const id  = `kicker_${Date.now()}`
  await appsScript.appendRow('Kickers', [
    id,
    data.title,
    data.message || '',
    data.type,
    data.minSaleValue || 0,
    data.dateFrom,
    data.dateTo,
    packSlabsCol({
      slabs: data.slabs || [],
      status: data.status || 'Announced',
      notes: data.notes || '',
      individualAmounts: data.individualAmounts || {},
      collectiveMode: data.collectiveMode || 'per_sale',
      weeklyTargets: data.weeklyTargets || {},
      agentTargets:  data.agentTargets  || {},
    }),
    JSON.stringify(data.targetTeams || ['ALL']),
    JSON.stringify(data.targetRoles || []),
    data.pinned ? 'true' : 'false',
    announcerEmail,
    announcerRole,
    new Date().toISOString(),
  ])
  clearCache()
  return id
}

// Update just the workflow status (Announced/Approved/Paid) of a kicker,
// preserving its existing slabs/notes/individualAmounts.
export async function setKickerStatus(kicker, status) {
  await updateKicker(kicker.id, {
    Slabs: packSlabsCol({
      slabs: kicker.slabs,
      status,
      paidDate: status === 'Paid' ? new Date().toISOString().split('T')[0] : kicker.paidDate,
      notes: kicker.notes,
      individualAmounts: kicker.individualAmounts,
    }),
  })
}

export async function deleteKicker(kickerId) {
  await appsScript.deleteRow('Kickers', 'KickerId', kickerId)
  clearCache()
}

export async function updateKicker(kickerId, updates) {
  await appsScript.updateRow('Kickers', 'KickerId', kickerId, updates)
  clearCache()
}

// ── Reassign agent to a different manager ────────────────────────────────────
export async function reassignAgent(agentEmail, newManagerEmail, updatedByEmail) {
  await appsScript.updateRow('Users', 'Email', agentEmail, {
    ManagerEmail: newManagerEmail,
  })
  clearCache()
}

// ── Change a member's role ────────────────────────────────────────────────────
export async function changeRole(email, newRole) {
  await appsScript.updateRow('Users', 'Email', email, { Role: newRole })
  clearCache()
}

// ── Delete / deactivate a user account ───────────────────────────────────────
// Removes the user from the Users sheet entirely.
// Historical deal / target data is preserved in other sheets.
export async function deleteUser(email) {
  await appsScript.deleteRow('Users', 'Email', email)
  clearCache()
}
