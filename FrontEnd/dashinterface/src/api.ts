/**
 * REST API client for the FastAPI backend.
 *
 * All mutations are fire-and-forget (optimistic) — the frontend updates
 * local state immediately; the API call persists the change to
 * mock_data.json in the background.
 */
import type {
  Inquiry, Customer, Task, MissingItem, Followup, Quote, Shipment, Employee,
  QuoteStatus, CustomerTier, PaymentTerms, SBU, QuoteLine,
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
  channel?: string
  sbu?: SBU
  employee_id?: number
}): Promise<Inquiry> {
  return post<Inquiry>('/inquiries', data)
}

export function apiCompleteInquiry(feId: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>(`/inquiries/${encodeURIComponent(feId)}/complete`, {})
}

export function apiReopenInquiry(customerName: string, note: string): Promise<{ success: boolean }> {
  return post<{ success: boolean }>('/inquiries/reopen', { customer_name: customerName, note })
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
