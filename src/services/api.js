// All API calls go directly to Apps Script — no Node.js backend needed
import { appsScript } from './appsScript'
import { v4 as uuidv4 } from 'uuid'

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const login = (email, password) =>
  appsScript.login(email, password)

export const activateInvite = (token, password) =>
  appsScript.activateInvite(token, password)

export const getInviteInfo = (token) =>
  appsScript.getInviteInfo(token)

// ─── Deals ───────────────────────────────────────────────────────────────────

export const getDeals = async (filterEmail, month) => {
  const deals = await appsScript.getSheet('Deals')
  return deals.filter(d =>
    (!filterEmail || d.Email === filterEmail) &&
    (!month       || d.Month === month)
  )
}

export const getDealsForSubtree = async (emails, month) => {
  const deals = await appsScript.getSheet('Deals')
  return deals.filter(d =>
    emails.includes(d.Email) &&
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
  return targets.filter(t =>
    (!filterEmail || t.Email === filterEmail) &&
    (!month       || t.Month === month)
  )
}

export const assignTarget = async (data, assignerEmail) => {
  // data: { email, month, targetAmount, commissionPct, commissionStartDate, commissionEndDate }
  const row = [
    data.email,
    data.month,
    Number(data.targetAmount),
    Number(data.commissionPct),
    data.commissionStartDate || '',
    data.commissionEndDate   || '',
    assignerEmail,
    new Date().toISOString(),
  ]
  return appsScript.upsertRow('Targets', 'Email', data.email, row)
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
    appsScript.getSheet('Deals'),
  ])
  const target = targets.find(t => t.Email === userEmail && t.Month === month)
  if (!target) return { totalTarget: 0, totalAchieved: 0, totalCommission: 0, achievementPct: 0 }

  const cleared = deals.filter(d =>
    d.Email  === userEmail &&
    d.Month  === month &&
    d.Status === 'Cleared' &&
    isInCommissionPeriod(d.ClosedDate, target.CommissionStartDate, target.CommissionEndDate)
  )
  const achieved   = cleared.reduce((s, d) => s + Number(d.Price), 0)
  const commission = achieved * Number(target.CommissionPct) / 100

  return {
    totalTarget:     Number(target.TargetAmount),
    totalAchieved:   achieved,
    totalCommission: commission,
    achievementPct:  target.TargetAmount > 0 ? Math.min((achieved / Number(target.TargetAmount)) * 100, 999) : 0,
    commissionPct:   Number(target.CommissionPct),
    commissionStart: target.CommissionStartDate,
    commissionEnd:   target.CommissionEndDate,
  }
}

export const getLeaderboard = async (rootEmail, month) => {
  const [users, targets, deals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSheet('Targets'),
    appsScript.getSheet('Deals'),
  ])
  const emails  = collectEmails(users, rootEmail).filter(e => e !== rootEmail)
  const agents  = users.filter(u => emails.includes(u.Email) && u.Role === 'Agent')

  return agents.map(agent => {
    const target  = targets.find(t => t.Email === agent.Email && t.Month === month)
    const tAmount = target ? Number(target.TargetAmount) : 0
    const pct     = target ? Number(target.CommissionPct) : 0

    const achieved = deals
      .filter(d =>
        d.Email  === agent.Email &&
        d.Month  === month &&
        d.Status === 'Cleared' &&
        (!target || isInCommissionPeriod(d.ClosedDate, target.CommissionStartDate, target.CommissionEndDate))
      )
      .reduce((s, d) => s + Number(d.Price), 0)

    return {
      name:       agent.Name,
      email:      agent.Email,
      target:     tAmount,
      achieved,
      pct:        tAmount > 0 ? Math.min((achieved / tAmount) * 100, 999) : 0,
      commission: achieved * pct / 100,
    }
  }).sort((a, b) => b.achieved - a.achieved)
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

function isInCommissionPeriod(closedDate, startDate, endDate) {
  if (!startDate || !endDate) return true  // no restriction set
  if (!closedDate) return false
  const d = new Date(closedDate)
  return d >= new Date(startDate) && d <= new Date(endDate)
}
