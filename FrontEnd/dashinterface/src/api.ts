/**
 * REST API client for the FastAPI backend.
 *
 * Mutations use an optimistic-UI pattern: local state is updated immediately
 * and the API call persists the change to the database in the background.
 * If the call fails, the caller is responsible for surfacing the error.
 */
import type {
  Inquiry, Customer, Task, MissingItem, Followup, Quote, Shipment, Employee, Booking,
  QuoteStatus, CustomerTier, PaymentTerms, SBU, QuoteLine, ActivityEntry, KycStatus, RateRecord,
  DeliveryType, UnifiedRate, PortRecord, ServiceScope, RateSourceType,
  LinerRecord, TradeLaneRecord, ContactPersonRecord, EmployeeRecord, ClientRecord,
  ContainerLine,
} from './types'

const BASE = import.meta.env.VITE_API_BASE || '/api'

// --- TEMPORARY dev auth -----------------------------------------------------
// The Azure AD SSO flow is not wired up yet. Until it is, paste a token into
// the browser console:   localStorage.setItem('devToken', '<token>')
// Remove this block once /auth/login -> /auth/callback is implemented.
function authHeaders(): Record<string, string> {
  const t = localStorage.getItem('devToken')
  return t ? { Authorization: `Bearer ${t}` } : {}
}
// -----------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    console.error(`POST ${path} failed ${res.status}:`, detail)
    // Surface FastAPI validation detail in the error message
    let msg = `POST ${path} failed: ${res.status}`
    if (detail) {
      msg += ' — ' + JSON.stringify(detail)
    }
    throw new Error(msg)
  }
  return res.json()
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`)
  return res.json()
}

async function postFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...authHeaders() },   // NO Content-Type — the browser sets it with the boundary
    body: form,
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(`POST ${path} failed: ${res.status}${detail ? ' — ' + JSON.stringify(detail) : ''}`)
  }
  return res.json()
}


// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export function apiSwitchUser(empId: number): Promise<Employee> {
  return post<Employee>(`/auth/switch-user/${empId}`, {})
}

// ---------------------------------------------------------------------------
// Dashboard bulk load
// ---------------------------------------------------------------------------

export interface DashboardInit {
  customers: Customer[]
  inquiries: Inquiry[]
  tasks: Task[]
  missing_items: MissingItem[]
  followups: Followup[]
  quotes: Quote[]
  shipments: Shipment[]
  employees: Employee[]
  bookings: Booking[]
  activity_log: ActivityEntry[]
}

export function fetchDashboardInit(): Promise<DashboardInit> {
  return get<DashboardInit>('/dashboard/init')
}

// ---------------------------------------------------------------------------
// Inquiries
// ---------------------------------------------------------------------------

// Shape returned by all three create endpoints
export interface InquiryCreateResult {
  inq_id: number
  cli_id: number
  cpid: number
  com_ids: number[]
  cont_ids: number[]
}

// Shape returned by GET /inquiries/inquiries and GET /inquiries/inquiries/{inq_id}
// One row per commodity-container join. cl.name is the client company name.
export interface InquiryRow {
  inq_id: number
  cli_id: number        // backend client PK — used for KYC status lookup
  rfq_ref: number | null
  workflow_stage: string | null  // from LEFT JOIN workflow_stats; null for brand-new rows
  kyc_completed: boolean | null  // joined from kyc_request; true when kyc_stage = 'kyc_completed'
  name: string          // client company name (cl.name)
  sbu: string | null
  origin: string
  incoterm: string | null
  priority: string | null
  service_mode: 'DOOR_TO_DOOR' | 'PORT_TO_PORT' | 'PORT_TO_DOOR' | 'DOOR_TO_PORT' | null
  cargo_ready_date: string | null
  preferred_liners: string | null
  preferred_rate: number | null
  com_id: number
  commodity_name: string | null
  commodity_type: string | null
  hs_code: string | null
  commodity_weight: number | null
  cont_id: number
  container_type: string | null
  temperature: number | null
  qty: number | null
  destination: string
  zip_code: string | null
  address: string | null
  is_fully_loaded: boolean
  free_time: string | null
}

/**
 * Create a new inquiry with a brand-new client and contact person.
 *
 * Transforms the flat frontend payload into the backend's nested structure:
 *   { client, contact, inquiry, commodities[], containers[] }
 *
 * Each frontend ContainerLine maps to one CommodityNew + one ContainerNew entry.
 * commodity_index links each container back to its commodity by array position.
 * ContainerLine.isFcl is mapped to ContainerNew.is_fully_loaded (per backend convention).
 *
 * TODO: Fields dropped at this boundary (no backend column / endpoint yet):
 *   • request / inquiry_text  — free-text description; no inquiry-table column
 *   • destination (inquiry-level) — stored per container only, not at inquiry level
 *   • channel label — value routed to contact.email/whatsapp/phone/wechat;
 *     the label itself ('Email'|'WhatsApp'|'Phone'|'WeChat') has no column
 *   • employee_id in payload — derived from auth session on the backend
 *   • ContainerLine.doorAgents[] — no backend equivalent
 *   • preferred_liners[] (array) — joined to comma string; splitting on read required
 *
 * ENDPOINTS NOT YET IN BACKEND:
 *   • apiAdvanceWorkflow  — no /workflow-stage route
 *   • Delete inquiry      — no DELETE endpoint
 *   • Fetch all inquiries — no list/paginate endpoint (single-record GET only)
 */
export function apiCreateInquiry(data: {
  customer_name: string
  inquiry_text?: string
  request?: string
  origin?: string
  destination?: string
  delivery_type?: DeliveryType
  channel?: string
  sbu?: SBU
  employee_id?: number
  priority?: string
  incoterm?: string
  cargo_ready_date?: string
  preferred_rate?: number
  commodity_type?: string
  container_type?: string
  container_qty?: number
  cargo_weight?: number
  is_fcl?: boolean
  remark?: string
  contact_person?: string
  contact_designation?: string
  contact_channel_id?: string
  containers?: ContainerLine[]
  preferred_liners?: string[]
}): Promise<InquiryCreateResult> {
  // Log fields that are silently dropped (no backend storage yet)
  // TODO: remove these warnings once the backend adds the missing columns/endpoints
  const dropped: Record<string, unknown> = {}
  if (data.request)       dropped['request']                    = data.request
  if (data.destination)   dropped['destination (inquiry-level)']= data.destination
  if (data.channel)       dropped['channel label']              = data.channel
  if (data.employee_id)   dropped['employee_id']                = data.employee_id
  if (Object.keys(dropped).length > 0)
    console.warn('[apiCreateInquiry] Fields dropped — no backend column:', dropped)

  const channel = data.channel ?? 'Email'
  const contactEmail    = channel === 'Email'    ? (data.contact_channel_id ?? undefined) : undefined
  const contactWhatsapp = channel === 'WhatsApp' ? (data.contact_channel_id ?? undefined) : undefined
  const contactPhone    = channel === 'Phone'    ? (data.contact_channel_id ?? undefined) : undefined
  const contactWechat   = channel === 'WeChat'   ? (data.contact_channel_id ?? undefined) : undefined

  const serviceMode = data.delivery_type === 'door-to-door' ? 'DOOR_TO_DOOR'
    : data.delivery_type === 'port-to-door' ? 'PORT_TO_DOOR'
    : data.delivery_type === 'door-to-port' ? 'DOOR_TO_PORT'
    : 'PORT_TO_PORT'

  const frontendContainers = data.containers ?? []

  // Build parallel commodity + container arrays.
  // If the form used the multi-container panel, each ContainerLine yields one of each.
  // If it used the single-container shorthand fields, synthesise one pair.
  let commodities: object[]
  let beContainers: object[]

  if (frontendContainers.length > 0) {
    commodities = frontendContainers.map(c => ({
      com_type:    c.commodityType ?? undefined,
      name:        c.commodityName || undefined,
      weight:      c.weight !== '' ? c.weight : undefined,
      hs_code:     c.hs_code      ?? undefined,
      description: c.description  ?? undefined,
    }))
    beContainers = frontendContainers.map((c, idx) => ({
      commodity_index: idx,
      container_type:  c.containerType ?? undefined,
      qty:             c.quantity,
      destination:     c.destination || data.destination || '',
      zip_code:        c.zipCode     || undefined,
      address:         c.address     ?? undefined,
      temperature:     c.temperature ?? undefined,
      free_time:       c.freeTime !== '' ? String(c.freeTime) : undefined,
      is_fully_loaded: c.isFcl,  // TODO: doorAgents (c.doorAgents) has no backend field
    }))
  } else {
    // Single-container shorthand path
    commodities = [{
      com_type: data.commodity_type ?? undefined,
      weight:   data.cargo_weight   ?? undefined,
    }]
    beContainers = [{
      commodity_index: 0,
      container_type:  data.container_type  ?? undefined,
      qty:             data.container_qty   ?? undefined,
      destination:     data.destination     ?? '',
      is_fully_loaded: data.is_fcl          ?? false,
    }]
  }

  const payload = {
    client: {
      name:          data.customer_name,
      kyc_completed: false,
    },
    contact: {
      name:        data.contact_person      ?? data.customer_name,
      designation: data.contact_designation ?? undefined,
      email:       contactEmail,
      whatsapp:    contactWhatsapp,
      phone:       contactPhone,
      wechat:      contactWechat,
    },
    inquiry: {
      sbu:              data.sbu              ?? undefined,
      origin:           data.origin           ?? '',
      service_mode:     serviceMode,
      priority:         data.priority         ?? undefined,
      incoterm:         data.incoterm         ?? undefined,
      cargo_ready_date: data.cargo_ready_date ?? undefined,
      preferred_rate:   data.preferred_rate   ?? undefined,
      remark:           data.remark           ?? undefined,
      preferred_liners: data.preferred_liners?.join(', ') ?? undefined,
    },
    commodities,
    containers: beContainers,
  }

  return post<InquiryCreateResult>('/inquiries/inquiries-new-new', payload)
}

// ---------------------------------------------------------------------------
// Private helper — shared by cases 2 and 3.
// Builds the inquiry + commodity/container arrays from the flat ContainerLine[] form data.
// ---------------------------------------------------------------------------
function buildInquiryAndContainers(data: {
  delivery_type?: DeliveryType
  origin?: string
  destination?: string
  sbu?: SBU
  priority?: string
  incoterm?: string
  cargo_ready_date?: string
  preferred_rate?: number
  remark?: string
  preferred_liners?: string[]
  containers?: ContainerLine[]
}): { inquiry: object; commodities: object[]; beContainers: object[] } {
  const serviceMode = data.delivery_type === 'door-to-door' ? 'DOOR_TO_DOOR'
    : data.delivery_type === 'port-to-door' ? 'PORT_TO_DOOR'
    : data.delivery_type === 'door-to-port' ? 'DOOR_TO_PORT'
    : 'PORT_TO_PORT'
  const lines = data.containers ?? []
  return {
    inquiry: {
      sbu:              data.sbu              ?? undefined,
      origin:           data.origin           ?? '',
      service_mode:     serviceMode,
      priority:         data.priority         ?? undefined,
      incoterm:         data.incoterm         ?? undefined,
      cargo_ready_date: data.cargo_ready_date ?? undefined,
      preferred_rate:   data.preferred_rate   ?? undefined,
      remark:           data.remark           ?? undefined,
      preferred_liners: data.preferred_liners?.join(', ') ?? undefined,
    },
    commodities: lines.map(c => ({
      com_type:    c.commodityType ?? undefined,
      name:        c.commodityName || undefined,
      weight:      c.weight !== '' ? c.weight : undefined,
      hs_code:     c.hs_code      ?? undefined,
      description: c.description  ?? undefined,
    })),
    beContainers: lines.map((c, idx) => ({
      commodity_index: idx,
      container_type:  c.containerType ?? undefined,
      qty:             c.quantity,
      destination:     c.destination || data.destination || '',
      zip_code:        c.zipCode     || undefined,
      address:         c.address     ?? undefined,
      temperature:     c.temperature ?? undefined,
      free_time:       c.freeTime !== '' ? String(c.freeTime) : undefined,
      is_fully_loaded: c.isFcl,
    })),
  }
}

/**
 * Create a new inquiry for an EXISTING client with a BRAND-NEW contact person.
 * Maps to POST /inquiries/inquiries-old-new (InquiryOldNew backend schema).
 */
export function apiCreateInquiryOldNew(data: {
  cli_id: number
  channel?: string
  contact_person?: string
  contact_designation?: string
  contact_channel_id?: string
  delivery_type?: DeliveryType
  origin?: string
  destination?: string
  sbu?: SBU
  priority?: string
  incoterm?: string
  cargo_ready_date?: string
  preferred_rate?: number
  remark?: string
  preferred_liners?: string[]
  containers?: ContainerLine[]
}): Promise<InquiryCreateResult> {
  const channel         = data.channel ?? 'Email'
  const contactEmail    = channel === 'Email'    ? (data.contact_channel_id ?? undefined) : undefined
  const contactWhatsapp = channel === 'WhatsApp' ? (data.contact_channel_id ?? undefined) : undefined
  const contactPhone    = channel === 'Phone'    ? (data.contact_channel_id ?? undefined) : undefined
  const contactWechat   = channel === 'WeChat'   ? (data.contact_channel_id ?? undefined) : undefined

  const { inquiry, commodities, beContainers } = buildInquiryAndContainers(data)

  return post<InquiryCreateResult>('/inquiries/inquiries-old-new', {
    cli_id: data.cli_id,
    contact: {
      name:        data.contact_person      ?? '',
      designation: data.contact_designation ?? undefined,
      email:       contactEmail,
      whatsapp:    contactWhatsapp,
      phone:       contactPhone,
      wechat:      contactWechat,
    },
    inquiry,
    commodities,
    containers: beContainers,
  })
}

/**
 * Create a new inquiry for an EXISTING client with an EXISTING contact person.
 * Maps to POST /inquiries/inquiries-old-old (InquiryOldOld backend schema).
 * No contact block is sent — the backend resolves the contact from cp_id.
 */
export function apiCreateInquiryOldOld(data: {
  cli_id: number
  cp_id: number
  delivery_type?: DeliveryType
  origin?: string
  destination?: string
  sbu?: SBU
  priority?: string
  incoterm?: string
  cargo_ready_date?: string
  preferred_rate?: number
  remark?: string
  preferred_liners?: string[]
  containers?: ContainerLine[]
}): Promise<InquiryCreateResult> {
  const { inquiry, commodities, beContainers } = buildInquiryAndContainers(data)

  return post<InquiryCreateResult>('/inquiries/inquiries-old-old', {
    cli_id: data.cli_id,
    cp_id:  data.cp_id,
    inquiry,
    commodities,
    containers: beContainers,
  })
}

/**
 * Fetch all inquiries belonging to the current employee.
 * Returns one row per commodity-container join; use mapInquiryRows() to group.
 */
export function apiFetchAllInquiries(): Promise<InquiryRow[]> {
  return get<InquiryRow[]>('/inquiries/inquiries')
}

/**
 * Fetch full detail for a single inquiry by its backend integer ID.
 * Returns one row per commodity-container join; caller must group if needed.
 */
export function apiFetchInquiry(inq_id: number): Promise<InquiryRow[]> {
  return get<InquiryRow[]>(`/inquiries/inquiries/${inq_id}`)
}

/** Delete an inquiry and all its associated commodities and containers. */
export function apiDeleteInquiry(inq_id: number): Promise<Record<string, unknown>> {
  return del<Record<string, unknown>>(`/inquiries/inquiries/${inq_id}`)
}

/**
 * Patch editable fields on an existing inquiry.
 * Only the fields present in the payload are updated (exclude_unset on the backend).
 *
 * DISCREPANCIES — frontend-only fields not patchable via this endpoint:
 *   • workflow_stage, status, channel, destination (inquiry-level)
 *   • commodity / container fields — use apiPatchCommodity / apiPatchContainer
 */
export function apiPatchInquiry(inq_id: number, data: {
  sbu?: string
  remark?: string
  origin?: string
  incoterm?: string
  cargo_ready_date?: string
  priority?: string
  preferred_liners?: string
  preferred_rate?: number
  service_mode?: 'DOOR_TO_DOOR' | 'PORT_TO_PORT' | 'PORT_TO_DOOR' | 'DOOR_TO_PORT'
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/inquiries/inquiries/${inq_id}`, data)
}

