import { useState, useMemo } from 'react'
import {
  Inbox, ChevronRight, AlertTriangle, Check, Filter, Paperclip,
  FileText, Ship, ShieldCheck, X, User, ArrowRight, Mail, Loader2, UserPlus,
  Globe, FileDown, MessageCircle, Send, Edit3,
} from 'lucide-react'
import {
  EMPLOYEES, WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS,
  isSpotInquiry,
  type Inquiry, type Booking, type Quote, type Customer,
  type ActivityEntry, type UserRole, type WorkflowStage,
  type QuoteStatus, type KycStatus, type RateRecord, type InttraSpotRate,
  toInttraCard,
} from '../../mockData'
import { useRole } from '../../RoleContext'
import { apiSendKyc, apiSearchRates, apiCheckInttraRates, apiSendQuotation, apiBookInttra, type InttraBookingResult } from '../../api'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface WorkspaceProps {
  inquiries: Inquiry[]
  bookings: Booking[]
  quotes: Quote[]
  customers: Customer[]
  activityLog: ActivityEntry[]
  onAdvanceWorkflow: (inquiryId: string, nextStage: WorkflowStage) => void
  onConfirmBooking: (bookingId: string, vesselName: string, voyageNumber: string) => void
  onReleaseBooking: (bookingId: string, note: string) => void
  onAcknowledgeProcurement: (bookingId: string) => void
  onCreateBooking: (payload: {
    customer_name: string; quote_id: string; shipping_line: string;
    container_type: string; quantity: number; origin: string; destination: string;
    is_urgent: boolean; booked_by: number; notes: string;
  }) => string
  onSetQuoteStatus: (quoteId: string, status: QuoteStatus) => void
  onUpdateCustomerKyc: (customerName: string, kycStatus: KycStatus) => void
  onAutoAdvanceForCustomer: (customerName: string, targetStage: WorkflowStage) => void
  onLogActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => void
  onFlash: (msg: string) => void
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
}

const TYPE_ICON: Record<ItemType, typeof FileText> = {
  inquiry: FileText,
  booking: Ship,
  quote: ShieldCheck,
  customer: UserPlus,
}

