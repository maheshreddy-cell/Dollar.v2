// Centralised role constants — import from here, never inline-define elsewhere.

export const MANAGER_ROLES = ['Admin', 'SalesHead', 'VH', 'Manager']
export const AGENT_ROLES   = ['Agent', 'PreSales']
export const ALL_ROLES     = [...MANAGER_ROLES, ...AGENT_ROLES]

export const isManagerRole = (role) => MANAGER_ROLES.includes(role)
export const isAgentRole   = (role) => AGENT_ROLES.includes(role)

export const ROLE_COLORS = {
  Admin:     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  SalesHead: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  VH:        'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  Manager:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  Agent:     'bg-gray-100 dark:bg-surface-muted text-gray-700 dark:text-gray-300',
  PreSales:  'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
}
