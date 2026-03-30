import { useState, useEffect } from 'react'

/** Pulsing "Live · 30s" badge with a seconds-since-refresh counter. */
export default function LiveBadge({ lastUpdated }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])
  const sec = lastUpdated ? Math.floor((now - lastUpdated) / 1_000) : null
  return (
    <div className="flex items-center gap-2 text-xs select-none">
      <span className="flex items-center gap-1.5 font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Live · 30s
      </span>
      {sec !== null && (
        <span className="text-gray-400 hidden sm:inline">
          {sec < 5 ? 'Just refreshed' : `${sec}s ago`}
        </span>
      )}
    </div>
  )
}
