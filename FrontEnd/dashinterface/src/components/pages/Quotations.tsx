import { useMemo, useState } from 'react'
import { FileText, Plus, ShieldCheck, X, Copy, ClipboardCheck, Trash2, CheckCircle2, Lock } from 'lucide-react'
import {
  EMPLOYEES, findCustomer,
  type Quote, type QuoteLine, type QuoteStatus, type QuoteType, type RateType,
  type Customer, type Inquiry,
} from '../../types'
import { useRole } from '../../RoleContext'

interface QuotationsProps {
  quotes: Quote[]
  customers: Customer[]
  inquiries: Inquiry[]
  onAddQuote: (q: Omit<Quote, 'id' | 'created_at' | 'status' | 'approval_reason'>) => Quote
  onSetQuoteStatus: (id: string, status: QuoteStatus) => void
  onFlash?: (msg: string) => void
  /** Optional: when set, opens the builder pre-filled (used by chat 'quote X' intent). */
  preFillCustomer?: string
  onPreFillConsumed?: () => void
}

const RATE_TYPES: RateType[] = ['Spot', 'Contractual', 'NAC', 'Volume-based', 'Convoy']
const QUOTE_TYPES: QuoteType[] = ['FCA', 'Domestic Included', 'Drayage', 'DDP']

const STATUS_BADGE: Record<QuoteStatus, string> = {
  'Draft':              'db-badge muted',
  'Awaiting Approval':  'db-badge warning',
  'Approved':           'db-badge accent',
  'Sent':               'db-badge purple',
  'Confirmed':          'db-badge success',
  'Lost':               'db-badge danger',
}

// Big Schedule stub (Phase 7) — pretend list of shipping lines per route lookup.
const BIG_SCHEDULE_LINES = ['Maersk', 'CMA CGM', 'MSC', 'Hapag-Lloyd', 'ONE', 'Evergreen', 'COSCO', 'OOCL']

