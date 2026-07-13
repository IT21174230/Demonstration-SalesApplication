import { useMemo, useState, useRef, useEffect } from 'react'
import { Eye, CheckCircle2, MessageSquarePlus, X, Edit3, Send } from 'lucide-react'
import {
  EMPLOYEES, SBUS, INQUIRY_PRIORITIES, findCustomer,
  type Inquiry, type InquiryStatus, type Followup, type Customer, type SBU, type CustomerTier,
  type Quote, type QuoteStatus, type WorkflowStage, type InquiryPriority, type ContainerLine,
} from '../../mockData'
import { useRole } from '../../RoleContext'
import WorkflowStepper from '../shared/WorkflowStepper'
import CustomerEditModal from '../shared/CustomerEditModal'

interface InquiryListProps {
  inquiries: Inquiry[]
  followups: Followup[]
  customers: Customer[]
  quotes: Quote[]
  onCompleteById: (id: string) => void
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage) => void
  onUpdateCustomer: (customerName: string, patch: Partial<Omit<Customer, 'id'>>) => void
  onAddFollowup: (customerName: string, note: string, completionFlag: boolean, employeeId?: number) => void
  onFlash: (msg: string) => void
}

const QUOTE_STATUS_BADGE: Record<QuoteStatus, string> = {
  'Draft':              'db-badge muted',
  'Awaiting Approval':  'db-badge warning',
  'Approved':           'db-badge accent',
  'Sent':               'db-badge purple',
  'Confirmed':          'db-badge success',
  'Lost':               'db-badge danger',
}

type StatusFilter = 'all' | InquiryStatus
type SBUFilter = 'all' | SBU
type PriorityFilter = 'all' | InquiryPriority

const TIER_BADGE: Record<CustomerTier, string> = {
  'Key Account': 'db-badge accent',
  'Regular':     'db-badge muted',
  'Walk-in':     'db-badge purple',
}

const PRIORITY_BADGE: Record<InquiryPriority, string> = {
  'Low':    'db-badge muted',
  'Medium': 'db-badge accent',
  'High':   'db-badge warning',
  'Urgent': 'db-badge danger',
}

