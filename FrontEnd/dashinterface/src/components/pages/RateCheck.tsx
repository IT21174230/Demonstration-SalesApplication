import { useState, useEffect } from 'react'
import { ArrowLeft, ChevronRight, FileDown, FileText, Globe, Loader2, PanelRight, Plus, Send, X } from 'lucide-react'
import {
  RATE_SOURCE_COLORS, COMMODITY_TYPES, portOptions,
  type Inquiry, type Customer, type ContainerLine, type UnifiedRate,
  type WorkflowStage, type ActivityEntry,
  type PortRecord, type LinerRecord, type TradeLaneRecord, type EmployeeRecord,
} from '../../types'
import { useRole } from '../../RoleContext'
import { apiFetchAllRates, apiGetPorts, apiGetLiners, apiGetTradeLanes, apiGetEmployeesDb, apiCreateVesselRate, apiCreateFakRate, apiCreateSpecialRate, apiCreateRateRequest, apiPatchRateRequest, apiAddRateRequestOption } from '../../api'

type ManualRateTab = 'vessel-spot' | 'fak' | 'special'
const MR_TAB_LABELS: Record<ManualRateTab, string> = { 'vessel-spot': 'Spot Rate', fak: 'FAK', special: 'Special Rate' }
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
  cancelCharge: string
  cancelChargeCurrency: string
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
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage, skipApi?: boolean) => void
  onLogActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onGoBack: () => void
  /** Called instead of onGoBack when the rate check results in a quotation-prep advancement (proceed to quotation / send brief to sales). */
  onGoToQuotations?: () => void
}