export default function Quotations({
  quotes, customers, inquiries, onAddQuote, onSetQuoteStatus, onFlash, preFillCustomer, onPreFillConsumed,
}: QuotationsProps) {
  const { hasPermission } = useRole()
  const canCreate = hasPermission('quote:create')
  const canApprove = hasPermission('quote:approve')
  const canSendQuote = hasPermission('quote:send')
  const canConfirm = hasPermission('quote:confirm')
  const canReject = hasPermission('quote:reject')
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')
  const [customerFilter, setCustomerFilter] = useState('')
  const [showBuilder, setShowBuilder] = useState(!!preFillCustomer)
  // Tracks which inquiry triggered the builder (for pre-filling)
  const [builderInquiry, setBuilderInquiry] = useState<Inquiry | null>(null)
  const [sendTarget, setSendTarget] = useState<Quote | null>(null)

  const filtered = useMemo(() => {
    return quotes.filter(q => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false
      if (customerFilter && !q.customer_name.toLowerCase().includes(customerFilter.toLowerCase())) return false
      return true
    })
  }, [quotes, statusFilter, customerFilter])

  const counts = useMemo(() => {
    const map: Partial<Record<QuoteStatus, number>> = {}
    for (const q of quotes) map[q.status] = (map[q.status] ?? 0) + 1
    return map
  }, [quotes])

  // Inquiries whose rates have been checked and are waiting for a quotation to be drafted
  const readyToQuote = useMemo(() =>
    inquiries.filter(i => i.workflow_stage === 'quotation-prep'),
    [inquiries]
  )

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

  const totalLineRevenue = (q: Quote) =>
    q.lines.reduce((s, l) => s + l.base_rate_usd + l.destination_charges_usd, 0)
  const quoteSell = (q: Quote) => Math.round(totalLineRevenue(q) * (1 + q.margin_pct / 100))

  const handleSendClick = (q: Quote) => {
    setSendTarget(q)
  }

  const handleSendComplete = (quoteId: string) => {
    onSetQuoteStatus(quoteId, 'Sent')
    setSendTarget(null)
  }

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Quotations</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              {quotes.length} quotes · {counts['Awaiting Approval'] ?? 0} pending approval · {counts['Confirmed'] ?? 0} confirmed
            </div>
          </div>
          <button
            className="db-btn primary"
            onClick={() => canCreate && setShowBuilder(true)}
            disabled={!canCreate}
            title={canCreate ? 'Create a new quotation' : `Restricted — requires Sales role`}
            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: canCreate ? 1 : 0.4, cursor: canCreate ? 'pointer' : 'not-allowed' }}
          >
            {canCreate ? <Plus size={12} /> : <Lock size={10} />} New Quote
          </button>
        </div>
      </div>

      {/* Ready to Quote — inquiries at quotation-prep stage */}
      {readyToQuote.length > 0 && (
        <div className="db-chart-card" style={{ marginBottom: 18 }}>
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">Ready to Quote</div>
              <div className="db-chart-sub">{readyToQuote.length} {readyToQuote.length === 1 ? 'inquiry' : 'inquiries'} awaiting quotation</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {readyToQuote.map(inq => {
              const cust = findCustomer(inq.customer_name, customers)
              const cont = inq.containers?.[0]
              return (
                <div
                  key={inq.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    padding: '12px 14px',
                    background: 'rgba(15,143,168,0.03)',
                    border: '1px solid rgba(15,143,168,0.15)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{inq.id}</span>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>{inq.customer_name}</span>
                      {cust && <span className="db-badge accent">{cust.tier}</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {inq.origin} → {inq.destination}
                      {cont && <> · {cont.quantity}× {cont.containerType}</>}
                      {inq.cargo_ready_date && <> · CRD: {inq.cargo_ready_date}</>}
                    </div>
                  </div>
                  <button
                    className="db-btn primary"
                    disabled={!canCreate}
                    onClick={() => {
                      if (!canCreate) return
                      setBuilderInquiry(inq)
                      setShowBuilder(true)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                      whiteSpace: 'nowrap',
                      opacity: canCreate ? 1 : 0.4,
                      cursor: canCreate ? 'pointer' : 'not-allowed',
                    }}
                    title={canCreate ? 'Generate quotation for this inquiry' : 'Restricted — requires Sales role'}
                  >
                    <FileText size={11} /> Generate Quote
                  </button>
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
              onChange={e => setStatusFilter(e.target.value as QuoteStatus | 'all')}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {(['Draft', 'Awaiting Approval', 'Approved', 'Sent', 'Confirmed', 'Lost'] as QuoteStatus[]).map(s =>
                <option key={s} value={s}>{s}</option>,
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Quote list */}
      <div className="db-chart-card">
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Quotes</div>
            <div className="db-chart-sub">Showing {filtered.length} of {quotes.length}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(q => {
            const cust = findCustomer(q.customer_name, customers)
            const sell = quoteSell(q)
            const cost = totalLineRevenue(q)
            return (
              <div
                key={q.id}
                style={{
                  padding: '14px 16px',
                  background: '#ffffff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{q.id}</span>
                      <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 14 }}>{q.customer_name}</span>
                      {cust && <span className="db-badge muted">{cust.tier}</span>}
                      <span className={STATUS_BADGE[q.status]}>{q.status}</span>
                      <span className="db-badge accent">{q.quote_type}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {q.origin} → {q.destination} · {q.lines.length} option{q.lines.length === 1 ? '' : 's'} · margin {q.margin_pct}%
                      {q.inquiry_id && <> · linked to <span style={{ fontFamily: 'monospace' }}>{q.inquiry_id}</span></>}
                    </div>
                    {q.approval_reason && (
                      <div style={{ fontSize: 11, color: '#d97706', marginTop: 4, fontWeight: 600 }}>
                        ⚠ Awaiting approval — {q.approval_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>${sell.toLocaleString()}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>cost ${cost.toLocaleString()} + {q.margin_pct}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{empName(q.created_by)} · {q.created_at}</div>
                  </div>
                </div>

                {/* Rate lines table */}
                <div style={{ overflowX: 'auto', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em' }}>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Line</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Rate Type</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Base</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Transit</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Free Time</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Transship</th>
                        <th style={{ padding: '6px 6px', borderBottom: '1px solid var(--border)' }}>Dest. Chg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.lines.map(l => (
                        <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 6px', color: 'var(--text)', fontWeight: 600 }}>{l.shipping_line}</td>
                          <td style={{ padding: '6px 6px' }}>
                            <span className="db-badge muted">{l.rate_type}</span>
                          </td>
                          <td style={{ padding: '6px 6px', color: 'var(--text-secondary)' }}>${l.base_rate_usd}</td>
                          <td style={{ padding: '6px 6px', color: 'var(--text-muted)' }}>{l.transit_days}d</td>
                          <td style={{ padding: '6px 6px', color: 'var(--text-muted)' }}>{l.free_time_days}d</td>
                          <td style={{ padding: '6px 6px', color: 'var(--text-muted)' }}>{l.transshipment_points}</td>
                          <td style={{ padding: '6px 6px', color: 'var(--text-secondary)' }}>${l.destination_charges_usd}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Action row — status transitions (role-gated) */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {q.status === 'Awaiting Approval' && (
                    <>
                      <button
                        className="db-btn primary"
                        onClick={() => canApprove && onSetQuoteStatus(q.id, 'Approved')}
                        disabled={!canApprove}
                        title={canApprove ? 'Approve this quote' : 'Restricted — requires Finance role'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: canApprove ? 1 : 0.4, cursor: canApprove ? 'pointer' : 'not-allowed' }}
                      >
                        {canApprove ? <ShieldCheck size={11} /> : <Lock size={9} />} Approve
                      </button>
                      <button
                        className="db-btn secondary"
                        onClick={() => canReject && onSetQuoteStatus(q.id, 'Lost')}
                        disabled={!canReject}
                        title={canReject ? 'Reject this quote' : 'Restricted — requires Finance role'}
                        style={{ opacity: canReject ? 1 : 0.4, cursor: canReject ? 'pointer' : 'not-allowed' }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {(q.status === 'Draft' || q.status === 'Approved') && (
                    <button
                      className="db-btn primary"
                      onClick={() => canSendQuote && handleSendClick(q)}
                      disabled={!canSendQuote}
                      title={canSendQuote ? 'Copy quotation text and mark as sent' : 'Restricted — requires CS or Sales role'}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: canSendQuote ? 1 : 0.4, cursor: canSendQuote ? 'pointer' : 'not-allowed' }}
                    >
                      {canSendQuote ? <Copy size={11} /> : <Lock size={9} />} Copy & Send
                    </button>
                  )}
                  {q.status === 'Sent' && (
                    <>
                      <button
                        className="db-btn primary"
                        onClick={() => canConfirm && onSetQuoteStatus(q.id, 'Confirmed')}
                        disabled={!canConfirm}
                        title={canConfirm ? 'Mark confirmed' : 'Restricted — requires Sales role'}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: canConfirm ? 1 : 0.4, cursor: canConfirm ? 'pointer' : 'not-allowed' }}
                      >
                        {canConfirm ? <CheckCircle2 size={11} /> : <Lock size={9} />} Mark Confirmed
                      </button>
                      <button
                        className="db-btn secondary"
                        onClick={() => canReject && onSetQuoteStatus(q.id, 'Lost')}
                        disabled={!canReject}
                        style={{ opacity: canReject ? 1 : 0.4, cursor: canReject ? 'pointer' : 'not-allowed' }}
                      >
                        Mark Lost
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No quotes match these filters.
            </div>
          )}
        </div>
      </div>

      {showBuilder && (
        <QuoteBuilderModal
          customers={customers}
          inquiries={inquiries}
          preFillCustomer={builderInquiry?.customer_name ?? preFillCustomer}
          preFillInquiry={builderInquiry ?? undefined}
          onCancel={() => { setShowBuilder(false); setBuilderInquiry(null); onPreFillConsumed?.() }}
          onSave={data => {
            onAddQuote(data)
            setShowBuilder(false)
            setBuilderInquiry(null)
            onPreFillConsumed?.()
          }}
        />
      )}

      {sendTarget && (
        <CopyQuotationModal
          quote={sendTarget}
          customers={customers}
          onCancel={() => setSendTarget(null)}
          onSent={handleSendComplete}
          onFlash={onFlash}
        />
      )}
    </div>
  )
}

// ============= Copy Quotation Modal =============
function CopyQuotationModal({
  quote, customers, onCancel, onSent, onFlash,
}: {
  quote: Quote
  customers: Customer[]
  onCancel: () => void
  onSent: (quoteId: string) => void
  onFlash?: (msg: string) => void
}) {
  const [copied, setCopied] = useState(false)

  const cost = quote.lines.reduce((s, l) => s + l.base_rate_usd + l.destination_charges_usd, 0)
  const sell = Math.round(cost * (1 + quote.margin_pct / 100))
  const cust = customers.find(c => c.name.toLowerCase() === quote.customer_name.toLowerCase())
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const quotationText = [
    'FREIGHT QUOTATION',
    '',
    `Quote No:  ${quote.id}`,
    `Date:      ${today}`,
    `To:        ${quote.customer_name}${cust ? ` (${cust.tier})` : ''}`,
    `Service:   ${quote.quote_type}`,
    ...(quote.inquiry_id ? [`Reference: ${quote.inquiry_id}`] : []),
    '',
    `Route: ${quote.origin} → ${quote.destination}`,
    '',
    '─────────────────────────────────────────────',
    'RATE OPTIONS',
    '─────────────────────────────────────────────',
    ...quote.lines.flatMap((l, i) => [
      '',
      `Option ${i + 1}  —  ${l.shipping_line}`,
      `  Rate Type:            ${l.rate_type}`,
      `  Ocean Freight:        USD ${l.base_rate_usd.toLocaleString()}`,
      `  Destination Charges:  USD ${l.destination_charges_usd.toLocaleString()}`,
      `  Transit Time:         ${l.transit_days} days`,
      `  Free Time:            ${l.free_time_days} days`,
      `  Routing:              ${l.transshipment_points}`,
    ]),
    '',
    '─────────────────────────────────────────────',
    `QUOTED TOTAL:  USD ${sell.toLocaleString()}  (incl. ${quote.margin_pct}% margin)`,
    '─────────────────────────────────────────────',
    '',
    'Terms & Conditions:',
    '  • Rates valid for 5 working days from date of issue.',
    '  • Subject to space and equipment availability at time of booking.',
    '  • Subject to carrier surcharges in effect at time of shipment.',
    '  • All charges in USD unless otherwise stated.',
    '',
    'CLSynergy — Commercial Team',
  ].join('\n')

  const handleCopy = () => {
    navigator.clipboard.writeText(quotationText).then(() => {
      setCopied(true)
      onFlash?.('Quotation copied to clipboard')
      setTimeout(() => setCopied(false), 3000)
    }).catch(() => onFlash?.('Could not access clipboard — please copy manually'))
  }

  return (
    <div className="lt-modal-backdrop" onClick={onCancel}>
      <div
        className="lt-modal"
        style={{ width: 660, maxWidth: '95%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Copy size={16} /> Copy Quotation
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Copy the quotation below, then share it with {quote.customer_name} via your preferred channel
            </div>
          </div>
          <button className="lt-icon-btn" onClick={onCancel}><X size={14} /></button>
        </div>

        {/* Quote summary pill */}
        <div style={{
          padding: '8px 12px', marginBottom: 10,
          background: 'rgba(15,143,168,0.03)', border: '1px solid rgba(15,143,168,0.12)',
          borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{quote.id}</span>
          {' · '}{quote.origin} → {quote.destination}
          {' · '}{quote.quote_type}
          {' · '}{quote.lines.length} option{quote.lines.length === 1 ? '' : 's'}
          {' · '}<strong style={{ color: 'var(--text)' }}>USD {sell.toLocaleString()}</strong>
        </div>

        {/* Generated quotation text */}
        <textarea
          readOnly
          value={quotationText}
          style={{
            width: '100%', minHeight: 280, resize: 'vertical',
            fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
            padding: '10px 12px', border: '1px solid var(--border)',
            borderRadius: 8, background: 'rgba(0,0,0,0.02)', color: 'var(--text)',
            boxSizing: 'border-box', marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="db-btn secondary" onClick={onCancel}>Cancel</button>
          <button
            className="db-btn secondary"
            onClick={handleCopy}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {copied ? <ClipboardCheck size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>
          <button
            className="db-btn primary"
            onClick={() => onSent(quote.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <CheckCircle2 size={14} /> Mark as Sent
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= Quote Builder Modal =============
function QuoteBuilderModal({
  customers, inquiries, preFillCustomer, preFillInquiry, onCancel, onSave,
}: {
  customers: Customer[]
  inquiries: Inquiry[]
  preFillCustomer?: string
  preFillInquiry?: Inquiry
  onCancel: () => void
  onSave: (q: Omit<Quote, 'id' | 'created_at' | 'status' | 'approval_reason'>) => void
}) {
  const [customerName, setCustomerName] = useState(preFillInquiry?.customer_name ?? preFillCustomer ?? '')
  const cust = findCustomer(customerName, customers)
  // Try to pre-fill route from the customer's most recent pending inquiry (fallback when no direct inquiry is provided).
  const linkedInquiry = useMemo(() => {
    if (preFillInquiry) return preFillInquiry
    if (!customerName) return undefined
    return inquiries.find(i => i.customer_name.toLowerCase() === customerName.toLowerCase() && i.status === 'pending')
  }, [customerName, inquiries, preFillInquiry])

  const [origin, setOrigin] = useState(preFillInquiry?.origin ?? linkedInquiry?.origin ?? cust?.location.split(',')[0].trim() ?? 'Colombo')
  const [destination, setDestination] = useState(preFillInquiry?.destination ?? linkedInquiry?.destination ?? '')
  const [quoteType, setQuoteType] = useState<QuoteType>('FCA')
  const [margin, setMargin] = useState<number>(cust?.min_margin_pct ?? 7)
  const [createdBy, setCreatedBy] = useState<number>(1)
  const [lines, setLines] = useState<QuoteLine[]>([
    {
      id: 'tmp-1',
      shipping_line: preFillInquiry?.preferred_liners?.[0] ?? 'Maersk',
      rate_type: 'Contractual',
      base_rate_usd: preFillInquiry?.preferred_rate ?? 0,
      transit_days: 7,
      free_time_days: 14,
      transshipment_points: 'Direct',
      destination_charges_usd: 100,
    },
  ])

  const addLine = () => {
    setLines(prev => [...prev, {
      id: `tmp-${prev.length + 1}-${Date.now()}`,
      shipping_line: BIG_SCHEDULE_LINES[prev.length % BIG_SCHEDULE_LINES.length],
      rate_type: 'Contractual',
      base_rate_usd: 0,
      transit_days: 7,
      free_time_days: 14,
      transshipment_points: 'Direct',
      destination_charges_usd: 100,
    }])
  }

  const updateLine = (id: string, patch: Partial<QuoteLine>) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))
  }

  const removeLine = (id: string) => {
    setLines(prev => prev.filter(l => l.id !== id))
  }

  const cost = lines.reduce((s, l) => s + l.base_rate_usd + l.destination_charges_usd, 0)
  const sell = Math.round(cost * (1 + margin / 100))
  const minMargin = cust?.min_margin_pct ?? 7
  const willNeedApproval = !!cust && margin < minMargin

  const canSave = customerName.trim() && origin.trim() && destination.trim() && lines.length > 0 && lines.every(l => l.shipping_line && l.base_rate_usd > 0)

  return (
    <div className="lt-modal-backdrop" onClick={onCancel}>
      <div
        className="lt-modal"
        style={{ width: 880, maxWidth: '95%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={16} /> New Quote
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Build a multi-option quote · auto-routes for approval if margin &lt; customer floor
            </div>
          </div>
          <button className="lt-icon-btn" onClick={onCancel}><X size={14} /></button>
        </div>

        {/* Customer + route */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label className="lt-label">Customer</label>
            <input
              list="qb-customers"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Customer name"
              className="lt-input"
              style={{ width: '100%' }}
            />
            <datalist id="qb-customers">
              {customers.map(c => <option key={c.id} value={c.name} />)}
            </datalist>
            {cust && (
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                {cust.tier} · {cust.payment_terms} · floor {cust.min_margin_pct}%
                {cust.blacklisted && <span style={{ color: '#dc2626', marginLeft: 6 }}>· blacklisted</span>}
                {cust.credit_hold && <span style={{ color: '#d97706', marginLeft: 6 }}>· credit hold</span>}
              </div>
            )}
          </div>
          <div>
            <label className="lt-label">Origin</label>
            <input value={origin} onChange={e => setOrigin(e.target.value)} className="lt-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="lt-label">Destination</label>
            <input value={destination} onChange={e => setDestination(e.target.value)} className="lt-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="lt-label">Quote Type</label>
            <select value={quoteType} onChange={e => setQuoteType(e.target.value as QuoteType)} className="lt-select" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}>
              {QUOTE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        {/* Big Schedule stub hint (Phase 7.1) */}
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, padding: '6px 10px', background: 'rgba(15,143,168,0.03)', border: '1px solid rgba(15,143,168,0.12)', borderRadius: 6 }}>
          📡 Big Schedule lines available for this route: {BIG_SCHEDULE_LINES.join(', ')} (stub data — real integration in Phase 2)
        </div>

        {/* Rate lines */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label className="lt-label" style={{ marginBottom: 0 }}>Rate Options ({lines.length})</label>
            <button className="db-btn secondary" onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <Plus size={11} /> Add line
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em' }}>
                  <th style={{ padding: '6px 4px' }}>Line</th>
                  <th style={{ padding: '6px 4px' }}>Type</th>
                  <th style={{ padding: '6px 4px' }}>Base $</th>
                  <th style={{ padding: '6px 4px' }}>Transit</th>
                  <th style={{ padding: '6px 4px' }}>Free</th>
                  <th style={{ padding: '6px 4px' }}>Via</th>
                  <th style={{ padding: '6px 4px' }}>Dest $</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id}>
                    <td style={{ padding: '4px 4px' }}>
                      <input value={l.shipping_line} onChange={e => updateLine(l.id, { shipping_line: e.target.value })} className="lt-input" style={{ width: 110, padding: '6px 8px' }} list="qb-lines" />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <select value={l.rate_type} onChange={e => updateLine(l.id, { rate_type: e.target.value as RateType })} className="lt-select" style={{ padding: '6px 8px' }}>
                        {RATE_TYPES.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={l.base_rate_usd} onChange={e => updateLine(l.id, { base_rate_usd: Number(e.target.value) })} className="lt-input" style={{ width: 80, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={l.transit_days} onChange={e => updateLine(l.id, { transit_days: Number(e.target.value) })} className="lt-input" style={{ width: 60, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={l.free_time_days} onChange={e => updateLine(l.id, { free_time_days: Number(e.target.value) })} className="lt-input" style={{ width: 60, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input value={l.transshipment_points} onChange={e => updateLine(l.id, { transshipment_points: e.target.value })} className="lt-input" style={{ width: 110, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" value={l.destination_charges_usd} onChange={e => updateLine(l.id, { destination_charges_usd: Number(e.target.value) })} className="lt-input" style={{ width: 80, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      <button className="lt-icon-btn" onClick={() => removeLine(l.id)} disabled={lines.length === 1}><Trash2 size={11} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id="qb-lines">
              {BIG_SCHEDULE_LINES.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
        </div>

        {/* Margin + employee + summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 10, alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <label className="lt-label">Margin %</label>
            <input type="number" value={margin} onChange={e => setMargin(Number(e.target.value))} className="lt-input" style={{ width: '100%' }} />
          </div>
          <div>
            <label className="lt-label">Created by</label>
            <select value={createdBy} onChange={e => setCreatedBy(Number(e.target.value))} className="lt-select" style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}>
              {EMPLOYEES.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div style={{ background: 'rgba(15,143,168,0.03)', border: '1px solid rgba(15,143,168,0.12)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quote total</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>${sell.toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>cost ${cost.toLocaleString()} + {margin}%</div>
          </div>
        </div>

        {/* Approval banner if margin under floor */}
        {willNeedApproval && (
          <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.2)', borderRadius: 8, marginBottom: 12, fontSize: 12, color: '#b45309', fontWeight: 600 }}>
            ⚠ This quote will be flagged Awaiting Approval — margin {margin}% is below {cust!.name}'s floor of {minMargin}%.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="db-btn secondary" onClick={onCancel}>Cancel</button>
          <button
            className="db-btn primary"
            onClick={() => {
              if (!canSave) return
              onSave({
                inquiry_id: preFillInquiry?.id ?? linkedInquiry?.id,
                customer_name: customerName.trim(),
                origin: origin.trim(),
                destination: destination.trim(),
                quote_type: quoteType,
                margin_pct: margin,
                created_by: createdBy,
                lines: lines.map((l, i) => ({ ...l, id: `QL-${100 + i}-${Date.now()}` })),
              })
            }}
            disabled={!canSave}
            style={{ opacity: canSave ? 1 : 0.5, cursor: canSave ? 'pointer' : 'not-allowed' }}
          >
            {willNeedApproval ? 'Submit for Approval' : 'Save Quote'}
          </button>
        </div>
      </div>
    </div>
  )
}
