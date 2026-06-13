import { useEffect, useState } from 'react'
import { onCacheUpdate } from '../services/supabase'

export const REFRESH_MS = 60_000   // 60 seconds between periodic refreshes

/**
 * Returns a tick counter.
 * tick === 0  → initial load (show spinner)
 * tick  >  0  → background refresh (show stale data, update silently)
 *
 * Ticks on two events:
 *  1. Every 60s (periodic poll)
 *  2. Whenever a background fetch in supabase.js completes with fresh data
 *     — so pages re-render immediately when new data arrives from Supabase.
 */
export function useRefresh() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    // Periodic interval
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS)
    // Instant re-render when background fetch resolves
    const unsub = onCacheUpdate(() => setTick(t => t + 1))
    return () => { clearInterval(id); unsub() }
  }, [])
  return tick
}