export default function RateCheck({
  inquiry, container, customers, variant,
  onAdvanceWorkflow, onLogActivity, onFlash, onGoBack, onGoToQuotations,
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

  // ID of the rate request created on mount — used to PATCH it on submit
  const [rateRequestId, setRateRequestId] = useState<number | null>(null)

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
  const [mrTab, setMrTab] = useState<ManualRateTab>('vessel-spot')
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
  const [mrCancelCharge, setMrCancelCharge] = useState('')
  const [mrCancelChargeCurrency, setMrCancelChargeCurrency] = useState('USD')
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

  // Auto-fetch DB rates on mount — fan-out fetch then filter client-side by route / container
  useEffect(() => {
    setDbLoading(true)
    apiFetchAllRates()
      .then(rates => {
        const o   = (inquiry.origin || '').toLowerCase()
        const d   = (dest           || '').toLowerCase()
        const ct  = (contType       || '').replace(/\s/g, '').toLowerCase()

        const filtered = rates.filter(r => {
          const ro  = (r.origin         ?? '').toLowerCase()
          const rd  = (r.destination    ?? '').toLowerCase()
          const rct = (r.container_type ?? '').replace(/\s/g, '').toLowerCase()
          // 1. Origin match (bidirectional substring)
          if (o  && ro  && !ro.includes(o)  && !o.includes(ro))   return false
          // 2. Destination match (bidirectional substring)
          if (d  && rd  && !rd.includes(d)  && !d.includes(rd))   return false
          // 3. Container type match
          if (ct && rct && !rct.includes(ct) && !ct.includes(rct)) return false
          // Rates that expire before cargo ready date are still shown — marked with a warning
          return true
        })

        // Sort lowest rate to highest
        filtered.sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))

        setDbRates(filtered)
        setDbSearched(true)
      })
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

  // Open a rate request record when this rate check session starts.
  // Procurement: is_given=false initially, patched to true when brief is sent.
  // CS/Sales: is_given=false initially, patched to true when submitting or escalating.
  useEffect(() => {
    const remark = `${isProcurement ? 'Procurement' : 'CS/Sales'} rate check initiated for ${inquiry.id}: ${inquiry.origin} → ${dest ?? ''}, ${containerLabel}. Customer: ${inquiry.customer_name}.`
    apiCreateRateRequest({
      inq_id: inquiry.inq_id,
      emp_id_requested: activeEmployee.id,
      is_given: false,
      remark,
    })
      .then(res => { if (res.request_id) setRateRequestId(res.request_id) })
      .catch(err => console.error('[RateCheck] rate request create failed:', err))
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
      cancelCharge: mrCancelCharge, cancelChargeCurrency: mrCancelChargeCurrency,
      vesselName: mrVesselName, voyage: mrVoyage,
      vesselEta: mrVesselEta, vesselEtd: mrVesselEtd,
      fclOpenDate: mrFclOpenDate, fclOpenTime: mrFclOpenTime,
      fclCutDate: mrFclCutDate, fclCutTime: mrFclCutTime,
      commodityType: mrCommodityType, commodityName: mrCommodityName,
      surcharges: [...mrSurcharges],
    }])

    // Persist to backend — one POST per filled container row
    const linId  = linerList.find(l => l.name === mrLiner)?.lin_id
    const trLnId = 1
    const inqId  = inquiry.inq_id
    const filledContainers = mrContainers.filter(c => c.rate.trim())

    if (mrTab === 'vessel-spot') {
      filledContainers.forEach(c => {
        apiCreateVesselRate({
          inq_id: inqId,
          voyage: mrVoyage || undefined,
          vessel_name: mrVesselName || undefined,
          eta: mrVesselEta || undefined,
          etd: mrVesselEtd || undefined,
          rate: Number(c.rate),
          currency: c.currency,
          fcl_opening: mrFclOpenDate ? `${mrFclOpenDate}T${mrFclOpenTime || '00:00'}:00` : undefined,
          fcl_cutoff:  mrFclCutDate  ? `${mrFclCutDate}T${mrFclCutTime || '00:00'}:00`   : undefined,
          origin: mrOrigin,
          destination: mrDestination,
          tr_ln_id: trLnId,
          container_type: c.containerType,
          volume: c.tus.trim() ? (parseInt(c.tus) || 1) : 1,
          free_days: mrFreeTime.trim() || undefined,
          max_weight: c.maxWeight.trim() ? parseInt(c.maxWeight) : undefined,
          note: mrNote || undefined,
          special_remark: mrSpecialRemark || undefined,
          issold: mrIsSold || undefined,
          iscancelled: mrIsCancelled || undefined,
          cancellationreason: mrCancelReason || undefined,
          cancellationfee: mrCancelCharge ? Number(mrCancelCharge) : undefined,
        }).catch(err => console.error('[RateCheck] vessel-spot POST failed:', err))
      })
    } else if (mrTab === 'fak') {
      filledContainers.forEach(c => {
        apiCreateFakRate({
          lin_id: linId,
          tr_ln_id: trLnId,
          inq_id: inqId,
          valid_from: mrValidFrom || undefined,
          valid_to: mrValidTo || undefined,
          volume: c.tus.trim() ? (parseInt(c.tus) || 1) : 1,
          container_type: c.containerType,
          origin: mrOrigin,
          destination: mrDestination,
          rate: Number(c.rate),
          currency: c.currency,
          free_time: mrFreeTime.trim() || undefined,
          max_weight: c.maxWeight.trim() ? parseInt(c.maxWeight) : undefined,
          note: mrNote || undefined,
          special_remark: mrSpecialRemark || undefined,
          issold: mrIsSold || undefined,
        }).catch(err => console.error('[RateCheck] fak POST failed:', err))
      })
    } else {
      // special
      const comId = inquiry.com_ids?.[0]
      filledContainers.forEach(c => {
        apiCreateSpecialRate({
          lin_id: linId,
          tr_ln_id: trLnId,
          inq_id: inqId,
          com_id: comId,
          valid_from: mrValidFrom || undefined,
          valid_to: mrValidTo || undefined,
          rate: Number(c.rate),
          origin: mrOrigin,
          destination: mrDestination,
          container_type: c.containerType,
          volume: c.tus.trim() ? (parseInt(c.tus) || 1) : 1,
          currency: c.currency,
          free_days: mrFreeTime.trim() || undefined,
          max_weight: c.maxWeight.trim() ? parseInt(c.maxWeight) : undefined,
          note: mrNote || undefined,
          special_remark: mrSpecialRemark || undefined,
          issold: mrIsSold || undefined,
        }).catch(err => console.error('[RateCheck] special POST failed:', err))
      })
    }

    // Reset rate-specific fields; keep carrier & route
    setMrContainers([defaultMrContainer()]); setMrValidFrom(''); setMrValidTo('')
    setMrNote(''); setMrSpecialRemark('')
    setMrFreeTime(''); setMrIsSold(false)
    setMrIsCancelled(false); setMrCancelReason(''); setMrCancelCharge(''); setMrCancelChargeCurrency('USD')
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
    if (e.isCancelled) p.push(`CANCELLED: ${e.cancelReason || 'no reason'}${e.cancelCharge ? ` (charge: ${e.cancelCharge} ${e.cancelChargeCurrency})` : ''}`)
    if (e.tab === 'vessel-spot' && e.vesselName) p.push(`vessel=${e.vesselName}`)
    return p.join(', ')
  }

  // Submit handler
  const handleSubmit = () => {
    // Non-procurement branches remain simple
    if (!isProcurement && skipProcurement) {
      if (rateRequestId) {
        apiPatchRateRequest(rateRequestId, {
          is_given: true,
          remark: `Procurement escalation skipped. CS/Sales proceeding directly to quotation for ${inquiry.id}. ${inquiry.origin} → ${dest ?? ''}. ${formNote || ''}`.trim(),
        }).catch(err => console.error('[RateCheck] rate request patch failed:', err))
      }
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
      ;(onGoToQuotations ?? onGoBack)()
      return
    }
    if (!isProcurement && !hasDbSelections) {
      if (rateRequestId) {
        apiPatchRateRequest(rateRequestId, {
          is_given: false,
          remark: `No suitable rates found. Escalating to Procurement for rate sourcing. ${inquiry.id}: ${inquiry.origin} → ${dest ?? ''}. ${formNote || ''}`.trim(),
        }).catch(err => console.error('[RateCheck] rate request patch failed:', err))
      }
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

    // Patch the rate request created on mount: mark as given and record the summary/message
    const briefRemark = isProcurement
      ? [
          `Rate brief sent to Sales for ${inquiry.id}.`,
          actionParts.length ? `Rates: ${actionParts.join(' + ')}.` : '',
          dbSummary ? `DB: ${dbSummary}.` : '',
          manualSummary ? `Manual: ${manualSummary}.` : '',
          formNote ? `Message: ${formNote}` : '',
        ].filter(Boolean).join(' ')
      : [
          `CS/Sales rate check completed for ${inquiry.id}.`,
          `${totalCount} rate(s) selected.`,
          dbSummary ? `Rates: ${dbSummary}.` : '',
          formNote ? `Note: ${formNote}` : '',
        ].filter(Boolean).join(' ')
    if (rateRequestId) {
      apiPatchRateRequest(rateRequestId, { is_given: true, remark: briefRemark })
        .catch(err => console.error('[RateCheck] rate request patch failed:', err))
    } else {
      apiCreateRateRequest({ inq_id: inquiry.inq_id, emp_id_requested: activeEmployee.id, is_given: true, remark: briefRemark })
        .catch(err => console.error('[RateCheck] rate request create (fallback) failed:', err))
    }

    // Create rate request options for each DB-selected rate.
    // DB rate IDs follow "type:numericId" (e.g. "vessel:123").
    // Backend auto-advances workflow to quotation_prep when an option is added.
    if (rateRequestId && hasDbSelections) {
      const selectedRates = (isProcurement ? dbRates : visibleRates).filter(r => selectedIds.has(r.id))
      for (const rate of selectedRates) {
        const colonIdx = rate.id.indexOf(':')
        if (colonIdx === -1) continue
        const rateType = rate.id.slice(0, colonIdx)
        const rateId = Number(rate.id.slice(colonIdx + 1))
        if (!isNaN(rateId)) {
          apiAddRateRequestOption(rateRequestId, { request_id: rateRequestId, rate_type: rateType, rate_id: rateId })
            .catch(err => console.error('[RateCheck] add rate request option failed:', err))
        }
      }
    }

    // Advance local state (backend may already have auto-advanced via options above — idempotent)
    onAdvanceWorkflow(inquiry.id, 'quotation-prep')

    const notesParts = [`Customer: ${inquiry.customer_name} (${custData?.tier ?? 'N/A'})`, `Route: ${inquiry.origin} → ${dest}`]
    if (dbSummary) notesParts.push(`DB Rates: ${dbSummary}`)
    if (manualSummary) notesParts.push(`Manual Rates: ${manualSummary}`)

    onLogActivity({
      actor_role: activeRole,
      actor_id: activeEmployee.id,
      action: isProcurement
        ? `Procurement rate check completed. ${actionParts.join(' + ')} sent to Sales.`
        : `Multi-source rate check completed. ${totalCount} rate(s) selected. Proceeding to quotation.`,
      ref_type: 'inquiry',
      ref_id: inquiry.id,
      customer_name: inquiry.customer_name,
      pushed_to: 'Sales',
      notes: formNote ? `${formNote} | ${notesParts.join(' | ')}` : notesParts.join(' | '),
    })
    onFlash(isProcurement
      ? `${inquiry.id} → Rate brief sent to Sales (${actionParts.join(' + ')})`
      : `${inquiry.id} → ${totalCount} rate(s) — proceeding to quotation`
    )
    ;(onGoToQuotations ?? onGoBack)()
  }

  // Direct escalation to procurement (cs-sales, always available)
  const handleEscalate = () => {
    if (rateRequestId) {
      apiPatchRateRequest(rateRequestId, {
        is_given: false,
        remark: `Escalated to Procurement for rate sourcing. ${inquiry.id}: ${inquiry.origin} → ${dest ?? ''}. Customer: ${inquiry.customer_name}. ${formNote || ''}`.trim(),
      }).catch(err => console.error('[RateCheck] rate request patch failed:', err))
    }
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
    const accent = ({ 'vessel-spot': RATE_SOURCE_COLORS['Spot'], fak: RATE_SOURCE_COLORS['FAK'], special: RATE_SOURCE_COLORS['Special'] } as Record<ManualRateTab, string>)[e.tab] || '#d97706'
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
        {e.surcharges.filter(s => s.type && s.amount).length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            Surcharges: {e.surcharges.filter(s => s.type && s.amount).map(s => `${s.type}: ${s.amount} ${s.currency}`).join(', ')}
          </div>
        )}
        <div style={{ fontSize: 11, marginTop: 2, display: 'flex', gap: 6 }}>
          {e.isSold && <span style={{ color: '#059669', fontWeight: 600 }}>SOLD</span>}
          {e.isCancelled && <span style={{ color: '#dc2626', fontWeight: 600 }}>CANCELLED{e.cancelReason ? `: ${e.cancelReason}` : ''}{e.cancelCharge ? ` · Charge: ${e.cancelCharge} ${e.cancelChargeCurrency}` : ''}</span>}
        </div>
        {e.salesperson && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Sales Contact: {e.salesperson}</div>}
        {e.note && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Note: {e.note}</div>}
        {e.specialRemark && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Analysis Note: {e.specialRemark}</div>}
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
          <FileDown size={14} style={{ color: isProcurement ? '#d97706' : '#0f8fa8' }} />
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
        label: isProcurement ? 'Push to Sales' : `Go to Quotation (${selectedIds.size} rate${selectedIds.size !== 1 ? 's' : ''})`,
        color: isProcurement ? '#d97706' : '#0f8fa8',
        icon: isProcurement ? <Send size={12} /> : <ChevronRight size={12} />,
      }
    }
    if (!isProcurement && skipProcurement) {
      return { label: 'Skip Procurement — Go to Quotation', color: '#d97706', icon: <ChevronRight size={12} /> }
    }
    if (!isProcurement) {
      return { label: 'Escalate to Procurement', color: '#d97706', icon: <ChevronRight size={12} /> }
    }
    // Procurement manual
    return { label: 'Push to Sales', color: '#d97706', icon: <Send size={12} /> }
  }

  const reviewAction = getReviewAction()

  const sectionTitle: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#d97706', marginBottom: 10 }

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto' }}>
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
          /* ════════════════ DB-SELECT SCREEN — two-column ════════════════ */
          <div style={{ display: 'flex', gap: 0, alignItems: 'flex-start' }}>

            {/* ── LEFT: Inquiry details ── */}
            <div style={{
              width: 248, flexShrink: 0,
              borderRight: '1px solid var(--border)',
              paddingRight: 20, marginRight: 24,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Inquiry · {inquiry.id}
              </div>

              {/* Customer */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Customer</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{inquiry.customer_name}</div>
                {custData?.tier && <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 1 }}>{custData.tier}</div>}
              </div>

              {/* Route */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Route</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{inquiry.origin}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 2px 2px' }}>↓</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{dest}</div>
              </div>

              {/* Container */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Container</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{containerLabel || '—'}</div>
                {(container?.commodityType || inquiry.commodity_type) && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                    {container?.commodityType || inquiry.commodity_type}
                  </div>
                )}
                {(container?.weight || inquiry.cargo_weight) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {container?.weight || inquiry.cargo_weight}
                  </div>
                )}
              </div>

              <div style={{ height: 1, background: 'var(--border)' }} />

              {/* Cargo Ready Date */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Cargo Ready</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: inquiry.cargo_ready_date ? 'var(--text)' : 'var(--text-muted)' }}>
                  {inquiry.cargo_ready_date || 'Not set'}
                </div>
              </div>

              {/* Service mode */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Service Mode</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {inquiry.delivery_type === 'door-to-door' ? 'Door-to-Door' : 'Port-to-Port'}
                </div>
              </div>

              {/* Incoterm */}
              {inquiry.incoterm && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Incoterm</div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{inquiry.incoterm}</div>
                </div>
              )}

              {/* Priority */}
              {inquiry.priority && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Priority</div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{inquiry.priority}</div>
                </div>
              )}

              {/* Target rate */}
              {inquiry.preferred_rate != null && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Target Rate</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                    USD {inquiry.preferred_rate.toLocaleString()}
                  </div>
                </div>
              )}

              {/* Preferred liners */}
              {inquiry.preferred_liners && inquiry.preferred_liners.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Preferred Liners</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {inquiry.preferred_liners.map(l => (
                      <span key={l} style={{ fontSize: 11, fontWeight: 600, color: '#6366f1' }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Request */}
              {inquiry.request && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Request</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{inquiry.request}</div>
                </div>
              )}
            </div>

            {/* ── RIGHT: Rate options ── */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* ---- Banner ---- */}
              <div style={{ padding: '10px 14px', background: isProcurement ? 'rgba(15,143,168,0.06)' : 'rgba(8,145,178,0.06)', border: `1px solid ${isProcurement ? 'rgba(15,143,168,0.18)' : 'rgba(8,145,178,0.18)'}`, borderRadius: 8, fontSize: 12, color: isProcurement ? '#0f8fa8' : '#0891b2', display: 'flex', alignItems: 'center', gap: 8 }}>
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
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'rgba(15,143,168,0.04)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
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
                    {displayRates.length} rate(s) {isProcurement ? 'from database' : 'found'} — select {isProcurement ? 'rates to include' : 'one or more to proceed to quotation'}
                    {!isProcurement && nacHidden > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>({nacHidden} NAC rate{nacHidden > 1 ? 's' : ''} restricted)</span>}
                  </div>
                  <div style={{ maxHeight: 460, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {(isProcurement
                      ? (['Contracted', 'Tariff Rate', 'NAC', 'FAK', 'Spot', 'Special'] as const)
                      : (['FAK', 'Tariff Rate', 'Spot'] as const)
                    ).map(groupType => {
                      const groupRates = displayRates.filter(r => r.source_type === groupType)
                      if (groupRates.length === 0) return null
                      const groupColor = RATE_SOURCE_COLORS[groupType] || '#64748b'
                      const groupLabel = (!isProcurement && groupType === 'Spot') ? 'Vessel by Vessel' : groupType
                      return (
                        <div key={groupType}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: `${groupColor}18`, color: groupColor, border: `1px solid ${groupColor}30`,
                            }}>
                              {groupLabel}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {groupRates.length} rate{groupRates.length > 1 ? 's' : ''}
                            </span>
                            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {groupRates.map(rate => {
                              const selected = selectedIds.has(rate.id)
                              const crd = inquiry.cargo_ready_date || ''
                              const expiresEarly = !!(crd && rate.valid_to && rate.valid_to < crd)
                              return (
                                <label
                                  key={rate.id}
                                  className="ws-rate-row"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                    border: `1px solid ${selected ? (isProcurement ? '#0f8fa8' : 'var(--accent)') : expiresEarly ? 'rgba(217,119,6,0.4)' : 'var(--border)'}`,
                                    borderRadius: 8, cursor: 'pointer',
                                    background: selected ? 'rgba(15,143,168,0.04)' : expiresEarly ? 'rgba(217,119,6,0.03)' : 'transparent',
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
                                    {expiresEarly && (
                                      <div style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 4,
                                        marginTop: 4, padding: '2px 7px', borderRadius: 4,
                                        background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
                                        fontSize: 10, fontWeight: 600, color: '#b45309',
                                      }}>
                                        ⚠ Expires before cargo ready date — may work if cargo ships early
                                      </div>
                                    )}
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
                    {/* Procurement: any remaining types not in the explicit list */}
                    {isProcurement && displayRates.filter(r => !['Contracted', 'Tariff Rate', 'NAC', 'FAK', 'Spot', 'Special'].includes(r.source_type)).map(rate => {
                      const selected = selectedIds.has(rate.id)
                      const badgeColor = RATE_SOURCE_COLORS[rate.source_type] || '#64748b'
                      const crd = inquiry.cargo_ready_date || ''
                      const expiresEarly = !!(crd && rate.valid_to && rate.valid_to < crd)
                      return (
                        <label
                          key={rate.id}
                          className="ws-rate-row"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                            border: `1px solid ${selected ? '#0f8fa8' : expiresEarly ? 'rgba(217,119,6,0.4)' : 'var(--border)'}`,
                            borderRadius: 8, cursor: 'pointer',
                            background: selected ? 'rgba(15,143,168,0.04)' : expiresEarly ? 'rgba(217,119,6,0.03)' : 'transparent',
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
                            </div>
                            {expiresEarly && (
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                marginTop: 4, padding: '2px 7px', borderRadius: 4,
                                background: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)',
                                fontSize: 10, fontWeight: 600, color: '#b45309',
                              }}>
                                ⚠ Expires before cargo ready date — may work if cargo ships early
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                            ${(rate.rate ?? 0).toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{rate.currency}</span>
                          </div>
                        </label>
                      )
                    })}
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
                      background: 'rgba(15,143,168,0.06)', borderColor: '#0f8fa8', color: '#0f8fa8',
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
          </div>
        ) : mode === 'manual-entry' ? (
          /* ════════════════ MANUAL-ENTRY SCREEN ════════════════ */
          <div style={{ display: 'flex', gap: 0 }}>

            {/* ── LEFT: Inquiry details (same panel as db-select) ── */}
            <div style={{
              width: 248, flexShrink: 0,
              borderRight: '1px solid var(--border)',
              paddingRight: 20, marginRight: 24,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
                Inquiry · {inquiry.id}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Customer</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{inquiry.customer_name}</div>
                {custData?.tier && <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 1 }}>{custData.tier}</div>}
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Route</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{inquiry.origin}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 2px 2px' }}>↓</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{dest}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Container</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{containerLabel || '—'}</div>
                {(container?.commodityType || inquiry.commodity_type) && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                    {container?.commodityType || inquiry.commodity_type}
                  </div>
                )}
                {(container?.weight || inquiry.cargo_weight) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    {container?.weight || inquiry.cargo_weight}
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: 'var(--border)' }} />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Cargo Ready</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: inquiry.cargo_ready_date ? 'var(--text)' : 'var(--text-muted)' }}>
                  {inquiry.cargo_ready_date || 'Not set'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Service Mode</div>
                <div style={{ fontSize: 12, color: 'var(--text)' }}>
                  {inquiry.delivery_type === 'door-to-door' ? 'Door-to-Door' : 'Port-to-Port'}
                </div>
              </div>
              {inquiry.incoterm && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Incoterm</div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{inquiry.incoterm}</div>
                </div>
              )}
              {inquiry.priority && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Priority</div>
                  <div style={{ fontSize: 12, color: 'var(--text)' }}>{inquiry.priority}</div>
                </div>
              )}
              {inquiry.preferred_rate != null && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Target Rate</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>
                    USD {inquiry.preferred_rate.toLocaleString()}
                  </div>
                </div>
              )}
              {inquiry.preferred_liners && inquiry.preferred_liners.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Preferred Liners</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {inquiry.preferred_liners.map(l => (
                      <span key={l} style={{ fontSize: 11, fontWeight: 600, color: '#6366f1' }}>{l}</span>
                    ))}
                  </div>
                </div>
              )}
              {inquiry.request && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Request</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{inquiry.request}</div>
                </div>
              )}
            </div>

            {/* ── CENTER: Manual entry form ── */}
            <div style={{ flex: 1, minWidth: 0, paddingRight: sidebarOpen ? 24 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Rate type tabs — pill style */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['vessel-spot', 'fak', 'special'] as ManualRateTab[]).map(tab => (
                    <button
                      key={tab}
                      style={{
                        padding: '6px 14px', fontSize: 12, fontWeight: mrTab === tab ? 700 : 500,
                        background: mrTab === tab ? '#d97706' : 'var(--card)',
                        color: mrTab === tab ? '#fff' : '#64748b',
                        border: `1px solid ${mrTab === tab ? '#d97706' : 'var(--border)'}`,
                        borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                      }}
                      onClick={() => setMrTab(tab)}
                    >
                      {MR_TAB_LABELS[tab]}
                    </button>
                  ))}
                </div>

                {/* Form card */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 20 }}>

                  {/* ── Carrier & service ── */}
                  <div>
                    <div style={sectionTitle}>Carrier &amp; service</div>
                    {(inquiry.preferred_liners?.length ?? 0) > 0 && !mrLinerOther && (
                      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                        {(inquiry.preferred_liners || []).map(l => (
                          <button key={l} type="button" onClick={() => setMrLiner(l)}
                            style={{
                              padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                              background: mrLiner === l ? 'rgba(217,119,6,0.1)' : 'var(--bg)',
                              color: mrLiner === l ? '#d97706' : '#475569',
                              border: `1px solid ${mrLiner === l ? '#d97706' : 'var(--border)'}`,
                              fontWeight: mrLiner === l ? 600 : 400,
                            }}>
                            {l}
                          </button>
                        ))}
                        <button type="button" onClick={() => { setMrLinerOther(true); setMrLiner('') }}
                          style={{ padding: '4px 12px', borderRadius: 16, fontSize: 12, color: '#94a3b8', background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer' }}>
                          Other
                        </button>
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
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
                    </div>
                  </div>

                  {/* ── Route & free time ── */}
                  <div>
                    <div style={sectionTitle}>Route &amp; free time</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: '12px 16px' }}>
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
                      <div>
                        <label className="lt-label">Free Days</label>
                        <input className="lt-input" style={{ width: '100%' }} value={mrFreeTime} onChange={e => setMrFreeTime(e.target.value)} placeholder="e.g. 14" />
                      </div>
                    </div>
                  </div>

                  {/* ── Vessel (spot rate only) ── */}
                  {mrTab === 'vessel-spot' && (
                    <div>
                      <div style={sectionTitle}>Vessel</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 14 }}>
                        <div>
                          <label className="lt-label">Vessel Name</label>
                          <input className="lt-input" style={{ width: '100%' }} value={mrVesselName} onChange={e => setMrVesselName(e.target.value)} placeholder="e.g. Maersk Sealand" />
                        </div>
                        <div>
                          <label className="lt-label">Voyage</label>
                          <input className="lt-input" style={{ width: '100%' }} value={mrVoyage} onChange={e => setMrVoyage(e.target.value)} placeholder="e.g. 2607E" />
                        </div>
                        <div>
                          <label className="lt-label">Vessel ETD</label>
                          <input className="lt-input" style={{ width: '100%' }} type="date" value={mrVesselEtd} onChange={e => setMrVesselEtd(e.target.value)} />
                        </div>
                        <div>
                          <label className="lt-label">Vessel ETA</label>
                          <input className="lt-input" style={{ width: '100%' }} type="date" value={mrVesselEta} onChange={e => setMrVesselEta(e.target.value)} />
                        </div>
                      </div>
                      <label className="lt-label">FCL Opening</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', marginBottom: 14 }}>
                        <input className="lt-input" type="date" value={mrFclOpenDate} onChange={e => setMrFclOpenDate(e.target.value)} />
                        <input className="lt-input" type="time" value={mrFclOpenTime} onChange={e => setMrFclOpenTime(e.target.value)} />
                      </div>
                      <label className="lt-label">FCL Cutoff</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                        <input className="lt-input" type="date" value={mrFclCutDate} onChange={e => setMrFclCutDate(e.target.value)} />
                        <input className="lt-input" type="time" value={mrFclCutTime} onChange={e => setMrFclCutTime(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {/* ── Commodity (special only) ── */}
                  {mrTab === 'special' && (
                    <div>
                      <div style={sectionTitle}>Commodity</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                        <div>
                          <label className="lt-label">Commodity Type</label>
                          <input list="mr-commodity-types" className="lt-input" style={{ width: '100%' }} value={mrCommodityType} onChange={e => setMrCommodityType(e.target.value)} placeholder="Select or type..." />
                          <datalist id="mr-commodity-types">{COMMODITY_TYPES.map(ct => <option key={ct} value={ct} />)}</datalist>
                        </div>
                        <div>
                          <label className="lt-label">Commodity Name</label>
                          <input className="lt-input" style={{ width: '100%' }} value={mrCommodityName} onChange={e => setMrCommodityName(e.target.value)} placeholder="e.g. Cotton T-shirts" />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Container rates ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={sectionTitle}>Container rates</span>
                      <button type="button" onClick={addMrContainer}
                        style={{ padding: '5px 11px', borderRadius: 7, background: 'var(--card)', border: '1px solid #fbd8a8', color: '#d97706', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        + Add container
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mrContainers.map((ct, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.7fr 0.9fr 0.9fr 0.8fr 24px', gap: 8, alignItems: 'end' }}>
                          <div>
                            {idx === 0 && <label className="lt-label">Container type</label>}
                            <select className="lt-input" style={{ width: '100%' }} value={ct.containerType} onChange={e => updateMrContainer(idx, { containerType: e.target.value })}>
                              {MR_VESSEL_CONTAINER_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div>
                            {idx === 0 && <label className="lt-label">TUs</label>}
                            <input className="lt-input" style={{ width: '100%' }} value={ct.tus} onChange={e => updateMrContainer(idx, { tus: e.target.value })} placeholder="10" />
                          </div>
                          <div>
                            {idx === 0 && <label className="lt-label">Max weight</label>}
                            <input className="lt-input" style={{ width: '100%' }} value={ct.maxWeight} onChange={e => updateMrContainer(idx, { maxWeight: e.target.value })} placeholder="28000 kg" />
                          </div>
                          <div>
                            {idx === 0 && <label className="lt-label">Rate <span style={{ color: '#dc2626' }}>*</span></label>}
                            <input className="lt-input" style={{ width: '100%' }} type="number" value={ct.rate} onChange={e => updateMrContainer(idx, { rate: e.target.value })} placeholder="1650" min={0} />
                          </div>
                          <div>
                            {idx === 0 && <label className="lt-label">Currency</label>}
                            <select className="lt-input" style={{ width: '100%' }} value={ct.currency} onChange={e => updateMrContainer(idx, { currency: e.target.value })}>
                              <option>USD</option><option>EUR</option><option>GBP</option><option>LKR</option><option>CNY</option><option>JPY</option><option>SGD</option>
                            </select>
                          </div>
                          <button type="button" onClick={() => removeMrContainer(idx)}
                            style={{ height: 34, background: 'none', border: 'none', cursor: mrContainers.length > 1 ? 'pointer' : 'not-allowed', color: '#94a3b8', fontSize: 15, alignSelf: 'flex-end', opacity: mrContainers.length > 1 ? 1 : 0.3 }}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Validity ── */}
                  <div>
                    <div style={sectionTitle}>Validity</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
                      <div>
                        <label className="lt-label">Valid From <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="lt-input" style={{ width: '100%' }} type="date" value={mrValidFrom} onChange={e => setMrValidFrom(e.target.value)} />
                      </div>
                      <div>
                        <label className="lt-label">Valid To <span style={{ color: '#dc2626' }}>*</span></label>
                        <input className="lt-input" style={{ width: '100%' }} type="date" value={mrValidTo} onChange={e => setMrValidTo(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* ── Flags ── */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={mrIsSold} onChange={e => setMrIsSold(e.target.checked)} />
                      <span style={{ fontWeight: mrIsSold ? 600 : 400, color: mrIsSold ? '#059669' : '#334155' }}>Mark as sold</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, cursor: 'pointer', color: '#334155' }}>
                      <input type="checkbox" checked={mrIsCancelled} onChange={e => setMrIsCancelled(e.target.checked)} />
                      <span style={{ fontWeight: mrIsCancelled ? 600 : 400, color: mrIsCancelled ? '#dc2626' : '#334155' }}>Mark as cancelled</span>
                    </label>
                  </div>

                  {/* ── Cancellation details ── */}
                  {mrIsCancelled && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label className="lt-label">Cancellation Reason</label>
                        <input className="lt-input" style={{ width: '100%' }} value={mrCancelReason} onChange={e => setMrCancelReason(e.target.value)} placeholder="Reason for cancellation..." />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 0.45fr', gap: 10 }}>
                        <div>
                          <label className="lt-label">Cancellation Charge</label>
                          <input className="lt-input" style={{ width: '100%' }} type="number" min={0} value={mrCancelCharge} onChange={e => setMrCancelCharge(e.target.value)} placeholder="e.g. 200" />
                        </div>
                        <div>
                          <label className="lt-label">Currency</label>
                          <select className="lt-input" style={{ width: '100%' }} value={mrCancelChargeCurrency} onChange={e => setMrCancelChargeCurrency(e.target.value)}>
                            <option>USD</option><option>EUR</option><option>GBP</option><option>LKR</option><option>CNY</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Surcharges ── */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={sectionTitle}>Surcharges</span>
                      <button onClick={() => setMrSurcharges(prev => [...prev, { type: '', amount: '', currency: 'USD' }])}
                        style={{ padding: '5px 11px', borderRadius: 7, background: 'var(--card)', border: '1px solid #fbd8a8', color: '#d97706', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        + Add
                      </button>
                    </div>
                    {mrSurcharges.length === 0 && (
                      <div style={{ fontSize: 12, color: '#94a3b8', padding: '4px 0' }}>No surcharges added.</div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {mrSurcharges.map((sc, idx) => (
                        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.8fr 24px', gap: 8, alignItems: 'flex-end' }}>
                          <input list="mr-surcharge-types" className="lt-input" style={{ width: '100%' }} value={sc.type}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, type: v } : s)) }}
                            placeholder="e.g. BAF" />
                          <input className="lt-input" style={{ width: '100%' }} type="number" value={sc.amount}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, amount: v } : s)) }}
                            placeholder="Amount" min={0} />
                          <select className="lt-input" style={{ width: '100%' }} value={sc.currency}
                            onChange={e => { const v = e.target.value; setMrSurcharges(prev => prev.map((s, i) => i === idx ? { ...s, currency: v } : s)) }}>
                            <option>USD</option><option>EUR</option><option>GBP</option><option>LKR</option><option>CNY</option>
                          </select>
                          <button style={{ height: 34, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 15 }}
                            onClick={() => setMrSurcharges(prev => prev.filter((_, i) => i !== idx))}>×</button>
                        </div>
                      ))}
                    </div>
                    <datalist id="mr-surcharge-types">{SURCHARGE_TYPES.map(s => <option key={s} value={s} />)}</datalist>
                  </div>

                  {/* ── Additional information ── */}
                  <div>
                    <div style={sectionTitle}>Additional information</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label className="lt-label">Note</label>
                        <input className="lt-input" style={{ width: '100%' }} value={mrNote} onChange={e => setMrNote(e.target.value)} placeholder="Any notes..." />
                      </div>
                      <div>
                        <label className="lt-label">Analysis Note</label>
                        <input className="lt-input" style={{ width: '100%' }} value={mrSpecialRemark} onChange={e => setMrSpecialRemark(e.target.value)} placeholder="Analysis notes..." />
                      </div>
                    </div>
                  </div>

                  {/* ── Add to Brief ── */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      style={{
                        padding: '9px 16px', borderRadius: 9,
                        background: canAddEntry ? '#d97706' : 'rgba(217,119,6,0.4)',
                        color: '#fff', border: 'none', fontSize: 12, fontWeight: 600,
                        cursor: canAddEntry ? 'pointer' : 'not-allowed',
                      }}
                      disabled={!canAddEntry}
                      onClick={addEntryToBrief}
                    >
                      + Add to brief
                    </button>
                  </div>
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
                            <div key={rate.id} style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, background: 'rgba(15,143,168,0.03)' }}>
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
                          const accent = ({ 'vessel-spot': RATE_SOURCE_COLORS['Spot'], fak: RATE_SOURCE_COLORS['FAK'], special: RATE_SOURCE_COLORS['Special'] } as Record<ManualRateTab, string>)[entry.tab] || '#d97706'
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
              <div style={{ padding: '14px', background: skipProcurement ? 'rgba(217,119,6,0.06)' : 'rgba(15,143,168,0.06)', border: `1px solid ${skipProcurement ? 'rgba(217,119,6,0.18)' : 'rgba(15,143,168,0.18)'}`, borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: skipProcurement ? '#d97706' : '#0f8fa8', marginBottom: 4 }}>
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
