import { Bell, Settings, RotateCcw, ChevronDown } from 'lucide-react'
import { resetPersistentDemo } from '../../hooks'
import { EMPLOYEES, EMPLOYEE_ROLE_MAP, ROLE_LABELS, ROLE_COLORS, type UserRole, type Employee } from '../../mockData'

interface TopBarProps {
  currentPageLabel: string
  activeEmployee: Employee
  activeRole: UserRole
  onSwitchEmployee: (id: number) => void
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function TopBar({ currentPageLabel, activeEmployee, activeRole, onSwitchEmployee }: TopBarProps) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const roleColor = ROLE_COLORS[activeRole]

  const handleReset = () => {
    if (!confirm('Reset the demo? This wipes all inquiries, customers, quotes, shipments, and chat history back to the seed data.')) return
    resetPersistentDemo()
    location.reload()
  }

  return (
    <header className="db-topbar">
      <div className="db-topbar-brand">
        <div className="db-topbar-brand-icon">F</div>
        <span>FreightOS</span>
      </div>

      <div className="db-topbar-sep" />

      <span className="db-topbar-breadcrumb">{currentPageLabel}</span>

      <div className="db-topbar-right">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{today}</span>

        {/* Role badge */}
        <span
          className="db-topbar-role-pill"
          style={{
            background: roleColor + '12',
            color: roleColor,
            border: `1px solid ${roleColor}30`,
          }}
        >
          {ROLE_LABELS[activeRole]}
        </span>

        {/* Role switcher */}
        <div className="db-topbar-role-switch">
          <select
            value={activeEmployee.id}
            onChange={e => onSwitchEmployee(Number(e.target.value))}
            className="db-topbar-role-select"
          >
            {EMPLOYEES.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({ROLE_LABELS[EMPLOYEE_ROLE_MAP[emp.id]]})
              </option>
            ))}
          </select>
          <ChevronDown size={10} className="db-topbar-role-chevron" />
        </div>

        <button
          className="db-topbar-icon-btn"
          title="Reset demo data — clears all changes and chat history"
          onClick={handleReset}
          style={{ display: 'flex', alignItems: 'center', gap: 5, width: 'auto', padding: '0 10px', fontSize: 11, fontWeight: 600 }}
        >
          <RotateCcw size={12} /> Reset Demo
        </button>

        <button className="db-topbar-icon-btn" title="Notifications">
          <Bell size={14} />
        </button>

        <button className="db-topbar-icon-btn" title="Settings">
          <Settings size={14} />
        </button>

        <div className="db-topbar-user" style={{ gap: 8 }}>
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
