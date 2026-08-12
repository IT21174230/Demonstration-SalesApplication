import React, { useState, useMemo, useEffect } from 'react'
import {
  Inbox, ChevronRight, AlertTriangle, Check, Paperclip, ClipboardPaste,
  FileText, Ship, ShieldCheck, X, User, Mail, Loader2,
  Globe, MessageCircle, Edit3, Copy, ClipboardCheck,
} from 'lucide-react'
import {
  EMPLOYEES, WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS,
  isSpotInquiry, daysUntil,
  type Inquiry, type Booking, type Quote, type Customer,
  type ActivityEntry, type WorkflowStage,
  type QuoteStatus, type KycStatus,
  type ContainerLine, type LinerRecord, type ClientRecord,
} from '../../types'
import { useRole } from '../../RoleContext'
import { apiSendQuotation, apiGetLiners, apiCreateKycRequest, apiGetClientKycStatus, apiCreateQuotation, apiMarkQuotationSent, apiRecordQuotationResponse, apiUpdateKycStage, type KycPendingClient, type KycRequestRecord } from '../../api'

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
  onReleaseBooking: (bookingId: string, note: string) => void
  onAcknowledgeProcurement: (bookingId: string) => void
  onCreateBooking: (payload: {
    customer_name: string; quote_id: string; shipping_line: string;
    container_type: string; quantity: number; origin: string; destination: string;
    is_urgent: boolean; booked_by: number; notes: string; delivery_type?: 'port-to-port' | 'door-to-door';
  }) => string
  onSetBookingSiCutoff: (bookingId: string, date: string) => void
  onMarkSiRequested: (bookingId: string) => void
  onSetBookingBlCutoff: (bookingId: string, date: string) => void
  onMarkSiSubmitted: (bookingId: string) => void
  onMarkDraftBlSent: (bookingId: string) => void
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
}

const CS_STEPS: StepDef[] = [
  { key: 'cs-inquiry',    label: 'Inquiry',     actionKinds: ['advance-workflow'],   stepNumber: 1 },
  { key: 'cs-kyc',        label: 'KYC',         actionKinds: ['send-kyc'],           stepNumber: 2 },
  { key: 'cs-rates',      label: 'Rates',       actionKinds: ['check-rates'],        stepNumber: 3 },
  { key: 'cs-send-quote', label: 'Send Quote',  actionKinds: ['send-to-customer'],   stepNumber: 4 },
  { key: 'cs-response',   label: 'Response',    actionKinds: ['customer-response'],  stepNumber: 5 },
  // Steps 6–14 hidden from CS step bar (comment back in to re-enable)
  // { key: 'cs-booking',    label: 'Booking',     actionKinds: ['booking-request'],    stepNumber: 6 },
  // { key: 'cs-release',    label: 'Release',     actionKinds: ['release-booking'],    stepNumber: 7 },
  // { key: 'cs-cutoff',     label: 'Cutoff',      actionKinds: ['record-cutoff'],      stepNumber: 8 },
  // { key: 'cs-si',         label: 'SI Reminder', actionKinds: ['request-si'],         stepNumber: 9 },
  // { key: 'cs-submit-si',  label: 'Submit SI',   actionKinds: ['submit-si'],          stepNumber: 10 },
  // { key: 'cs-draft-bl',   label: 'Draft BL',    actionKinds: ['send-draft-bl'],      stepNumber: 11 },
  // { key: 'cs-master-bl',  label: 'Master BL',   actionKinds: ['record-master-bl'],   stepNumber: 12 },
  // { key: 'cs-house-bl',   label: 'House BL',    actionKinds: ['create-house-bl'],    stepNumber: 13 },
  // { key: 'cs-bl-approval',label: 'BL Approval', actionKinds: ['bl-approval'],        stepNumber: 14 },
]

const FINANCE_STEPS: StepDef[] = [
  { key: 'fin-kyc',       label: 'KYC Review',  actionKinds: ['verify-kyc'],         stepNumber: 1 },
  // { key: 'fin-approvals', label: 'Approvals',   actionKinds: ['approve-quote'],      stepNumber: 2 },
]

const PROCUREMENT_STEPS: StepDef[] = [
  { key: 'proc-rates',    label: 'Rate Check',  actionKinds: ['check-inttra-rates'],       stepNumber: 1 },
  // { key: 'proc-book',     label: 'Book Liner',  actionKinds: ['confirm-booking'],          stepNumber: 2 },
  // { key: 'proc-urgent',   label: 'Urgent',      actionKinds: ['acknowledge-procurement'],  stepNumber: 3 },
]

