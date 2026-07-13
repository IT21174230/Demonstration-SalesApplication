import { useState, useEffect } from 'react'
import { ArrowLeft, ChevronRight, FileDown, FileText, Globe, Loader2, PanelRight, Plus, Send, X } from 'lucide-react'
import {
  RATE_SOURCE_COLORS, COMMODITY_TYPES, portOptions,
  type Inquiry, type Customer, type ContainerLine, type UnifiedRate,
  type WorkflowStage, type ActivityEntry,
  type PortRecord, type LinerRecord, type TradeLaneRecord, type EmployeeRecord,
} from '../../mockData'
import { useRole } from '../../RoleContext'
import { apiSearchAllRates, apiGetPorts, apiGetLiners, apiGetTradeLanes, apiGetEmployeesDb } from '../../api'

type ManualRateTab = 'spot' | 'vessel-spot' | 'fak' | 'special'
const MR_TAB_LABELS: Record<ManualRateTab, string> = { spot: 'Spot Rate', 'vessel-spot': 'Vessel Spot', fak: 'FAK', special: 'Special Rate' }
const MR_CONTAINER_TYPES = ['20GP', '40GP', '40HC', '20 Reefer', '40 Reefer', '20 Flat Rack', '40 Flat Rack', '20 Open Tops', '40 Open Tops']
const MR_VESSEL_CONTAINER_TYPES = [...MR_CONTAINER_TYPES, 'Tanker']
interface MrContainerRate {
  containerType: string
  tus: string
  maxWeight: string
  rate: string
  currency: string
}

const SURCHARGE_TYPES = [
  'BAF', 'CAF', 'THC', 'PSS', 'GRI', 'EBS', 'ISPS',
  'Documentation Fee', 'Seal Fee', 'VGM Fee', 'Inland Haulage',
  'Wharfage', 'CFS Charge', 'Bill of Lading Fee', 'DDC', 'ORC',
]

interface ManualRateEntry {
  id: string
  tab: ManualRateTab
  liner: string
  tradeLane: string
  origin: string
  destination: string
  serviceLane: string
  salesperson: string
  containers: MrContainerRate[]
  validFrom: string
  validTo: string
  note: string
  specialRemark: string
  freeTime: string
  isSold: boolean
  isCancelled: boolean
  cancelReason: string
  vesselName: string
  voyage: string
  vesselEta: string
  vesselEtd: string
  fclOpenDate: string
  fclOpenTime: string
  fclCutDate: string
  fclCutTime: string
  commodityType: string
  commodityName: string
  surcharges: { type: string; amount: string; currency: string }[]
}

interface RateCheckProps {
  inquiry: Inquiry
  container?: ContainerLine
  customers: Customer[]
  variant: 'procurement' | 'cs-sales'
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage) => void
  onLogActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onGoBack: () => void
}

