import { useState } from 'react'

interface TestUser {
  emp_id: number
  name: string
  desig: string
  dept: string
  password: string
}

const TEST_USERS: TestUser[] = [
  { emp_id: 5, name: 'procu-test',  desig: 'exec', dept: 'procurement',      password: 'proc-89z' },
  { emp_id: 6, name: 'fin-test',    desig: 'exec', dept: 'finance',          password: 'fin-1985' },
  { emp_id: 7, name: 'cs-test',     desig: 'exec', dept: 'customer-service', password: 'cs/sal-15g' },
  { emp_id: 8, name: 'sales-test',  desig: 'exec', dept: 'sales',           password: 'cs/sal-15g' },
  { emp_id: 9, name: 'IT-AD',       desig: '',     dept: 'IT',              password: 'it-ad-9x' },
]

const DEPT_LABELS: Record<string, string> = {
  procurement: 'Procurement',
  finance: 'Finance',
  'customer-service': 'Customer Service',
  sales: 'Sales',
  IT: 'IT Admin',
}

interface LoginProps {
  onLogin: (empId: number) => void
}

export default function Login({ onLogin }: LoginProps) {
  const [selectedUser, setSelectedUser] = useState<TestUser | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (!selectedUser) {
      setError('Please select a user')
      return
    }
    if (password !== selectedUser.password) {
      setError('Incorrect password')
      return
    }
    setError('')
    onLogin(selectedUser.emp_id)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin()
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand-cyan">CLS</span>
          <span className="login-brand-dark">ynergy</span>
        </div>
        <p className="login-subtitle">Select a test account to continue</p>

        <div className="login-users">
          {TEST_USERS.map(u => (
            <button
              key={u.emp_id}
              className={`login-user-btn ${selectedUser?.emp_id === u.emp_id ? 'login-user-btn--active' : ''}`}
              onClick={() => { setSelectedUser(u); setError(''); setPassword('') }}
            >
              <span className="login-user-name">{u.name}</span>
              <span className="login-user-dept">{DEPT_LABELS[u.dept] ?? u.dept}</span>
            </button>
          ))}
        </div>

        {selectedUser && (
          <div className="login-password-section">
            <label className="login-label">Password</label>
            <input
              type="password"
              className="login-input"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={handleKeyDown}
              placeholder="Enter password"
              autoFocus
            />
            <button className="login-submit" onClick={handleLogin}>
              Sign In
            </button>
          </div>
        )}

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  )
}
