const PALETTE = {
  blue:   { bg: 'bg-blue-50',   icon: 'bg-blue-500',    text: 'text-blue-600',   ring: 'ring-blue-100'   },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-500',   text: 'text-green-600',  ring: 'ring-green-100'  },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-500',  text: 'text-orange-600', ring: 'ring-orange-100' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-500',     text: 'text-red-600',    ring: 'ring-red-100'    },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-500',  text: 'text-purple-600', ring: 'ring-purple-100' },
  indigo: { bg: 'bg-indigo-50', icon: 'bg-indigo-500',  text: 'text-indigo-600', ring: 'ring-indigo-100' },
}

export default function MetricsCard({
  title, value, sub,
  icon: Icon,
  color = 'blue',
  trend,
  highlight = false,
  onClick,
}) {
  const p = PALETTE[color] ?? PALETTE.blue

  return (
    <div className={[
      'ios-card p-5 flex items-start gap-4 group relative',
      'transition-all duration-200',
      onClick ? 'cursor-pointer hover:shadow-ios-md hover:-translate-y-0.5 active:scale-[0.98]' : 'cursor-default hover:shadow-ios-md hover:-translate-y-0.5',
      highlight ? `ring-2 ${p.ring}` : '',
    ].join(' ')}
    onClick={onClick}
    >

      {Icon && (
        <div className={[
          'w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0',
          'transition-transform duration-200 group-hover:scale-105',
          p.icon,
        ].join(' ')}>
          <Icon size={18} className="text-white" strokeWidth={1.8} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="ios-label mb-0.5">{title}</p>

        <p className={`text-[22px] font-semibold tracking-ios-tight leading-tight ${p.text}`}>
          {value}
        </p>

        {highlight && (
          <p className="text-[10px] font-semibold text-purple-400 uppercase tracking-wider mt-0.5">
            Your earnings this month
          </p>
        )}

        {sub && (
          <p className="text-[12px] text-ios-gray1 mt-0.5 truncate">{sub}</p>
        )}

        {trend !== undefined && (
          <span className={`text-xs font-semibold mt-1 inline-block px-1.5 py-0.5 rounded-md ${
            trend >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          }`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}

        {onClick && (
          <p className="text-[10px] text-gray-400 mt-1.5 group-hover:text-gray-500 transition-colors">
            Tap to see details →
          </p>
        )}
      </div>
    </div>
  )
}