export default function InquiryList({ inquiries, followups, customers, quotes, onCompleteById, onAdvanceWorkflow, onUpdateCustomer, onAddFollowup, onFlash }: InquiryListProps) {
  const { hasPermission, activeEmployee, activeRole } = useRole()
  const isProcurement = activeRole === 'Procurement'
  const canComplete = hasPermission('inquiry:complete')
  const canFollowup = hasPermission('followup:create')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [followupNote, setFollowupNote] = useState('')
  const [followupFocused, setFollowupFocused] = useState(false)
  const followupRef = useRef<HTMLTextAreaElement>(null)
  // Map inquiry_id → most recent quote linked to it (for the Quote Status column).
  const quoteByInquiry = new Map<string, Quote>()
  for (const q of quotes) {
    if (q.inquiry_id) quoteByInquiry.set(q.inquiry_id, q)
  }
  const [customerFilter, setCustomerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [employeeFilter, setEmployeeFilter] = useState<number | 'all'>('all')
  const [sbuFilter, setSbuFilter] = useState<SBUFilter>('all')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [viewing, setViewing] = useState<Inquiry | null>(null)

  const filtered = useMemo(() => {
    return inquiries.filter(i => {
      if (customerFilter && !i.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) return false
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (employeeFilter !== 'all' && i.employee_id !== employeeFilter) return false
      if (sbuFilter !== 'all' && i.sbu !== sbuFilter) return false
      if (priorityFilter !== 'all' && i.priority !== priorityFilter) return false
      if (dateFilter && !i.created_at.startsWith(dateFilter)) return false
      return true
    })
  }, [inquiries, customerFilter, statusFilter, employeeFilter, sbuFilter, priorityFilter, dateFilter])

  // Procurement view: flatten each container into its own row
  type ProcRow = { inquiry: Inquiry; container: ContainerLine; containerIdx: number }
  const procRows = useMemo<ProcRow[]>(() => {
    if (!isProcurement) return []
    const rows: ProcRow[] = []
    for (const inq of filtered) {
      if (inq.containers && inq.containers.length > 0) {
        inq.containers.forEach((c, ci) => rows.push({ inquiry: inq, container: c, containerIdx: ci }))
      } else {
        // Legacy inquiry without containers array — create a synthetic container row
        rows.push({
          inquiry: inq,
          container: {
            containerType: inq.container_type ?? '20 GP',
            quantity: inq.container_qty ?? 1,
            weight: inq.cargo_weight ?? '',
            commodityType: inq.commodity_type ?? 'General',
            commodityName: '',
            destination: inq.destination,
            isFcl: inq.is_fcl ?? true,
            zipCode: '',
            doorAgents: [],
            freeTime: '',
          },
          containerIdx: 0,
        })
      }
    }
    return rows
  }, [isProcurement, filtered])

  // Auto-focus the follow-up textarea when opened via the follow-up button
  useEffect(() => {
    if (followupFocused && viewing && followupRef.current) {
      followupRef.current.focus()
      followupRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setFollowupFocused(false)
    }
  }, [followupFocused, viewing])

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Inquiry List</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              View, filter and manage all customer inquiries
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
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
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div>
            <label className="lt-label">By Priority</label>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as PriorityFilter)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {INQUIRY_PRIORITIES.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">By SBU</label>
            <select
              value={sbuFilter}
              onChange={e => setSbuFilter(e.target.value as SBUFilter)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {SBUS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">By Salesperson</label>
            <select
              value={employeeFilter}
              onChange={e => setEmployeeFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {EMPLOYEES.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">By Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="lt-input"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="db-chart-card">
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Inquiries</div>
            <div className="db-chart-sub">{isProcurement ? `Showing ${procRows.length} container lines from ${filtered.length} inquiries` : `Showing ${filtered.length} of ${inquiries.length}`}</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Inquiry ID</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Origin → Destination</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Priority</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Container</th>
                {isProcurement && <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Commodity</th>}
                {isProcurement && <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Free Time</th>}
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>SBU</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Quote</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Salesperson</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Date</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isProcurement ? (
                <>
                  {procRows.map((row) => {
                    const i = row.inquiry
                    const c = row.container
                    const isPending = i.status === 'pending'
                    const cust = findCustomer(i.customer_name, customers)
                    return (
                      <tr key={`${i.id}-${row.containerIdx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{i.id}</td>
                        <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span>{i.customer_name}</span>
                            {cust && <span className={TIER_BADGE[cust.tier]}>{cust.tier}</span>}
                            {cust?.blacklisted && <span className="db-badge danger">Blacklisted</span>}
                            {cust?.credit_hold && !cust.blacklisted && <span className="db-badge warning">Credit Hold</span>}
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 12 }}>
                          <div style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--text)' }}>{i.origin || 'TBD'}</span>
                            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                            <span style={{ color: 'var(--text)' }}>{c.destination || 'TBD'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {i.priority && <span className={PRIORITY_BADGE[i.priority]}>{i.priority}</span>}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          <div style={{ whiteSpace: 'nowrap' }}>{c.quantity}x {c.containerType}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.isFcl ? 'FCL' : 'LCL'}{c.weight !== '' && c.weight !== 0 ? ` · ${c.weight} kg` : ''}</div>
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {c.commodityType}{c.commodityName ? ` — ${c.commodityName}` : ''}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                          {c.freeTime !== '' && c.freeTime !== 0 ? `${c.freeTime} days` : '—'}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>{i.sbu}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <span className={`lt-pill ${isPending ? 'pending' : 'completed'}`}>
                            {isPending ? 'Pending' : 'Completed'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 8px' }}>
                          {(() => {
                            const q = quoteByInquiry.get(i.id)
                            if (!q) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No quote</span>
                            return (
                              <span className={QUOTE_STATUS_BADGE[q.status]} title={`${q.id} · margin ${q.margin_pct}%`}>
                                {q.status}
                              </span>
                            )
                          })()}
                        </td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(i.employee_id)}</td>
                        <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{i.created_at}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="lt-icon-btn" title="View" onClick={() => setViewing(i)}>
                              <Eye size={12} />
                            </button>
                            <button
                              className="lt-icon-btn"
                              title={canFollowup ? 'Add Follow-up' : 'Restricted'}
                              onClick={() => { if (canFollowup) { setViewing(i); setFollowupFocused(true) } }}
                              disabled={!canFollowup}
                              style={{ opacity: canFollowup ? 1 : 0.4, cursor: canFollowup ? 'pointer' : 'not-allowed' }}
                            >
                              <MessageSquarePlus size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {procRows.length === 0 && (
                    <tr>
                      <td colSpan={20} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                        No inquiries match these filters.
                      </td>
                    </tr>
                  )}
                </>
              ) : (
                <>
              {filtered.map(i => {
                const isPending = i.status === 'pending'
                const cust = findCustomer(i.customer_name, customers)
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{i.id}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{i.customer_name}</span>
                        {cust && <span className={TIER_BADGE[cust.tier]}>{cust.tier}</span>}
                        {cust?.blacklisted && <span className="db-badge danger">Blacklisted</span>}
                        {cust?.credit_hold && !cust.blacklisted && <span className="db-badge warning">Credit Hold</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {i.containers && i.containers.length > 0
                        ? (() => {
                            const destinations = [...new Set(i.containers!.map(c => c.destination).filter(Boolean))]
                            return destinations.length > 0
                              ? destinations.map((dest, di) => (
                                  <div key={di} style={{ whiteSpace: 'nowrap' }}>
                                    <span style={{ color: 'var(--text)' }}>{i.origin || 'TBD'}</span>
                                    <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                                    <span style={{ color: 'var(--text)' }}>{dest}</span>
                                  </div>
                                ))
                              : <div style={{ whiteSpace: 'nowrap' }}>
                                  <span style={{ color: 'var(--text)' }}>{i.origin || 'TBD'}</span>
                                  <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                                  <span style={{ color: 'var(--text)' }}>{i.destination || 'TBD'}</span>
                                </div>
                          })()
                        : <div style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ color: 'var(--text)' }}>{i.origin}</span>
                            <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                            <span style={{ color: 'var(--text)' }}>{i.destination}</span>
                          </div>
                      }
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {i.priority && <span className={PRIORITY_BADGE[i.priority]}>{i.priority}</span>}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>
                      {i.containers && i.containers.length > 0
                        ? i.containers.map((c, ci) => (
                            <div key={ci} style={{ whiteSpace: 'nowrap' }}>{c.quantity}x {c.containerType}{i.containers!.length > 1 && c.destination ? ` → ${c.destination}` : ''}</div>
                          ))
                        : i.container_qty && i.container_type
                          ? `${i.container_qty}x ${i.container_type}`
                          : i.request
                      }
                      {i.special_equipment && i.special_equipment !== 'None' && (
                        <span className="db-badge warning" style={{ marginLeft: 4, fontSize: 9 }}>{i.special_equipment}</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>{i.sbu}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={`lt-pill ${isPending ? 'pending' : 'completed'}`}>
                        {isPending ? 'Pending' : 'Completed'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      {(() => {
                        const q = quoteByInquiry.get(i.id)
                        if (!q) return <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No quote</span>
                        return (
                          <span className={QUOTE_STATUS_BADGE[q.status]} title={`${q.id} · margin ${q.margin_pct}%`}>
                            {q.status}
                          </span>
                        )
                      })()}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(i.employee_id)}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{i.created_at}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="lt-icon-btn" title="View" onClick={() => setViewing(i)}>
                          <Eye size={12} />
                        </button>
                        <button
                          className="lt-icon-btn"
                          title={canComplete ? 'Mark Complete' : 'Restricted — requires CS or Sales role'}
                          onClick={() => canComplete && onCompleteById(i.id)}
                          disabled={!isPending || !canComplete}
                          style={{ opacity: isPending && canComplete ? 1 : 0.4, cursor: isPending && canComplete ? 'pointer' : 'not-allowed' }}
                        >
                          <CheckCircle2 size={12} />
                        </button>
                        <button
                          className="lt-icon-btn"
                          title={canFollowup ? 'Add Follow-up' : 'Restricted — requires CS, Sales, or Procurement role'}
                          onClick={() => { if (canFollowup) { setViewing(i); setFollowupFocused(true) } }}
                          disabled={!canFollowup}
                          style={{ opacity: canFollowup ? 1 : 0.4, cursor: canFollowup ? 'pointer' : 'not-allowed' }}
                        >
                          <MessageSquarePlus size={12} />
                        </button>
                        <button
                          className="lt-icon-btn"
                          title="Edit Customer"
                          onClick={() => { if (cust) setEditingCustomer(cust) }}
                          disabled={!cust}
                          style={{ opacity: cust ? 1 : 0.4, cursor: cust ? 'pointer' : 'not-allowed' }}
                        >
                          <Edit3 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={20} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No inquiries match these filters.
                  </td>
                </tr>
              )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      {viewing && (
        <div className="lt-modal-backdrop" onClick={() => { setViewing(null); setFollowupNote(''); setFollowupFocused(false) }}>
          <div className="lt-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{viewing.id}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{viewing.customer_name}</div>
              </div>
              <button className="lt-icon-btn" onClick={() => { setViewing(null); setFollowupNote(''); setFollowupFocused(false) }}><X size={14} /></button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {viewing.inquiry_text}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                ['Request', viewing.request],
                ['Origin', viewing.origin],
                ['Channel', viewing.channel],
                ['SBU', viewing.sbu],
                ['Status', viewing.status],
                ['Priority', viewing.priority ?? 'Not set'],
                ['Special Equipment', viewing.special_equipment && viewing.special_equipment !== 'None' ? viewing.special_equipment : 'None'],
                ['Preferred Liners', viewing.preferred_liners && viewing.preferred_liners.length > 0 ? viewing.preferred_liners.join(', ') : 'None'],
                ['Salesperson', empName(viewing.employee_id)],
                ['Date', viewing.created_at],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="lt-preview-row" style={{ padding: '6px 0' }}>
                  <span className="lt-preview-key">{k}</span>
                  <span className="lt-preview-val">{v}</span>
                </div>
              ))}
            </div>

            {/* Containers */}
            {viewing.containers && viewing.containers.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Containers ({viewing.containers.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {viewing.containers.map((c, ci) => (
                    <div key={ci} style={{ padding: '10px 12px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{c.quantity}x {c.containerType}</span>
                        {c.destination && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>→ {c.destination}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 16, color: 'var(--text-secondary)', fontSize: 11, flexWrap: 'wrap' }}>
                        <span><strong>Commodity:</strong> {c.commodityType}{c.commodityName ? ` — ${c.commodityName}` : ''}</span>
                        {c.weight !== '' && c.weight !== 0 && <span><strong>Weight:</strong> {c.weight} kg</span>}
                        <span><strong>{c.isFcl ? 'FCL' : 'LCL'}</strong></span>
                        {c.zipCode && <span><strong>Zip:</strong> {c.zipCode}</span>}
                        {c.doorAgents && c.doorAgents.length > 0 && <span><strong>Door Agent:</strong> {c.doorAgents.join(', ')}</span>}
                        {c.freeTime !== undefined && c.freeTime !== '' && c.freeTime !== 0 && <span><strong>Free Time:</strong> {c.freeTime} days</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {([
                    ['Destination', viewing.destination],
                    ['Commodity', viewing.commodity_type ?? 'Not set'],
                    ['Container', viewing.container_qty && viewing.container_type ? `${viewing.container_qty}x ${viewing.container_type}` : 'Not set'],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="lt-preview-row" style={{ padding: '6px 0' }}>
                      <span className="lt-preview-key">{k}</span>
                      <span className="lt-preview-val">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflow stepper */}
            {viewing.workflow_stage && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Workflow Progress
                </div>
                <WorkflowStepper
                  currentStage={viewing.workflow_stage}
                  onAdvance={(nextStage) => {
                    onAdvanceWorkflow(viewing.id, nextStage)
                    setViewing({ ...viewing, workflow_stage: nextStage })
                  }}
                />
              </div>
            )}

            {(() => {
              const inquiryFollowups = followups.filter(f => f.inquiry_id === viewing.id || f.customer_name.toLowerCase() === viewing.customer_name.toLowerCase())
              if (inquiryFollowups.length === 0) return null
              return (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                    Follow-up History ({inquiryFollowups.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {inquiryFollowups.map(f => (
                      <div key={f.id} style={{
                        padding: '8px 10px',
                        background: f.completion_flag ? 'rgba(22,163,74,0.06)' : 'rgba(217,119,6,0.04)',
                        border: `1px solid ${f.completion_flag ? 'rgba(22,163,74,0.18)' : 'rgba(217,119,6,0.12)'}`,
                        borderRadius: 8, fontSize: 12,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{empName(f.employee_id)}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{f.created_at}</span>
                        </div>
                        <div style={{ color: 'var(--text-secondary)' }}>
                          {f.note}
                          {f.completion_flag && <span style={{ color: '#15803d', marginLeft: 6, fontSize: 11 }}>· closed inquiry</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Add Follow-up form */}
            {canFollowup && viewing.status === 'pending' && (
              <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Add Follow-up
                </div>
                <textarea
                  ref={followupRef}
                  className="lt-input"
                  style={{ width: '100%', minHeight: 60, resize: 'vertical', marginBottom: 8, fontSize: 12 }}
                  placeholder="Write a follow-up note..."
                  value={followupNote}
                  onChange={e => setFollowupNote(e.target.value)}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="db-btn primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                    disabled={!followupNote.trim()}
                    onClick={() => {
                      onAddFollowup(viewing.customer_name, followupNote.trim(), false, activeEmployee.id)
                      setFollowupNote('')
                    }}
                  >
                    <Send size={11} /> Add Note
                  </button>
                  <button
                    className="db-btn"
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, background: 'rgba(22,163,74,0.08)', color: '#16a34a', borderColor: 'rgba(22,163,74,0.2)' }}
                    disabled={!followupNote.trim()}
                    onClick={() => {
                      onAddFollowup(viewing.customer_name, followupNote.trim(), true, activeEmployee.id)
                      setFollowupNote('')
                      setViewing({ ...viewing, status: 'completed' })
                    }}
                  >
                    <CheckCircle2 size={11} /> Complete & Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
