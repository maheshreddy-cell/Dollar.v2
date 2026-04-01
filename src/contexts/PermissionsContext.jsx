import { createContext, useContext, useEffect, useState } from 'react'

// ── Permission definitions ────────────────────────────────────────────────────
// Each item: { key, label, desc, defaultOn? }
export const PERMISSION_DEFS = [
  {
    category: 'PreSales — Page Access',
    icon: '🟣',
    items: [
      { key: 'presales_metrics',   label: 'Metrics Page',      desc: 'PreSales members can view the Metrics page' },
      { key: 'presales_team',      label: 'My Team Page',      desc: 'PreSales members can view My Team page' },
      { key: 'presales_org',       label: 'Org Chart',         desc: 'PreSales members can view Org Chart' },
      { key: 'presales_targets',   label: 'My Targets',        desc: 'PreSales members can view My Targets page' },
    ],
  },
  {
    category: 'Agent — Page Access',
    icon: '🔵',
    items: [
      { key: 'agent_team',         label: 'My Team Page',      desc: 'Agents can view the My Team page' },
      { key: 'agent_org',          label: 'Org Chart',         desc: 'Agents can view the Org Chart' },
      { key: 'agent_targets',      label: 'My Targets',        desc: 'Agents can view the My Targets page' },
    ],
  },
  {
    category: 'Manager — Page Access',
    icon: '🟢',
    items: [
      { key: 'manager_commission', label: 'Commission Config', desc: 'Managers can access the Commission Config page' },
    ],
  },
  {
    category: 'Actions & Features',
    icon: '⚡',
    items: [
      { key: 'enable_reassignment',     label: 'Agent Reassignment',      desc: 'Admin / SalesHead / VH can shuffle agents between managers',    defaultOn: true },
      { key: 'manager_invite',          label: 'Manager Can Invite',       desc: 'Managers can invite new Agents and PreSales to their team',      defaultOn: true },
      { key: 'show_provisional',        label: 'Provisional Commission',   desc: 'Show amber "provisional" tag when manager hasn\'t hit Slab 1', defaultOn: true },
      { key: 'show_intelligence',       label: 'Earning Intelligence',     desc: 'Show daily rate, pace, and earn-more indicators on My Targets', defaultOn: true },
    ],
  },
]

// Build defaults map from definitions
const DEFAULTS = Object.fromEntries(
  PERMISSION_DEFS.flatMap(g => g.items).map(item => [item.key, item.defaultOn ?? false])
)

const STORAGE_KEY = 'dollarPermissions'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULTS
}

// ── Context ───────────────────────────────────────────────────────────────────
const PermissionsContext = createContext({
  permissions: DEFAULTS,
  can: () => false,
  setPermission: () => {},
  resetAll: () => {},
})

export function PermissionsProvider({ children }) {
  const [permissions, setPermissions] = useState(loadFromStorage)

  // Persist on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions)) } catch {}
  }, [permissions])

  function can(key) {
    return permissions[key] ?? DEFAULTS[key] ?? false
  }

  function setPermission(key, value) {
    setPermissions(prev => ({ ...prev, [key]: value }))
  }

  function resetAll() {
    setPermissions(DEFAULTS)
  }

  return (
    <PermissionsContext.Provider value={{ permissions, can, setPermission, resetAll }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
