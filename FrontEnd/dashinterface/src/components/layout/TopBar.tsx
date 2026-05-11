import { Bell, Settings, RotateCcw } from 'lucide-react'
import { resetPersistentDemo } from '../../hooks'

interface TopBarProps {
  currentPageLabel: string
}

export default function TopBar({ currentPageLabel }: TopBarProps) {
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const handleReset = () => {
    if (!confirm('Reset the demo? This wipes all inquiries, customers, quotes, shipments, and chat history back to the seed data.')) return
    resetPersistentDemo()
    location.reload()
  }

  return (
    <header className="db-topbar">
      <div className="db-topbar-brand">
        <div className="db-topbar-brand-icon">L</div>
        <span>Logistics Tracker</span>
      </div>

      <div className="db-topbar-sep" />

      <span className="db-topbar-breadcrumb">{currentPageLabel}</span>

      <div className="db-topbar-right">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{today}</span>

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
          <div className="db-topbar-avatar" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
            NP
          </div>
          <div style={{ textAlign: 'left' }}>
            <div className="db-topbar-username">Nimal Perera</div>
            <div className="db-topbar-role">Sales Executive</div>
          </div>
        </div>
      </div>
    </header>
  )
}
