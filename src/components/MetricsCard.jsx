export default function MetricsCard({ title, value, sub, icon: Icon, color = 'blue', trend, highlight = false }) {
  const palette = {
    blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-100 text-blue-600',     text: 'text-blue-700',   border: 'hover:border-blue-200' },
    green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600',   text: 'text-green-700',  border: 'hover:border-green-200' },
    orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', text: 'text-orange-700', border: 'hover:border-orange-200' },
    red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',       text: 'text-red-700',    border: 'hover:border-red-200' },
    purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', text: 'text-purple-700', border: 'hover:border-purple-200' },
  }
  const p = palette[color] ?? palette.blue

  return (
    <div
      className={`
        rounded-xl p-5 flex items-start gap-4 group
        transition-all duration-200 cursor-default
        hover:shadow-lg hover:scale-[1.018]
        ${highlight
          ? `${p.bg} border-2 border-purple-300 shadow-md ring-2 ring-purple-100 ${p.border}`
          : `${p.bg} border border-gray-100 ${p.border}`
        }
      `}
    >
      {Icon && (
        <div
          className={`
            rounded-lg flex items-center justify-center flex-shrink-0 ${p.icon}
            transition-transform duration-200 group-hover:scale-110
            ${highlight ? 'w-11 h-11' : 'w-10 h-10'}
          `}
        >
          <Icon size={highlight ? 22 : 20} />
        </div>
      )}
      <div className="min-w-0">
        <p className={`uppercase tracking-wide ${highlight ? 'text-xs font-semibold text-purple-600' : 'text-xs font-medium text-gray-500'}`}>
          {title}
        </p>
        <p className={`mt-0.5 ${p.text} ${highlight ? 'text-2xl font-extrabold' : 'text-xl font-bold'}`}>
          {value}
        </p>
        {highlight && (
          <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mt-0.5">
            Keep pushing — earn more
          </p>
        )}
        {sub && <p className="text-xs text-gray-500 mt-0.5 truncate">{sub}</p>}
        {trend !== undefined && (
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  )
}
