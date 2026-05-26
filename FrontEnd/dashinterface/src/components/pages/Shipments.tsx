import { useState } from 'react'
import { Ship, MapPin, Anchor, CheckCircle2, ChevronRight, Plane, Package, Clock, AlertTriangle } from 'lucide-react'
import {
  EMPLOYEES,
  type Shipment, type ShipmentStatus, type ShipmentLeg, type Booking, type BookingStatus,
} from '../../mockData'
import { useRole } from '../../RoleContext'

interface ShipmentsProps {
  shipments: Shipment[]
  bookings: Booking[]
  onAdvanceLeg: (shipmentId: string, legId: string) => void
  onRecordPOD: (shipmentId: string) => void
}

const STATUS_BADGE: Record<ShipmentStatus, string> = {
  'Booked':           'db-badge muted',
  'In Transit':       'db-badge accent',
  'At Transshipment': 'db-badge warning',
  'Out for Delivery': 'db-badge purple',
  'Delivered':        'db-badge success',
  'Delayed':          'db-badge danger',
}

const LEG_ICON = ({ type }: { type: ShipmentLeg['type'] }) => {
  if (type === 'Origin') return <Anchor size={14} />
  if (type === 'Transshipment') return <Plane size={14} />
  return <MapPin size={14} />
}

const LEG_STATUS_COLOR: Record<ShipmentLeg['status'], string> = {
  Pending: 'var(--text-muted)',
  Arrived: '#d97706',
  Departed: '#16a34a',
  Delayed: '#dc2626',
}

const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  'Pending Liner':  'db-badge warning',
  'Liner Confirmed':'db-badge accent',
  'Released':       'db-badge success',
  'Cancelled':      'db-badge danger',
}