/** Patch fields on a commodity row belonging to an inquiry. */
export function apiPatchCommodity(inq_id: number, com_id: number, data: {
  com_type?: string
  hs_code?: string
  description?: string
  weight?: number
  remark?: string
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/inquiries/inquiries/${inq_id}/commodities/${com_id}`, data)
}

/** Patch fields on a container row belonging to an inquiry. */
export function apiPatchContainer(inq_id: number, cont_id: number, data: {
  container_type?: string
  temperature?: number
  qty?: number
  destination?: string
  address?: string
  zip_code?: string
  is_fully_loaded?: boolean
  free_time?: string
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/inquiries/inquiries/${inq_id}/containers/${cont_id}`, data)
}

// Allowed backend workflow stages (must match the WorkflowStage enum in activity_types.py).
// Note: 'inquiry_received' and 'customer_check_pending' are NOT in the backend enum —
// the backend creates workflows starting at 'kyc_pending' (new client) or
// 'rate_check_in_progress' (existing client). These two stages are frontend-only UI states.
type BackendWorkflowStage =
  | 'kyc_pending'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'rate_check_in_progress'
  | 'escalated_to_procurement'
  | 'quotation_prep'
  | 'quotation_sent'
  | 'customer_response'
  | 'booking_request'
  | 'completed'

