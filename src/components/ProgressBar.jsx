export default function ProgressBar({ pct, color, height = 'h-3', showLabel = true }) {
  const clamped = Math.min(pct, 100)
  const barColor =
    color ??
    (pct >= 100 ? 'bg-green-500' : pct >= 50 ? 'bg-blue-500' : 'bg-orange-400')

  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 rounded-full ${height} overflow-hidden`}>
        <div
          className={`${height} rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-gray-500 mt-1 text-right">{pct.toFixed(1)}% achieved</p>
      )}
    </div>
  )
}
