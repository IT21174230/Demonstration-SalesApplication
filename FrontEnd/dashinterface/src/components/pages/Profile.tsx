import { LogOut, User, Briefcase, Building2, Hash, Mail } from 'lucide-react'
import { useRole } from '../../RoleContext'
import { ROLE_LABELS } from '../../types'

interface ProfileProps {
  onLogout: () => void
}

export default function Profile({ onLogout }: ProfileProps) {
  const { activeEmployee, activeRole } = useRole()

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">
          {activeEmployee.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <h2 className="profile-name">{activeEmployee.name}</h2>
        <span className="profile-role-pill">{ROLE_LABELS[activeRole]}</span>

        <div className="profile-details">
          <div className="profile-row">
            <Hash size={14} className="profile-row-icon" />
            <span className="profile-row-label">Employee ID</span>
            <span className="profile-row-value">{activeEmployee.id}</span>
          </div>
          <div className="profile-row">
            <User size={14} className="profile-row-icon" />
            <span className="profile-row-label">Name</span>
            <span className="profile-row-value">{activeEmployee.name}</span>
          </div>
          {activeEmployee.email && (
            <div className="profile-row">
              <Mail size={14} className="profile-row-icon" />
              <span className="profile-row-label">Email</span>
              <span className="profile-row-value">{activeEmployee.email}</span>
            </div>
          )}
          <div className="profile-row">
            <Briefcase size={14} className="profile-row-icon" />
            <span className="profile-row-label">Designation</span>
            <span className="profile-row-value">{activeEmployee.role}</span>
          </div>
          <div className="profile-row">
            <Building2 size={14} className="profile-row-icon" />
            <span className="profile-row-label">Department</span>
            <span className="profile-row-value">{ROLE_LABELS[activeRole]}</span>
          </div>
        </div>

        <button className="profile-logout" onClick={onLogout}>
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </div>
  )
}
