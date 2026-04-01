import { createContext, useContext, useEffect, useState } from 'react'

// ── Full permission definitions ───────────────────────────────────────────────
export const PERMISSION_DEFS = [
  {
    category: 'PreSales — Page Access',
    icon: '🟣',
    items: [
      { key: 'presales_metrics',        label: 'Metrics Page',          desc: 'PreSales can view the Metrics page' },
      { key: 'presales_team',           label: 'My Team',               desc: 'PreSales can view the My Team page' },
      { key: 'presales_org',            label: 'Org Chart',             desc: 'PreSales can view the Org Chart' },
      { key: 'presales_targets',        label: 'My Targets',            desc: 'PreSales can view the My Targets page' },
      { key: 'presales_assign',         label: 'Assign Targets',        desc: 'PreSales can access the Assign Targets page' },
      { key: 'presales_commission',     label: 'Commission Config',     desc: 'PreSales can access Commission Config' },
    ],
  },
  {
    category: 'Agent — Page Access',
    icon: '🔵',
    items: [
      { key: 'agent_team',              label: 'My Team',               desc: 'Agents can view the My Team page' },
      { key: 'agent_org',               label: 'Org Chart',             desc: 'Agents can view the Org Chart' },
      { key: 'agent_targets',           label: 'My Targets',            desc: 'Agents can view the My Targets page' },
      { key: 'agent_assign',            label: 'Assign Targets',        desc: 'Agents can access the Assign Targets page' },
      { key: 'agent_commission',        label: 'Commission Config',     desc: 'Agents can access Commission Config' },
    ],
  },
  {
    category: 'Manager — Page Access',
    icon: '🟢',
    items: [
      { key: 'manager_commission',      label: 'Commission Config',     desc: 'Managers can access the Commission Config page' },
      { key: 'manager_org_visible',     label: 'Org Chart',             desc: 'Managers can view the full Org Chart (already enabled by default)' },
    ],
  },
  {
    category: 'VH — Page Access',
    icon: '🔷',
    items: [
      { key: 'vh_my_targets',           label: 'My Targets Page',       desc: 'VH can see their own My Targets (from SalesHead assignments)', defaultOn: false },
    ],
  },
  {
    category: 'SalesHead — Page Access',
    icon: '🟡',
    items: [
      { key: 'saleshead_my_targets',    label: 'My Targets Page',       desc: 'SalesHead can see their own My Targets (from Admin assignments)', defaultOn: false },
    ],
  },
  {
    category: 'Actions & Features',
    icon: '⚡',
    items: [
      { key: 'enable_reassignment',     label: 'Agent Reassignment',    desc: 'Admin / SalesHead / VH can shuffle agents between managers',          defaultOn: true  },
      { key: 'manager_invite',          label: 'Manager Can Invite',    desc: 'Managers can invite new Agents and PreSales to their team',            defaultOn: true  },
      { key: 'show_provisional',        label: 'Provisional Commission',desc: 'Show amber "provisional" label when manager hasn\'t hit Slab 1',      defaultOn: true  },
      { key: 'show_intelligence',       label: 'Earning Intelligence',  desc: 'Show daily rate, pace, earn-more indicators on My Targets',            defaultOn: true  },
      { key: 'kickers_enabled',         label: 'Kickers Feature',       desc: 'Enable the Kickers tab and incentive system for everyone',             defaultOn: true  },
      { key: 'kickers_show_progress',   label: 'Kicker Progress Bars',  desc: 'Show live progress bars and nudges on kicker cards',                   defaultOn: true  },
      { key: 'agents_see_team_deals',   label: 'Agents See Team Deals', desc: 'Agents can view deals beyond their own (requires Deals page access)',  defaultOn: false },
      { key: 'managers_see_full_org',   label: 'Managers See Full Org', desc: 'Managers can see the entire org chart beyond their team',              defaultOn: false },
    ],
  },
]

// Build defaults map: defaultOn ?? false for each item
const DEFAULTS = Object.fromEntries(
  PERMISSION_DEFS.flatMap(g => g.items).map(item => [item.key, item.defaultOn ?? false])
)

const STORAGE_KEY = 'dollarPermissions'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULTS }
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

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(permissions)) } catch {}
  }, [permissions])

  function can(key) { return permissions[key] ?? DEFAULTS[key] ?? false }
  function setPermission(key, value) { setPermissions(prev => ({ ...prev, [key]: value })) }
  function resetAll() { setPermissions({ ...DEFAULTS }) }

  return (
    <PermissionsContext.Provider value={{ permissions, can, setPermission, resetAll }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() { return useContext(PermissionsContext) }