const TYPE_BADGE_CLASS: Record<ItemType, string> = {
  inquiry: 'db-badge accent',
  booking: 'db-badge warning',
  quote: 'db-badge purple',
  customer: 'db-badge',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Workspace({
  inquiries, bookings, quotes, customers, activityLog,
  onAdvanceWorkflow, onConfirmBooking, onReleaseBooking,
  onAcknowledgeProcurement, onCreateBooking, onSetQuoteStatus, onUpdateCustomerKyc,
  onAutoAdvanceForCustomer, onLogActivity, onFlash,
}: WorkspaceProps) {
  const { activeRole, activeEmployee } = useRole()

  // Modal state for actions that need a form
  const [actionModal, setActionModal] = useState<WorkspaceItem | null>(null)
  const [formVessel, setFormVessel] = useState('')
  const [formVoyage, setFormVoyage] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formDecision, setFormDecision] = useState<'approve' | 'reject'>('approve')
  const [formEmail, setFormEmail] = useState('')
  const [kycSending, setKycSending] = useState(false)
  const [rateResults, setRateResults] = useState<RateRecord[]>([])
  const [selectedRateIds, setSelectedRateIds] = useState<Set<number>>(new Set())
  const [ratesLoading, setRatesLoading] = useState(false)
  const [ratesSearched, setRatesSearched] = useState(false)
  const [inttraResults, setInttraResults] = useState<InttraSpotRate[]>([])
  const [inttraLoading, setInttraLoading] = useState(false)
  const [inttraSearched, setInttraSearched] = useState(false)
  const [selectedInttraIds, setSelectedInttraIds] = useState<Set<string>>(new Set())
  // Manual rate entry state (when InttraAPI has no results)
  const [manualLiner, setManualLiner] = useState('')
  const [manualScac, setManualScac] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualTransit, setManualTransit] = useState('')
  const [manualContainer, setManualContainer] = useState("20'GP")
  const [manualFreeTime, setManualFreeTime] = useState('')
  const [manualValidFrom, setManualValidFrom] = useState('')
  const [manualValidTo, setManualValidTo] = useState('')
  const [manualCutoff, setManualCutoff] = useState('')
  const [manualAttachment, setManualAttachment] = useState<string>('')
  // Quotation prep state (Sales edits document)
  const [quotationContent, setQuotationContent] = useState('')
  // Send-to-customer state (CS sends via Email or WhatsApp)
  const [sendMethod, setSendMethod] = useState<'email' | 'whatsapp'>('email')
  const [waConfirmed, setWaConfirmed] = useState(false)
  const [customerContactEmail, setCustomerContactEmail] = useState('')
  const [customerContactPhone, setCustomerContactPhone] = useState('')
  const [quotationSending, setQuotationSending] = useState(false)
  // Customer response state (accept / reject)
  const [customerDecision, setCustomerDecision] = useState<'accepted' | 'rejected'>('accepted')
  // Booking request form state
  const [bkShippingLine, setBkShippingLine] = useState('')
  const [bkContainerType, setBkContainerType] = useState("20'GP")
  const [bkQuantity, setBkQuantity] = useState(1)
  const [bkIsUrgent, setBkIsUrgent] = useState(false)
  const [bkAttachmentName, setBkAttachmentName] = useState('')
  const [bkAttachmentData, setBkAttachmentData] = useState('')
  // InttraAPI booking confirmation state (Procurement books with liner)
  const [inttraBooking, setInttraBooking] = useState(false)
  const [inttraBookResult, setInttraBookResult] = useState<InttraBookingResult | null>(null)

  // Filter state
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

  const findContext = (refId: string): ActivityEntry | null =>
    activityLog.find(a => a.ref_id === refId) ?? null

  // ---------------------------------------------------------------------------
  // Derive pending items from existing data
  // ---------------------------------------------------------------------------

  const { pendingItems, recentlyPushed } = useMemo(() => {
    const pending: WorkspaceItem[] = []
    const role = activeRole === 'Admin' ? null : activeRole

    // --- From Customers (by kyc_status) ---
    // CS sees customers needing KYC initiation (not_started)
    // Finance sees customers awaiting KYC verification (pending_customer)
    for (const cust of customers) {
      if (cust.kyc_status === 'not_started' && (!role || role === 'CS')) {
        pending.push({
          type: 'customer',
          refId: cust.id,
          customerName: cust.name,
          title: `Send KYC form to ${cust.name}`,
          subtitle: `${cust.tier} · ${cust.location} · KYC not yet initiated`,
          urgentFlag: false,
          createdAt: '',
          previousContext: findContext(cust.id),
          actionLabel: 'Send KYC Form',
          actionKind: 'send-kyc',
          sourceData: { customer: cust },
        })
      }

      if (cust.kyc_status === 'pending_customer' && (!role || role === 'Finance')) {
        pending.push({
          type: 'customer',
          refId: cust.id,
          customerName: cust.name,
          title: `Verify KYC for ${cust.name}`,
          subtitle: `${cust.tier} · ${cust.location} · KYC form sent, awaiting verification`,
          urgentFlag: false,
          createdAt: '',
          previousContext: findContext(cust.id),
          actionLabel: 'Verify KYC',
          actionKind: 'verify-kyc',
          sourceData: { customer: cust },
        })
      }
    }

    // --- From Inquiries (by workflow_stage) ---
    for (const inq of inquiries) {
      if (inq.status === 'completed' || !inq.workflow_stage) continue
      const stage = WORKFLOW_STAGES.find(s => s.id === inq.workflow_stage)
      if (!stage) continue
      if (role && stage.role !== role) continue
      if (inq.workflow_stage === 'completed') continue

      // Skip inquiry-level KYC stages — KYC is now tracked on the customer
      if (inq.workflow_stage === 'kyc-pending' || inq.workflow_stage === 'kyc-verification') continue

      // Determine the actual next stage (with KYC skip logic)
      let resolvedNextStage = WORKFLOW_STAGES.find(s => s.step === stage.step + 1)
      if (!resolvedNextStage) continue

      // At customer-check, if customer KYC is already approved, skip to rate-check
      // (CS checks AMS rates first before escalating to Procurement)
      const cust = customers.find(c => c.name.toLowerCase() === inq.customer_name.toLowerCase())
      if (inq.workflow_stage === 'customer-check' && cust?.kyc_status === 'approved') {
        resolvedNextStage = WORKFLOW_STAGES.find(s => s.id === 'rate-check')!
      }

      let title = ''
      let actionKind = 'advance-workflow'
      let actionLabel = `Push to ${ROLE_LABELS[resolvedNextStage.role]}`

      switch (inq.workflow_stage) {
        case 'inquiry-received':    title = `Process new inquiry from ${inq.customer_name}`; break
        case 'customer-check': {
          if (cust?.kyc_status === 'approved') {
            title = `Customer ${inq.customer_name} verified (KYC approved) — check rates`
            actionLabel = 'Check Rates'
          } else {
            title = `Verify customer ${inq.customer_name}`
          }
          break
        }
        case 'rate-check':
          title = `Check rates for ${inq.origin} → ${inq.destination}`
          actionKind = 'check-rates'
          actionLabel = 'Check AMS Rates'
          break
        case 'procurement-request':
          title = `Check InttraAPI spot rates: ${inq.origin} → ${inq.destination}`
          actionKind = 'check-inttra-rates'
          actionLabel = 'Check InttraAPI'
          break
        case 'quotation-prep':
          title = `Prepare quotation for ${inq.customer_name}`
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
          title = `Create booking request for ${inq.customer_name}`
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
        subtitle: `${inq.request} · ${inq.origin} → ${inq.destination}`,
        urgentFlag: isSpotInquiry(inq.inquiry_text),
        createdAt: inq.created_at,
        previousContext: findContext(inq.id),
        actionLabel,
        actionKind,
        sourceData: { inquiry: inq, nextStage: resolvedNextStage.id },
      })
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

    // Sort: urgent first, then newest first (customer items without dates go last)
    pending.sort((a, b) => {
      if (a.urgentFlag !== b.urgentFlag) return a.urgentFlag ? -1 : 1
      if (!a.createdAt && b.createdAt) return 1
      if (a.createdAt && !b.createdAt) return -1
      return b.createdAt.localeCompare(a.createdAt)
    })

    // Recently pushed: activity log entries where actor_role matches
    const pushed = activityLog
      .filter(a => role ? a.actor_role === role : true)
      .slice(0, 10)

    return { pendingItems: pending, recentlyPushed: pushed }
  }, [inquiries, bookings, quotes, customers, activityLog, activeRole]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const FILTER_CATEGORIES: Record<string, { label: string; actionKinds: string[] }> = {
    kyc:              { label: 'KYC',               actionKinds: ['send-kyc', 'verify-kyc'] },
    rates:            { label: 'Rate Check',        actionKinds: ['check-rates', 'check-inttra-rates'] },
    quotation:        { label: 'Quotation',         actionKinds: ['prepare-quotation', 'send-to-customer', 'approve-quote'] },
    'customer-resp':  { label: 'Customer Response',  actionKinds: ['customer-response'] },
    booking:          { label: 'Booking',           actionKinds: ['booking-request', 'confirm-booking', 'release-booking', 'acknowledge-procurement'] },
    workflow:         { label: 'Workflow',           actionKinds: ['advance-workflow'] },
  }

  // Only show filter chips for categories that have at least one pending item
  const availableFilters = useMemo(() => {
    const result: { key: string; label: string; count: number }[] = []
    for (const [key, cat] of Object.entries(FILTER_CATEGORIES)) {
      const count = pendingItems.filter(i => cat.actionKinds.includes(i.actionKind)).length
      if (count > 0) result.push({ key, label: cat.label, count })
    }
    return result
  }, [pendingItems]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return pendingItems
    const cat = FILTER_CATEGORIES[activeFilter]
    if (!cat) return pendingItems
    return pendingItems.filter(i => cat.actionKinds.includes(i.actionKind))
  }, [pendingItems, activeFilter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset filter if the active filter no longer has items
  if (activeFilter !== 'all' && !availableFilters.some(f => f.key === activeFilter)) {
    // Can't call setState during render, so this is safe as a deferred reset
    setTimeout(() => setActiveFilter('all'), 0)
  }

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------

  const handleAction = (item: WorkspaceItem) => {
    switch (item.actionKind) {
      case 'advance-workflow': {
        const { inquiry, nextStage } = item.sourceData
        onAdvanceWorkflow(inquiry.id, nextStage)
        const nextStageObj = WORKFLOW_STAGES.find(s => s.id === nextStage)!
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
        onFlash(`${inquiry.id} pushed to ${ROLE_LABELS[nextStageObj.role]}`)
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
        // Open modal and immediately search for rates
        setFormNote('')
        setRateResults([])
        setSelectedRateIds(new Set())
        setRatesSearched(false)
        setRatesLoading(true)
        setActionModal(item)
        const { inquiry: rateInq } = item.sourceData
        apiSearchRates({ origin: rateInq.origin, destination: rateInq.destination })
          .then(rates => { setRateResults(rates); setRatesSearched(true) })
          .catch(() => { setRateResults([]); setRatesSearched(true) })
          .finally(() => setRatesLoading(false))
        break
      }
      case 'check-inttra-rates': {
        // Open modal and fetch InttraAPI spot rates
        setFormNote('')
        setInttraResults([])
        setSelectedInttraIds(new Set())
        setInttraSearched(false)
        setInttraLoading(true)
        setManualLiner('')
        setManualScac('')
        setManualAmount('')
        setManualTransit('')
        setManualContainer("20'GP")
        setManualFreeTime('')
        setManualValidFrom('')
        setManualValidTo('')
        setManualCutoff('')
        setManualAttachment('')
        setActionModal(item)
        const { inquiry: inttraInq } = item.sourceData
        apiCheckInttraRates({ origin: inttraInq.origin, destination: inttraInq.destination })
          .then(rates => { setInttraResults(rates); setInttraSearched(true) })
          .catch(() => { setInttraResults([]); setInttraSearched(true) })
          .finally(() => setInttraLoading(false))
        break
      }
      case 'prepare-quotation': {
        // Pre-fill quotation document from previous context (rate data)
        const { inquiry: qInq } = item.sourceData
        const qCust = customers.find(c => c.name.toLowerCase() === qInq.customer_name.toLowerCase())
        const ctx = item.previousContext
        // Extract rate info from the previous activity log notes
        let rateSection = ''
        if (ctx?.notes) {
          const rateMatch = ctx.notes.match(/Rates?:\s*(.+)/i)
          const manualMatch = ctx.notes.match(/Manual Rate:\s*(.+)/i)
          if (rateMatch) rateSection = rateMatch[1].split('|')[0].trim()
          else if (manualMatch) rateSection = manualMatch[1].split('|')[0].trim()
        }
        const today = new Date().toISOString().slice(0, 10)
        setQuotationContent(
`QUOTATION

To: ${qInq.customer_name}
Ref: ${qInq.id}
Date: ${today}

Dear ${qInq.customer_name},

Thank you for your inquiry regarding ${qInq.request || 'freight services'}.

We are pleased to quote the following for the route ${qInq.origin} → ${qInq.destination}:

${rateSection || '(Rate details to be filled in)'}

Customer Tier: ${qCust?.tier ?? 'N/A'}
Terms: FOB / FCA
Validity: 14 days from date of quotation

We look forward to your confirmation.

Best regards,
${activeEmployee.name}
ABC Logistics (Pvt) Ltd`
        )
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
          // From InttraAPI/AMS rates: "Maersk $1200 20'GP ..."
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
        setInttraBooking(false)
        setInttraBookResult(null)
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
      default:
        // Actions needing a form modal
        setFormVessel('')
        setFormVoyage('')
        setFormNote('')
        setFormEmail('')
        setFormDecision('approve')
        setKycSending(false)
        setActionModal(item)
        break
    }
  }

  const handleModalSubmit = async () => {
    if (!actionModal) return
    switch (actionModal.actionKind) {
      case 'send-kyc': {
        const { customer } = actionModal.sourceData
        // Send KYC email via API
        if (formEmail.trim() && formEmail.includes('@')) {
          setKycSending(true)
          try {
            await apiSendKyc({ customer_name: customer.name, recipient_email: formEmail.trim() })
          } catch { /* fire-and-forget */ }
          setKycSending(false)
        }
        // Update customer kyc_status → pending_customer (Finance sees it next)
        onUpdateCustomerKyc(customer.name, 'pending_customer')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `KYC form sent to ${formEmail || 'customer'}. Pushed to Finance for verification.`,
          ref_type: 'inquiry',
          ref_id: customer.id,
          customer_name: customer.name,
          pushed_to: 'Finance',
          notes: formNote || `KYC form emailed to ${formEmail}`,
        })
        onFlash(`KYC sent to ${formEmail} — pushed to Finance`)
        break
      }
      case 'verify-kyc': {
        const { customer } = actionModal.sourceData
        const approved = formDecision === 'approve'
        if (approved) {
          onUpdateCustomerKyc(customer.name, 'approved')
          // Auto-advance all stuck inquiries for this customer to rate-check (CS checks AMS first)
          onAutoAdvanceForCustomer(customer.name, 'rate-check')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `KYC verified for ${customer.name}. Customer cleared. Inquiries sent to CS for rate check.`,
            ref_type: 'inquiry',
            ref_id: customer.id,
            customer_name: customer.name,
            pushed_to: 'CS',
            notes: formNote || 'KYC documents verified and approved.',
          })
          onFlash(`KYC verified for ${customer.name} — sent to CS for rate check`)
        } else {
          // Flag — send back to not_started (CS must re-send)
          onUpdateCustomerKyc(customer.name, 'not_started')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `KYC flagged for ${customer.name}. Returned to CS for resubmission.`,
            ref_type: 'inquiry',
            ref_id: customer.id,
            customer_name: customer.name,
            pushed_to: 'CS',
            notes: formNote || 'KYC documents need resubmission.',
          })
          onFlash(`KYC flagged — ${customer.name} returned to CS`)
        }
        break
      }
      case 'check-rates': {
        const { inquiry } = actionModal.sourceData
        const selectedRates = rateResults.filter(r => selectedRateIds.has(r.id))

        if (selectedRates.length > 0) {
          // Rates selected → advance to quotation-prep (Sales)
          onAdvanceWorkflow(inquiry.id, 'quotation-prep')
          const ratesSummary = selectedRates
            .map(r => `${r.liner_name} ${r.rate_type} $${r.amount} (${r.container_type})`)
            .join('; ')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `Rates checked. ${selectedRates.length} rate(s) selected from AMS. Pushed to Sales for quotation.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'Sales',
            notes: formNote ? `${formNote} | Selected rates: ${ratesSummary}` : `Selected rates: ${ratesSummary}`,
          })
          onFlash(`${inquiry.id} → ${selectedRates.length} rate(s) sent to Sales`)
        } else {
          // No rates selected → escalate to Procurement
          onAdvanceWorkflow(inquiry.id, 'procurement-request')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `No suitable rates found in AMS. Escalated to Procurement for rate procurement.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'Procurement',
            notes: formNote || `${inquiry.origin} → ${inquiry.destination} — no matching rates in system`,
          })
          onFlash(`${inquiry.id} → No rates found, escalated to Procurement`)
        }
        break
      }
      case 'check-inttra-rates': {
        const { inquiry } = actionModal.sourceData
        const cust = customers.find(c => c.name.toLowerCase() === inquiry.customer_name.toLowerCase())

        if (selectedInttraIds.size > 0) {
          // InttraAPI rates selected
          const selectedRates = inttraResults.filter(r => selectedInttraIds.has(r.spotRateId))
          const ratesSummary = selectedRates
            .map(r => {
              const c = toInttraCard(r)
              return `${c.carrierName} $${c.totalPriceUSD} ${c.containerType} ${c.transitTimeInDays}d (valid ${c.validFromDate}→${c.validToDate})`
            })
            .join('; ')
          onAdvanceWorkflow(inquiry.id, 'quotation-prep')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `InttraAPI spot rates checked. ${selectedRates.length} rate(s) selected. Rate brief prepared and sent to Sales.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'Sales',
            notes: formNote
              ? `${formNote} | Customer: ${inquiry.customer_name} (${cust?.tier ?? 'N/A'}) | Route: ${inquiry.origin} → ${inquiry.destination} | Rates: ${ratesSummary}`
              : `Customer: ${inquiry.customer_name} (${cust?.tier ?? 'N/A'}) | Route: ${inquiry.origin} → ${inquiry.destination} | Rates: ${ratesSummary}`,
          })
          onFlash(`${inquiry.id} → Rate brief sent to Sales`)
        } else {
          // Manual rate entry (no InttraAPI results)
          const manualSummary = [
            `carrierName=${manualLiner || 'Custom'}`,
            `carrierScac=${manualScac || '?'}`,
            `totalPriceUSD=${manualAmount || '0'}`,
            `containerType=${manualContainer}`,
            `transitTimeInDays=${manualTransit || '?'}`,
            `freeTimeInDays=${manualFreeTime || '?'}`,
            `validFromDate=${manualValidFrom || '?'}`,
            `validToDate=${manualValidTo || '?'}`,
            `bookingCutoffDate=${manualCutoff || '?'}`,
          ].join(', ')
          onAdvanceWorkflow(inquiry.id, 'quotation-prep')
          onLogActivity({
            actor_role: activeRole,
            actor_id: activeEmployee.id,
            action: `No InttraAPI rates available. Manual rate document created and sent to Sales.`,
            ref_type: 'inquiry',
            ref_id: inquiry.id,
            customer_name: inquiry.customer_name,
            pushed_to: 'Sales',
            notes: formNote
              ? `${formNote} | Customer: ${inquiry.customer_name} (${cust?.tier ?? 'N/A'}) | Route: ${inquiry.origin} → ${inquiry.destination} | Manual Rate: ${manualSummary}${manualAttachment ? ` | Attachment: ${manualAttachment}` : ''}`
              : `Customer: ${inquiry.customer_name} (${cust?.tier ?? 'N/A'}) | Route: ${inquiry.origin} → ${inquiry.destination} | Manual Rate: ${manualSummary}${manualAttachment ? ` | Attachment: ${manualAttachment}` : ''}`,
          })
          onFlash(`${inquiry.id} → Manual rate brief sent to Sales`)
        }
        break
      }
      case 'prepare-quotation': {
        const { inquiry } = actionModal.sourceData
        onAdvanceWorkflow(inquiry.id, 'quotation-sent')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Quotation prepared for ${inquiry.customer_name}. Sent to CS for delivery.`,
          ref_type: 'inquiry',
          ref_id: inquiry.id,
          customer_name: inquiry.customer_name,
          pushed_to: 'CS',
          notes: formNote
            ? `${formNote} | Quotation:\n${quotationContent}`
            : `Quotation:\n${quotationContent}`,
        })
        onFlash(`${inquiry.id} → Quotation sent to CS for delivery`)
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
        onFlash(`${inquiry.id} → Quotation sent to ${inquiry.customer_name} via ${sendMethod === 'email' ? 'Email' : 'WhatsApp'}`)
        break
      }
      case 'customer-response': {
        const { inquiry } = actionModal.sourceData
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
          onFlash(`${inquiry.id} → ${inquiry.customer_name} accepted — ready for booking request`)
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
          booked_by: activeEmployee.id,
          notes: formNote || `Booking for ${inquiry.customer_name}: ${inquiry.request}`,
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
        onFlash(`${inquiry.id} → Booking request sent to Procurement`)
        break
      }
      case 'confirm-booking': {
        const { booking } = actionModal.sourceData
        onConfirmBooking(booking.id, formVessel, formVoyage)
        const ref = inttraBookResult?.booking_reference ?? ''
        const etd = inttraBookResult?.etd ?? ''
        const eta = inttraBookResult?.eta ?? ''
        const confirmNotes = [
          `Vessel: ${formVessel || 'TBD'}, Voyage: ${formVoyage || 'TBD'}`,
          ref ? `Booking Ref: ${ref}` : '',
          etd ? `ETD: ${etd}` : '',
          eta ? `ETA: ${eta}` : '',
          formNote ?? '',
        ].filter(Boolean).join(' | ')
        onLogActivity({
          actor_role: activeRole,
          actor_id: activeEmployee.id,
          action: `Liner confirmed via ${inttraBookResult ? 'InttraAPI' : 'manual entry'}. Vessel: ${formVessel || 'TBD'}, Voyage: ${formVoyage || 'TBD'}${ref ? `, Ref: ${ref}` : ''}.`,
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
        onFlash(`${booking.id} → Release order sent to ${booking.customer_name} ${sendVia}`)
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

  return (
    <div className="db-page-anim">
      {/* Header */}
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Workspace</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Your role-specific inbox &mdash; complete your tasks and push to the next team
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="db-badge" style={{ background: roleColor + '12', color: roleColor, border: `1px solid ${roleColor}30` }}>
              {ROLE_LABELS[activeRole]}
            </span>
            <span className="db-badge muted">
              {pendingItems.length} pending
            </span>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {availableFilters.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Filter size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <button
            className={`db-btn ${activeFilter === 'all' ? 'primary' : ''}`}
            style={activeFilter === 'all'
              ? { fontSize: 11, padding: '4px 12px', borderRadius: 20 }
              : { fontSize: 11, padding: '4px 12px', borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            onClick={() => setActiveFilter('all')}
          >
            All ({pendingItems.length})
          </button>
          {availableFilters.map(f => (
            <button
              key={f.key}
              className={`db-btn ${activeFilter === f.key ? 'primary' : ''}`}
              style={activeFilter === f.key
                ? { fontSize: 11, padding: '4px 12px', borderRadius: 20 }
                : { fontSize: 11, padding: '4px 12px', borderRadius: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              onClick={() => setActiveFilter(f.key)}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filteredItems.length === 0 ? (
        <div className="db-chart-card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <Inbox size={40} style={{ color: 'var(--text-muted)', marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
            All caught up
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No items need your attention right now. Check back later or switch roles to see other queues.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {filteredItems.map(item => {
            const Icon = TYPE_ICON[item.type]
            const ctx = item.previousContext
            return (
              <div key={`${item.type}-${item.refId}-${item.actionKind}`} className="db-chart-card ws-item-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Type icon */}
                  <div className="ws-type-icon" style={{ background: roleColor + '10', color: roleColor }}>
                    <Icon size={16} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{item.refId}</span>
                      <span className={TYPE_BADGE_CLASS[item.type]}>{item.type}</span>
                      {item.urgentFlag && (
                        <span className="db-badge danger" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <AlertTriangle size={10} /> Urgent
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                      {item.subtitle}
                    </div>

                    {/* Previous step context */}
                    {ctx && (
                      <div className="ws-context-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <User size={11} style={{ color: 'var(--text-muted)' }} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {empName(ctx.actor_id)} ({ROLE_LABELS[ctx.actor_role]})
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{ctx.timestamp}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ctx.action}</div>
                        {ctx.notes && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{ctx.notes}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Push button */}
                  <button
                    className="db-btn primary"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}
                    onClick={() => handleAction(item)}
                  >
                    {item.actionLabel} <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recently Pushed */}
      {recentlyPushed.length > 0 && (
        <div className="db-chart-card">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">Recently Pushed</div>
              <div className="db-chart-sub">Items you have completed and handed off</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {recentlyPushed.map(a => (
              <div key={a.id} className="ws-pushed-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Check size={12} style={{ color: '#16a34a' }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{a.ref_id}</span>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{a.customer_name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{a.action}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.timestamp}</span>
                  <ArrowRight size={10} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 10, color: ROLE_COLORS[a.pushed_to] ?? 'var(--text-muted)', fontWeight: 600 }}>
                    {ROLE_LABELS[a.pushed_to] ?? a.pushed_to}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="lt-modal-backdrop" onClick={() => setActionModal(null)}>
          <div className="lt-modal" onClick={e => e.stopPropagation()} style={{ width: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>{actionModal.refId}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>{actionModal.actionLabel}</div>
              </div>
              <button className="lt-icon-btn" onClick={() => setActionModal(null)}><X size={14} /></button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              {actionModal.title}
            </div>

            {/* Send KYC form */}
            {actionModal.actionKind === 'send-kyc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '10px 14px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.18)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#0891b2' }}>
                  <Mail size={14} />
                  The KYC form will be emailed to the customer via Resend. After sending, this item moves to Finance for verification.
                </div>
                <div>
                  <label className="lt-label">Customer</label>
                  <input className="lt-input" style={{ width: '100%', background: 'rgba(0,0,0,0.04)' }} value={actionModal.customerName} disabled />
                </div>
                <div>
                  <label className="lt-label">Recipient Email <span style={{ color: '#dc2626' }}>*</span></label>
                  <input className="lt-input" style={{ width: '100%' }} type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="customer@example.com" autoFocus />
                </div>
                <div>
                  <label className="lt-label">Notes (optional)</label>
                  <input className="lt-input" style={{ width: '100%' }} value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="Any instructions for the customer..." />
                </div>
              </div>
            )}

            {/* Verify KYC form (Finance) */}
            {actionModal.actionKind === 'verify-kyc' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {actionModal.previousContext && (
                  <div className="ws-context-card" style={{ marginTop: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <User size={11} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {empName(actionModal.previousContext.actor_id)} ({ROLE_LABELS[actionModal.previousContext.actor_role]})
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{actionModal.previousContext.action}</div>
                    {actionModal.previousContext.notes && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>{actionModal.previousContext.notes}</div>
                    )}
                  </div>
                )}
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
            )}

            {/* Prepare Quotation (Sales) */}
            {actionModal.actionKind === 'prepare-quotation' && (() => {
              const ctx = actionModal.previousContext
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ padding: '10px 14px', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.18)', borderRadius: 8, fontSize: 12, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Edit3 size={14} />
                    Edit the quotation document below, then send to CS for delivery to the customer.
                  </div>

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
                    <label className="lt-label">Quotation Document</label>
                    <textarea
                      className="lt-input"
                      style={{ width: '100%', minHeight: 280, fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5, resize: 'vertical' }}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                        <FileText size={14} style={{ color: '#4f46e5' }} />
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <div style={{ padding: '10px 14px', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{brInq.customer_name}</strong> — {brInq.origin} → {brInq.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>{brInq.request}</div>
                  </div>

                  <div>
                    <label className="lt-label">Preferred Shipping Line</label>
                    <input className="lt-input" style={{ width: '100%' }} value={bkShippingLine}
                      onChange={e => setBkShippingLine(e.target.value)}
                      placeholder="e.g. Maersk, MSC, Hapag-Lloyd (or leave blank for any)" />
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                  <div style={{ padding: '10px 14px', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 8, fontSize: 12 }}>
                    <strong>{cbkg.customer_name}</strong> — {cbkg.origin} → {cbkg.destination}
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {cbkg.quantity}x {cbkg.container_type} · {cbkg.shipping_line || 'Any liner'}
                    </div>
                  </div>

                  {/* Book via InttraAPI button */}
                  {!inttraBookResult && (
                    <button
                      className="db-btn primary"
                      disabled={inttraBooking}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}
                      onClick={async () => {
                        setInttraBooking(true)
                        try {
                          const result = await apiBookInttra({
                            booking_id: cbkg.id,
                            shipping_line: cbkg.shipping_line || '',
                            origin: cbkg.origin,
                            destination: cbkg.destination,
                            container_type: cbkg.container_type,
                            quantity: cbkg.quantity,
                          })
                          setInttraBookResult(result)
                          setFormVessel(result.vessel_name)
                          setFormVoyage(result.voyage_number)
                        } catch {
                          onFlash('InttraAPI booking failed — enter details manually')
                        }
                        setInttraBooking(false)
                      }}
                    >
                      {inttraBooking
                        ? <><Loader2 size={13} className="spin" /> Booking with liner via InttraAPI...</>
                        : <><Globe size={13} /> Book with Liner via InttraAPI</>}
                    </button>
                  )}

                  {/* InttraAPI confirmation result */}
                  {inttraBookResult && (
                    <div style={{ padding: '14px 16px', background: 'rgba(22,163,106,0.06)', border: '1px solid rgba(22,163,106,0.2)', borderRadius: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Check size={14} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#16a34a' }}>Booking Confirmed</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 12 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Reference:</span> <strong>{inttraBookResult.booking_reference}</strong></div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Liner:</span> {inttraBookResult.shipping_line}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Vessel:</span> {inttraBookResult.vessel_name}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Voyage:</span> {inttraBookResult.voyage_number}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>ETD:</span> {inttraBookResult.etd}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>ETA:</span> {inttraBookResult.eta}</div>
                      </div>
                    </div>
                  )}

                  {/* Manual override / fallback fields */}
                  {!inttraBookResult && (
                    <>
                      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: '4px 0' }}>— or enter manually —</div>
                      <div>
                        <label className="lt-label">Vessel Name</label>
                        <input className="lt-input" style={{ width: '100%' }} value={formVessel} onChange={e => setFormVessel(e.target.value)} placeholder="e.g. Maersk Seletar" />
                      </div>
                      <div>
                        <label className="lt-label">Voyage Number</label>
                        <input className="lt-input" style={{ width: '100%' }} value={formVoyage} onChange={e => setFormVoyage(e.target.value)} placeholder="e.g. VOY-2026-042" />
                      </div>
                    </>
                  )}

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
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

            {/* Check Rates modal (AMS lookup) */}
            {actionModal.actionKind === 'check-rates' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '10px 14px', background: 'rgba(8,145,178,0.06)', border: '1px solid rgba(8,145,178,0.18)', borderRadius: 8, fontSize: 12, color: '#0891b2' }}>
                  Searching AMS for rates: <strong>{actionModal.sourceData.inquiry.origin} → {actionModal.sourceData.inquiry.destination}</strong>
                </div>

                {ratesLoading && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="spin" style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 13 }}>Searching rates...</div>
                  </div>
                )}

                {ratesSearched && rateResults.length === 0 && (
                  <div style={{ padding: 16, textAlign: 'center', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#dc2626', marginBottom: 4 }}>No rates found</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      No matching rates in AMS for this route. Click &ldquo;Escalate to Procurement&rdquo; to request rates from liners.
                    </div>
                  </div>
                )}

                {ratesSearched && rateResults.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {rateResults.length} rate(s) found — select one or more to send to Sales
                    </div>
                    <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {rateResults.map(rate => {
                        const selected = selectedRateIds.has(rate.id)
                        return (
                          <label
                            key={rate.id}
                            className="ws-rate-row"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                              border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                              borderRadius: 8, cursor: 'pointer',
                              background: selected ? 'rgba(79,70,229,0.04)' : 'transparent',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setSelectedRateIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(rate.id)) next.delete(rate.id)
                                  else next.add(rate.id)
                                  return next
                                })
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                {rate.liner_name}
                                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>
                                  {rate.container_type} · {rate.rate_type}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Valid: {rate.valid_from} → {rate.valid_to}
                                {rate.source_system && ` · ${rate.source_system}`}
                              </div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                              ${rate.amount.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{rate.currency}</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </>
                )}

                {ratesSearched && (
                  <div>
                    <label className="lt-label">Notes (optional)</label>
                    <input className="lt-input" style={{ width: '100%' }} value={formNote}
                      onChange={e => setFormNote(e.target.value)}
                      placeholder="Any notes for the next team..." />
                  </div>
                )}
              </div>
            )}

            {/* InttraAPI Rate Check + Document Preview (Procurement) */}
            {actionModal.actionKind === 'check-inttra-rates' && (() => {
              const inq = actionModal.sourceData.inquiry
              const custData = customers.find(c => c.name.toLowerCase() === inq.customer_name.toLowerCase())
              const hasManualEntry = !!(manualLiner.trim() && manualAmount.trim())
              return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: '10px 14px', background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.18)', borderRadius: 8, fontSize: 12, color: '#d97706', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Globe size={14} />
                  Querying InttraAPI for spot rates: <strong style={{ marginLeft: 4 }}>{inq.origin} → {inq.destination}</strong>
                </div>

                {inttraLoading && (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                    <Loader2 size={20} className="spin" style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 13 }}>Connecting to InttraAPI...</div>
                  </div>
                )}

                {inttraSearched && inttraResults.length === 0 && (
                  <div style={{ padding: 12, background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>No spot rates available</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>InttraAPI returned no rates for this route. You can enter rates manually below.</div>
                  </div>
                )}

                {inttraSearched && inttraResults.length > 0 && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {inttraResults.length} spot rate(s) from InttraAPI — select rates to include in the brief
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {inttraResults.map(offer => {
                        const card = toInttraCard(offer)
                        const selected = selectedInttraIds.has(card.spotRateId)
                        return (
                          <label
                            key={card.spotRateId}
                            className="ws-rate-row"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                              border: `1px solid ${selected ? '#d97706' : 'var(--border)'}`,
                              borderRadius: 8, cursor: 'pointer',
                              background: selected ? 'rgba(217,119,6,0.04)' : 'transparent',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                setSelectedInttraIds(prev => {
                                  const next = new Set(prev)
                                  if (next.has(card.spotRateId)) next.delete(card.spotRateId)
                                  else next.add(card.spotRateId)
                                  return next
                                })
                              }}
                            />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                                {card.carrierName}
                                <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{card.carrierScac}</span>
                                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8 }}>{card.containerType}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {card.transitTimeInDays}d transit · Free time: {card.freeTimeInDays}d · Cut-off: {card.bookingCutoffDate}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Valid: {card.validFromDate} → {card.validToDate}
                              </div>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', whiteSpace: 'nowrap' }}>
                              ${card.totalPriceUSD.toLocaleString()} <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>USD</span>
                            </div>
                          </label>
                        )
                      })}
                    </div>

                    {/* Pre-filled Rate Brief Document */}
                    {selectedInttraIds.size > 0 && (() => {
                      const selectedCards = inttraResults
                        .filter(r => selectedInttraIds.has(r.spotRateId))
                        .map(toInttraCard)
                      return (
                        <div className="ws-doc-preview">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <FileDown size={14} style={{ color: '#d97706' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Rate Brief (Pre-filled)</span>
                          </div>
                          <div className="ws-doc-body">
                            <div className="ws-doc-header">RATE BRIEF</div>
                            <div className="ws-doc-sub">ABC Logistics (Pvt) Ltd</div>
                            <div className="ws-doc-divider" />
                            <div className="ws-doc-section">Customer</div>
                            <div className="ws-doc-row"><span>Name:</span><strong>{inq.customer_name}</strong></div>
                            <div className="ws-doc-row"><span>Tier:</span><strong>{custData?.tier ?? 'N/A'}</strong></div>
                            <div className="ws-doc-row"><span>Location:</span><strong>{custData?.location ?? 'N/A'}</strong></div>
                            <div className="ws-doc-divider" />
                            <div className="ws-doc-section">Inquiry</div>
                            <div className="ws-doc-row"><span>Ref:</span><strong>{inq.id}</strong></div>
                            <div className="ws-doc-row"><span>Route:</span><strong>{inq.origin} → {inq.destination}</strong></div>
                            <div className="ws-doc-row"><span>Request:</span><strong>{inq.request}</strong></div>
                            <div className="ws-doc-row"><span>Channel:</span><strong>{inq.channel}</strong></div>
                            <div className="ws-doc-divider" />
                            <div className="ws-doc-section">InttraAPI Spot Rates</div>
                            {selectedCards.map(c => (
                              <div key={c.spotRateId} style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                                <div style={{ fontWeight: 700, fontSize: 12 }}>{c.carrierName} <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({c.carrierScac})</span></div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                  ${c.totalPriceUSD.toLocaleString()} USD / {c.containerType} · {c.transitTimeInDays}d transit · Free time: {c.freeTimeInDays}d
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  Valid: {c.validFromDate} → {c.validToDate} · Cut-off: {c.bookingCutoffDate}
                                </div>
                              </div>
                            ))}
                            <div className="ws-doc-divider" />
                            <div className="ws-doc-row"><span>Prepared by:</span><strong>{activeEmployee.name} (Procurement)</strong></div>
                            <div className="ws-doc-row"><span>Date:</span><strong>{new Date().toISOString().slice(0, 10)}</strong></div>
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}

                {/* Manual Rate Entry — always available */}
                {inttraSearched && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {inttraResults.length > 0 ? 'Or enter manually' : 'Enter rates manually'}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label className="lt-label">Carrier</label>
                        <input className="lt-input" style={{ width: '100%' }} value={manualLiner} onChange={e => setManualLiner(e.target.value)} placeholder="e.g. Maersk Line" />
                      </div>
                      <div>
                        <label className="lt-label">Carrier SCAC</label>
                        <input className="lt-input" style={{ width: '100%' }} value={manualScac} onChange={e => setManualScac(e.target.value.toUpperCase())} placeholder="e.g. MAEU" maxLength={4} />
                      </div>
                      <div>
                        <label className="lt-label">Total Price USD</label>
                        <input className="lt-input" style={{ width: '100%' }} type="number" value={manualAmount} onChange={e => setManualAmount(e.target.value)} placeholder="e.g. 1200" />
                      </div>
                      <div>
                        <label className="lt-label">Container Type</label>
                        <select className="lt-input" style={{ width: '100%' }} value={manualContainer} onChange={e => setManualContainer(e.target.value)}>
                          <option>20&apos;GP</option>
                          <option>40&apos;GP</option>
                          <option>40&apos;HC</option>
                          <option>20&apos;RF</option>
                          <option>40&apos;RF</option>
                        </select>
                      </div>
                      <div>
                        <label className="lt-label">Transit Time in Days</label>
                        <input className="lt-input" style={{ width: '100%' }} type="number" value={manualTransit} onChange={e => setManualTransit(e.target.value)} placeholder="e.g. 14" />
                      </div>
                      <div>
                        <label className="lt-label">Free Time in Days</label>
                        <input className="lt-input" style={{ width: '100%' }} type="number" value={manualFreeTime} onChange={e => setManualFreeTime(e.target.value)} placeholder="e.g. 7" />
                      </div>
                      <div>
                        <label className="lt-label">Valid From</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date" value={manualValidFrom} onChange={e => setManualValidFrom(e.target.value)} />
                      </div>
                      <div>
                        <label className="lt-label">Valid To</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date" value={manualValidTo} onChange={e => setManualValidTo(e.target.value)} />
                      </div>
                      <div>
                        <label className="lt-label">Booking Cut-off Date</label>
                        <input className="lt-input" style={{ width: '100%' }} type="date" value={manualCutoff} onChange={e => setManualCutoff(e.target.value)} />
                      </div>
                      <div>
                        <label className="lt-label">Attach Document</label>
                        <input className="lt-input" style={{ width: '100%' }} value={manualAttachment} onChange={e => setManualAttachment(e.target.value)} placeholder="filename.pdf" />
                      </div>
                    </div>

                    {/* Manual Rate Brief Preview */}
                    {hasManualEntry && selectedInttraIds.size === 0 && (
                      <div className="ws-doc-preview">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <FileDown size={14} style={{ color: '#d97706' }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Rate Brief (Manual)</span>
                        </div>
                        <div className="ws-doc-body">
                          <div className="ws-doc-header">RATE BRIEF</div>
                          <div className="ws-doc-sub">ABC Logistics (Pvt) Ltd — Manual Entry</div>
                          <div className="ws-doc-divider" />
                          <div className="ws-doc-section">Customer</div>
                          <div className="ws-doc-row"><span>Name:</span><strong>{inq.customer_name}</strong></div>
                          <div className="ws-doc-row"><span>Tier:</span><strong>{custData?.tier ?? 'N/A'}</strong></div>
                          <div className="ws-doc-row"><span>Location:</span><strong>{custData?.location ?? 'N/A'}</strong></div>
                          <div className="ws-doc-divider" />
                          <div className="ws-doc-section">Inquiry</div>
                          <div className="ws-doc-row"><span>Ref:</span><strong>{inq.id}</strong></div>
                          <div className="ws-doc-row"><span>Route:</span><strong>{inq.origin} → {inq.destination}</strong></div>
                          <div className="ws-doc-row"><span>Request:</span><strong>{inq.request}</strong></div>
                          <div className="ws-doc-divider" />
                          <div className="ws-doc-section">Procurement Rate (Manual)</div>
                          <div style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>
                              {manualLiner}
                              {manualScac ? <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 }}>{manualScac}</span> : null}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                              ${Number(manualAmount).toLocaleString()} USD / {manualContainer}
                              {manualTransit ? ` · ${manualTransit}d transit` : ''}
                              {manualFreeTime ? ` · Free time: ${manualFreeTime}d` : ''}
                            </div>
                            {(manualValidFrom || manualValidTo || manualCutoff) && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {manualValidFrom || manualValidTo ? `Valid: ${manualValidFrom || '?'} → ${manualValidTo || '?'}` : ''}
                                {manualCutoff ? `${manualValidFrom || manualValidTo ? ' · ' : ''}Cut-off: ${manualCutoff}` : ''}
                              </div>
                            )}
                          </div>
                          {manualAttachment && (
                            <div className="ws-doc-row" style={{ marginTop: 6 }}>
                              <span>Attached:</span><strong>{manualAttachment}</strong>
                            </div>
                          )}
                          <div className="ws-doc-divider" />
                          <div className="ws-doc-row"><span>Prepared by:</span><strong>{activeEmployee.name} (Procurement)</strong></div>
                          <div className="ws-doc-row"><span>Date:</span><strong>{new Date().toISOString().slice(0, 10)}</strong></div>
                          <div className="ws-doc-row"><span>Source:</span><strong>Manual — liner contacted directly</strong></div>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="lt-label">Notes (optional)</label>
                      <input className="lt-input" style={{ width: '100%' }} value={formNote}
                        onChange={e => setFormNote(e.target.value)}
                        placeholder="Any notes for Sales..." />
                    </div>
                  </>
                )}
              </div>
              )
            })()}

            {/* Quote approval form */}
            {actionModal.actionKind === 'approve-quote' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="db-btn" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }} onClick={() => setActionModal(null)}>Cancel</button>
              <button
                className="db-btn primary"
                disabled={
                  (actionModal.actionKind === 'send-kyc' && (!formEmail.trim() || !formEmail.includes('@'))) ||
                  (actionModal.actionKind === 'check-rates' && ratesLoading) ||
                  (actionModal.actionKind === 'check-inttra-rates' && (inttraLoading || !inttraSearched)) ||
                  (actionModal.actionKind === 'check-inttra-rates' && inttraSearched && selectedInttraIds.size === 0 && (!manualLiner.trim() || !manualAmount.trim())) ||
                  (actionModal.actionKind === 'prepare-quotation' && !quotationContent.trim()) ||
                  (actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  (actionModal.actionKind === 'confirm-booking' && !formVessel.trim() && !inttraBookResult) ||
                  (actionModal.actionKind === 'confirm-booking' && inttraBooking) ||
                  (actionModal.actionKind === 'release-booking' && sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) ||
                  (actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' && !waConfirmed) ||
                  kycSending || quotationSending
                }
                style={
                  actionModal.actionKind === 'verify-kyc' && formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'verify-kyc' ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'approve-quote' && formDecision === 'reject' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'check-rates' && selectedRateIds.size === 0 && ratesSearched ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'check-inttra-rates' && (selectedInttraIds.size > 0 || (manualLiner.trim() && manualAmount.trim())) ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'prepare-quotation' ? { background: '#4f46e5', borderColor: '#4f46e5' } :
                  actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' && customerContactEmail.includes('@') ? {} :
                  actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'customer-response' && customerDecision === 'rejected' ? { background: '#dc2626', borderColor: '#dc2626' } :
                  actionModal.actionKind === 'booking-request' ? { background: '#4f46e5', borderColor: '#4f46e5' } :
                  actionModal.actionKind === 'confirm-booking' && inttraBookResult ? { background: '#16a34a', borderColor: '#16a34a' } :
                  actionModal.actionKind === 'confirm-booking' && formVessel.trim() ? { background: '#d97706', borderColor: '#d97706' } :
                  actionModal.actionKind === 'confirm-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' && waConfirmed ? { background: '#25d366', borderColor: '#25d366' } :
                  actionModal.actionKind === 'release-booking' && sendMethod === 'email' && customerContactEmail.includes('@') ? {} :
                  actionModal.actionKind === 'release-booking' ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'send-kyc' && (!formEmail.trim() || !formEmail.includes('@'))) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'check-inttra-rates' && (inttraLoading || !inttraSearched || (selectedInttraIds.size === 0 && (!manualLiner.trim() || !manualAmount.trim())))) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'prepare-quotation' && !quotationContent.trim()) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  (actionModal.actionKind === 'send-to-customer' && ((sendMethod === 'email' && (!customerContactEmail.trim() || !customerContactEmail.includes('@'))) || (sendMethod === 'whatsapp' && !waConfirmed))) ? { opacity: 0.4, cursor: 'not-allowed' } :
                  {}
                }
                onClick={handleModalSubmit}
              >
                {kycSending ? <><Loader2 size={12} className="spin" /> Sending...</> :
                 quotationSending ? <><Loader2 size={12} className="spin" /> Sending...</> :
                 actionModal.actionKind === 'send-kyc' ? <><Mail size={12} /> Send KYC &amp; Push</> :
                 actionModal.actionKind === 'verify-kyc' && formDecision === 'reject' ? 'Flag & Return to CS' :
                 actionModal.actionKind === 'verify-kyc' ? <><ShieldCheck size={12} /> Verify &amp; Push</> :
                 actionModal.actionKind === 'check-rates' && selectedRateIds.size > 0 ? <><ChevronRight size={12} /> Send {selectedRateIds.size} Rate(s) to Sales</> :
                 actionModal.actionKind === 'check-rates' && ratesSearched ? 'Escalate to Procurement' :
                 actionModal.actionKind === 'check-inttra-rates' && selectedInttraIds.size > 0 ? <><FileDown size={12} /> Send Rate Brief to Sales ({selectedInttraIds.size} rate{selectedInttraIds.size > 1 ? 's' : ''})</> :
                 actionModal.actionKind === 'check-inttra-rates' && manualLiner.trim() && manualAmount.trim() ? <><FileDown size={12} /> Send Manual Rate Brief to Sales</> :
                 actionModal.actionKind === 'prepare-quotation' ? <><Send size={12} /> Send Quotation to CS</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'email' ? <><Mail size={12} /> Send via Email</> :
                 actionModal.actionKind === 'send-to-customer' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'accepted' ? <><Check size={12} /> Customer Accepted — Proceed to Booking</> :
                 actionModal.actionKind === 'customer-response' && customerDecision === 'rejected' ? <><X size={12} /> Customer Rejected — Close Inquiry</> :
                 actionModal.actionKind === 'booking-request' ? <><Ship size={12} /> Create Booking &amp; Send to Procurement</> :
                 actionModal.actionKind === 'confirm-booking' && inttraBookResult ? <><Check size={12} /> Confirm &amp; Send to CS</> :
                 actionModal.actionKind === 'confirm-booking' && formVessel.trim() ? <><Ship size={12} /> Confirm Manually &amp; Send to CS</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'email' ? <><Mail size={12} /> Release &amp; Send via Email</> :
                 actionModal.actionKind === 'release-booking' && sendMethod === 'whatsapp' ? <><MessageCircle size={12} /> Release &amp; Confirm WhatsApp Sent</> :
                 actionModal.actionKind === 'approve-quote' && formDecision === 'reject' ? 'Reject' :
                 <>Confirm &amp; Push <ChevronRight size={12} /></>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