export default function RateCheck({
  inquiry, container, customers, variant,
  onAdvanceWorkflow, onLogActivity, onFlash, onGoBack,
}: RateCheckProps) {
  const { activeEmployee, activeRole } = useRole()
  const isProcurement = variant === 'procurement'

  // Mode toggle
  const [mode, setMode] = useState<'db-select' | 'manual-entry' | 'review'>('db-select')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // DB rate state
  const [dbRates, setDbRates] = useState<UnifiedRate[]>([])
  const [dbLoading, setDbLoading] = useState(false)
  const [dbSearched, setDbSearched] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Skip procurement flag (cs-sales only)
  const [skipProcurement, setSkipProcurement] = useState(false)

  // Reference data
  const [portList, setPortList] = useState<PortRecord[]>([])
  const [linerList, setLinerList] = useState<LinerRecord[]>([])
  const [tradeLaneList, setTradeLaneList] = useState<TradeLaneRecord[]>([])
  const [employeeList, setEmployeeList] = useState<EmployeeRecord[]>([])

  // Helpers to derive prefill values from inquiry / container
  const prefillDest = container?.destination || inquiry.destination
  const prefillContType = (() => {
    const raw = container?.containerType || inquiry.container_type || ''
    // Map Inquiry ContainerType (e.g. '20 GP', '40 HC', '20 REEFER') → manual form labels
    const map: Record<string, string> = {
      '20 GP': '20GP', '40 GP': '40GP', '40 HC': '40HC',
      '20 REEFER': '20 Reefer', '40 REEFER': '40 Reefer',
      '20 FLAT RACK': '20 Flat Rack', '40 FLAT RACK': '40 Flat Rack',
      '20 OPEN TOP': '20 Open Tops', '40 OPEN TOP': '40 Open Tops',
      'TANKER': 'Tanker',
    }
    return map[raw] || raw || '20GP'
  })()
  const prefillCommodityType = container?.commodityType || inquiry.commodity_type || ''
  const prefillCommodityName = container?.commodityName || ''
  const prefillWeight = String(container?.weight ?? inquiry.cargo_weight ?? '')

  // Manual rate entry state (procurement only)
  const [mrTab, setMrTab] = useState<ManualRateTab>('spot')
  const [mrLiner, setMrLiner] = useState('')
  const [mrLinerOther, setMrLinerOther] = useState(!inquiry.preferred_liners?.length)
  const [mrTradeLane, setMrTradeLane] = useState('')
  const [mrOrigin, setMrOrigin] = useState(inquiry.origin || '')
  const [mrDestination, setMrDestination] = useState(prefillDest || '')
  const [mrServiceLane, setMrServiceLane] = useState('')
  const [mrSalesperson, setMrSalesperson] = useState(activeEmployee.name || '')
  const defaultMrContainer = (): MrContainerRate => ({ containerType: prefillContType, tus: '', maxWeight: prefillWeight, rate: '', currency: 'USD' })
  const [mrContainers, setMrContainers] = useState<MrContainerRate[]>([defaultMrContainer()])
  const updateMrContainer = (idx: number, patch: Partial<MrContainerRate>) =>
    setMrContainers(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  const addMrContainer = () => setMrContainers(prev => [...prev, defaultMrContainer()])
  const removeMrContainer = (idx: number) => setMrContainers(prev => prev.filter((_, i) => i !== idx))
  const [mrValidFrom, setMrValidFrom] = useState('')
  const [mrValidTo, setMrValidTo] = useState('')
  const [mrNote, setMrNote] = useState('')
  const [mrSpecialRemark, setMrSpecialRemark] = useState('')
  const [mrFreeTime, setMrFreeTime] = useState('')
  const [mrIsSold, setMrIsSold] = useState(false)
  // Vessel Spot only
  const [mrVesselName, setMrVesselName] = useState('')
  const [mrVoyage, setMrVoyage] = useState('')
  const [mrVesselEta, setMrVesselEta] = useState('')
  const [mrVesselEtd, setMrVesselEtd] = useState('')
  const [mrFclOpenDate, setMrFclOpenDate] = useState('')
  const [mrFclOpenTime, setMrFclOpenTime] = useState('')
  const [mrFclCutDate, setMrFclCutDate] = useState('')
  const [mrFclCutTime, setMrFclCutTime] = useState('')
  const [mrIsCancelled, setMrIsCancelled] = useState(false)
  const [mrCancelReason, setMrCancelReason] = useState('')
  // Special only
  const [mrCommodityType, setMrCommodityType] = useState<string>(prefillCommodityType)
  const [mrCommodityName, setMrCommodityName] = useState(prefillCommodityName)
  const [mrSurcharges, setMrSurcharges] = useState<{ type: string; amount: string; currency: string }[]>([])

  // Multi-entry manual rates (procurement can add several rate types per inquiry)
  const [manualEntries, setManualEntries] = useState<ManualRateEntry[]>([])

  // Notes
  const [formNote, setFormNote] = useState('')

  // Derived values
  const dest = container?.destination || inquiry.destination
  const contType = container?.containerType || inquiry.container_type
  const custData = customers.find(c => c.name.toLowerCase() === inquiry.customer_name.toLowerCase())
  const canAddEntry = isProcurement && !!(mrLiner.trim() && mrContainers.some(c => c.rate.trim()))
  const hasManualEntries = manualEntries.length > 0
  const hasDbSelections = selectedIds.size > 0
  const containerLabel = container
    ? `${container.quantity}x ${container.containerType}`
    : inquiry.container_qty
      ? `${inquiry.container_qty}x ${inquiry.container_type ?? '20 GP'}`
      : ''

  // NAC visibility for cs-sales variant
  const canSeeNac = isProcurement || activeRole === 'Procurement' || activeRole === 'Admin' || (custData?.assigned_salesperson_id === activeEmployee.id)
  const visibleRates = canSeeNac ? dbRates : dbRates.filter(r => r.source_type !== 'NAC')
  const nacHidden = dbRates.length - visibleRates.length

  // Can proceed to review?
  const canReview = isProcurement
    ? (hasDbSelections || hasManualEntries)
    : (hasDbSelections || skipProcurement || (dbSearched && visibleRates.length === 0))

  // Auto-fetch DB rates on mount
  useEffect(() => {
    setDbLoading(true)
    apiSearchAllRates({ origin: inquiry.origin, destination: dest, container_type: contType })
      .then(rates => { setDbRates(rates); setDbSearched(true) })
      .catch(() => { setDbRates([]); setDbSearched(true) })
      .finally(() => setDbLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch reference data for manual entry (procurement only)
  useEffect(() => {
    if (!isProcurement) return
    apiGetPorts().then(setPortList).catch(() => {})
    apiGetLiners().then(setLinerList).catch(() => {})
    apiGetTradeLanes().then(setTradeLaneList).catch(() => {})
    apiGetEmployeesDb().then(emps => {
      setEmployeeList(emps)
      const assigned = emps.find(e => e.emp_id === inquiry.employee_id)
      if (assigned) setMrSalesperson(assigned.name)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Add current manual form as an entry to the brief
  const addEntryToBrief = () => {
    if (!canAddEntry) return
    setManualEntries(prev => [...prev, {
      id: `mr-${Date.now()}`,
      tab: mrTab, liner: mrLiner, tradeLane: mrTradeLane,
      origin: mrOrigin, destination: mrDestination,
      serviceLane: mrServiceLane, salesperson: mrSalesperson,
      containers: mrContainers.filter(c => c.rate.trim()),
      validFrom: mrValidFrom, validTo: mrValidTo,
      note: mrNote, specialRemark: mrSpecialRemark,
      freeTime: mrFreeTime, isSold: mrIsSold,
      isCancelled: mrIsCancelled, cancelReason: mrCancelReason,
      vesselName: mrVesselName, voyage: mrVoyage,
      vesselEta: mrVesselEta, vesselEtd: mrVesselEtd,
      fclOpenDate: mrFclOpenDate, fclOpenTime: mrFclOpenTime,
      fclCutDate: mrFclCutDate, fclCutTime: mrFclCutTime,
      commodityType: mrCommodityType, commodityName: mrCommodityName,
      surcharges: [...mrSurcharges],
    }])
    // Reset rate-specific fields; keep carrier & route
    setMrContainers([defaultMrContainer()]); setMrValidFrom(''); setMrValidTo('')
    setMrNote(''); setMrSpecialRemark('')
    setMrFreeTime(''); setMrIsSold(false)
    setMrIsCancelled(false); setMrCancelReason('')
    setMrVesselName(''); setMrVoyage('')
    setMrVesselEta(''); setMrVesselEtd('')
    setMrFclOpenDate(''); setMrFclOpenTime('')
    setMrFclCutDate(''); setMrFclCutTime('')
    setMrCommodityType(prefillCommodityType); setMrCommodityName(prefillCommodityName)
    setMrSurcharges([])
  }
  const removeEntry = (idx: number) => setManualEntries(prev => prev.filter((_, i) => i !== idx))

  // Summarise a single manual entry for activity log
  const summariseEntry = (e: ManualRateEntry) => {
    const p: string[] = [
      `type=${MR_TAB_LABELS[e.tab]}`,
      `liner=${e.liner || '?'}`,
      `route=${e.origin || '?'} → ${e.destination || '?'}`,
    ]
    const cSummary = e.containers.map(c => `${c.containerType || '?'}: ${c.rate || '0'} ${c.currency}`).join('; ')
    if (cSummary) p.push(`containers=[${cSummary}]`)
    if (e.tradeLane) p.push(`tradeLane=${e.tradeLane}`)
    if (e.freeTime) p.push(`freeDays=${e.freeTime}`)
    if (e.validFrom || e.validTo) p.push(`valid=${e.validFrom || '?'} → ${e.validTo || '?'}`)
    if (e.isSold) p.push('SOLD')
    if ((e.tab === 'spot' || e.tab === 'vessel-spot') && e.isCancelled) p.push(`CANCELLED: ${e.cancelReason || 'no reason'}`)
    if (e.tab === 'vessel-spot' && e.vesselName) p.push(`vessel=${e.vesselName}`)
    return p.join(', ')
  }

  // Submit handler
  const handleSubmit = () => {
    // Non-procurement branches remain simple
    if (!isProcurement && skipProcurement) {
      onAdvanceWorkflow(inquiry.id, 'quotation-prep')
      onLogActivity({
        actor_role: activeRole,
        actor_id: activeEmployee.id,
        action: `Rate check completed. Procurement escalation skipped — sent directly to Sales for quotation.`,
        ref_type: 'inquiry',
        ref_id: inquiry.id,
        customer_name: inquiry.customer_name,
        pushed_to: 'Sales',
        notes: formNote || `${inquiry.origin} → ${dest} — procurement escalation skipped`,
      })
      onFlash(`${inquiry.id} → Skipped Procurement, sent to Sales`)
      onGoBack()
      return
    }
    if (!isProcurement && !hasDbSelections) {
      onAdvanceWorkflow(inquiry.id, 'procurement-request')
      onLogActivity({
        actor_role: activeRole,
        actor_id: activeEmployee.id,
        action: `No suitable rates found. Escalated to Procurement for rate sourcing.`,
        ref_type: 'inquiry',
        ref_id: inquiry.id,
        customer_name: inquiry.customer_name,
        pushed_to: 'Procurement',
        notes: formNote || `${inquiry.origin} → ${dest} — escalated to procurement`,
      })
      onFlash(`${inquiry.id} → Escalated to Procurement`)
      onGoBack()
      return
    }

    // Combined: DB selections + manual entries (procurement) or DB only (cs-sales)
    const selected = hasDbSelections ? (isProcurement ? dbRates : visibleRates).filter(r => selectedIds.has(r.id)) : []
    const dbSummary = selected.map(r => `${r.liner_name || 'N/A'} ${r.source_type} $${r.rate ?? 0} (${r.container_type || 'N/A'})`).join('; ')
    const manualSummary = manualEntries.map(e => summariseEntry(e)).join(' || ')

    const totalCount = selected.length + manualEntries.length
    const actionParts: string[] = []
    if (selected.length) actionParts.push(`${selected.length} DB rate(s)`)
    if (manualEntries.length) actionParts.push(`${manualEntries.length} manual rate(s)`)

    onAdvanceWorkflow(inquiry.id, 'quotation-prep')

    const notesParts = [`Customer: ${inquiry.customer_name} (${custData?.tier ?? 'N/A'})`, `Route: ${inquiry.origin} → ${dest}`]
    if (dbSummary) notesParts.push(`DB Rates: ${dbSummary}`)
    if (manualSummary) notesParts.push(`Manual Rates: ${manualSummary}`)

    onLogActivity({
      actor_role: activeRole,
      actor_id: activeEmployee.id,
      action: isProcurement
        ? `Procurement rate check completed. ${actionParts.join(' + ')} sent to Sales.`
        : `Multi-source rate check completed. ${totalCount} rate(s) selected. Pushed to Sales for quotation.`,
      ref_type: 'inquiry',
      ref_id: inquiry.id,
      customer_name: inquiry.customer_name,
      pushed_to: 'Sales',
      notes: formNote ? `${formNote} | ${notesParts.join(' | ')}` : notesParts.join(' | '),
    })
    onFlash(isProcurement
      ? `${inquiry.id} → Rate brief sent to Sales (${actionParts.join(' + ')})`
      : `${inquiry.id} → ${totalCount} rate(s) sent to Sales`
    )
    onGoBack()
  }

  // Direct escalation to procurement (cs-sales, always available)
  const handleEscalate = () => {
    onAdvanceWorkflow(inquiry.id, 'procurement-request')
    onLogActivity({
      actor_role: activeRole,
      actor_id: activeEmployee.id,
      action: `Escalated to Procurement for rate sourcing.`,
      ref_type: 'inquiry',
      ref_id: inquiry.id,
      customer_name: inquiry.customer_name,
      pushed_to: 'Procurement',
      notes: formNote || `${inquiry.origin} → ${dest} — escalated to procurement`,
    })
    onFlash(`${inquiry.id} → Escalated to Procurement`)
    onGoBack()
  }

  // Resolve which rates list to display
  const displayRates = isProcurement ? dbRates : visibleRates

  // ── Render a single manual entry card in the rate brief ──
  const renderManualEntryBrief = (e: ManualRateEntry) => {
    const typeLabel = MR_TAB_LABELS[e.tab]
    const accent = ({ spot: RATE_SOURCE_COLORS['Spot'], 'vessel-spot': RATE_SOURCE_COLORS['Vessel-by-Vessel'], fak: RATE_SOURCE_COLORS['FAK'], special: RATE_SOURCE_COLORS['Special'] } as Record<ManualRateTab, string>)[e.tab] || '#d97706'
    return (
      <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
        <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>{typeLabel}</span>
          {e.liner}
          {e.tab === 'vessel-spot' && e.vesselName && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 11 }}>{e.vesselName}{e.voyage ? ` / ${e.voyage}` : ''}</span>}
        </div>
        {e.containers.map((c, ci) => (
          <div key={ci} style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: ci > 0 ? 1 : 0 }}>
            ${Number(c.rate).toLocaleString()} {c.currency} / {c.containerType}
            {c.tus ? ` · TUs: ${c.tus}` : ''}
            {c.maxWeight ? ` · Wt: ${c.maxWeight}` : ''}
          </div>
        ))}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
          {e.origin || '?'} → {e.destination || '?'}
          {e.tradeLane ? ` · ${e.tradeLane}` : ''}
          {e.serviceLane ? ` · SL: ${e.serviceLane}` : ''}
        </div>
        {(e.validFrom || e.validTo) && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
            Valid: {e.validFrom || '?'} → {e.validTo || '?'}
          </div>
        )}
        {e.freeTime && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Free Days: {e.freeTime}</div>}
        {e.tab === 'vessel-spot' && (e.vesselEta || e.vesselEtd) && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {e.vesselEtd ? `ETD: ${e.vesselEtd}` : ''}{e.vesselEta ? `${e.vesselEtd ? ' · ' : ''}ETA: ${e.vesselEta}` : ''}
          </div>
        )}
        {e.tab === 'vessel-spot' && (e.fclOpenDate || e.fclCutDate) && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {e.fclOpenDate ? `FCL Open: ${e.fclOpenDate}${e.fclOpenTime ? ` ${e.fclOpenTime}` : ''}` : ''}
            {e.fclCutDate ? `${e.fclOpenDate ? ' · ' : ''}FCL Cut: ${e.fclCutDate}${e.fclCutTime ? ` ${e.fclCutTime}` : ''}` : ''}
          </div>
        )}
        {e.tab === 'special' && (e.commodityType || e.commodityName) && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Commodity: {e.commodityType || '?'}{e.commodityName ? ` — ${e.commodityName}` : ''}
          </div>
        )}
        {e.tab === 'special' && e.surcharges.filter(s => s.type && s.amount).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Surcharges: {e.surcharges.filter(s => s.type && s.amount).map(s => `${s.type}: ${s.amount} ${s.currency}`).join(', ')}
          </div>
        )}
        <div style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 6 }}>
          {e.isSold && <span style={{ color: '#059669', fontWeight: 600 }}>SOLD</span>}
          {(e.tab === 'spot' || e.tab === 'vessel-spot') && e.isCancelled && <span style={{ color: '#dc2626', fontWeight: 600 }}>CANCELLED{e.cancelReason ? `: ${e.cancelReason}` : ''}</span>}
        </div>
        {e.salesperson && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Sales Contact: {e.salesperson}</div>}
        {e.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Note: {e.note}</div>}
        {e.specialRemark && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Remark: {e.specialRemark}</div>}
      </div>
    )
  }

  // ── Rate Brief Document (shared between edit preview and review screen) ──
  const renderRateBrief = () => {
    const selectedDbRates = hasDbSelections ? displayRates.filter(r => selectedIds.has(r.id)) : []
    if (!hasDbSelections && !hasManualEntries) return null

    return (
      <div className="ws-doc-preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <FileDown size={14} style={{ color: isProcurement ? '#d97706' : '#4f46e5' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Rate Brief</span>
        </div>
        <div className="ws-doc-body">
          <div className="ws-doc-header">RATE BRIEF</div>
          <div className="ws-doc-sub">ABC Logistics (Pvt) Ltd</div>
          <div className="ws-doc-divider" />
          <div className="ws-doc-section">Customer</div>
          <div className="ws-doc-row"><span>Name:</span><strong>{inquiry.customer_name}</strong></div>
          <div className="ws-doc-row"><span>Tier:</span><strong>{custData?.tier ?? 'N/A'}</strong></div>
          <div className="ws-doc-row"><span>Location:</span><strong>{custData?.location ?? 'N/A'}</strong></div>
          <div className="ws-doc-divider" />
          <div className="ws-doc-section">Inquiry</div>
          <div className="ws-doc-row"><span>Ref:</span><strong>{inquiry.id}</strong></div>
          <div className="ws-doc-row"><span>Route:</span><strong>{inquiry.origin} → {dest}</strong></div>
          <div className="ws-doc-row"><span>Request:</span><strong>{inquiry.request}</strong></div>
          <div className="ws-doc-row"><span>Channel:</span><strong>{inquiry.channel}</strong></div>

          {/* DB Rates section */}
          {selectedDbRates.length > 0 && <>
            <div className="ws-doc-divider" />
            <div className="ws-doc-section">{isProcurement ? 'Database Rates' : 'Selected Rates'}</div>
            {selectedDbRates.map(r => (
              <div key={r.id} style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{r.liner_name || 'N/A'} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({r.source_type})</span></div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  ${(r.rate ?? 0).toLocaleString()} {r.currency} / {r.container_type || 'N/A'}
                  {r.trade_lane && ` · ${r.trade_lane}`}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Valid: {r.valid_from || '?'} → {r.valid_to || '?'}
                  {r.vessel_name && ` · ${r.vessel_name}`}
                </div>
              </div>
            ))}
          </>}

          {/* Manual entries section */}
          {manualEntries.length > 0 && <>
            <div className="ws-doc-divider" />
            <div className="ws-doc-section">Manual Rates ({manualEntries.length})</div>
            {manualEntries.map(e => renderManualEntryBrief(e))}
          </>}

          <div className="ws-doc-divider" />
          <div className="ws-doc-row"><span>Prepared by:</span><strong>{activeEmployee.name} ({activeRole})</strong></div>
          <div className="ws-doc-row"><span>Date:</span><strong>{new Date().toISOString().slice(0, 10)}</strong></div>
        </div>
      </div>
    )
  }

  // ── Resolve review action label & color ──
  const getReviewAction = () => {
    if (hasDbSelections) {
      return {
        label: isProcurement ? 'Push to Sales' : `Send ${selectedIds.size} Rate(s) to Sales`,
        color: isProcurement ? '#d97706' : '#4f46e5',
        icon: isProcurement ? <Send size={12} /> : <ChevronRight size={12} />,
      }
    }
    if (!isProcurement && skipProcurement) {
      return { label: 'Skip Procurement — Send to Sales', color: '#d97706', icon: <ChevronRight size={12} /> }
    }
    if (!isProcurement) {
      return { label: 'Escalate to Procurement', color: '#d97706', icon: <ChevronRight size={12} /> }
    }
    // Procurement manual
    return { label: 'Push to Sales', color: '#d97706', icon: <Send size={12} /> }
  }

  const reviewAction = getReviewAction()

  // Section header styles for manual rate entry (matches RecordRate layout)
  const secHead: React.CSSProperties = { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', paddingBottom: 6, marginTop: 10 }
  const secDot = (color: string): React.CSSProperties => ({ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 })
  const mrAccent = ({ spot: RATE_SOURCE_COLORS['Spot'], 'vessel-spot': RATE_SOURCE_COLORS['Vessel-by-Vessel'], fak: RATE_SOURCE_COLORS['FAK'], special: RATE_SOURCE_COLORS['Special'] } as Record<ManualRateTab, string>)[mrTab] || '#d97706'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          className="lt-icon-btn"
          onClick={
            mode === 'review' ? () => setMode(hasManualEntries ? 'manual-entry' : 'db-select')
            : mode === 'manual-entry' ? () => setMode('db-select')
            : onGoBack
          }
          title={
            mode === 'review' ? 'Back to Edit'
            : mode === 'manual-entry' ? 'Back to Rate Check'
            : 'Back to Workspace'
          }
          style={{ padding: 6 }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} />
            {mode === 'manual-entry' ? 'Manual Rate Entry' : mode === 'review' ? 'Review Rate Brief' : 'Rate Check'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {inquiry.customer_name} · {inquiry.origin} → {dest}
            {containerLabel && ` · ${containerLabel}`}
          </div>
        </div>
      </div>

      {/* Card body */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
        {mode === 'db-select' ? (
          /* ════════════════ DB-SELECT SCREEN ════════════════ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ---- Banner ---- */}
            <div style={{ padding: '10px 14px', background: isProcurement ? 'rgba(79,70,229,0.06)' : 'rgba(8,145,178,0.06)', border: `1px solid ${isProcurement ? 'rgba(79,70,229,0.18)' : 'rgba(8,145,178,0.18)'}`, borderRadius: 8, fontSize: 12, color: isProcurement ? '#4f46e5' : '#0891b2', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={14} />
              {isProcurement
                ? <>Database rates for: <strong style={{ marginLeft: 4 }}>{inquiry.origin} → {dest}</strong>{contType && <span style={{ color: '#6366f1' }}> · {contType}</span>}</>
                : <>Multi-source rate check (AMS + Spot + INTTRA): <strong style={{ marginLeft: 4 }}>{inquiry.origin} → {dest}</strong>{container && <span style={{ marginLeft: 8, opacity: 0.8 }}>· {container.quantity}x {container.containerType}</span>}</>
              }
            </div>

            {/* ---- Loading ---- */}
            {dbLoading && (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
                <Loader2 size={18} className="spin" style={{ marginBottom: 6 }} />
                <div style={{ fontSize: 12 }}>Searching rate tables...</div>
              </div>
            )}

            {/* ---- No results ---- */}
            {dbSearched && displayRates.length === 0 && (
              isProcurement ? (
                <div style={{ padding: 10, background: 'rgba(100,116,139,0.04)', border: '1px solid rgba(100,116,139,0.15)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                  No matching rates in contracted, spot, NAC, or special rate tables.
                </div>
              ) : (
                <div style={{ padding: 16, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8 }}>
                  <div style={{ textAlign: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>No rates found</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      No matching rates across AMS, spot, or INTTRA for this route.
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(79,70,229,0.04)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                    <input type="checkbox" checked={skipProcurement} onChange={e => setSkipProcurement(e.target.checked)} />
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text)' }}>Skip Procurement Escalation</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Proceed directly to Sales for quotation without procurement sourcing</div>
                    </div>
                  </label>
                </div>
              )
            )}

            {/* ---- Rate results (grouped by source type) ---- */}
            {dbSearched && displayRates.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {displayRates.length} rate(s) {isProcurement ? 'from database' : 'found'} — select {isProcurement ? 'rates to include' : 'one or more to send to Sales'}
                  {!isProcurement && nacHidden > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({nacHidden} NAC rate{nacHidden > 1 ? 's' : ''} restricted)</span>}
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {(['Contracted', 'Tariff Rate', 'NAC'] as const).map(groupType => {
                    const groupRates = displayRates.filter(r => r.source_type === groupType)
                    if (groupRates.length === 0) return null
                    const groupColor = RATE_SOURCE_COLORS[groupType] || '#64748b'
                    return (
                      <div key={groupType}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                            background: `${groupColor}18`, color: groupColor, border: `1px solid ${groupColor}30`,
                          }}>
                            {groupType}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {groupRates.length} rate{groupRates.length > 1 ? 's' : ''}
                          </span>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          {groupRates.map(rate => {
                            const selected = selectedIds.has(rate.id)
                            return (
                              <label
                                key={rate.id}
                                className="ws-rate-row"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                  border: `1px solid ${selected ? (isProcurement ? '#4f46e5' : 'var(--accent)') : 'var(--border)'}`,
                                  borderRadius: 8, cursor: 'pointer',
                                  background: selected ? 'rgba(79,70,229,0.04)' : 'transparent',
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev)
                                      if (next.has(rate.id)) next.delete(rate.id)
                                      else next.add(rate.id)
                                      return next
                                    })
                                  }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {rate.liner_name || 'N/A'}
                                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>
                                      {rate.container_type || ''}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                    Valid: {rate.valid_from || '?'} → {rate.valid_to || '?'}
                                    {rate.trade_lane && ` · ${rate.trade_lane}`}
                                    {rate.vessel_name && ` · ${rate.vessel_name}`}
                                    {rate.is_sold && ' · SOLD'}
                                  </div>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                  ${(rate.rate ?? 0).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{rate.currency}</span>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {/* Any rates with other source types (FAK, Spot, etc.) */}
                  {displayRates.filter(r => !['Contracted', 'Tariff Rate', 'NAC'].includes(r.source_type)).length > 0 && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(100,116,139,0.1)', color: '#64748b', border: '1px solid rgba(100,116,139,0.2)' }}>
                          Other
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {displayRates.filter(r => !['Contracted', 'Tariff Rate', 'NAC'].includes(r.source_type)).length} rate{displayRates.filter(r => !['Contracted', 'Tariff Rate', 'NAC'].includes(r.source_type)).length > 1 ? 's' : ''}
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {displayRates.filter(r => !['Contracted', 'Tariff Rate', 'NAC'].includes(r.source_type)).map(rate => {
                          const selected = selectedIds.has(rate.id)
                          const badgeColor = RATE_SOURCE_COLORS[rate.source_type] || '#64748b'
                          return (
                            <label
                              key={rate.id}
                              className="ws-rate-row"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                border: `1px solid ${selected ? (isProcurement ? '#4f46e5' : 'var(--accent)') : 'var(--border)'}`,
                                borderRadius: 8, cursor: 'pointer',
                                background: selected ? 'rgba(79,70,229,0.04)' : 'transparent',
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => {
                                  setSelectedIds(prev => {
                                    const next = new Set(prev)
                                    if (next.has(rate.id)) next.delete(rate.id)
                                    else next.add(rate.id)
                                    return next
                                  })
                                }}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {rate.liner_name || 'N/A'}
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>
                                    {rate.source_type}
                                  </span>
                                  <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 12 }}>
                                    {rate.container_type || ''}
                                  </span>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                  Valid: {rate.valid_from || '?'} → {rate.valid_to || '?'}
                                  {rate.trade_lane && ` · ${rate.trade_lane}`}
                                  {rate.vessel_name && ` · ${rate.vessel_name}`}
                                  {rate.is_sold && ' · SOLD'}
                                </div>
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                                ${(rate.rate ?? 0).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{rate.currency}</span>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ---- INTTRA Coming Soon (procurement only) ---- */}
            {isProcurement && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>INTTRA Live Rates</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                <div style={{ padding: '20px 14px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.18)', borderRadius: 8, textAlign: 'center' }}>
                  <Globe size={20} style={{ color: '#d97706', marginBottom: 8 }} />
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#d97706' }}>COMING SOON — UNDER DEVELOPMENT</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>INTTRA live rate integration is currently being developed. Use database rates or enter rates manually below.</div>
                </div>
              </>
            )}

            {/* ---- Notes ---- */}
            {dbSearched && (
              <div>
                <label className="lt-label">Notes (optional)</label>
                <input className="lt-input" style={{ width: '100%' }} value={formNote}
                  onChange={e => setFormNote(e.target.value)}
                  placeholder={isProcurement ? 'Any notes for Sales...' : 'Any notes for the next team...'} />
              </div>
            )}

            {/* ---- Footer ---- */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
              {!isProcurement && (
                <button
                  className="db-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                    marginRight: 'auto',
                    background: 'rgba(79,70,229,0.06)', borderColor: '#4f46e5', color: '#4f46e5',
                  }}
                  onClick={handleEscalate}
                >
                  <ChevronRight size={12} /> Escalate to Procurement
                </button>
              )}
              <button className="db-btn" style={{ fontSize: 12 }} onClick={onGoBack}>Back to Workspace</button>
              {isProcurement && dbSearched && (
                <button
                  className="db-btn primary"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                    background: '#d97706', borderColor: '#d97706',
                  }}
                  onClick={() => setMode('manual-entry')}
                >
                  <Plus size={12} /> Enter Rates Manually
                </button>
              )}
              <button
                className="db-btn primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                  background: '#d97706', borderColor: '#d97706',
                  opacity: canReview ? 1 : 0.5,
                  cursor: canReview ? 'pointer' : 'not-allowed',
                }}
                disabled={!canReview}
                onClick={() => setMode('review')}
              >
                <FileDown size={12} /> Review &amp; Send
              </button>
            </div>
          </div>
        ) : mode === 'manual-entry' ? (
          /* ════════════════ MANUAL-ENTRY SCREEN ════════════════ */
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Main content area */}
            <div style={{ flex: 1, minWidth: 0, paddingRight: sidebarOpen ? 24 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Rate type tabs */}
                <div style={{ display: 'flex', gap: 0, background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid var(--border)' }}>
                  {(['spot', 'vessel-spot', 'fak', 'special'] as ManualRateTab[]).map(tab => (
                    <button
                      key={tab}
                      style={{
                        flex: 1, padding: '7px 10px', fontSize: 11, fontWeight: mrTab === tab ? 700 : 500,
                        background: mrTab === tab ? 'var(--card)' : 'transparent',
                        color: mrTab === tab ? 'var(--text)' : 'var(--text-muted)',
                        border: mrTab === tab ? '1px solid var(--border)' : '1px solid transparent',
                        borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onClick={() => setMrTab(tab)}
                    >
                      {MR_TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>

                {/* Fields grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {/* — Carrier & Service — */}
                  <div style={secHead}><span style={secDot(mrAccent)} />Carrier & Service</div>

                  <div>
                    <label className="lt-label">Liner <span style={{ color: '#dc2626' }}>*</span></label>
                    {!mrLinerOther ? (
                      <select
                        className="lt-input"
                        style={{ width: '100%' }}
                        value={mrLiner}
                        onChange={e => {
                          if (e.target.value === '__other__') {
                            setMrLinerOther(true)
                            setMrLiner('')
                          } else {
                            setMrLiner(e.target.value)
                          }
                        }}
                      >
                        <option value="">Select preferred liner</option>
                        {(inquiry.preferred_liners || []).map(l => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                        <option value="__other__">Other</option>
                      </select>
                    ) : (
                      <>
                        <input list="mr-liners" className="lt-input" style={{ width: '100%' }} value={mrLiner} onChange={e => setMrLiner(e.target.value)} placeholder="Type to search liners..." />
                        <datalist id="mr-liners">{linerList.map(l => <option key={l.lin_id} value={l.name} />)}</datalist>
                        {inquiry.preferred_liners?.length ? (
                          <button
                            type="button"
                            style={{ background: 'none', border: 'none', padding: 0, fontSize: 11, color: 'var(--accent)', cursor: 'pointer', marginTop: 3, textDecoration: 'underline' }}
                            onClick={() => { setMrLinerOther(false); setMrLiner('') }}
                          >
                            Back to preferred liners
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>

                  <div>
                    <label className="lt-label">Trade Lane</label>
                    <select className="lt-input" style={{ width: '100%' }} value={mrTradeLane} onChange={e => setMrTradeLane(e.target.value)}>
                      <option value="">Select trade lane</option>
                      {tradeLaneList.map(t => <option key={t.trln_id} value={t.trln_name}>{t.trln_name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="lt-label">Service Lane</label>
                    <input list="mr-svc-lanes" className="lt-input" style={{ width: '100%' }} value={mrServiceLane} onChange={e => setMrServiceLane(e.target.value)} placeholder="Type to search..." />
                    <datalist id="mr-svc-lanes">{tradeLaneList.map(t => <option key={t.trln_id} value={t.trln_name} />)}</datalist>
                  </div>

                  <div>
                    <label className="lt-label">Sales Contact</label>
                    <select className="lt-input" style={{ width: '100%' }} value={mrSalesperson} onChange={e => setMrSalesperson(e.target.value)}>
                      <option value="">Select sales contact</option>
                      {employeeList.map(e => <option key={e.emp_id} value={e.name}>{e.name}</option>)}
                    </select>
                  </div>

                  {/* — Vessel — (vessel-spot only) */}
                  {mrTab === 'vessel-spot' && <>
                    <div style={secHead}><span style={secDot(mrAccent)} />Vessel</div>
                    <div>
                      <label className="lt-label">Vessel Name</label>
                      <input className="lt-input" style={{ width: '100%' }} value={mrVesselName} onChange={e => setMrVesselName(e.target.value)} placeholder="e.g. Maersk Sealand" />
                    </div>
                    <div>
                      <label className="lt-label">Voyage</label>
                      <input className="lt-input" style={{ width: '100%' }} value={mrVoyage} onChange={e => setMrVoyage(e.target.value)} placeholder="e.g. 2607E" />
                    </div>
                    <div>
                      <label className="lt-label">Vessel ETA</label>
                      <input className="lt-input" style={{ width: '100%' }} type="date" value={mrVesselEta} onChange={e => setMrVesselEta(e.target.value)} />
                    </div>
                    <div>
                      <label className="lt-label">Vessel ETD</label>
                      <input className="lt-input" style={{ width: '100%' }} type="date" value={mrVesselEtd} onChange={e => setMrVesselEtd(e.target.value)} />
                    </div>
                    <div>
                      <label className="lt-label">FCL Opening</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="lt-input" style={{ flex: 1 }} type="date" value={mrFclOpenDate} onChange={e => setMrFclOpenDate(e.target.value)} />
                        <input className="lt-input" style={{ width: 100 }} type="time" value={mrFclOpenTime} onChange={e => setMrFclOpenTime(e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="lt-label">FCL Cutoff</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input className="lt-input" style={{ flex: 1 }} type="date" value={mrFclCutDate} onChange={e => setMrFclCutDate(e.target.value)} />
                        <input className="lt-input" style={{ width: 100 }} type="time" value={mrFclCutTime} onChange={e => setMrFclCutTime(e.target.value)} />
                      </div>
                    </div>
                  </>}

                  {/* — Route — */}
                  <div style={secHead}><span style={secDot(mrAccent)} />Route</div>
                  <div>
                    <label className="lt-label">Origin <span style={{ color: '#dc2626' }}>*</span></label>
                    <input list="mr-ports-o" className="lt-input" style={{ width: '100%' }} value={mrOrigin} onChange={e => setMrOrigin(e.target.value)} placeholder="e.g. Colombo/Sri Lanka or LKCMB" />
                    <datalist id="mr-ports-o">{portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}</datalist>
                  </div>
                  <div>
                    <label className="lt-label">Destination <span style={{ color: '#dc2626' }}>*</span></label>
                    <input list="mr-ports-d" className="lt-input" style={{ width: '100%' }} value={mrDestination} onChange={e => setMrDestination(e.target.value)} placeholder="e.g. Hamburg/Germany or DEHAM" />
                    <datalist id="mr-ports-d">{portOptions(portList).map((o, i) => <option key={i} value={o.value} label={o.label} />)}</datalist>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="lt-label">Free Days</label>
                    <input className="lt-input" style={{ width: '100%' }} value={mrFreeTime} onChange={e => setMrFreeTime(e.target.value)} placeholder="e.g. 14 days at origin, 21 days at destination" />
                  </div>

                  {/* — Commodity — (special only) */}
                  {mrTab === 'special' && <>
                    <div style={secHead}><span style={secDot(mrAccent)} />Commodity</div>
                    <div>
                      <label className="lt-label">Commodity Type</label>
                      <input list="mr-commodity-types" className="lt-input" style={{ width: '100%' }} value={mrCommodityType} onChange={e => setMrCommodityType(e.target.value)} placeholder="Select or type..." />
                      <datalist id="mr-commodity-types">{COMMODITY_TYPES.map(ct => <option key={ct} value={ct} />)}</datalist>
                    </div>
                    <div>
                      <label className="lt-label">Commodity Name</label>
                      <input className="lt-input" style={{ width: '100%' }} value={mrCommodityName} onChange={e => setMrCommodityName(e.target.value)} placeholder="e.g. Cotton T-shirts" />
                    </div>
                  </>}

                  {/* — Validity — */}
                  <div style={secHead}><span style={secDot(mrAccent)} />Validity</div>
                  <div>
                    <label className="lt-label">Valid From <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} type="date" value={mrValidFrom} onChange={e => setMrValidFrom(e.target.value)} />
                  </div>
                  <div>
                    <label className="lt-label">Valid To <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} type="date" value={mrValidTo} onChange={e => setMrValidTo(e.target.value)} />
                  </div>

                  {/* — Container Rates — */}
                  <div style={{ ...secHead, justifyContent: 'space-between' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={secDot(mrAccent)} />Container Rates</span>
                    <button type="button" className="db-btn" style={{ fontSize: 10, padding: '2px 8px', display: 'flex', alignItems: 'center', gap: 3 }} onClick={addMrContainer}><Plus size={11} /> Add</button>
                  </div>
                  {mrContainers.map((ct, idx) => (
                    <div key={idx} style={{ gridColumn: '1 / -1', border: '1px solid var(--border)', borderRadius: 10, padding: 14, background: 'var(--bg)', position: 'relative' }}>
                      {mrContainers.length > 1 && (
                        <button type="button" className="lt-icon-btn" title="Remove" style={{ position: 'absolute', top: 8, right: 8, padding: 3 }} onClick={() => removeMrContainer(idx)}>
                          <X size={13} />
                        </button>
                      )}
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Container {idx + 1}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label className="lt-label">Container Type <span style={{ color: '#dc2626' }}>*</span></label>
                          <select className="lt-input" style={{ width: '100%' }} value={ct.containerType} onChange={e => updateMrContainer(idx, { containerType: e.target.value })}>
                            {(mrTab === 'vessel-spot' ? MR_VESSEL_CONTAINER_TYPES : MR_CONTAINER_TYPES).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="lt-label">TUs</label>
                          <input className="lt-input" style={{ width: '100%' }} value={ct.tus} onChange={e => updateMrContainer(idx, { tus: e.target.value })} placeholder="e.g. 10" />
                        </div>
                        <div>
                          <label className="lt-label">Max Weight</label>
                          <input className="lt-input" style={{ width: '100%' }} value={ct.maxWeight} onChange={e => updateMrContainer(idx, { maxWeight: e.target.value })} placeholder="e.g. 28000 kg" />
                        </div>
                        <div>
                          <label className="lt-label">Rate <span style={{ color: '#dc2626' }}>*</span></label>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input className="lt-input" style={{ flex: 1 }} type="number" value={ct.rate} onChange={e => updateMrContainer(idx, { rate: e.target.value })} placeholder="e.g. 1200" min={0} />
                            <select className="lt-input" style={{ width: 80, padding: '10px 6px', fontSize: 13, borderRadius: 8 }} value={ct.currency} onChange={e => updateMrContainer(idx, { currency: e.target.value })}>
                              <option>USD</option><option>EUR</option><option>GBP</option><option>LKR</option><option>CNY</option><option>JPY</option><option>SGD</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* — Additional Information — */}
                  <div style={secHead}><span style={secDot(mrAccent)} />Additional Information</div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="lt-label">Note</label>
                    <input className="lt-input" style={{ width: '100%' }} value={mrNote} onChange={e => setMrNote(e.target.value)} placeholder="Any notes..." />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="lt-label">Special Remark</label>
                    <input className="lt-input" style={{ width: '100%' }} value={mrSpecialRemark} onChange={e => setMrSpecialRemark(e.target.value)} placeholder="Special remarks..." />
                  </div>
                </div>

                {/* Flags row */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 2 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={mrIsSold} onChange={e => setMrIsSold(e.target.checked)} />
                    <span style={{ fontWeight: 600, color: mrIsSold ? '#059669' : 'var(--text-secondary)' }}>Mark as Sold</span>
                  </label>
                  {(mrTab === 'spot' || mrTab === 'vessel-spot') && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={mrIsCancelled} onChange={e => setMrIsCancelled(e.target.checked)} />
                      <span style={{ fontWeight: 600, color: mrIsCancelled ? '#dc2626' : 'var(--text-secondary)' }}>Mark as Cancelled</span>
                    </label>
                  )}
                </div>

                {/* Cancellation reason (spot / vessel-spot, if cancelled) */}
                {(mrTab === 'spot' || mrTab === 'vessel-spot') && mrIsCancelled && (
                  <div>
                    <label className="lt-label">Cancellation Reason</label>
                    <input className="lt-input" style={{ width: '100%' }} value={mrCancelReason} onChange={e => setMrCancelReason(e.target.value)} placeholder="Reason for cancellation..." />
                  </div>
                )}

                {/* Surcharges section (special only) */}
                {mrTab === 'special' && (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Surcharges</span>
                      <button
                        className="db-btn"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px' }}
                        onClick={() => setMrSurcharges(prev => [...prev, { type: '', amount: '', currency: 'USD' }])}
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                    {mrSurcharges.length === 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 0' }}>No surcharges added.</div>
                    )}
                    {mrSurcharges.map((sc, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'flex-end', marginBottom: 6 }}>
                        <div style={{ flex: 2 }}>
                          {idx === 0 && <label className="lt-label">Surcharge Type</label>}
                          <input list="mr-surcharge-types" className="lt-input" style={{ width: '100%' }} value={sc.type}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, type: v } : s)) }}
                            placeholder="Type to search..." />
                        </div>
                        <div style={{ flex: 1 }}>
                          {idx === 0 && <label className="lt-label">Amount</label>}
                          <input className="lt-input" style={{ width: '100%' }} type="number" value={sc.amount}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, amount: v } : s)) }}
                            placeholder="0" min={0} />
                        </div>
                        <div style={{ flex: 1 }}>
                          {idx === 0 && <label className="lt-label">Currency</label>}
                          <select className="lt-input" style={{ width: '100%' }} value={sc.currency}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, currency: v } : s)) }}>
                            <option>USD</option><option>EUR</option><option>GBP</option><option>LKR</option><option>CNY</option>
                          </select>
                        </div>
                        <button className="lt-icon-btn" style={{ padding: 4, marginBottom: 1 }}
                          onClick={() => setMrSurcharges(prev => prev.filter((_, i) => i !== idx))}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <datalist id="mr-surcharge-types">{SURCHARGE_TYPES.map(s => <option key={s} value={s} />)}</datalist>
                  </div>
                )}

                {/* Add to Brief button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <button
                    className="db-btn primary"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                      background: '#d97706', borderColor: '#d97706',
                      opacity: canAddEntry ? 1 : 0.5,
                      cursor: canAddEntry ? 'pointer' : 'not-allowed',
                    }}
                    disabled={!canAddEntry}
                    onClick={addEntryToBrief}
                  >
                    <Plus size={12} /> Add to Brief
                  </button>
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            {sidebarOpen ? (
              <div style={{ width: 340, flexShrink: 0, borderLeft: '1px solid var(--border)', paddingLeft: 20 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
                  {/* Sidebar header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Rate Brief</span>
                    <button
                      className="lt-icon-btn"
                      style={{ padding: 4 }}
                      onClick={() => setSidebarOpen(false)}
                      title="Collapse sidebar"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {/* Selected DB Rates */}
                  {hasDbSelections && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Selected DB Rates</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {displayRates.filter(r => selectedIds.has(r.id)).map(rate => {
                          const badgeColor = RATE_SOURCE_COLORS[rate.source_type] || '#64748b'
                          return (
                            <div key={rate.id} style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(79,70,229,0.03)' }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                {rate.liner_name || 'N/A'}
                                <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: `${badgeColor}18`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>
                                  {rate.source_type}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                ${(rate.rate ?? 0).toLocaleString()} {rate.currency} · {rate.container_type || 'N/A'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Added Manual Rates */}
                  {manualEntries.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Added Manual Rates ({manualEntries.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {manualEntries.map((entry, idx) => {
                          const accent = ({ spot: RATE_SOURCE_COLORS['Spot'], 'vessel-spot': RATE_SOURCE_COLORS['Vessel-by-Vessel'], fak: RATE_SOURCE_COLORS['FAK'], special: RATE_SOURCE_COLORS['Special'] } as Record<ManualRateTab, string>)[entry.tab] || '#d97706'
                          return (
                            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card)' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 5px', borderRadius: 3, background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}>{MR_TAB_LABELS[entry.tab]}</span>
                                  {entry.liner}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                                  {entry.containers.map(c => `${c.containerType}: $${Number(c.rate).toLocaleString()} ${c.currency}`).join(', ')}
                                  {' · '}{entry.origin || '?'} → {entry.destination || '?'}
                                  {entry.isCancelled && <span style={{ color: '#dc2626', fontWeight: 600, marginLeft: 4 }}>CANCELLED</span>}
                                </div>
                              </div>
                              <button className="lt-icon-btn" style={{ padding: 3, flexShrink: 0 }} onClick={() => removeEntry(idx)} title="Remove">
                                <X size={12} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any notes for Sales..." />
                  </div>

                  {/* Review & Send button */}
                  <div style={{ marginTop: 'auto' }}>
                    <button
                      className="db-btn primary"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 12, width: '100%',
                        background: '#d97706', borderColor: '#d97706',
                        opacity: canReview ? 1 : 0.5,
                        cursor: canReview ? 'pointer' : 'not-allowed',
                      }}
                      disabled={!canReview}
                      onClick={() => setMode('review')}
                    >
                      <FileDown size={12} /> Review &amp; Send
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Show Brief"
                style={{
                  padding: '8px 4px', borderLeft: '1px solid var(--border)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}
              >
                <PanelRight size={16} style={{ color: 'var(--text-muted)' }} />
                <span style={{ writingMode: 'vertical-rl', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>BRIEF</span>
              </button>
            )}
          </div>
        ) : (
          /* ════════════════ REVIEW SCREEN ════════════════ */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.18)', borderRadius: 8, fontSize: 12, color: '#d97706' }}>
              {hasDbSelections
                ? <>Review the rate brief below. Click <strong>{reviewAction.label}</strong> to send, or go back to make changes.</>
                : !isProcurement && skipProcurement
                  ? <>You chose to <strong>skip procurement escalation</strong>. The inquiry will be sent directly to Sales for quotation.</>
                  : !isProcurement
                    ? <>No rates were selected. The inquiry will be <strong>escalated to Procurement</strong> for rate sourcing.</>
                    : <>Review the rate brief below. Click <strong>Push to Sales</strong> to send, or go back to make changes.</>
              }
            </div>

            {renderRateBrief()}

            {/* CS/Sales: escalation / skip info on review */}
            {!isProcurement && !hasDbSelections && (
              <div style={{ padding: '14px', background: skipProcurement ? 'rgba(217,119,6,0.06)' : 'rgba(79,70,229,0.06)', border: `1px solid ${skipProcurement ? 'rgba(217,119,6,0.18)' : 'rgba(79,70,229,0.18)'}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: skipProcurement ? '#d97706' : '#4f46e5', marginBottom: 4 }}>
                  {skipProcurement ? 'Skip Procurement' : 'Escalate to Procurement'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {skipProcurement
                    ? `${inquiry.id} will be sent directly to Sales for quotation preparation without procurement sourcing.`
                    : `${inquiry.id} will be escalated to the Procurement team to source rates for ${inquiry.origin} → ${dest}.`
                  }
                </div>
              </div>
            )}

            {formNote && (
              <div style={{ padding: '10px 14px', background: 'rgba(100,116,139,0.04)', border: '1px solid rgba(100,116,139,0.15)', borderRadius: 8, fontSize: 12 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Notes:</span>{' '}
                <span style={{ color: 'var(--text)' }}>{formNote}</span>
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
              <button className="db-btn" style={{ fontSize: 12 }} onClick={() => setMode(hasManualEntries ? 'manual-entry' : 'db-select')}>Back to Edit</button>
              <button
                className="db-btn primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                  background: reviewAction.color, borderColor: reviewAction.color,
                }}
                onClick={handleSubmit}
              >
                {reviewAction.icon} {reviewAction.label}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
