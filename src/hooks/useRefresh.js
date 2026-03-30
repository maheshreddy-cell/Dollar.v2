import { useState, useEffect } from 'react'
import { clearCache } from '../services/appsScript'

export const REFRESH_MS = 60_000

/**
 * Returns a `tick` counter that bumps every 60s.
 * Does NOT clear cache immediately — pages show stale data instantly,
 * then silently fetch fresh data in the background.
 * clearCache() is called right before the refetch so pages get fresh data
 * without a loading spinner.
 */
export function useRefresh() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      clearCache()          // clear so the next fetch goes to the network
      setTick(t => t + 1)  // trigger re-fetch in useEffect deps
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return tick
}
