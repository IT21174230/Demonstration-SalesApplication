import { useMemo, useState, useRef, useEffect } from 'react'
import { Eye, CheckCircle2, MessageSquarePlus, X, Edit3, Send, Trash2, Check } from 'lucide-react'
import {
  EMPLOYEES, SBUS, INQUIRY_PRIORITIES, COMMODITY_TYPES, CONTAINER_TYPES, WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS, findCustomer,
  type Inquiry, type InquiryStatus, type Followup, type Customer, type SBU, type CustomerTier,
  type Quote, type QuoteStatus, type WorkflowStage, type InquiryPriority, type ContainerLine,
  type LinerRecord,
} from '../../types'
import { apiGetLiners } from '../../api'
import { useRole } from '../../RoleContext'
import CustomerEditModal from '../shared/CustomerEditModal'

interface InquiryListProps {
  inquiries: Inquiry[]
  followups: Followup[]
  customers: Customer[]
  quotes: Quote[]
  onCompleteById: (id: string) => void
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage, skipApi?: boolean) => void
  onUpdateCustomer: (customerName: string, patch: Partial<Omit<Customer, 'id'>>) => void
  onAddFollowup: (customerName: string, note: string, completionFlag: boolean, employeeId?: number) => void
  onFlash: (msg: string) => void
  onPatchInquiry: (
    inq_id: number,
    data: { sbu?: string; origin?: string; incoterm?: string; cargo_ready_date?: string; priority?: string; preferred_liners?: string; preferred_rate?: number; service_mode?: 'DOOR_TO_DOOR' | 'PORT_TO_PORT' | 'PORT_TO_DOOR' | 'DOOR_TO_PORT' },
    commodityPatches?: Array<{ com_id: number; data: { com_type?: string; hs_code?: string; weight?: number } }>,
    containerPatches?: Array<{ cont_id: number; data: { container_type?: string; temperature?: number; qty?: number; destination?: string; address?: string; zip_code?: string; is_fully_loaded?: boolean; free_time?: string } }>
  ) => void
  onDeleteInquiry: (inq_id: number) => void
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

// Reverse-map frontend priority labels → backend enum values for PATCH payload
const BE_PRIORITY_REV: Record<string, string> = {
  Low: 'LOW', Medium: 'MEDIUM', High: 'HIGH', Urgent: 'URGENT',
}

// Reverse-map frontend ContainerType labels → backend container_type codes for PATCH
const BE_CONTAINER_TYPE_REV: Record<string, string> = {
  '20 GP': '20GP', '40 GP': '40GP', '40 HC': '40HC',
  '20 REEFER': '20RF', '40 REEFER': '40RF',
  '20 OPEN TOP': '20OT', '40 OPEN TOP': '40OT',
  '20 FLAT RACK': '20FR', '40 FLAT RACK': '40FR',
}

type ContainerDraft = {
  com_id?: number
  cont_id?: number
  // Commodity fields — apiPatchCommodity
  com_type: string
  hs_code: string
  weight: string
  // Container fields — apiPatchContainer
  container_type: string
  qty: string
  destination: string
  zip_code: string
  address: string
  is_fully_loaded: boolean
  free_time: string
  temperature: string
}

type EditDraft = {
  origin: string
  sbu: string
  priority: string
  delivery_type: 'door-to-door' | 'port-to-port' | 'port-to-door' | 'door-to-port'
  incoterm: string
  cargo_ready_date: string
  preferred_rate: string
  preferred_liners: string
  containers: ContainerDraft[]
}

