// Vercel Cron — Daily 11 AM IST summary
// Fetches data directly from Supabase (no Apps Script dependency)
// Cron schedule: "30 5 * * *" (5:30 UTC = 11:00 IST)

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

async function fetchAll(table) {
  const PAGE = 1000
  let from = 0, all = []
  for (;;) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error) throw new Error(`Supabase error (${table}): ${error.message}`)
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

export default async function handler(req, res) {
  // Allow Vercel cron (GET) or manual trigger (POST)
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return res.status(500).json({ error: 'SLACK_WEBHOOK_URL not configured' })
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
    return res.status(500).json({ error: 'Supabase env vars not configured' })

  try {
    const [users, sales, targets] = await Promise.all([
      fetchAll('users'),
      fetchAll('sales'),
      fetchAll('targets'),
    ])

    const month   = getCurrentMonth()
    const wdLeft  = workingDaysLeft(month)

    const agents   = users.filter(u => u.role === 'Agent')
    const managers = users.filter(u => u.role === 'Manager')

    // ── Per-agent stats ──────────────────────────────────────────────────────
    const agentStats = agents.map(agent => {
      const email = (agent.email || '').trim().toLowerCase()

      const agentDeals = sales.filter(d =>
        (d.agent_email || '').trim().toLowerCase() === email &&
        normalizeMonth(d.month) === month
      )

      const achieved = agentDeals
        .filter(d => Number(d.paid_actual || 0) > 0)
        .reduce((s, d) => s + Number(d.paid_actual || 0), 0)

      const tgt = latestTarget(targets, email, month)
      const tAmount = tgt ? Number(tgt.target_amount || 0) : 0

      // At-risk: stuck 3+ working days in docs-pending stages
      const atRiskDeals = agentDeals.filter(d => {
        const stage = (d.loan_docs_collected || '').trim().toLowerCase()
        return ['awaiting for docs', 'post_approval pending'].includes(stage) &&
          workingDaysSince(d.timestamp || d.payment_date) >= 3
      })
      const atRiskCount  = atRiskDeals.length
      const atRiskAmount = atRiskDeals.reduce((s, d) => s + Number(d.total_sale_value || 0), 0)

      const gap = Math.max(0, tAmount - achieved)
      const pct = tAmount > 0 ? Math.round((achieved / tAmount) * 100) : 0

      return {
        name:         agent.name || email,
        email,
        managerEmail: (agent.manager_email || '').trim().toLowerCase(),
        target:       tAmount,
        achieved,
        gap,
        pct,
        atRiskCount,
        atRiskAmount,
      }
    })

    // ── Org totals ───────────────────────────────────────────────────────────
    const totalTarget    = agentStats.reduce((s, a) => s + a.target,       0)
    const totalAchieved  = agentStats.reduce((s, a) => s + a.achieved,     0)
    const totalAtRisk    = agentStats.reduce((s, a) => s + a.atRiskCount,  0)
    const totalAtRiskAmt = agentStats.reduce((s, a) => s + a.atRiskAmount, 0)
    const orgPct         = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0

    const agentsAtRisk      = agentStats.filter(a => a.atRiskCount > 0)
    const agentsBelowTarget = agentStats.filter(a => a.pct < 50 && a.target > 0)

    // ── Slack message ────────────────────────────────────────────────────────
    let summaryText = `*📅 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}*\n`
    summaryText += `*Working days left:* ${wdLeft}\n\n`
    summaryText += `*🎯 Org Performance:* ${fmt(totalAchieved)} / ${fmt(totalTarget)} (${orgPct}%)\n`

    if (totalAtRisk > 0) {
      summaryText += `\n*🚨 At-Risk Deals:* ${totalAtRisk} deals worth ${fmt(totalAtRiskAmt)} stuck 3+ days\n`
      agentsAtRisk.slice(0, 10).forEach(a => {
        summaryText += `  • ${a.name} — ${a.atRiskCount} deal${a.atRiskCount > 1 ? 's' : ''} (${fmt(a.atRiskAmount)})\n`
      })
    }

    if (agentsBelowTarget.length > 0) {
      summaryText += `\n*⚠️ Below 50% Target (${agentsBelowTarget.length} agents):*\n`
      agentsBelowTarget.sort((a, b) => a.pct - b.pct).slice(0, 10).forEach(a => {
        summaryText += `  • ${a.name} — ${a.pct}% (need ${fmt(a.gap)} more)\n`
      })
    }

    if (managers.length > 0) {
      summaryText += `\n*👥 Team Summaries:*\n`
      managers.forEach(mgr => {
        const mgrEmail  = (mgr.email || '').trim().toLowerCase()
        const teamAgents = agentStats.filter(a => a.managerEmail === mgrEmail)
        if (teamAgents.length === 0) return
        const teamAch    = teamAgents.reduce((s, a) => s + a.achieved, 0)
        const teamTgt    = teamAgents.reduce((s, a) => s + a.target,   0)
        const teamPct    = teamTgt > 0 ? Math.round((teamAch / teamTgt) * 100) : 0
        const teamAtRisk = teamAgents.reduce((s, a) => s + a.atRiskCount, 0)
        summaryText += `  • *${mgr.name || mgrEmail}:* ${teamPct}% achieved (${fmt(teamAch)}/${fmt(teamTgt)})${teamAtRisk > 0 ? ` | 🚨 ${teamAtRisk} at-risk` : ''}\n`
      })
    }

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '📊 Daily Summary — 11 AM Briefing', emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: summaryText } },
          { type: 'context', elements: [
            { type: 'mrkdwn', text: `Auto-generated by Dollar.v2 • <https://dollar-v2-cc2b.vercel.app/dashboard|Open Dashboard>` },
          ]},
        ],
      }),
    })

    if (!slackRes.ok) {
      const errText = await slackRes.text()
      return res.status(500).json({ error: `Slack error: ${errText}` })
    }

    return res.status(200).json({
      ok: true,
      summary: { totalTarget, totalAchieved, orgPct, totalAtRisk, agentsBelowTarget: agentsBelowTarget.length },
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN')
}

function getCurrentMonth() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
}

