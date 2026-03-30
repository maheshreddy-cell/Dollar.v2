import { useEffect, useState } from 'react'

// 10 calm mountain/forest Unsplash photo IDs — picked daily in rotation
const PHOTO_IDS = [
  '1464822759023-fed107ef2306', // misty mountains
  '1506905925346-21bda4d32df4', // snowy alps
  '1469474968028-56623f02e42e', // mountain valley
  '1472396961693-142e6e269027', // mountain lake
  '1518495973542-4542adad0200', // forest path
  '1511497584788-876760111969', // misty forest
  '1481959173048-3c72d89dae09', // mountain peak
  '1500534314209-a5f2a09b14e0', // alpine meadow
  '1505765050516-f72a826db16a', // forest mist
  '1519681393784-d120267933ba', // night mountains
]

function getDayOfYear() {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now - start
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export function useBackground() {
  const [bgUrl, setBgUrl] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const dateStr = new Date().toDateString()
    const cacheKey = `bg_${dateStr}`
    const cached = sessionStorage.getItem(cacheKey)

    if (cached) {
      setBgUrl(cached)
      setLoaded(true)
      return
    }

    const idx = getDayOfYear() % PHOTO_IDS.length
    const url = `https://images.unsplash.com/photo-${PHOTO_IDS[idx]}?w=1920&q=60&auto=format&fit=crop`

    // Preload image before setting (avoids flash)
    const img = new Image()
    img.onload = () => {
      sessionStorage.setItem(cacheKey, url)
      setBgUrl(url)
      setLoaded(true)
    }
    img.onerror = () => {
      // Fallback to gradient if image fails
      setLoaded(true)
    }
    img.src = url
  }, [])

  if (!bgUrl || !loaded) return null

  return {
    backgroundImage: `url(${bgUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed',
  }
}
