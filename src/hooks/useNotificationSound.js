import { useEffect, useRef } from 'react'

/**
 * Plays /notification.wav whenever `count` increases.
 *
 * - Skips the very first render (no sound on initial page load)
 * - Only plays when the value goes UP (new notifications arrived)
 * - Silently swallowed if the browser blocks auto-play
 *
 * Usage:
 *   useNotificationSound(summary?.atRiskCount ?? 0)
 */
export function useNotificationSound(count) {
  const prevRef     = useRef(null)   // null = "not yet initialised"
  const audioRef    = useRef(null)

  // Lazily create the Audio object once
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new Audio('/notification.wav')
    audioRef.current.volume = 0.7
  }

  useEffect(() => {
    // First time we receive a real count — just record it, don't play
    if (prevRef.current === null) {
      prevRef.current = count
      return
    }

    // Play only when count goes up (new notifications)
    if (count > prevRef.current) {
      audioRef.current?.play().catch(() => { /* browser auto-play blocked */ })
    }

    prevRef.current = count
  }, [count])
}
