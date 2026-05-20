import { useMemo, useState } from 'react'
import { FileText, Plus, ShieldCheck, X, Send, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
import {
  EMPLOYEES, findCustomer,
  type Quote, type QuoteLine, type QuoteStatus, type QuoteType, type RateType,
  type Customer, type Inquiry,
} from '../../mockData'
import { apiSendQuotation } from '../../api'

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

const RATE_TYPES: RateType[] = ['Spot', 'Contractual', 'NAC', 'Convoy']
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
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all')
  const [customerFilter, setCustomerFilter] = useState('')
  const [showBuilder, setShowBuilder] = useState(!!preFillCustomer)
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
          <button className="db-btn primary" onClick={() => setShowBuilder(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={12} /> New Quote
          </button>
        </div>
      </div>

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

                {/* Action row — status transitions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {q.status === 'Awaiting Approval' && (
                    <>
                      <button className="db-btn primary" onClick={() => onSetQuoteStatus(q.id, 'Approved')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShieldCheck size={11} /> Approve
                      </button>
                      <button className="db-btn secondary" onClick={() => onSetQuoteStatus(q.id, 'Lost')}>Reject</button>
                    </>
                  )}
                  {(q.status === 'Draft' || q.status === 'Approved') && (
                    <button className="db-btn primary" onClick={() => handleSendClick(q)} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Send size={11} /> Send to Customer
                    </button>
                  )}
                  {q.status === 'Sent' && (
                    <>
                      <button className="db-btn primary" onClick={() => onSetQuoteStatus(q.id, 'Confirmed')} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={11} /> Mark Confirmed
                      </button>
                      <button className="db-btn secondary" onClick={() => onSetQuoteStatus(q.id, 'Lost')}>Mark Lost</button>
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
          preFillCustomer={preFillCustomer}
          onCancel={() => { setShowBuilder(false); onPreFillConsumed?.() }}
          onSave={data => {
            onAddQuote(data)
            setShowBuilder(false)
            onPreFillConsumed?.()
          }}
        />
      )}

      {sendTarget && (
        <SendQuotationModal
          quote={sendTarget}
          onCancel={() => setSendTarget(null)}
          onSent={handleSendComplete}
          onFlash={onFlash}
        />
      )}
    </div>
  )
}

// ============= Send Quotation Modal =============
function SendQuotationModal({
  quote, onCancel, onSent, onFlash,
}: {
  quote: Quote
  onCancel: () => void
  onSent: (quoteId: string) => void
  onFlash?: (msg: string) => void
}) {
  const [recipientEmail, setRecipientEmail] = useState('')
  const [quotationContent, setQuotationContent] = useState('')
  const [sending, setSending] = useState(false)

  const canSend = recipientEmail.trim() && recipientEmail.includes('@') && quotationContent.trim()

  const handleSend = async () => {
    if (!canSend || sending) return
    setSending(true)
    try {
      const res = await apiSendQuotation({
        customer_name: quote.customer_name,
        recipient_email: recipientEmail.trim(),
        quote_id: quote.id,
        quotation_content: quotationContent.trim(),
      })
      if (res.success) {
        onSent(quote.id)
      } else {
        onFlash?.(`Failed to send quotation: ${res.message}`)
      }
    } catch {
      onFlash?.('Failed to send quotation — check backend connection')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="lt-modal-backdrop" onClick={onCancel}>
      <div
        className="lt-modal"
        style={{ width: 640, maxWidth: '95%' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Send size={16} /> Send Quotation
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Send {quote.id} to {quote.customer_name} via email
            </div>
          </div>
          <button className="lt-icon-btn" onClick={onCancel}><X size={14} /></button>
        </div>

        {/* Quote summary */}
        <div style={{
          padding: '10px 14px', marginBottom: 14,
          background: 'rgba(79,70,229,0.03)', border: '1px solid rgba(79,70,229,0.12)',
          borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{quote.id}</span>
          {' · '}{quote.origin} → {quote.destination}
          {' · '}{quote.quote_type}
          {' · '}{quote.lines.length} option{quote.lines.length === 1 ? '' : 's'}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label className="lt-label">Recipient Email</label>
          <input
            type="email"
            value={recipientEmail}
            onChange={e => setRecipientEmail(e.target.value)}
            placeholder="customer@example.com"
            className="lt-input"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="lt-label">Quotation Content</label>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
            Paste the quotation document content below. This will be included in the email body.
          </div>
          <textarea
            value={quotationContent}
            onChange={e => setQuotationContent(e.target.value)}
            placeholder="Paste your quotation content here..."
            className="lt-input"
            style={{
              width: '100%', minHeight: 180, resize: 'vertical',
              fontFamily: 'var(--font)', fontSize: 12, lineHeight: 1.6,
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="db-btn secondary" onClick={onCancel}>Cancel</button>
          <button
            className="db-btn primary"
            onClick={handleSend}
            disabled={!canSend || sending}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: canSend && !sending ? 1 : 0.5,
              cursor: canSend && !sending ? 'pointer' : 'not-allowed',
            }}
          >
            {sending ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
            {sending ? 'Sending...' : 'Send Quotation'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============= Quote Builder Modal =============
function QuoteBuilderModal({
  customers, inquiries, preFillCustomer, onCancel, onSave,
}: {
  customers: Customer[]
  inquiries: Inquiry[]
  preFillCustomer?: string
  onCancel: () => void
  onSave: (q: Omit<Quote, 'id' | 'created_at' | 'status' | 'approval_reason'>) => void
}) {
  const [customerName, setCustomerName] = useState(preFillCustomer ?? '')
  const cust = findCustomer(customerName, customers)
  // Try to pre-fill route from the customer's most recent pending inquiry.
  const linkedInquiry = useMemo(() => {
    if (!customerName) return undefined
    return inquiries.find(i => i.customer_name.toLowerCase() === customerName.toLowerCase() && i.status === 'pending')
  }, [customerName, inquiries])

  const [origin, setOrigin] = useState(linkedInquiry?.origin ?? cust?.location.split(',')[0].trim() ?? 'Colombo')
  const [destination, setDestination] = useState(linkedInquiry?.destination ?? '')
  const [quoteType, setQuoteType] = useState<QuoteType>('FCA')
  const [margin, setMargin] = useState<number>(cust?.min_margin_pct ?? 7)
  const [createdBy, setCreatedBy] = useState<number>(1)
  const [lines, setLines] = useState<QuoteLine[]>([
    { id: 'tmp-1', shipping_line: 'Maersk', rate_type: 'Contractual', base_rate_usd: 0, transit_days: 7, free_time_days: 14, transshipment_points: 'Direct', destination_charges_usd: 100 },
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
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, padding: '6px 10px', background: 'rgba(79,70,229,0.03)', border: '1px solid rgba(79,70,229,0.12)', borderRadius: 6 }}>
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
          <div style={{ background: 'rgba(79,70,229,0.03)', border: '1px solid rgba(79,70,229,0.12)', borderRadius: 8, padding: '10px 14px' }}>
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
                inquiry_id: linkedInquiry?.id,
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
