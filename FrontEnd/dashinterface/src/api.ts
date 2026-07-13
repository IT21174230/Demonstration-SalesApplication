/**
 * REST API client for the FastAPI backend.
 *
 * All mutations are fire-and-forget (optimistic) — the frontend updates
 * local state immediately; the API call persists the change to
 * mock_data.json in the background.
 */
import type {
  Inquiry, Customer, Task, MissingItem, Followup, Quote, Shipment, Employee, Booking,
  QuoteStatus, CustomerTier, PaymentTerms, SBU, QuoteLine, ActivityEntry, KycStatus, RateRecord,
  InttraSpotRate, DeliveryType, UnifiedRate, PortRecord,
  LinerRecord, TradeLaneRecord, ContactPersonRecord, EmployeeRecord, ClientRecord,
  ContainerLine,
} from './mockData'

const BASE = import.meta.env.VITE_API_BASE || '/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

async function patch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json()
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
  commodity_type?: string
  container_type?: string
  container_qty?: number
  special_equipment?: string
  cargo_weight?: number
  is_fcl?: boolean
  remark?: string
  contact_person?: string
  contact_channel_id?: string
  containers?: ContainerLine[]
  preferred_liners?: string[]
}): Promise<Inquiry> {
  return post<Inquiry>('/inquiries', data)
}

export function apiCompleteInquiry(feId: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(`/inquiries/${encodeURIComponent(feId)}/complete`, {})
}

export function apiReopenInquiry(customerName: string, note: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/inquiries/reopen', { customer_name: customerName, note })
}

export function apiAdvanceWorkflow(feId: string, stage: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/inquiries/${encodeURIComponent(feId)}/workflow-stage`, { stage })
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

export function apiAdvanceShipmentLeg(shipmentId: string, legId: string): Promise<Shipment> {
  return patch<Shipment>(`/shipments/${encodeURIComponent(shipmentId)}/legs/${encodeURIComponent(legId)}`)
}

export function apiRecordShipmentPOD(shipmentId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/shipments/${encodeURIComponent(shipmentId)}/pod`)
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
// Bookings
// ---------------------------------------------------------------------------

export function apiCreateBooking(data: {
  customer_name: string
  quote_id: string
  shipping_line?: string
  container_type?: string
  quantity?: number
  is_urgent?: boolean
  booked_by?: number
}): Promise<Booking> {
  return post<Booking>('/bookings', data)
}

export function apiConfirmBooking(bookingId: string, data: {
  vessel_name?: string
  voyage_number?: string
  confirmed_by?: number
}): Promise<Booking> {
  return patch<Booking>(`/bookings/${encodeURIComponent(bookingId)}/confirm`, data)
}

export function apiReleaseBooking(bookingId: string, data: {
  note?: string
  released_by?: number
}): Promise<Booking> {
  return patch<Booking>(`/bookings/${encodeURIComponent(bookingId)}/release`, data)
}

export function apiNotifyProcurement(bookingId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/notify`)
}

export function apiSetBookingSiCutoff(bookingId: string, siCutoffDate: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/si-cutoff`, { si_cutoff_date: siCutoffDate })
}

export function apiMarkSiRequested(bookingId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/si-requested`)
}

export function apiSetBookingBlCutoff(bookingId: string, blCutoffDate: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/bl-cutoff`, { bl_cutoff_date: blCutoffDate })
}

export function apiMarkSiSubmitted(bookingId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/si-submitted`)
}

export function apiMarkDraftBlSent(bookingId: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/draft-bl-sent`)
}

export function apiSetBlStatus(bookingId: string, status: string): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/bl-status`, { status })
}

export function apiRecordMasterBl(bookingId: string, data: {
  master_bl_number: string
  shipper: string
  consignee: string
}): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/master-bl`, data)
}

export function apiCreateHouseBl(bookingId: string, data: {
  house_bl_number: string
  shipper: string
  consignee: string
}): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/bookings/${encodeURIComponent(bookingId)}/house-bl`, data)
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
// Unified Rate Search (all DB rate tables)
// ---------------------------------------------------------------------------

export function apiSearchAllRates(params: {
  origin?: string
  destination?: string
  container_type?: string
}): Promise<UnifiedRate[]> {
  const qs = new URLSearchParams()
  if (params.origin) qs.set('origin', params.origin)
  if (params.destination) qs.set('destination', params.destination)
  if (params.container_type) qs.set('container_type', params.container_type)
  return get<UnifiedRate[]>(`/rates/search-all?${qs.toString()}`)
}

export function apiUpdateRate(rateId: string, data: Record<string, unknown>): Promise<{ success: boolean }> {
  return patch<{ success: boolean }>(`/rates/${encodeURIComponent(rateId)}`, data)
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

export function apiGetContactPersons(): Promise<ContactPersonRecord[]> {
  return get<ContactPersonRecord[]>('/contact-persons')
}

export function apiGetEmployeesDb(): Promise<EmployeeRecord[]> {
  return get<EmployeeRecord[]>('/employees')
}

export function apiGetClientsDb(): Promise<ClientRecord[]> {
  return get<ClientRecord[]>('/clients')
}

// ---------------------------------------------------------------------------
// InttraAPI Spot Rates (simulated)
// ---------------------------------------------------------------------------

export function apiCheckInttraRates(data: {
  origin: string
  destination: string
  container_type?: string
}): Promise<InttraSpotRate[]> {
  return post<InttraSpotRate[]>('/inttra/spot-rates', data)
}

export interface InttraBookingResult {
  success: boolean
  booking_reference: string
  vessel_name: string
  voyage_number: string
  shipping_line: string
  origin: string
  destination: string
  container_type: string
  quantity: number
  etd: string
  eta: string
  status: string
  message: string
}

export function apiBookInttra(data: {
  booking_id: string
  shipping_line: string
  origin: string
  destination: string
  container_type?: string
  quantity?: number
}): Promise<InttraBookingResult> {
  return post<InttraBookingResult>('/inttra/book', data)
}

export interface InttraSiResult {
  success: boolean
  si_reference: string
  booking_id: string
  shipping_line: string
  status: string
  message: string
}

export function apiSubmitSiInttra(data: {
  booking_id: string
  shipping_line: string
  origin: string
  destination: string
}): Promise<InttraSiResult> {
  return post<InttraSiResult>('/inttra/submit-si', data)
}

// ---------------------------------------------------------------------------
// Activity Log
// ---------------------------------------------------------------------------

export function apiCreateActivity(data: {
  actor_role: string
  actor_id: number
  action: string
  ref_type: string
  ref_id: string
  customer_name: string
  pushed_to: string
  notes?: string
}): Promise<ActivityEntry> {
  return post<ActivityEntry>('/activity-log', data)
}
