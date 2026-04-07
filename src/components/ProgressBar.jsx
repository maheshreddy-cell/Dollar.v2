export default function ProgressBar({ pct, color, height = 'h-2', showLabel = true }) {
  const clamped = Math.min(pct, 100)
  const barColor =
    color ??
    (pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-brand-500' : 'bg-orange-400')

  return (
    <div className="w-full">
      <div className={`w-full ios-progress-track ${height}`}>
        <div
          className={`${height} rounded-full transition-all duration-700 ease-out ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-[11px] text-ios-gray1 mt-1 text-right font-medium">
          {pct.toFixed(1)}% achieved
        </p>
      )}
    </div>
  )
}
