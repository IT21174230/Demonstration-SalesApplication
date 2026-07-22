import { useMemo, useState, useEffect, useRef, Fragment, type ReactNode } from 'react'
import { Eye, Pencil, MessageSquarePlus, X, RefreshCw, Loader2, Save, Send } from 'lucide-react'
import {
  RATE_SOURCE_COLORS,
  type UnifiedRate, type RateSourceType,
  type LinerRecord, type TradeLaneRecord,
} from '../../types'
import { apiFetchAllRates, apiUpdateRate, apiGetLiners, apiGetTradeLanes } from '../../api'
import { useRole } from '../../RoleContext'

// Rate types visible to CS and Sales (read-only, no record access)
const CS_SALES_ALLOWED: RateSourceType[] = ['FAK', 'Tariff Rate', 'Spot']

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

type SourceFilter = 'all' | RateSourceType
type LinerFilter  = 'all' | string
type LaneFilter   = 'all' | string

const SOURCE_OPTIONS: RateSourceType[] = [
  'Contracted', 'FAK', 'Spot', 'Tariff Rate', 'NAC', 'Special',
]

// ---------------------------------------------------------------------------
// Dynamic column definitions per rate type
// ---------------------------------------------------------------------------

interface ColDef {
  key: string
  label: string
  render: (r: UnifiedRate) => ReactNode
}

const TH: React.CSSProperties = { padding: '10px 8px', borderBottom: '1px solid var(--border)' }
const TD: React.CSSProperties = { padding: '12px 8px' }
const MONO: React.CSSProperties = { ...TD, color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11 }
const MUTED: React.CSSProperties = { ...TD, color: 'var(--text-muted)', fontSize: 11 }
const SEC: React.CSSProperties = { ...TD, color: 'var(--text-secondary)', fontSize: 11 }

const dash = <span style={{ color: 'var(--text-muted)' }}>—</span>

