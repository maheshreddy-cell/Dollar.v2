import { useEffect, useState } from 'react'

export const REFRESH_MS = 60_000   // 60 seconds between background refreshes

/**
 * Returns a tick counter.
 * tick === 0  → initial load (show spinner)
 * tick  >  0  → background refresh (show stale data, update silently)
 *
 * Pages should:
 *   if (tick === 0) setLoading(true)   // spinner only on first load
 *   // on subsequent ticks: just re-fetch, leave existing data visible
 */
export function useRefresh() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return tick
}
