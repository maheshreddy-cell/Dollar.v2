import { useEffect, useRef } from 'react'

/**
 * Plays /notification.wav whenever `value` increases (or turns truthy).
 *
 * @param {number|boolean} value
 *   - number  → plays each time count goes UP  (e.g. atRiskCount)
 *   - boolean → plays each time it flips to true (e.g. success flag)
 *
 * @param {{ playOnMount?: boolean }} options
 *   playOnMount: also play immediately on the FIRST render when value is truthy.
 *   Use this for "daily briefing" alerts — things you need to hear the moment
 *   the page first loads with data (at-risk deals, target assigned, etc.)
 *
 * Silently swallowed if the browser blocks auto-play.
 */
export function useNotificationSound(value, { playOnMount = false } = {}) {
  const prevRef  = useRef(null)   // null = not yet initialised
  const audioRef = useRef(null)

  // Lazily create one Audio instance per hook call
  if (!audioRef.current && typeof window !== 'undefined') {
    audioRef.current = new Audio('/notification.wav')
    audioRef.current.volume = 0.7
  }

  useEffect(() => {
    // Normalise: boolean → 0/1, undefined/null → 0
    const num = typeof value === 'boolean' ? (value ? 1 : 0) : (value ?? 0)

    if (prevRef.current === null) {
      // Very first render — optionally play right away
      if (playOnMount && num > 0) {
        audioRef.current?.play().catch(() => {})
      }
      prevRef.current = num
      return
    }

    // Play whenever value goes up (new count or flag turning true)
    if (num > prevRef.current) {
      audioRef.current?.play().catch(() => {})
    }

    prevRef.current = num
  }, [value, playOnMount])
}