// Maps frontend kebab-case WorkflowStage → backend snake_case enum value.
// 'inquiry-received' and 'customer-check' are intentionally omitted — they are
// frontend-only UI stages with no backend equivalent. apiAdvanceWorkflow will
// return { success: false } for them, which is the desired behaviour.
const STAGE_MAP: Partial<Record<string, BackendWorkflowStage>> = {
  'kyc-pending':         'kyc_pending',
  'kyc-verification':    'kyc_approved',
  'rate-check':          'rate_check_in_progress',
  'procurement-request': 'escalated_to_procurement',
  'quotation-prep':      'quotation_prep',
  'quotation-sent':      'quotation_sent',
  'customer-response':   'customer_response',
  'booking-request':     'booking_request',
  'completed':           'completed',
}

// Reverse map — used when reading stage back from the DB (InquiryRow.workflow_stage).
// Only contains stages present in the backend WorkflowStage enum.
export const BE_STAGE_TO_FE: Record<string, string> = {
  rate_check_in_progress:   'rate-check',
  escalated_to_procurement: 'procurement-request',
  quotation_prep:           'quotation-prep',
  quotation_sent:           'quotation-sent',
  customer_response:        'customer-response',
  booking_request:          'booking-request',
  completed:                'completed',
}

// Called once when a new inquiry is persisted — creates the initial workflow row.
// Default stage is kyc_pending (backend does not have 'inquiry_received' in its enum).
export function apiCreateWorkflowEntry(inqId: number, initialStage: BackendWorkflowStage = 'kyc_pending'): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/inquiries/workflow', {
    inq_id: inqId,
    flow_id: 1,
    stage: initialStage,
  })
}

