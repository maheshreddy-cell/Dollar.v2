import { Shield, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { PERMISSION_DEFS, usePermissions } from '../contexts/PermissionsContext'

// ── Toggle ────────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-checked={on}
      role="switch"
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
        on ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${on ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

// Role color map
const ROLE_STYLES = {
  'PreSales':  { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', dot: 'bg-purple-400' },
  'Agent':     { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-400'   },
  'Manager':   { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-700',   dot: 'bg-green-400'  },
  'VH':        { bg: 'bg-sky-50',    border: 'border-sky-200',    badge: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-400'    },
  'SalesHead': { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-400'  },
  'Actions':   { bg: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-100 text-gray-600',     dot: 'bg-gray-400'   },
}

function roleKey(category) {
  if (category.startsWith('PreSales')) return 'PreSales'
  if (category.startsWith('Agent'))    return 'Agent'
  if (category.startsWith('Manager'))  return 'Manager'
  if (category.startsWith('VH'))       return 'VH'
  if (category.startsWith('SalesHead'))return 'SalesHead'
  return 'Actions'
}

// ── Permission Group Card ─────────────────────────────────────────────────────
function PermCard({ group, permissions, onToggle, justSaved }) {
  const [collapsed, setCollapsed] = useState(false)
  const rk    = roleKey(group.category)
  const style = ROLE_STYLES[rk] ?? ROLE_STYLES.Actions
  const keys  = group.items.map(i => i.key)
  const onCount = keys.filter(k => permissions[k]).length
  const total   = keys.length

  function enableAll()  { keys.forEach(k => onToggle(k, true))  }
  function disableAll() { keys.forEach(k => onToggle(k, false)) }

  const allOn  = onCount === total
  const allOff = onCount === 0

  return (
    <div className={`rounded-2xl border ${style.border} overflow-hidden`}>
      {/* Card header */}
      <div className={`${style.bg} px-5 py-3.5 flex items-center justify-between gap-3`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-lg leading-none">{group.icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-800 leading-tight">{group.category}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              <span className={`font-semibold ${onCount > 0 ? 'text-brand-600' : 'text-gray-400'}`}>{onCount}</span>
              <span className="text-gray-300"> / </span>{total} enabled
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {!allOn && (
            <button onClick={enableAll}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-transparent transition-colors ${style.badge} hover:opacity-80`}>
              Enable All
            </button>
          )}
          {!allOff && (
            <button onClick={disableAll}
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 bg-white hover:bg-gray-50 transition-colors">
              Disable All
            </button>
          )}
          <button onClick={() => setCollapsed(v => !v)} className="text-gray-400 hover:text-gray-600 ml-1 transition-colors">
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>
      </div>

      {/* Items */}
      {!collapsed && (
        <div className="divide-y divide-gray-100 bg-white">
          {group.items.map(item => {
            const on   = permissions[item.key] ?? false
            const saved = justSaved === item.key
            return (
              <div key={item.key}
                className={`flex items-center gap-4 px-5 py-3 transition-colors ${saved ? 'bg-green-50' : 'hover:bg-gray-50/60'}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${on ? style.dot : 'bg-gray-300'}`} />
                    <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                    {saved && (
                      <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">Saved</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pl-3.5 leading-relaxed">{item.desc}</p>
                </div>
                <Toggle on={on} onChange={v => onToggle(item.key, v)} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Permissions() {
  const { permissions, setPermission, resetAll } = usePermissions()
  const [showReset, setShowReset] = useState(false)
  const [justSaved, setJustSaved] = useState(null)

  function handleToggle(key, val) {
    setPermission(key, val)
    setJustSaved(key)
    setTimeout(() => setJustSaved(null), 1500)
  }

  const pageGroups   = PERMISSION_DEFS.filter(g => !g.category.startsWith('Actions'))
  const actionGroups = PERMISSION_DEFS.filter(g =>  g.category.startsWith('Actions'))
  const allItems     = PERMISSION_DEFS.flatMap(g => g.items)
  const totalOn      = allItems.filter(i => permissions[i.key]).length

  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Shield size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Permissions & Access Control</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {totalOn} of {allItems.length} permissions enabled · Changes apply instantly
            </p>
          </div>
        </div>

        {showReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Reset all to defaults?</span>
            <button onClick={() => { resetAll(); setShowReset(false) }}
              className="text-xs font-semibold text-red-600 hover:underline">Confirm Reset</button>
            <button onClick={() => setShowReset(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors">
            <RotateCcw size={12} /> Reset to defaults
          </button>
        )}
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
        ℹ️ Permissions are saved on this device. Use <strong>Enable All / Disable All</strong> per role for quick bulk changes,
        or toggle individual items. All changes take effect immediately across the app.
      </div>

      {/* Page Access */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">Page Access — by Role</p>
        <div className="space-y-3">
          {pageGroups.map(group => (
            <PermCard key={group.category} group={group} permissions={permissions} onToggle={handleToggle} justSaved={justSaved} />
          ))}
        </div>
      </div>

      {/* Actions & Features */}
      {actionGroups.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-3 px-1">Actions & Features</p>
          <div className="space-y-3">
            {actionGroups.map(group => (
              <PermCard key={group.category} group={group} permissions={permissions} onToggle={handleToggle} justSaved={justSaved} />
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