// Shared column builders
const colId: ColDef = {
  key: 'id', label: 'ID',
  render: r => <td style={MONO}>{r.id.split(':')[1] ?? r.id}</td>,
}
const colType: ColDef = {
  key: 'type', label: 'Type',
  render: r => {
    const c = RATE_SOURCE_COLORS[r.source_type]
    return (
      <td style={TD}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: c + '15', color: c, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap',
        }}>
          {r.source_type}
        </span>
      </td>
    )
  },
}
const colLiner: ColDef = {
  key: 'liner', label: 'Liner',
  render: r => <td style={{ ...TD, color: 'var(--text)', fontWeight: 600 }}>{r.liner_name ?? dash}</td>,
}
const colRoute: ColDef = {
  key: 'route', label: 'Origin → Destination',
  render: r => (
    <td style={{ ...TD, color: 'var(--text-secondary)', fontSize: 12, whiteSpace: 'nowrap' }}>
      {r.origin && r.destination ? (
        <>
          <span style={{ color: 'var(--text)' }}>{r.origin}</span>
          <span style={{ margin: '0 6px', color: 'var(--text-muted)' }}>→</span>
          <span style={{ color: 'var(--text)' }}>{r.destination}</span>
        </>
      ) : dash}
    </td>
  ),
}
const colOrigin: ColDef = {
  key: 'origin', label: 'Origin',
  render: r => <td style={{ ...TD, color: 'var(--text)' }}>{r.origin || dash}</td>,
}
const colDestination: ColDef = {
  key: 'destination', label: 'Destination',
  render: r => <td style={{ ...TD, color: 'var(--text)' }}>{r.destination || dash}</td>,
}
const colContainer: ColDef = {
  key: 'container', label: 'Container Type',
  render: r => <td style={SEC}>{r.container_type ?? dash}</td>,
}
const colRate: ColDef = {
  key: 'rate', label: 'Rate',
  render: r => <td style={{ ...TD, fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{r.rate != null ? `$${r.rate.toLocaleString()}` : '—'}</td>,
}
const colCurrency: ColDef = {
  key: 'currency', label: 'Currency',
  render: r => <td style={MUTED}>{r.currency}</td>,
}
const colTradeLane: ColDef = {
  key: 'tradeLane', label: 'Trade Lane',
  render: r => <td style={SEC}>{r.trade_lane ?? dash}</td>,
}
const colValidFrom: ColDef = {
  key: 'validFrom', label: 'Valid From',
  render: r => <td style={MUTED}>{r.valid_from ?? '—'}</td>,
}
const colValidTo: ColDef = {
  key: 'validTo', label: 'Valid To',
  render: r => <td style={MUTED}>{r.valid_to ?? '—'}</td>,
}
const colSoldStatus: ColDef = {
  key: 'sold', label: 'Sold',
  render: r => (
    <td style={TD}>
      {r.is_sold === true && <span className="db-badge danger" style={{ fontSize: 10 }}>Sold</span>}
      {r.is_sold === false && <span className="db-badge accent" style={{ fontSize: 10 }}>Available</span>}
      {r.is_sold == null && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
    </td>
  ),
}
const colVessel: ColDef = {
  key: 'vessel', label: 'Vessel',
  render: r => <td style={SEC}>{r.vessel_name ?? dash}</td>,
}
const colDepartureDate: ColDef = {
  key: 'departure', label: 'Departure',
  render: r => <td style={MUTED}>{r.departure_date ?? '—'}</td>,
}
const colServiceScope: ColDef = {
  key: 'scope', label: 'Service Lane',
  render: r => {
    if (!r.service_scope) return <td style={MUTED}>—</td>
    const scopeColor: Record<string, string> = { Import: '#2563eb', Export: '#059669', Within: '#d97706' }
    const c = scopeColor[r.service_scope] ?? 'var(--text-secondary)'
    return (
      <td style={TD}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
          background: c + '12', color: c, letterSpacing: '0.3px',
        }}>
          {r.service_scope}
        </span>
      </td>
    )
  },
}

// NAC-specific columns
const colClient: ColDef = {
  key: 'client', label: 'Customer',
  render: r => <td style={{ ...TD, color: 'var(--text)', fontWeight: 600 }}>{r.client_name ?? dash}</td>,
}

const colEmployee: ColDef = {
  key: 'employee', label: 'Salesperson',
  render: r => <td style={SEC}>{r.employee_name ?? dash}</td>,
}

// Special-specific columns
const colCommodityName: ColDef = {
  key: 'commodityName', label: 'Commodity',
  render: r => <td style={{ ...TD, color: 'var(--text)', fontWeight: 600 }}>{r.commodity_name ?? dash}</td>,
}
const colCommodityType: ColDef = {
  key: 'commodityType', label: 'Commodity Type',
  render: r => <td style={SEC}>{r.commodity_type ?? dash}</td>,
}

// Columns per rate type
const COLUMNS_BY_TYPE: Record<SourceFilter, ColDef[]> = {
  all:           [colId, colType, colServiceScope, colLiner, colRoute, colContainer, colRate, colCurrency, colTradeLane, colValidFrom, colValidTo],
  Contracted:    [colId, colServiceScope, colLiner, colTradeLane, colContainer, colRate, colCurrency, colValidFrom, colValidTo],
  FAK:           [colId, colServiceScope, colLiner, colTradeLane, colContainer, colRate, colCurrency, colValidFrom, colValidTo],
  Spot:          [colId, colServiceScope, colLiner, colTradeLane, colContainer, colRate, colCurrency, colVessel, colDepartureDate, colValidFrom, colValidTo, colSoldStatus],
  'Tariff Rate': [colId, colServiceScope, colLiner, colTradeLane, colContainer, colRate, colCurrency, colValidFrom, colValidTo],
  NAC:           [colId, colServiceScope, colClient, colEmployee, colOrigin, colDestination, colTradeLane, colRate, colCurrency, colValidFrom, colValidTo],
  Special:       [colId, colServiceScope, colCommodityName, colCommodityType, colRate, colCurrency, colValidFrom, colValidTo],
}

// Detail fields per rate type (for the view modal)
function detailFields(r: UnifiedRate): [string, string][] {
  const common: [string, string][] = [
    ['Service Lane', r.service_scope ?? '—'],
    ['Rate', r.rate != null ? `$${r.rate.toLocaleString()}` : '—'],
    ['Currency', r.currency],
    ['Valid From', r.valid_from ?? '—'],
    ['Valid To', r.valid_to ?? '—'],
  ]
  switch (r.source_type) {
    case 'Contracted':
    case 'FAK':
      return [
        ['Liner', r.liner_name ?? '—'],
        ['Trade Lane', r.trade_lane ?? '—'],
        ['Container Type', r.container_type ?? '—'],
        ...common,
      ]
    case 'Spot':
      return [
        ['Liner', r.liner_name ?? '—'],
        ['Trade Lane', r.trade_lane ?? '—'],
        ['Container Type', r.container_type ?? '—'],
        ['Vessel', r.vessel_name ?? '—'],
        ['Departure Date', r.departure_date ?? '—'],
        ...common,
        ['Sold', r.is_sold === true ? 'Yes' : r.is_sold === false ? 'No' : '—'],
      ]
    case 'Tariff Rate':
      return [
        ['Liner', r.liner_name ?? '—'],
        ['Trade Lane', r.trade_lane ?? '—'],
        ['Container Type', r.container_type ?? '—'],
        ...common,
      ]
    case 'NAC':
      return [
        ['Customer', r.client_name ?? '—'],
        ['Salesperson', r.employee_name ?? '—'],
        ['Origin', r.origin || '—'],
        ['Destination', r.destination || '—'],
        ['Trade Lane', r.trade_lane ?? '—'],
        ...common,
      ]
    case 'Special':
      return [
        ['Commodity', r.commodity_name ?? '—'],
        ['Commodity Type', r.commodity_type ?? '—'],
        ...common,
      ]
    default:
      return common
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RateList() {
  const { activeRole } = useRole()
  const isRestrictedRole = activeRole === 'CS' || activeRole === 'Sales'

  // ---- Data state ----
  const [rates, setRates] = useState<UnifiedRate[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const [liners, setLiners] = useState<LinerRecord[]>([])
  const [tradeLanes, setTradeLanes] = useState<TradeLaneRecord[]>([])

  // ---- Filter state ----
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [linerFilter, setLinerFilter]   = useState<LinerFilter>('all')
  const [laneFilter, setLaneFilter]     = useState<LaneFilter>('all')
  const [originFilter, setOriginFilter] = useState('')
  const [destFilter, setDestFilter]     = useState('')
  const [containerFilter, setContainerFilter] = useState('')

  // ---- View modal + inline note ----
  const [viewing, setViewing] = useState<UnifiedRate | null>(null)
  const [remarkFocused, setRemarkFocused] = useState(false)
  const [remarkText, setRemarkText] = useState('')
  const [remarkSaving, setRemarkSaving] = useState(false)
  const remarkRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus the remark textarea when opened via note icon
  useEffect(() => {
    if (remarkFocused && remarkRef.current) {
      remarkRef.current.focus()
      remarkRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [remarkFocused, viewing])

  const openNote = (r: UnifiedRate) => {
    setViewing(r)
    setRemarkText(r.remark ?? '')
    setRemarkFocused(true)
  }

  const handleRemarkSave = () => {
    if (!viewing) return
    setRemarkSaving(true)
    apiUpdateRate(viewing.id, { remark: remarkText.trim() || null })
      .then(() => {
        setViewing(null)
        setRemarkFocused(false)
        loadRates()
      })
      .catch(() => alert('Failed to save remark'))
      .finally(() => setRemarkSaving(false))
  }

  // ---- Edit modal ----
  const [editing, setEditing] = useState<UnifiedRate | null>(null)
  const [editForm, setEditForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  const openEdit = (r: UnifiedRate) => {
    setEditing(r)
    setEditForm({
      rate: r.rate ?? '',
      currency: r.currency ?? 'USD',
      valid_from: r.valid_from ?? '',
      valid_to: r.valid_to ?? '',
      remark: r.remark ?? '',
      container_type: r.container_type ?? '',
      is_sold: r.is_sold ?? false,
      origin: r.origin ?? '',
      destination: r.destination ?? '',
      departure_date: r.departure_date ?? '',
    })
  }

  const ef = (key: string) => editForm[key] as string
  const setEf = (key: string, val: unknown) => setEditForm(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    if (!editing) return
    setSaving(true)
    const payload: Record<string, unknown> = {}
    const t = editing.source_type
    // common
    if (editForm.rate !== '') payload.rate = Number(editForm.rate)
    payload.currency = editForm.currency
    payload.valid_from = editForm.valid_from || null
    payload.valid_to = editForm.valid_to || null
    payload.remark = editForm.remark || null
    // type-specific
    if (['Contracted', 'FAK', 'Spot', 'Tariff Rate'].includes(t)) {
      payload.container_type = editForm.container_type || null
    }
    if (t === 'Spot') {
      payload.is_sold = editForm.is_sold
    }
    if (t === 'Spot') {
      payload.departure_date = editForm.departure_date || null
    }
    if (t === 'NAC') {
      payload.origin = editForm.origin || null
      payload.destination = editForm.destination || null
    }
    apiUpdateRate(editing.id, payload)
      .then(() => { setEditing(null); loadRates() })
      .catch(() => alert('Failed to update rate'))
      .finally(() => setSaving(false))
  }

  // ---- Fetch reference data on mount ----
  useEffect(() => {
    apiGetLiners().then(setLiners).catch(() => {})
    apiGetTradeLanes().then(setTradeLanes).catch(() => {})
    loadRates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadRates = () => {
    setLoading(true)
    apiFetchAllRates()
      .then(data => { setRates(data); setLoaded(true) })
      .catch(err => { console.error('[RateList] apiFetchAllRates failed:', err); setLoaded(true) })
      .finally(() => setLoading(false))
  }

  // ---- Filtering ----
  const filtered = useMemo(() => {
    return rates.filter(r => {
      if (isRestrictedRole && !CS_SALES_ALLOWED.includes(r.source_type)) return false
      if (sourceFilter !== 'all' && r.source_type !== sourceFilter) return false
      if (linerFilter !== 'all' && (r.liner_name ?? '') !== linerFilter) return false
      if (laneFilter !== 'all' && (r.trade_lane ?? '') !== laneFilter) return false
      if (originFilter && !r.origin?.toLowerCase().includes(originFilter.toLowerCase())) return false
      if (destFilter && !r.destination?.toLowerCase().includes(destFilter.toLowerCase())) return false
      if (containerFilter && !(r.container_type ?? '').toLowerCase().includes(containerFilter.toLowerCase())) return false
      return true
    })
  }, [rates, sourceFilter, linerFilter, laneFilter, originFilter, destFilter, containerFilter, isRestrictedRole])

  // ---- Active columns based on selected type ----
  const columns = COLUMNS_BY_TYPE[sourceFilter]
  const colCount = columns.length + 1 // +1 for Actions column

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Rate List</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              View, filter and manage all freight rates across all rate tables
            </div>
          </div>
          <button
            className="db-btn primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            onClick={() => { setLoaded(false); loadRates() }}
            disabled={loading}
          >
            {loading ? <Loader2 size={13} className="spin" /> : <RefreshCw size={13} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
          <div>
            <label className="lt-label">By Rate Type</label>
            <select
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value as SourceFilter)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All Types</option>
              {(isRestrictedRole ? CS_SALES_ALLOWED : SOURCE_OPTIONS).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">By Liner</label>
            <select
              value={linerFilter}
              onChange={e => setLinerFilter(e.target.value)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {liners.map(l => (
                <option key={l.lin_id} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">By Trade Lane</label>
            <select
              value={laneFilter}
              onChange={e => setLaneFilter(e.target.value)}
              className="lt-select"
              style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
            >
              <option value="all">All</option>
              {tradeLanes.map(tl => (
                <option key={tl.trln_id} value={tl.trln_name}>{tl.trln_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lt-label">Origin</label>
            <input
              value={originFilter}
              onChange={e => setOriginFilter(e.target.value)}
              placeholder="Search origin..."
              className="lt-input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="lt-label">Destination</label>
            <input
              value={destFilter}
              onChange={e => setDestFilter(e.target.value)}
              placeholder="Search destination..."
              className="lt-input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label className="lt-label">Container Type</label>
            <input
              value={containerFilter}
              onChange={e => setContainerFilter(e.target.value)}
              placeholder="e.g. 40'HC..."
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
            <div className="db-chart-title">
              {sourceFilter === 'all' ? 'All Rates' : `${sourceFilter} Rates`}
            </div>
            <div className="db-chart-sub">
              {loaded
                ? `Showing ${filtered.length} of ${rates.length}`
                : loading ? 'Loading...' : 'Click Refresh to load rates'}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                {columns.map(col => (
                  <th key={col.key} style={TH}>{col.label}</th>
                ))}
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && !loaded ? (
                <tr>
                  <td colSpan={colCount} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="spin" style={{ marginBottom: 8, display: 'inline-block' }} />
                    <div style={{ fontSize: 13 }}>Loading rates from database...</div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={colCount} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                    {loaded ? 'No rates match these filters.' : 'No rates loaded yet.'}
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {columns.map(col => (
                      <Fragment key={col.key}>{col.render(r)}</Fragment>
                    ))}
                    <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                      <button className="lt-icon-btn" title="View Details" onClick={() => { setRemarkFocused(false); setRemarkText(r.remark ?? ''); setViewing(r) }} style={{ marginRight: 4 }}>
                        <Eye size={12} />
                      </button>
                      <button className="lt-icon-btn" title="Add Note" onClick={() => openNote(r)} style={{ marginRight: 4 }}>
                        <MessageSquarePlus size={12} />
                      </button>
                      {!isRestrictedRole && (
                        <button className="lt-icon-btn" title="Edit Rate" onClick={() => openEdit(r)}>
                          <Pencil size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
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
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {viewing.rate != null ? `$${viewing.rate.toLocaleString()}` : 'No rate'}
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: RATE_SOURCE_COLORS[viewing.source_type] + '15',
                    color: RATE_SOURCE_COLORS[viewing.source_type],
                    textTransform: 'uppercase',
                  }}>
                    {viewing.source_type}
                  </span>
                </div>
              </div>
              <button className="lt-icon-btn" onClick={() => setViewing(null)}><X size={14} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {detailFields(viewing).map(([k, v]) => (
                <div key={k} className="lt-preview-row" style={{ padding: '6px 0' }}>
                  <span className="lt-preview-key">{k}</span>
                  <span className="lt-preview-val">{v}</span>
                </div>
              ))}
            </div>

            {/* Existing remark display */}
            {viewing.remark && !remarkFocused && (
              <div style={{
                marginTop: 14, padding: '8px 10px',
                background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)',
                borderRadius: 8, fontSize: 12,
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Remark
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>{viewing.remark}</div>
              </div>
            )}

            {/* Add / Edit Note section */}
            <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                {viewing.remark ? 'Edit Note' : 'Add Note'}
              </div>
              <textarea
                ref={remarkRef}
                className="lt-input"
                style={{ width: '100%', minHeight: 60, resize: 'vertical', marginBottom: 8, fontSize: 12 }}
                placeholder="Write a note..."
                value={remarkText}
                onChange={e => setRemarkText(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  className="db-btn primary"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}
                  disabled={remarkSaving || remarkText.trim() === (viewing.remark ?? '')}
                  onClick={handleRemarkSave}
                >
                  {remarkSaving ? <Loader2 size={11} className="spin" /> : <Send size={11} />}
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — Procurement/Admin only */}
      {editing && !isRestrictedRole && (
        <div className="lt-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="lt-modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{editing.id}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  Edit Rate
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: RATE_SOURCE_COLORS[editing.source_type] + '15',
                    color: RATE_SOURCE_COLORS[editing.source_type],
                    textTransform: 'uppercase',
                  }}>
                    {editing.source_type}
                  </span>
                </div>
              </div>
              <button className="lt-icon-btn" onClick={() => setEditing(null)}><X size={14} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Rate */}
              <div>
                <label className="lt-label">Rate *</label>
                <input className="lt-input" type="number" style={{ width: '100%' }} min={0}
                  value={ef('rate')} onChange={e => setEf('rate', e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 2450.00" />
              </div>
              {/* Currency */}
              <div>
                <label className="lt-label">Currency</label>
                <input className="lt-input" style={{ width: '100%' }}
                  value={ef('currency')} onChange={e => setEf('currency', e.target.value)}
                  placeholder="USD" />
              </div>

              {/* Container Type — Contracted/FAK/Spot/Tariff Rate */}
              {['Contracted', 'FAK', 'Spot', 'Tariff Rate'].includes(editing.source_type) && (
                <div>
                  <label className="lt-label">Container Type</label>
                  <input className="lt-input" style={{ width: '100%' }}
                    value={ef('container_type')} onChange={e => setEf('container_type', e.target.value)}
                    placeholder="e.g. 40'HC" />
                </div>
              )}

              {/* Sold — Spot only */}
              {editing.source_type === 'Spot' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 22 }}>
                  <input type="checkbox" id="edit-is-sold"
                    checked={editForm.is_sold as boolean}
                    onChange={e => setEf('is_sold', e.target.checked)}
                    style={{ width: 16, height: 16 }} />
                  <label htmlFor="edit-is-sold" style={{ fontSize: 13, color: 'var(--text)' }}>Sold</label>
                </div>
              )}

              {/* Departure Date — Spot only */}
              {editing.source_type === 'Spot' && (
                <div>
                  <label className="lt-label">Departure Date</label>
                  <input className="lt-input" type="date" style={{ width: '100%' }}
                    value={ef('departure_date')} onChange={e => setEf('departure_date', e.target.value)} />
                </div>
              )}

              {/* Origin / Destination — NAC only */}
              {editing.source_type === 'NAC' && (
                <>
                  <div>
                    <label className="lt-label">Origin</label>
                    <input className="lt-input" style={{ width: '100%' }}
                      value={ef('origin')} onChange={e => setEf('origin', e.target.value)} />
                  </div>
                  <div>
                    <label className="lt-label">Destination</label>
                    <input className="lt-input" style={{ width: '100%' }}
                      value={ef('destination')} onChange={e => setEf('destination', e.target.value)} />
                  </div>
                </>
              )}

              {/* Valid From / To */}
              <div>
                <label className="lt-label">Valid From</label>
                <input className="lt-input" type="date" style={{ width: '100%' }}
                  value={ef('valid_from')} onChange={e => setEf('valid_from', e.target.value)} />
              </div>
              <div>
                <label className="lt-label">Valid To</label>
                <input className="lt-input" type="date" style={{ width: '100%' }}
                  value={ef('valid_to')} onChange={e => setEf('valid_to', e.target.value)} />
              </div>

              {/* Remark — full width */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label className="lt-label">Remark</label>
                <textarea className="lt-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }}
                  value={ef('remark')} onChange={e => setEf('remark', e.target.value)}
                  placeholder="Add a remark..." />
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button className="db-btn" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="db-btn primary" onClick={handleSave} disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
