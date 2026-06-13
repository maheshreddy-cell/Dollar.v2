// In-memory + sessionStorage notification system
// Notifications are ephemeral — cleared on page close. Bell badge clears on click.
// Each notification is scoped to a user via `forUser` (email) — '*' = broadcast to all.

const STORAGE_KEY = 'dv3_notifications'
const READ_KEY    = 'dv3_notif_read_ts'

function load() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]') }
  catch { return [] }
}

function save(items) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-100))) // keep last 100
}

export function addNotification({ type, title, body, icon, link, forUser }) {
  const items = load()
  items.push({
    id: Date.now() + Math.random(),
    type, title, body, icon, link,
    forUser: (forUser || '*').trim().toLowerCase(),
    ts: Date.now(),
  })
  save(items)
}

export function getNotifications(userEmail) {
  const email = (userEmail || '').trim().toLowerCase()
  return load()
    .filter(n => n.forUser === '*' || n.forUser === email)
    .sort((a, b) => b.ts - a.ts)
}

export function getUnreadCount(userEmail) {
  const email = (userEmail || '').trim().toLowerCase()
  const readTs = Number(sessionStorage.getItem(READ_KEY) || 0)
  return load().filter(n =>
    (n.forUser === '*' || n.forUser === email) && n.ts > readTs
  ).length
}

export function markAllRead() {
  sessionStorage.setItem(READ_KEY, String(Date.now()))
}

// ── Convenience: push from action points ────────────────────────────────────

export function notifTargetAssigned({ agentName, agentEmail, month, targetAmount, assignerEmail }) {
  // Notify the agent
  addNotification({
    type: 'target',
    icon: '🎯',
    title: 'Target Assigned',
    body: `₹${Number(targetAmount || 0).toLocaleString('en-IN')} for ${month}`,
    link: '/manager-targets',
    forUser: agentEmail,
  })
  // Also notify the assigner (manager)
  if (assignerEmail && assignerEmail !== agentEmail) {
    addNotification({
      type: 'target',
      icon: '🎯',
      title: 'Target Assigned',
      body: `${agentName} — ₹${Number(targetAmount || 0).toLocaleString('en-IN')} for ${month}`,
      link: '/assign-targets',
      forUser: assignerEmail,
    })
  }
}

export function notifManagerTargetAssigned({ managerName, managerEmail, month, program, assignerEmail }) {
  addNotification({
    type: 'target',
    icon: '📊',
    title: 'Manager Target Assigned',
    body: `${(program || 'All').toUpperCase()} for ${month}`,
    link: '/manager-targets',
    forUser: managerEmail,
  })
  if (assignerEmail && assignerEmail !== managerEmail) {
    addNotification({
      type: 'target',
      icon: '📊',
      title: 'Manager Target Assigned',
      body: `${managerName} — ${(program || 'All').toUpperCase()} for ${month}`,
      link: '/assign-targets',
      forUser: assignerEmail,
    })
  }
}

export function notifKickerAnnounced({ title, isEdit }) {
  // Kickers are broadcast — everyone should see them
  addNotification({
    type: 'kicker',
    icon: '⚡',
    title: isEdit ? 'Kicker Updated' : 'New Kicker Announced',
    body: title,
    link: '/kickers',
    forUser: '*',
  })
}

export function notifAtRisk({ agentName, agentEmail, count, amount, forUser }) {
  addNotification({
    type: 'at_risk',
    icon: '🚨',
    title: 'At-Risk Payments',
    body: `${agentName} — ${count} deal${count !== 1 ? 's' : ''} worth ₹${Number(amount || 0).toLocaleString('en-IN')} stuck 3+ days`,
    link: '/deals',
    forUser: forUser || agentEmail || '*',
  })
}

export function notifAtRiskTeamSummary({ managerEmail, totalCount, totalAmount, agents }) {
  const agentLines = (agents || []).map(a => `${a.name}: ${a.count} deals (₹${Number(a.amount||0).toLocaleString('en-IN')})`).join(', ')
  addNotification({
    type: 'at_risk',
    icon: '🚨',
    title: 'Team At-Risk Summary',
    body: `${totalCount} deal${totalCount !== 1 ? 's' : ''} worth ₹${Number(totalAmount||0).toLocaleString('en-IN')} at risk — ${agentLines}`,
    link: '/deals',
    forUser: managerEmail,
  })
}

export function notifTeamMemberAdded({ name, role, forUser }) {
  addNotification({
    type: 'team',
    icon: '👋',
    title: 'New Team Member Invited',
    body: `${name} (${role})`,
    link: '/team',
    forUser: forUser || '*',
  })
}
