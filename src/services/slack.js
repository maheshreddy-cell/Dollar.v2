// Slack notifications via Vercel serverless proxy — fire-and-forget, never blocks UI

function send(payload) {
  fetch('/api/slack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => { /* silent — Slack failure must never break the app */ })
}

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN')
}

// ─── 1. Kicker Announced / Updated ──────────────────────────────────────────
export function notifyKickerAnnounced({ title, message, type, dateFrom, dateTo, targetRoles, slabs, announcerName, isEdit }) {
  const typeLabel = {
    team_sales: '👥 Team Sales', team_revenue: '👥 Team Revenue',
    individual_sales: '👤 Individual Sales', individual_revenue: '👤 Individual Revenue',
    individual_or: '⚡ Sales OR Revenue', individual_and: '🎯 Sales AND Revenue',
  }[type] || type

  const slabLines = (slabs || []).map((s, i) => {
    const parts = []
    if (s.target)        parts.push(`${s.target} sales`)
    if (s.targetRevenue) parts.push(fmt(s.targetRevenue))
    return `  Slab ${i + 1}: ${parts.join(' / ')} → ${fmt(s.payout)} payout`
  }).join('\n')

  const roles = (targetRoles || []).join(', ') || 'All roles'

  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: isEdit ? '✏️ Kicker Updated' : '⚡ New Kicker Announced!', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${title}*${message ? '\n' + message : ''}` } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Type:*\n${typeLabel}` },
        { type: 'mrkdwn', text: `*Period:*\n${dateFrom} → ${dateTo}` },
        { type: 'mrkdwn', text: `*Roles:*\n${roles}` },
        { type: 'mrkdwn', text: `*Slabs:*\n${slabLines || 'N/A'}` },
      ]},
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `${isEdit ? 'Updated' : 'Announced'} by ${announcerName}` },
      ]},
    ],
  })
}

// ─── 2. Target Assigned ─────────────────────────────────────────────────────
export function notifyTargetAssigned({ agentName, agentEmail, month, targetAmount, presetLabel, assignerName }) {
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🎯 Target Assigned', emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${agentName || agentEmail}` },
        { type: 'mrkdwn', text: `*Month:*\n${month}` },
        { type: 'mrkdwn', text: `*Target:*\n${fmt(targetAmount)}` },
        { type: 'mrkdwn', text: `*Preset:*\n${presetLabel || 'Custom'}` },
      ]},
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `Assigned by ${assignerName}` },
      ]},
    ],
  })
}

// ─── 3. Manager Target Assigned ─────────────────────────────────────────────
export function notifyManagerTargetAssigned({ managerName, managerEmail, month, program, projectedSlabs, personalContrib, assignerName }) {
  const topSlab = (projectedSlabs || []).reduce((max, s) => Number(s.targetAmount) > max ? Number(s.targetAmount) : max, 0)
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Manager Target Assigned', emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Manager:*\n${managerName || managerEmail}` },
        { type: 'mrkdwn', text: `*Month:*\n${month}` },
        { type: 'mrkdwn', text: `*Program:*\n${(program || 'all').toUpperCase()}` },
        { type: 'mrkdwn', text: `*Top Slab:*\n${fmt(topSlab)}` },
      ]},
      ...(personalContrib > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `💪 Personal contribution target: *${fmt(personalContrib)}*` } }] : []),
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `Assigned by ${assignerName}` },
      ]},
    ],
  })
}

// ─── 4. At-Risk Payments ────────────────────────────────────────────────────
export function notifyAtRiskPayments({ agentName, agentTeam, count, amount, deals }) {
  const dealLines = (deals || []).slice(0, 8).map(d => {
    const stage     = d.LoanDocsCollected || 'Pending'
    const tsv       = fmt(d.TotalValue   || 0)
    const paid      = fmt(d.PaidActual   || 0)
    return `• *${d.LeadName || 'Unknown'}* | TSV: ${tsv} | Paid: ${paid} | Stage: _${stage}_`
  }).join('\n')

  const teamLine = agentTeam ? ` • Team: ${agentTeam}` : ''

  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🚨 At-Risk Payments Alert', emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Agent:*\n${agentName}${teamLine}` },
        { type: 'mrkdwn', text: `*Deals Stuck:*\n${count} deal${count !== 1 ? 's' : ''} (3+ working days)` },
        { type: 'mrkdwn', text: `*Total at Risk:*\n${fmt(amount)}` },
      ]},
      ...(dealLines ? [{ type: 'section', text: { type: 'mrkdwn', text: dealLines } }] : []),
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `Auto-detected from dashboard • Dollar.v2` },
      ]},
    ],
  })
}

// ─── 5. New Team Member Invited ─────────────────────────────────────────────
export function notifyTeamMemberAdded({ name, email, role, managerName }) {
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '👋 New Team Member Invited', emoji: true } },
      { type: 'section', fields: [
        { type: 'mrkdwn', text: `*Name:*\n${name}` },
        { type: 'mrkdwn', text: `*Email:*\n${email}` },
        { type: 'mrkdwn', text: `*Role:*\n${role}` },
        { type: 'mrkdwn', text: `*Reports to:*\n${managerName}` },
      ]},
    ],
  })
}

// ─── 6. At-Risk Team Summary (Manager) ─────────────────────────────────────
export function notifyAtRiskTeamSummary({ managerName, month, agents }) {
  // agents = [{ name, count, amount, deals }]
  const totalCount  = agents.reduce((s, a) => s + a.count, 0)
  const totalAmount = agents.reduce((s, a) => s + a.amount, 0)
  if (totalCount === 0) return

  const lines = agents.map(a =>
    `• *${a.name}* — ${a.count} deal${a.count !== 1 ? 's' : ''} (${fmt(a.amount)})`
  ).join('\n')

  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🚨 Team At-Risk Summary', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${totalCount} deal${totalCount !== 1 ? 's' : ''}* at risk across team\nTotal: *${fmt(totalAmount)}* • Month: ${month}` } },
      { type: 'section', text: { type: 'mrkdwn', text: lines } },
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `Manager: ${managerName} • Auto-detected from dashboard` },
      ]},
    ],
  })
}

// ─── 7. Daily Summary (sent via cron) ──────────────────────────────────────
export function notifyDailySummary({ summaryText }) {
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '📊 Daily Summary — 11 AM Briefing', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: summaryText } },
      { type: 'context', elements: [
        { type: 'mrkdwn', text: `Auto-generated by Dollar.v2 • ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` },
      ]},
    ],
  })
}

// ─── 8. Kicker Earned ────────────────────────────────────────────────────────
export function notifyKickerEarned({ agentName, kickerTitle, amount, details, isTeam }) {
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: '🏆 Kicker Earned!', emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*${agentName}* is eligible for the *${kickerTitle}* kicker\n💰 Payout: *${fmt(amount)}*` } },
      ...(details ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: details }] }] : []),
    ],
  })
}

// ─── 9. Generic update (for future use) ─────────────────────────────────────
export function notifyUpdate({ title, message, footer }) {
  send({
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: message } },
      ...(footer ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: footer }] }] : []),
    ],
  })
}