const SALES_STEPS: StepDef[] = [
  { key: 'sales-inquiry',    label: 'Inquiry',           actionKinds: ['advance-workflow'],    stepNumber: 1 },
  { key: 'sales-kyc',        label: 'KYC',               actionKinds: ['send-kyc'],            stepNumber: 2 },
  { key: 'sales-rates',      label: 'Rates',             actionKinds: ['check-rates'],         stepNumber: 3 },
  { key: 'sales-prep-quote', label: 'Prepare Quotation', actionKinds: ['prepare-quotation'],   stepNumber: 4 },
  { key: 'sales-response',   label: 'Response',          actionKinds: ['customer-response'],   stepNumber: 5 },
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
  { key: 'adm-urgent',      label: 'Urgent',       actionKinds: ['acknowledge-procurement'], stepNumber: 12 },
  { key: 'adm-release',     label: 'Release',      actionKinds: ['release-booking'],         stepNumber: 13 },
  { key: 'adm-cutoff',      label: 'Cutoff',       actionKinds: ['record-cutoff'],           stepNumber: 14 },
  { key: 'adm-si',          label: 'SI Reminder',  actionKinds: ['request-si'],              stepNumber: 15 },
  { key: 'adm-submit-si',   label: 'Submit SI',    actionKinds: ['submit-si'],               stepNumber: 16 },
  { key: 'adm-draft-bl',    label: 'Draft BL',     actionKinds: ['send-draft-bl'],           stepNumber: 17 },
  { key: 'adm-master-bl',   label: 'Master BL',    actionKinds: ['record-master-bl'],        stepNumber: 18 },
  { key: 'adm-house-bl',    label: 'House BL',     actionKinds: ['create-house-bl'],         stepNumber: 19 },
  { key: 'adm-bl-approval', label: 'BL Approval',  actionKinds: ['bl-approval'],             stepNumber: 20 },
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
  onGoTo, onAdvanceWorkflow, onConfirmBooking, onReleaseBooking,
  onAcknowledgeProcurement, onCreateBooking, onSetBookingSiCutoff, onMarkSiRequested,
  onSetBookingBlCutoff, onMarkSiSubmitted, onMarkDraftBlSent, onSetBlStatus,
  onRecordMasterBl, onCreateHouseBl,
  onSetQuoteStatus, onUpdateCustomerKyc,
  onAutoAdvanceForCustomer, onLogActivity, onFlash, onStartRateCheck,
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
  // Send-to-customer state (CS sends via Email or WhatsApp)
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email')
  const [waConfirmed, setWaConfirmed] = useState(false)
  const [customerContactEmail, setCustomerContactEmail] = useState('')
  const [customerContactPhone, setCustomerContactPhone] = useState('')
  const [quotationSending, setQuotationSending] = useState(false)
  // Customer response state (accept / reject)
  const [customerDecision, setCustomerDecision] = useState<'accepted' | 'rejected'>('accepted')
  // Backend quotation ID — set in prepare-quotation, used in customer-response
  const [lastQuotationId, setLastQuotationId] = useState<number | null>(null)
  // Booking request form state
  const [bkShippingLine, setBkShippingLine] = useState('')
  const [bkContainerType, setBkContainerType] = useState("20'GP")
  const [bkQuantity, setBkQuantity] = useState(1)
  const [bkIsUrgent, setBkIsUrgent] = useState(false)
  const [bkAttachmentName, setBkAttachmentName] = useState('')
  const [_bkAttachmentData, setBkAttachmentData] = useState('')

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
  // Submit SI to liner state
  const [siContent, setSiContent] = useState('')
  const [siFileName, setSiFileName] = useState('')
  const [siMode, setSiMode] = useState<'paste' | 'upload'>('paste')
  const [inttraSiLoading, setInttraSiLoading] = useState(false)
  // Draft BL state
  const [draftBlContent, setDraftBlContent] = useState('')
  const [draftBlFileName, setDraftBlFileName] = useState('')
  const [draftBlMode, setDraftBlMode] = useState<'paste' | 'upload'>('paste')
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

  // Step navigation state — initialStep lets the parent jump directly to a specific step on mount
  const [activeStep, setActiveStep] = useState<string | null>(initialStep ?? null)
  useEffect(() => { setActiveStep(null) }, [activeRole])

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

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
      // CS and Sales both handle the full inquiry workflow (CS-roled and Sales-roled stages)
      const isCSOrSales = role === 'CS' || role === 'Sales'
      if (role && stage.role !== role && !(isCSOrSales && (stage.role === 'CS' || stage.role === 'Sales'))) continue
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
        let actionLabel = `Push to ${ROLE_LABELS[resolvedNextStage.role]}`

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
          title: `Confirm liner space for ${bkg.customer_name}`,
          subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · ${bkg.shipping_line}`,
          urgentFlag: bkg.is_urgent,
          createdAt: bkg.created_at,
          previousContext: findContext(bkg.id),
          actionLabel: 'Confirm Liner',
          actionKind: 'confirm-booking',
          sourceData: { booking: bkg },
        })
      }

      if (bkg.status === 'Liner Confirmed' && !bkg.released_by && (!role || role === 'CS')) {
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
        title: `Send SI reminder to ${bkg.customer_name}`,
        subtitle: `${bkg.quantity}x ${bkg.container_type} · ${bkg.origin} → ${bkg.destination} · BL cutoff: ${cutoffDate} (${urgencyText})`,
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
      if (bkg.si_cutoff_date) parts.push(`SI: ${bkg.si_cutoff_date}`)
      if (bkg.bl_cutoff_date) parts.push(`BL: ${bkg.bl_cutoff_date}`)
      return parts.length ? ` · ${parts.join(' · ')}` : ''
    }

    // --- From Bookings (submit SI to liner) ---
    for (const bkg of bookings) {
      if (!bkg.si_requested || bkg.si_submitted) continue
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

    // --- From Bookings (record Draft BL + send to customer) ---
    for (const bkg of bookings) {
      if (bkg.delivery_type === 'door-to-door') continue // door-to-door skips Draft BL
      if (!bkg.si_submitted || bkg.draft_bl_sent) continue
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

    // --- Master BL (door-to-door only, after SI submitted) ---
    for (const bkg of bookings) {
      if (bkg.delivery_type !== 'door-to-door') continue
      if (!bkg.si_submitted) continue
      if (bkg.master_bl_recorded) continue
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
    if (!role || role === 'Finance' || role === 'Admin') {
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
          action: `Completed ${WORKFLOW_STAGES.find(s => s.id === inquiry.workflow_stage)?.label}. Pushed to ${ROLE_LABELS[nextStageObj.role]}.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: nextStageObj.role,
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
        setActionModal(item)
        break
      }
      case 'booking-request': {
        // Pre-fill from inquiry data + activity log rate context
        const { inquiry: brInq } = item.sourceData
        setFormNote('')
        setBkAttachmentName('')
        setBkAttachmentData('')

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
        setBkIsUrgent(false)
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
        // Pre-fill with booking confirmation details from activity log
        setFormNote('')
        const sendCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        setCustomerContactEmail(sendCust?.contact_email ?? '')
        setCustomerContactPhone(sendCust?.contact_phone ?? '')
        setSendMethod(sendCust?.contact_email ? 'email' : 'whatsapp')
        setWaConfirmed(false)
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
        setActionModal(item)
        break
      }
      case 'request-si': {
        setFormNote('')
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
        setFormNote('')
        setActionModal(item)
        break
      }
      case 'send-draft-bl': {
        setDraftBlContent('')
        setDraftBlFileName('')
        setDraftBlMode('paste')
        setFormNote('')
        const blCust = customers.find(c => c.name.toLowerCase() === item.customerName.toLowerCase())
        setCustomerContactEmail(blCust?.contact_email ?? '')
        setCustomerContactPhone(blCust?.contact_phone ?? '')
        setSendMethod(blCust?.contact_email ? 'email' : 'whatsapp')
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
    if (!actionModal) return
    // Compute next-step action for interactive toast navigation
    // Skip for actions that push work to a different department (unless Admin who sees all)
    // prepare-quotation is handled entirely within Sales (no email/WA sending) so it stays in-dept for toast navigation
    const crossDeptActions = new Set(['send-kyc', 'verify-kyc', 'check-rates', 'check-inttra-rates', 'booking-request'])
    const nextStepAction = (() => {
      if (activeRole !== 'Admin' && crossDeptActions.has(actionModal.actionKind)) return undefined
      const cur = roleSteps.find(s => s.actionKinds.includes(actionModal.actionKind))
      const nxt = cur ? roleSteps.find(s => s.stepNumber === cur.stepNumber + 1) : null
      return nxt ? { label: `Go to ${nxt.label}`, onClick: () => setActiveStep(nxt.key) } : undefined
    })()
    switch (actionModal.actionKind) {
      case 'send-kyc': {
        const { customer, inquiry: kycInquiry, kycClient: pendingKycClient } = actionModal.sourceData
        // Resolve backend cli_id: new flow uses kycClient directly; legacy uses inquiry/clientList
        let cli_id: number | undefined
        if (pendingKycClient) {
          cli_id = pendingKycClient.cli_id
        } else {
          const kycClientRecord = clientList.find(c => c.name.toLowerCase() === customer?.name.toLowerCase())
          cli_id = kycInquiry?.cli_id ?? kycClientRecord?.cli_id
        }
        if (cli_id) {
          setKycSending(true)
          try {
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
            if (pendingKycClient) {
              // Remove from pending queue so the item disappears immediately
              onSetKycPendingClients(prev => prev.filter(c => c.cli_id !== pendingKycClient.cli_id))
            }
            // Refresh Finance's KYC review queue so the submitted request appears without re-login
            onRefreshKycRequests()
          } catch { /* fire-and-forget — optimistic update proceeds regardless */ }
          setKycSending(false)
        }
        const customerName = pendingKycClient?.name ?? customer?.name ?? actionModal.customerName
        if (!pendingKycClient) {
          // Legacy flow: update local customer record and advance inquiry
          if (customer) onUpdateCustomerKyc(customer.name, 'pending_customer')
          if (kycInquiry) onAdvanceWorkflow(kycInquiry.id, 'kyc-verification')
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
        // Create structured quotation record in backend and mark as sent
        if (inquiry.inq_id) {
          const today = new Date().toISOString().slice(0, 10)
          apiCreateQuotation({
            inq_id: inquiry.inq_id,
            quote_date: today,
            sent_via: activeRole === 'Sales' ? 'direct' : 'email',
            options: [],
          })
            .then(created => {
              if (created.quote_id) {
                setLastQuotationId(created.quote_id)
                // Mark as sent — backend auto-advances workflow to quotation_sent
                apiMarkQuotationSent(created.quote_id)
                  .catch(err => console.error('[Workspace] mark quotation sent failed:', err))
              }
            })
            .catch(err => console.error('[Workspace] create quotation failed:', err))
        }
        // Sales sends the quotation directly (no system email/WA) — skip quotation-sent and move straight to recording response
        // Local state advance (backend may also auto-advance via apiMarkQuotationSent — idempotent)
        onAdvanceWorkflow(inquiry.id, activeRole === 'Sales' ? 'customer-response' : 'quotation-sent')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Quotation prepared and shared with ${inquiry.customer_name}.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'CS',
          notes: formNote
            ? `${formNote} | Quotation:\n${quotationContent}`
            : `Quotation:\n${quotationContent}`,
        })
        onFlash(`${inquiry.id} → Quotation marked as sent to customer`, nextStepAction)
        break
      }
      case 'send-to-customer': {
        const { inquiry } = actionModal.sourceData
        // Extract quotation content from previous activity log
        const prevCtx = actionModal.previousContext
        const quotationText = prevCtx?.notes?.match(/Quotation:\n([\s\S]+)/)?.[1] ?? ''

        if (sendMethod === 'email' && customerContactEmail.trim()) {
          setQuotationSending(true)
          try {
            await apiSendQuotation({
              customer_name: inquiry.customer_name,
              recipient_email: customerContactEmail.trim(),
              quote_id: inquiry.id,
              quotation_content: quotationText,
            })
          } catch { /* fire-and-forget */ }
          setQuotationSending(false)
        }

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
        if (quoteId) {
          apiRecordQuotationResponse(quoteId, customerDecision)
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
        const bookingId = onCreateBooking({
          customer_name: inquiry.customer_name,
          quote_id: inquiry.id,
          shipping_line: bkShippingLine,
          container_type: bkContainerType,
          quantity: bkQuantity,
          origin: inquiry.origin,
          destination: inquiry.destination,
          is_urgent: bkIsUrgent,
          booked_by: 1,
          notes: formNote || `Booking for ${inquiry.customer_name}: ${inquiry.request}`,
          delivery_type: inquiry.delivery_type,
        })
        onAdvanceWorkflow(inquiry.id, 'completed')
        const attachInfo = bkAttachmentName ? ` | Attachment: ${bkAttachmentName}` : ''
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Booking request ${bookingId} created and sent to Procurement.${bkAttachmentName ? ` Excel attached: ${bkAttachmentName}` : ''}`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'Procurement',
          notes: `Booking: ${bkQuantity}x ${bkContainerType} | ${bkShippingLine || 'Any liner'} | ${inquiry.origin} → ${inquiry.destination}${bkIsUrgent ? ' | URGENT' : ''}${attachInfo}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${inquiry.id} → Booking request sent to Procurement`, nextStepAction)
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
        if (cutoffSiDate) onSetBookingSiCutoff(booking.id, cutoffSiDate)
        if (cutoffBlDate) onSetBookingBlCutoff(booking.id, cutoffBlDate)
        const cutoffSummary = cutoffContent
          ? `Cutoff schedule recorded (${cutoffMode === 'upload' ? cutoffFileName : 'pasted text'})`
          : 'Cutoff schedule recorded (no document attached)'
        const dateNotes = [cutoffSiDate && `SI cutoff: ${cutoffSiDate}`, cutoffBlDate && `BL cutoff: ${cutoffBlDate}`].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Recorded vessel cutoff schedule for ${booking.customer_name}. Liner: ${cutoffLiner || booking.shipping_line || 'N/A'}.${dateNotes ? ` ${dateNotes}.` : ''}`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `${cutoffSummary}${cutoffNotes ? ` | ${cutoffNotes}` : ''}${dateNotes ? ` | ${dateNotes}` : ''}`,
        })
        onFlash(`${booking.id} → Vessel cutoff recorded for ${booking.customer_name}`, nextStepAction)
        break
      }
      case 'request-si': {
        const { booking } = actionModal.sourceData
        onMarkSiRequested(booking.id)
        const sendVia = sendMethod === 'email'
          ? `via Email to ${customerContactEmail}`
          : `via WhatsApp to ${customerContactPhone || 'customer'}`
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `SI requested from ${booking.customer_name} ${sendVia}. SI cutoff: ${booking.si_cutoff_date}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `SI follow-up sent ${sendVia}. Cutoff: ${booking.si_cutoff_date}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → SI requested from ${booking.customer_name} ${sendVia}`, nextStepAction)
        break
      }
      case 'submit-si': {
        const { booking } = actionModal.sourceData
        onMarkSiSubmitted(booking.id)
        const method = 'manually'
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `SI submitted to ${booking.shipping_line || 'liner'} for ${booking.customer_name} ${method}.`,
          ref_type: 'booking',
          ref_id: booking.id,
          customer_name: booking.customer_name,
          pushed_to: 'CS',
          notes: `SI submitted ${method}${siContent ? ` | Document attached` : ''}${formNote ? ` | ${formNote}` : ''}`,
        })
        onFlash(`${booking.id} → SI submitted to ${booking.shipping_line || 'liner'} ${method}`, nextStepAction)
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
                  onClick={() => setSelectedItemId(key)}
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
        {roleSteps.map(step => {
          const count = stepCounts[step.key] ?? 0
          const isActive = effectiveStep === step.key
          const isEmpty = count === 0
          return (
            <button
              key={step.key}
              onClick={() => setActiveStep(step.key)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '6px 14px',
                minWidth: 80,
                border: 'none',
                borderRadius: 10,
                cursor: 'pointer',
                background: isActive ? roleColor + '12' : 'transparent',
                transition: 'background 0.15s',
                flexShrink: 0,
                position: 'relative',
              }}
            >
              <div style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                background: isActive ? roleColor : isEmpty ? 'rgba(0,0,0,0.06)' : roleColor + '18',
                color: isActive ? '#fff' : isEmpty ? 'var(--text-muted)' : roleColor,
                transition: 'all 0.15s',
              }}>
                {step.stepNumber}
              </div>
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 600,
                color: isActive ? roleColor : isEmpty ? 'var(--text-muted)' : 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                transition: 'color 0.15s',
              }}>
                {step.label}
              </span>
              {count > 0 && (
                <span style={{
                  position: 'absolute',
                  top: 2,
                  right: 6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  background: isActive ? roleColor : '#ef4444',
                  color: '#fff',
                  padding: '0 4px',
                  lineHeight: 1,
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Action Modal */}
      {actionModal && (
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
                    Review and edit the quotation below. Copy it and share directly with the customer, then click <strong>Mark as Sent</strong>.
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

                  <div>
                    <label className="lt-label">{customerDecision === 'rejected' ? 'Rejection Reason' : 'Notes'} (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder={customerDecision === 'rejected' ? 'Reason for rejection...' : 'Any follow-up notes...'} />
                  </div>
                </div>
              )
            })()}

            {/* Booking request form */}
            {actionModal.actionKind === 'booking-request' && (() => {
              const ctx = actionModal.previousContext
              const { inquiry: brInq } = actionModal.sourceData
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

                  {/* Route summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{brInq.customer_name}</strong> — {brInq.origin} → {brInq.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{brInq.request} · {brInq.delivery_type === 'door-to-door' ? 'Door-to-Door' : 'Port-to-Port'}</div>
                  </div>

                  <div>
                    <label className="lt-label">Preferred Shipping Line</label>
                    <input list="ws-bk-liners" className="lt-input" style={{ width: '100%' }} value={bkShippingLine}
                      onChange={e => setBkShippingLine(e.target.value)}
                      placeholder="e.g. Maersk, MSC, Hapag-Lloyd (or leave blank for any)" />
                    <datalist id="ws-bk-liners">
                      {linerList.map(l => <option key={l.lin_id} value={l.name} />)}
                    </datalist>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="lt-label">Container Type</label>
                      <select className="lt-input" style={{ width: '100%' }} value={bkContainerType}
                        onChange={e => setBkContainerType(e.target.value)}>
                        <option value="20'GP">20&apos; GP</option>
                        <option value="40'GP">40&apos; GP</option>
                        <option value="40'HC">40&apos; HC</option>
                        <option value="20'RF">20&apos; RF</option>
                        <option value="40'RF">40&apos; RF</option>
                        <option value="20'OT">20&apos; OT</option>
                        <option value="40'OT">40&apos; OT</option>
                        <option value="20'FR">20&apos; FR</option>
                        <option value="40'FR">40&apos; FR</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="lt-label">Quantity</label>
                      <input className="lt-input" style={{ width: '100%' }} type="number" min={1}
                        value={bkQuantity} onChange={e => setBkQuantity(Math.max(1, parseInt(e.target.value) || 1))} />
                    </div>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={bkIsUrgent} onChange={e => setBkIsUrgent(e.target.checked)} />
                    <span>
                      Mark as urgent
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>(Procurement will be notified immediately)</span>
                    </span>
                  </label>

                  {/* Excel attachment */}
                  <div>
                    <label className="lt-label">Attach Booking Request (Excel)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <label
                        className="db-btn"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        <Paperclip size={13} />
                        {bkAttachmentName ? 'Replace file' : 'Choose file'}
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          style={{ display: 'none' }}
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            setBkAttachmentName(file.name)
                            const reader = new FileReader()
                            reader.onload = () => setBkAttachmentData(reader.result as string)
                            reader.readAsDataURL(file)
                            e.target.value = ''
                          }}
                        />
                      </label>
                      {bkAttachmentName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                          <FileText size={13} style={{ color: '#16a34a' }} />
                          <span style={{ fontWeight: 600 }}>{bkAttachmentName}</span>
                          <button
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                            onClick={() => { setBkAttachmentName(''); setBkAttachmentData('') }}
                            title="Remove attachment"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      .xlsx, .xls, or .csv — optional booking request form prepared by CS
                    </div>
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Special requirements, stacking, hazmat, etc." />
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

            {/* Release booking form — CS sends release order + booking confirmation to customer */}
            {actionModal.actionKind === 'release-booking' && (() => {
              const { booking: rbkg } = actionModal.sourceData
              const ctx = actionModal.previousContext
              // Extract booking confirmation details from activity log
              const vesselMatch = ctx?.notes?.match(/Vessel:\s*([^,|]+)/i)
              const voyageMatch = ctx?.notes?.match(/Voyage:\s*([^,|]+)/i)
              const refMatch = ctx?.notes?.match(/Booking Ref:\s*([^|]+)/i)
              const etdMatch = ctx?.notes?.match(/ETD:\s*([^|]+)/i)
              const etaMatch = ctx?.notes?.match(/ETA:\s*([^|]+)/i)
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

                  {/* Booking confirmation card */}
                  <div style={{ padding: '14px 16px', background: 'rgba(22,163,106,0.06)', border: '1px solid rgba(22,163,106,0.2)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <Ship size={14} style={{ color: '#16a34a' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Booking Confirmation</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                      <div><span style={{ color: 'var(--text-muted)' }}>Customer:</span> <strong>{rbkg.customer_name}</strong></div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Route:</span> {rbkg.origin} → {rbkg.destination}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Vessel:</span> {vesselMatch?.[1]?.trim() || rbkg.vessel_name || 'TBD'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Voyage:</span> {voyageMatch?.[1]?.trim() || rbkg.voyage_number || 'TBD'}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Container:</span> {rbkg.quantity}x {rbkg.container_type}</div>
                      <div><span style={{ color: 'var(--text-muted)' }}>Liner:</span> {rbkg.shipping_line || 'N/A'}</div>
                      {refMatch && <div><span style={{ color: 'var(--text-muted)' }}>Booking Ref:</span> <strong>{refMatch[1].trim()}</strong></div>}
                      {etdMatch && <div><span style={{ color: 'var(--text-muted)' }}>ETD:</span> {etdMatch[1].trim()}</div>}
                      {etaMatch && <div><span style={{ color: 'var(--text-muted)' }}>ETA:</span> {etaMatch[1].trim()}</div>}
                    </div>
                  </div>

                  {/* Send method toggle */}
                  <div>
                    <label className="lt-label">Send Release Order via</label>
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
                            I confirm that I have sent the release order and booking confirmation to the customer via WhatsApp.
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                              No WhatsApp integration — manual confirmation.
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="lt-label">Release Note / Instructions (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Collection instructions, pickup location, etc." />
                  </div>
                </div>
              )
            })()}

            {/* Request SI modal */}
            {actionModal.actionKind === 'request-si' && (() => {
              const { booking: siBkg } = actionModal.sourceData
              const ctx = actionModal.previousContext
              const blCutoff = siBkg.bl_cutoff_date
              const siCutoff = siBkg.si_cutoff_date
              const primaryCutoff = blCutoff || siCutoff
              const dLeft = primaryCutoff ? daysUntil(primaryCutoff) : 999
              const isOvdSi = dLeft < 0
              const urgencyColor = isOvdSi ? '#dc2626' : dLeft === 0 ? '#d97706' : '#0891b2'
              const urgencyText = isOvdSi
                ? `OVERDUE by ${Math.abs(dLeft)} day(s)`
                : dLeft === 0 ? 'Due TODAY' : `${dLeft} day(s) remaining`

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

                  {/* Cutoff dates card */}
                  <div style={{
                    padding: '14px 16px',
                    background: urgencyColor + '0a',
                    border: `1px solid ${urgencyColor}30`,
                    borderRadius: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <AlertTriangle size={14} style={{ color: urgencyColor }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: urgencyColor }}>
                        Cutoff Dates
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: urgencyColor,
                        marginLeft: 'auto',
                        padding: '2px 8px',
                        background: urgencyColor + '15',
                        borderRadius: 10,
                      }}>
                        {urgencyText}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, marginBottom: 8 }}>
                      {siCutoff && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 80, color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>SI Cutoff</span>
                          <span style={{ fontWeight: 700 }}>{siCutoff}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({daysUntil(siCutoff) < 0 ? `${Math.abs(daysUntil(siCutoff))}d overdue` : `${daysUntil(siCutoff)}d left`})</span>
                        </div>
                      )}
                      {blCutoff && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 80, color: 'var(--text-muted)', fontWeight: 600, fontSize: 11 }}>BL Cutoff</span>
                          <span style={{ fontWeight: 700 }}>{blCutoff}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>({daysUntil(blCutoff) < 0 ? `${Math.abs(daysUntil(blCutoff))}d overdue` : `${daysUntil(blCutoff)}d left`})</span>
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
                            I confirm that I have sent the SI request to the customer via WhatsApp.
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
                      placeholder="Any instructions or reminders for the customer..." />
                  </div>
                </div>
              )
            })()}

            {/* Record Cutoff modal */}
            {actionModal.actionKind === 'record-cutoff' && (() => {
              const { booking: coBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{coBkg.customer_name}</strong> — {coBkg.origin} → {coBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {coBkg.quantity}x {coBkg.container_type} · {coBkg.shipping_line || 'No liner'}
                    </div>
                  </div>

                  <div>
                    <label className="lt-label">Shipping Line / Liner</label>
                    <input list="ws-cut-liners" className="lt-input" style={{ width: '100%' }} value={cutoffLiner}
                      onChange={e => setCutoffLiner(e.target.value)}
                      placeholder="e.g. Maersk, MSC, Hapag-Lloyd" />
                    <datalist id="ws-cut-liners">
                      {linerList.map(l => <option key={l.lin_id} value={l.name} />)}
                    </datalist>
                  </div>

                  {/* Paste / Upload toggle */}
                  <div>
                    <label className="lt-label">Cutoff Schedule</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 8 }}>
                      <button
                        className={`db-btn ${cutoffMode === 'paste' ? 'primary' : ''}`}
                        style={cutoffMode !== 'paste' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setCutoffMode('paste')}
                      >
                        <ClipboardPaste size={13} style={{ marginRight: 4 }} /> Paste
                      </button>
                      <button
                        className={`db-btn ${cutoffMode === 'upload' ? 'primary' : ''}`}
                        style={cutoffMode !== 'upload' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setCutoffMode('upload')}
                      >
                        <Paperclip size={13} style={{ marginRight: 4 }} /> Upload
                      </button>
                    </div>

                    {cutoffMode === 'paste' && (
                      <textarea
                        className="lt-input"
                        style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' }}
                        value={cutoffContent}
                        onChange={e => setCutoffContent(e.target.value)}
                        placeholder="Paste vessel cutoff schedule here..."
                      />
                    )}

                    {cutoffMode === 'upload' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label
                          className="db-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <Paperclip size={13} />
                          {cutoffFileName ? 'Replace file' : 'Choose file'}
                          <input
                            type="file"
                            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.txt"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setCutoffFileName(file.name)
                              const reader = new FileReader()
                              reader.onload = () => setCutoffContent(reader.result as string)
                              reader.readAsDataURL(file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        {cutoffFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{cutoffFileName}</span>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              onClick={() => { setCutoffFileName(''); setCutoffContent('') }}
                              title="Remove file"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label className="lt-label">SI Cutoff Date</label>
                      <input className="lt-input" style={{ width: '100%' }} type="date"
                        value={cutoffSiDate} onChange={e => setCutoffSiDate(e.target.value)} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="lt-label">BL Cutoff Date</label>
                      <input className="lt-input" style={{ width: '100%' }} type="date"
                        value={cutoffBlDate} onChange={e => setCutoffBlDate(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    SI &amp; BL cutoff dates trigger downstream follow-up tasks and reminders.
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={cutoffNotes}
                      onChange={e => setCutoffNotes(e.target.value)}
                      placeholder="Any notes about vessel cutoff schedule..." />
                  </div>
                </div>
              )
            })()}

            {/* Submit SI modal */}
            {actionModal.actionKind === 'submit-si' && (() => {
              const { booking: siBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Booking summary */}
                  <div style={{ padding: '10px 14px', background: 'rgba(15,143,168,0.06)', border: '1px solid rgba(15,143,168,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{siBkg.customer_name}</strong> — {siBkg.origin} → {siBkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {siBkg.quantity}x {siBkg.container_type} · {siBkg.shipping_line || 'No liner'}
                    </div>
                  </div>

                  {/* Cutoff dates */}
                  {(siBkg.si_cutoff_date || siBkg.bl_cutoff_date) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                      {siBkg.si_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{siBkg.si_cutoff_date}</strong>
                        </div>
                      )}
                      {siBkg.bl_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{siBkg.bl_cutoff_date}</strong>
                        </div>
                      )}
                    </div>
                  )}


                  {/* SI Document */}
                  <div>
                        <label className="lt-label">SI Document</label>
                        <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 8 }}>
                          <button
                            className={`db-btn ${siMode === 'paste' ? 'primary' : ''}`}
                            style={siMode !== 'paste' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                            onClick={() => setSiMode('paste')}
                          >
                            <ClipboardPaste size={13} style={{ marginRight: 4 }} /> Paste
                          </button>
                          <button
                            className={`db-btn ${siMode === 'upload' ? 'primary' : ''}`}
                            style={siMode !== 'upload' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                            onClick={() => setSiMode('upload')}
                          >
                            <Paperclip size={13} style={{ marginRight: 4 }} /> Upload
                          </button>
                        </div>

                        {siMode === 'paste' && (
                          <textarea
                            className="lt-input"
                            style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' }}
                            value={siContent}
                            onChange={e => setSiContent(e.target.value)}
                            placeholder="Paste shipping instructions here..."
                          />
                        )}

                        {siMode === 'upload' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <label
                              className="db-btn"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                            >
                              <Paperclip size={13} />
                              {siFileName ? 'Replace file' : 'Choose file'}
                              <input
                                type="file"
                                accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.txt,.doc,.docx"
                                style={{ display: 'none' }}
                                onChange={e => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  setSiFileName(file.name)
                                  const reader = new FileReader()
                                  reader.onload = () => setSiContent(reader.result as string)
                                  reader.readAsDataURL(file)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            {siFileName && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                                <FileText size={13} style={{ color: '#16a34a' }} />
                                <span style={{ fontWeight: 600 }}>{siFileName}</span>
                                <button
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                                  onClick={() => { setSiFileName(''); setSiContent('') }}
                                  title="Remove file"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                  </div>

                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any notes about the SI submission..." />
                  </div>
                </div>
              )
            })()}

            {/* Send Draft BL modal */}
            {actionModal.actionKind === 'send-draft-bl' && (() => {
              const { booking: blBkg } = actionModal.sourceData
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
                      {blBkg.si_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>SI Cutoff:</span> <strong>{blBkg.si_cutoff_date}</strong>
                        </div>
                      )}
                      {blBkg.bl_cutoff_date && (
                        <div style={{ flex: 1, padding: '6px 10px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 6 }}>
                          <span style={{ color: 'var(--text-muted)' }}>BL Cutoff:</span> <strong>{blBkg.bl_cutoff_date}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ padding: '10px 14px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.18)', borderRadius: 8, fontSize: 12, color: '#0891b2', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FileText size={14} />
                    Record the Draft BL received from {blBkg.shipping_line || 'the liner'} and forward it to the customer for approval.
                  </div>

                  {/* Draft BL document */}
                  <div>
                    <label className="lt-label">Draft BL Document</label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 8 }}>
                      <button
                        className={`db-btn ${draftBlMode === 'paste' ? 'primary' : ''}`}
                        style={draftBlMode !== 'paste' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setDraftBlMode('paste')}
                      >
                        <ClipboardPaste size={13} style={{ marginRight: 4 }} /> Paste
                      </button>
                      <button
                        className={`db-btn ${draftBlMode === 'upload' ? 'primary' : ''}`}
                        style={draftBlMode !== 'upload' ? { background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' } : {}}
                        onClick={() => setDraftBlMode('upload')}
                      >
                        <Paperclip size={13} style={{ marginRight: 4 }} /> Upload
                      </button>
                    </div>

                    {draftBlMode === 'paste' && (
                      <textarea
                        className="lt-input"
                        style={{ width: '100%', minHeight: 100, fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, resize: 'vertical' }}
                        value={draftBlContent}
                        onChange={e => setDraftBlContent(e.target.value)}
                        placeholder="Paste Draft BL content here..."
                      />
                    )}

                    {draftBlMode === 'upload' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <label
                          className="db-btn"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                        >
                          <Paperclip size={13} />
                          {draftBlFileName ? 'Replace file' : 'Choose file'}
                          <input
                            type="file"
                            accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.txt,.doc,.docx"
                            style={{ display: 'none' }}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (!file) return
                              setDraftBlFileName(file.name)
                              const reader = new FileReader()
                              reader.onload = () => setDraftBlContent(reader.result as string)
                              reader.readAsDataURL(file)
                              e.target.value = ''
                            }}
                          />
                        </label>
                        {draftBlFileName && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)' }}>
                            <FileText size={13} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600 }}>{draftBlFileName}</span>
                            <button
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)' }}
                              onClick={() => { setDraftBlFileName(''); setDraftBlContent('') }}
                              title="Remove file"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Send method */}
                  <div>
                    <label className="lt-label">Send Draft BL to Customer via</label>
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
                            I confirm that I have sent the Draft BL to the customer via WhatsApp.
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
                      placeholder="Any notes for the customer..." />
                  </div>
                </div>
              )
            })()}

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
                  (actionModal.actionKind === 'request-si' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'request-si' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'submit-si' && inttraSiLoading) ||
                  (actionModal.actionKind === 'submit-si' && !siContent.trim()) ||
                  (actionModal.actionKind === 'send-draft-bl' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'send-draft-bl' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'bl-approval' && blDecision === 'changes-requested' && !formNote.trim()) ||
                  (actionModal.actionKind === 'record-master-bl' && (!masterBlNumber.trim() || !masterBlConsignee.trim())) ||
                  (actionModal.actionKind === 'create-house-bl' && (!houseBlNumber.trim() || !houseBlConsignee.trim())) ||
                  (actionModal.actionKind === 'create-house-bl' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'create-house-bl' && sendMethod === 'whatsapp' && !waConfirmed) ||
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
                  actionModal.actionKind === 'record-cutoff' ? { background: '#0891b2', borderColor: '#0891b2' } :
                  actionModal.actionKind === 'confirm-booking' && formVessel.trim() ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'confirm-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'email' && customerContactEmail.includes('@') ? {} :
                  actionModal.actionKind === 'release-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'request-si' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'request-si' && sendMethod === 'email' && customerContactEmail.includes('@') ? { background: '#0891b2', borderColor: '#0891b2' } :
                  actionModal.actionKind === 'request-si' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'submit-si' && siContent.trim() ? { background: '#0891b2', borderColor: '#0891b2' } :
                  actionModal.actionKind === 'submit-si' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'send-draft-bl' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'send-draft-bl' && sendMethod === 'email' && customerContactEmail.includes('@') ? { background: '#0891b2', borderColor: '#0891b2' } :
                  actionModal.actionKind === 'send-draft-bl' ? { opacity: 0.4, cursor: 'not-allowed' } :
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
                 actionModal.actionKind === 'prepare-quotation' ? <><ClipboardCheck size={12} /> Mark as Sent to Customer</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' ? <><Mail size={12} /> Send via Email</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' ? <><Check size={12} /> Customer Accepted — Proceed to Booking</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'rejected' ? <><X size={12} /> Customer Rejected — Close Inquiry</> :
                 actionModal.actionKind === 'booking-request' ? <><Ship size={12} /> Create Booking &amp; Send to Procurement</> :
                 actionModal.actionKind === 'record-cutoff' ? <><Ship size={12} /> Record Cutoff &amp; Push</> :
                 actionModal.actionKind === 'confirm-booking' && formVessel.trim() ?<><Ship size={12} /> Confirm Manually &amp; Send to CS</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'email' ? <><Mail size={12} /> Release &amp; Send via Email</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Release &amp; Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'request-si' && sendMethod === 'email' ? <><Mail size={12} /> Request SI via Email</> :
                 actionModal.actionKind === 'request-si' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Confirm SI Request via WhatsApp</> :
                 actionModal.actionKind === 'submit-si' ?<><Globe size={12} /> Submit SI &amp; Confirm</> :
                 actionModal.actionKind === 'send-draft-bl' && sendMethod === 'email' ? <><Mail size={12} /> Send Draft BL via Email</> :
                 actionModal.actionKind === 'send-draft-bl' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Confirm Draft BL Sent</> :
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
