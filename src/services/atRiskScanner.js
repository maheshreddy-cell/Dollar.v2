// At-risk scanner — scans team deals for stuck payments (3+ working days)
// Used by Dashboard to push team-level at-risk summaries for managers/VH

import { appsScript } from './appsScript'

function workingDaysSince(dateStr) {
  if (!dateStr) return 0
  const start = new Date(dateStr)
  if (isNaN(start)) return 0
  const now = new Date()
  let count = 0
  const cur = new Date(start)
  while (cur < now) {
    const d = cur.getDay()
    if (d !== 0) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function collectEmails(users, rootEmail) {
  const lower = (rootEmail || '').trim().toLowerCase()
  const emails = [lower]
  const visited = new Set([lower])
  let queue = [lower]
  while (queue.length) {
    const current = queue.shift()
    const children = users.filter(u =>
      (u.ManagerEmail || '').trim().toLowerCase() === current &&
      !visited.has((u.Email || '').trim().toLowerCase())
    )
    for (const c of children) {
      const e = (c.Email || '').trim().toLowerCase()
      visited.add(e)
      emails.push(e)
      queue.push(e)
    }
  }
  return emails
}

/**
 * Scans all team deals for at-risk items and returns per-agent breakdown.
 * @returns {{ agents: Array<{ name, email, count, amount, deals }>, totalCount, totalAmount }}
 */
export async function getDealsForTeamAtRisk(rootEmail, month) {
  const [users, rawDeals] = await Promise.all([
    appsScript.getSheet('Users'),
    appsScript.getSalesSheet(),
  ])

  const allEmails = collectEmails(users, rootEmail)
  const emailSet = new Set(allEmails.map(e => e.trim().toLowerCase()))

  // Filter deals for this team + month
  const teamDeals = rawDeals.filter(d => {
    const em = (d.Email || '').trim().toLowerCase()
    return emailSet.has(em) && (!month || d.Month === month)
  })

  // Find at-risk deals per agent
  const agentMap = new Map()

  for (const d of teamDeals) {
    const stage = (d.LoanDocsCollected || '').trim().toLowerCase()
    const isAtRisk = ['awaiting for docs', 'post_approval pending'].includes(stage) &&
      workingDaysSince(d.Timestamp || d.PaymentDate) >= 3  // workingDaysSince handles DD/MM/YYYY

    if (!isAtRisk) continue

    const email = (d.Email || '').trim().toLowerCase()
    if (!agentMap.has(email)) {
      const user = users.find(u => (u.Email || '').trim().toLowerCase() === email)
      agentMap.set(email, {
        name: user?.Name || email,
        email,
        count: 0,
        amount: 0,
        deals: [],
      })
    }
    const entry = agentMap.get(email)
    entry.count++
    entry.amount += (d.TotalValue || 0)
    entry.deals.push(d)
  }

  const agents = Array.from(agentMap.values()).sort((a, b) => b.amount - a.amount)
  const totalCount = agents.reduce((s, a) => s + a.count, 0)
  const totalAmount = agents.reduce((s, a) => s + a.amount, 0)

  return { agents, totalCount, totalAmount }
}
