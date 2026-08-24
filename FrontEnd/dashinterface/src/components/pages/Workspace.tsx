import React, { useState, useMemo, useEffect } from 'react'
import {
  Inbox, ChevronRight, AlertTriangle, Check, Paperclip, ClipboardPaste,
  FileText, Ship, ShieldCheck, X, User, Mail, Loader2,
  Globe, MessageCircle, Edit3, Copy, ClipboardCheck, Send, Clock,
} from 'lucide-react'
import {
  EMPLOYEES, WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS, stageRoleLabel, stageRoleColor,
  isSpotInquiry, daysUntil,
  type Inquiry, type Booking, type Quote, type Customer,
  type ActivityEntry, type WorkflowStage,
  type QuoteStatus, type KycStatus,
  type ContainerLine, type LinerRecord, type ClientRecord,
  type ReleaseOrderFields,
} from '../../types'
import { useRole } from '../../RoleContext'
import { apiGetLiners, apiCreateKycRequest, apiCreateQuotation, apiPatchQuotation, apiMarkQuotationSent, apiFetchQuotation, apiRecordQuotationResponse, apiUpdateKycStage, type KycPendingClient, type KycRequestRecord, type QuotationOptionRow } from '../../api'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkspaceProps {
  inquiries: Inquiry[]
  bookings: Booking[]
  quotes: Quote[]
  customers: Customer[]
  clientList: ClientRecord[]
  activityLog: ActivityEntry[]
  onGoTo: (page: import('../../types').PageId) => void
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage, skipApi?: boolean) => void
  onConfirmBooking: (bookingId: string, vesselName: string, voyageNumber: string) => void
  onMarkRaAssigned: (bookingId: string, raNumber: string, vessel: string, carrier: string) => void
  onRevertBookingRequest: (bookingId: string) => void
  onAttachReleaseOrder: (bookingId: string, fields: ReleaseOrderFields) => void
  onReleaseBooking: (bookingId: string, note: string) => void
  onAcknowledgeProcurement: (bookingId: string) => void
  onCreateBooking: (payload: {
    customer_name: string; quote_id: string; shipping_line: string;
    container_type: string; quantity: number; origin: string; destination: string;
    is_urgent: boolean; booked_by: number; notes: string; delivery_type?: 'port-to-port' | 'door-to-door';
  }) => string
  onSetBookingSiCutoff: (bookingId: string, date: string) => void
  onSetBookingBlCutoff: (bookingId: string, date: string) => void
  onSetBookingVgmCutoff: (bookingId: string, date: string) => void
  onSetBookingFilingCutoff: (bookingId: string, date: string) => void
  onMarkSiRequested: (bookingId: string) => void
  onMarkSiSubmitted: (bookingId: string) => void
  vesselSchedules: import('../../types').VesselSchedule[]
  onAddVesselSchedule: (vs: Omit<import('../../types').VesselSchedule, 'id'>) => void
  onMarkDraftBlSent: (bookingId: string) => void
  onMarkPreAdviceSent: (bookingId: string) => void
  onSetBlStatus: (bookingId: string, status: 'pending' | 'approved' | 'changes-requested') => void
  onRecordMasterBl: (bookingId: string, data: { master_bl_number: string; shipper: string; consignee: string }) => void
  onCreateHouseBl: (bookingId: string, data: { house_bl_number: string; shipper: string; consignee: string }) => void
  onSetQuoteStatus: (quoteId: string, status: QuoteStatus) => void
  onUpdateCustomerKyc: (customerName: string, kycStatus: KycStatus) => void
  onAutoAdvanceForCustomer: (customerName: string, targetStage: WorkflowStage) => void
  onLogActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  onFlash: (msg: string, action?: { label: string; onClick: () => void }) => void
  onStartRateCheck: (inquiry: Inquiry, container?: ContainerLine, variant?: 'procurement' | 'cs-sales') => void
  kycPendingClients: KycPendingClient[]
  onSetKycPendingClients: React.Dispatch<React.SetStateAction<KycPendingClient[]>>
  kycRequests: KycRequestRecord[]
  onSetKycRequests: React.Dispatch<React.SetStateAction<KycRequestRecord[]>>
  onRefreshKycRequests: () => void
  initialStep?: string   // When set, Workspace opens directly on this step key (used after rate-check → Prepare Quotation)
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type ItemType = 'inquiry' | 'booking' | 'quote' | 'customer'

interface WorkspaceItem {
  type: ItemType
  refId: string
  customerName: string
  title: string
  subtitle: string
  urgentFlag: boolean
  createdAt: string
  previousContext: ActivityEntry | null
  actionLabel: string
  actionKind: string
  sourceData: any // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Lower = more urgent. Used for cutoff-based sorting (e.g. SI reminders). */
  urgencySortKey?: number
  /** True when the client's KYC is not yet completed for this inquiry. */
  kycIncomplete?: boolean
}

const TYPE_BADGE_CLASS: Record<ItemType, string> = {
  inquiry: 'db-badge accent',
  booking: 'db-badge warning',
  quote: 'db-badge purple',
  customer: 'db-badge',
}

// ---------------------------------------------------------------------------
// Step-based navigation — per-role workflow steps
// ---------------------------------------------------------------------------

interface StepDef {
  key: string
  label: string
  actionKinds: string[]
  stepNumber: number
  group?: string
}

const CS_STEPS: StepDef[] = [
  { key: 'cs-inquiry',    label: 'Inquiry',     actionKinds: ['advance-workflow'],   stepNumber: 1 },
  { key: 'cs-kyc',        label: 'KYC',         actionKinds: ['send-kyc'],           stepNumber: 2 },
  { key: 'cs-rates',      label: 'Rates',       actionKinds: ['check-rates'],        stepNumber: 3 },
  { key: 'cs-prep-quote', label: 'Prepare Quotation', actionKinds: ['prepare-quotation'], stepNumber: 4 },
  { key: 'cs-send-quote', label: 'Send Quote',  actionKinds: ['send-to-customer'],   stepNumber: 5 },
  { key: 'cs-response',   label: 'Response',    actionKinds: ['customer-response'],  stepNumber: 6 },
  { key: 'cs-booking',    label: 'Booking',     actionKinds: ['booking-request'],    stepNumber: 7 },
  { key: 'cs-release',    label: 'Release Order', actionKinds: ['release-booking'],  stepNumber: 8 },
  { key: 'cs-cutoff',     label: 'Cut Offs',          actionKinds: ['record-cutoff'],   stepNumber: 9 },
  { key: 'cs-si',         label: 'Cut Off Reminders', actionKinds: ['request-si'],    stepNumber: 10, group: 'post-cutoff' },
  { key: 'cs-submit-si',  label: 'Submit SI',         actionKinds: ['submit-si'],     stepNumber: 10, group: 'post-cutoff' },
  { key: 'cs-draft-bl',   label: 'Draft BL',          actionKinds: ['send-draft-bl'], stepNumber: 10, group: 'post-cutoff' },
  { key: 'cs-pre-advice', label: 'Pre-Advice',       actionKinds: ['send-pre-advice'], stepNumber: 11 },
  // Steps hidden from CS step bar (comment back in to re-enable)
  // { key: 'cs-master-bl',  label: 'Master BL',   actionKinds: ['record-master-bl'],   stepNumber: 12 },
  // { key: 'cs-house-bl',   label: 'House BL',    actionKinds: ['create-house-bl'],    stepNumber: 13 },
  // { key: 'cs-bl-approval',label: 'BL Approval', actionKinds: ['bl-approval'],        stepNumber: 14 },
]

const FINANCE_STEPS: StepDef[] = [
  { key: 'fin-kyc',       label: 'KYC Review',  actionKinds: ['verify-kyc'],         stepNumber: 1 },
  // { key: 'fin-approvals', label: 'Approvals',   actionKinds: ['approve-quote'],      stepNumber: 2 },
]

const PROCUREMENT_STEPS: StepDef[] = [
  { key: 'proc-rates',        label: 'Rate Check',       actionKinds: ['check-inttra-rates'],         stepNumber: 1 },
  { key: 'proc-booking-req',  label: 'Booking Request',  actionKinds: ['review-booking-request'],     stepNumber: 2 },
  { key: 'proc-booking',      label: 'Booking',          actionKinds: ['confirm-liner-booking'],      stepNumber: 3 },
  { key: 'proc-release',      label: 'Release Order',    actionKinds: ['attach-release-order'],       stepNumber: 4 },
  // { key: 'proc-urgent',   label: 'Urgent',      actionKinds: ['acknowledge-procurement'],  stepNumber: 4 },
]

const SALES_STEPS: StepDef[] = [
  { key: 'sales-inquiry',    label: 'Inquiry',           actionKinds: ['advance-workflow'],    stepNumber: 1 },
  { key: 'sales-kyc',        label: 'KYC',               actionKinds: ['send-kyc'],            stepNumber: 2 },
  { key: 'sales-rates',      label: 'Rates',             actionKinds: ['check-rates'],         stepNumber: 3 },
  { key: 'sales-prep-quote', label: 'Prepare Quotation', actionKinds: ['prepare-quotation'],   stepNumber: 4 },
  { key: 'sales-send-quote', label: 'Send Quote',        actionKinds: ['send-to-customer'],    stepNumber: 5 },
  { key: 'sales-response',   label: 'Response',          actionKinds: ['customer-response'],   stepNumber: 6 },
  { key: 'sales-booking',    label: 'Booking',           actionKinds: ['booking-request'],     stepNumber: 7 },
]

const ADMIN_STEPS: StepDef[] = [
  { key: 'adm-inquiry',     label: 'Inquiry',      actionKinds: ['advance-workflow'],        stepNumber: 1 },
  { key: 'adm-kyc-send',    label: 'KYC Send',     actionKinds: ['send-kyc'],               stepNumber: 2 },
  { key: 'adm-kyc-review',  label: 'KYC Review',   actionKinds: ['verify-kyc'],             stepNumber: 3 },
  { key: 'adm-rates-ams',   label: 'Database Rates',    actionKinds: ['check-rates'],            stepNumber: 4 },
  { key: 'adm-rates-inttra',label: 'Inttra Rates',  actionKinds: ['check-inttra-rates'],    stepNumber: 5 },
  { key: 'adm-quotation',   label: 'Quotation',    actionKinds: ['prepare-quotation'],       stepNumber: 6 },
  { key: 'adm-send-quote',  label: 'Send Quote',   actionKinds: ['send-to-customer'],        stepNumber: 7 },
  { key: 'adm-approvals',   label: 'Approvals',    actionKinds: ['approve-quote'],           stepNumber: 8 },
  { key: 'adm-response',    label: 'Response',     actionKinds: ['customer-response'],       stepNumber: 9 },
  { key: 'adm-booking',     label: 'Booking',      actionKinds: ['booking-request'],         stepNumber: 10 },
  { key: 'adm-book-liner',  label: 'Book Liner',   actionKinds: ['confirm-booking'],         stepNumber: 11 },
  { key: 'adm-proc-release',label: 'Release Order',actionKinds: ['attach-release-order'],    stepNumber: 12 },
  { key: 'adm-urgent',      label: 'Urgent',       actionKinds: ['acknowledge-procurement'], stepNumber: 13 },
  { key: 'adm-release',     label: 'Release',      actionKinds: ['release-booking'],         stepNumber: 14 },
  { key: 'adm-cutoff',      label: 'Cutoff',       actionKinds: ['record-cutoff'],           stepNumber: 14 },
  { key: 'adm-si',          label: 'Cut Off Reminders',  actionKinds: ['request-si'],    stepNumber: 15, group: 'post-cutoff' },
  { key: 'adm-submit-si',   label: 'Submit SI',    actionKinds: ['submit-si'],         stepNumber: 15, group: 'post-cutoff' },
  { key: 'adm-draft-bl',    label: 'Draft BL',     actionKinds: ['send-draft-bl'],     stepNumber: 15, group: 'post-cutoff' },
  { key: 'adm-pre-advice',  label: 'Pre-Advice',   actionKinds: ['send-pre-advice'],   stepNumber: 16 },
  { key: 'adm-master-bl',   label: 'Master BL',    actionKinds: ['record-master-bl'],        stepNumber: 17 },
  { key: 'adm-house-bl',    label: 'House BL',     actionKinds: ['create-house-bl'],         stepNumber: 18 },
  { key: 'adm-bl-approval', label: 'BL Approval',  actionKinds: ['bl-approval'],             stepNumber: 19 },
]

