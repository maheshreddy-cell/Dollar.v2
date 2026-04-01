import { Shield, RotateCcw, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { PERMISSION_DEFS, usePermissions } from '../contexts/PermissionsContext'

// ── Toggle switch component ───────────────────────────────────────────────────
function Toggle({ on, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-checked={on}
      role="switch"
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
        on ? 'bg-brand-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          on ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Permissions() {
  const { permissions, setPermission, resetAll } = usePermissions()
  const [showReset, setShowReset] = useState(false)
  const [justSaved, setJustSaved]   = useState(null)

  function handleToggle(key, val) {
    setPermission(key, val)
    setJustSaved(key)
    setTimeout(() => setJustSaved(null), 1500)
  }

  function handleReset() {
    resetAll()
    setShowReset(false)
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
            <Shield size={18} className="text-brand-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">Permissions & Access Control</h2>
            <p className="text-xs text-gray-400 mt-0.5">Toggle features on/off for each role. Changes take effect immediately.</p>
          </div>
        </div>
        {showReset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Reset all to defaults?</span>
            <button onClick={handleReset} className="text-xs font-semibold text-red-600 hover:underline">Confirm Reset</button>
            <button onClick={() => setShowReset(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            <RotateCcw size={12} />
            Reset to defaults
          </button>
        )}
      </div>

      {/* Storage note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
        ℹ️ Permissions are saved on this device. All role-based restrictions apply instantly across the app.
      </div>

      {/* Permission groups */}
      {PERMISSION_DEFS.map(group => (
        <div key={group.category} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          {/* Group header */}
          <div className="px-5 py-3.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <span className="text-base leading-none">{group.icon}</span>
            <p className="text-xs font-bold uppercase tracking-wider text-gray-600">{group.category}</p>
          </div>

          {/* Items */}
          <div className="divide-y divide-gray-50">
            {group.items.map(item => {
              const on = permissions[item.key] ?? false
              const saved = justSaved === item.key
              return (
                <div
                  key={item.key}
                  className={`px-5 py-4 flex items-center justify-between gap-4 transition-colors ${saved ? 'bg-green-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{item.label}</p>
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                      }`}>
                        {on ? 'ON' : 'OFF'}
                      </span>
                      {saved && (
                        <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold">
                          <CheckCircle size={10} /> Saved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                  </div>
                  <Toggle on={on} onChange={val => handleToggle(item.key, val)} />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {/* Quick summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Current Access Summary</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {PERMISSION_DEFS.flatMap(g => g.items).map(item => (
            <div key={item.key} className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${permissions[item.key] ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className={`truncate ${permissions[item.key] ? 'text-gray-700' : 'text-gray-400'}`}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
