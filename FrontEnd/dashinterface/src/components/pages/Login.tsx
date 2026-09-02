import { useState } from 'react'
import { apiGetLoginUrl } from '../../api'

export default function Login() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSsoLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const { auth_url } = await apiGetLoginUrl()
      window.location.href = auth_url
    } catch {
      setError('Failed to initiate login. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-cyan">CLS</span>
          <span className="login-brand-dark">ynergy</span>
        </div>
        <p className="login-subtitle">Sign in to continue</p>

        <button
          className="login-submit"
          onClick={handleSsoLogin}
          disabled={loading}
        >
          {loading ? 'Redirecting...' : 'Sign in with Microsoft'}
        </button>

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  )
}
