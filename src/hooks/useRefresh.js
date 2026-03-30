import { useState, useEffect } from 'react'
import { clearCache } from '../services/appsScript'

export const REFRESH_MS = 30_000

/**
 * Returns a `tick` counter that increments every 30s after clearing the cache.
 * Add `tick` to a useEffect dependency array to trigger live data refreshes.
 */
export function useRefresh() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      clearCache()
      setTick(t => t + 1)
    }, REFRESH_MS)
    return () => clearInterval(id)
  }, [])
  return tick
}
