import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { DollarSign, Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail]           = useState('')
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.message ?? 'Invalid email or password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ios-bg flex items-center justify-center p-5">

      {/* Subtle background circles for depth */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-brand-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-blue-50 opacity-60 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-ios-spring">
        {/* Logo mark */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-brand-500 rounded-[22px] flex items-center justify-center shadow-ios-md mb-4">
            <DollarSign size={30} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-[28px] font-bold text-gray-900 tracking-ios-tight">Dollar.v2</h1>
          <p className="text-[14px] text-ios-gray1 mt-1">Sales Performance Platform</p>
        </div>

        {/* Card */}
        <div className="ios-glass rounded-ios-xl shadow-ios-lg p-6 border border-white/60">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="ios-label pl-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@airtribe.live"
                className="ios-input"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="ios-label pl-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="ios-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ios-gray2 hover:text-ios-gray1 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 rounded-ios px-3.5 py-3 text-[13px] text-red-700">
                <span className="text-base leading-none mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="ios-btn w-full py-3 text-[15px] mt-1"
            >
              {loading
                ? <><span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> Signing in…</>
                : 'Sign In'
              }
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-ios-gray2 mt-5">
          Airtribe Internal Tool · Secure Access Only
        </p>
      </div>
    </div>
  )
}
