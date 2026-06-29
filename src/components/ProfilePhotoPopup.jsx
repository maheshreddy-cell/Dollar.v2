import { useState, useRef, useEffect } from 'react'
import { Camera, Upload } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export default function ProfilePhotoPopup() {
  const { user, updatePhoto } = useAuth()
  const [visible,   setVisible]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef   = useRef(null)
  const cameraRef = useRef(null)

  useEffect(() => {
    if (!user?.email) return
    if (user.photoUrl) { setVisible(false); return }
    const t = setTimeout(() => setVisible(true), 1500)
    return () => clearTimeout(t)
  }, [user?.email, user?.photoUrl])

  if (!visible) return null

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await updatePhoto(file)
      setVisible(false)
    } catch {
      setUploading(false)
    }
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-2xl w-[340px] p-8 flex flex-col items-center text-center animate-ios-spring">

        {/* Avatar placeholder */}
        <div className="w-20 h-20 rounded-full bg-brand-50 border-4 border-brand-100 flex items-center justify-center mb-4">
          <Camera size={32} className="text-brand-400" />
        </div>

        <p className="text-lg font-bold text-gray-900">Add a profile photo</p>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Your teammates can't recognise you without one. Upload a photo to continue.
        </p>

        <div className="flex gap-3 w-full">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white rounded-xl py-3 hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            <Upload size={15} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold bg-gray-900 text-white rounded-xl py-3 hover:bg-gray-800 transition-colors disabled:opacity-60"
          >
            <Camera size={15} /> Camera
          </button>
        </div>

        <input ref={fileRef}   type="file" accept="image/*"               className="hidden" onChange={handleFile} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}