export default function Shipments({ shipments, bookings, onAdvanceLeg, onRecordPOD }: ShipmentsProps) {
  const { hasPermission } = useRole()
  const canAdvanceLeg = hasPermission('shipment:advance-leg')
  const canRecordPOD = hasPermission('shipment:record-pod')
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all')
  const [customerFilter, setCustomerFilter] = useState('')

  const filtered = shipments.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (customerFilter && !s.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) return false
    return true
  })

  // Count shipments by status for header
  const counts: Partial<Record<ShipmentStatus, number>> = {}
  for (const s of shipments) counts[s.status] = (counts[s.status] ?? 0) + 1

  // Highlight the "stuck at transshipment" cases — meeting flagged this as the
  // critical post-confirmation tracking gap.
  const stuckAtTransshipment = shipments.filter(s => s.status === 'At Transshipment')

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Shipments</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Track every confirmed booking from origin to POD · {shipments.length} active · {counts['Delivered'] ?? 0} delivered · {counts['At Transshipment'] ?? 0} at transshipment
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(79,70,229,0.03)', border: '1px solid rgba(79,70,229,0.12)', borderRadius: 8 }}>
            🛰️ Mock Inttra / Freightify integration · live tracking stubbed
          </div>
        </div>
      </div>

      {/* Critical-watch banner — meeting flagged transshipment monitoring as a key gap */}
      {stuckAtTransshipment.length > 0 && (
        <div className="db-chart-card" style={{ marginBottom: 18, borderColor: 'rgba(217,119,6,0.25)' }}>
          <div className="db-chart-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={15} style={{ color: '#d97706' }} />
              <div>
                <div className="db-chart-title">Critical Watch — At Transshipment</div>
                <div className="db-chart-sub">Verify connection to onward leg · we're liable until POD</div>
              </div>
            </div>
            <span className="lt-pill due-today">{stuckAtTransshipment.length} shipment{stuckAtTransshipment.length === 1 ? '' : 's'}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stuckAtTransshipment.map(s => {
              const transshipLeg = s.legs.find(l => l.type === 'Transshipment' && l.status === 'Arrived')
              return (
                <div key={s.id} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 0' }}>
                  <span style={{ color: 'var(--text)', fontWeight: 700 }}>{s.id}</span>
                  {' · '}{s.customer_name}
                  {' · '}{s.origin} → {s.destination}
                  {' · via '}<strong style={{ color: '#d97706' }}>{transshipLeg?.port ?? '—'}</strong>
                  {transshipLeg?.actual_at && <> · arrived {transshipLeg.actual_at}</>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Bookings Pipeline */}
      {bookings.length > 0 && (
        <div className="db-chart-card" style={{ marginBottom: 18 }}>
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">Bookings Pipeline</div>
              <div className="db-chart-sub">
                {bookings.filter(b => b.status === 'Pending Liner').length} pending liner
                {' · '}{bookings.filter(b => b.status === 'Liner Confirmed').length} confirmed
                {' · '}{bookings.filter(b => b.status === 'Released').length} released
                {bookings.some(b => b.is_urgent && !b.procurement_notified) && (
                  <span style={{ color: '#dc2626', fontWeight: 700 }}>
                    {' · '}{bookings.filter(b => b.is_urgent && !b.procurement_notified).length} urgent — procurement not notified
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bookings.map(b => {
              const bookedByName = EMPLOYEES.find(e => e.id === b.booked_by)?.name ?? '—'
              const confirmedByName = b.confirmed_by ? (EMPLOYEES.find(e => e.id === b.confirmed_by)?.name ?? '—') : null
              return (
                <div key={b.id} style={{ padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Anchor size={14} style={{ color: 'var(--accent-light)' }} />
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{b.id}</span>
                    <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{b.customer_name}</span>
                    <span className={BOOKING_STATUS_BADGE[b.status]}>{b.status}</span>
                    {b.is_urgent && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#dc2626', fontWeight: 700 }}>
                        <AlertTriangle size={11} /> URGENT
                      </span>
                    )}
                    {b.is_urgent && !b.procurement_notified && (
                      <span style={{ fontSize: 10, color: '#dc2626', background: 'rgba(220,38,38,0.08)', padding: '2px 6px', borderRadius: 4 }}>
                        Procurement not notified
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {b.origin} → {b.destination} · {b.shipping_line} · {b.container_type} × {b.quantity}
                    {' · quote '}<span style={{ fontFamily: 'monospace' }}>{b.quote_id}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Booked by {bookedByName} on {b.created_at}
                    {confirmedByName && <> · confirmed by {confirmedByName} on {b.confirmed_at}</>}
                    {b.released_at && <> · released {b.released_at}</>}
                    {b.vessel_name && <> · vessel {b.vessel_name}</>}
                    {b.voyage_number && <> ({b.voyage_number})</>}
                  </div>
                  {/* Workflow progress indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 10 }}>
                    {(['Pending Liner', 'Liner Confirmed', 'Released'] as BookingStatus[]).map((step, idx) => {
                      const statuses: BookingStatus[] = ['Pending Liner', 'Liner Confirmed', 'Released']
                      const currentIdx = statuses.indexOf(b.status)
                      const stepIdx = idx
                      const done = b.status === 'Cancelled' ? false : stepIdx <= currentIdx
                      const active = stepIdx === currentIdx && b.status !== 'Cancelled'
                      const labels = ['CS Created', 'Liner Confirmed', 'Released to Customer']
                      return (
                        <div key={step} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                          <div style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontWeight: active ? 700 : 500,
                            color: done ? '#fff' : 'var(--text-muted)',
                            background: done
                              ? (active ? 'var(--accent)' : 'rgba(79,70,229,0.5)')
                              : 'rgba(0,0,0,0.04)',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {labels[idx]}
                          </div>
                          {idx < 2 && (
                            <ChevronRight size={12} style={{ color: 'var(--text-muted)', opacity: 0.4, flexShrink: 0 }} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {b.notes && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                      {b.notes}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label className="lt-label">By Customer</label>
            <input
              value={customerFilter}
              onChange={e => setCustomerFilter(e.target.value)}
              placeholder="Search customer name..."
              className="lt-input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="lt-label">By Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ShipmentStatus | 'all')}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {(['Booked', 'In Transit', 'At Transshipment', 'Out for Delivery', 'Delivered', 'Delayed'] as ShipmentStatus[]).map(s =>
                <option key={s} value={s}>{s}</option>,
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Shipment cards with timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {filtered.map(s => (
          <div key={s.id} className="db-chart-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ship size={16} style={{ color: 'var(--accent-light)' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{s.id}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14 }}>{s.customer_name}</span>
                  <span className={STATUS_BADGE[s.status]}>{s.status}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {s.origin} → {s.destination} · via {s.shipping_line} · linked to <span style={{ fontFamily: 'monospace' }}>{s.quote_id}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Booked {s.booked_at} · ETA {s.expected_delivery}
                  {s.pod_received && <> · POD {s.pod_received}</>}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.status !== 'Delivered' && (
                  <button
                    className="db-btn primary"
                    onClick={() => canRecordPOD && onRecordPOD(s.id)}
                    disabled={!canRecordPOD}
                    title={canRecordPOD ? 'Record proof of delivery' : 'Restricted — requires Admin role'}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, whiteSpace: 'nowrap', opacity: canRecordPOD ? 1 : 0.4, cursor: canRecordPOD ? 'pointer' : 'not-allowed' }}
                  >
                    <Package size={11} /> Record POD
                  </button>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
              {s.legs.map((leg, idx) => {
                const last = idx === s.legs.length - 1
                const color = LEG_STATUS_COLOR[leg.status]
                return (
                  <div key={leg.id} style={{ display: 'flex', alignItems: 'stretch', flex: 1, minWidth: 0 }}>
                    <div style={{ flex: 1, padding: '10px 12px', background: '#ffffff', border: '1px solid var(--border)', borderRadius: 8, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ color, display: 'inline-flex', alignItems: 'center' }}>
                          <LEG_ICON type={leg.type} />
                        </span>
                        <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12 }}>{leg.port}</span>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{leg.type}</span>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        ETA {leg.expected_at}
                        {leg.actual_at && <> · actual {leg.actual_at}</>}
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                        <span style={{ fontSize: 10, color, fontWeight: 700, textTransform: 'uppercase' }}>
                          {leg.status === 'Arrived' && <CheckCircle2 size={10} style={{ display: 'inline', marginRight: 3, marginBottom: -1 }} />}
                          {leg.status}
                        </span>
                        {leg.status !== 'Departed' && (leg.type !== 'Destination' || leg.status !== 'Arrived') && (
                          <button
                            className="lt-icon-btn"
                            title={canAdvanceLeg ? (leg.status === 'Pending' ? 'Mark Arrived' : 'Mark Departed') : 'Restricted — requires Admin role'}
                            onClick={() => canAdvanceLeg && onAdvanceLeg(s.id, leg.id)}
                            disabled={!canAdvanceLeg}
                            style={{ padding: '2px 6px', height: 20, width: 'auto', fontSize: 9, gap: 2, opacity: canAdvanceLeg ? 1 : 0.4, cursor: canAdvanceLeg ? 'pointer' : 'not-allowed' }}
                          >
                            <ChevronRight size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                    {!last && (
                      <div style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronRight size={14} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10 }}>
            No shipments match these filters.
          </div>
        )}
      </div>
    </div>
  )
}
