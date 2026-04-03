import { createContext, useContext, useEffect, useState } from 'react'

// ── Full permission definitions ───────────────────────────────────────────────
export const PERMISSION_DEFS = [
  {
    category: 'PreSales — Page Access',
    icon: '🟣',
    items: [
      { key: 'presales_dashboard',      label: 'Dashboard',             desc: 'PreSales can view the Dashboard',                                defaultOn: true  },
      { key: 'presales_deals',          label: 'Deals',                 desc: 'PreSales can access the Deals page',                             defaultOn: true  },
      { key: 'presales_metrics',        label: 'Metrics',               desc: 'PreSales can view the Metrics page',                             defaultOn: false },
      { key: 'presales_team',           label: 'My Team',               desc: 'PreSales can view the My Team page',                             defaultOn: false },
      { key: 'presales_org',            label: 'Org Chart',             desc: 'PreSales can view the Org Chart',                                defaultOn: false },
      { key: 'presales_targets',        label: 'My Targets',            desc: 'PreSales can view the My Targets page',                          defaultOn: false },
      { key: 'presales_assign',         label: 'Assign Targets',        desc: 'PreSales can access the Assign Targets page',                    defaultOn: false },
      { key: 'presales_commission',     label: 'Commission Config',     desc: 'PreSales can access Commission Config',                          defaultOn: false },
      { key: 'presales_kickers',        label: 'Kickers',               desc: 'PreSales can view the Kickers page',                             defaultOn: true  },
    ],
  },
  {
    category: 'Agent — Page Access',
    icon: '🔵',
    items: [
      { key: 'agent_dashboard',         label: 'Dashboard',             desc: 'Agents can view the Dashboard',                                  defaultOn: true  },
      { key: 'agent_deals',             label: 'Deals',                 desc: 'Agents can access the Deals page',                               defaultOn: true  },
      { key: 'agent_team',              label: 'My Team',               desc: 'Agents can view the My Team page',                               defaultOn: false },
      { key: 'agent_org',               label: 'Org Chart',             desc: 'Agents can view the Org Chart',                                  defaultOn: false },
      { key: 'agent_targets',           label: 'My Targets',            desc: 'Agents can view the My Targets page',                            defaultOn: false },
      { key: 'agent_assign',            label: 'Assign Targets',        desc: 'Agents can access the Assign Targets page',                      defaultOn: false },
      { key: 'agent_commission',        label: 'Commission Config',     desc: 'Agents can access Commission Config',                            defaultOn: false },
      { key: 'agent_kickers',           label: 'Kickers',               desc: 'Agents can view the Kickers page',                               defaultOn: true  },
    ],
  },
  {
    category: 'Manager — Page Access',
    icon: '🟢',
    items: [
      { key: 'manager_dashboard',       label: 'Dashboard',             desc: 'Managers can view the Dashboard',                                defaultOn: true  },
      { key: 'manager_deals',           label: 'Deals',                 desc: 'Managers can access the Deals page',                             defaultOn: true  },
      { key: 'manager_metrics',         label: 'Metrics',               desc: 'Managers can view the Metrics page',                             defaultOn: true  },
      { key: 'manager_team',            label: 'My Team',               desc: 'Managers can access the My Team page',                           defaultOn: true  },
      { key: 'manager_assign',          label: 'Assign Targets',        desc: 'Managers can access the Assign Targets page',                    defaultOn: true  },
      { key: 'manager_org',             label: 'Org Chart',             desc: 'Managers can view the Org Chart',                                defaultOn: true  },
      { key: 'manager_commission',      label: 'Commission Config',     desc: 'Managers can access the Commission Config page',                 defaultOn: false },
      { key: 'manager_kickers',         label: 'Kickers',               desc: 'Managers can view the Kickers page',                             defaultOn: true  },
      { key: 'manager_announce_kicker', label: 'Announce Kicker',       desc: 'Managers can announce kickers to their agents',                  defaultOn: true  },
    ],
  },
  {
    category: 'VH — Page Access',
    icon: '🔷',
    items: [
      { key: 'vh_dashboard',            label: 'Dashboard',             desc: 'VH can view the Dashboard',                                      defaultOn: true  },
      { key: 'vh_my_targets',           label: 'My Targets',            desc: 'VH can see their own My Targets (from SalesHead assignments)',    defaultOn: false },
      { key: 'vh_kickers',              label: 'Kickers',               desc: 'VH can view the Kickers page',                                   defaultOn: true  },
      { key: 'vh_announce_kicker',      label: 'Announce Kicker',       desc: 'VH can announce kickers to managers and agents',                 defaultOn: true  },
    ],
  },
  {
    category: 'SalesHead — Page Access',
    icon: '🟡',
    items: [
      { key: 'saleshead_dashboard',     label: 'Dashboard',             desc: 'SalesHead can view the Dashboard',                               defaultOn: true  },
      { key: 'saleshead_my_targets',    label: 'My Targets',            desc: 'SalesHead can see their own My Targets (from Admin assignments)', defaultOn: false },
      { key: 'saleshead_kickers',       label: 'Kickers',               desc: 'SalesHead can view the Kickers page',                            defaultOn: true  },
      { key: 'saleshead_announce_kicker', label: 'Announce Kicker',     desc: 'SalesHead can announce kickers to VHs, managers and agents',     defaultOn: true  },
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
