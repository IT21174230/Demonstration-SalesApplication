import { useState, useMemo } from 'react'
import { Eye, X } from 'lucide-react'
import {
  EMPLOYEES, daysUntil,
  type Booking, type ActivityEntry,
} from '../../types'
import { useRole } from '../../RoleContext'

interface BookingListProps {
  bookings: Booking[]
  activityLog: ActivityEntry[]
}

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'Pending Liner': { bg: 'rgba(234,179,8,0.12)', color: '#a16207' },
  'RA Assigned':   { bg: 'rgba(8,145,178,0.12)', color: '#0891b2' },
  'Liner Confirmed': { bg: 'rgba(22,163,74,0.12)', color: '#16a34a' },
  'Released':      { bg: 'rgba(124,58,237,0.12)', color: '#7c3aed' },
  'Cancelled':     { bg: 'rgba(220,38,38,0.12)', color: '#dc2626' },
}

const empName = (id: number | null) => {
  if (!id) return '—'
  return EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`
}

export default function BookingList({ bookings, activityLog }: BookingListProps) {
  const { activeRole } = useRole()
  const [viewing, setViewing] = useState<Booking | null>(null)

  // Filters
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLiner, setFilterLiner] = useState('')
  const [filterOrigin, setFilterOrigin] = useState('')
  const [filterDestination, setFilterDestination] = useState('')
  const [filterDate, setFilterDate] = useState('')

  const filtered = useMemo(() => {
    let list = [...bookings]
    if (filterCustomer) list = list.filter(b => b.customer_name.toLowerCase().includes(filterCustomer.toLowerCase()))
    if (filterStatus) list = list.filter(b => b.status === filterStatus)
    if (filterLiner) list = list.filter(b => (b.shipping_line || '').toLowerCase().includes(filterLiner.toLowerCase()))
    if (filterOrigin) list = list.filter(b => b.origin.toLowerCase().includes(filterOrigin.toLowerCase()))
    if (filterDestination) list = list.filter(b => b.destination.toLowerCase().includes(filterDestination.toLowerCase()))
    if (filterDate) list = list.filter(b => b.created_at.startsWith(filterDate))
    // Sort: most recent first
    list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return list
  }, [bookings, filterCustomer, filterStatus, filterLiner, filterOrigin, filterDestination, filterDate])

  const hasFilters = filterCustomer || filterStatus || filterLiner || filterOrigin || filterDestination || filterDate

  return (
    <div className="db-page-anim">
      {/* Page header */}
      <div className="db-page-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>Booking List</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {filtered.length} booking{filtered.length !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''} · {activeRole} view
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="db-chart-card" style={{ marginBottom: 16, padding: '16px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Customer</label>
            <input className="lt-input" style={{ width: '100%', fontSize: 12 }} value={filterCustomer}
              onChange={e => setFilterCustomer(e.target.value)} placeholder="Search..." />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Status</label>
            <select className="lt-input" style={{ width: '100%', fontSize: 12 }} value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              <option value="Pending Liner">Pending Liner</option>
              <option value="RA Assigned">RA Assigned</option>
              <option value="Liner Confirmed">Liner Confirmed</option>
              <option value="Released">Released</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Shipping Line</label>
            <input className="lt-input" style={{ width: '100%', fontSize: 12 }} value={filterLiner}
              onChange={e => setFilterLiner(e.target.value)} placeholder="Search..." />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Origin</label>
            <input className="lt-input" style={{ width: '100%', fontSize: 12 }} value={filterOrigin}
              onChange={e => setFilterOrigin(e.target.value)} placeholder="Search..." />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Destination</label>
            <input className="lt-input" style={{ width: '100%', fontSize: 12 }} value={filterDestination}
              onChange={e => setFilterDestination(e.target.value)} placeholder="Search..." />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Created Date</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <input type="date" className="lt-input" style={{ flex: 1, fontSize: 12 }} value={filterDate}
                onChange={e => setFilterDate(e.target.value)} />
              {filterDate && <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }} onClick={() => setFilterDate('')}><X size={13} /></button>}
            </div>
          </div>
        </div>
        {hasFilters && (
          <button style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0891b2', fontWeight: 600 }}
            onClick={() => { setFilterCustomer(''); setFilterStatus(''); setFilterLiner(''); setFilterOrigin(''); setFilterDestination(''); setFilterDate('') }}>
            Clear all filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="db-chart-card" style={{ padding: '0 0 8px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Booking ID</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Route</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Container</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Shipping Line</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Vessel / Voyage</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>SI/BL Cutoff</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Created</th>
              <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)', width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No bookings found{hasFilters ? ' matching your filters' : ''}.
                </td>
              </tr>
            )}
            {filtered.map(b => {
              const badge = STATUS_BADGE[b.status] || { bg: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }
              const siblCutoff = b.si_cutoff_date || b.bl_cutoff_date
              const cutoffDays = siblCutoff ? daysUntil(siblCutoff) : null
              return (
                <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                  onClick={() => setViewing(b)}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.03)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <td style={{ padding: '12px 8px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{b.id}</td>
                  <td style={{ padding: '12px 8px', fontWeight: 600 }}>
                    {b.customer_name}
                    {b.is_urgent && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: '#dc2626', background: 'rgba(220,38,38,0.1)', padding: '1px 5px', borderRadius: 4 }}>URGENT</span>}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span>{b.origin}</span>
                    <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span>
                    <span>{b.destination}</span>
                  </td>
                  <td style={{ padding: '12px 8px' }}>{b.quantity}x {b.container_type}</td>
                  <td style={{ padding: '12px 8px' }}>{b.shipping_line || <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td style={{ padding: '12px 8px', fontSize: 11 }}>
                    {b.vessel_name ? (
                      <>{b.vessel_name}{b.voyage_number ? ` / ${b.voyage_number}` : ''}</>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>TBD</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 8px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color }}>
                      {b.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: 11 }}>
                    {siblCutoff ? (
                      <span style={{ color: cutoffDays !== null && cutoffDays < 0 ? '#dc2626' : cutoffDays !== null && cutoffDays <= 2 ? '#d97706' : 'var(--text)' }}>
                        {siblCutoff}
                        {cutoffDays !== null && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>
                            ({cutoffDays < 0 ? `${Math.abs(cutoffDays)}d over` : `${cutoffDays}d`})
                          </span>
                        )}
                      </span>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 8px', fontSize: 11, color: 'var(--text-muted)' }}>{b.created_at.slice(0, 10)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}
                      title="View details"
                      onClick={e => { e.stopPropagation(); setViewing(b) }}>
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* View modal */}
      {viewing && (
        <div className="lt-modal-backdrop" onClick={() => setViewing(null)}>
          <div className="lt-modal" onClick={e => e.stopPropagation()} style={{ width: 600, padding: '28px 30px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>Booking Details</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{viewing.id}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {(() => { const b = STATUS_BADGE[viewing.status] || { bg: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)' }; return <span style={{ padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 700, background: b.bg, color: b.color }}>{viewing.status}</span> })()}
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }} onClick={() => setViewing(null)}><X size={18} /></button>
              </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 24px', fontSize: 13 }}>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer</span><div style={{ fontWeight: 600, marginTop: 2 }}>{viewing.customer_name}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Route</span><div style={{ marginTop: 2 }}>{viewing.origin} → {viewing.destination}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Shipping Line</span><div style={{ marginTop: 2 }}>{viewing.shipping_line || '—'}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Container</span><div style={{ marginTop: 2 }}>{viewing.quantity}x {viewing.container_type}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Vessel</span><div style={{ marginTop: 2 }}>{viewing.vessel_name || 'TBD'}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Voyage</span><div style={{ marginTop: 2 }}>{viewing.voyage_number || 'TBD'}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Delivery Type</span><div style={{ marginTop: 2 }}>{viewing.delivery_type || '—'}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quote Ref</span><div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: 11 }}>{viewing.quote_id || '—'}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Booked By</span><div style={{ marginTop: 2 }}>{empName(viewing.booked_by)}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirmed By</span><div style={{ marginTop: 2 }}>{empName(viewing.confirmed_by)}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Created</span><div style={{ marginTop: 2 }}>{viewing.created_at}</div></div>
              <div><span style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Confirmed At</span><div style={{ marginTop: 2 }}>{viewing.confirmed_at || '—'}</div></div>
            </div>

            {/* Cutoff dates */}
            {(viewing.si_cutoff_date || viewing.bl_cutoff_date || viewing.vgm_cutoff_date || viewing.filing_cutoff_date) && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Cutoff Dates</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {(viewing.si_cutoff_date || viewing.bl_cutoff_date) && (
                    <div style={{ padding: '6px 12px', background: 'rgba(8,145,178,0.08)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>SI/BL</span> <strong>{viewing.si_cutoff_date || viewing.bl_cutoff_date}</strong>
                    </div>
                  )}
                  {viewing.vgm_cutoff_date && (
                    <div style={{ padding: '6px 12px', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>VGM</span> <strong>{viewing.vgm_cutoff_date}</strong>
                    </div>
                  )}
                  {viewing.filing_cutoff_date && (
                    <div style={{ padding: '6px 12px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)', borderRadius: 6, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }}>Filing</span> <strong>{viewing.filing_cutoff_date}</strong>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Progress flags */}
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Progress</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'Release Order', done: viewing.release_order_attached },
                  { label: 'SI Requested', done: viewing.si_requested },
                  { label: 'SI Submitted', done: viewing.si_submitted },
                  { label: 'Draft BL Sent', done: viewing.draft_bl_sent },
                  { label: 'BL Approved', done: viewing.bl_status === 'approved' },
                  { label: 'Master BL', done: viewing.master_bl_recorded },
                  { label: 'House BL', done: viewing.house_bl_created },
                ].map(f => (
                  <span key={f.label} style={{
                    padding: '3px 10px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                    background: f.done ? 'rgba(22,163,74,0.1)' : 'rgba(0,0,0,0.04)',
                    color: f.done ? '#16a34a' : 'var(--text-muted)',
                  }}>
                    {f.done ? '✓ ' : ''}{f.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Notes */}
            {viewing.notes && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 6 }}>Notes</div>
                <div style={{ padding: '10px 14px', background: 'var(--bg)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{viewing.notes}</div>
              </div>
            )}

            {/* Recent activity */}
            {(() => {
              const entries = activityLog.filter(a => a.ref_id === viewing.id).slice(0, 5)
              if (!entries.length) return null
              return (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: 8 }}>Recent Activity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {entries.map(a => (
                      <div key={a.id} style={{ padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-secondary)' }}>{empName(a.actor_id)}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.timestamp}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>{a.action}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Close button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="db-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setViewing(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