export default function InquiryList({ inquiries, followups, customers, quotes, onCompleteById, onUpdateCustomer, onAddFollowup, onFlash, onPatchInquiry, onDeleteInquiry }: InquiryListProps) {
  const { hasPermission, activeEmployee, activeRole } = useRole()
  const isProcurement = activeRole === 'Procurement'
  const canComplete = hasPermission('inquiry:complete')
  const canFollowup = hasPermission('followup:create')
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [followupNote, setFollowupNote] = useState('')
  const [followupFocused, setFollowupFocused] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const followupRef = useRef<HTMLTextAreaElement>(null)
  const [editingInquiry, setEditingInquiry] = useState<Inquiry | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [linerList, setLinerList] = useState<LinerRecord[]>([])
  useEffect(() => { apiGetLiners().then(setLinerList).catch(() => {}) }, [])
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
            commodityType: inq.commodity_type ?? 'Miscellaneous manufactured articles — furniture, toys',
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

  function openEdit(i: Inquiry) {
    setEditingInquiry(i)
    setEditDraft({
      origin: i.origin ?? '',
      sbu: i.sbu ?? '',
      priority: i.priority ?? '',
      delivery_type: i.delivery_type,
      incoterm: i.incoterm ?? '',
      cargo_ready_date: i.cargo_ready_date ?? '',
      preferred_rate: i.preferred_rate != null ? String(i.preferred_rate) : '',
      preferred_liners: i.preferred_liners?.join(', ') ?? '',
      containers: (i.containers ?? []).map(c => ({
        com_id: c.com_id,
        cont_id: c.cont_id,
        com_type: c.commodityType ?? '',
        hs_code: c.hs_code ?? '',
        weight: c.weight !== '' ? String(c.weight) : '',
        container_type: c.containerType ?? '',
        qty: String(c.quantity ?? 1),
        destination: c.destination ?? '',
        zip_code: c.zipCode ?? '',
        address: c.address ?? '',
        is_fully_loaded: c.isFcl,
        free_time: c.freeTime !== '' ? String(c.freeTime) : '',
        temperature: c.temperature != null ? String(c.temperature) : '',
      })),
    })
  }

  function updateContainerDraft(idx: number, patch: Partial<ContainerDraft>) {
    setEditDraft(d => {
      if (!d) return d
      return { ...d, containers: d.containers.map((c, i) => i === idx ? { ...c, ...patch } : c) }
    })
  }

  function handleSaveEdit() {
    if (!editingInquiry?.inq_id || !editDraft) return

    const commodityPatches = editDraft.containers
      .filter(c => c.com_id != null)
      .map(c => ({
        com_id: c.com_id!,
        data: {
          com_type:  c.com_type  || undefined,
          hs_code:   c.hs_code   || undefined,
          weight:    c.weight    ? (parseFloat(c.weight)  || undefined) : undefined,
        },
      }))

    const containerPatches = editDraft.containers
      .filter(c => c.cont_id != null)
      .map(c => ({
        cont_id: c.cont_id!,
        data: {
          container_type: c.container_type ? (BE_CONTAINER_TYPE_REV[c.container_type] ?? c.container_type) : undefined,
          qty:            c.qty            ? (parseInt(c.qty, 10)     || undefined) : undefined,
          destination:    c.destination    || undefined,
          zip_code:       c.zip_code       || undefined,
          address:        c.address        || undefined,
          is_fully_loaded: c.is_fully_loaded,
          free_time:      c.free_time      || undefined,
          temperature:    c.temperature    ? (parseFloat(c.temperature) || undefined) : undefined,
        },
      }))

    onPatchInquiry(
      editingInquiry.inq_id,
      {
        origin:           editDraft.origin           || undefined,
        sbu:              editDraft.sbu              || undefined,
        priority:         editDraft.priority         ? (BE_PRIORITY_REV[editDraft.priority] ?? editDraft.priority) : undefined,
        service_mode:     editDraft.delivery_type === 'door-to-door' ? 'DOOR_TO_DOOR'
          : editDraft.delivery_type === 'port-to-door' ? 'PORT_TO_DOOR'
          : editDraft.delivery_type === 'door-to-port' ? 'DOOR_TO_PORT'
          : 'PORT_TO_PORT',
        incoterm:         editDraft.incoterm         || undefined,
        cargo_ready_date: editDraft.cargo_ready_date || undefined,
        preferred_rate:   editDraft.preferred_rate   ? (parseFloat(editDraft.preferred_rate) || undefined) : undefined,
        preferred_liners: editDraft.preferred_liners || undefined,
      },
      commodityPatches,
      containerPatches,
    )
    setEditingInquiry(null)
    setEditDraft(null)
  }

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
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Cargo Ready Date</th>
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
                      {confirmDeleteId === i.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 11, color: '#dc2626', whiteSpace: 'nowrap' }}>Delete?</span>
                          <button
                            className="lt-icon-btn"
                            title="Confirm delete"
                            style={{ color: '#dc2626' }}
                            onClick={() => { onDeleteInquiry(i.inq_id!); setConfirmDeleteId(null) }}
                          >
                            <Check size={12} />
                          </button>
                          <button className="lt-icon-btn" title="Cancel" onClick={() => setConfirmDeleteId(null)}>
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
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
                            title={i.inq_id ? 'Edit Inquiry' : 'Edit Inquiry (not saved to backend)'}
                            onClick={() => openEdit(i)}
                            disabled={!i.inq_id}
                            style={{ opacity: i.inq_id ? 1 : 0.4, cursor: i.inq_id ? 'pointer' : 'not-allowed' }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button
                            className="lt-icon-btn"
                            title={i.inq_id ? 'Delete Inquiry' : 'Not saved to backend'}
                            onClick={() => i.inq_id && setConfirmDeleteId(i.id)}
                            disabled={!i.inq_id}
                            style={{ opacity: i.inq_id ? 1 : 0.4, cursor: i.inq_id ? 'pointer' : 'not-allowed', color: '#dc2626' }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
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

            {viewing.inquiry_text && (
              <div style={{ background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {viewing.inquiry_text}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {([
                ['Origin', viewing.origin],
                ['SBU', viewing.sbu],
                ['Status', viewing.status],
                ['Priority', viewing.priority ?? 'Not set'],
                ['Delivery Type', viewing.delivery_type === 'door-to-door' ? 'Door to Door' : viewing.delivery_type === 'port-to-door' ? 'Port to Door' : viewing.delivery_type === 'door-to-port' ? 'Door to Port' : 'Port to Port'],
                ['Incoterm', viewing.incoterm ?? 'Not set'],
                ['Cargo Ready Date', viewing.cargo_ready_date ?? viewing.created_at ?? 'Not set'],
                ['Preferred Rate', viewing.preferred_rate != null ? `USD ${viewing.preferred_rate.toLocaleString()}` : 'Not set'],
                ['Preferred Liners', viewing.preferred_liners && viewing.preferred_liners.length > 0 ? viewing.preferred_liners.join(', ') : 'None'],
                ['Salesperson', empName(viewing.employee_id)],
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
                        {c.hs_code && <span><strong>HS Code:</strong> {c.hs_code}</span>}
                        {c.weight !== '' && c.weight !== 0 && <span><strong>Weight:</strong> {c.weight} kg</span>}
                        <span><strong>{c.isFcl ? 'FCL' : 'LCL'}</strong></span>
                        {c.zipCode && <span><strong>Zip:</strong> {c.zipCode}</span>}
                        {c.address && <span><strong>Address:</strong> {c.address}</span>}
                        {c.doorAgents && c.doorAgents.length > 0 && <span><strong>Door Agent:</strong> {c.doorAgents.join(', ')}</span>}
                        {c.freeTime !== undefined && c.freeTime !== '' && c.freeTime !== 0 && <span><strong>Free Time:</strong> {c.freeTime} days</span>}
                        {c.temperature != null && <span><strong>Temp:</strong> {c.temperature}°C</span>}
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

            {/* Workflow progress */}
            {viewing.workflow_stage && (() => {
              const stages = WORKFLOW_STAGES
              const currentIdx = stages.findIndex(s => s.id === viewing.workflow_stage)
              const current = stages[currentIdx]
              if (!current) return null
              const roleColor = ROLE_COLORS[current.role]
              const isCompleted = viewing.workflow_stage === 'completed'
              return (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Workflow Progress
                  </div>

                  {/* Segmented stage bar */}
                  <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>
                    {stages.map((s, idx) => {
                      const done = idx < currentIdx
                      const active = idx === currentIdx
                      const color = ROLE_COLORS[s.role]
                      return (
                        <div
                          key={s.id}
                          title={`${s.label} — ${ROLE_LABELS[s.role]}`}
                          style={{
                            flex: 1,
                            height: 5,
                            borderRadius: 3,
                            background: done || active ? color : 'var(--border)',
                            opacity: active ? 1 : done ? 0.6 : 0.2,
                            transition: 'opacity 0.2s',
                          }}
                        />
                      )
                    })}
                  </div>

                  {/* Current stage callout */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{
                      padding: '2px 7px',
                      background: roleColor + '18',
                      color: roleColor,
                      border: `1px solid ${roleColor}30`,
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                    }}>
                      {isCompleted ? `${stages.length} / ${stages.length}` : `Step ${currentIdx + 1} of ${stages.length}`}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {current.label}
                    </span>
                    <span style={{ fontSize: 11, color: roleColor, marginLeft: 'auto', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {isCompleted ? '✓ Complete' : `Handled by ${ROLE_LABELS[current.role]}`}
                    </span>
                  </div>

                  {/* Next stage hint */}
                  {!isCompleted && stages[currentIdx + 1] && (
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      Next: <span style={{ color: 'var(--text-secondary)' }}>{stages[currentIdx + 1].label}</span>
                      <span style={{ color: ROLE_COLORS[stages[currentIdx + 1].role], marginLeft: 4 }}>
                        — {ROLE_LABELS[stages[currentIdx + 1].role]}
                      </span>
                    </div>
                  )}
                </div>
              )
            })()}

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

      {/* Edit inquiry modal */}
      {editingInquiry && editDraft && (
        <div className="lt-modal-backdrop" onClick={() => { setEditingInquiry(null); setEditDraft(null) }}>
          <div className="lt-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{editingInquiry.id}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Edit Inquiry</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{editingInquiry.customer_name}</div>
              </div>
              <button className="lt-icon-btn" onClick={() => { setEditingInquiry(null); setEditDraft(null) }}><X size={14} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="lt-label">Origin</label>
                <input
                  className="lt-input"
                  style={{ width: '100%' }}
                  value={editDraft.origin}
                  onChange={e => setEditDraft(d => d && ({ ...d, origin: e.target.value }))}
                  placeholder="e.g. Colombo"
                />
              </div>
              <div>
                <label className="lt-label">SBU</label>
                <select
                  className="lt-select"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                  value={editDraft.sbu}
                  onChange={e => setEditDraft(d => d && ({ ...d, sbu: e.target.value }))}
                >
                  <option value="">— select —</option>
                  {SBUS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="lt-label">Priority</label>
                <select
                  className="lt-select"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                  value={editDraft.priority}
                  onChange={e => setEditDraft(d => d && ({ ...d, priority: e.target.value }))}
                >
                  <option value="">— select —</option>
                  {INQUIRY_PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="lt-label">Delivery Type</label>
                <select
                  className="lt-select"
                  style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                  value={editDraft.delivery_type}
                  onChange={e => setEditDraft(d => d && ({ ...d, delivery_type: e.target.value as 'door-to-door' | 'port-to-port' | 'port-to-door' | 'door-to-port' }))}
                >
                  <option value="port-to-port">Port to Port</option>
                  <option value="door-to-door">Door to Door</option>
                  <option value="port-to-door">Port to Door</option>
                  <option value="door-to-port">Door to Port</option>
                </select>
              </div>
              <div>
                <label className="lt-label">Incoterm</label>
                <input
                  className="lt-input"
                  style={{ width: '100%' }}
                  value={editDraft.incoterm}
                  onChange={e => setEditDraft(d => d && ({ ...d, incoterm: e.target.value }))}
                  placeholder="e.g. FOB, CIF, EXW, DDP"
                />
              </div>
              <div>
                <label className="lt-label">Cargo Ready Date</label>
                <input
                  type="date"
                  className="lt-input"
                  style={{ width: '100%' }}
                  value={editDraft.cargo_ready_date}
                  onChange={e => setEditDraft(d => d && ({ ...d, cargo_ready_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="lt-label">Preferred Rate (USD)</label>
                <input
                  type="number"
                  className="lt-input"
                  style={{ width: '100%' }}
                  value={editDraft.preferred_rate}
                  onChange={e => setEditDraft(d => d && ({ ...d, preferred_rate: e.target.value }))}
                  placeholder="e.g. 1200"
                  min={0}
                />
              </div>
              <div>
                <label className="lt-label">Preferred Liners</label>
                <input
                  list="il-liners"
                  className="lt-input"
                  style={{ width: '100%' }}
                  value={editDraft.preferred_liners}
                  onChange={e => setEditDraft(d => d && ({ ...d, preferred_liners: e.target.value }))}
                  placeholder="e.g. MSC, Maersk, CMA CGM"
                />
                <datalist id="il-liners">
                  {linerList.map(l => <option key={l.lin_id} value={l.name} />)}
                </datalist>
              </div>
            </div>

            {editDraft.containers.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Containers ({editDraft.containers.length})
                </div>
                {editDraft.containers.map((cd, ci) => (
                  <div key={ci} style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>Container {ci + 1}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="lt-label">Commodity Type</label>
                        <select
                          className="lt-select"
                          style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                          value={cd.com_type}
                          onChange={e => updateContainerDraft(ci, { com_type: e.target.value })}
                        >
                          {COMMODITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="lt-label">HS Code</label>
                        <input
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.hs_code}
                          onChange={e => updateContainerDraft(ci, { hs_code: e.target.value })}
                          placeholder="e.g. 6205.20"
                        />
                      </div>
                      <div>
                        <label className="lt-label">Weight (kg)</label>
                        <input
                          type="number"
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.weight}
                          onChange={e => updateContainerDraft(ci, { weight: e.target.value })}
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="lt-label">Container Type</label>
                        <select
                          className="lt-select"
                          style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                          value={cd.container_type}
                          onChange={e => updateContainerDraft(ci, { container_type: e.target.value })}
                        >
                          {CONTAINER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="lt-label">Quantity</label>
                        <input
                          type="number"
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.qty}
                          onChange={e => updateContainerDraft(ci, { qty: e.target.value })}
                          min={1}
                        />
                      </div>
                      <div>
                        <label className="lt-label">Load Type</label>
                        <select
                          className="lt-select"
                          style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
                          value={cd.is_fully_loaded ? 'fcl' : 'lcl'}
                          onChange={e => updateContainerDraft(ci, { is_fully_loaded: e.target.value === 'fcl' })}
                        >
                          <option value="fcl">FCL</option>
                          <option value="lcl">LCL</option>
                        </select>
                      </div>
                      <div>
                        <label className="lt-label">Destination</label>
                        <input
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.destination}
                          onChange={e => updateContainerDraft(ci, { destination: e.target.value })}
                          placeholder="e.g. Hamburg"
                        />
                      </div>
                      <div>
                        <label className="lt-label">Zip Code</label>
                        <input
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.zip_code}
                          onChange={e => updateContainerDraft(ci, { zip_code: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="lt-label">Address</label>
                        <input
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.address}
                          onChange={e => updateContainerDraft(ci, { address: e.target.value })}
                          placeholder="Door delivery address"
                        />
                      </div>
                      <div>
                        <label className="lt-label">Free Time (days)</label>
                        <input
                          type="number"
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.free_time}
                          onChange={e => updateContainerDraft(ci, { free_time: e.target.value })}
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="lt-label">Temperature (°C)</label>
                        <input
                          type="number"
                          className="lt-input"
                          style={{ width: '100%' }}
                          value={cd.temperature}
                          onChange={e => updateContainerDraft(ci, { temperature: e.target.value })}
                          placeholder="Reefer only"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="db-btn" onClick={() => { setEditingInquiry(null); setEditDraft(null) }}>Cancel</button>
              <button className="db-btn primary" onClick={handleSaveEdit}>Save Changes</button>
            </div>
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
