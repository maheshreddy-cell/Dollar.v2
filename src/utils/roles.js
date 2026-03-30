// Centralised role constants — import from here, never inline-define elsewhere.

export const MANAGER_ROLES = ['Admin', 'SalesHead', 'VH', 'Manager']
export const AGENT_ROLES   = ['Agent', 'PreSales']
export const ALL_ROLES     = [...MANAGER_ROLES, ...AGENT_ROLES]

export const isManagerRole = (role) => MANAGER_ROLES.includes(role)
export const isAgentRole   = (role) => AGENT_ROLES.includes(role)

export const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
  PreSales:  'bg-teal-100 text-teal-700',
}