function normalizeMonth(val) {
  if (!val) return ''
  const str = String(val).trim()
  if (/^\d{4}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str)
    if (!isNaN(d)) {
      const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
      return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
    }
  }
  const names = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
    jan:1,feb:2,mar:3,apr:4,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12,
  }
  const lower = str.toLowerCase()
  let monthNum = null
  for (const [name, num] of Object.entries(names)) {
    if (lower.includes(name)) { monthNum = num; break }
  }
  const yearMatch = str.match(/\b(20\d{2})\b/)
  if (monthNum && yearMatch) return `${yearMatch[1]}-${String(monthNum).padStart(2, '0')}`
  const d = new Date(str)
  if (!isNaN(d)) {
    const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000)
    return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, '0')}`
  }
  return str
}

function latestTarget(targets, email, month) {
  const matched = targets.filter(t =>
    (t.email || '').trim().toLowerCase() === email &&
    normalizeMonth(t.month) === month
  )
  if (!matched.length) return null
  return matched.sort((a, b) => new Date(b.assigned_at || 0) - new Date(a.assigned_at || 0))[0]
}

function workingDaysSince(dateStr) {
  if (!dateStr) return 0
  const start = new Date(dateStr)
  if (isNaN(start)) return 0
  const now = new Date()
  let count = 0
  const cur = new Date(start)
  while (cur < now) {
    if (cur.getDay() !== 0) count++ // exclude Sundays
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function workingDaysLeft(month) {
  const [y, m] = (month || '').split('-').map(Number)
  if (!y || !m) return 0
  const now  = new Date()
  const last = new Date(y, m, 0)
  if (now > last) return 0
  let c = 0
  const d = new Date(now)
  while (d <= last) {
    if (d.getDay() !== 0) c++
    d.setDate(d.getDate() + 1)
  }
  return c
}