const ROLE_STEP_MAP: Record<string, StepDef[]> = {
  CS: CS_STEPS,
  Finance: FINANCE_STEPS,
  Procurement: PROCUREMENT_STEPS,
  Sales: SALES_STEPS,
  Admin: ADMIN_STEPS,
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Workspace({
  inquiries, bookings, quotes, customers, clientList, activityLog,
  onGoTo, onAdvanceWorkflow, onConfirmBooking, onMarkRaAssigned, onRevertBookingRequest, onAttachReleaseOrder, onReleaseBooking,
  onAcknowledgeProcurement, onCreateBooking,
  onSetBookingSiCutoff, onSetBookingBlCutoff, onSetBookingVgmCutoff, onSetBookingFilingCutoff,
  onMarkSiRequested, onMarkSiSubmitted, vesselSchedules, onAddVesselSchedule, onMarkDraftBlSent, onMarkPreAdviceSent, onSetBlStatus,
  onRecordMasterBl, onCreateHouseBl,
  onSetQuoteStatus, onUpdateCustomerKyc,
  onLogActivity, onFlash, onStartRateCheck,
  kycPendingClients, onSetKycPendingClients,
  kycRequests, onSetKycRequests, onRefreshKycRequests,
  initialStep,
}: WorkspaceProps) {
  const { activeRole, activeEmployee } = useRole()

  // Modal state for actions that need a form
  const [actionModal, setActionModal] = useState<WorkspaceItem | null>(null)
  const [formVessel, setFormVessel] = useState('')
  const [formVoyage, setFormVoyage] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formDecision, setFormDecision] = useState<'approve' | 'reject'>('approve')
  const [kycSending, setKycSending] = useState(false)
  // kycPendingClients come from props (fetched in App.tsx loadAppData alongside inquiries)
  // KYC document form state (Check Documents modal — CS/Sales fill in and submit to backend)
  const [kycBrNumber, setKycBrNumber] = useState('')
  const [kycParentOrg, setKycParentOrg] = useState('')
  const [kycDeadline, setKycDeadline] = useState('')
  const [kycCliType, setKycCliType] = useState('')
  const [kycCurrency, setKycCurrency] = useState('USD')
  const [kycWebsite, setKycWebsite] = useState('')
  const [kycSvatNo, setKycSvatNo] = useState('')
  const [kycTaxExemptions, setKycTaxExemptions] = useState('N/A')
  const [kycSeaImports, setKycSeaImports] = useState(false)
  const [kycSeaExports, setKycSeaExports] = useState(false)
  const [kycTradeLanes, setKycTradeLanes] = useState(false)
  const [kycForwarding, setKycForwarding] = useState(false)
  const [kycCrossTrade, setKycCrossTrade] = useState(false)
  const [kycAirImports, setKycAirImports] = useState(false)
  const [kycAirExports, setKycAirExports] = useState(false)
  const [kycGeneralCargo, setKycGeneralCargo] = useState(false)
  const [kycDangerousGoods, setKycDangerousGoods] = useState(false)
  const [kycPerishableGoods, setKycPerishableGoods] = useState(false)
  // Document checklist — backend accepts 'true' or 'false' as strings
  const [kycDocBrForm, setKycDocBrForm] = useState('false')
  const [kycDocVatCert, setKycDocVatCert] = useState('false')
  const [kycDocSvatCert, setKycDocSvatCert] = useState('false')
  const [kycDocTinCert, setKycDocTinCert] = useState('false')
  const [kycDocForm20, setKycDocForm20] = useState('false')
  // Quotation prep state (Sales edits document)
  const [quotationContent, setQuotationContent] = useState('')
  const [quoteCopied, setQuoteCopied] = useState(false)
  const [paCopied, setPaCopied] = useState(false)
  // Send-to-customer state (CS sends via Email or WhatsApp)
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email')
  const [waConfirmed, setWaConfirmed] = useState(false)
  const [customerContactEmail, setCustomerContactEmail] = useState('')
  const [customerContactPhone, setCustomerContactPhone] = useState('')
  const [quotationSending, setQuotationSending] = useState(false)
  // Customer response state (accept / reject)
  const [customerDecision, setCustomerDecision] = useState<'accepted' | 'rejected'>('accepted')
  // Liner booking confirmation state (Procurement Booking step)
  const [linerBooked, setLinerBooked] = useState<'yes' | 'no' | ''>('')
  // Backend quotation ID — set in prepare-quotation, used in customer-response
  const [lastQuotationId, setLastQuotationId] = useState<number | null>(null)
  // Quotation options loaded from backend for the customer-response modal
  const [quotationOptions, setQuotationOptions] = useState<QuotationOptionRow[]>([])
  const [selectedOptionRateId, setSelectedOptionRateId] = useState<number | null>(null)
  const [quotationOptionsLoading, setQuotationOptionsLoading] = useState(false)
  // Booking request form state
  const [bkShippingLine, setBkShippingLine] = useState('')       // Carrier
  const [bkContainerType, setBkContainerType] = useState("20'GP")
  const [bkQuantity, setBkQuantity] = useState(1)
  // Dynamic container list (prefilled from inquiry, editable)
  const [bkContainers, setBkContainers] = useState<{ type: string; qty: number }[]>([{ type: "20'GP", qty: 1 }])
  const [bkCommodity, setBkCommodity] = useState('')
  const [bkCargoReadyDate, setBkCargoReadyDate] = useState('')
  const [bkVessel, setBkVessel] = useState('')                   // Vessel name
  const [bkVoyage, setBkVoyage] = useState('')                   // Voyage number
  const [bkPod, setBkPod] = useState('')                        // Port of Discharge
  const [bkContractNo, setBkContractNo] = useState('')
  const [bkAgreedRate, setBkAgreedRate] = useState('')
  const [bkRateRemark, setBkRateRemark] = useState('')
  const [bkDeliveryTerm, setBkDeliveryTerm] = useState('')
  const [bkHsCode, setBkHsCode] = useState('')
  const [bkBlType, setBkBlType] = useState<'OBL' | 'Seaway Bill' | ''>('')
  const [bkBookingType, setBkBookingType] = useState<'Spot' | 'FAK' | ''>('')
  const [bkReeferTemp, setBkReeferTemp] = useState('')
  const [bkDeliveryAgent, setBkDeliveryAgent] = useState('')
  const [bkSpecificRouting, setBkSpecificRouting] = useState('')
  const [bkRaNumber, setBkRaNumber] = useState('')        // RA number — added by Procurement

  // Release order attachment state (Procurement Release Order step)
  const [roFields, setRoFields] = useState<ReleaseOrderFields>({
    reference_nbr: '', pickup_empty_date: '', validity_expiration_date: '',
    pickup_depot: '', pickup_depot_address: '', cargo_description: '',
    cargo_weight: '', cut_off_date: '', etd: '', eta: '',
    next_port_of_discharge: '', transport_mode: '', transport_carrier: '',
  })
  // CS Release Order send step
  const [releaseDraft, setReleaseDraft] = useState('')

  // Vessel cutoff schedule panel state
  // cutoffPanelOpen removed — cutoff is now a workflow step modal
  const [_cutoffBookingId, setCutoffBookingId] = useState('')
  const [cutoffLiner, setCutoffLiner] = useState('')
  const [cutoffMode, setCutoffMode] = useState<'paste' | 'upload'>('paste')
  const [cutoffContent, setCutoffContent] = useState('')
  const [cutoffFileName, setCutoffFileName] = useState('')

  // Reference data
  const [linerList, setLinerList] = useState<LinerRecord[]>([])
  useEffect(() => { apiGetLiners().then(setLinerList).catch(() => {}) }, [])
  const [cutoffNotes, setCutoffNotes] = useState('')
  const [cutoffSiDate, setCutoffSiDate] = useState('')
  const [cutoffBlDate, setCutoffBlDate] = useState('')
  const [cutoffVgmDate, setCutoffVgmDate] = useState('')
  const [cutoffFilingDate, setCutoffFilingDate] = useState('')
  // Submit SI to liner state
  const [siContent, setSiContent] = useState('')
  const [siFileName, setSiFileName] = useState('')
  const [siMode, setSiMode] = useState<'paste' | 'upload'>('paste')
  const [inttraSiLoading, setInttraSiLoading] = useState(false)
  // VGM certificate upload
  const [vgmCertFileName, setVgmCertFileName] = useState('')
  const [vgmCertContent, setVgmCertContent] = useState('')
  // Draft BL state
  const [draftBlContent, setDraftBlContent] = useState('')
  const [draftBlFileName, setDraftBlFileName] = useState('')
  const [draftBlMode, setDraftBlMode] = useState<'paste' | 'upload'>('paste')
  // Draft BL — Phase 1 vessel / Phase 2 booking / Phase 3 send
  const [draftBlPhase, setDraftBlPhase] = useState<1 | 2 | 3>(1)
  const [vesselScheduleType, setVesselScheduleType] = useState<'FCL' | 'CONSOL' | 'BOTH'>('FCL')
  const [vesselPol, setVesselPol] = useState('')
  const [vesselEtaPol, setVesselEtaPol] = useState('')
  const [vesselEtdPol, setVesselEtdPol] = useState('')
  const [vesselRoutingType, setVesselRoutingType] = useState<'DIRECT' | 'TRANSSHIPMENT'>('DIRECT')
  const [vesselFinalPod, setVesselFinalPod] = useState('')
  const [vesselEtaFpod, setVesselEtaFpod] = useState('')
  const [vesselRemarks, setVesselRemarks] = useState('')
  const [vesselAgent, setVesselAgent] = useState('')
  const [selectedReleaseOrderId, setSelectedReleaseOrderId] = useState('')
  const [showVesselSuggestions, setShowVesselSuggestions] = useState(false)
  // Draft BL — Phase 2 booking form (Gensoft fields)
  const [bkgForm, setBkgForm] = useState<Record<string, string>>({})
  const bkgField = (key: string) => bkgForm[key] ?? ''
  const setBkgField = (key: string, value: string) => setBkgForm(prev => ({ ...prev, [key]: value }))
  // BL Approval state
  const [blDecision, setBlDecision] = useState<'approved' | 'changes-requested'>('approved')
  // Master BL state
  const [masterBlNumber, setMasterBlNumber] = useState('')
  const [masterBlShipper, setMasterBlShipper] = useState('Synergy Shipping & Logistics')
  const [masterBlConsignee, setMasterBlConsignee] = useState('')
  // House BL state
  const [houseBlNumber, setHouseBlNumber] = useState('')
  const [houseBlShipper, setHouseBlShipper] = useState('')
  const [houseBlConsignee, setHouseBlConsignee] = useState('')
  // Pre-Advice state
  const [paForm, setPaForm] = useState<Record<string, string>>({})
  const paField = (key: string) => paForm[key] ?? ''
  const setPaField = (key: string, value: string) => setPaForm(prev => ({ ...prev, [key]: value }))

  // Step navigation state — initialStep lets the parent jump directly to a specific step on mount
  const [activeStep, setActiveStep] = useState<string | null>(initialStep ?? null)
  useEffect(() => { setActiveStep(null) }, [activeRole])

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

  const generateReleaseOrderDraft = (bkg: Booking, method: 'email' | 'whatsapp'): string => {
    const ro = bkg.release_order_fields
    const agentName = empName(activeEmployee.id)
    if (method === 'email') {
      return [
        `Subject: Release Order — ${bkg.id} — ${bkg.customer_name} — ${bkg.origin} → ${bkg.destination}`,
        '',
        `Dear ${bkg.customer_name},`,
        '',
        'Please find below your release order details for the above-referenced shipment.',
        '',
        '── RELEASE ORDER ──────────────────────────',
        ro?.reference_nbr   ? `Reference:     ${ro.reference_nbr}`           : '',
        ro?.pickup_depot    ? `Pick Up Depot: ${ro.pickup_depot}`             : '',
        ro?.pickup_depot_address ? `Depot Address: ${ro.pickup_depot_address}` : '',
        ro?.pickup_empty_date        ? `Pick Up Date:  ${ro.pickup_empty_date}`        : '',
        ro?.validity_expiration_date ? `Valid Until:   ${ro.validity_expiration_date}` : '',
        '',
        '── SHIPMENT DETAILS ────────────────────────',
        `Customer:      ${bkg.customer_name}`,
        `Origin:        ${bkg.origin}`,
        `Destination:   ${bkg.destination}`,
        `Container:     ${bkg.quantity}x ${bkg.container_type}`,
        ro?.cargo_description ? `Cargo:         ${ro.cargo_description}` : '',
        ro?.cargo_weight      ? `Weight:        ${ro.cargo_weight} kg`   : '',
        '',
        '── VESSEL SCHEDULE ─────────────────────────',
        `Carrier:       ${bkg.shipping_line}`,
        `Vessel:        ${bkg.vessel_name}`,
        `Voyage:        ${bkg.voyage_number}`,
        ro?.cut_off_date ? `Cut-Off:       ${ro.cut_off_date}` : '',
        ro?.etd          ? `ETD:           ${ro.etd}`           : '',
        ro?.eta          ? `ETA:           ${ro.eta}`           : '',
        '',
        'Please arrange to collect the empty containers from the depot before the cut-off date.',
        '',
        'Should you require any further assistance, please do not hesitate to contact us.',
        '',
        'Kind regards,',
        agentName,
        'Neuball Freight Services',
      ].filter(l => l !== null && l !== undefined).join('\n')
    } else {
      return [
        `*Release Order — ${bkg.customer_name}*`,
        `_${bkg.origin} → ${bkg.destination}_`,
        '',
        ro?.reference_nbr            ? `📋 *Reference:* ${ro.reference_nbr}`               : '',
        ro?.pickup_depot             ? `🏭 *Pick Up Depot:* ${ro.pickup_depot}`             : '',
        ro?.pickup_depot_address     ? `📍 *Address:* ${ro.pickup_depot_address}`           : '',
        ro?.pickup_empty_date        ? `📅 *Pick Up Date:* ${ro.pickup_empty_date}`         : '',
        ro?.validity_expiration_date ? `✅ *Valid Until:* ${ro.validity_expiration_date}`   : '',
        '',
        `🚢 *Vessel:* ${bkg.vessel_name}  |  *Voyage:* ${bkg.voyage_number}`,
        `📦 *Container:* ${bkg.quantity}x ${bkg.container_type}`,
        ro?.cut_off_date ? `⏰ *Cut-Off:* ${ro.cut_off_date}` : '',
        ro?.etd          ? `🛫 *ETD:* ${ro.etd}`               : '',
        ro?.eta          ? `🛬 *ETA:* ${ro.eta}`               : '',
        '',
        'Please arrange container pick-up before the cut-off date.',
        'Contact us if you need any assistance.',
      ].filter(l => l !== null && l !== undefined).join('\n')
    }
  }

  const findContext = (refId: string): ActivityEntry | null =>
    activityLog.find(a => a.ref_id === refId) ?? null

  // ---------------------------------------------------------------------------
  // Derive pending items from existing data
  // ---------------------------------------------------------------------------

  const { pendingItems, recentlyPushed } = useMemo(() => {
    const pending: WorkspaceItem[] = []
    const role = activeRole === 'Admin' ? null : activeRole

    // --- From Inquiries (by workflow_stage) ---
    // Multi-container inquiries are split: one work item per container.
    for (const inq of inquiries) {
      if (inq.status === 'completed' || !inq.workflow_stage) continue
      const stage = WORKFLOW_STAGES.find(s => s.id === inq.workflow_stage)
      if (!stage) continue
      if (role && !stage.roles.includes(role)) continue
      if (inq.workflow_stage === 'completed') continue

      // Determine the next stage (simple step+1 — no KYC routing, all inquiries start at rate-check)
      const resolvedNextStage = WORKFLOW_STAGES.find(s => s.step === stage.step + 1)
      if (!resolvedNextStage) continue

      const cust = customers.find(c => c.name.toLowerCase() === inq.customer_name.toLowerCase())

      // Build the list of containers to iterate over.
      // If the inquiry has no containers array, create a single synthetic entry.
      const containerEntries: { container: ContainerLine; containerIdx: number }[] =
        inq.containers && inq.containers.length > 0
          ? inq.containers.map((c, ci) => ({ container: c, containerIdx: ci }))
          : [{
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
            }]

      for (const { container: cont, containerIdx: ci } of containerEntries) {
        const dest = cont.destination || inq.destination
        const containerLabel = `${cont.quantity}x ${cont.containerType}`
        const routeLabel = `${inq.origin} → ${dest}`

        let title = ''
        let actionKind = 'advance-workflow'
        let actionLabel = `Push to ${stageRoleLabel(resolvedNextStage)}`

        switch (inq.workflow_stage) {
          case 'rate-check':
            title = `Rate check: ${routeLabel} · ${containerLabel}`
            actionKind = 'check-rates'
            actionLabel = 'Check Rates (Database + Spot + INTTRA)'
            break
          case 'procurement-request':
            title = `Procurement escalation: ${routeLabel} · ${containerLabel}`
            actionKind = 'check-inttra-rates'
            actionLabel = 'Check Rates'
            break
          case 'quotation-prep':
            title = `Prepare quotation for ${inq.customer_name} · ${containerLabel}`
            actionKind = 'prepare-quotation'
            actionLabel = 'Prepare Quotation'
            break
          case 'quotation-sent':
            title = `Send quotation to ${inq.customer_name}`
            actionKind = 'send-to-customer'
            actionLabel = 'Send to Customer'
            break
          case 'customer-response':
            title = `Awaiting response from ${inq.customer_name}`
            actionKind = 'customer-response'
            actionLabel = 'Record Response'
            break
          case 'booking-request':
            title = `Create booking for ${inq.customer_name} · ${containerLabel}`
            actionKind = 'booking-request'
            actionLabel = 'Create Booking'
            break
          default:                    title = `${stage.label} — ${inq.customer_name}`
        }

        pending.push({
          type: 'inquiry',
          refId: inq.id,
          customerName: inq.customer_name,
          title,
          subtitle: `${inq.request} · ${routeLabel} · ${containerLabel} · ${inq.delivery_type === 'door-to-door' ? 'Door-to-Door' : 'Port-to-Port'}`,
          urgentFlag: isSpotInquiry(inq.inquiry_text ?? ''),
          createdAt: inq.created_at,
          previousContext: findContext(inq.id),
          actionLabel,
          actionKind,
          sourceData: { inquiry: inq, nextStage: resolvedNextStage.id, container: cont, containerIdx: ci, customer: cust },
          kycIncomplete: inq.kyc_completed === false,
        })
      }
    }

    // --- From Bookings (by status) ---
    for (const bkg of bookings) {
      if (bkg.status === 'Pending Liner' && (!role || role === 'Procurement')) {
        pending.push({
          type: 'booking',
          refId: bkg.id,
          customerName: bkg.customer_name,
          title: `Booking request from CS — ${bkg.customer_name}`,
          subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · ${bkg.shipping_line || 'Any carrier'}`,
          urgentFlag: bkg.is_urgent,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Review & Process',
          actionKind: 'review-booking-request',
          sourceData: { booking: bkg },
        })
      }

      if (bkg.status === 'RA Assigned' && (!role || role === 'Procurement')) {
        pending.push({
          type: 'booking',
          refId: bkg.id,
          customerName: bkg.customer_name,
          title: `Confirm liner booking — ${bkg.customer_name}`,
          subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.shipping_line} · RA# ${bkg.voyage_number || 'pending'}`,
          urgentFlag: bkg.is_urgent,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Confirm Booking',
          actionKind: 'confirm-liner-booking',
          sourceData: { booking: bkg },
        })
      }

      if (bkg.status === 'Liner Confirmed' && !bkg.release_order_attached && (!role || role === 'Procurement')) {
        pending.push({
          type: 'booking',
          refId: bkg.id,
          customerName: bkg.customer_name,
          title: `Attach release order — ${bkg.customer_name}`,
          subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.shipping_line} · ${bkg.vessel_name}${bkg.voyage_number ? ` / ${bkg.voyage_number}` : ''}`,
          urgentFlag: bkg.is_urgent,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Attach Release Order',
          actionKind: 'attach-release-order',
          sourceData: { booking: bkg },
        })
      }

      if (bkg.status === 'Liner Confirmed' && !bkg.released_by && bkg.release_order_attached && (!role || role === 'CS')) {
        pending.push({
          type: 'booking',
          refId: bkg.id,
          customerName: bkg.customer_name,
          title: `Release booking to ${bkg.customer_name}`,
          subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.vessel_name}${bkg.voyage_number ? ` / ${bkg.voyage_number}` : ''}`,
          urgentFlag: bkg.is_urgent,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Release to Customer',
          actionKind: 'release-booking',
          sourceData: { booking: bkg },
        })
      }

      if (bkg.is_urgent && !bkg.procurement_notified && bkg.status !== 'Pending Liner' && (!role || role === 'Procurement')) {
        pending.push({
          type: 'booking',
          refId: bkg.id,
          customerName: bkg.customer_name,
          title: `Acknowledge urgent booking for ${bkg.customer_name}`,
          subtitle: `Urgent bypass — CS booked directly. ${bkg.quantity}x ${bkg.container_type} · ${bkg.shipping_line}`,
          urgentFlag: true,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Acknowledge',
          actionKind: 'acknowledge-procurement',
          sourceData: { booking: bkg },
        })
      }
    }

    // --- From Bookings (record cutoff schedule) ---
    for (const bkg of bookings) {
      if (bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue
      const hasCutoff = activityLog.some(a => a.ref_id === bkg.id && a.action.includes('Recorded vessel cutoff schedule'))
      if (hasCutoff) continue

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Record vessel cutoff schedule for ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · ${bkg.shipping_line || 'No liner'}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Record Cutoff',
        actionKind: 'record-cutoff',
        sourceData: { booking: bkg },
      })
    }

    // --- From Bookings (SI reminder — show all with cutoff dates, sorted by urgency) ---
    for (const bkg of bookings) {
      if (bkg.si_requested) continue
      const cutoffDate = bkg.bl_cutoff_date || bkg.si_cutoff_date
      if (!cutoffDate) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      const dLeft = daysUntil(cutoffDate)
      const isOvd = dLeft < 0
      const urgencyText = isOvd
        ? `OVERDUE by ${Math.abs(dLeft)} day(s)`
        : dLeft === 0 ? 'Due TODAY' : `${dLeft} day(s) left`

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Send cutoff reminder to ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · SI/BL cutoff: ${cutoffDate} (${urgencyText})`,
        urgentFlag: isOvd || dLeft <= 2,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Send Reminder',
        actionKind: 'request-si',
        sourceData: { booking: bkg },
        urgencySortKey: dLeft,
      })
    }

    // Helper: build cutoff date suffix for subtitles
    const cutoffSuffix = (bkg: Booking) => {
      const parts: string[] = []
      const sibl = bkg.si_cutoff_date || bkg.bl_cutoff_date
      if (sibl) parts.push(`SI/BL: ${sibl}`)
      if (bkg.vgm_cutoff_date) parts.push(`VGM: ${bkg.vgm_cutoff_date}`)
      return parts.length ? ` · ${parts.join(' · ')}` : ''
    }

    // --- From Bookings (submit SI to liner) — parallel with reminders & Draft BL ---
    for (const bkg of bookings) {
      if (bkg.si_submitted) continue
      const hasCutoffDates = bkg.si_cutoff_date || bkg.bl_cutoff_date || bkg.vgm_cutoff_date
      if (!hasCutoffDates) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Submit SI to liner for ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination}${cutoffSuffix(bkg)}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Submit SI',
        actionKind: 'submit-si',
        sourceData: { booking: bkg },
      })
    }

    // --- From Bookings (record Draft BL + send to customer) — parallel with reminders & SI ---
    for (const bkg of bookings) {
      if (bkg.delivery_type === 'door-to-door') continue // door-to-door skips Draft BL
      if (bkg.draft_bl_sent) continue
      const hasCutoffDates = bkg.si_cutoff_date || bkg.bl_cutoff_date || bkg.vgm_cutoff_date
      if (!hasCutoffDates) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Record Draft BL & send to ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination}${cutoffSuffix(bkg)}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Send Draft BL',
        actionKind: 'send-draft-bl',
        sourceData: { booking: bkg },
      })
    }

    // --- Master BL (door-to-door only) — parallel with reminders & SI ---
    for (const bkg of bookings) {
      if (bkg.delivery_type !== 'door-to-door') continue
      if (bkg.master_bl_recorded) continue
      const hasCutoffDates = bkg.si_cutoff_date || bkg.bl_cutoff_date || bkg.vgm_cutoff_date
      if (!hasCutoffDates) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Record Master BL for ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination}${cutoffSuffix(bkg)}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Record Master BL',
        actionKind: 'record-master-bl',
        sourceData: { booking: bkg },
      })
    }

    // --- House BL (door-to-door only, after Master BL recorded) ---
    for (const bkg of bookings) {
      if (bkg.delivery_type !== 'door-to-door') continue
      if (!bkg.master_bl_recorded) continue
      if (bkg.house_bl_created) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Create & send House BL to ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · Master BL: ${bkg.master_bl_number || 'N/A'}${cutoffSuffix(bkg)}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Create & Send House BL',
        actionKind: 'create-house-bl',
        sourceData: { booking: bkg },
      })
    }

    // --- Pre-Advice (door-to-door / port-to-door only, after BOTH Draft BL sent AND SI submitted) ---
    for (const bkg of bookings) {
      if (bkg.delivery_type !== 'door-to-door' && bkg.delivery_type !== 'port-to-door') continue
      if (!bkg.draft_bl_sent || !bkg.si_submitted) continue
      if (bkg.pre_advice_sent) continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      const blCutoff = bkg.bl_cutoff_date || bkg.si_cutoff_date
      const urgencyText = blCutoff ? (() => {
        const dl = daysUntil(blCutoff)
        return dl < 0 ? `OVERDUE by ${Math.abs(dl)} day(s)` : dl === 0 ? 'Due TODAY' : `${dl} day(s) to BL cutoff`
      })() : ''

      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Send Pre-Advice to door agent for ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination}${blCutoff ? ` · BL cutoff: ${blCutoff} (${urgencyText})` : ''}`,
        urgentFlag: blCutoff ? daysUntil(blCutoff) <= 1 : false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Send Pre-Advice',
        actionKind: 'send-pre-advice',
        sourceData: { booking: bkg },
      })
    }

    // --- BL Approval (port-to-port: after Draft BL sent; door-to-door: after House BL sent) ---
    for (const bkg of bookings) {
      const isDtd = bkg.delivery_type === 'door-to-door'
      if (isDtd) {
        if (!bkg.house_bl_created) continue
      } else {
        if (!bkg.draft_bl_sent) continue
      }
      if (bkg.bl_status && bkg.bl_status !== 'pending') continue
      if (bkg.status !== 'Liner Confirmed' && bkg.status !== 'Released') continue
      if (role && role !== 'CS') continue

      const blLabel = isDtd ? 'House BL' : 'Draft BL'
      pending.push({
        type: 'booking',
        refId: bkg.id,
        customerName: bkg.customer_name,
        title: `Record ${blLabel} approval from ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination}${cutoffSuffix(bkg)}`,
        urgentFlag: false,
        createdAt: bkg.created_at,
        previousContext: findContext(bkg.id),
        actionLabel: 'Record Response',
        actionKind: 'bl-approval',
        sourceData: { booking: bkg },
      })
    }

    // --- From Quotes (by status) ---
    for (const q of quotes) {
      if (q.status === 'Awaiting Approval' && (!role || role === 'Finance')) {
        pending.push({
          type: 'quote',
          refId: q.id,
          customerName: q.customer_name,
          title: `Approve quotation for ${q.customer_name}`,
          subtitle: `${q.origin} → ${q.destination} · Margin ${q.margin_pct}%${q.approval_reason ? ` · ${q.approval_reason}` : ''}`,
          urgentFlag: false,
          createdAt: q.created_at,
          previousContext: findContext(q.id),
          actionLabel: 'Approve / Reject',
          actionKind: 'approve-quote',
          sourceData: { quote: q },
        })
      }
    }

    // --- From KYC Pending Queue (GET /kyc/kyc-requests/pending) ---
    // CS and Sales see clients awaiting KYC initiation regardless of inquiry workflow stage
    if (!role || role === 'CS' || role === 'Sales') {
      for (const client of kycPendingClients) {
        pending.push({
          type: 'inquiry',
          refId: `KYC-${client.cli_id}`,
          customerName: client.name,
          title: `Initiate KYC for ${client.name}`,
          subtitle: [client.addr_city, client.addr_country].filter(Boolean).join(', ') || 'No address on file',
          urgentFlag: false,
          createdAt: '',
          previousContext: null,
          actionLabel: 'Check Documents',
          actionKind: 'send-kyc',
          sourceData: { kycClient: client },
        })
      }
    }

    // --- From KYC Requests (GET /kyc/kyc-requests/requests) ---
    // Finance and Admin see submitted KYC requests awaiting review (kyc_pending stage)
    if (!role || role === 'Finance') {
      for (const req of kycRequests) {
        if (req.kyc_stage !== 'kyc_pending' && req.kyc_stage !== 'documents_submitted') continue
        const docsSubmitted = req.docs
          ? Object.values(req.docs).filter(v => v === 'true').length
          : 0
        const totalDocs = req.docs ? Object.keys(req.docs).length : 0
        pending.push({
          type: 'inquiry',
          refId: `KYC-REQ-${req.kyc_id}`,
          customerName: req.name ?? `Client #${req.cli_id}`,
          title: `Verify KYC for ${req.name ?? `Client #${req.cli_id}`}`,
          subtitle: `${docsSubmitted}/${totalDocs} documents submitted · ${req.cli_type ?? 'Unknown type'} · ${req.currency ?? ''}`.trim().replace(/\s·\s$/, ''),
          urgentFlag: false,
          createdAt: req.document_submission_deadline ?? '',
          previousContext: null,
          actionLabel: 'Review KYC',
          actionKind: 'verify-kyc',
          sourceData: { kycRequest: req },
        })
      }
    }

    // Sort: urgent first, then by urgencySortKey (lower = more urgent), then newest first
    pending.sort((a, b) => {
      if (a.urgentFlag !== b.urgentFlag) return a.urgentFlag ? -1 : 1
      // If both have urgencySortKey, sort by it (lower = more urgent)
      const aKey = a.urgencySortKey ?? Infinity
      const bKey = b.urgencySortKey ?? Infinity
      if (aKey !== bKey) return aKey - bKey
      if (!a.createdAt && b.createdAt) return 1
      if (a.createdAt && !b.createdAt) return -1
      return b.createdAt.localeCompare(a.createdAt)
    })

    // Recently pushed: activity log entries where actor_role matches
    const pushed = activityLog
      .filter(a => role ? a.actor_role === role : true)
      .slice(0, 10)

    return { pendingItems: pending, recentlyPushed: pushed }
  }, [inquiries, bookings, quotes, customers, activityLog, activeRole, kycPendingClients, kycRequests]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Step-based filtering (replaces filter chips)
  // ---------------------------------------------------------------------------

  const roleSteps = ROLE_STEP_MAP[activeRole] ?? CS_STEPS

  const stepCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const step of roleSteps) {
      counts[step.key] = pendingItems.filter(i => step.actionKinds.includes(i.actionKind)).length
    }
    return counts
  }, [pendingItems, roleSteps])

  // For parallel groups: a group is "available" if ANY step in it has items
  const groupHasItems = useMemo(() => {
    const result: Record<string, boolean> = {}
    for (const step of roleSteps) {
      if (step.group) {
        if (!result[step.group]) result[step.group] = false
        if ((stepCounts[step.key] ?? 0) > 0) result[step.group] = true
      }
    }
    return result
  }, [roleSteps, stepCounts])

  const effectiveStep = useMemo(() => {
    if (activeStep && roleSteps.some(s => s.key === activeStep)) return activeStep
    const firstWithItems = roleSteps.find(s => (stepCounts[s.key] ?? 0) > 0)
    return firstWithItems?.key ?? roleSteps[0]?.key ?? null
  }, [activeStep, roleSteps, stepCounts])

  const filteredItems = useMemo(() => {
    if (!effectiveStep) return pendingItems
    const step = roleSteps.find(s => s.key === effectiveStep)
    if (!step) return pendingItems
    return pendingItems.filter(i => step.actionKinds.includes(i.actionKind))
  }, [pendingItems, effectiveStep, roleSteps])


  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleAction = async (item: WorkspaceItem) => {
    switch (item.actionKind) {
      case 'advance-workflow': {
        const { inquiry, container } = item.sourceData
        const resolvedNext = item.sourceData.nextStage as string
        onAdvanceWorkflow(inquiry.id, resolvedNext as import('../../types').WorkflowStage)
        const nextStageObj = WORKFLOW_STAGES.find(s => s.id === resolvedNext)!
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Completed ${WORKFLOW_STAGES.find(s => s.id === inquiry.workflow_stage)?.label}. Pushed to ${stageRoleLabel(nextStageObj)}.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: stageRoleLabel(nextStageObj),
          notes: `${inquiry.request} · ${inquiry.origin} → ${inquiry.destination}`,
        })
        // All inquiries go directly to Rate Check; open it immediately
        if (resolvedNext === 'rate-check') {
          onStartRateCheck(inquiry, container, 'cs-sales')
          return
        }
        // Map the destination workflow stage to the step that will handle items there
        const stageActionMap: Record<string, string> = {
          'rate-check': 'check-rates', 'procurement-request': 'check-inttra-rates',
          'quotation-prep': 'prepare-quotation', 'quotation-sent': 'send-to-customer',
          'customer-response': 'customer-response', 'booking-request': 'booking-request',
        }
        const destActionKind = stageActionMap[resolvedNext]
        const destStep = destActionKind ? roleSteps.find(s => s.actionKinds.includes(destActionKind)) : null
        const csOrSales = (r: string) => r === 'CS' || r === 'Sales'
        const crossDept = activeRole !== 'Admin' && nextStageObj.role !== activeRole &&
                          !(csOrSales(activeRole) && csOrSales(nextStageObj.role))
        onFlash(`${inquiry.id} pushed to ${ROLE_LABELS[nextStageObj.role]}`,
          !crossDept && destStep ? { label: `Go to ${destStep.label}`, onClick: () => setActiveStep(destStep.key) } : undefined)
        break
      }
      case 'acknowledge-procurement': {
        const { booking } = item.sourceData
        onAcknowledgeProcurement(booking.id)
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Acknowledged urgent booking ${booking.id}`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: 'Procurement acknowledged urgent bypass booking.',
        })
        break
      }
      case 'check-rates': {
        const { inquiry, container } = item.sourceData
        onStartRateCheck(inquiry, container, 'cs-sales')
        return
      }
      case 'check-inttra-rates': {
        const { inquiry, container } = item.sourceData
        onStartRateCheck(inquiry, container, 'procurement')
        return
      }
      case 'prepare-quotation': {
        // Pre-fill quotation document from rate brief in previous activity log entry
        const { inquiry: qInq, container: qCont } = item.sourceData
        const qCust = customers.find(c => c.name.toLowerCase() === qInq.customer_name.toLowerCase())
        const ctx = item.previousContext
        const notes = ctx?.notes ?? ''
        // Extract DB rates and manual rates separately
        const dbRateMatch = notes.match(/DB Rates:\s*([^|]+)/i)
        const manualRateMatch = notes.match(/Manual Rates?:\s*([^|]+)/i)
        const dbRates = dbRateMatch?.[1]?.trim() ?? ''
        const manualRates = manualRateMatch?.[1]?.trim() ?? ''
        // Build bullet-style rate option list
        const rateLines: string[] = []
        if (dbRates) dbRates.split(';').map((r: string) => r.trim()).filter(Boolean).forEach((r: string) => rateLines.push(`  • ${r}`))
        if (manualRates) manualRates.split('||').map((r: string) => r.trim()).filter(Boolean).forEach((r: string) => rateLines.push(`  • ${r}`))
        const rateSection = rateLines.length > 0 ? rateLines.join('\n') : '  • (Rate options to be confirmed — please edit)'
        // Pull Procurement's message to Sales (stored before "Customer:" segment in notes)
        const procMsgMatch = notes.match(/^(.+?) \| Customer:/i)
        const procNote = procMsgMatch?.[1]?.trim() ?? ''
        // Container / route details
        const dest = qCont?.destination || qInq.destination
        const containerLabel = qCont ? `${qCont.quantity}× ${qCont.containerType}` : ''
        const commodityLabel = qCont?.commodityType ? ` · ${qCont.commodityType}` : qInq.commodity_type ? ` · ${qInq.commodity_type}` : ''
        const today = new Date().toISOString().slice(0, 10)
        setQuotationContent(
`FREIGHT QUOTATION

To: ${qInq.customer_name}${qCust?.tier ? ` (${qCust.tier})` : ''}
Date: ${today}
Reference: ${qInq.id}

Dear ${qInq.customer_name},

Thank you for your freight enquiry. We are pleased to offer the following:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SHIPMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Route:       ${qInq.origin} → ${dest}
Cargo:       ${containerLabel}${commodityLabel}
Service:     ${qInq.delivery_type === 'door-to-door' ? 'Door-to-Door' : 'Port-to-Port'}${qInq.incoterm ? ` (${qInq.incoterm})` : ''}${qInq.cargo_ready_date ? `\nCargo Ready: ${qInq.cargo_ready_date}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RATE OPTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${rateSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TERMS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Validity: 14 days from date of this quotation
• Rates subject to space and equipment availability
• Port surcharges, customs, and inland haulage quoted separately unless stated above
${procNote ? `\nNOTES: ${procNote}` : ''}
Please confirm your preferred option at your earliest convenience.

Best regards,
${activeEmployee.name}
ABC Logistics (Pvt) Ltd`
        )
        setQuoteCopied(false)
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'send-to-customer': {
        // CS sends quotation to customer — pre-fill contact details if available
        setFormNote('')
        const sendCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        setCustomerContactEmail(sendCust?.contact_email ?? '')
        setCustomerContactPhone(sendCust?.contact_phone ?? '')
        setSendMethod(sendCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
        setQuotationSending(false)
        setActionModal(item)
        break
      }
      case 'customer-response': {
        setFormNote('')
        setCustomerDecision('accepted')
        setQuotationOptions([])
        setSelectedOptionRateId(null)
        setQuotationOptionsLoading(false)
        // Load quotation options from backend
        const crInquiry = item.sourceData?.inquiry
        const crQuoteId = lastQuotationId ?? crInquiry?.quotation_id
        if (crQuoteId) {
          setQuotationOptionsLoading(true)
          apiFetchQuotation(crQuoteId)
            .then(rows => {
              // Filter to rows that actually have an option (LEFT JOIN may return null option_id)
              const opts = rows.filter(r => r.option_id != null)
              setQuotationOptions(opts)
              if (opts.length === 1) setSelectedOptionRateId(opts[0].rate_id)
            })
            .catch(err => console.error('[Workspace] Failed to load quotation options:', err))
            .finally(() => setQuotationOptionsLoading(false))
        }
        setActionModal(item)
        break
      }
      case 'booking-request': {
        // Pre-fill from inquiry data + activity log rate context
        const { inquiry: brInq } = item.sourceData
        setFormNote('')

        // Scan all activity log entries for this inquiry to extract rate/liner data
        const allCtx = activityLog.filter(a => a.ref_id === brInq.id)
        let liner = ''
        let container = ''
        let qty = ''
        for (const entry of allCtx) {
          const n = entry.notes ?? ''
          // From InttraAPI/Database rates: "Maersk $1200 20'GP ..."
          const rateMatch = n.match(/Selected rates?:\s*(\w[\w\s-]*?)\s+\$/i)
          if (rateMatch && !liner) liner = rateMatch[1].trim()
          // From manual rate: "Custom $800 20'GP ..." or "Maersk Line $800 ..."
          const manualMatch = n.match(/Manual Rate:\s*(\w[\w\s-]*?)\s+\$/i)
          if (manualMatch && !liner) liner = manualMatch[1].trim()
          // Container from rate notes: "20'GP" or "40'HC"
          const cMatch = n.match(/(\d{2}['']?\s*(?:GP|HC|OT|FR|RF))/i)
          if (cMatch && !container) container = cMatch[1].replace(/\s/g, '')
          // Quantity from booking notes or inquiry text
          const qMatch = n.match(/(\d+)\s*x\s*\d{2}['']?\s*(?:GP|HC|OT|FR|RF)/i)
          if (qMatch && !qty) qty = qMatch[1]
        }

        // Fallback to inquiry request text
        if (!container) container = brInq.request?.match(/(\d{2}['']?\s*(?:GP|HC|OT|FR|RF))/i)?.[1]?.replace(/\s/g, '') ?? ''
        if (!qty) qty = brInq.request?.match(/(\d+)/)?.[1] ?? '1'

        setBkShippingLine(liner)
        setBkContainerType(container || "20'GP")
        setBkQuantity(parseInt(qty, 10) || 1)
        // Prefill container list from inquiry containers
        const ctFmt = (ct: string) => ct.replace(/\s+/g, '').replace(/(\d{2})(.*)/,(_, sz, tp) => `${sz}'${tp}`)
        if (brInq.containers && brInq.containers.length > 0) {
          setBkContainers(brInq.containers.map(c => ({ type: ctFmt(c.containerType), qty: c.quantity })))
        } else {
          setBkContainers([{ type: container || "20'GP", qty: parseInt(qty, 10) || 1 }])
        }
        setBkCommodity('')
        setBkCargoReadyDate('')
        setBkVessel('')
        setBkVoyage('')
        setBkPod(brInq.destination ?? '')
        setBkContractNo('')
        setBkAgreedRate('')
        setBkRateRemark('')
        setBkDeliveryTerm('')
        setBkHsCode('')
        setBkBlType('')
        setBkBookingType('')
        setBkReeferTemp('')
        setBkDeliveryAgent('')
        setBkSpecificRouting('')
        setActionModal(item)
        break
      }
      case 'review-booking-request': {
        // Pre-fill all form fields by parsing the booking's stored notes
        const { booking: rbBkg } = item.sourceData
        const noteParts = (rbBkg.notes ?? '').split(' | ')
        const getNote = (prefix: string) =>
          noteParts.find((p: string) => p.startsWith(prefix + ':'))?.slice(prefix.length + 1).trim() ?? ''
        setBkShippingLine(rbBkg.shipping_line ?? '')
        setBkContainerType(rbBkg.container_type ?? "20'GP")
        setBkQuantity(rbBkg.quantity ?? 1)
        // Parse containers from notes: "Containers: 2x20'GP, 1x40'HC"
        const ctnNote = getNote('Containers')
        if (ctnNote) {
          const parsed = ctnNote.split(',').map(s => s.trim()).map(s => {
            const m = s.match(/(\d+)\s*x\s*(.+)/)
            return m ? { type: m[2].trim(), qty: parseInt(m[1], 10) || 1 } : null
          }).filter(Boolean) as { type: string; qty: number }[]
          setBkContainers(parsed.length > 0 ? parsed : [{ type: rbBkg.container_type ?? "20'GP", qty: rbBkg.quantity ?? 1 }])
        } else {
          setBkContainers([{ type: rbBkg.container_type ?? "20'GP", qty: rbBkg.quantity ?? 1 }])
        }
        setBkCommodity(getNote('Commodity'))
        setBkCargoReadyDate(getNote('Cargo Ready'))
        setBkVessel(getNote('Vessel'))
        setBkVoyage(getNote('Voyage'))
        setBkPod(rbBkg.destination ?? '')
        setBkContractNo(getNote('Contract'))
        setBkAgreedRate(getNote('Rate'))
        setBkRateRemark(getNote('Rate Remark'))
        setBkDeliveryTerm(getNote('Term'))
        setBkHsCode(getNote('HS'))
        setBkBlType((getNote('BL') as 'OBL' | 'Seaway Bill' | '') || '')
        setBkBookingType(
          noteParts.includes('Spot Booking') ? 'Spot' :
          noteParts.includes('FAK Booking')  ? 'FAK' : ''
        )
        setBkReeferTemp(getNote('Reefer/PTI'))
        setBkDeliveryAgent(getNote('Agent'))
        setBkSpecificRouting(getNote('Routing'))
        setBkRaNumber('')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'attach-release-order': {
        setRoFields({
          reference_nbr: '', pickup_empty_date: '', validity_expiration_date: '',
          pickup_depot: '', pickup_depot_address: '', cargo_description: '',
          cargo_weight: '', cut_off_date: '', etd: '', eta: '',
          next_port_of_discharge: '', transport_mode: '', transport_carrier: '',
        })
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'confirm-liner-booking': {
        setLinerBooked('')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'confirm-booking': {
        setFormVessel('')
        setFormVoyage('')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'release-booking': {
        setFormNote('')
        const sendCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        setCustomerContactEmail(sendCust?.contact_email ?? '')
        setCustomerContactPhone(sendCust?.contact_phone ?? '')
        const initMethod: 'email' | 'whatsapp' = sendCust?.contact_email ? 'email' : 'whatsapp'
        setSendMethod(initMethod)
        setWaConfirmed(false)
        setReleaseDraft(generateReleaseOrderDraft(item.sourceData.booking as Booking, initMethod))
        setActionModal(item)
        break
      }
      case 'record-cutoff': {
        const bkg = item.sourceData.booking
        setCutoffBookingId(bkg.id)
        setCutoffLiner(bkg.shipping_line || '')
        setCutoffMode('paste')
        setCutoffContent('')
        setCutoffFileName('')
        setCutoffNotes('')
        setCutoffSiDate('')
        setCutoffBlDate('')
        setCutoffVgmDate('')
        setCutoffFilingDate('')
        setActionModal(item)
        break
      }
      case 'request-si': {
        setFormNote('')
        setVgmCertFileName('')
        setVgmCertContent('')
        const siCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        setCustomerContactEmail(siCust?.contact_email ?? '')
        setCustomerContactPhone(siCust?.contact_phone ?? '')
        setSendMethod(siCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
        setActionModal(item)
        break
      }
      case 'submit-si': {
        setSiContent('')
        setSiFileName('')
        setSiMode('paste')
        setInttraSiLoading(false)
        setVgmCertFileName('')
        setVgmCertContent('')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'send-draft-bl': {
        const blBkgInit = item.sourceData.booking as Booking
        // Phase 1 vessel form (CS only; Admin skips to phase 2)
        setDraftBlPhase(activeRole === 'CS' ? 1 : 2)
        setVesselScheduleType('FCL')
        setFormVessel(blBkgInit.vessel_name || '')
        setFormVoyage(blBkgInit.voyage_number || '')
        setVesselPol(blBkgInit.origin || '')
        setVesselEtaPol('')
        setVesselEtdPol('')
        setVesselRoutingType('DIRECT')
        setVesselFinalPod(blBkgInit.destination || '')
        setVesselEtaFpod('')
        setVesselRemarks('')
        setVesselAgent('')
        setSelectedReleaseOrderId('')
        setShowVesselSuggestions(false)
        // Phase 2 booking form — prefill from booking + customer
        const blCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        // Look up the related inquiry by customer name for commodity / weight / incoterm
        const blInq = inquiries.find(i => i.customer_name.toLowerCase() === item.customerName.toLowerCase())
        const blCommodity = blInq?.containers?.[0]?.commodityName || blInq?.commodity_type || ''
        const blGoodsDesc = blInq?.containers?.[0]?.commodityName || ''
        const blPackageType = blInq?.containers?.[0]?.containerType || blBkgInit.container_type || ''
        // Map delivery_type → Gensoft CY/CY notation
        const deliveryTypeToBkg = (dt?: string) => {
          if (dt === 'door-to-door') return 'CY/DR'
          if (dt === 'port-to-door') return 'CY/DR'
          if (dt === 'door-to-port') return 'DR/CY'
          return 'CY/CY'
        }
        // Map customer tier → Gensoft customer category
        const tierToCategory = (tier?: string) => {
          if (tier === 'Key Account') return 'KEY ACCOUNT'
          return 'DIRECT'
        }
        setBkgForm({
          customer_category: tierToCategory(blCust?.tier),
          business_type: 'SALES NOMINATION',
          revenue_type: 'FREIGHT FORWARDING',
          customer: blBkgInit.customer_name || '',
          billing_party: blBkgInit.customer_name || '',
          sales_person: activeEmployee.name || '',
          cs_executive: '',
          documentation_by: '',
          inquiry_ref: blInq?.id || blBkgInit.id || '',
          quotation_ref: blBkgInit.quote_id || '',
          fcl_cutoff_date: blBkgInit.si_cutoff_date || '',
          lcl_cutoff_date: '',
          shipper_name: blBkgInit.customer_name || '',
          shipper_address: blCust?.location || '',
          actual_shipper: blBkgInit.customer_name || '',
          contact_person: blCust?.contact_person || '',
          telephone: blCust?.contact_phone || '',
          email_address: blCust?.contact_email || '',
          consignee: '',
          consignee_address: '',
          notify: blBkgInit.customer_name || '',
          notify_address: blCust?.location || '',
          commodity: blCommodity,
          receiving_terminal: blBkgInit.origin || '',   // vessel POL will override on Phase 1 → 2
          final_destination: blBkgInit.destination || '',
          transit_days: '',                              // computed on Phase 1 → 2
          eta_final_destination: '',                     // filled on Phase 1 → 2
          place_of_delivery: blBkgInit.destination || '',
          eta_place_of_delivery: '',                     // filled on Phase 1 → 2
          carrier: blBkgInit.shipping_line || '',
          booking_carrier_ref: '',
          intra_booking_no: '',
          po_no: '',
          email_ref: '',
          cargo_type: blInq?.commodity_type?.toLowerCase().includes('refrigerated') ? 'REEFER'
            : blInq?.commodity_type?.toLowerCase().includes('hazardous') ? 'HAZMAT'
            : 'GENERAL',
          freight_term: 'PREPAID',
          mbl_term: 'PREPAID',
          no_of_packages: blInq?.container_qty ? String(blInq.container_qty) : String(blBkgInit.quantity || ''),
          package_type: blPackageType,
          gross_weight: blInq?.cargo_weight ? String(blInq.cargo_weight) : '',
          volume_cbm: '',
          weight_measurement_ratio: '',
          container_size: blBkgInit.container_type || '',
          container_count: String(blBkgInit.quantity || 1),
          delivery_type_bkg: deliveryTypeToBkg(blBkgInit.delivery_type),
          incoterm: blInq?.incoterm || '',
          pickup_type: '',
          inland_haulage_type: '',
          bl_issue_type: 'OWN',
          hbl_issue_term: '',
          mbl_issue_term: '',
          bl_format: '',
          bl_number: blBkgInit.master_bl_number || '',
          shipping_bill_no: '',
          bl_cutoff_date: blBkgInit.bl_cutoff_date || '',
          bl_cutoff_time: '',
          vgm_cutoff_date: blBkgInit.vgm_cutoff_date || '',
          vgm_cutoff_time: '',
          destination_charges: 'COLLECT',
          permit_no: '',
          sob_date: '',                                  // filled on Phase 1 → 2 (ETD POL)
          marks_and_numbers: blInq?.remark || '',
          description_of_goods: blGoodsDesc,
          bl_instructions: '',
          remarks_customer: '',
          remarks_internal: blBkgInit.notes || '',
        })
        setDraftBlContent('')
        setDraftBlFileName('')
        setDraftBlMode('paste')
        setFormNote('')
        setCustomerContactEmail(blCust?.contact_email ?? '')
        setCustomerContactPhone(blCust?.contact_phone ?? '')
        setSendMethod(blCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
        setActionModal(item)
        break
      }
      case 'send-pre-advice': {
        const paBkg = item.sourceData.booking as Booking
        const paCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        const paInq = inquiries.find(i => i.customer_name.toLowerCase() === item.customerName.toLowerCase())
        const paVessel = vesselSchedules
          .filter(vs => vs.vessel_name === paBkg.vessel_name && vs.voyage_number === paBkg.voyage_number)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
        const paConsignee = paBkg.master_bl_consignee || paBkg.house_bl_consignee || ''
        setPaForm({
          door_agent: '',
          door_agent_address: '',
          door_agent_contact: '',
          door_agent_email: '',
          bl_number: paBkg.master_bl_number || paBkg.house_bl_number || '',
          booking_ref: paBkg.id || '',
          shipper: paBkg.master_bl_shipper || paBkg.house_bl_shipper || paBkg.customer_name || '',
          shipper_address: paCust?.location || '',
          consignee: paConsignee,
          consignee_address: '',
          notify_party: paConsignee || paBkg.customer_name || '',
          notify_address: '',
          vessel: paBkg.vessel_name || '',
          voyage: paBkg.voyage_number || '',
          carrier: paBkg.shipping_line || '',
          pol: paVessel?.pol || paBkg.origin || '',
          pod: paVessel?.final_pod || paBkg.destination || '',
          final_destination: paVessel?.final_pod || paBkg.destination || '',
          eta_destination: paVessel?.eta_fpod || '',
          container_no: '',
          container_size: paBkg.container_type || '',
          container_count: String(paBkg.quantity || 1),
          seal_no: '',
          cargo_description: paInq?.containers?.[0]?.commodityName || paInq?.commodity_type || '',
          hs_code: '',
          no_of_packages: paInq?.container_qty ? String(paInq.container_qty) : String(paBkg.quantity || ''),
          package_type: paInq?.containers?.[0]?.containerType || paBkg.container_type || '',
          gross_weight: paInq?.cargo_weight ? String(paInq.cargo_weight) : '',
          net_weight: '',
          volume_cbm: '',
          freight_terms: 'PREPAID',
          delivery_address: paBkg.release_order_fields?.pickup_depot_address || '',
          delivery_contact: paCust?.contact_person || '',
          delivery_phone: paCust?.contact_phone || '',
          special_instructions: paInq?.remark || '',
          remarks: paBkg.notes || '',
        })
        setFormNote('')
        setCustomerContactEmail(paCust?.contact_email ?? '')
        setCustomerContactPhone(paCust?.contact_phone ?? '')
        setSendMethod(paCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
        setActionModal(item)
        break
      }
      case 'bl-approval': {
        setBlDecision('approved')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'record-master-bl': {
        setMasterBlNumber('')
        setMasterBlShipper('Synergy Shipping & Logistics')
        setMasterBlConsignee('')
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'create-house-bl': {
        const { booking: hbBkg } = item.sourceData
        setHouseBlNumber('')
        setHouseBlShipper(hbBkg.customer_name)
        setHouseBlConsignee('')
        setFormNote('')
        const hbCust = customers.find(c => c.name.toLowerCase() === hbBkg.customer_name.toLowerCase())
        setCustomerContactEmail(hbCust?.contact_email ?? '')
        setCustomerContactPhone(hbCust?.contact_phone ?? '')
        setSendMethod(hbCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
        setActionModal(item)
        break
      }
      case 'send-kyc': {
        // Reset KYC document form
        setKycBrNumber('')
        setKycParentOrg('')
        setKycDeadline('')
        setKycCliType('')
        setKycCurrency('USD')
        setKycWebsite('')
        setKycSvatNo('')
        setKycTaxExemptions('N/A')
        setKycSeaImports(false)
        setKycSeaExports(false)
        setKycTradeLanes(false)
        setKycForwarding(false)
        setKycCrossTrade(false)
        setKycAirImports(false)
        setKycAirExports(false)
        setKycGeneralCargo(false)
        setKycDangerousGoods(false)
        setKycPerishableGoods(false)
        setKycDocBrForm('false')
        setKycDocVatCert('false')
        setKycDocSvatCert('false')
        setKycDocTinCert('false')
        setKycDocForm20('false')
        setFormNote('')
        setKycSending(false)
        setActionModal(item)
        break
      }
      default:
        // Actions needing a form modal
        setFormVessel('')
        setFormVoyage('')
        setFormNote('')
        setFormDecision('approve')
        setKycSending(false)
        setActionModal(item)
        break
    }
  }

  const handleModalSubmit = async () => {
    // attach-release-order renders inline without requiring actionModal — allow it through
    const effectiveKind = actionModal?.actionKind ?? (selectedItem?.actionKind === 'attach-release-order' ? 'attach-release-order' : null)
    if (!effectiveKind) return
    // Compute next-step action for interactive toast navigation
    // Skip for actions that push work to a different department (unless Admin who sees all)
    // prepare-quotation is handled entirely within Sales (no email/WA sending) so it stays in-dept for toast navigation
    const crossDeptActions = new Set(['send-kyc', 'verify-kyc', 'check-rates', 'check-inttra-rates', 'booking-request'])
    const nextStepAction = (() => {
      if (activeRole !== 'Admin' && crossDeptActions.has(effectiveKind)) return undefined
      const cur = roleSteps.find(s => s.actionKinds.includes(effectiveKind))
      const nxt = cur ? roleSteps.find(s => s.stepNumber === cur.stepNumber + 1) : null
      return nxt ? { label: `Go to ${nxt.label}`, onClick: () => setActiveStep(nxt.key) } : undefined
    })()
    switch (effectiveKind) {
      case 'send-kyc': {
        const { customer, inquiry: kycInquiry, kycClient: pendingKycClient } = actionModal.sourceData
        // Resolve backend cli_id: prefer kycClient.cli_id, fall back to clientList name lookup
        let cli_id: number | undefined
        if (pendingKycClient?.cli_id) {
          cli_id = pendingKycClient.cli_id
        } else {
          const lookupName = pendingKycClient?.name ?? customer?.name
          const kycClientRecord = lookupName
            ? clientList.find(c => c.name.toLowerCase() === lookupName.toLowerCase())
            : undefined
          cli_id = kycInquiry?.cli_id ?? kycClientRecord?.cli_id
        }
        if (cli_id) {
          setKycSending(true)
          try {
            console.log('[Workspace] Creating KYC request for cli_id:', cli_id)
            await apiCreateKycRequest(cli_id, {
              br_number: kycBrNumber,
              parent_organization: kycParentOrg || undefined,
              emp_id_sales: activeRole === 'Sales' ? activeEmployee.id : undefined,
              emp_id_cs:    activeRole === 'CS'    ? activeEmployee.id : undefined,
              document_submission_deadline: kycDeadline,
              cli_type: kycCliType,
              currency: kycCurrency,
              website:  kycWebsite  || undefined,
              svat_no:  kycSvatNo   || undefined,
              tax_exemptions: kycTaxExemptions,
              sea_imports:      kycSeaImports,
              sea_exports:      kycSeaExports,
              trade_lanes:      kycTradeLanes,
              forwarding:       kycForwarding,
              cross_trade:      kycCrossTrade,
              air_imports:      kycAirImports,
              air_exports:      kycAirExports,
              general_cargo:    kycGeneralCargo,
              dangerous_goods:  kycDangerousGoods,
              perishable_goods: kycPerishableGoods,
              docs: {
                cli_id,
                br_form:          kycDocBrForm,
                vat_certificate:  kycDocVatCert,
                svat_certificate: kycDocSvatCert,
                tin_certificate:  kycDocTinCert,
                form20:           kycDocForm20,
              },
            })
            console.log('[Workspace] KYC request created, refreshing data')
            if (pendingKycClient) {
              // Remove from pending queue so the item disappears immediately
              onSetKycPendingClients(prev => prev.filter(c => c.cli_id !== pendingKycClient.cli_id))
            }
            // Re-fetch KYC data so frontend picks up the backend's stage advancement
            onRefreshKycRequests()
          } catch (err) { console.error('[Workspace] KYC request failed:', err) }
          setKycSending(false)
        } else {
          console.warn('[Workspace] KYC submit skipped — cli_id is undefined. sourceData:', actionModal.sourceData)
        }
        const customerName = pendingKycClient?.name ?? customer?.name ?? actionModal.customerName
        if (!pendingKycClient) {
          // Legacy flow: update local customer record and advance inquiry
          if (customer) onUpdateCustomerKyc(customer.name, 'pending_customer')
          if (kycInquiry) onAdvanceWorkflow(kycInquiry.id, 'kyc-verification' as WorkflowStage)
        }
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `KYC documents checked for ${customerName}. KYC request submitted. Pushed to Finance for final verification.`,
          ref_type: 'inquiry',
          ref_id: kycInquiry?.id ?? customer?.id ?? `CLI-${cli_id ?? ''}`,
          customer_name: customerName,
          pushed_to: 'Finance',
          notes: formNote || `KYC request created — BR: ${kycBrNumber}`,
        })
        onFlash(`KYC request created for ${customerName} — pushed to Finance`, nextStepAction)
        break
      }
      case 'verify-kyc': {
        const { kycRequest } = actionModal.sourceData
        const kycCliId = kycRequest?.cli_id
        const kycCustomerName = kycRequest?.name ?? actionModal.customerName
        const approved = formDecision === 'approve'
        if (approved) {
          // Mark KYC completed in backend
          if (kycCliId) {
            apiUpdateKycStage(kycCliId, 'kyc_completed')
              .catch(err => console.error('[Workspace] update KYC stage failed:', err))
          }
          // Remove from Finance's review queue locally
          if (kycRequest) {
            onSetKycRequests(prev => prev.filter(r => r.kyc_id !== kycRequest.kyc_id))
          }
          // Update local customer record if present
          const matchedCustomer = customers.find(c => c.name.toLowerCase() === kycCustomerName.toLowerCase())
          if (matchedCustomer) onUpdateCustomerKyc(matchedCustomer.name, 'approved')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `KYC verified for ${kycCustomerName}. Customer cleared for rate check.`,
            ref_type: 'inquiry',
            ref_id: `CLI-${kycCliId ?? ''}`,
            customer_name: kycCustomerName,
            pushed_to: 'CS',
            notes: formNote || 'KYC documents verified and approved.',
          })
          onFlash(`KYC verified for ${kycCustomerName}`, nextStepAction)
        } else {
          // Reject — reset to uninitiated so CS's pending queue picks it up again
          if (kycCliId) {
            apiUpdateKycStage(kycCliId, 'kyc_uninitiated')
              .catch(err => console.error('[Workspace] update KYC stage (reject) failed:', err))
          }
          // Remove from Finance's review queue locally
          if (kycRequest) {
            onSetKycRequests(prev => prev.filter(r => r.kyc_id !== kycRequest.kyc_id))
          }
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `KYC flagged for ${kycCustomerName}. Returned to CS for resubmission.`,
            ref_type: 'inquiry',
            ref_id: `CLI-${kycCliId ?? ''}`,
            customer_name: kycCustomerName,
            pushed_to: 'CS',
            notes: formNote || 'KYC documents need resubmission.',
          })
          onFlash(`KYC flagged — ${kycCustomerName} returned to CS`, nextStepAction)
        }
        break
      }
      case 'prepare-quotation': {
        const { inquiry } = actionModal.sourceData
        // Create quotation record in backend (status = in_prep).
        // Do NOT mark as sent here — that happens in the send-to-customer step.
        if (inquiry.inq_id) {
          const today = new Date().toISOString().slice(0, 10)
          const deadline = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
          apiCreateQuotation({
            inq_id: inquiry.inq_id,
            quote_date: today,
            sent_via: 'email',           // placeholder — updated to actual method in send step
            options: [],
            acceptance_deadline: deadline,
          })
            .then(created => {
              if (created.quote_id) {
                setLastQuotationId(created.quote_id)
              }
            })
            .catch(err => console.error('[Workspace] create quotation failed:', err))
        }
        // Advance to quotation-sent — both CS and Sales go through the same Send Quote step
        onAdvanceWorkflow(inquiry.id, 'quotation-sent')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Quotation prepared for ${inquiry.customer_name}. Ready to send.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'CS',
          notes: formNote
            ? `${formNote} | Quotation:\n${quotationContent}`
            : `Quotation:\n${quotationContent}`,
        })
        onFlash(`${inquiry.id} → Quotation prepared — ready to send`, nextStepAction)
        break
      }
      case 'send-to-customer': {
        const { inquiry } = actionModal.sourceData
        // Update sent_via on the quotation record, then mark as sent.
        // PATCH must happen before marking sent (backend blocks PATCH once status = 'sent').
        const sendQuoteId = lastQuotationId ?? inquiry.quotation_id
        if (sendQuoteId) {
          const actualSentVia = sendMethod === 'email' ? 'email' : 'whatsapp'
          apiPatchQuotation(sendQuoteId, { sent_via: actualSentVia })
            .then(() => apiMarkQuotationSent(sendQuoteId))
            .catch(err => console.error('[Workspace] update/send quotation failed:', err))
        }

        // Email delivery endpoint not yet implemented on backend — skip apiSendQuotation call.
        // The quotation record is already marked as sent via apiMarkQuotationSent above.

        onAdvanceWorkflow(inquiry.id, 'customer-response')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: sendMethod === 'email'
            ? `Quotation emailed to ${customerContactEmail}. Awaiting customer response.`
            : `Quotation sent via WhatsApp to ${customerContactPhone || 'customer'}. Awaiting customer response.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'CS',
          notes: sendMethod === 'email'
            ? `Sent via Email to ${customerContactEmail}${formNote ? ` | ${formNote}` : ''}`
            : `Sent via WhatsApp to ${customerContactPhone}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${inquiry.id} → Quotation sent to ${inquiry.customer_name} via ${sendMethod === 'email' ? 'Email' : 'WhatsApp'}`, nextStepAction)
        break
      }
      case 'customer-response': {
        const { inquiry } = actionModal.sourceData
        // Record customer response in backend quotation record
        // Backend auto-advances workflow to customer_response; we then advance further below
        const quoteId = lastQuotationId ?? inquiry.quotation_id
        if (quoteId && customerDecision === 'accepted' && selectedOptionRateId != null) {
          apiRecordQuotationResponse(quoteId, 'accepted', selectedOptionRateId)
            .catch(err => console.error('[Workspace] record quotation response failed:', err))
        }
        if (customerDecision === 'accepted') {
          onAdvanceWorkflow(inquiry.id, 'booking-request')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `Customer ${inquiry.customer_name} accepted the quotation. Proceeding to booking.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'CS',
            notes: `Customer accepted${formNote ? ` | ${formNote}` : ''}`,
          })
          onFlash(`${inquiry.id} → ${inquiry.customer_name} accepted — ready for booking request`, nextStepAction)
        } else {
          onAdvanceWorkflow(inquiry.id, 'completed')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `Customer ${inquiry.customer_name} rejected the quotation. Inquiry closed.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'CS',
            notes: `Customer rejected${formNote ? ` | Reason: ${formNote}` : ''}`,
          })
          onFlash(`${inquiry.id} → ${inquiry.customer_name} rejected quotation — inquiry closed`)
        }
        break
      }
      case 'booking-request': {
        const { inquiry } = actionModal.sourceData
        const ctnSummary = bkContainers.map(c => `${c.qty}x${c.type}`).join(', ')
        const bookingId = onCreateBooking({
          customer_name: inquiry.customer_name,
          quote_id: inquiry.id,
          shipping_line: bkShippingLine,
          container_type: bkContainers[0]?.type ?? bkContainerType,
          quantity: bkContainers.reduce((s, c) => s + c.qty, 0),
          origin: inquiry.origin,
          destination: bkPod || inquiry.destination,
          is_urgent: false,
          booked_by: activeEmployee.id,
          notes: [
            `Containers: ${ctnSummary}`,
            bkCommodity && `Commodity: ${bkCommodity}`,
            bkContractNo && `Contract: ${bkContractNo}`,
            bkAgreedRate && `Agreed Rate: ${bkAgreedRate}`,
            bkRateRemark && `Rate Remark: ${bkRateRemark}`,
            bkDeliveryTerm && `Delivery Term: ${bkDeliveryTerm}`,
            bkHsCode && `HS Code: ${bkHsCode}`,
            bkBlType && `BL Type: ${bkBlType}`,
            bkBookingType && `Booking Type: ${bkBookingType}`,
            bkSpecificRouting && `Routing: ${bkSpecificRouting}`,
            bkReeferTemp && `Reefer/PTI: ${bkReeferTemp}`,
            bkDeliveryAgent && `Delivery Agent: ${bkDeliveryAgent}`,
            bkCargoReadyDate && `Cargo Ready: ${bkCargoReadyDate}`,
            bkVessel && `Vessel: ${bkVessel}`,
            bkVoyage && `Voyage: ${bkVoyage}`,
            bkRaNumber && `RA No: ${bkRaNumber}`,
          ].filter(Boolean).join(' | ') || `Booking for ${inquiry.customer_name}: ${inquiry.request}`,
          delivery_type: inquiry.delivery_type,
        })
        onAdvanceWorkflow(inquiry.id, 'completed')
        const noteParts = [
          ctnSummary,
          bkShippingLine || 'Any carrier',
          `${inquiry.origin} → ${bkPod || inquiry.destination}`,
          bkCommodity && `Commodity: ${bkCommodity}`,
          bkContractNo && `Contract: ${bkContractNo}`,
          bkAgreedRate && `Rate: $${bkAgreedRate}`,
          bkRateRemark && `Rate Remark: ${bkRateRemark}`,
          bkDeliveryTerm && `Term: ${bkDeliveryTerm}`,
          bkHsCode && `HS: ${bkHsCode}`,
          bkBlType && `BL: ${bkBlType}`,
          bkBookingType && `${bkBookingType} Booking`,
          bkReeferTemp && `Reefer/PTI: ${bkReeferTemp}`,
          bkDeliveryAgent && `Agent: ${bkDeliveryAgent}`,
          bkCargoReadyDate && `Cargo Ready: ${bkCargoReadyDate}`,
          bkVessel && `Vessel: ${bkVessel}`,
          bkVoyage && `Voyage: ${bkVoyage}`,
          bkRaNumber && `RA No: ${bkRaNumber}`,
        ].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Booking request ${bookingId} created and sent to Procurement.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'Procurement',
          notes: noteParts,
        })
        onFlash(`${inquiry.id} → Booking request sent to Procurement`, nextStepAction)
        break
      }
      case 'review-booking-request': {
        const { booking: rbBkg } = actionModal.sourceData
        // Assign the RA number — booking moves to proc-booking step for liner confirmation
        onMarkRaAssigned(rbBkg.id, bkRaNumber, [bkVessel, bkVoyage].filter(Boolean).join(' / ') || '', bkShippingLine)
        const rbNoteParts = [
          bkContainers.map(c => `${c.qty}x${c.type}`).join(', '),
          bkShippingLine && `Carrier: ${bkShippingLine}`,
          `${rbBkg.origin} → ${bkPod || rbBkg.destination}`,
          bkCommodity && `Commodity: ${bkCommodity}`,
          bkContractNo && `Contract: ${bkContractNo}`,
          bkAgreedRate && `Rate: $${bkAgreedRate}`,
          bkRateRemark && `Rate Remark: ${bkRateRemark}`,
          bkDeliveryTerm && `Term: ${bkDeliveryTerm}`,
          bkHsCode && `HS: ${bkHsCode}`,
          bkBlType && `BL: ${bkBlType}`,
          bkBookingType && `${bkBookingType} Booking`,
          bkReeferTemp && `Reefer/PTI: ${bkReeferTemp}`,
          bkDeliveryAgent && `Agent: ${bkDeliveryAgent}`,
          bkSpecificRouting && `Routing: ${bkSpecificRouting}`,
          bkCargoReadyDate && `Cargo Ready: ${bkCargoReadyDate}`,
          bkVessel && `Vessel: ${bkVessel}`,
          bkVoyage && `Voyage: ${bkVoyage}`,
          bkRaNumber && `RA#: ${bkRaNumber}`,
        ].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `RA# assigned for ${rbBkg.customer_name}.${bkRaNumber ? ` RA#: ${bkRaNumber}` : ''} Moved to Procurement Booking step.`,
          ref_type: 'booking',
          ref_id: rbBkg.id,
          customer_name: rbBkg.customer_name,
          pushed_to: 'Procurement',
          notes: rbNoteParts,
        })
        onFlash(`RA# assigned — ${rbBkg.customer_name} moved to Booking step`, nextStepAction)
        break
      }
      case 'attach-release-order': {
        const roBkg = (actionModal?.sourceData?.booking ?? selectedItem?.sourceData?.booking) as Booking
        if (!roBkg) break
        onAttachReleaseOrder(roBkg.id, roFields)
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Release order prepared for ${roBkg.customer_name} and sent to CS. Ref: ${roFields.reference_nbr || 'N/A'}.`,
          ref_type: 'booking',
          ref_id: roBkg.id,
          customer_name: roBkg.customer_name,
          pushed_to: 'CS',
          notes: `Release order sent to CS.${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`Release order sent to CS — ${roBkg.customer_name}`, nextStepAction)
        break
      }
      case 'confirm-liner-booking': {
        const { booking: cbBkg } = actionModal.sourceData
        if (linerBooked === 'yes') {
          onConfirmBooking(cbBkg.id, cbBkg.vessel_name, cbBkg.voyage_number)
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `Liner booking confirmed for ${cbBkg.customer_name}. RA#: ${cbBkg.voyage_number || 'N/A'}.`,
            ref_type: 'booking',
            ref_id: cbBkg.id,
            customer_name: cbBkg.customer_name,
            pushed_to: 'CS',
            notes: `Liner confirmed. RA#: ${cbBkg.voyage_number || 'N/A'}${formNote ? ` | ${formNote}` : ''}`,
          })
          onFlash(`Liner confirmed — ${cbBkg.customer_name}`, nextStepAction)
        } else if (linerBooked === 'no') {
          onRevertBookingRequest(cbBkg.id)
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `Liner booking failed for ${cbBkg.customer_name}. Booking reverted to Pending Liner.`,
            ref_type: 'booking',
            ref_id: cbBkg.id,
            customer_name: cbBkg.customer_name,
            pushed_to: 'Procurement',
            notes: `Booking failed. Reason: ${formNote || 'Not specified'}`,
          })
          onFlash(`Booking reverted — ${cbBkg.customer_name} (reason logged)`, nextStepAction)
        }
        break
      }
      case 'confirm-booking': {
        const { booking } = actionModal.sourceData
        onConfirmBooking(booking.id, formVessel, formVoyage)
        const confirmNotes = [
          `Vessel: ${formVessel || 'TBD'}, Voyage: ${formVoyage || 'TBD'}`,
          formNote ?? '',
        ].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Liner confirmed. Vessel: ${formVessel || 'TBD'}, Voyage: ${formVoyage || 'TBD'}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: confirmNotes,
        })
        break
      }
      case 'release-booking': {
        const { booking } = actionModal.sourceData
        onReleaseBooking(booking.id, formNote)
        const sendVia = sendMethod === 'email'
          ? `via Email to ${customerContactEmail}`
          : `via WhatsApp to ${customerContactPhone || 'customer'}`
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Release order & booking confirmation sent to ${booking.customer_name} ${sendVia}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Sent ${sendVia}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → Release order sent to ${booking.customer_name} ${sendVia}`, nextStepAction)
        break
      }
      case 'record-cutoff': {
        const { booking } = actionModal.sourceData
        if (cutoffSiDate)     onSetBookingSiCutoff(booking.id, cutoffSiDate)
        if (cutoffBlDate)     onSetBookingBlCutoff(booking.id, cutoffBlDate)
        if (cutoffVgmDate)    onSetBookingVgmCutoff(booking.id, cutoffVgmDate)
        if (cutoffFilingDate) onSetBookingFilingCutoff(booking.id, cutoffFilingDate)
        const dateNotes = [
          cutoffSiDate     && `SI/BL: ${cutoffSiDate}`,
          cutoffVgmDate    && `VGM: ${cutoffVgmDate}`,
          cutoffFilingDate && `Filing: ${cutoffFilingDate}`,
        ].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Recorded vessel cutoff schedule for ${booking.customer_name}. Liner: ${cutoffLiner || booking.shipping_line || 'N/A'}.${dateNotes ? ` ${dateNotes}.` : ''}`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Cutoff dates recorded.${cutoffNotes ? ` | ${cutoffNotes}` : ''}${dateNotes ? ` | ${dateNotes}` : ''}`,
        })
        onFlash(`${booking.id} → Cut off dates saved for ${booking.customer_name}`, nextStepAction)
        break
      }
      case 'request-si': {
        const { booking } = actionModal.sourceData
        onMarkSiRequested(booking.id)
        const sendVia = sendMethod === 'email'
          ? `via Email to ${customerContactEmail}`
          : `via WhatsApp to ${customerContactPhone || 'customer'}`
        const siblCutoff = booking.si_cutoff_date || booking.bl_cutoff_date
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Cutoff reminder sent to ${booking.customer_name} ${sendVia}. SI/BL cutoff: ${siblCutoff || 'N/A'}.${vgmCertFileName ? ` VGM certificate attached.` : ''}`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Cutoff reminder sent ${sendVia}. SI/BL: ${siblCutoff || 'N/A'}${vgmCertFileName ? ` | VGM cert: ${vgmCertFileName}` : ''}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → Cutoff reminder sent to ${booking.customer_name} ${sendVia}`, nextStepAction)
        break
      }
      case 'submit-si': {
        const { booking } = actionModal.sourceData
        onMarkSiSubmitted(booking.id)
        const method = 'manually'
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `SI submitted to ${booking.shipping_line || 'liner'} for ${booking.customer_name} ${method}.${vgmCertFileName ? ` VGM document attached: ${vgmCertFileName}` : ''}`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `SI submitted ${method}${siContent ? ` | SI document attached` : ''}${vgmCertFileName ? ` | VGM: ${vgmCertFileName}` : ''}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → SI submitted to ${booking.shipping_line || 'liner'} ${method}${vgmCertFileName ? ' (VGM attached)' : ''}`, nextStepAction)
        break
      }
      case 'send-draft-bl': {
        const { booking } = actionModal.sourceData
        onMarkDraftBlSent(booking.id)
        const sendVia = sendMethod === 'email'
          ? `via Email to ${customerContactEmail}`
          : `via WhatsApp to ${customerContactPhone || 'customer'}`
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Draft BL sent to ${booking.customer_name} ${sendVia}. Awaiting customer approval.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Draft BL sent ${sendVia}${draftBlContent ? ` | Document attached` : ''}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → Draft BL sent to ${booking.customer_name} ${sendVia}`, nextStepAction)
        break
      }
      case 'send-pre-advice': {
        const { booking } = actionModal.sourceData
        onMarkPreAdviceSent(booking.id)
        const sendVia = sendMethod === 'email'
          ? `via Email to ${paField('door_agent_email')}`
          : `via WhatsApp`
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Pre-Advice sent to door agent ${paField('door_agent')} for ${booking.customer_name} ${sendVia}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Pre-Advice → ${paField('door_agent')} | ${booking.origin} → ${booking.destination} | B/L: ${paField('bl_number') || 'N/A'}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → Pre-Advice sent to ${paField('door_agent')} ${sendVia}`, nextStepAction)
        break
      }
      case 'bl-approval': {
        const { booking } = actionModal.sourceData
        const approved = blDecision === 'approved'
        const baBlType = booking.delivery_type === 'door-to-door' ? 'House BL' : 'Draft BL'
        onSetBlStatus(booking.id, blDecision)
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: approved
            ? `${booking.customer_name} approved ${baBlType} for ${booking.id}.`
            : `${booking.customer_name} requested changes to ${baBlType} for ${booking.id}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: approved
            ? `${baBlType} approved by customer${formNote ? ` | ${formNote}` : ''}`
            : `Changes requested: ${formNote || 'No details provided'}`,
        })
        onFlash(approved
          ? `${booking.id} → ${baBlType} approved by ${booking.customer_name}`
          : `${booking.id} → ${booking.customer_name} requested changes to ${baBlType}`,
          approved ? nextStepAction : undefined)
        break
      }
      case 'record-master-bl': {
        const { booking } = actionModal.sourceData
        onRecordMasterBl(booking.id, { master_bl_number: masterBlNumber, shipper: masterBlShipper, consignee: masterBlConsignee })
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Recorded Master BL ${masterBlNumber} for ${booking.id}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `Master BL: ${masterBlNumber} | Shipper: ${masterBlShipper} | Consignee: ${masterBlConsignee}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → Master BL ${masterBlNumber} recorded`, nextStepAction)
        break
      }
      case 'create-house-bl': {
        const { booking } = actionModal.sourceData
        onCreateHouseBl(booking.id, { house_bl_number: houseBlNumber, shipper: houseBlShipper, consignee: houseBlConsignee })
        const hbSendVia = sendMethod === 'email'
          ? `via Email to ${customerContactEmail}`
          : `via WhatsApp to ${customerContactPhone || 'customer'}`
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Created House BL ${houseBlNumber} and sent to ${booking.customer_name} ${hbSendVia}. Awaiting customer approval.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `House BL: ${houseBlNumber} | Shipper: ${houseBlShipper} | Consignee: ${houseBlConsignee} | Master BL: ${booking.master_bl_number || 'N/A'} | Sent ${hbSendVia}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → House BL ${houseBlNumber} sent to ${booking.customer_name} ${hbSendVia}`, nextStepAction)
        break
      }
      case 'approve-quote': {
        const { quote } = actionModal.sourceData
        const approved = formDecision === 'approve'
        onSetQuoteStatus(quote.id, approved ? 'Approved' : 'Lost')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: approved ? `Approved quotation ${quote.id}` : `Rejected quotation ${quote.id}`,
          ref_type: 'quote',
          ref_id: quote.id,
          customer_name: quote.customer_name,
          pushed_to: approved ? 'CS' : 'Sales',
          notes: formNote || (approved ? 'Quotation approved by Finance.' : 'Rejected.'),
        })
        break
      }
    }
    setActionModal(null)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const roleColor = ROLE_COLORS[activeRole]

  // Selected item for split-panel detail view
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return filteredItems[0] ?? null
    return filteredItems.find(i => `${i.type}-${i.refId}-${i.actionKind}-${(i.sourceData as any)?.containerIdx ?? 0}` === selectedItemId) ?? filteredItems[0] ?? null
  }, [selectedItemId, filteredItems])

  const getItemKey = (item: WorkspaceItem) => `${item.type}-${item.refId}-${item.actionKind}-${(item.sourceData as any)?.containerIdx ?? 0}`

  return (
    <div className="ws-split-layout db-page-anim">
      <div className="ws-split-body">
      {/* ---- Left Panel: Item List ---- */}
      <div className="ws-left-panel">
        <div style={{ padding: '20px 20px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text)' }}>Your workspace</h1>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''} in this step
            </p>
          </div>
          {(effectiveStep === 'cs-inquiry' || effectiveStep === 'adm-inquiry' || effectiveStep === 'sales-inquiry') && (
            <button
              onClick={() => onGoTo('new-inquiry')}
              title="New Inquiry"
              style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: '#0f8fa8', color: '#fff', border: 'none', fontSize: 17, fontWeight: 600, cursor: 'pointer', lineHeight: 1 }}
            >+</button>
          )}
          {effectiveStep === 'proc-rates' && (
            <button
              onClick={() => onGoTo('record-rate')}
              title="Record Rate"
              style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 8, background: '#d97706', color: '#fff', border: 'none', fontSize: 17, fontWeight: 600, cursor: 'pointer', lineHeight: 1 }}
            >+</button>
          )}
        </div>
        <div className="ws-left-scroll">
          {filteredItems.length === 0 ? (
            <div style={{ padding: '28px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Nothing in this step right now.
            </div>
          ) : (
            filteredItems.map(item => {
              const key = getItemKey(item)
              const isSelected = selectedItem ? getItemKey(selectedItem) === key : false
              return (
                <div
                  key={key}
                  onClick={() => {
                    setSelectedItemId(key)
                    if (item.actionKind === 'booking-request' || item.actionKind === 'review-booking-request' || item.actionKind === 'confirm-liner-booking' || item.actionKind === 'attach-release-order' || item.actionKind === 'release-booking' || item.actionKind === 'send-draft-bl' || item.actionKind === 'record-cutoff' || item.actionKind === 'request-si' || item.actionKind === 'submit-si' || item.actionKind === 'send-pre-advice') {
                      handleAction(item)
                    }
                  }}
                  className={`ws-list-item ${isSelected ? 'active' : ''}`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{item.customerName}</span>
                    {item.urgentFlag && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626', marginLeft: 'auto', flexShrink: 0 }} />}
                    {item.kycIncomplete && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', marginLeft: item.urgentFlag ? 0 : 'auto', flexShrink: 0 }} title="KYC pending" />}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{item.subtitle}</div>
                  <span className={TYPE_BADGE_CLASS[item.type]} style={{ fontSize: 10 }}>{item.actionLabel}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ---- Right Panel: Detail + Action ---- */}
      <div className="ws-right-panel">
        {selectedItem ? (
          <div style={{ maxWidth: 620 }}>
            {/* Ref ID + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#94a3b8' }}>{selectedItem.refId}</span>
              {selectedItem.urgentFlag && (
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>Urgent</span>
              )}
              {selectedItem.kycIncomplete && (
                <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em', background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>KYC Pending</span>
              )}
              <span className={TYPE_BADGE_CLASS[selectedItem.type]}>{selectedItem.type}</span>
            </div>

            {/* Customer / Title */}
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4, color: 'var(--text)' }}>{selectedItem.customerName}</h1>
            <p style={{ fontSize: 15, color: '#475569', marginBottom: 24 }}>{selectedItem.title}</p>

            {/* Where it came from - context card */}
            {selectedItem.previousContext && (
              <div style={{ padding: '14px 16px', background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid #0f8fa8', borderRadius: 10, marginBottom: 26 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 6 }}>Where it came from</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <User size={11} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {empName(selectedItem.previousContext.actor_id)} ({ROLE_LABELS[selectedItem.previousContext.actor_role]})
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{selectedItem.previousContext.timestamp}</span>
                </div>
                <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.55 }}>{selectedItem.previousContext.action}</div>
                {selectedItem.previousContext.notes && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>{selectedItem.previousContext.notes}</div>
                )}
              </div>
            )}

            {/* Complete this step */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 14 }}>Complete this step</div>

            {selectedItem.actionKind === 'record-cutoff' && actionModal ? (() => {
              const coBkg = actionModal.sourceData.booking as Booking
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{coBkg.customer_name}</strong> — {coBkg.origin} → {coBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {coBkg.quantity}x {coBkg.container_type} · {coBkg.shipping_line || 'No liner'}
                    </div>
                  </div>

                  <div>
                    <label className="lt-label">Shipping Line / Liner</label>
                    <input list="ws-cut-liners-inline" className="lt-input" style={{ width: '100%' }} value={cutoffLiner}
                      onChange={e => setCutoffLiner(e.target.value)}
                      placeholder="e.g. Maersk, MSC, Hapag-Lloyd" />
                    <datalist id="ws-cut-liners-inline">
                      {linerList.map(l => <option key={l.lin_id} value={l.name} />)}
                    </datalist>
                  </div>

                  {/* Paste / Upload toggle */}
                  <div>
                    <label className="lt-label">Cutoff Schedule</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 8 }}>
                      <button className={`db-btn ${cutoffMode === 'paste' ? 'primary' : ''}`}
                        style={cutoffMode !== 'paste' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setCutoffMode('paste')}><ClipboardPaste size={13} style={{ marginRight: 4 }} /> Paste</button>
                      <button className={`db-btn ${cutoffMode === 'upload' ? 'primary' : ''}`}
                        style={cutoffMode !== 'upload' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setCutoffMode('upload')}><Paperclip size={13} style={{ marginRight: 4 }} /> Upload</button>
                    </div>
                    {cutoffMode === 'paste' && (
                      <textarea className="lt-input" style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' as const }}
                        value={cutoffContent} onChange={e => setCutoffContent(e.target.value)}
                        placeholder="Paste vessel cutoff schedule here..." />
                    )}
                    {cutoffMode === 'upload' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label className="db-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <Paperclip size={13} />
                          {cutoffFileName ? 'Replace file' : 'Choose file'}
                          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.txt" style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setCutoffFileName(file.name)
                              const reader = new FileReader()
                              reader.onload = () => setCutoffContent(reader.result as string)
                              reader.readAsDataURL(file)
                              e.target.value = ''
                            }} />
                        </label>
                        {cutoffFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{cutoffFileName}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              onClick={() => { setCutoffFileName(''); setCutoffContent('') }}><X size={12} /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: 'var(--text-muted)', marginBottom: 10 }}>Cutoff Dates from Liner</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="lt-label">SI/BL Cutoff Date</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date"
                          value={cutoffSiDate} onChange={e => { setCutoffSiDate(e.target.value); setCutoffBlDate(e.target.value) }} />
                      </div>
                      <div>
                        <label className="lt-label">VGM Cutoff Date</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date"
                          value={cutoffVgmDate} onChange={e => setCutoffVgmDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="lt-label">Filing Cutoff Date</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date"
                          value={cutoffFilingDate} onChange={e => setCutoffFilingDate(e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    SI/BL cutoff dates trigger downstream follow-up tasks and reminders.
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={cutoffNotes}
                      onChange={e => setCutoffNotes(e.target.value)}
                      placeholder="Any notes about vessel cutoff schedule..." />
                  </div>

                  {/* Submit button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="db-btn primary"
                      style={{ background: '#0891b2', borderColor: '#0891b2' }}
                      onClick={handleModalSubmit}>
                      <Ship size={12} style={{ marginRight: 6 }} /> Record Cutoff & Push
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'request-si' && actionModal ? (() => {
              const siBkg = actionModal.sourceData.booking as Booking
              const ctx = actionModal.previousContext
              const siblCutoff = siBkg.si_cutoff_date || siBkg.bl_cutoff_date
              const dLeft = siblCutoff ? daysUntil(siblCutoff) : 999
              const isOvd = dLeft < 0
              const urgencyColor = isOvd ? '#dc2626' : dLeft === 0 ? '#d97706' : '#0891b2'
              const urgencyText = isOvd
                ? `OVERDUE by ${Math.abs(dLeft)} day(s)`
                : dLeft === 0 ? 'Due TODAY' : `${dLeft} day(s) remaining`
              const canSend = sendMethod === 'email'
                ? customerContactEmail.trim() !== '' && customerContactEmail.includes('@')
                : waConfirmed
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Context card */}
                  {ctx && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                    </div>
                  )}

                  {/* Cutoff dates card */}
                  <div style={{ padding: '14px 16px', background: urgencyColor + '0a', border: `1px solid ${urgencyColor}30`, borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <AlertTriangle size={14} style={{ color: urgencyColor }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: urgencyColor }}>Cutoff Dates</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: urgencyColor, marginLeft: 'auto', padding: '2px 8px', background: urgencyColor + '15', borderRadius: 10 }}>
                        {urgencyText}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 8 }}>
                      {siblCutoff && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 100, color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>SI/BL Cutoff</span>
                          <span style={{ fontWeight: 700 }}>{siblCutoff}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({dLeft < 0 ? `${Math.abs(dLeft)}d overdue` : `${dLeft}d left`})</span>
                        </div>
                      )}
                      {siBkg.vgm_cutoff_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 100, color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>VGM Cutoff</span>
                          <span style={{ fontWeight: 700 }}>{siBkg.vgm_cutoff_date}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({daysUntil(siBkg.vgm_cutoff_date) < 0 ? `${Math.abs(daysUntil(siBkg.vgm_cutoff_date))}d overdue` : `${daysUntil(siBkg.vgm_cutoff_date)}d left`})</span>
                        </div>
                      )}
                      {siBkg.filing_cutoff_date && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 100, color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>Filing Cutoff</span>
                          <span style={{ fontWeight: 700 }}>{siBkg.filing_cutoff_date}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({daysUntil(siBkg.filing_cutoff_date) < 0 ? `${Math.abs(daysUntil(siBkg.filing_cutoff_date))}d overdue` : `${daysUntil(siBkg.filing_cutoff_date)}d left`})</span>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Customer:</span> <strong>{siBkg.customer_name}</strong></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Route:</span> {siBkg.origin} → {siBkg.destination}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Vessel:</span> {siBkg.vessel_name || 'TBD'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Voyage:</span> {siBkg.voyage_number || 'TBD'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Container:</span> {siBkg.quantity}x {siBkg.container_type}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Liner:</span> {siBkg.shipping_line || 'N/A'}</div>
                    </div>
                  </div>

                  {/* Send method toggle */}
                  <div>
                    <label className="lt-label">Contact Customer via</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className={`db-btn ${sendMethod === 'email' ? 'primary' : ''}`}
                        style={sendMethod !== 'email' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setSendMethod('email')}><Mail size={13} style={{ marginRight: 4 }} /> Email</button>
                      <button className={`db-btn ${sendMethod === 'whatsapp' ? 'primary' : ''}`}
                        style={sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setSendMethod('whatsapp')}><MessageCircle size={13} style={{ marginRight: 4 }} /> WhatsApp</button>
                    </div>
                  </div>

                  {sendMethod === 'email' && (
                    <div>
                      <label className="lt-label">Customer Email <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="email"
                        value={customerContactEmail} onChange={e => setCustomerContactEmail(e.target.value)}
                        placeholder="customer@example.com" />
                    </div>
                  )}

                  {sendMethod === 'whatsapp' && (
                    <>
                      <div>
                        <label className="lt-label">Customer WhatsApp Number</label>
                        <input className="lt-input" style={{ width: '100%' }}
                          value={customerContactPhone} onChange={e => setCustomerContactPhone(e.target.value)}
                          placeholder="+94 7X XXX XXXX" />
                      </div>
                      <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                          <input type="checkbox" checked={waConfirmed} onChange={e => setWaConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                          <span>I confirm that I have sent the cutoff reminder to the customer via WhatsApp.
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>No WhatsApp integration — manual confirmation.</span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  {/* VGM Certificate upload */}
                  {siBkg.vgm_cutoff_date && (
                    <div>
                      <label className="lt-label">VGM Certificate (optional)</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <label className="db-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <Paperclip size={13} />
                          {vgmCertFileName ? 'Replace file' : 'Attach VGM certificate'}
                          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.doc,.docx" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              setVgmCertFileName(f.name)
                              const r = new FileReader()
                              r.onload = () => setVgmCertContent(r.result as string)
                              r.readAsDataURL(f)
                              e.target.value = ''
                            }} />
                        </label>
                        {vgmCertFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{vgmCertFileName}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              onClick={() => { setVgmCertFileName(''); setVgmCertContent('') }}><X size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any instructions or reminders for the customer..." />
                  </div>

                  {/* Submit button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="db-btn primary"
                      disabled={!canSend}
                      style={
                        !canSend ? { opacity: 0.4, cursor: 'not-allowed' }
                          : sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : {}
                      }
                      onClick={handleModalSubmit}>
                      {sendMethod === 'email' ? <><Mail size={12} style={{ marginRight: 6 }} /> Send Reminder via Email</> : <><MessageCircle size={12} style={{ marginRight: 6 }} /> Confirm Reminder Sent</>}
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'send-draft-bl' && actionModal ? (() => {
              const blBkg = actionModal.sourceData.booking as Booking
              // bookings that have release order fields (for pre-fill selector)
              const roBookings = bookings.filter(b => b.release_order_fields)
              const applyReleaseOrder = (roId: string) => {
                setSelectedReleaseOrderId(roId)
                const ro = bookings.find(b => b.id === roId)
                if (!ro) return
                setFormVessel(ro.vessel_name || '')
                setFormVoyage(ro.voyage_number || '')
                setVesselPol(ro.origin || '')
                setVesselFinalPod(ro.destination || '')
                if (ro.release_order_fields) {
                  setVesselEtdPol(ro.release_order_fields.etd || '')
                  setVesselEtaFpod(ro.release_order_fields.eta || '')
                }
              }
              // Recent vessel schedules matching typed name (within 2 weeks)
              const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
              const vesselMatches = formVessel.trim().length >= 2
                ? vesselSchedules
                    .filter(vs => vs.created_at >= twoWeeksAgo && vs.vessel_name.toLowerCase().includes(formVessel.trim().toLowerCase()))
                    // deduplicate by vessel+voyage (keep latest)
                    .reduce<typeof vesselSchedules>((acc, vs) => {
                      const key = `${vs.vessel_name.toLowerCase()}|${vs.voyage_number.toLowerCase()}`
                      const existing = acc.findIndex(v => `${v.vessel_name.toLowerCase()}|${v.voyage_number.toLowerCase()}` === key)
                      if (existing >= 0) {
                        if (vs.created_at > acc[existing].created_at) acc[existing] = vs
                      } else acc.push(vs)
                      return acc
                    }, [])
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .slice(0, 5)
                : []
              const applyVesselSchedule = (vs: typeof vesselSchedules[number]) => {
                setFormVessel(vs.vessel_name)
                setFormVoyage(vs.voyage_number)
                setVesselScheduleType(vs.schedule_type)
                setVesselPol(vs.pol)
                setVesselEtaPol(vs.eta_pol)
                setVesselEtdPol(vs.etd_pol)
                setVesselRoutingType(vs.routing_type)
                setVesselFinalPod(vs.final_pod)
                setVesselEtaFpod(vs.eta_fpod)
                setVesselRemarks(vs.remarks)
                setVesselAgent(vs.agent)
                setShowVesselSuggestions(false)
              }
              const tabBtn = (label: string, val: typeof vesselScheduleType) => (
                <button key={val}
                  onClick={() => setVesselScheduleType(val)}
                  style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 700,
                    border: '1px solid var(--border)', cursor: 'pointer',
                    borderRadius: 0,
                    background: vesselScheduleType === val ? '#0891b2' : 'var(--bg-card)',
                    color: vesselScheduleType === val ? '#fff' : 'var(--text-secondary)',
                  }}>
                  {label}
                </button>
              )
              if (draftBlPhase === 1) return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Step header */}
                  <div style={{ padding: '8px 14px', background: '#0891b2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>VESSEL SCHEDULE</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Step 1 of 3</span>
                  </div>

                  {/* Release order pre-fill selector */}
                  {roBookings.length > 0 && (
                    <div>
                      <label className="lt-label">Pre-fill from Release Order (optional)</label>
                      <select className="lt-input" style={{ width: '100%' }}
                        value={selectedReleaseOrderId}
                        onChange={e => applyReleaseOrder(e.target.value)}>
                        <option value="">— Select a release order —</option>
                        {roBookings.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.customer_name} · {b.vessel_name} / {b.voyage_number} ({b.origin} → {b.destination})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Schedule type tabs */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Vessel Schedule Type</div>
                    <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {tabBtn('FCL', 'FCL')}
                      {tabBtn('CONSOL', 'CONSOL')}
                      {tabBtn('BOTH', 'BOTH')}
                    </div>
                  </div>

                  {/* Two-column grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ position: 'relative' }}>
                      <label className="lt-label">Vessel</label>
                      <input className="lt-input" style={{ width: '100%' }} value={formVessel}
                        onChange={e => { setFormVessel(e.target.value); setShowVesselSuggestions(true) }}
                        onFocus={() => setShowVesselSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowVesselSuggestions(false), 200)}
                        placeholder="e.g. MSC America" autoComplete="off" />
                      {showVesselSuggestions && vesselMatches.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.12)', maxHeight: 220, overflowY: 'auto', marginTop: 2,
                        }}>
                          <div style={{ padding: '6px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>
                            Recent vessels (last 2 weeks)
                          </div>
                          {vesselMatches.map(vs => (
                            <button key={vs.id}
                              onMouseDown={e => { e.preventDefault(); applyVesselSchedule(vs) }}
                              style={{
                                display: 'block', width: '100%', padding: '8px 10px', border: 'none',
                                background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12,
                                borderBottom: '1px solid var(--border)',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(8,145,178,0.06)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--text)' }}>{vs.vessel_name} / {vs.voyage_number}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {vs.pol}{vs.final_pod ? ` → ${vs.final_pod}` : ''}{vs.etd_pol ? ` · ETD ${vs.etd_pol}` : ''} · {vs.schedule_type}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="lt-label">Voyage</label>
                      <input className="lt-input" style={{ width: '100%' }} value={formVoyage}
                        onChange={e => setFormVoyage(e.target.value)} placeholder="e.g. QB614W" />
                    </div>
                    <div>
                      <label className="lt-label">Port of Loading</label>
                      <input className="lt-input" style={{ width: '100%' }} value={vesselPol}
                        onChange={e => setVesselPol(e.target.value)} placeholder="e.g. Colombo" />
                    </div>
                    <div>
                      <label className="lt-label">ETD POL</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="date" className="lt-input" style={{ flex: 1 }} value={vesselEtdPol}
                          onChange={e => setVesselEtdPol(e.target.value)} />
                        {vesselEtdPol && <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }} onClick={() => setVesselEtdPol('')}><X size={13} /></button>}
                      </div>
                    </div>
                    <div>
                      <label className="lt-label">ETA POL</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="date" className="lt-input" style={{ flex: 1 }} value={vesselEtaPol}
                          onChange={e => setVesselEtaPol(e.target.value)} />
                        {vesselEtaPol && <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }} onClick={() => setVesselEtaPol('')}><X size={13} /></button>}
                      </div>
                    </div>
                    <div>
                      <label className="lt-label">Routing Type</label>
                      <select className="lt-input" style={{ width: '100%' }} value={vesselRoutingType}
                        onChange={e => setVesselRoutingType(e.target.value as 'DIRECT' | 'TRANSSHIPMENT')}>
                        <option value="DIRECT">Direct</option>
                        <option value="TRANSSHIPMENT">Transshipment</option>
                      </select>
                    </div>
                    <div>
                      <label className="lt-label">Final Port of Discharge</label>
                      <input className="lt-input" style={{ width: '100%' }} value={vesselFinalPod}
                        onChange={e => setVesselFinalPod(e.target.value)} placeholder="e.g. Felixstowe" />
                    </div>
                    <div>
                      <label className="lt-label">ETA FPOD</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input type="date" className="lt-input" style={{ flex: 1 }} value={vesselEtaFpod}
                          onChange={e => setVesselEtaFpod(e.target.value)} />
                        {vesselEtaFpod && <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }} onClick={() => setVesselEtaFpod('')}><X size={13} /></button>}
                      </div>
                    </div>
                  </div>

                  {/* Full-width fields */}
                  <div>
                    <label className="lt-label">Remarks</label>
                    <textarea className="lt-input" rows={2} style={{ width: '100%', resize: 'vertical' as const, fontSize: 13 }}
                      value={vesselRemarks} onChange={e => setVesselRemarks(e.target.value)}
                      placeholder="Any remarks about the vessel schedule..." />
                  </div>
                  <div>
                    <label className="lt-label">Agent</label>
                    <textarea className="lt-input" rows={2} style={{ width: '100%', resize: 'vertical' as const, fontSize: 13 }}
                      value={vesselAgent} onChange={e => setVesselAgent(e.target.value)}
                      placeholder="Agent details..." />
                  </div>

                  {/* Next button */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="db-btn primary"
                      disabled={!formVessel.trim() || !formVoyage.trim()}
                      style={!formVessel.trim() || !formVoyage.trim() ? { opacity: 0.4, cursor: 'not-allowed' } : { background: '#0891b2', borderColor: '#0891b2' }}
                      onClick={() => {
                        onAddVesselSchedule({
                          vessel_name: formVessel.trim(),
                          voyage_number: formVoyage.trim(),
                          schedule_type: vesselScheduleType,
                          pol: vesselPol.trim(),
                          eta_pol: vesselEtaPol,
                          etd_pol: vesselEtdPol,
                          routing_type: vesselRoutingType,
                          final_pod: vesselFinalPod.trim(),
                          eta_fpod: vesselEtaFpod,
                          remarks: vesselRemarks.trim(),
                          agent: vesselAgent.trim(),
                          created_at: new Date().toISOString(),
                          created_by: activeEmployee.id,
                        })
                        // Push vessel schedule fields into the booking form
                        const transitDays = (() => {
                          if (!vesselEtdPol || !vesselEtaFpod) return ''
                          const diff = Math.round((new Date(vesselEtaFpod).getTime() - new Date(vesselEtdPol).getTime()) / 86_400_000)
                          return diff > 0 ? String(diff) : ''
                        })()
                        setBkgForm(prev => ({
                          ...prev,
                          receiving_terminal: vesselPol.trim() || prev.receiving_terminal,
                          sob_date: vesselEtdPol || prev.sob_date,
                          eta_final_destination: vesselEtaFpod || prev.eta_final_destination,
                          eta_place_of_delivery: vesselEtaFpod || prev.eta_place_of_delivery,
                          transit_days: transitDays || prev.transit_days,
                        }))
                        setDraftBlPhase(2)
                      }}>
                      Next — Add Booking →
                    </button>
                  </div>
                </div>
              )
              // Phase 2 — Booking Form (Gensoft fields)
              if (draftBlPhase === 2) {
                const sectionHeader = (title: string) => (
                  <div style={{ padding: '6px 12px', background: 'rgba(8,145,178,0.08)', borderLeft: '3px solid #0891b2', borderRadius: '0 6px 6px 0', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#0891b2', marginTop: 4 }}>{title}</div>
                )
                const formInput = (label: string, key: string, opts?: { type?: string; placeholder?: string; span2?: boolean; readOnly?: boolean }) => (
                  <div style={opts?.span2 ? { gridColumn: '1 / -1' } : {}}>
                    <label className="lt-label">{label}</label>
                    <input className="lt-input" style={{ width: '100%', ...(opts?.readOnly ? { background: 'rgba(0,0,0,0.03)' } : {}) }}
                      type={opts?.type || 'text'}
                      value={bkgField(key)} onChange={e => setBkgField(key, e.target.value)}
                      placeholder={opts?.placeholder || ''} readOnly={opts?.readOnly} />
                  </div>
                )
                const formSelect = (label: string, key: string, options: string[]) => (
                  <div>
                    <label className="lt-label">{label}</label>
                    <select className="lt-input" style={{ width: '100%' }} value={bkgField(key)} onChange={e => setBkgField(key, e.target.value)}>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                )
                const formTextarea = (label: string, key: string, placeholder?: string) => (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="lt-label">{label}</label>
                    <textarea className="lt-input" rows={2} style={{ width: '100%', resize: 'vertical' as const, fontSize: 12 }}
                      value={bkgField(key)} onChange={e => setBkgField(key, e.target.value)}
                      placeholder={placeholder || ''} />
                  </div>
                )
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Step header */}
                    <div style={{ padding: '8px 14px', background: '#0891b2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>BOOKING</span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Step 2 of 3</span>
                    </div>
                    {activeRole === 'CS' && <button style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0891b2', padding: 0 }} onClick={() => setDraftBlPhase(1)}>← Back to Vessel Schedule</button>}

                    {/* Vessel summary strip */}
                    {(formVessel || formVoyage) && (
                      <div style={{ padding: '8px 12px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 8, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
                        {formVessel && <span><span style={{ color: 'var(--text-muted)' }}>Vessel:</span> <strong>{formVessel}</strong></span>}
                        {formVoyage && <span><span style={{ color: 'var(--text-muted)' }}>Voyage:</span> <strong>{formVoyage}</strong></span>}
                        {vesselPol && <span><span style={{ color: 'var(--text-muted)' }}>POL:</span> {vesselPol}</span>}
                        {vesselFinalPod && <span><span style={{ color: 'var(--text-muted)' }}>FPOD:</span> {vesselFinalPod}</span>}
                        {vesselEtdPol && <span><span style={{ color: 'var(--text-muted)' }}>ETD:</span> {vesselEtdPol}</span>}
                        {vesselEtaFpod && <span><span style={{ color: 'var(--text-muted)' }}>ETA:</span> {vesselEtaFpod}</span>}
                      </div>
                    )}

                    {/* ── VESSEL DETAILS ── */}
                    {sectionHeader('Vessel Details')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div><label className="lt-label">Vessel</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={formVessel} readOnly /></div>
                      <div><label className="lt-label">Voyage</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={formVoyage} readOnly /></div>
                      <div><label className="lt-label">Port of Loading</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={vesselPol} readOnly /></div>
                      <div><label className="lt-label">Port of Discharge</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={vesselFinalPod} readOnly /></div>
                      <div><label className="lt-label">ETD POL</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={vesselEtdPol} readOnly /></div>
                      <div><label className="lt-label">ETA FPOD</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={vesselEtaFpod} readOnly /></div>
                      {formInput('SOB Date', 'sob_date', { type: 'date' })}
                      <div><label className="lt-label">Routing Type</label><input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.03)' }} value={vesselRoutingType} readOnly /></div>
                    </div>

                    {/* ── BUSINESS DETAILS ── */}
                    {sectionHeader('Business Details')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {formInput('Inquiry Ref No', 'inquiry_ref')}
                      {formInput('Quotation Ref No', 'quotation_ref')}
                      {formSelect('Customer Category', 'customer_category', ['DIRECT', 'CONSOL', 'NVOCC'])}
                      {formSelect('Business Type', 'business_type', ['SALES NOMINATION', 'CO-LOAD', 'BUYING AGENT', 'DIRECT'])}
                      {formSelect('Revenue Type', 'revenue_type', ['FREIGHT FORWARDING', 'LINER AGENCY', 'NVOCC', 'CUSTOMS BROKERAGE'])}
                      {formInput('Customer', 'customer')}
                      {formInput('Billing Party', 'billing_party')}
                      {formInput('Sales Person', 'sales_person')}
                      {formInput('CS Executive', 'cs_executive')}
                      {formInput('Documentation By', 'documentation_by')}
                      {formInput('FCL Cutoff Date', 'fcl_cutoff_date', { type: 'date' })}
                      {formInput('LCL Cutoff Date', 'lcl_cutoff_date', { type: 'date' })}
                    </div>

                    {/* ── SHIPPING DETAILS ── */}
                    {sectionHeader('Shipping Details')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {formInput('Shipper Name (Booking Party)', 'shipper_name', { span2: true })}
                      {formTextarea('Shipper Address', 'shipper_address')}
                      {formInput('Actual Shipper', 'actual_shipper', { span2: true })}
                      {formInput('Contact Person', 'contact_person')}
                      {formInput('Telephone', 'telephone')}
                      {formInput('Email Address', 'email_address', { type: 'email', span2: true })}
                      {formInput('Consignee', 'consignee', { span2: true })}
                      {formTextarea('Consignee Address', 'consignee_address')}
                      {formInput('Notify', 'notify', { span2: true })}
                      {formTextarea('Notify Address', 'notify_address')}
                    </div>

                    {/* ── CARGO & CONTAINER ── */}
                    {sectionHeader('Cargo & Container')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {formInput('Commodity', 'commodity', { span2: true })}
                      {formInput('Receiving Terminal', 'receiving_terminal')}
                      {formInput('Final Destination', 'final_destination')}
                      {formInput('Transit Days', 'transit_days', { type: 'number' })}
                      {formInput('ETA Final Destination', 'eta_final_destination', { type: 'date' })}
                      {formInput('Place of Delivery', 'place_of_delivery')}
                      {formInput('ETA Place of Delivery', 'eta_place_of_delivery', { type: 'date' })}
                      {formInput('Carrier', 'carrier')}
                      {formInput('Booking Carrier Ref', 'booking_carrier_ref')}
                      {formInput('INTRA Booking No', 'intra_booking_no')}
                      {formInput('PO No', 'po_no')}
                      {formInput('Email Ref', 'email_ref')}
                      {formSelect('Cargo Type', 'cargo_type', ['GENERAL', 'HAZARDOUS', 'REEFER', 'OVERWEIGHT', 'OUT OF GAUGE'])}
                      {formSelect('Freight Term', 'freight_term', ['PREPAID', 'COLLECT'])}
                      {formSelect('MB/L Term', 'mbl_term', ['PREPAID', 'COLLECT'])}
                      {formInput('No of Packages', 'no_of_packages', { type: 'number' })}
                      {formInput('Package Type', 'package_type', { placeholder: 'e.g. Pallets, Cartons' })}
                      {formInput('Gross Weight (KG)', 'gross_weight', { type: 'number' })}
                      {formInput('Volume (CBM)', 'volume_cbm', { type: 'number' })}
                      {formInput('Weight/Measurement Ratio', 'weight_measurement_ratio')}
                    </div>

                    {/* Container info strip */}
                    <div style={{ padding: '8px 12px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 8, fontSize: 12 }}>
                      <strong>Container:</strong> {bkgField('container_count')}x {bkgField('container_size')}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {formSelect('Delivery Type', 'delivery_type_bkg', ['CY/CY', 'CY/DOOR', 'DOOR/CY', 'DOOR/DOOR'])}
                      {formInput('Incoterm', 'incoterm', { placeholder: 'e.g. FOB, CIF, EXW, DDP' })}
                      {formInput('Pickup Type', 'pickup_type')}
                      {formInput('Inland Haulage Type', 'inland_haulage_type')}
                    </div>

                    {/* ── B/L DETAILS ── */}
                    {sectionHeader('B/L Details')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {formSelect('B/L Issue Type', 'bl_issue_type', ['OWN', 'LINER'])}
                      {formInput('HB/L Issue Term', 'hbl_issue_term')}
                      {formInput('MB/L Issue Term', 'mbl_issue_term')}
                      {formInput('B/L Format', 'bl_format')}
                      {formInput('B/L Number', 'bl_number')}
                      {formInput('Shipping Bill No', 'shipping_bill_no')}
                      {formInput('B/L Cutoff Date', 'bl_cutoff_date', { type: 'date' })}
                      {formInput('B/L Cutoff Time', 'bl_cutoff_time', { type: 'time' })}
                      {formInput('VGM Cutoff Date', 'vgm_cutoff_date', { type: 'date' })}
                      {formInput('VGM Cutoff Time', 'vgm_cutoff_time', { type: 'time' })}
                      {formSelect('Destination Charges', 'destination_charges', ['COLLECT', 'PREPAID'])}
                      {formInput('Permit No', 'permit_no')}
                    </div>

                    {/* ── REMARKS ── */}
                    {sectionHeader('Remarks')}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
                      {formTextarea('Marks and Numbers', 'marks_and_numbers', 'Marks, numbers, container numbers...')}
                      {formTextarea('Description of Goods', 'description_of_goods', 'Goods description for B/L...')}
                      {formTextarea('B/L Instructions', 'bl_instructions', 'Special B/L instructions...')}
                      {formTextarea('Remarks (Customer)', 'remarks_customer', 'Customer-facing remarks...')}
                      {formTextarea('Remarks (Internal)', 'remarks_internal', 'Internal notes...')}
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                      <button className="db-btn"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => {
                          onFlash(`Booking saved for ${blBkg.customer_name}`)
                        }}>
                        Save Booking
                      </button>
                      <button className="db-btn primary"
                        style={{ background: '#0891b2', borderColor: '#0891b2' }}
                        onClick={() => setDraftBlPhase(3)}>
                        Next — Send Draft BL →
                      </button>
                    </div>
                  </div>
                )
              }
              // Phase 3 — send Draft BL
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Step header */}
                  <div style={{ padding: '8px 14px', background: '#0891b2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>SEND DRAFT BL</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Step 3 of 3</span>
                  </div>
                  <button style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#0891b2', padding: 0 }} onClick={() => setDraftBlPhase(2)}>← Back to Booking</button>
                  {/* Vessel summary strip */}
                  {(formVessel || formVoyage) && (
                    <div style={{ padding: '8px 12px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 16 }}>
                      {formVessel && <span><span style={{ color: 'var(--text-muted)' }}>Vessel:</span> <strong>{formVessel}</strong></span>}
                      {formVoyage && <span><span style={{ color: 'var(--text-muted)' }}>Voyage:</span> <strong>{formVoyage}</strong></span>}
                      {vesselPol && <span><span style={{ color: 'var(--text-muted)' }}>POL:</span> {vesselPol}</span>}
                      {vesselFinalPod && <span><span style={{ color: 'var(--text-muted)' }}>FPOD:</span> {vesselFinalPod}</span>}
                    </div>
                  )}
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{blBkg.customer_name}</strong> — {blBkg.origin} → {blBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {blBkg.quantity}x {blBkg.container_type} · {blBkg.shipping_line || 'No liner'}
                    </div>
                  </div>
                  {/* Cutoff dates */}
                  {(blBkg.si_cutoff_date || blBkg.bl_cutoff_date) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      {blBkg.si_cutoff_date && <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}><span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{blBkg.si_cutoff_date}</strong></div>}
                      {blBkg.bl_cutoff_date && <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}><span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{blBkg.bl_cutoff_date}</strong></div>}
                    </div>
                  )}
                  {/* Draft BL document */}
                  <div>
                    <label className="lt-label">Draft BL Document</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 8 }}>
                      {(['paste', 'upload'] as const).map(m => (
                        <button key={m} onClick={() => setDraftBlMode(m)}
                          className={`db-btn ${draftBlMode === m ? 'primary' : ''}`}
                          style={draftBlMode !== m ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}>
                          {m === 'paste' ? <><ClipboardPaste size={13} style={{ marginRight: 4 }} />Paste</> : <><Paperclip size={13} style={{ marginRight: 4 }} />Upload</>}
                        </button>
                      ))}
                    </div>
                    {draftBlMode === 'paste' && (
                      <textarea className="lt-input" style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' as const }}
                        value={draftBlContent} onChange={e => setDraftBlContent(e.target.value)}
                        placeholder="Paste Draft BL content here..." />
                    )}
                    {draftBlMode === 'upload' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label className="db-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <Paperclip size={13} />
                          {draftBlFileName ? 'Replace file' : 'Choose file'}
                          <input type="file" accept=".pdf,.doc,.docx,.xlsx,.png,.jpg" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              setDraftBlFileName(f.name)
                              const r = new FileReader()
                              r.onload = () => setDraftBlContent(r.result as string)
                              r.readAsDataURL(f)
                              e.target.value = ''
                            }} />
                        </label>
                        {draftBlFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{draftBlFileName}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }} onClick={() => { setDraftBlFileName(''); setDraftBlContent('') }}><X size={12} /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Send method */}
                  <div>
                    <label className="lt-label">Send Draft BL to Customer via</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button className={`db-btn ${sendMethod === 'email' ? 'primary' : ''}`}
                        style={sendMethod !== 'email' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setSendMethod('email')}><Mail size={13} style={{ marginRight: 4 }} /> Email</button>
                      <button className={`db-btn ${sendMethod === 'whatsapp' ? 'primary' : ''}`}
                        style={sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setSendMethod('whatsapp')}><MessageCircle size={13} style={{ marginRight: 4 }} /> WhatsApp</button>
                    </div>
                  </div>
                  {sendMethod === 'email' && (
                    <div>
                      <label className="lt-label">Customer Email <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="email"
                        value={customerContactEmail} onChange={e => setCustomerContactEmail(e.target.value)}
                        placeholder="customer@example.com" />
                    </div>
                  )}
                  {sendMethod === 'whatsapp' && (
                    <>
                      <div>
                        <label className="lt-label">Customer WhatsApp Number</label>
                        <input className="lt-input" style={{ width: '100%' }} value={customerContactPhone}
                          onChange={e => setCustomerContactPhone(e.target.value)} placeholder="+94 7X XXX XXXX" />
                      </div>
                      <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                          <input type="checkbox" checked={waConfirmed} onChange={e => setWaConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                          <span>I confirm that I have sent the Draft BL to the customer via WhatsApp.
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>No WhatsApp integration — manual confirmation.</span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)} placeholder="Any notes for the customer..." />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="db-btn primary"
                      disabled={sendMethod === 'email' ? !customerContactEmail.includes('@') : !waConfirmed}
                      style={
                        (sendMethod === 'email' && !customerContactEmail.includes('@')) || (sendMethod === 'whatsapp' && !waConfirmed)
                          ? { opacity: 0.4, cursor: 'not-allowed' }
                          : sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : {}
                      }
                      onClick={handleModalSubmit}>
                      {sendMethod === 'email' ? <><Mail size={12} style={{ marginRight: 6 }} /> Send Draft BL via Email</> : <><MessageCircle size={12} style={{ marginRight: 6 }} /> Confirm Draft BL Sent</>}
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'send-pre-advice' && actionModal ? (() => {
              const paBkg = actionModal.sourceData.booking as Booking
              const blCutoff = paBkg.bl_cutoff_date || paBkg.si_cutoff_date

              const paSectionHeader = (title: string) => (
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: 0.5, padding: '12px 0 6px', borderBottom: '2px solid #0891b220' }}>{title}</div>
              )
              const paInput = (label: string, key: string, opts?: { readOnly?: boolean; span?: boolean }) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: opts?.span ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
                  <input value={paField(key)} onChange={e => setPaField(key, e.target.value)} readOnly={opts?.readOnly}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: opts?.readOnly ? 'rgba(0,0,0,0.03)' : 'var(--bg-card)' }} />
                </div>
              )
              const paTextarea = (label: string, key: string) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</label>
                  <textarea value={paField(key)} onChange={e => setPaField(key, e.target.value)} rows={3}
                    style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              )

              return (
                <div style={{ padding: 20, overflowY: 'auto', maxHeight: '100%' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <FileText size={18} style={{ color: '#0891b2' }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Pre-Advice Notice</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    {paBkg.id} &middot; {paBkg.customer_name} &middot; {paBkg.origin} &rarr; {paBkg.destination}
                  </div>
                  {blCutoff && (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600, marginBottom: 14 }}>
                      <Clock size={12} /> BL Cutoff: {blCutoff}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                    {/* Door Agent */}
                    {paSectionHeader('Door Agent')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paInput('Agent Name', 'door_agent')}
                      {paInput('Contact Person', 'door_agent_contact')}
                      {paInput('Address', 'door_agent_address', { span: true })}
                      {paInput('Email', 'door_agent_email')}
                    </div>

                    {/* Shipment Reference */}
                    {paSectionHeader('Shipment Reference')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paInput('B/L Number', 'bl_number')}
                      {paInput('Booking Ref', 'booking_ref', { readOnly: true })}
                    </div>

                    {/* Parties */}
                    {paSectionHeader('Parties')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paInput('Shipper', 'shipper')}
                      {paInput('Shipper Address', 'shipper_address')}
                      {paInput('Consignee', 'consignee')}
                      {paInput('Consignee Address', 'consignee_address')}
                      {paInput('Notify Party', 'notify_party')}
                      {paInput('Notify Address', 'notify_address')}
                    </div>

                    {/* Vessel & Route */}
                    {paSectionHeader('Vessel & Route')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paInput('Vessel', 'vessel', { readOnly: true })}
                      {paInput('Voyage', 'voyage', { readOnly: true })}
                      {paInput('Carrier', 'carrier', { readOnly: true })}
                      {paInput('Port of Loading', 'pol', { readOnly: true })}
                      {paInput('Port of Discharge', 'pod', { readOnly: true })}
                      {paInput('Final Destination', 'final_destination')}
                      {paInput('ETA Destination', 'eta_destination')}
                    </div>

                    {/* Container Details */}
                    {paSectionHeader('Container Details')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paInput('Container No.', 'container_no')}
                      {paInput('Size / Type', 'container_size', { readOnly: true })}
                      {paInput('Qty', 'container_count', { readOnly: true })}
                      {paInput('Seal No.', 'seal_no')}
                    </div>

                    {/* Cargo Details */}
                    {paSectionHeader('Cargo Details')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paTextarea('Description of Goods', 'cargo_description')}
                      {paInput('HS Code', 'hs_code')}
                      {paInput('No. of Packages', 'no_of_packages')}
                      {paInput('Package Type', 'package_type')}
                      {paInput('Gross Weight (kg)', 'gross_weight')}
                      {paInput('Net Weight (kg)', 'net_weight')}
                      {paInput('Volume (CBM)', 'volume_cbm')}
                      {paInput('Freight Terms', 'freight_terms')}
                    </div>

                    {/* Door Delivery */}
                    {paSectionHeader('Door Delivery')}
                    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px' }}>
                      {paTextarea('Delivery Address', 'delivery_address')}
                      {paInput('Contact at Delivery', 'delivery_contact')}
                      {paInput('Phone', 'delivery_phone')}
                      {paTextarea('Special Instructions', 'special_instructions')}
                      {paTextarea('Remarks', 'remarks')}
                    </div>
                  </div>

                  {/* Generated Email Body */}
                  {(() => {
                    const emailBody = [
                      `Subject: PRE-ADVICE — ${paField('bl_number') || paBkg.id} — ${paField('vessel')} ${paField('voyage')} — ${paField('pol')} → ${paField('final_destination')}`,
                      ``,
                      `Dear ${paField('door_agent') || '[Door Agent]'},`,
                      ``,
                      `Please find below the pre-advice details for the following shipment. Kindly arrange door delivery accordingly.`,
                      ``,
                      `════════════════════════════════════════`,
                      `  SHIPMENT REFERENCE`,
                      `════════════════════════════════════════`,
                      `B/L Number       : ${paField('bl_number') || 'N/A'}`,
                      `Booking Ref      : ${paField('booking_ref')}`,
                      `Carrier          : ${paField('carrier')}`,
                      ``,
                      `════════════════════════════════════════`,
                      `  PARTIES`,
                      `════════════════════════════════════════`,
                      `Shipper          : ${paField('shipper')}`,
                      ...(paField('shipper_address') ? [`                   ${paField('shipper_address')}`] : []),
                      `Consignee        : ${paField('consignee') || 'N/A'}`,
                      ...(paField('consignee_address') ? [`                   ${paField('consignee_address')}`] : []),
                      `Notify Party     : ${paField('notify_party') || 'SAME AS CONSIGNEE'}`,
                      ...(paField('notify_address') ? [`                   ${paField('notify_address')}`] : []),
                      ``,
                      `════════════════════════════════════════`,
                      `  VESSEL & ROUTE`,
                      `════════════════════════════════════════`,
                      `Vessel / Voyage  : ${paField('vessel')} / ${paField('voyage')}`,
                      `Port of Loading  : ${paField('pol')}`,
                      `Port of Discharge: ${paField('pod')}`,
                      `Final Destination: ${paField('final_destination')}`,
                      `ETA Destination  : ${paField('eta_destination') || 'TBC'}`,
                      ``,
                      `════════════════════════════════════════`,
                      `  CONTAINER DETAILS`,
                      `════════════════════════════════════════`,
                      `Container No.    : ${paField('container_no') || 'TBC'}`,
                      `Size / Type      : ${paField('container_size')} × ${paField('container_count')}`,
                      `Seal No.         : ${paField('seal_no') || 'TBC'}`,
                      ``,
                      `════════════════════════════════════════`,
                      `  CARGO DETAILS`,
                      `════════════════════════════════════════`,
                      `Description      : ${paField('cargo_description') || 'N/A'}`,
                      ...(paField('hs_code') ? [`HS Code          : ${paField('hs_code')}`] : []),
                      `No. of Packages  : ${paField('no_of_packages') || 'N/A'} ${paField('package_type') || ''}`.trimEnd(),
                      `Gross Weight     : ${paField('gross_weight') ? paField('gross_weight') + ' kg' : 'N/A'}`,
                      ...(paField('net_weight') ? [`Net Weight       : ${paField('net_weight')} kg`] : []),
                      `Volume           : ${paField('volume_cbm') ? paField('volume_cbm') + ' CBM' : 'N/A'}`,
                      `Freight Terms    : ${paField('freight_terms')}`,
                      ``,
                      `════════════════════════════════════════`,
                      `  DOOR DELIVERY`,
                      `════════════════════════════════════════`,
                      `Delivery Address : ${paField('delivery_address') || 'N/A'}`,
                      ...(paField('delivery_contact') ? [`Contact Person   : ${paField('delivery_contact')}`] : []),
                      ...(paField('delivery_phone') ? [`Phone            : ${paField('delivery_phone')}`] : []),
                      ...(paField('special_instructions') ? [`\nSpecial Instructions:\n${paField('special_instructions')}`] : []),
                      ...(paField('remarks') ? [`\nRemarks:\n${paField('remarks')}`] : []),
                      ``,
                      `════════════════════════════════════════`,
                      ``,
                      `Please confirm receipt of this pre-advice and arrange delivery as per the above details.`,
                      ``,
                      `Best regards,`,
                      `${activeEmployee.name}`,
                      `Synergy Shipping & Logistics`,
                    ].join('\n')

                    return (
                      <>
                        <div style={{ marginTop: 18 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', textTransform: 'uppercase', letterSpacing: 0.5 }}>Generated Email</div>
                            <button
                              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: paCopied ? '#dcfce7' : 'none', border: paCopied ? '1px solid #86efac' : 'none', cursor: 'pointer', color: paCopied ? '#16a34a' : 'var(--text-muted)', padding: '3px 8px', borderRadius: 5 }}
                              onClick={() => { navigator.clipboard.writeText(emailBody); setPaCopied(true); setTimeout(() => setPaCopied(false), 2000) }}>
                              {paCopied ? <><ClipboardCheck size={11} /> Copied!</> : <><Copy size={11} /> Copy to Clipboard</>}
                            </button>
                          </div>
                          <textarea
                            readOnly
                            rows={22}
                            value={emailBody}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, fontFamily: 'ui-monospace, monospace', lineHeight: 1.6, resize: 'vertical', background: 'rgba(0,0,0,0.02)', color: 'var(--text)', boxSizing: 'border-box' }}
                          />
                        </div>

                        {/* Send Method */}
                        <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 10, background: 'rgba(8,145,178,0.04)', border: '1px solid rgba(8,145,178,0.12)' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', marginBottom: 8 }}>SEND TO DOOR AGENT</div>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <button onClick={() => setSendMethod('email')}
                              style={{ padding: '5px 14px', borderRadius: 6, border: sendMethod === 'email' ? '1.5px solid #0891b2' : '1px solid var(--border)', background: sendMethod === 'email' ? '#0891b210' : 'var(--bg-card)', fontSize: 11, fontWeight: 600, color: sendMethod === 'email' ? '#0891b2' : 'var(--text-secondary)', cursor: 'pointer' }}>
                              <Mail size={11} style={{ marginRight: 4 }} /> Email
                            </button>
                            <button onClick={() => { setSendMethod('whatsapp'); setWaConfirmed(false) }}
                              style={{ padding: '5px 14px', borderRadius: 6, border: sendMethod === 'whatsapp' ? '1.5px solid #25d366' : '1px solid var(--border)', background: sendMethod === 'whatsapp' ? '#25d36610' : 'var(--bg-card)', fontSize: 11, fontWeight: 600, color: sendMethod === 'whatsapp' ? '#25d366' : 'var(--text-secondary)', cursor: 'pointer' }}>
                              <MessageCircle size={11} style={{ marginRight: 4 }} /> WhatsApp
                            </button>
                          </div>
                          {sendMethod === 'email' ? (
                            <input placeholder="Door agent email" value={paField('door_agent_email')} onChange={e => setPaField('door_agent_email', e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, boxSizing: 'border-box' }} />
                          ) : (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: waConfirmed ? '#16a34a' : 'var(--text-secondary)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={waConfirmed} onChange={e => setWaConfirmed(e.target.checked)} />
                              I have sent the pre-advice via WhatsApp (copy message above first)
                            </label>
                          )}
                        </div>

                        {/* Notes */}
                        <div style={{ marginTop: 12 }}>
                          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Internal Notes</label>
                          <textarea value={formNote} onChange={e => setFormNote(e.target.value)} rows={2} placeholder="Optional notes..."
                            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, resize: 'vertical', fontFamily: 'inherit', marginTop: 4, boxSizing: 'border-box' }} />
                        </div>

                        {/* Submit */}
                        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            disabled={
                              !paField('door_agent').trim() ||
                              (sendMethod === 'email' && !paField('door_agent_email').includes('@')) ||
                              (sendMethod === 'whatsapp' && !waConfirmed)
                            }
                            onClick={() => handleModalSubmit()}
                            style={{
                              padding: '8px 22px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: 12,
                              background: '#0891b2', color: '#fff', cursor: 'pointer',
                              opacity: (!paField('door_agent').trim() || (sendMethod === 'email' && !paField('door_agent_email').includes('@')) || (sendMethod === 'whatsapp' && !waConfirmed)) ? 0.4 : 1,
                            }}>
                            <FileText size={12} style={{ marginRight: 4 }} /> Send Pre-Advice
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )
            })() : selectedItem.actionKind === 'release-booking' && actionModal ? (() => {
              const rbkg = actionModal.sourceData.booking as Booking
              const ro = rbkg.release_order_fields
              const roRow = (label: string, value: string | undefined) =>
                value ? (
                  <div key={label} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', borderBottom: '1px solid rgba(124,58,237,0.12)' }}>
                    <div style={{ padding: '5px 10px', background: 'rgba(124,58,237,0.06)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: '#7c3aed', display: 'flex', alignItems: 'center', borderRight: '1px solid rgba(124,58,237,0.12)' }}>{label}</div>
                    <div style={{ padding: '5px 10px', fontSize: 12, color: 'var(--text)' }}>{value}</div>
                  </div>
                ) : null
              const switchMethod = (m: 'email' | 'whatsapp') => {
                setSendMethod(m)
                setReleaseDraft(generateReleaseOrderDraft(rbkg, m))
                setWaConfirmed(false)
              }
              const canSend = sendMethod === 'email'
                ? customerContactEmail.includes('@') && releaseDraft.trim()
                : waConfirmed && releaseDraft.trim()
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Release Order fields card */}
                  {ro && (
                    <div style={{ border: '1px solid rgba(124,58,237,0.25)', borderRadius: 8, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={13} style={{ color: '#fff' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>RELEASE ORDER</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{ro.reference_nbr}</span>
                      </div>
                      {roRow('Pick Up Date',  ro.pickup_empty_date)}
                      {roRow('Valid Until',   ro.validity_expiration_date)}
                      {roRow('Pick Up Depot', ro.pickup_depot)}
                      {roRow('Depot Address', ro.pickup_depot_address)}
                      {roRow('Booking Client', rbkg.customer_name)}
                      {roRow('Port of Loading', rbkg.origin)}
                      {ro.next_port_of_discharge ? roRow('Next Port', ro.next_port_of_discharge) : null}
                      {roRow('Port of Discharge', rbkg.destination)}
                      {roRow('Container', `${rbkg.quantity}x ${rbkg.container_type}`)}
                      {roRow('Cargo',  ro.cargo_description)}
                      {roRow('Weight', ro.cargo_weight ? `${ro.cargo_weight} kg` : undefined)}
                      {roRow('Vessel', rbkg.vessel_name)}
                      {roRow('Voyage', rbkg.voyage_number)}
                      {roRow('Cut-Off', ro.cut_off_date)}
                      {roRow('ETD', ro.etd)}
                      {roRow('ETA', ro.eta)}
                    </div>
                  )}

                  {/* Send method */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: 'var(--text-muted)', marginBottom: 8 }}>Send via</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className={`db-btn ${sendMethod === 'email' ? 'primary' : ''}`}
                        style={sendMethod !== 'email' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => switchMethod('email')}
                      >
                        <Mail size={13} style={{ marginRight: 4 }} /> Email
                      </button>
                      <button
                        className={`db-btn ${sendMethod === 'whatsapp' ? 'primary' : ''}`}
                        style={sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => switchMethod('whatsapp')}
                      >
                        <MessageCircle size={13} style={{ marginRight: 4 }} /> WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Contact input */}
                  {sendMethod === 'email' && (
                    <div>
                      <label className="lt-label">Customer Email <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="email"
                        value={customerContactEmail} onChange={e => setCustomerContactEmail(e.target.value)}
                        placeholder="customer@example.com" />
                    </div>
                  )}
                  {sendMethod === 'whatsapp' && (
                    <div>
                      <label className="lt-label">Customer WhatsApp Number</label>
                      <input className="lt-input" style={{ width: '100%' }}
                        value={customerContactPhone} onChange={e => setCustomerContactPhone(e.target.value)}
                        placeholder="+94 7X XXX XXXX" />
                    </div>
                  )}

                  {/* Draft message */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: sendMethod === 'whatsapp' ? '#25d366' : 'var(--text-muted)' }}>
                        {sendMethod === 'email' ? 'Email Draft' : 'WhatsApp Message'}
                      </div>
                      <button
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4 }}
                        onClick={() => navigator.clipboard.writeText(releaseDraft)}
                        title="Copy to clipboard"
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <textarea
                      className="lt-input"
                      rows={sendMethod === 'email' ? 16 : 14}
                      style={{ width: '100%', resize: 'vertical' as const, fontFamily: sendMethod === 'email' ? 'ui-monospace, monospace' : 'inherit', fontSize: 11.5, lineHeight: 1.6 }}
                      value={releaseDraft}
                      onChange={e => setReleaseDraft(e.target.value)}
                    />
                  </div>

                  {/* WhatsApp manual confirm */}
                  {sendMethod === 'whatsapp' && (
                    <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={waConfirmed} onChange={e => setWaConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                        <span>
                          I confirm I have sent the release order to the customer via WhatsApp.
                          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Copy the message above and paste it into WhatsApp, then check this box.</span>
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Optional notes */}
                  <div>
                    <label className="lt-label">Internal Note (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Collection instructions, remarks, etc." />
                  </div>

                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className="db-btn primary"
                      disabled={!canSend}
                      style={
                        !canSend ? { opacity: 0.4, cursor: 'not-allowed' } :
                        sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : {}
                      }
                      onClick={handleModalSubmit}
                    >
                      {sendMethod === 'email'
                        ? <><Mail size={12} style={{ marginRight: 6 }} /> Send Release Order via Email</>
                        : <><MessageCircle size={12} style={{ marginRight: 6 }} /> Confirm WhatsApp Sent</>
                      }
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'attach-release-order' ? (() => {
              const roBkg = selectedItem.sourceData.booking as Booking
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Header */}
                  <div style={{ padding: '8px 14px', background: '#7c3aed', borderRadius: '8px 8px 0 0', marginBottom: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>RELEASE ORDER</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>Attach & send to CS</span>
                  </div>
                  {/* Booking summary — read-only */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden', marginBottom: 16 }}>
                    {[
                      { label: 'Customer',   value: roBkg.customer_name },
                      { label: 'Carrier',    value: roBkg.shipping_line || '—' },
                      { label: 'Container',  value: `${roBkg.quantity}x ${roBkg.container_type}` },
                      { label: 'Vessel',     value: roBkg.vessel_name || '—' },
                      { label: 'Voyage',     value: roBkg.voyage_number || '—' },
                      { label: 'Route',      value: `${roBkg.origin} → ${roBkg.destination}` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ padding: '7px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>{label}</div>
                        <div style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text)' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Release Order Fields — structured form matching liner release order format */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.4, color: '#7c3aed', marginBottom: 10 }}>Release Order Details</div>

                    {/* Liner Reference */}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 }}>Liner Reference</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <label className="lt-label">Reference Nbr</label>
                        <input className="lt-input" style={{ width: '100%' }} value={roFields.reference_nbr}
                          onChange={e => setRoFields(f => ({ ...f, reference_nbr: e.target.value }))}
                          placeholder="e.g. EBKG16474591" />
                      </div>
                      <div>
                        <label className="lt-label">Pick Up Empty Date</label>
                        <input type="date" className="lt-input" style={{ width: '100%' }} value={roFields.pickup_empty_date}
                          onChange={e => setRoFields(f => ({ ...f, pickup_empty_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="lt-label">Validity Expiration</label>
                        <input type="date" className="lt-input" style={{ width: '100%' }} value={roFields.validity_expiration_date}
                          onChange={e => setRoFields(f => ({ ...f, validity_expiration_date: e.target.value }))} />
                      </div>
                    </div>

                    {/* Pick Up Depot */}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 }}>Pick Up Depot</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <label className="lt-label">Depot Name</label>
                        <input className="lt-input" style={{ width: '100%' }} value={roFields.pickup_depot}
                          onChange={e => setRoFields(f => ({ ...f, pickup_depot: e.target.value }))}
                          placeholder="e.g. Spectra Integrated Logistics" />
                      </div>
                      <div>
                        <label className="lt-label">Depot Address</label>
                        <input className="lt-input" style={{ width: '100%' }} value={roFields.pickup_depot_address}
                          onChange={e => setRoFields(f => ({ ...f, pickup_depot_address: e.target.value }))}
                          placeholder="Full address" />
                      </div>
                    </div>

                    {/* Cargo */}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 }}>Cargo</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <label className="lt-label">Cargo Description</label>
                        <input className="lt-input" style={{ width: '100%' }} value={roFields.cargo_description}
                          onChange={e => setRoFields(f => ({ ...f, cargo_description: e.target.value }))}
                          placeholder="e.g. Coconut Milk" />
                      </div>
                      <div>
                        <label className="lt-label">Cargo Weight (kg)</label>
                        <input className="lt-input" style={{ width: '100%' }} value={roFields.cargo_weight}
                          onChange={e => setRoFields(f => ({ ...f, cargo_weight: e.target.value }))}
                          placeholder="e.g. 16,000" />
                      </div>
                    </div>

                    {/* Schedule */}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--text-muted)', marginBottom: 6 }}>Vessel Schedule</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                      <div>
                        <label className="lt-label">Cut-Off Date</label>
                        <input type="date" className="lt-input" style={{ width: '100%' }} value={roFields.cut_off_date}
                          onChange={e => setRoFields(f => ({ ...f, cut_off_date: e.target.value }))} />
                      </div>
                      <div>
                        <label className="lt-label">ETD</label>
                        <input type="date" className="lt-input" style={{ width: '100%' }} value={roFields.etd}
                          onChange={e => setRoFields(f => ({ ...f, etd: e.target.value }))} />
                      </div>
                      <div>
                        <label className="lt-label">ETA (Destination)</label>
                        <input type="date" className="lt-input" style={{ width: '100%' }} value={roFields.eta}
                          onChange={e => setRoFields(f => ({ ...f, eta: e.target.value }))} />
                      </div>
                    </div>

                    {/* Optional */}
                    <div>
                      <label className="lt-label">Next Port of Discharge (if transshipment)</label>
                      <input className="lt-input" style={{ width: '100%' }} value={roFields.next_port_of_discharge ?? ''}
                        onChange={e => setRoFields(f => ({ ...f, next_port_of_discharge: e.target.value }))}
                        placeholder="Optional — leave blank for direct service" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Notes for CS (optional)</div>
                    <textarea className="lt-input" rows={2} style={{ width: '100%', resize: 'vertical' as const, fontSize: 13 }}
                      value={formNote} onChange={e => setFormNote(e.target.value)}
                      placeholder="Any instructions or remarks for the CS team…" />
                  </div>
                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className="db-btn primary"
                      style={{ background: '#7c3aed', borderColor: '#7c3aed' }}
                      disabled={!roFields.reference_nbr.trim()}
                      onClick={handleModalSubmit}>
                      <Send size={12} style={{ marginRight: 6 }} /> Send Release Order to CS
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'confirm-liner-booking' && actionModal ? (() => {
              const { booking: cbBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Form header */}
                  <div style={{ padding: '8px 14px', background: '#16a34a', borderRadius: '8px 8px 0 0', marginBottom: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>LINER BOOKING CONFIRMATION</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>RA# {cbBkg.voyage_number || '—'}</span>
                  </div>
                  {/* Booking summary — read-only */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden', marginBottom: 16 }}>
                    {[
                      { label: 'Customer', value: cbBkg.customer_name },
                      { label: 'Carrier', value: cbBkg.shipping_line || '—' },
                      { label: 'Container', value: `${cbBkg.quantity}x ${cbBkg.container_type}` },
                      { label: 'RA Number', value: cbBkg.voyage_number || 'Not assigned' },
                      { label: 'Vessel', value: cbBkg.vessel_name || '—' },
                      { label: 'Route', value: `${cbBkg.origin} → ${cbBkg.destination}` },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>{label}</div>
                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text)', fontWeight: label === 'RA Number' ? 700 : 400 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Booked? toggle */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>Was the liner booking confirmed?</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {(['yes', 'no'] as const).map(v => (
                        <button key={v} onClick={() => setLinerBooked(v)}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: `2px solid ${linerBooked === v ? (v === 'yes' ? '#16a34a' : '#dc2626') : 'var(--border)'}`,
                            background: linerBooked === v ? (v === 'yes' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.06)') : '#fff',
                            color: linerBooked === v ? (v === 'yes' ? '#16a34a' : '#dc2626') : 'var(--text-secondary)',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                          {v === 'yes' ? '✓ Yes, booked' : '✗ No, couldn\'t book'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Reason — shown only when No */}
                  {linerBooked === 'no' && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#dc2626', marginBottom: 6 }}>Reason (required)</div>
                      <textarea className="lt-input" rows={3} style={{ width: '100%', resize: 'vertical' as const, fontSize: 13 }}
                        value={formNote} onChange={e => setFormNote(e.target.value)}
                        placeholder="Explain why the booking couldn't be made…" />
                    </div>
                  )}
                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                    <button className="db-btn primary"
                      disabled={!linerBooked || (linerBooked === 'no' && !formNote.trim())}
                      style={{ background: linerBooked === 'no' ? '#dc2626' : '#16a34a', borderColor: linerBooked === 'no' ? '#dc2626' : '#16a34a',
                        opacity: (!linerBooked || (linerBooked === 'no' && !formNote.trim())) ? 0.5 : 1 }}
                      onClick={handleModalSubmit}>
                      {linerBooked === 'no' ? 'Revert to Pending Liner' : 'Confirm Liner Booking'}
                    </button>
                  </div>
                </div>
              )
            })() : selectedItem.actionKind === 'submit-si' && actionModal ? (() => {
              const siBkg = actionModal.sourceData.booking as Booking
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Header */}
                  <div style={{ padding: '8px 14px', background: '#0891b2', borderRadius: '8px 8px 0 0', marginBottom: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>SUBMIT SHIPPING INSTRUCTIONS</span>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                    {/* Booking summary */}
                    <div style={{ padding: '10px 14px', background: 'rgba(8,145,178,0.04)', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                      <strong>{siBkg.customer_name}</strong> — {siBkg.origin} → {siBkg.destination}
                      <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>
                        {siBkg.quantity}x {siBkg.container_type} · {siBkg.shipping_line || 'No liner'}
                      </span>
                    </div>

                    {/* Cutoff dates */}
                    {(siBkg.si_cutoff_date || siBkg.bl_cutoff_date || siBkg.vgm_cutoff_date) && (
                      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)' }}>
                        {siBkg.si_cutoff_date && (
                          <div style={{ flex: 1, padding: '6px 12px', background: 'rgba(8,145,178,0.04)', borderRight: '1px solid var(--border)', fontSize: 11 }}>
                            <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{siBkg.si_cutoff_date}</strong>
                          </div>
                        )}
                        {siBkg.bl_cutoff_date && (
                          <div style={{ flex: 1, padding: '6px 12px', background: 'rgba(217,119,6,0.04)', borderRight: '1px solid var(--border)', fontSize: 11 }}>
                            <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{siBkg.bl_cutoff_date}</strong>
                          </div>
                        )}
                        {siBkg.vgm_cutoff_date && (
                          <div style={{ flex: 1, padding: '6px 12px', background: 'rgba(168,85,247,0.04)', fontSize: 11 }}>
                            <span style={{ color: 'var(--text-muted)' }}>VGM Cutoff:</span> <strong>{siBkg.vgm_cutoff_date}</strong>
                          </div>
                        )}
                      </div>
                    )}

                    {/* SI Document section */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#0891b2', marginBottom: 6 }}>SI DOCUMENT</div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button
                          className={`db-btn ${siMode === 'paste' ? 'primary' : ''}`}
                          style={siMode !== 'paste' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 } : { fontSize: 11 }}
                          onClick={() => setSiMode('paste')}
                        >
                          <ClipboardPaste size={12} style={{ marginRight: 4 }} /> Paste
                        </button>
                        <button
                          className={`db-btn ${siMode === 'upload' ? 'primary' : ''}`}
                          style={siMode !== 'upload' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11 } : { fontSize: 11 }}
                          onClick={() => setSiMode('upload')}
                        >
                          <Paperclip size={12} style={{ marginRight: 4 }} /> Upload
                        </button>
                      </div>

                      {siMode === 'paste' && (
                        <textarea
                          className="lt-input"
                          style={{ width: '100%', minHeight: 90, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' }}
                          value={siContent}
                          onChange={e => setSiContent(e.target.value)}
                          placeholder="Paste shipping instructions here..."
                        />
                      )}

                      {siMode === 'upload' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <label className="db-btn"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                            <Paperclip size={12} />
                            {siFileName ? 'Replace file' : 'Choose file'}
                            <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.txt,.doc,.docx" style={{ display: 'none' }}
                              onChange={e => {
                                const file = e.target.files?.[0]
                                if (!file) return
                                setSiFileName(file.name)
                                const reader = new FileReader()
                                reader.onload = () => setSiContent(reader.result as string)
                                reader.readAsDataURL(file)
                                e.target.value = ''
                              }} />
                          </label>
                          {siFileName && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                              <FileText size={13} style={{ color: '#16a34a' }} />
                              <span style={{ fontWeight: 600 }}>{siFileName}</span>
                              <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                onClick={() => { setSiFileName(''); setSiContent('') }} title="Remove file"><X size={12} /></button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* VGM Document section */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', marginBottom: 6 }}>VGM DOCUMENT <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label className="db-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                          <Paperclip size={12} />
                          {vgmCertFileName ? 'Replace file' : 'Upload VGM'}
                          <input type="file" accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.doc,.docx" style={{ display: 'none' }}
                            onChange={e => {
                              const f = e.target.files?.[0]
                              if (!f) return
                              setVgmCertFileName(f.name)
                              const r = new FileReader()
                              r.onload = () => setVgmCertContent(r.result as string)
                              r.readAsDataURL(f)
                              e.target.value = ''
                            }} />
                        </label>
                        {vgmCertFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{vgmCertFileName}</span>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              onClick={() => { setVgmCertFileName(''); setVgmCertContent('') }}><X size={12} /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Notes</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Any notes about the SI submission..." />
                      </div>
                    </div>
                  </div>

                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button className="db-btn primary"
                      disabled={!siContent.trim() || inttraSiLoading}
                      style={siContent.trim() ? { background: '#0891b2', borderColor: '#0891b2' } : { opacity: 0.4, cursor: 'not-allowed' }}
                      onClick={handleModalSubmit}>
                      <Globe size={12} /> Submit SI & Confirm{vgmCertFileName ? ' (VGM attached)' : ''}
                    </button>
                  </div>
                </div>
              )
            })() : (selectedItem.actionKind === 'booking-request' || selectedItem.actionKind === 'review-booking-request') && actionModal ? (() => {
              const isCS = selectedItem.actionKind === 'booking-request'
              const isReefer = bkContainers.some(c => c.type.includes('RF'))
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {/* Form header */}
                  <div style={{ padding: '8px 14px', background: 'var(--accent)', borderRadius: '8px 8px 0 0', marginBottom: 1 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>BOOKING FORMAT REQUEST</span>
                    {!isCS && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginLeft: 10 }}>Submitted by CS — review and add RA number</span>}
                  </div>
                  {/* Fields table */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                    {/* Carrier */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Carrier</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input list="rp-bk-liners" className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkShippingLine} onChange={e => setBkShippingLine(e.target.value)} placeholder="e.g. MSC, Maersk, Hapag-Lloyd" />
                        <datalist id="rp-bk-liners">{linerList.map(l => <option key={l.lin_id} value={l.name} />)}</datalist>
                      </div>
                    </div>
                    {/* Containers (dynamic list) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', paddingTop: 10 }}>
                        Containers
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 4 }}>({bkContainers.reduce((s, c) => s + c.qty, 0)})</span>
                      </div>
                      <div style={{ padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {bkContainers.map((ctn, ci) => (
                          <div key={ci} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input className="lt-input" style={{ width: 48, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', padding: '3px 4px', textAlign: 'center' }}
                              type="number" min={1} value={ctn.qty}
                              onChange={e => setBkContainers(prev => prev.map((c, i) => i === ci ? { ...c, qty: Math.max(1, parseInt(e.target.value) || 1) } : c))} />
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>×</span>
                            <select className="lt-input" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', padding: '3px 4px', fontSize: 12 }}
                              value={ctn.type} onChange={e => setBkContainers(prev => prev.map((c, i) => i === ci ? { ...c, type: e.target.value } : c))}>
                              <option value="20'GP">20' GP</option><option value="40'GP">40' GP</option>
                              <option value="40'HC">40' HC</option><option value="20'RF">20' RF (Reefer)</option>
                              <option value="40'RF">40' RF (Reefer)</option><option value="20'OT">20' OT (Open Top)</option>
                              <option value="40'OT">40' OT (Open Top)</option><option value="20'FR">20' FR (Flat Rack)</option>
                              <option value="40'FR">40' FR (Flat Rack)</option>
                            </select>
                            {bkContainers.length > 1 && (
                              <button type="button" onClick={() => setBkContainers(prev => prev.filter((_, i) => i !== ci))}
                                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
                                title="Remove">×</button>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => setBkContainers(prev => [...prev, { type: "20'GP", qty: 1 }])}
                          style={{ border: '1px dashed var(--border)', borderRadius: 4, background: 'transparent', cursor: 'pointer', padding: '3px 8px', fontSize: 11, color: 'var(--accent)', fontWeight: 600, alignSelf: 'flex-start', marginTop: 2 }}>
                          + Add Container
                        </button>
                      </div>
                    </div>
                    {/* Commodity */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Commodity</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkCommodity} onChange={e => setBkCommodity(e.target.value)} placeholder="e.g. Coconut Milk, Garments" />
                      </div>
                    </div>
                    {/* Cargo Ready Date */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Cargo Ready Date</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" type="date" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkCargoReadyDate} onChange={e => setBkCargoReadyDate(e.target.value)} />
                      </div>
                    </div>
                    {/* Vessel + Voyage */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Vessel</div>
                      <div style={{ padding: '4px 8px', borderRight: '1px solid var(--border)' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkVessel} onChange={e => setBkVessel(e.target.value)} placeholder="e.g. MSC Asya" />
                      </div>
                      <div style={{ padding: '8px 8px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Voyage</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkVoyage} onChange={e => setBkVoyage(e.target.value)} placeholder="e.g. MA622R" />
                      </div>
                    </div>
                    {/* POD */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>POD</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkPod} onChange={e => setBkPod(e.target.value)} placeholder="Port of Discharge" />
                      </div>
                    </div>
                    {/* Customer */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Customer</div>
                      <div style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{selectedItem.customerName}</div>
                    </div>
                    {/* Agreed Rate + Rate Remark */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Agreed Rate</div>
                      <div style={{ padding: '4px 8px', borderRight: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>$</span>
                        <input className="lt-input" type="number" min={0} step="any" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkAgreedRate} onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setBkAgreedRate(v) }} placeholder="e.g. 1200" />
                      </div>
                      <div style={{ padding: '8px 8px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Rate Remark</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkRateRemark} onChange={e => setBkRateRemark(e.target.value)} placeholder="e.g. As per contract, TBD" />
                      </div>
                    </div>
                    {/* Delivery Term */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Delivery Term</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkDeliveryTerm} onChange={e => setBkDeliveryTerm(e.target.value)} placeholder="CY/CY" />
                      </div>
                    </div>
                    {/* HS Code */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>HS Code</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkHsCode} onChange={e => setBkHsCode(e.target.value)} placeholder="Harmonized System code (optional)" />
                      </div>
                    </div>
                    {/* Special Instructions header */}
                    <div style={{ padding: '7px 12px', background: 'rgba(15,143,168,0.12)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.4 }}>SPECIAL INSTRUCTIONS</span>
                    </div>
                    {/* Contract No + RA No (mutually exclusive) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: bkRaNumber ? 'var(--text-muted)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Contract No</div>
                      <div style={{ padding: '4px 8px', borderRight: '1px solid var(--border)', opacity: bkRaNumber ? 0.4 : 1 }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkContractNo} onChange={e => { setBkContractNo(e.target.value); if (e.target.value) setBkRaNumber('') }}
                          disabled={!!bkRaNumber} placeholder={bkRaNumber ? 'N/A (RA No is set)' : 'e.g. 26-751GAC'} />
                      </div>
                      <div style={{ padding: '8px 8px', background: bkContractNo ? 'var(--bg-card)' : 'rgba(22,163,74,0.06)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: bkContractNo ? 'var(--text-muted)' : '#16a34a', display: 'flex', alignItems: 'center' }}>RA No</div>
                      <div style={{ padding: '4px 8px', opacity: bkContractNo ? 0.4 : 1 }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0', fontWeight: 600 }}
                          value={bkRaNumber} onChange={e => { setBkRaNumber(e.target.value); if (e.target.value) setBkContractNo('') }}
                          disabled={!!bkContractNo} placeholder={bkContractNo ? 'N/A (Contract is set)' : 'Liner booking ref'} />
                      </div>
                    </div>
                    {bkContractNo && bkRaNumber && (
                      <div style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 600 }}>
                        A customer cannot have both Contract No and RA No. Please clear one.
                      </div>
                    )}
                    {/* Specific Routing */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Specific Routing</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkSpecificRouting} onChange={e => setBkSpecificRouting(e.target.value)} placeholder="e.g. via Singapore, avoid Suez" />
                      </div>
                    </div>
                    {/* BL Type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>BL Type</div>
                      <div style={{ padding: '6px 10px', display: 'flex', gap: 16, alignItems: 'center' }}>
                        {(['OBL', 'Seaway Bill'] as const).map(t => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                            <input type="radio" name="rp-bk-bl-type" checked={bkBlType === t} onChange={() => setBkBlType(t)} />{t}
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Booking Type */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', lineHeight: 1.3 }}>If MKL/SAF<br /><span style={{ fontWeight: 400 }}>(Spot/FAK)</span></div>
                      <div style={{ padding: '6px 10px', display: 'flex', gap: 16, alignItems: 'center' }}>
                        {(['Spot', 'FAK'] as const).map(t => (
                          <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                            <input type="radio" name="rp-bk-booking-type" checked={bkBookingType === t} onChange={() => setBkBookingType(t)} />{t} Booking
                          </label>
                        ))}
                      </div>
                    </div>
                    {/* Reefer Temp / PTI */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ padding: '8px 12px', background: isReefer ? 'rgba(14,165,233,0.08)' : 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: isReefer ? '#0ea5e9' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>Reefer/PTI</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkReeferTemp} onChange={e => setBkReeferTemp(e.target.value)}
                          placeholder={isReefer ? 'e.g. -18°C, PTI required' : 'N/A'} />
                      </div>
                    </div>
                    {/* Delivery Agent */}
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr' }}>
                      <div style={{ padding: '8px 12px', background: 'var(--bg-card)', borderRight: '1px solid var(--border)', fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>Delivery Agent</div>
                      <div style={{ padding: '4px 8px' }}>
                        <input className="lt-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px 0' }}
                          value={bkDeliveryAgent} onChange={e => setBkDeliveryAgent(e.target.value)} placeholder="Will advise / agent name" />
                      </div>
                    </div>
                  </div>
                  {/* Submit */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                    <button className="db-btn primary" style={{ background: '#0f8fa8', borderColor: '#0f8fa8' }} onClick={handleModalSubmit}>
                      {isCS
                        ? <><Ship size={12} /> Create Booking &amp; Send to Procurement</>
                        : <><Ship size={12} /> Assign RA Number &amp; Move to Booking</>
                      }
                    </button>
                  </div>
                </div>
              )
            })() : (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 24, boxShadow: '0 1px 2px rgba(15,23,42,0.03)' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 18, color: 'var(--text)' }}>{selectedItem.actionLabel}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>{selectedItem.subtitle}</div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 18, borderTop: '1px solid #eef2f6' }}>
                  <button
                    className="db-btn primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => handleAction(selectedItem)}
                  >
                    {selectedItem.actionLabel} <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Recently Pushed (below action card) */}
            {recentlyPushed.length > 0 && (
              <div style={{ marginTop: 30 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 12 }}>Recently completed</div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                  {recentlyPushed.slice(0, 5).map(a => (
                    <div key={a.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Check size={12} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 700 }}>{a.customer_name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.timestamp}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, marginLeft: 20 }}>{a.action}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ maxWidth: 420, margin: '60px auto 0', textAlign: 'center' }}>
            <Inbox size={40} style={{ color: 'var(--text-muted)', marginBottom: 14, opacity: 0.4 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: '#334155', marginBottom: 6 }}>All caught up</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>No items need your attention in this step.</div>
          </div>
        )}
      </div>
      </div>{/* end ws-split-body */}

      {/* Step Navigation Bar */}
      <div style={{
        position: 'sticky',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        overflowX: 'auto',
        zIndex: 10,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
      }}>
        {(() => {
          // Group consecutive steps that share a group tag
          const chunks: (StepDef | StepDef[])[] = []
          let ci = 0
          while (ci < roleSteps.length) {
            const s = roleSteps[ci]
            if (s.group) {
              const grp: StepDef[] = [s]
              while (ci + 1 < roleSteps.length && roleSteps[ci + 1].group === s.group) {
                grp.push(roleSteps[++ci])
              }
              chunks.push(grp)
            } else {
              chunks.push(s)
            }
            ci++
          }

          const renderStepBtn = (step: StepDef, compact?: boolean) => {
            const count = stepCounts[step.key] ?? 0
            const isActive = effectiveStep === step.key
            const isGroupAvailable = step.group ? (groupHasItems[step.group] ?? false) : false
            const isEmpty = count === 0 && !isGroupAvailable
            return (
              <button
                key={step.key}
                onClick={() => setActiveStep(step.key)}
                style={{
                  display: 'flex',
                  flexDirection: compact ? 'row' : 'column',
                  alignItems: 'center',
                  gap: compact ? 6 : 3,
                  padding: compact ? '3px 10px' : '6px 14px',
                  minWidth: compact ? undefined : 80,
                  border: 'none',
                  borderRadius: compact ? 6 : 10,
                  cursor: 'pointer',
                  background: isActive ? roleColor + '12' : 'transparent',
                  transition: 'background 0.15s',
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                <div style={{
                  width: compact ? 18 : 26,
                  height: compact ? 18 : 26,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: compact ? 9 : 11,
                  fontWeight: 700,
                  background: isActive ? roleColor : isEmpty ? 'rgba(0,0,0,0.06)' : roleColor + '18',
                  color: isActive ? '#fff' : isEmpty ? 'var(--text-muted)' : roleColor,
                  transition: 'all 0.15s',
                  flexShrink: 0,
                }}>
                  {step.stepNumber}
                </div>
                <span style={{
                  fontSize: compact ? 9 : 10,
                  fontWeight: isActive ? 700 : 600,
                  color: isActive ? roleColor : isEmpty ? 'var(--text-muted)' : 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s',
                }}>
                  {step.label}
                </span>
                {count > 0 && (
                  <span style={{
                    ...(compact ? {} : { position: 'absolute' as const, top: 2, right: 6 }),
                    minWidth: compact ? 14 : 16,
                    height: compact ? 14 : 16,
                    borderRadius: compact ? 7 : 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: compact ? 8 : 9,
                    fontWeight: 700,
                    background: isActive ? roleColor : '#ef4444',
                    color: '#fff',
                    padding: '0 3px',
                    lineHeight: 1,
                    marginLeft: compact ? 'auto' : undefined,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          }

          return chunks.map((chunk, idx) => {
            if (Array.isArray(chunk)) {
              return (
                <div key={`grp-${idx}`} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{
                    width: 3,
                    alignSelf: 'stretch',
                    background: `${roleColor}30`,
                    borderRadius: 2,
                    margin: '2px 0',
                  }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {chunk.map(s => renderStepBtn(s, true))}
                  </div>
                </div>
              )
            }
            return renderStepBtn(chunk as StepDef)
          })
        })()}
      </div>

      {/* Action Modal */}
      {actionModal && actionModal.actionKind !== 'booking-request' && actionModal.actionKind !== 'review-booking-request' && actionModal.actionKind !== 'confirm-liner-booking' && actionModal.actionKind !== 'attach-release-order' && actionModal.actionKind !== 'release-booking' && actionModal.actionKind !== 'send-draft-bl' && actionModal.actionKind !== 'record-cutoff' && actionModal.actionKind !== 'request-si' && actionModal.actionKind !== 'submit-si' && actionModal.actionKind !== 'send-pre-advice' && (
        <div className="lt-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="lt-modal" onClick={e => e.stopPropagation()} style={{ width: actionModal.actionKind === 'send-kyc' ? 660 : 520, padding: '28px 30px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'ui-monospace, monospace', marginBottom: 6 }}>{actionModal.refId}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{actionModal.actionLabel}</div>
              </div>
              <button className="lt-icon-btn" onClick={() => setActionModal(null)}><X size={14} /></button>
            </div>

            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 22 }}>
              {actionModal.title}
            </div>

            {/* Check Documents — KYC form (CS / Sales) */}
            {actionModal.actionKind === 'send-kyc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 }}>

                {/* ── Pre-fetched client registry data (only for KYC pending queue items) ── */}
                {actionModal.sourceData.kycClient && (() => {
                  const c: KycPendingClient = actionModal.sourceData.kycClient
                  const address = [c.addr_street_ln, c.addr_city, c.addr_country].filter(Boolean).join(', ')
                  return (
                    <div style={{ padding: '12px 14px', background: 'rgba(8,145,178,0.04)', border: '1px solid rgba(8,145,178,0.14)', borderLeft: '3px solid #0891b2', borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#0891b2', marginBottom: 10 }}>From Client Registry</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px 16px' }}>
                        {c.vat_no && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>VAT No.</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.vat_no}</div>
                          </div>
                        )}
                        {c.tin && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>TIN</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.tin}</div>
                          </div>
                        )}
                        {c.credit_limit != null && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Credit Limit</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{c.credit_limit.toLocaleString()}</div>
                          </div>
                        )}
                        {address && (
                          <div style={{ gridColumn: '1 / -1' }}>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Address</div>
                            <div style={{ fontSize: 13, color: 'var(--text)' }}>{address}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* ── Client Info ── */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Client Information</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                    <div>
                      <label className="lt-label">Customer</label>
                      <input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.04)' }} value={actionModal.customerName} disabled />
                    </div>
                    <div>
                      <label className="lt-label">BR Number <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} value={kycBrNumber} onChange={e => setKycBrNumber(e.target.value)} placeholder="e.g. PV 12345" autoFocus />
                    </div>
                    <div>
                      <label className="lt-label">Parent Organisation</label>
                      <input className="lt-input" style={{ width: '100%' }} value={kycParentOrg} onChange={e => setKycParentOrg(e.target.value)} placeholder="If subsidiary, enter parent name" />
                    </div>
                    <div>
                      <label className="lt-label">Client Type <span style={{ color: '#dc2626' }}>*</span></label>
                      <select className="lt-input" style={{ width: '100%' }} value={kycCliType} onChange={e => setKycCliType(e.target.value)}>
                        <option value="">Select type…</option>
                        <option value="Shipper">Shipper</option>
                        <option value="Buyer">Buyer</option>
                        <option value="Agent">Agent</option>
                        <option value="Trader">Trader</option>
                      </select>
                    </div>
                    <div>
                      <label className="lt-label">Currency <span style={{ color: '#dc2626' }}>*</span></label>
                      <select className="lt-input" style={{ width: '100%' }} value={kycCurrency} onChange={e => setKycCurrency(e.target.value)}>
                        <option value="USD">USD</option>
                        <option value="LKR">LKR</option>
                        <option value="EUR">EUR</option>
                        <option value="GBP">GBP</option>
                      </select>
                    </div>
                    <div>
                      <label className="lt-label">Document Submission Deadline <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="date" value={kycDeadline} onChange={e => setKycDeadline(e.target.value)} />
                    </div>
                    <div>
                      <label className="lt-label">Website</label>
                      <input className="lt-input" style={{ width: '100%' }} value={kycWebsite} onChange={e => setKycWebsite(e.target.value)} placeholder="https://..." />
                    </div>
                    <div>
                      <label className="lt-label">SVAT No.</label>
                      <input className="lt-input" style={{ width: '100%' }} value={kycSvatNo} onChange={e => setKycSvatNo(e.target.value)} placeholder="SVAT registration number" />
                    </div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <label className="lt-label">Tax Exemptions</label>
                      <input className="lt-input" style={{ width: '100%' }} value={kycTaxExemptions} onChange={e => setKycTaxExemptions(e.target.value)} placeholder="e.g. N/A, BOI exemption…" />
                    </div>
                  </div>
                </div>

                {/* ── Services Required ── */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Services Required</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px' }}>
                    {([
                      ['Sea Imports',    kycSeaImports,    setKycSeaImports],
                      ['Sea Exports',    kycSeaExports,    setKycSeaExports],
                      ['Trade Lanes',    kycTradeLanes,    setKycTradeLanes],
                      ['Forwarding',     kycForwarding,    setKycForwarding],
                      ['Cross Trade',    kycCrossTrade,    setKycCrossTrade],
                      ['Air Imports',    kycAirImports,    setKycAirImports],
                      ['Air Exports',    kycAirExports,    setKycAirExports],
                      ['General Cargo',    kycGeneralCargo,    setKycGeneralCargo],
                      ['Dangerous Goods',  kycDangerousGoods,  setKycDangerousGoods],
                      ['Perishable Goods', kycPerishableGoods, setKycPerishableGoods],
                    ] as [string, boolean, (v: boolean) => void][]).map(([label, val, setter]) => (
                      <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                        <input type="checkbox" checked={val} onChange={e => setter(e.target.checked)} style={{ width: 14, height: 14, accentColor: '#0891b2', cursor: 'pointer' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* ── Document Checklist ── */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>Document Checklist</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', background: 'rgba(8,145,178,0.04)', borderRadius: 8, border: '1px solid rgba(8,145,178,0.12)' }}>
                    {([
                      ['BR Form',           kycDocBrForm,   setKycDocBrForm],
                      ['VAT Certificate',   kycDocVatCert,  setKycDocVatCert],
                      ['SVAT Certificate',  kycDocSvatCert, setKycDocSvatCert],
                      ['TIN Certificate',   kycDocTinCert,  setKycDocTinCert],
                      ['Form 20',           kycDocForm20,   setKycDocForm20],
                    ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
                      <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={val === 'true'}
                          onChange={e => setter(e.target.checked ? 'true' : 'false')}
                          style={{ width: 15, height: 15, accentColor: '#16a34a', cursor: 'pointer' }}
                        />
                        <span style={{ color: val === 'true' ? '#16a34a' : 'var(--text-secondary)', fontWeight: val === 'true' ? 600 : 400 }}>
                          {label}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: val === 'true' ? '#16a34a' : 'var(--text-muted)', fontWeight: 600 }}>
                          {val === 'true' ? 'Received' : 'Pending'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="lt-label">Notes (optional)</label>
                  <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Any additional notes…" />
                </div>
              </div>
            )}

            {/* Verify KYC form (Finance) */}
            {actionModal.actionKind === 'verify-kyc' && (() => {
              const kycReq: KycRequestRecord | undefined = actionModal.sourceData?.kycRequest
              const docLabel = (label: string, val?: string) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 3, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700,
                    background: val === 'true' ? '#16a34a' : '#dc2626', color: '#fff',
                  }}>{val === 'true' ? '✓' : '✗'}</span>
                  <span style={{ color: val === 'true' ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
                </div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Client details */}
                  {kycReq && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Client Information</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                        {kycReq.br_number && <div><span style={{ color: 'var(--text-muted)' }}>BR No: </span>{kycReq.br_number}</div>}
                        {kycReq.cli_type && <div><span style={{ color: 'var(--text-muted)' }}>Type: </span>{kycReq.cli_type}</div>}
                        {kycReq.currency && <div><span style={{ color: 'var(--text-muted)' }}>Currency: </span>{kycReq.currency}</div>}
                        {kycReq.parent_organization && <div><span style={{ color: 'var(--text-muted)' }}>Parent Org: </span>{kycReq.parent_organization}</div>}
                        {kycReq.website && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)' }}>Website: </span>{kycReq.website}</div>}
                        {kycReq.document_submission_deadline && <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--text-muted)' }}>Doc Deadline: </span>{kycReq.document_submission_deadline}</div>}
                      </div>
                      {/* Business scope */}
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>Business Scope</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                        {[
                          ['Sea Imports', kycReq.sea_imports],
                          ['Sea Exports', kycReq.sea_exports],
                          ['Air Imports', kycReq.air_imports],
                          ['Air Exports', kycReq.air_exports],
                          ['Trade Lanes', kycReq.trade_lanes],
                          ['Forwarding', kycReq.forwarding],
                          ['Cross Trade', kycReq.cross_trade],
                          ['General Cargo', kycReq.general_cargo],
                          ['Dangerous Goods', kycReq.dangerous_goods],
                          ['Perishables', kycReq.perishable_goods],
                        ].map(([label, val]) => val ? (
                          <span key={String(label)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: 'rgba(15,143,168,0.12)', color: '#0f8fa8', fontWeight: 600 }}>{String(label)}</span>
                        ) : null)}
                      </div>
                    </div>
                  )}
                  {/* Document checklist */}
                  {kycReq?.docs && (
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Document Checklist</div>
                      {docLabel('BR Form', kycReq.docs.br_form)}
                      {docLabel('VAT Certificate', kycReq.docs.vat_certificate)}
                      {docLabel('SVAT Certificate', kycReq.docs.svat_certificate)}
                      {docLabel('TIN Certificate', kycReq.docs.tin_certificate)}
                      {docLabel('Form 20', kycReq.docs.form20)}
                    </div>
                  )}
                  {/* Decision */}
                  <div>
                    <label className="lt-label">Decision</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className={`db-btn ${formDecision === 'approve' ? 'primary' : ''}`}
                        style={formDecision === 'approve' ? { background: '#16a34a', borderColor: '#16a34a' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setFormDecision('approve')}
                      >
                        <ShieldCheck size={13} style={{ marginRight: 4 }} /> Verified
                      </button>
                      <button
                        className={`db-btn ${formDecision === 'reject' ? 'primary' : ''}`}
                        style={formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setFormDecision('reject')}
                      >
                        <AlertTriangle size={13} style={{ marginRight: 4 }} /> Flag Issues
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="lt-label">{formDecision === 'reject' ? 'Issues Found' : 'Verification Note (optional)'}</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder={formDecision === 'reject' ? 'Describe the issues found...' : 'Optional verification notes...'} />
                  </div>
                </div>
              )
            })()}

            {/* Prepare Quotation (Sales) */}
            {actionModal.actionKind === 'prepare-quotation' && (() => {
              const ctx = actionModal.previousContext
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.18)', borderRadius: 8, fontSize: 12, color: '#0f8fa8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Edit3 size={14} />
                    Review and edit the quotation below, then click <strong>Save Quotation</strong>. The quotation will appear in the Send Quote step for delivery.
                  </div>

                  {ctx && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          Rate brief from {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                      {ctx.notes && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {ctx.notes.split('|').filter((s: string) => /rates?:/i.test(s)).map((s: string) => s.trim()).join(' · ') || ctx.notes.split('|').slice(0, 3).map((s: string) => s.trim()).join(' · ')}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <label className="lt-label" style={{ margin: 0 }}>Quotation Message</label>
                      <button
                        type="button"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${quoteCopied ? 'rgba(22,163,74,0.4)' : 'rgba(15,143,168,0.3)'}`, background: quoteCopied ? 'rgba(22,163,74,0.08)' : 'rgba(15,143,168,0.06)', color: quoteCopied ? '#16a34a' : '#0f8fa8', cursor: 'pointer', transition: 'all 0.2s' }}
                        onClick={() => {
                          navigator.clipboard.writeText(quotationContent).then(() => {
                            setQuoteCopied(true)
                            setTimeout(() => setQuoteCopied(false), 2500)
                          })
                        }}
                      >
                        {quoteCopied ? <><ClipboardCheck size={11} /> Copied!</> : <><Copy size={11} /> Copy to Clipboard</>}
                      </button>
                    </div>
                    <textarea
                      className="lt-input"
                      style={{ width: '100%', minHeight: 320, fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.6, resize: 'vertical' }}
                      value={quotationContent}
                      onChange={e => setQuotationContent(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="lt-label">Notes for CS (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any delivery instructions for CS..." />
                  </div>
                </div>
              )
            })()}

            {/* Send to Customer (CS) */}
            {actionModal.actionKind === 'send-to-customer' && (() => {
              const ctx = actionModal.previousContext
              // Extract quotation text from previous activity log
              const quotationText = ctx?.notes?.match(/Quotation:\n([\s\S]+)/)?.[1] ?? ''
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {ctx && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                    </div>
                  )}

                  {/* Quotation preview */}
                  {quotationText && (
                    <div className="ws-doc-preview">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                        <FileText size={14} style={{ color: '#0f8fa8' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Quotation Document</span>
                      </div>
                      <div className="ws-doc-body" style={{ whiteSpace: 'pre-wrap', fontSize: 11, lineHeight: 1.5, maxHeight: 180, overflowY: 'auto' }}>
                        {quotationText}
                      </div>
                    </div>
                  )}

                  {/* Send method toggle */}
                  <div>
                    <label className="lt-label">Send Method</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className={`db-btn ${sendMethod === 'email' ? 'primary' : ''}`}
                        style={sendMethod !== 'email' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setSendMethod('email')}
                      >
                        <Mail size={13} style={{ marginRight: 4 }} /> Email
                      </button>
                      <button
                        className={`db-btn ${sendMethod === 'whatsapp' ? 'primary' : ''}`}
                        style={sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setSendMethod('whatsapp')}
                      >
                        <MessageCircle size={13} style={{ marginRight: 4 }} /> WhatsApp
                      </button>
                    </div>
                  </div>

                  {/* Email fields */}
                  {sendMethod === 'email' && (
                    <div>
                      <label className="lt-label">Customer Email <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="email"
                        value={customerContactEmail} onChange={e => setCustomerContactEmail(e.target.value)}
                        placeholder="customer@example.com" autoFocus />
                    </div>
                  )}

                  {/* WhatsApp fields */}
                  {sendMethod === 'whatsapp' && (
                    <>
                      <div>
                        <label className="lt-label">Customer WhatsApp Number</label>
                        <input className="lt-input" style={{ width: '100%' }}
                          value={customerContactPhone} onChange={e => setCustomerContactPhone(e.target.value)}
                          placeholder="+94 7X XXX XXXX" autoFocus />
                      </div>
                      <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                          <input
                            type="checkbox"
                            checked={waConfirmed}
                            onChange={e => setWaConfirmed(e.target.checked)}
                            style={{ marginTop: 2 }}
                          />
                          <span>
                            I confirm that I have sent this quotation to the customer via WhatsApp.
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              No WhatsApp integration is available — this is a manual confirmation.
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any additional notes..." />
                  </div>
                </div>
              )
            })()}

            {/* Customer response form */}
            {actionModal.actionKind === 'customer-response' && (() => {
              const ctx = actionModal.previousContext
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {ctx && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                    </div>
                  )}

                  <div>
                    <label className="lt-label">Customer Decision</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className={`db-btn ${customerDecision === 'accepted' ? 'primary' : ''}`}
                        style={customerDecision === 'accepted' ? { background: '#16a34a', borderColor: '#16a34a' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setCustomerDecision('accepted')}
                      >
                        <Check size={13} style={{ marginRight: 4 }} /> Accepted
                      </button>
                      <button
                        className={`db-btn ${customerDecision === 'rejected' ? 'primary' : ''}`}
                        style={customerDecision === 'rejected' ? { background: '#dc2626', borderColor: '#dc2626' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setCustomerDecision('rejected')}
                      >
                        <X size={13} style={{ marginRight: 4 }} /> Rejected
                      </button>
                    </div>
                  </div>

                  {/* Quotation option selection — shown only when accepted */}
                  {customerDecision === 'accepted' && (
                    <div>
                      <label className="lt-label">Accepted Option</label>
                      {quotationOptionsLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                          <Loader2 size={13} className="spin" /> Loading options…
                        </div>
                      ) : quotationOptions.length === 0 ? (
                        <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                          No options found for this quotation.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                          {quotationOptions.map(opt => {
                            const isSelected = selectedOptionRateId === opt.rate_id
                            return (
                              <button
                                key={opt.option_id}
                                type="button"
                                onClick={() => setSelectedOptionRateId(opt.rate_id)}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                  border: isSelected ? '2px solid #16a34a' : '1px solid var(--border)',
                                  background: isSelected ? 'rgba(22,163,74,0.06)' : 'var(--bg-card)',
                                  textAlign: 'left', width: '100%',
                                }}
                              >
                                <div style={{
                                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                  border: isSelected ? '5px solid #16a34a' : '2px solid var(--border)',
                                  background: 'var(--bg)',
                                }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                                    Option {opt.option_id}
                                  </div>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                                    {opt.option_currency ?? 'USD'} {opt.amt != null ? Number(opt.amt).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                                    {opt.rate_id != null && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>Rate #{opt.rate_id}</span>}
                                  </div>
                                </div>
                                {isSelected && <Check size={14} style={{ color: '#16a34a', flexShrink: 0 }} />}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="lt-label">{customerDecision === 'rejected' ? 'Rejection Reason' : 'Notes'} (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder={customerDecision === 'rejected' ? 'Reason for rejection...' : 'Any follow-up notes...'} />
                  </div>
                </div>
              )
            })()}


            {/* Confirm booking form — Procurement books via InttraAPI */}
            {actionModal.actionKind === 'confirm-booking' && (() => {
              const { booking: cbkg } = actionModal.sourceData
              const ctx = actionModal.previousContext
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {ctx && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                      {ctx.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{ctx.notes}</div>}
                    </div>
                  )}

                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{cbkg.customer_name}</strong> — {cbkg.origin} → {cbkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {cbkg.quantity}x {cbkg.container_type} · {cbkg.shipping_line || 'Any liner'}
                    </div>
                  </div>

                  {/* Vessel / voyage entry */}
                  <div>
                    <label className="lt-label">Vessel Name</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formVessel} onChange={e => setFormVessel(e.target.value)} placeholder="e.g. Maersk Seletar" />
                  </div>
                  <div>
                    <label className="lt-label">Voyage Number</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formVoyage} onChange={e => setFormVoyage(e.target.value)} placeholder="e.g. VOY-2026-042" />
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Any additional notes..." />
                  </div>
                </div>
              )
            })()}

            {/* Submit SI — now inline, see ternary chain above */}

            {/* BL Approval modal */}
            {actionModal.actionKind === 'bl-approval' && (() => {
              const { booking: baBkg } = actionModal.sourceData
              const isDtd = baBkg.delivery_type === 'door-to-door'
              const blType = isDtd ? 'House BL' : 'Draft BL'
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{baBkg.customer_name}</strong> — {baBkg.origin} → {baBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {baBkg.quantity}x {baBkg.container_type} · {baBkg.shipping_line || 'No liner'}{isDtd ? ' · Door-to-Door' : ''}
                    </div>
                  </div>

                  {/* Cutoff dates */}
                  {(baBkg.si_cutoff_date || baBkg.bl_cutoff_date) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      {baBkg.si_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{baBkg.si_cutoff_date}</strong>
                        </div>
                      )}
                      {baBkg.bl_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{baBkg.bl_cutoff_date}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {actionModal.previousContext && (
                    <div className="ws-context-card" style={{ marginTop: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <User size={11} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                          {empName(actionModal.previousContext.actor_id)} ({ROLE_LABELS[actionModal.previousContext.actor_role]})
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{actionModal.previousContext.action}</div>
                    </div>
                  )}

                  <div>
                    <label className="lt-label">Customer Response to {blType}</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className={`db-btn ${blDecision === 'approved' ? 'primary' : ''}`}
                        style={blDecision === 'approved' ? { background: '#16a34a', borderColor: '#16a34a' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setBlDecision('approved')}
                      >
                        <Check size={13} style={{ marginRight: 4 }} /> Approved
                      </button>
                      <button
                        className={`db-btn ${blDecision === 'changes-requested' ? 'primary' : ''}`}
                        style={blDecision === 'changes-requested' ? { background: '#d97706', borderColor: '#d97706' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setBlDecision('changes-requested')}
                      >
                        <Edit3 size={13} style={{ marginRight: 4 }} /> Changes Requested
                      </button>
                    </div>
                  </div>

                  {blDecision === 'changes-requested' && (
                    <div>
                      <label className="lt-label">Change Details <span style={{ color: '#dc2626' }}>*</span></label>
                      <textarea
                        className="lt-input"
                        style={{ width: '100%', minHeight: 80, resize: 'vertical' }}
                        value={formNote}
                        onChange={e => setFormNote(e.target.value)}
                        placeholder="Describe the changes requested by the customer..."
                      />
                    </div>
                  )}

                  {blDecision === 'approved' && (
                    <div>
                      <label className="lt-label">Notes (optional)</label>
                      <input className="lt-input" style={{ width: '100%' }} value={formNote}
                        onChange={e => setFormNote(e.target.value)}
                        placeholder="Any notes..." />
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Record Master BL modal */}
            {actionModal.actionKind === 'record-master-bl' && (() => {
              const { booking: mbBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{mbBkg.customer_name}</strong> — {mbBkg.origin} → {mbBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {mbBkg.quantity}x {mbBkg.container_type} · {mbBkg.shipping_line || 'No liner'} · Door-to-Door
                    </div>
                  </div>

                  {/* Cutoff dates */}
                  {(mbBkg.si_cutoff_date || mbBkg.bl_cutoff_date) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      {mbBkg.si_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{mbBkg.si_cutoff_date}</strong>
                        </div>
                      )}
                      {mbBkg.bl_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{mbBkg.bl_cutoff_date}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ padding: '8px 12px', background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <strong>Master BL</strong> — Issued by liner. Synergy is listed as shipper; destination agent as consignee.
                  </div>

                  <div>
                    <label className="lt-label">Master BL Number <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} value={masterBlNumber}
                      onChange={e => setMasterBlNumber(e.target.value)}
                      placeholder="e.g. MAEU123456789" autoFocus />
                  </div>

                  <div>
                    <label className="lt-label">Shipper (on Master BL)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={masterBlShipper}
                      onChange={e => setMasterBlShipper(e.target.value)}
                      placeholder="Synergy Shipping & Logistics" />
                  </div>

                  <div>
                    <label className="lt-label">Consignee — Destination Agent <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} value={masterBlConsignee}
                      onChange={e => setMasterBlConsignee(e.target.value)}
                      placeholder="e.g. Rotterdam Forwarding BV" />
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any notes..." />
                  </div>
                </div>
              )
            })()}

            {/* Create House BL modal */}
            {actionModal.actionKind === 'create-house-bl' && (() => {
              const { booking: hbBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{hbBkg.customer_name}</strong> — {hbBkg.origin} → {hbBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {hbBkg.quantity}x {hbBkg.container_type} · {hbBkg.shipping_line || 'No liner'} · Door-to-Door
                    </div>
                  </div>

                  {/* Cutoff dates */}
                  {(hbBkg.si_cutoff_date || hbBkg.bl_cutoff_date) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      {hbBkg.si_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{hbBkg.si_cutoff_date}</strong>
                        </div>
                      )}
                      {hbBkg.bl_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{hbBkg.bl_cutoff_date}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Master BL reference */}
                  <div style={{ padding: '8px 12px', background: 'rgba(13,148,136,0.06)', border: '1px solid rgba(13,148,136,0.15)', borderRadius: 8, fontSize: 11 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Master BL:</span>{' '}
                    <strong style={{ color: 'var(--text-primary)' }}>{hbBkg.master_bl_number || 'N/A'}</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Shipper:</span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{hbBkg.master_bl_shipper || 'N/A'}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>Consignee:</span>{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{hbBkg.master_bl_consignee || 'N/A'}</span>
                  </div>

                  <div style={{ padding: '8px 12px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <strong>House BL</strong> — Created by CS with actual shipper and consignee. Sent to customer for approval.
                  </div>

                  <div>
                    <label className="lt-label">House BL Number <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} value={houseBlNumber}
                      onChange={e => setHouseBlNumber(e.target.value)}
                      placeholder="e.g. SYNHBL-2026-001" autoFocus />
                  </div>

                  <div>
                    <label className="lt-label">Shipper (Actual)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={houseBlShipper}
                      onChange={e => setHouseBlShipper(e.target.value)}
                      placeholder="Actual shipper name" />
                  </div>

                  <div>
                    <label className="lt-label">Consignee (Actual) <span style={{ color: '#dc2626' }}>*</span></label>
                    <input className="lt-input" style={{ width: '100%' }} value={houseBlConsignee}
                      onChange={e => setHouseBlConsignee(e.target.value)}
                      placeholder="Actual consignee name" />
                  </div>

                  {/* Send House BL to customer */}
                  <div>
                    <label className="lt-label">Send House BL to Customer via</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                      <button
                        className={`db-btn ${sendMethod === 'email' ? 'primary' : ''}`}
                        style={sendMethod !== 'email' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setSendMethod('email')}
                      >
                        <Mail size={13} style={{ marginRight: 4 }} /> Email
                      </button>
                      <button
                        className={`db-btn ${sendMethod === 'whatsapp' ? 'primary' : ''}`}
                        style={sendMethod === 'whatsapp' ? { background: '#25d366', borderColor: '#25d366' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        onClick={() => setSendMethod('whatsapp')}
                      >
                        <MessageCircle size={13} style={{ marginRight: 4 }} /> WhatsApp
                      </button>
                    </div>
                  </div>

                  {sendMethod === 'email' && (
                    <div>
                      <label className="lt-label">Customer Email <span style={{ color: '#dc2626' }}>*</span></label>
                      <input className="lt-input" style={{ width: '100%' }} type="email"
                        value={customerContactEmail} onChange={e => setCustomerContactEmail(e.target.value)}
                        placeholder="customer@example.com" />
                    </div>
                  )}

                  {sendMethod === 'whatsapp' && (
                    <>
                      <div>
                        <label className="lt-label">Customer WhatsApp Number</label>
                        <input className="lt-input" style={{ width: '100%' }}
                          value={customerContactPhone} onChange={e => setCustomerContactPhone(e.target.value)}
                          placeholder="+94 7X XXX XXXX" />
                      </div>
                      <div style={{ padding: '10px 14px', background: 'rgba(37,211,102,0.06)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                          <input type="checkbox" checked={waConfirmed} onChange={e => setWaConfirmed(e.target.checked)} style={{ marginTop: 2 }} />
                          <span>
                            I confirm that I have sent the House BL to the customer via WhatsApp.
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              No WhatsApp integration — manual confirmation.
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any notes..." />
                  </div>
                </div>
              )
            })()}



            {/* Quote approval form */}
            {actionModal.actionKind === 'approve-quote' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label className="lt-label">Decision</label>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      className={`db-btn ${formDecision === 'approve' ? 'primary' : ''}`}
                      style={formDecision !== 'approve' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                      onClick={() => setFormDecision('approve')}
                    >
                      Approve
                    </button>
                    <button
                      className={`db-btn ${formDecision === 'reject' ? 'primary' : ''}`}
                      style={formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } : { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      onClick={() => setFormDecision('reject')}
                    >
                      Reject
                    </button>
                  </div>
                </div>
                <div>
                  <label className="lt-label">{formDecision === 'reject' ? 'Rejection Reason' : 'Approval Note (optional)'}</label>
                  <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder={formDecision === 'reject' ? 'Reason for rejection...' : 'Optional note...'} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid #eef2f6' }}>
              <button className="db-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className="db-btn primary"
                disabled={
                  (actionModal.actionKind === 'send-kyc' && (!kycBrNumber.trim() || !kycCliType || !kycDeadline)) ||
                  (actionModal.actionKind === 'prepare-quotation' && !quotationContent.trim()) ||
                  (actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'confirm-booking' && !formVessel.trim()) ||
                  (actionModal.actionKind === 'release-booking' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'bl-approval' && blDecision === 'changes-requested' && !formNote.trim()) ||
                  (actionModal.actionKind === 'record-master-bl' && (!masterBlNumber.trim() || !masterBlConsignee.trim())) ||
                  (actionModal.actionKind === 'create-house-bl' && (!houseBlNumber.trim() || !houseBlConsignee.trim())) ||
                  (actionModal.actionKind === 'create-house-bl' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'create-house-bl' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' && quotationOptions.length > 0 && selectedOptionRateId == null) ||
                  kycSending || quotationSending
                }
                style={
                  actionModal.actionKind === 'verify-kyc' && formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'verify-kyc' ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'approve-quote' && formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'prepare-quotation' ? { background: '#0f8fa8', borderColor: '#0f8fa8' } :
                  actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' && customerContactEmail.includes('@') ? {} :
                  actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'customer-response' && customerDecision === 'rejected' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'booking-request' ? { background: '#0f8fa8', borderColor: '#0f8fa8' } :
                  actionModal.actionKind === 'confirm-booking' && formVessel.trim() ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'confirm-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'email' && customerContactEmail.includes('@') ? {} :
                  actionModal.actionKind === 'release-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'bl-approval' && blDecision === 'approved' ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'bl-approval' && blDecision === 'changes-requested' && formNote.trim() ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'bl-approval' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'record-master-bl' && masterBlNumber.trim() && masterBlConsignee.trim() ? { background: '#0d9488', borderColor: '#0d9488' } :
                  actionModal.actionKind === 'record-master-bl' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'create-house-bl' && sendMethod === 'whatsapp' && waConfirmed && houseBlNumber.trim() && houseBlConsignee.trim() ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'create-house-bl' && sendMethod === 'email' && customerContactEmail.includes('@') && houseBlNumber.trim() && houseBlConsignee.trim() ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'create-house-bl' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'send-kyc' && (!kycBrNumber.trim() || !kycCliType || !kycDeadline)) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'send-kyc') ? { background: '#0891b2', borderColor: '#0891b2' } :
                  (actionModal.actionKind === 'prepare-quotation' && !quotationContent.trim()) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'send-to-customer' && ((sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) || (sendMethod === 'whatsapp' && !waConfirmed))) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  {}
                }
                onClick={handleModalSubmit}
              >
                {kycSending ? <><Loader2 size={12} className="spin" /> Sending...</> :
                 quotationSending ? <><Loader2 size={12} className="spin" /> Sending...</> :
                 actionModal.actionKind === 'send-kyc' ? <><ShieldCheck size={12} /> Submit KYC Request</> :
                 actionModal.actionKind === 'verify-kyc' && formDecision === 'reject' ? 'Flag & Return to CS' :
                 actionModal.actionKind === 'verify-kyc' ? <><ShieldCheck size={12} /> Verify &amp; Push</> :
                 actionModal.actionKind === 'prepare-quotation' ? <><ClipboardCheck size={12} /> Save Quotation</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' ? <><Mail size={12} /> Send via Email</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' ? <><Check size={12} /> Customer Accepted — Proceed to Booking</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'rejected' ? <><X size={12} /> Customer Rejected — Close Inquiry</> :
                 actionModal.actionKind === 'booking-request' ? <><Ship size={12} /> Create Booking &amp; Send to Procurement</> :
                 actionModal.actionKind === 'confirm-booking' && formVessel.trim() ?<><Ship size={12} /> Confirm Manually &amp; Send to CS</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'email' ? <><Mail size={12} /> Release &amp; Send via Email</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Release &amp; Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'bl-approval' && blDecision === 'approved' ? <><Check size={12} /> BL Approved</> :
                 actionModal.actionKind === 'bl-approval' && blDecision === 'changes-requested' ? <><Edit3 size={12} /> Record Changes Requested</> :
                 actionModal.actionKind === 'record-master-bl' ? <><FileText size={12} /> Record Master BL</> :
                 actionModal.actionKind === 'create-house-bl' && sendMethod === 'email' ? <><Mail size={12} /> Create &amp; Send House BL via Email</> :
                 actionModal.actionKind === 'create-house-bl' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Create &amp; Confirm House BL Sent</> :
                 actionModal.actionKind === 'approve-quote' && formDecision === 'reject' ? 'Reject' :
                 <>Confirm &amp; Push <ChevronRight size={12} /></>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Rate — now a full page at /record-rate */}


    </div>
  )
}
