import { useState, useRef, useEffect } from 'react'
import { Camera, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const DISMISSED_KEY = (email) => `dv2_photo_dismissed_${email}`

export default function ProfilePhotoPopup() {
  const { user, updatePhoto } = useAuth()
  const [visible,   setVisible]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!user?.email) return
    // Don't show if user already has a photo
    if (user.photoUrl) return
    // Don't show if already dismissed
    if (localStorage.getItem(DISMISSED_KEY(user.email))) return
    // Show after a short delay so it doesn't feel intrusive on first load
    const t = setTimeout(() => setVisible(true), 2500)
    return () => clearTimeout(t)
  }, [user?.email, user?.photoUrl])

  if (!visible) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY(user.email), '1')
    setVisible(false)
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await updatePhoto(file)
      setVisible(false) // photo uploaded — popup never shows again (photoUrl is now set)
    } catch {
      setUploading(false)
    }
    e.target.value = ''
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[340px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 animate-slide-up">
      <button
        onClick={dismiss}
        className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 transition-colors"
      >
        <X size={16} />
      </button>

      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
          <Camera size={24} className="text-brand-500" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">Add a profile photo</p>
          <p className="text-xs text-gray-500 mt-0.5">Help your teammates recognise you</p>
        </div>
      </div>

      <div className="flex gap-2 mt-4">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex-1 text-sm font-semibold bg-brand-600 text-white rounded-xl py-2 hover:bg-brand-700 transition-colors disabled:opacity-60"
        >
          {uploading ? 'Uploading…' : 'Upload Photo'}
        </button>
        <button
          onClick={dismiss}
          className="px-4 text-sm font-medium text-gray-500 hover:text-gray-700 rounded-xl border border-gray-200 py-2 hover:bg-gray-50 transition-colors"
        >
          Not Now
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