// Fetch a single inquiry from the backend. Returns the same row structure as GET /inquiries/inquiries.
// Used to re-read workflow_stage after backend auto-transitions (rate requests, quotation send, etc.)
export function apiGetInquiry(inqId: number): Promise<InquiryRow[]> {
  return get<InquiryRow[]>(`/inquiries/inquiries/${inqId}`)
}

// Manual override — PATCHes the workflow row directly.
// Only needed for stages without an automatic backend trigger:
// booking_request and completed (not yet auto-triggered by any backend call).
// For all other stages the backend advances the workflow automatically as a
// side effect of the business API call (rate-request, add-option, send-quotation, etc.)
export async function apiAdvanceWorkflow(_feId: string, stage: string, inqId?: number): Promise<{ success: boolean }> {
  const backendStage = STAGE_MAP[stage]
  if (!backendStage || !inqId) return { success: false }
  try {
    return await patch<{ success: boolean }>(`/inquiries/workflow/${inqId}`, { stage: backendStage })
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('404')) {
      await post<Record<string, unknown>>('/inquiries/workflow', { inq_id: inqId, flow_id: 1, stage: 'rate_check_in_progress' })
      return patch<{ success: boolean }>(`/inquiries/workflow/${inqId}`, { stage: backendStage })
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Followups
// ---------------------------------------------------------------------------

export function apiCreateFollowup(data: {
  customer_name: string
  note?: string
  completion_flag?: boolean
  employee_id?: number
}): Promise<Followup> {
  return post<Followup>('/followups', data)
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export function apiCreateCustomer(data: {
  name: string
  tier?: CustomerTier
  payment_terms?: PaymentTerms
  location?: string
  contact_person?: string
  contact_channel?: string
  contact_channel_value?: string
  customer_type?: string
  assigned_salesperson_id?: number
}): Promise<Customer> {
  return post<Customer>('/customers', data)
}

export function apiUpdateCustomer(name: string, patch_data: {
  tier?: CustomerTier
  payment_terms?: PaymentTerms
  location?: string
  blacklisted?: boolean
  credit_hold?: boolean
  min_margin_pct?: number
  notes?: string
  kyc_status?: KycStatus
  contact_email?: string
  contact_phone?: string
  contact_person?: string
  customer_type?: string
  assigned_salesperson_id?: number
}): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/customers/${encodeURIComponent(name)}`, patch_data)
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export function apiCreateQuote(data: {
  customer_name: string
  origin?: string
  destination?: string
  quote_type?: string
  margin_pct?: number
  created_by?: number
  inquiry_id?: string
  lines?: QuoteLine[]
}): Promise<Quote> {
  return post<Quote>('/quotes', data)
}

export function apiSetQuoteStatus(quoteId: string, status: QuoteStatus): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/quotes/${encodeURIComponent(quoteId)}/status`, { status })
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function apiCreateTask(data: {
  customer_name: string
  task?: string
  due_date?: string
  employee_id?: number
}): Promise<Task> {
  return post<Task>('/tasks', data)
}

export function apiCompleteTask(feId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/tasks/${encodeURIComponent(feId)}/complete`)
}

// ---------------------------------------------------------------------------
// Shipments
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

export interface KYCRequestPayload {
  br_number: string
  parent_organization?: string
  emp_id_sales?: number
  emp_id_cs?: number
  document_submission_deadline: string   // YYYY-MM-DD
  cli_type: string
  currency: string
  website?: string
  svat_no?: string
  tax_exemptions: string
  sea_imports: boolean
  sea_exports: boolean
  trade_lanes: boolean
  forwarding: boolean
  cross_trade: boolean
  air_imports: boolean
  air_exports: boolean
  general_cargo: boolean
  dangerous_goods: boolean
  perishable_goods: boolean
  docs: {
    cli_id: number
    br_form?: string
    vat_certificate?: string
    svat_certificate?: string
    tin_certificate?: string
    form20?: string
  }
}

export function apiCreateKycRequest(cli_id: number, data: KYCRequestPayload): Promise<unknown> {
  return post<unknown>(`/kyc/kyc-requests?cli_id=${cli_id}`, data)
}

export interface KycPendingClient {
  cli_id: number
  name: string
  vat_no?: string | null
  tin?: string | null
  credit_limit?: number | null
  addr_street_ln?: string | null
  addr_city?: string | null
  addr_country?: string | null
}

export function apiGetKycPendingClients(): Promise<KycPendingClient[]> {
  return get<KycPendingClient[]>('/kyc/kyc-requests/pending')
}

/** Full KYC request record returned by GET /kyc/kyc-requests/requests */
export interface KycRequestRecord {
  kyc_id: number
  cli_id: number
  name?: string                      // client company name (joined from clients table)
  kyc_stage?: string                 // current stage: kyc_uninitiated | kyc_pending | documents_submitted | kyc_completed
  br_number?: string
  parent_organization?: string
  emp_id_sales?: number
  emp_id_cs?: number
  document_submission_deadline?: string
  cli_type?: string
  currency?: string
  website?: string
  svat_no?: string
  tax_exemptions?: string
  sea_imports?: boolean
  sea_exports?: boolean
  trade_lanes?: boolean
  forwarding?: boolean
  cross_trade?: boolean
  air_imports?: boolean
  air_exports?: boolean
  general_cargo?: boolean
  dangerous_goods?: boolean
  perishable_goods?: boolean
  docs?: {
    br_form?: string
    vat_certificate?: string
    svat_certificate?: string
    tin_certificate?: string
    form20?: string
  }
}

/** Fetch all KYC requests with full details — used by Finance for their review queue. */
export function apiGetKycRequests(): Promise<KycRequestRecord[]> {
  return get<KycRequestRecord[]>('/kyc/kyc-requests/requests')
}

// ---------------------------------------------------------------------------
// Email sending (Resend)
// ---------------------------------------------------------------------------

export function apiSendKyc(data: {
  customer_name: string
  recipient_email: string
}): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/send-kyc', data)
}

export function apiSendQuotation(data: {
  customer_name: string
  recipient_email: string
  quote_id: string
  quotation_content: string
}): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/send-quotation', data)
}

// ---------------------------------------------------------------------------
// Rate Search (AMS)
// ---------------------------------------------------------------------------

export function apiSearchRates(params: {
  origin?: string
  destination?: string
  container_type?: string
  liner_name?: string
  rate_type?: string
}): Promise<RateRecord[]> {
  const qs = new URLSearchParams()
  if (params.origin) qs.set('origin', params.origin)
  if (params.destination) qs.set('destination', params.destination)
  if (params.container_type) qs.set('container_type', params.container_type)
  if (params.liner_name) qs.set('liner_name', params.liner_name)
  if (params.rate_type) qs.set('rate_type', params.rate_type)
  return get<RateRecord[]>(`/rates/search?${qs.toString()}`)
}

// ---------------------------------------------------------------------------
// Unified Rate Fetch — fans out to all 6 rate-table endpoints in parallel,
// resolves liner/trade-lane names client-side, normalises to UnifiedRate[].
//
// DISCREPANCIES vs backend noted here:
//  • vessel_by_vessel_rate maps to 'Spot' (users' preferred term); the DB
//    table is named vessel_by_vessel_rate but both concepts are the same.
//  • Backend returns FK integers (lin_id, tr_ln_id, cli_id, emp_id_sales)
//    not joined names. liner_name and trade_lane are resolved from the
//    /liners and /trade-lanes lookups fetched in the same call.
//    client_name (NAC), employee_name, commodity_name/type (Special) remain
//    null — would require extra joins or lookup calls.
//  • DB field 'iwe'           → frontend field 'service_scope'
//  • DB field 'issold'        → frontend field 'is_sold' (vessel / FAK)
//  • DB field 'isSold'        → frontend field 'is_sold' (special — Pydantic inconsistency)
//  • DB field 'note'          → frontend field 'remark'
//  • DB field 'etd'           → frontend field 'departure_date' (vessel rates)
//  • VbV has no valid_from/valid_to; mapped from fcl_opening / fcl_cutoff.
//  • FAK PATCH router path param is named '{srid}' but forwards to fak_id — backend naming bug.
//  • tariff_rates table has no is_sold column; stripped from PATCH payload.
// ---------------------------------------------------------------------------

// Raw shapes returned by each endpoint (SELECT *)
interface TariffRaw   { tar_id: number;  lin_id: number|null; tr_ln_id: number|null; origin: string; destination: string; valid_from: string|null; valid_to: string|null; iwe: string|null; container_type: string|null; rate: number; currency: string; note: string|null }
interface NacRaw      { nac_id: number;  lin_id: number|null; tr_ln_id: number|null; cli_id: number|null; origin: string; destination: string; valid_from: string|null; valid_to: string|null; iwe: string|null; container_type: string|null; rate: number; currency: string; note: string|null }
interface ContractedRaw { crate_id: number; lin_id: number|null; tr_ln_id: number|null; origin: string; destination: string; valid_from: string|null; valid_to: string|null; iwe: string|null; container_type: string|null; rate: number; currency: string; note: string|null }
interface VesselRaw   { srid: number;    tr_ln_id: number|null; vessel_name: string|null; etd: string|null; fcl_opening: string|null; fcl_cutoff: string|null; origin: string; destination: string; iwe: string|null; container_type: string|null; rate: number; currency: string; issold: boolean|null; note: string|null }
interface FakRaw      { fak_id: number;  lin_id: number|null; tr_ln_id: number|null; origin: string; destination: string; valid_from: string|null; valid_to: string|null; iwe: string|null; container_type: string|null; rate: number; currency: string; issold: boolean|null; note: string|null }
interface SpecialRaw  { sprid: number;   lin_id: number|null; tr_ln_id: number|null; origin: string; destination: string; valid_from: string|null; valid_to: string|null; iwe: string|null; container_type: string|null; rate: number; currency: string; issold: boolean|null; note: string|null }

function buildUnified(
  id: string,
  source_type: RateSourceType,
  r: { lin_id?: number|null; tr_ln_id?: number|null; origin?: string|null; destination?: string|null; container_type?: string|null; rate?: number|null; currency?: string|null; valid_from?: string|null; valid_to?: string|null; fcl_opening?: string|null; fcl_cutoff?: string|null; iwe?: string|null; vessel_name?: string|null; etd?: string|null; issold?: boolean|null; note?: string|null },
  linerMap: Map<number, string>,
  laneMap:  Map<number, string>,
): UnifiedRate {
  return {
    id,
    source_type,
    liner_name:          r.lin_id    != null ? (linerMap.get(r.lin_id)   ?? null) : null,
    trade_lane:          r.tr_ln_id  != null ? (laneMap.get(r.tr_ln_id)  ?? null) : null,
    origin:              r.origin              ?? null,
    destination:         r.destination         ?? null,
    container_type:      r.container_type      ?? null,
    rate:                r.rate                ?? null,
    currency:            r.currency            ?? 'USD',
    valid_from:          r.valid_from          ?? r.fcl_opening ?? null,
    valid_to:            r.valid_to            ?? r.fcl_cutoff  ?? null,
    vessel_name:         r.vessel_name         ?? null,
    departure_date:      r.etd                 ?? null,
    is_sold:             r.issold              ?? null,
    service_scope:       (r.iwe as ServiceScope) ?? null,
    client_name:         null,   // cli_id not joined — no /clients lookup here
    employee_name:       null,   // emp_id_sales not joined
    commodity_name:      null,   // com_id not joined (Special)
    commodity_type:      null,
    remark:              r.note ?? null,
  }
}

export async function apiFetchAllRates(): Promise<UnifiedRate[]> {
  const [liners, lanes, tariffs, nacs, contracted, vessels, faks, specials] = await Promise.all([
    get<LinerRecord[]>('/liners').catch((): LinerRecord[] => []),
    get<TradeLaneRecord[]>('/trade-lanes').catch((): TradeLaneRecord[] => []),
    get<TariffRaw[]>('/rates/tariff-rates').catch((): TariffRaw[]    => []),
    get<NacRaw[]>('/rates/nac-rates').catch(():       NacRaw[]       => []),
    get<ContractedRaw[]>('/rates/contracted-rates').catch((): ContractedRaw[] => []),
    get<VesselRaw[]>('/rates/vessel-rates').catch(():  VesselRaw[]   => []),
    get<FakRaw[]>('/rates/fak-rates').catch(():        FakRaw[]      => []),
    get<SpecialRaw[]>('/rates/special-rates').catch((): SpecialRaw[] => []),
  ])

  const linerMap = new Map(liners.map(l => [l.lin_id,   l.name]))
  const laneMap  = new Map(lanes.map(l  => [l.trln_id,  l.trln_name]))

  return [
    ...tariffs.map(r    => buildUnified(`tariff:${r.tar_id}`,       'Tariff Rate',      r, linerMap, laneMap)),
    ...nacs.map(r        => buildUnified(`nac:${r.nac_id}`,          'NAC',              r, linerMap, laneMap)),
    ...contracted.map(r  => buildUnified(`contracted:${r.crate_id}`, 'Contracted',       r, linerMap, laneMap)),
    ...vessels.map(r     => buildUnified(`vessel:${r.srid}`,         'Spot',             r, linerMap, laneMap)),
    ...faks.map(r        => buildUnified(`fak:${r.fak_id}`,          'FAK',              r, linerMap, laneMap)),
    ...specials.map(r    => buildUnified(`special:${r.sprid}`,       'Special',          r, linerMap, laneMap)),
  ]
}

// Routes a PATCH to the correct type-specific endpoint, mapping frontend
// field names back to backend column names.
export async function apiUpdateRate(rateId: string, data: Record<string, unknown>): Promise<{ success: boolean }> {
  const colonIdx = rateId.indexOf(':')
  const type     = rateId.slice(0, colonIdx)
  const id       = Number(rateId.slice(colonIdx + 1))

  const payload: Record<string, unknown> = { ...data }

  // remark (frontend) → note (DB column on every rate table)
  if ('remark' in payload) { payload.note = payload.remark; delete payload.remark }

  switch (type) {
    case 'tariff':
      // tariff_rates has no is_sold column — strip it to avoid 422
      delete payload.is_sold
      return patch(`/rates/tariff-rates/${id}`, payload)

    case 'nac':
      return patch(`/rates/nac-rates/${id}`, payload)

    case 'contracted':
      return patch(`/rates/contracted-rates/${id}`, payload)

    case 'vessel':
      // is_sold  → issold  (vessel_by_vessel_rate column name)
      // departure_date → etd
      if ('is_sold'        in payload) { payload.issold = payload.is_sold;       delete payload.is_sold        }
      if ('departure_date' in payload) { payload.etd    = payload.departure_date; delete payload.departure_date }
      return patch(`/rates/vessel-rates/${id}`, payload)

    case 'fak':
      if ('is_sold' in payload) { payload.issold = payload.is_sold; delete payload.is_sold }
      return patch(`/rates/fak-rates/${id}`, payload)

    case 'special':
      // SpecialRatePatch uses isSold (camelCase) — backend Pydantic inconsistency
      if ('is_sold' in payload) { payload.isSold = payload.is_sold; delete payload.is_sold }
      return patch(`/rates/special-rates/${id}`, payload)

    default:
      throw new Error(`apiUpdateRate: unknown rate type "${type}"`)
  }
}

// ---------------------------------------------------------------------------
// Rate Creation
// ---------------------------------------------------------------------------

export function apiCreateTariffRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/tariff-rates', payload)
}

export function apiCreateContractedRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/contracted-rates', payload)
}

export function apiCreateNacRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/nac-rates', payload)
}

export function apiCreateVesselRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/vessel-rates', payload)
}

export function apiCreateFakRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/fak-rates', payload)
}

export function apiCreateSpecialRate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  return post<Record<string, unknown>>('/rates/special-rates', payload)
}

export function apiGetPorts(): Promise<PortRecord[]> {
  return get<PortRecord[]>('/ports')
}

export function apiGetLiners(): Promise<LinerRecord[]> {
  return get<LinerRecord[]>('/liners')
}

export function apiGetTradeLanes(): Promise<TradeLaneRecord[]> {
  return get<TradeLaneRecord[]>('/trade-lanes')
}

/**
 * Disabled — the fan-out pattern (one GET /clients/clients/{id}/contacts per client)
 * spams the backend. Returns an empty list until the backend provides a bulk endpoint.
 */
export function apiGetContactPersons(): Promise<ContactPersonRecord[]> {
  return Promise.resolve([])
}

export function apiGetEmployeesDb(): Promise<EmployeeRecord[]> {
  return get<EmployeeRecord[]>('/employees')
}

export function apiGetClientsDb(): Promise<ClientRecord[]> {
  return get<ClientRecord[]>('/clients/clients')
}

export function apiGetClientKycStatus(cli_id: number): Promise<boolean> {
  // Backend returns fetchall() → array; grab the first row's value
  return get<Array<{ kyc_completed: boolean }>>(`/clients/clients/${cli_id}/kyc-status`)
    .then(rows => rows[0]?.kyc_completed === true)
}

// ---------------------------------------------------------------------------
// Rate Requests
// ---------------------------------------------------------------------------

export interface RateRequestRecord {
  request_id: number
  emp_id_requested: number
  is_given: boolean
  remark: string
}

/**
 * Create a new rate request.
 * Used when:
 *  • CS/Sales escalates to Procurement (is_given=false)
 *  • Procurement receives a sourcing task (is_given=false, patched to true on submit)
 *  • CS/Sales completes rate check themselves (is_given=true)
 */
export function apiCreateRateRequest(data: {
  inq_id: number              // required in backend RateRequestNew
  emp_id_requested: number
  is_given?: boolean
  remark: string
}): Promise<RateRequestRecord> {
  return post<RateRequestRecord>('/rate-requests', data)
}

/**
 * Patch an existing rate request — used when Procurement sends the rate brief
 * to Sales (marking is_given=true) and updating the remark with the message
 * to the salesperson.
 * NOTE: Requires PATCH /rate-requests/{request_id} to be added to the backend router.
 */
export function apiPatchRateRequest(requestId: number, data: {
  emp_id_requester?: number
  emp_id_requested?: number
  is_given?: boolean
  remark: string              // required in backend RateRequestPatch — no default
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/rate-requests/${requestId}`, data)
}

/** Delete a rate request. */
export function apiDeleteRateRequest(requestId: number): Promise<Record<string, unknown>> {
  return del<Record<string, unknown>>(`/rate-requests/${requestId}`)
}

// ---------------------------------------------------------------------------
// Rate Request Options
// ---------------------------------------------------------------------------

export interface RateRequestOptionRecord {
  option_id: number
  request_id: number
  rate_type: string
  rate_id: number
}

/** Add a rate option to a request. Backend auto-advances workflow to quotation_prep. */
export function apiAddRateRequestOption(requestId: number, data: {
  request_id: number
  rate_type: string
  rate_id: number
}): Promise<RateRequestOptionRecord> {
  return post<RateRequestOptionRecord>(`/rate-requests/${requestId}/options`, data)
}

/** Patch a rate request option. */
export function apiPatchRateRequestOption(requestId: number, optionId: number, data: {
  updated_by: number
  rate_type?: string
  rate_id?: number
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/rate-requests/${requestId}/options/${optionId}`, data)
}

/** Delete a rate request option. If last option, backend rolls back workflow to escalated_to_procurement. */
export function apiDeleteRateRequestOption(requestId: number, optionId: number): Promise<Record<string, unknown>> {
  return del<Record<string, unknown>>(`/rate-requests/${requestId}/options/${optionId}`)
}

// ---------------------------------------------------------------------------
// Quotations (backend /quotations/ resource)
// ---------------------------------------------------------------------------

export interface QuotationRecord {
  quote_id: number
  inq_id: number
  quote_date: string
  sent_via: string
  acceptence_deadline: string | null   // backend typo — must match exactly
  status: string
}

export interface QuotationOptionPayload {
  inq_id: number
  rate_id: number
  option_id: number
  amt: number
  currency: string
}

/** Row returned by GET /quotations/{quote_id} — one row per option (LEFT JOIN). */
export interface QuotationOptionRow {
  quote_id: number
  inq_id: number
  quote_date: string
  sent_via: string
  acceptence_deadline: string | null
  status: string
  option_id: number | null
  rate_id: number | null
  amt: number | null
  option_currency: string | null
  option_inq_id: number | null
}

/** Create a structured quotation record in the backend. */
export function apiCreateQuotation(data: {
  inq_id: number
  quote_date: string
  sent_via: string
  options?: QuotationOptionPayload[]
  acceptance_deadline?: string        // QuotationNew uses correct spelling; DB column is acceptance_deadline
}): Promise<QuotationRecord> {
  return post<QuotationRecord>('/quotations/', data)
}

/** Fetch a single quotation with all its options (one row per option via LEFT JOIN). */
export function apiFetchQuotation(quoteId: number): Promise<QuotationOptionRow[]> {
  return get<QuotationOptionRow[]>(`/quotations/${quoteId}`)
}

/** Mark a quotation as sent. Backend auto-advances workflow to quotation_sent. */
export function apiMarkQuotationSent(quoteId: number): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/quotations/${quoteId}/send?status=sent`)
}

/**
 * Record customer acceptance/rejection. Backend auto-advances workflow to customer_response.
 * Backend router expects a JSON body matching QuotationAcceptence: { status, option }.
 * NOTE: Backend QuotationAcceptence.status is typed as QuotationStatus.accepted (literal),
 *       so rejections will 422 at validation — backend fix needed for rejection support.
 */
export function apiRecordQuotationResponse(quoteId: number, status: 'accepted' | 'rejected', option: number): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/quotations/${quoteId}/response`, { status, option })
}

/** Update quotation details and/or replace its options. No workflow side effect. */
export function apiPatchQuotation(quoteId: number, data: {
  status?: string
  quote_date?: string
  is_follow_up?: boolean
  acceptence_deadline?: string
  sent_via?: string
  options?: QuotationOptionPayload[]
}): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/quotations/${quoteId}`, data)
}

