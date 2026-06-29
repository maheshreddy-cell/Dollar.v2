import { useState, useRef, useEffect } from 'react'
import { X, Camera, Upload, Trash2, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const ROLE_COLORS = {
  Admin:     'bg-red-100 text-red-700',
  SalesHead: 'bg-purple-100 text-purple-700',
  VH:        'bg-blue-100 text-blue-700',
  Manager:   'bg-green-100 text-green-700',
  Agent:     'bg-gray-100 text-gray-600',
  PreSales:  'bg-teal-100 text-teal-700',
}

export default function ProfileModal({ onClose }) {
  const { user, updatePhoto, removePhoto, saveBio } = useAuth()
  const fileRef   = useRef(null)
  const cameraRef = useRef(null)
  const overlayRef = useRef(null)

  const [bio,        setBio]        = useState(user?.bio || '')
  const [uploading,  setUploading]  = useState(false)
  const [removing,   setRemoving]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  // Click outside to close
  useEffect(() => {
    const handler = (e) => { if (e.target === overlayRef.current) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try { await updatePhoto(file) } catch (err) { console.error(err) }
    setUploading(false)
    e.target.value = ''
  }

  const handleRemove = async () => {
    setRemoving(true)
    try { await removePhoto() } catch (err) { console.error(err) }
    setRemoving(false)
  }

  const handleSaveBio = async () => {
    setSaving(true)
    try {
      await saveBio(bio)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) { console.error(err) }
    setSaving(false)
  }

  const initials = user?.name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const roleClass = ROLE_COLORS[user?.role] || 'bg-gray-100 text-gray-600'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-[360px] overflow-hidden animate-ios-spring">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 pt-8 pb-16 px-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
          >
            <X size={14} className="text-white" />
          </button>
          <p className="text-white/70 text-xs font-medium uppercase tracking-widest">Profile</p>
          <p className="text-white text-lg font-bold mt-0.5">{user?.name}</p>
          <p className="text-white/60 text-xs">{user?.email}</p>
        </div>

        {/* Avatar — overlaps header/body */}
        <div className="relative flex justify-center -mt-12 mb-3">
          <div className="relative">
            {user?.photoUrl
              ? <img src={user.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
              : <div className="w-24 h-24 rounded-full bg-brand-500 border-4 border-white shadow-lg flex items-center justify-center">
                  <span className="text-white text-2xl font-bold">{initials}</span>
                </div>
            }
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Role badge */}
        <div className="flex justify-center mb-4">
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${roleClass}`}>{user?.role}</span>
        </div>

        {/* Photo actions */}
        <div className="flex gap-2 px-5 mb-5">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl bg-brand-50 text-brand-700 hover:bg-brand-100 transition-colors border border-brand-200 disabled:opacity-50"
          >
            <Upload size={12} /> Upload
          </button>
          <button
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200 disabled:opacity-50"
          >
            <Camera size={12} /> Camera
          </button>
          {user?.photoUrl && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="flex items-center justify-center gap-1.5 px-3 text-xs font-semibold py-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50"
            >
              {removing ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 size={12} />}
            </button>
          )}
        </div>

        {/* Bio */}
        <div className="px-5 pb-5">
          <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Bio</label>
          <textarea
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Write something about yourself…"
            rows={3}
            className="mt-1.5 w-full text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100 placeholder:text-gray-400"
          />
          <button
            onClick={handleSaveBio}
            disabled={saving}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {saved ? <><Check size={14} /> Saved!</> : saving ? 'Saving…' : 'Save Bio'}
          </button>
        </div>

        <input ref={fileRef}   type="file" accept="image/*"             className="hidden" onChange={handleFile} />
        <input ref={cameraRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}
