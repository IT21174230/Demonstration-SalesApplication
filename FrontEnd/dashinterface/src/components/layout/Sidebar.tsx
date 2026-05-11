import { LayoutDashboard, MessageSquare, ListChecks, ClipboardList, Users, FileText, Ship, LogOut, ShieldCheck } from 'lucide-react'
import type { PageId } from '../../mockData'

interface SidebarProps {
  current: PageId
  onNav: (page: PageId) => void
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof MessageSquare }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat Assistant', icon: MessageSquare },
  { id: 'inquiry-list', label: 'Inquiry List', icon: ListChecks },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'shipments', label: 'Shipments', icon: Ship },
  { id: 'followups', label: 'Operations', icon: ClipboardList },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'kyc', label: 'KYC Form', icon: ShieldCheck },
]

export default function Sidebar({ current, onNav }: SidebarProps) {
  return (
    <nav className="db-sidebar">
      <div className="db-sidebar-section">Menu</div>

      {NAV_ITEMS.map(item => {
        const Icon = item.icon
        return (
          <div
            key={item.id}
            className={`db-nav-item ${current === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            <span className="db-nav-item-icon"><Icon size={15} /></span>
            {item.label}
          </div>
        )
      })}

      <div className="db-sidebar-footer">
        <div className="db-nav-item">
          <span className="db-nav-item-icon"><LogOut size={15} /></span>
          Sign Out
        </div>
      </div>
    </nav>
  )
}
