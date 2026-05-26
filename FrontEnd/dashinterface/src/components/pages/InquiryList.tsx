import { useMemo, useState } from 'react'
import { Eye, CheckCircle2, MessageSquarePlus, X } from 'lucide-react'
import {
  EMPLOYEES, SBUS, findCustomer, WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS,
  type Inquiry, type InquiryStatus, type Followup, type Customer, type SBU, type CustomerTier,
  type Quote, type QuoteStatus, type WorkflowStage,
} from '../../mockData'
import { useRole } from '../../RoleContext'
import WorkflowStepper from '../shared/WorkflowStepper'

interface InquiryListProps {
  inquiries: Inquiry[]
  followups: Followup[]
  customers: Customer[]
  quotes: Quote[]
  onCompleteById: (id: string) => void
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage) => void
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

const TIER_BADGE: Record<CustomerTier, string> = {
  'Key Account': 'db-badge accent',
  'Regular':     'db-badge muted',
  'Walk-in':     'db-badge purple',
}

export default function InquiryList({ inquiries, followups, customers, quotes, onCompleteById, onAdvanceWorkflow }: InquiryListProps) {
  const { hasPermission, activeRole } = useRole()
  const canComplete = hasPermission('inquiry:complete')
  const canFollowup = hasPermission('followup:create')
  // Map inquiry_id → most recent quote linked to it (for the Quote Status column).
  const quoteByInquiry = new Map<string, Quote>()
  for (const q of quotes) {
    if (q.inquiry_id) quoteByInquiry.set(q.inquiry_id, q)
  }
  const [customerFilter, setCustomerFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [employeeFilter, setEmployeeFilter] = useState<number | 'all'>('all')
  const [sbuFilter, setSbuFilter] = useState<SBUFilter>('all')
  const [dateFilter, setDateFilter] = useState('')
  const [viewing, setViewing] = useState<Inquiry | null>(null)

  const filtered = useMemo(() => {
    return inquiries.filter(i => {
      if (customerFilter && !i.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) return false
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (employeeFilter !== 'all' && i.employee_id !== employeeFilter) return false
      if (sbuFilter !== 'all' && i.sbu !== sbuFilter) return false
      if (dateFilter && !i.created_at.startsWith(dateFilter)) return false
      return true
    })
  }, [inquiries, customerFilter, statusFilter, employeeFilter, sbuFilter, dateFilter])

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
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
            <label className="lt-label">By Employee</label>
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
            <div className="db-chart-sub">Showing {filtered.length} of {inquiries.length}</div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Inquiry ID</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Route</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>SBU</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Inquiry Text</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Quote</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Date</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
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
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
                      <span style={{ color: 'var(--text)' }}>{i.origin}</span>
                      <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
                      <span style={{ color: 'var(--text)' }}>{i.destination}</span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', fontSize: 11 }}>{i.sbu}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', maxWidth: 320 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.inquiry_text}>
                        {i.inquiry_text}
                      </div>
                    </td>
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
                          onClick={() => canFollowup && setViewing(i)}
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
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    No inquiries match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View modal */}
      {viewing && (
        <div className="lt-modal-backdrop" onClick={() => setViewing(null)}>
          <div className="lt-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{viewing.id}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{viewing.customer_name}</div>
              </div>
              <button className="lt-icon-btn" onClick={() => setViewing(null)}><X size={14} /></button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {viewing.inquiry_text}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                ['Request', viewing.request],
                ['Origin', viewing.origin],
                ['Destination', viewing.destination],
                ['Channel', viewing.channel],
                ['SBU', viewing.sbu],
                ['Status', viewing.status],
                ['Employee', empName(viewing.employee_id)],
                ['Date', viewing.created_at],
              ].map(([k, v]) => (
                <div key={k} className="lt-preview-row" style={{ padding: '6px 0' }}>
                  <span className="lt-preview-key">{k}</span>
                  <span className="lt-preview-val">{v}</span>
                </div>
              ))}
            </div>

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
          </div>
        </div>
      )}
    </div>
  )
}
