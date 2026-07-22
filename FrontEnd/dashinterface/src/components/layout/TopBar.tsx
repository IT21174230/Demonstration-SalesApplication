import { Bell, Settings } from 'lucide-react'
import { ROLE_LABELS, ROLE_COLORS, type UserRole, type Employee } from '../../types'

interface TopBarProps {
  currentPageLabel: string
  activeEmployee: Employee
  activeRole: UserRole
  onNavigateProfile: () => void
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function TopBar({ currentPageLabel, activeEmployee, activeRole, onNavigateProfile }: TopBarProps) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const roleColor = ROLE_COLORS[activeRole]

  return (
    <header className="db-topbar">
      <div className="db-topbar-brand">
        <span className="db-topbar-brand-cyan">CLS</span>
        <span className="db-topbar-brand-white">ynergy</span>
      </div>

      <div className="db-topbar-sep" />

      <span className="db-topbar-breadcrumb">{currentPageLabel}</span>

      <div className="db-topbar-right">
        <span style={{ fontSize: 12, color: '#8f8fc0' }}>{today}</span>

        {/* Role badge */}
        <span
          className="db-topbar-role-pill"
          style={{
            background: roleColor + '20',
            color: roleColor,
            border: `1px solid ${roleColor}40`,
          }}
        >
          {ROLE_LABELS[activeRole]}
        </span>

        <button className="db-topbar-icon-btn" title="Notifications">
          <Bell size={14} />
        </button>

        <button className="db-topbar-icon-btn" title="Settings">
          <Settings size={14} />
        </button>

        <div
          className="db-topbar-user"
          style={{ gap: 8, cursor: 'pointer' }}
          onClick={onNavigateProfile}
          title="View profile"
        >
          <div
            className="db-topbar-avatar"
            style={{ background: `linear-gradient(135deg, ${roleColor}, ${roleColor}cc)` }}
          >
            {getInitials(activeEmployee.name)}
          </div>
          <div style={{ textAlign: 'left' }}>
            <div className="db-topbar-username">{activeEmployee.name}</div>
            <div className="db-topbar-role">{activeEmployee.role}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