/** Delete a quotation. */
export function apiDeleteQuotation(quoteId: number): Promise<Record<string, unknown>> {
  return del<Record<string, unknown>>(`/quotations/${quoteId}`)
}

// ---------------------------------------------------------------------------
// KYC Stage
// ---------------------------------------------------------------------------

/** Update KYC stage for a client in the kyc_request table. */
export function apiUpdateKycStage(cliId: number, stage: string): Promise<Record<string, unknown>> {
  return patch<Record<string, unknown>>(`/kyc/kyc-requests/clients/${cliId}/stage?stage=${encodeURIComponent(stage)}`)
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export function apiCreateActivity(_data: {
  actor_role: string
  actor_id: number
  action: string
  ref_type: string
  ref_id: string
  customer_name: string
  pushed_to: string
  notes?: string
}): Promise<ActivityEntry> {
  // No general activity-log endpoint exists in the backend yet.
  // Activity log state is maintained in the frontend; this is a no-op to suppress 404s.
  return Promise.resolve({} as ActivityEntry)
}




// ---------------------------------------------------------------------------
// RFQ — bulk inquiry creation
// ---------------------------------------------------------------------------

export interface RfqLinePayload {
  inquiry: { origin: string; service_mode: string; remark?: string; sbu?: string }
  commodities: { name?: string; com_type?: string }[]
  containers: { commodity_index: number; container_type: string; qty: number; destination: string }[]
}

export interface RfqCreateResult {
  rfq_ref: number
  cli_id: number
  cpid: number
  line_count: number
  inquiries: { inq_id: number; com_ids: number[]; cont_ids: number[] }[]
}

export function apiCreateRfq(data: {
  cli_id: number
  contact?: { name: string; email?: string }
  cp_id?: number
  lines: RfqLinePayload[]
}): Promise<RfqCreateResult> {
  return post<RfqCreateResult>('/inquiries/rfq', data)
}



export interface RfqPreviewRow {
  row: number
  origin: string
  origin_code: string
  destination: string
  destination_code: string
  country: string
  known_port: boolean
}


export interface RfqPreviewResult {
  destination: string | null
  rows: RfqPreviewRow[]
  skipped: { row: number; reason: string }[]
  unknown_count: number
}

export function apiPreviewRfq(file: File): Promise<RfqPreviewResult> {
  return postFile<RfqPreviewResult>('/inquiries/rfq/preview', file)
}

