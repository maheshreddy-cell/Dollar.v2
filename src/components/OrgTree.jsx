import { useState } from 'react'
import { ChevronRight, ChevronDown, User } from 'lucide-react'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-700',
}

function OrgNode({ node, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2)
  const hasChildren = node.children && node.children.length > 0

  return (
    <div className={`${depth > 0 ? 'ml-6 border-l border-gray-200 pl-4' : ''}`}>
      <div
        className="flex items-center gap-2 py-2 group cursor-pointer select-none"
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        <span className="flex-shrink-0 text-gray-400">
          {hasChildren ? (
            open ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <User size={16} className="opacity-30" />
          )}
        </span>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">{node.name}</span>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              ROLE_COLORS[node.role] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {node.role}
          </span>
          <span className="text-xs text-gray-400">{node.email}</span>
        </div>
      </div>

      {open && hasChildren && (
        <div>
          {node.children.map((child) => (
            <OrgNode key={child.email ?? child._id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrgTree({ data }) {
  if (!data) return <div className="text-gray-400 text-sm py-8 text-center">No data.</div>

  const roots = Array.isArray(data) ? data : [data]

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {roots.map((node) => (
        <OrgNode key={node.email ?? node._id} node={node} depth={0} />
      ))}
    </div>
  )
}
