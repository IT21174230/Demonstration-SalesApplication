import { setTokens } from '../../auth'

// TEST BRANCH: hardcoded bearer token — bypasses real Azure AD SSO
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwibWFpbF9pZCI6InRlc3RAZXhhbXBsZS5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIiwiZGVwdCI6IkVuZ2luZWVyaW5nIiwiZGVzaWciOiJEZXZlbG9wZXIiLCJleHAiOjE3ODg0MTA4NzIsImp0aSI6ImRjYTU0YTEwLWM3M2EtNGJkNC04YWE1LWJlNmU0ZGQyZDRlMyJ9.VA7ErbBbpKAHr1nwVwFWYBx9dRBa5gR8fCu-f92Djc4'

export default function Login() {
  const handleTestLogin = () => {
    setTokens(TEST_TOKEN, '')
    window.location.reload()
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-cyan">CLS</span>
          <span className="login-brand-dark">ynergy</span>
        </div>
        <p className="login-subtitle">Sign in to continue</p>

        <button className="login-submit" onClick={handleTestLogin}>
          Test Login (Dev)
        </button>

        <p style={{ marginTop: 12, fontSize: 12, color: '#888', textAlign: 'center' }}>
          Test branch — MS auth bypassed
        </p>
      </div>
    </div>
  )
}
