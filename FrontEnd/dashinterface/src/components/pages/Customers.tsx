import { useMemo, useState } from 'react'
import { ShieldAlert, AlertTriangle, Edit3 } from 'lucide-react'
import { EMPLOYEES, type Inquiry, type Customer, type CustomerTier, type CustomerType } from '../../types'
import CustomerEditModal from '../shared/CustomerEditModal'

const CTYPE_BADGE: Record<CustomerType, string> = {
  'Shipper': 'db-badge accent',
  'Buyer':   'db-badge purple',
  'Agent':   'db-badge muted',
  'Trader':  'db-badge warning',
}

interface CustomersProps {
  inquiries: Inquiry[]
  customers: Customer[]
  onUpdateCustomer: (customerName: string, patch: Partial<Omit<Customer, 'id'>>) => void
  onFlash: (msg: string) => void
}

interface CustomerRow extends Customer {
  totalInquiries: number
  pending: number
  completed: number
  channels: Set<string>
  lastContact: string
}

const TIER_BADGE: Record<CustomerTier, string> = {
  'Key Account': 'db-badge accent',
  'Regular':     'db-badge muted',
  'Walk-in':     'db-badge purple',
}

// Order tiers Key Account → Regular → Walk-in when sorting.
const TIER_ORDER: Record<CustomerTier, number> = { 'Key Account': 0, 'Regular': 1, 'Walk-in': 2 }

export default function Customers({ inquiries, customers, onUpdateCustomer, onFlash }: CustomersProps) {
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const rows = useMemo<CustomerRow[]>(() => {
    // Aggregate inquiry stats per customer name (case-insensitive).
    const stats = new Map<string, { totalInquiries: number; pending: number; completed: number; channels: Set<string>; lastContact: string }>()
    for (const inq of inquiries) {
      const key = inq.customer_name.toLowerCase()
      const existing = stats.get(key) ?? { totalInquiries: 0, pending: 0, completed: 0, channels: new Set<string>(), lastContact: '' }
      existing.totalInquiries += 1
      if (inq.status === 'pending') existing.pending += 1
      else existing.completed += 1
      existing.channels.add(inq.channel ?? 'Unknown')
      if (inq.created_at > existing.lastContact) existing.lastContact = inq.created_at
      stats.set(key, existing)
    }

    return customers
      .map(c => ({
        ...c,
        ...(stats.get(c.name.toLowerCase()) ?? { totalInquiries: 0, pending: 0, completed: 0, channels: new Set<string>(), lastContact: '' }),
      }))
      .sort((a, b) => {
        // Blacklisted at bottom; otherwise by tier, then last contact.
        if (a.blacklisted !== b.blacklisted) return a.blacklisted ? 1 : -1
        if (a.tier !== b.tier) return TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
        return a.lastContact > b.lastContact ? -1 : 1
      })
  }, [inquiries, customers])

  const blacklistedCount = customers.filter(c => c.blacklisted).length
  const creditHoldCount = customers.filter(c => c.credit_hold).length

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Customers</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {customers.length} customers · {blacklistedCount} blacklisted · {creditHoldCount} on credit hold
            </div>
          </div>
        </div>
      </div>

      {/* Phase 7.3 — Customer Portal placeholder. Per the meeting, low-volume customers
          won't log in, so the system also auto-emails. The portal is Phase 2 in the
          meeting's roadmap; this banner just signals the planned integration. */}
      <div style={{
        marginBottom: 18,
        padding: '12px 16px',
        background: 'rgba(15,143,168,0.03)',
        border: '1px dashed rgba(15,143,168,0.2)',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 12,
      }}>
        <div>
          <div style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: 2 }}>🌐 Customer Portal · Phase 2</div>
          <div style={{ color: 'var(--text-muted)' }}>
            Tracking dashboard, document downloads, and quote management for customers — optional login;
            non-portal customers receive the same updates by automated email.
          </div>
        </div>
        <button className="db-btn secondary" disabled style={{ opacity: 0.6, cursor: 'not-allowed', whiteSpace: 'nowrap' }}>
          Preview portal
        </button>
      </div>

      <div className="db-chart-card">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Type</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Location</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Tier</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Payment</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Min Margin</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Salesperson</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Inquiries</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Last Contact</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(c => {
                const blocked = c.blacklisted
                const warned = c.credit_hold && !c.blacklisted
                return (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: blocked ? 'rgba(220,38,38,0.03)' : warned ? 'rgba(217,119,6,0.03)' : undefined,
                      opacity: blocked ? 0.85 : 1,
                    }}
                  >
                    <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>
                      {c.name}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                        {c.id}{c.contact_person ? ` · ${c.contact_person}` : ''}
                      </div>
                      {c.notes && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2, fontStyle: 'italic' }}>
                          {c.notes}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {c.customer_type ? <span className={CTYPE_BADGE[c.customer_type]}>{c.customer_type}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      {c.location}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={TIER_BADGE[c.tier]}>{c.tier}</span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{c.payment_terms}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>{c.min_margin_pct}%</td>
                    <td style={{ padding: '12px 8px' }}>
                      {blocked && (
                        <span className="db-badge danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <ShieldAlert size={11} /> Blacklisted
                        </span>
                      )}
                      {warned && (
                        <span className="db-badge warning" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={11} /> Credit Hold
                        </span>
                      )}
                      {!blocked && !warned && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                      {c.assigned_salesperson_id ? (EMPLOYEES.find(e => e.id === c.assigned_salesperson_id)?.name ?? '—') : '—'}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>
                      {c.totalInquiries}
                      {c.pending > 0 && (
                        <span className="lt-pill pending" style={{ marginLeft: 6 }}>{c.pending} pending</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{c.lastContact || '—'}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <button
                        className="lt-icon-btn"
                        title="Edit Customer"
                        onClick={() => setEditingCustomer(c)}
                      >
                        <Edit3 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No customers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingCustomer && (
        <CustomerEditModal
          customer={editingCustomer}
          onSave={(name, patch) => { onUpdateCustomer(name, patch); onFlash(`Updated customer ${name}`) }}
          onClose={() => setEditingCustomer(null)}
        />
      )}
    </div>
  )
}
