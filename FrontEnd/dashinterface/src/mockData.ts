// ==================== FREIGHTOS ====================
export type PageId =
  | 'dashboard'
  | 'chat'
  | 'workspace'
  | 'inquiry-list'
  | 'quotations'
  | 'shipments'
  | 'followups'
  | 'customers'
  | 'kyc'

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: 'Dashboard',
  chat: 'Command Center',
  workspace: 'Workspace',
  'inquiry-list': 'Inquiry List',
  quotations: 'Quotations',
  shipments: 'Shipments',
  followups: 'Operations',
  customers: 'Customers',
  kyc: 'KYC Form',
}

// ==================== IAM / ROLE DEFINITIONS ====================

export type UserRole = 'CS' | 'Sales' | 'Finance' | 'Procurement' | 'Admin'

export const ROLE_LABELS: Record<UserRole, string> = {
  CS:          'Customer Service',
  Sales:       'Sales Executive',
  Finance:     'Finance',
  Procurement: 'Procurement',
  Admin:       'Admin (All Access)',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  CS:          '#0891b2',
  Sales:       '#4f46e5',
  Finance:     '#16a34a',
  Procurement: '#d97706',
  Admin:       '#7c3aed',
}

export const ROLE_PAGE_ACCESS: Record<UserRole, PageId[]> = {
  CS:          ['dashboard', 'chat', 'workspace', 'inquiry-list', 'followups', 'customers', 'kyc'],
  Sales:       ['dashboard', 'chat', 'workspace', 'inquiry-list', 'quotations', 'followups', 'customers'],
  Finance:     ['dashboard', 'chat', 'workspace', 'customers', 'kyc', 'quotations'],
  Procurement: ['dashboard', 'chat', 'workspace', 'inquiry-list', 'followups'],
  Admin:       ['dashboard', 'chat', 'workspace', 'inquiry-list', 'quotations', 'shipments', 'followups', 'customers', 'kyc'],
}

export const ROLE_QUICK_COMMANDS: Record<UserRole, string[]> = {
  CS:          ['new-customer', 'new-inquiry', 'follow-up', 'new-task', 'lookup', 'complete', 'new-booking', 'release-booking'],
  Sales:       ['new-inquiry', 'follow-up', 'new-task', 'quote', 'lookup', 'complete'],
  Finance:     ['lookup', 'blacklist', 'credit-hold', 'change-tier'],
  Procurement: ['follow-up', 'new-task', 'lookup', 'confirm-booking'],
  Admin:       ['new-customer', 'new-inquiry', 'follow-up', 'new-task', 'quote', 'lookup', 'blacklist', 'credit-hold', 'change-tier', 'complete', 'new-booking', 'confirm-booking', 'release-booking'],
}

export type ActionId =
  | 'inquiry:create'
  | 'inquiry:complete'
  | 'inquiry:view'
  | 'followup:create'
  | 'followup:view'
  | 'task:create'
  | 'task:complete'
  | 'quote:create'
  | 'quote:approve'
  | 'quote:send'
  | 'quote:confirm'
  | 'quote:reject'
  | 'shipment:advance-leg'
  | 'shipment:record-pod'
  | 'customer:create'
  | 'customer:edit-flags'
  | 'customer:edit-tier'
  | 'kyc:send'
  | 'kyc:verify'
  | 'booking:create'
  | 'booking:confirm'
  | 'booking:release'
  | 'booking:view'

export const ROLE_ACTIONS: Record<UserRole, ActionId[]> = {
  CS: [
    'inquiry:create', 'inquiry:complete', 'inquiry:view',
    'followup:create', 'followup:view',
    'task:create', 'task:complete',
    'customer:create',
    'kyc:send',
    'quote:send',
    'booking:create', 'booking:release', 'booking:view',
  ],
  Sales: [
    'inquiry:create', 'inquiry:complete', 'inquiry:view',
    'followup:create', 'followup:view',
    'task:create', 'task:complete',
    'quote:create', 'quote:send', 'quote:confirm', 'quote:reject',
    'booking:view',
  ],
  Finance: [
    'inquiry:view', 'followup:view',
    'quote:approve', 'quote:reject',
    'customer:edit-flags', 'customer:edit-tier',
    'kyc:verify',
  ],
  Procurement: [
    'inquiry:view', 'followup:view',
    'followup:create',
    'task:create', 'task:complete',
    'booking:confirm', 'booking:view',
  ],
  Admin: [
    'inquiry:create', 'inquiry:complete', 'inquiry:view',
    'followup:create', 'followup:view',
    'task:create', 'task:complete',
    'quote:create', 'quote:approve', 'quote:send', 'quote:confirm', 'quote:reject',
    'shipment:advance-leg', 'shipment:record-pod',
    'customer:create', 'customer:edit-flags', 'customer:edit-tier',
    'kyc:send', 'kyc:verify',
    'booking:create', 'booking:confirm', 'booking:release', 'booking:view',
  ],
}

export const EMPLOYEE_ROLE_MAP: Record<number, UserRole> = {
  1: 'Sales',
  2: 'CS',
  3: 'Sales',
  4: 'Finance',
  5: 'Procurement',
}

// ==================== WORKFLOW STAGES ====================

export type WorkflowStage =
  | 'inquiry-received'
  | 'customer-check'
  | 'kyc-pending'
  | 'kyc-verification'
  | 'rate-check'
  | 'procurement-request'
  | 'quotation-prep'
  | 'quotation-sent'
  | 'customer-response'
  | 'booking-request'
  | 'completed'

export const WORKFLOW_STAGES: { id: WorkflowStage; label: string; role: UserRole; step: number }[] = [
  { id: 'inquiry-received',    label: 'Inquiry Received',      role: 'CS',          step: 1 },
  { id: 'customer-check',      label: 'Customer Verification', role: 'CS',          step: 2 },
  { id: 'kyc-pending',         label: 'KYC Initialization',    role: 'CS',          step: 3 },
  { id: 'kyc-verification',    label: 'KYC Clearance',         role: 'Finance',     step: 4 },
  { id: 'rate-check',          label: 'Rate Check (AMS)',      role: 'CS',          step: 5 },
  { id: 'procurement-request', label: 'Procurement Rate',      role: 'Procurement', step: 6 },
  { id: 'quotation-prep',      label: 'Quotation Prep',        role: 'Sales',       step: 7 },
  { id: 'quotation-sent',      label: 'Quote Sent',            role: 'CS',          step: 8 },
  { id: 'customer-response',   label: 'Customer Response',     role: 'CS',          step: 9 },
  { id: 'booking-request',     label: 'Booking Request',       role: 'CS',          step: 10 },
  { id: 'completed',           label: 'Completed',             role: 'CS',          step: 11 },
]

// Heuristic for "this inquiry is time-critical" — used by Operations page urgency
// section. Spot rates have ~15-min validity windows (per the Friday meeting).
export function isSpotInquiry(text: string): boolean {
  return /\b(?:spot|urgent|asap|right\s+now|immediately|same\s+day|same-day|critical)\b/i.test(text)
}

// ==================== TYPES ====================
export type InquiryStatus = 'pending' | 'completed'

// Strategic Business Units — each runs its own P&L and target.
// Phase 1 covers ocean freight; air + domestic listed for future phases.
export type SBU = 'Ocean Imports' | 'Ocean Exports' | 'Air Freight' | 'Domestic'
export const SBUS: SBU[] = ['Ocean Imports', 'Ocean Exports', 'Air Freight', 'Domestic']

export interface Inquiry {
  id: string
  customer_name: string
  inquiry_text: string
  request: string
  origin: string         // where cargo ships from (e.g. 'Colombo')
  destination: string    // where cargo ships to   (e.g. 'Hamburg')
  channel: 'WhatsApp' | 'Email' | 'Phone'
  sbu: SBU
  employee_id: number
  status: InquiryStatus
  created_at: string
  completed_at?: string
  followup_note?: string
  workflow_stage?: WorkflowStage
}

// ==================== CUSTOMER MASTER ====================
// Key Account = top recurring customers (best rates, longer terms, lower margin floor).
// Regular     = standard recurring customers.
// Walk-in     = ad-hoc / one-off (highest margin floor, cash only).
export type CustomerTier = 'Key Account' | 'Regular' | 'Walk-in'
export type PaymentTerms = 'Pay Upfront' | '30-Day Credit' | '60-Day Credit'

export type KycStatus = 'not_started' | 'pending_customer' | 'approved'

export interface Customer {
  id: string
  name: string
  location: string         // where the customer's office is based (e.g. 'Colombo, Sri Lanka')
  tier: CustomerTier
  payment_terms: PaymentTerms
  blacklisted: boolean
  credit_hold: boolean
  min_margin_pct: number   // floor used by quote-builder margin checks
  notes?: string
  kyc_status?: KycStatus   // onboarding KYC status — new customers start as 'not_started'
  contact_email?: string
  contact_phone?: string
}

export const SEED_CUSTOMERS: Customer[] = [
  { id: 'CUS-001', name: 'Hayleys Logistics', location: 'Colombo, Sri Lanka', tier: 'Key Account', payment_terms: '30-Day Credit', blacklisted: false, credit_hold: false, min_margin_pct: 5, kyc_status: 'approved', contact_email: 'shipping@hayleys.lk', contact_phone: '+94112345001' },
  { id: 'CUS-002', name: 'Brandix Apparel',   location: 'Colombo, Sri Lanka', tier: 'Key Account', payment_terms: '30-Day Credit', blacklisted: false, credit_hold: false, min_margin_pct: 5, kyc_status: 'approved', contact_email: 'logistics@brandix.com', contact_phone: '+94112345002' },
  { id: 'CUS-003', name: 'Customer ABC',      location: 'Colombo, Sri Lanka', tier: 'Regular',     payment_terms: 'Pay Upfront',   blacklisted: false, credit_hold: false, min_margin_pct: 7, kyc_status: 'approved', contact_email: 'contact@customerabc.com', contact_phone: '+94112345003' },
  { id: 'CUS-004', name: 'MAS Holdings',      location: 'Colombo, Sri Lanka', tier: 'Key Account', payment_terms: '60-Day Credit', blacklisted: false, credit_hold: false, min_margin_pct: 4, kyc_status: 'approved', notes: 'Strategic account — large monthly volume', contact_email: 'shipping@masholdings.com', contact_phone: '+94112345004' },
  { id: 'CUS-005', name: 'Dilmah Tea',        location: 'Peliyagoda, Sri Lanka', tier: 'Key Account', payment_terms: '30-Day Credit', blacklisted: false, credit_hold: true,  min_margin_pct: 5, kyc_status: 'approved', notes: 'Credit hold — finance to clear before next quote', contact_email: 'exports@dilmahtea.com', contact_phone: '+94112345005' },
  { id: 'CUS-006', name: 'Hela Apparel',      location: 'Katunayake, Sri Lanka', tier: 'Regular',  payment_terms: 'Pay Upfront',   blacklisted: false, credit_hold: false, min_margin_pct: 7, kyc_status: 'pending_customer', contact_email: 'info@helaapparel.lk', contact_phone: '+94112345006' },
  { id: 'CUS-007', name: 'Vanguard Shippers', location: 'Karachi, Pakistan',  tier: 'Walk-in',     payment_terms: 'Pay Upfront',   blacklisted: true,  credit_hold: false, min_margin_pct: 10, kyc_status: 'approved', notes: 'Blacklisted — repeated payment defaults in 2025', contact_email: 'ops@vanguardshippers.pk', contact_phone: '+92213456789' },
]

export function findCustomer(name: string, customers: Customer[]): Customer | undefined {
  return customers.find(c => c.name.toLowerCase() === name.toLowerCase())
}

export interface KPIItem {
  label: string
  value: string
  change: string
  trend: 'up' | 'down' | 'neutral'
  color: string
  sub?: string
}

export interface Employee {
  id: number
  name: string
  role: string
}

export const EMPLOYEES: Employee[] = [
  { id: 1, name: 'Nimal Perera',       role: 'Sales Executive' },
  { id: 2, name: 'Anjali Silva',       role: 'Customer Service' },
  { id: 3, name: 'Rohan Fernando',     role: 'Sales Executive' },
  { id: 4, name: 'Priya Jayawardena',  role: 'Finance' },
  { id: 5, name: 'Kamal Dissanayake',  role: 'Procurement' },
]

// ==================== SEED DATA ====================
export const SEED_INQUIRIES: Inquiry[] = [
  {
    id: 'INQ-1041',
    customer_name: 'Hayleys Logistics',
    inquiry_text: 'Hi, we need 12 reefer containers from Colombo to Hamburg by next Friday.',
    request: '12 reefer containers',
    origin: 'Colombo',
    destination: 'Hamburg',
    channel: 'Email',
    sbu: 'Ocean Exports',
    employee_id: 2,
    status: 'pending',
    created_at: '2026-05-02 09:14',
    workflow_stage: 'rate-check',
  },
  {
    id: 'INQ-1040',
    customer_name: 'Brandix Apparel',
    inquiry_text: 'Need quote for 4x40ft to Singapore, ETD this week.',
    request: '4x 40ft containers',
    origin: 'Colombo',
    destination: 'Singapore',
    channel: 'WhatsApp',
    sbu: 'Ocean Exports',
    employee_id: 1,
    status: 'pending',
    created_at: '2026-05-02 08:42',
    workflow_stage: 'quotation-prep',
  },
  {
    id: 'INQ-1039',
    customer_name: 'Customer ABC',
    inquiry_text: 'Customer ABC requested 10 containers from Chennai to Colombo.',
    request: '10 containers',
    origin: 'Chennai',
    destination: 'Colombo',
    channel: 'WhatsApp',
    sbu: 'Ocean Imports',
    employee_id: 1,
    status: 'completed',
    created_at: '2026-05-01 14:08',
    completed_at: '2026-05-01 17:22',
    followup_note: 'Quoted, booking confirmed.',
    workflow_stage: 'completed',
  },
  {
    id: 'INQ-1038',
    customer_name: 'MAS Holdings',
    inquiry_text: 'Looking for 6 dry containers to Rotterdam, please advise rate.',
    request: '6 dry containers',
    origin: 'Colombo',
    destination: 'Rotterdam',
    channel: 'Email',
    sbu: 'Ocean Exports',
    employee_id: 3,
    status: 'completed',
    created_at: '2026-05-01 10:20',
    completed_at: '2026-05-01 16:05',
    followup_note: 'Rate sent, awaiting PO.',
    workflow_stage: 'completed',
  },
  {
    id: 'INQ-1037',
    customer_name: 'Dilmah Tea',
    inquiry_text: 'Please confirm space for 8 containers to Dubai sailing on the 10th.',
    request: '8 containers',
    origin: 'Colombo',
    destination: 'Dubai',
    channel: 'Email',
    sbu: 'Ocean Exports',
    employee_id: 2,
    status: 'completed',
    created_at: '2026-04-30 11:45',
    completed_at: '2026-04-30 15:10',
    followup_note: 'Space confirmed.',
    workflow_stage: 'completed',
  },
  {
    id: 'INQ-1036',
    customer_name: 'Hela Apparel',
    inquiry_text: 'Need 3x20ft to Mumbai urgent.',
    request: '3x 20ft containers',
    origin: 'Colombo',
    destination: 'Mumbai',
    channel: 'WhatsApp',
    sbu: 'Ocean Exports',
    employee_id: 1,
    status: 'pending',
    created_at: '2026-04-30 09:02',
    workflow_stage: 'procurement-request',
  },
]

// ==================== TASKS ====================
export type TaskStatus = 'pending' | 'completed'

export interface Task {
  id: string
  customer_name: string
  task: string
  status: TaskStatus
  due_date: string
  employee_id: number
  inquiry_id?: string
}

export const SEED_TASKS: Task[] = [
  { id: 'TSK-201', customer_name: 'Hayleys Logistics', task: 'Send Quotation', status: 'pending', due_date: '2026-05-03', employee_id: 2, inquiry_id: 'INQ-1041' },
  { id: 'TSK-202', customer_name: 'Brandix Apparel',  task: 'Confirm sailing schedule', status: 'pending', due_date: '2026-05-03', employee_id: 1, inquiry_id: 'INQ-1040' },
  { id: 'TSK-203', customer_name: 'Hela Apparel',     task: 'Negotiate rate with carrier', status: 'pending', due_date: '2026-05-04', employee_id: 1, inquiry_id: 'INQ-1036' },
  { id: 'TSK-204', customer_name: 'Customer ABC',     task: 'Follow up on payment',     status: 'completed', due_date: '2026-05-01', employee_id: 1, inquiry_id: 'INQ-1039' },
  { id: 'TSK-205', customer_name: 'MAS Holdings',     task: 'Send draft B/L',           status: 'completed', due_date: '2026-05-01', employee_id: 3, inquiry_id: 'INQ-1038' },
]

// ==================== MISSING ITEMS (POWER FEATURE) ====================
export interface MissingItem {
  id: string
  customer_name: string
  missing_item: string
  since: string
  cutoff_date?: string
  employee_id: number
}

export const SEED_MISSING_ITEMS: MissingItem[] = [
  { id: 'MIS-301', customer_name: 'Hayleys Logistics', missing_item: 'SI not submitted',     since: '2026-05-02', cutoff_date: '2026-05-04', employee_id: 2 },
  { id: 'MIS-302', customer_name: 'Brandix Apparel',   missing_item: 'KYC pending',          since: '2026-05-02', cutoff_date: '2026-05-05', employee_id: 1 },
  { id: 'MIS-303', customer_name: 'Hela Apparel',      missing_item: 'PO not received',      since: '2026-04-30', cutoff_date: '2026-05-01', employee_id: 1 },
  { id: 'MIS-304', customer_name: 'Hayleys Logistics', missing_item: 'B/L draft approval',   since: '2026-05-02', cutoff_date: '2026-05-06', employee_id: 2 },
]

// ==================== RATE RECORD (from AMS) ====================
export interface RateRecord {
  id: number
  liner_name: string
  origin: string
  destination: string
  container_type: string
  rate_type: string       // 'monthly' | 'contracted' | 'spot'
  amount: number
  currency: string
  valid_from: string
  valid_to: string
  source_system: string
}

export interface InttraSpotRate {
  id: number
  liner_name: string
  liner_code: string
  origin: string
  destination: string
  container_type: string
  rate_type: 'Spot'
  amount: number
  currency: string
  transit_days: number
  valid_from: string
  valid_to: string
  booking_cutoff: string
  source: 'InttraAPI'
  free_time_days: number
}

// ==================== QUOTATIONS ====================
export type RateType = 'Spot' | 'Contractual' | 'NAC' | 'Convoy'
export type QuoteType = 'FCA' | 'Domestic Included' | 'Drayage' | 'DDP'
export type QuoteStatus = 'Draft' | 'Awaiting Approval' | 'Approved' | 'Sent' | 'Confirmed' | 'Lost'

export interface QuoteLine {
  id: string
  shipping_line: string        // e.g. 'Maersk', 'CMA CGM', 'MSC', 'Hapag-Lloyd'
  rate_type: RateType
  base_rate_usd: number        // procurement-validated rate from carrier
  transit_days: number
  free_time_days: number       // detention / demurrage free days at destination
  transshipment_points: string // e.g. 'Direct' / 'Singapore' / 'Singapore + Jebel Ali'
  destination_charges_usd: number
}

export interface Quote {
  id: string
  inquiry_id?: string          // optional — quotes can exist without an inquiry
  customer_name: string
  origin: string
  destination: string
  quote_type: QuoteType
  margin_pct: number           // applied as a percentage on the base rate
  status: QuoteStatus
  created_at: string
  created_by: number           // employee_id
  approver_id?: number         // SBU head who needs to approve (when below margin floor)
  approval_reason?: string     // why this needs approval (e.g. "margin 3% < min 5%")
  lines: QuoteLine[]
}

export const SEED_QUOTES: Quote[] = [
  {
    id: 'QUO-501',
    inquiry_id: 'INQ-1039',
    customer_name: 'Customer ABC',
    origin: 'Chennai',
    destination: 'Colombo',
    quote_type: 'FCA',
    margin_pct: 8,
    status: 'Confirmed',
    created_at: '2026-05-01 15:40',
    created_by: 1,
    lines: [
      { id: 'QL-1', shipping_line: 'Hapag-Lloyd', rate_type: 'Contractual', base_rate_usd: 850,  transit_days: 3, free_time_days: 14, transshipment_points: 'Direct',                  destination_charges_usd: 120 },
      { id: 'QL-2', shipping_line: 'CMA CGM',     rate_type: 'Spot',        base_rate_usd: 920,  transit_days: 4, free_time_days: 10, transshipment_points: 'Direct',                  destination_charges_usd: 110 },
      { id: 'QL-3', shipping_line: 'ONE',         rate_type: 'NAC',         base_rate_usd: 870,  transit_days: 3, free_time_days: 21, transshipment_points: 'Direct',                  destination_charges_usd: 130 },
    ],
  },
  {
    id: 'QUO-500',
    inquiry_id: 'INQ-1038',
    customer_name: 'MAS Holdings',
    origin: 'Colombo',
    destination: 'Rotterdam',
    quote_type: 'DDP',
    margin_pct: 4,
    status: 'Confirmed',
    created_at: '2026-05-01 14:00',
    created_by: 3,
    lines: [
      { id: 'QL-4', shipping_line: 'Maersk',      rate_type: 'Contractual', base_rate_usd: 2400, transit_days: 24, free_time_days: 14, transshipment_points: 'Singapore',              destination_charges_usd: 220 },
      { id: 'QL-5', shipping_line: 'MSC',         rate_type: 'Contractual', base_rate_usd: 2350, transit_days: 26, free_time_days: 14, transshipment_points: 'Jebel Ali',              destination_charges_usd: 240 },
    ],
  },
]

// ==================== SHIPMENTS ====================
export type ShipmentStatus = 'Booked' | 'In Transit' | 'At Transshipment' | 'Out for Delivery' | 'Delivered' | 'Delayed'

export interface ShipmentLeg {
  id: string
  port: string                 // 'Colombo' / 'Singapore' / 'Hamburg'
  type: 'Origin' | 'Transshipment' | 'Destination'
  expected_at: string          // ISO date
  actual_at?: string
  status: 'Pending' | 'Arrived' | 'Departed' | 'Delayed'
}

export interface Shipment {
  id: string
  quote_id: string
  customer_name: string
  origin: string
  destination: string
  shipping_line: string
  status: ShipmentStatus
  booked_at: string
  expected_delivery: string
  pod_received?: string        // proof-of-delivery date when delivered
  legs: ShipmentLeg[]
}

export const SEED_SHIPMENTS: Shipment[] = [
  {
    id: 'SHP-801',
    quote_id: 'QUO-501',
    customer_name: 'Customer ABC',
    origin: 'Chennai',
    destination: 'Colombo',
    shipping_line: 'Hapag-Lloyd',
    status: 'In Transit',
    booked_at: '2026-05-02 09:00',
    expected_delivery: '2026-05-05',
    legs: [
      { id: 'SL-1', port: 'Chennai',  type: 'Origin',      expected_at: '2026-05-02', actual_at: '2026-05-02', status: 'Departed' },
      { id: 'SL-2', port: 'Colombo',  type: 'Destination', expected_at: '2026-05-05',                          status: 'Pending' },
    ],
  },
  {
    id: 'SHP-800',
    quote_id: 'QUO-500',
    customer_name: 'MAS Holdings',
    origin: 'Colombo',
    destination: 'Rotterdam',
    shipping_line: 'Maersk',
    status: 'At Transshipment',
    booked_at: '2026-05-02 08:00',
    expected_delivery: '2026-05-26',
    legs: [
      { id: 'SL-3', port: 'Colombo',   type: 'Origin',        expected_at: '2026-05-02', actual_at: '2026-05-02', status: 'Departed' },
      { id: 'SL-4', port: 'Singapore', type: 'Transshipment', expected_at: '2026-05-08', actual_at: '2026-05-09', status: 'Arrived' },
      { id: 'SL-5', port: 'Rotterdam', type: 'Destination',   expected_at: '2026-05-26',                          status: 'Pending' },
    ],
  },
]

// ==================== BOOKINGS ====================
export type BookingStatus = 'Pending Liner' | 'Liner Confirmed' | 'Released' | 'Cancelled'

export interface Booking {
  id: string
  quote_id: string
  customer_name: string
  origin: string
  destination: string
  shipping_line: string
  vessel_name: string
  voyage_number: string
  container_type: string
  quantity: number
  status: BookingStatus
  is_urgent: boolean
  booked_by: number
  confirmed_by: number | null
  released_by: number | null
  created_at: string
  confirmed_at: string | null
  released_at: string | null
  procurement_notified: boolean
  notes: string
}

export const SEED_BOOKINGS: Booking[] = [
  {
    id: 'BKG-901',
    quote_id: 'QUO-501',
    customer_name: 'Customer ABC',
    origin: 'Chennai',
    destination: 'Colombo',
    shipping_line: 'Hapag-Lloyd',
    vessel_name: 'Stuttgart Express',
    voyage_number: 'VOY-2026-038',
    container_type: "20'GP",
    quantity: 5,
    status: 'Liner Confirmed',
    is_urgent: false,
    booked_by: 2,
    confirmed_by: 5,
    released_by: null,
    created_at: '2026-05-15 10:30',
    confirmed_at: '2026-05-16 14:00',
    released_at: null,
    procurement_notified: true,
    notes: '',
  },
  {
    id: 'BKG-900',
    quote_id: 'QUO-500',
    customer_name: 'MAS Holdings',
    origin: 'Colombo',
    destination: 'Rotterdam',
    shipping_line: 'Maersk',
    vessel_name: 'Maersk Seletar',
    voyage_number: 'VOY-2026-031',
    container_type: "40'HC",
    quantity: 2,
    status: 'Released',
    is_urgent: true,
    booked_by: 2,
    confirmed_by: 2,
    released_by: 2,
    created_at: '2026-05-10 08:15',
    confirmed_at: '2026-05-10 08:15',
    released_at: '2026-05-11 09:00',
    procurement_notified: true,
    notes: 'Urgent spot rate — CS booked directly with Maersk. Procurement notified post-booking.',
  },
]

// ==================== ACTIVITY LOG ====================
export interface ActivityEntry {
  id: string
  timestamp: string
  actor_role: UserRole
  actor_id: number
  action: string
  ref_type: 'inquiry' | 'quote' | 'booking'
  ref_id: string
  customer_name: string
  pushed_to: UserRole
  notes: string
}

export const SEED_ACTIVITY_LOG: ActivityEntry[] = [
  {
    id: 'ACT-001',
    timestamp: '2026-05-02 09:20',
    actor_role: 'CS',
    actor_id: 2,
    action: 'Received inquiry and verified existing customer',
    ref_type: 'inquiry',
    ref_id: 'INQ-1041',
    customer_name: 'Hayleys Logistics',
    pushed_to: 'CS',
    notes: 'Key Account, 30-Day Credit. No KYC needed.',
  },
  {
    id: 'ACT-002',
    timestamp: '2026-05-02 09:45',
    actor_role: 'CS',
    actor_id: 2,
    action: 'Customer verified. Now checking AMS for available rates.',
    ref_type: 'inquiry',
    ref_id: 'INQ-1041',
    customer_name: 'Hayleys Logistics',
    pushed_to: 'CS',
    notes: '12 reefer containers Colombo to Hamburg. Checking rate availability.',
  },
  {
    id: 'ACT-003',
    timestamp: '2026-05-02 08:50',
    actor_role: 'CS',
    actor_id: 1,
    action: 'Received inquiry and verified existing customer',
    ref_type: 'inquiry',
    ref_id: 'INQ-1040',
    customer_name: 'Brandix Apparel',
    pushed_to: 'CS',
    notes: 'Key Account verified. Rates available in AMS.',
  },
  {
    id: 'ACT-004',
    timestamp: '2026-05-02 10:15',
    actor_role: 'CS',
    actor_id: 1,
    action: 'Rate checked and confirmed. Pushed to Sales for quotation preparation.',
    ref_type: 'inquiry',
    ref_id: 'INQ-1040',
    customer_name: 'Brandix Apparel',
    pushed_to: 'Sales',
    notes: '4x40ft Colombo to Singapore. Contractual rate available from Maersk.',
  },
  {
    id: 'ACT-005',
    timestamp: '2026-04-30 09:10',
    actor_role: 'CS',
    actor_id: 1,
    action: 'Received inquiry and verified customer. Rate not in AMS — pushed to Procurement.',
    ref_type: 'inquiry',
    ref_id: 'INQ-1036',
    customer_name: 'Hela Apparel',
    pushed_to: 'Procurement',
    notes: '3x20ft Colombo to Mumbai. No rate in system.',
  },
  {
    id: 'ACT-006',
    timestamp: '2026-05-15 10:35',
    actor_role: 'CS',
    actor_id: 2,
    action: 'Created booking from confirmed quote QUO-501',
    ref_type: 'booking',
    ref_id: 'BKG-901',
    customer_name: 'Customer ABC',
    pushed_to: 'Procurement',
    notes: "5x 20'GP Chennai to Colombo via Hapag-Lloyd. Waiting for liner confirmation.",
  },
  {
    id: 'ACT-007',
    timestamp: '2026-05-16 14:05',
    actor_role: 'Procurement',
    actor_id: 5,
    action: 'Liner confirmed. Vessel: Stuttgart Express, Voyage: VOY-2026-038',
    ref_type: 'booking',
    ref_id: 'BKG-901',
    customer_name: 'Customer ABC',
    pushed_to: 'CS',
    notes: 'Hapag-Lloyd confirmed space. Ready for CS to release to customer.',
  },
  {
    id: 'ACT-008',
    timestamp: '2026-05-10 08:20',
    actor_role: 'CS',
    actor_id: 2,
    action: 'Urgent booking created. CS booked directly with Maersk.',
    ref_type: 'booking',
    ref_id: 'BKG-900',
    customer_name: 'MAS Holdings',
    pushed_to: 'Procurement',
    notes: "Spot rate urgent. Procurement must acknowledge. 2x 40'HC Colombo to Rotterdam.",
  },
]

// ==================== FOLLOW-UPS LOG (fact_followups) ====================
export interface Followup {
  id: string
  inquiry_id?: string
  customer_name: string
  note: string
  employee_id: number
  created_at: string
  completion_flag: boolean
}

export const SEED_FOLLOWUPS: Followup[] = [
  { id: 'FUP-401', inquiry_id: 'INQ-1039', customer_name: 'Customer ABC', note: 'Quoted, booking confirmed.', employee_id: 1, created_at: '2026-05-01 17:22', completion_flag: true },
  { id: 'FUP-402', inquiry_id: 'INQ-1038', customer_name: 'MAS Holdings', note: 'Rate sent, awaiting PO.',   employee_id: 3, created_at: '2026-05-01 16:05', completion_flag: true },
  { id: 'FUP-403', inquiry_id: 'INQ-1037', customer_name: 'Dilmah Tea',   note: 'Space confirmed.',          employee_id: 2, created_at: '2026-04-30 15:10', completion_flag: true },
  { id: 'FUP-404', inquiry_id: 'INQ-1041', customer_name: 'Hayleys Logistics', note: 'Called, awaiting SI.', employee_id: 2, created_at: '2026-05-02 11:30', completion_flag: false },
]

// ==================== HELPERS ====================
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(date?: string): boolean {
  if (!date) return false
  return date < todayISO()
}

export function daysOverdue(date?: string): number {
  if (!date) return 0
  const today = new Date(todayISO()).getTime()
  const target = new Date(date).getTime()
  if (target >= today) return 0
  return Math.round((today - target) / 86400000)
}

export function isDueToday(date?: string): boolean {
  if (!date) return false
  return date === todayISO()
}

// ==================== PARSER ====================
export function parseInquiry(text: string): {
  customer: string
  request: string
  origin: string
  destination: string
  channel: 'WhatsApp' | 'Email' | 'Phone'
} {
  const lower = text.toLowerCase()

  let customer = ''
  const custMatch = text.match(/customer\s+([A-Z][A-Za-z0-9 &.-]{1,40}?)(?=\s+(?:requested|asked|needs|wants|wanted|inquired|is|has|will)|[.,])/i)
  if (custMatch) customer = custMatch[1].trim()
  if (!customer) customer = 'Unknown Customer'

  let request = ''
  const reqMatch = text.match(/(\d+\s*(?:x\s*\d+ft|reefer|dry|ft)?\s*containers?)/i) || text.match(/(\d+\s*(?:tons?|pallets?|crates?|boxes?))/i)
  if (reqMatch) request = reqMatch[1].trim()
  if (!request) request = 'See message'

  // Origin: "from <Place>" — only matches when followed by " to <Place>" or end-of-route punctuation,
  // so "from Customer ABC" (about a sender) is less likely to be misread as origin.
  let origin = ''
  const originMatch = text.match(/\bfrom\s+([A-Z][A-Za-z .-]{2,30}?)(?=\s+to\s+[A-Z]|[.,]|\s+by|\s+on|$)/)
  if (originMatch) origin = originMatch[1].trim()
  if (!origin) origin = 'TBD'

  let destination = ''
  const destMatch = text.match(/\bto\s+([A-Z][A-Za-z .-]{2,30}?)(?=[.,]|\s+by|\s+on|\s+next|\s+this|$)/)
  if (destMatch) destination = destMatch[1].trim()
  if (!destination) destination = 'TBD'

  let channel: 'WhatsApp' | 'Email' | 'Phone' = 'Email'
  if (lower.includes('whatsapp') || lower.includes('wa ')) channel = 'WhatsApp'
  else if (lower.includes('call') || lower.includes('phone')) channel = 'Phone'

  return { customer, request, origin, destination, channel }
}

// ==================== API STUBS ====================
// These are kept for backward-compatibility but App.tsx now calls api.ts directly.
export function postInquiry(payload: {
  customer_name: string
  inquiry_text: string
  channel: string
  employee_id: number
  status: InquiryStatus
}) {
  fetch('http://localhost:8000/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => console.warn('postInquiry: backend unreachable'))
}

export function postFollowup(payload: { customer_name: string; note: string; completion_flag: boolean }) {
  fetch('http://localhost:8000/api/followups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => console.warn('postFollowup: backend unreachable'))
}

export function nowStamp(): string {
  const now = new Date()
  return `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`
}

// ==================== CHAT — CUSTOMER MATCHING ====================
// Strip common business-name boilerplate + lowercase so "Customer ABC" ≈ "ABC Industries"
function normaliseCustomer(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bcustomer\b/g, '')
    .replace(/\b(pvt|ltd|plc|inc|co\.?|corp|limited|holdings|group|company)\b/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Scan a free-form message for any existing customer name. Token-overlap based
// so "in Dilmah Tea" finds "Dilmah Tea" and "spoke with Hayleys" finds "Hayleys Logistics".
export function findCustomerInText(text: string, existing: string[]): string {
  const lower = text.toLowerCase()
  let best: { name: string; score: number } | null = null
  for (const c of existing) {
    const norm = normaliseCustomer(c)
    const tokens = norm.split(' ').filter(t => t.length >= 3)
    if (tokens.length === 0) continue
    let hits = 0
    for (const t of tokens) {
      const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      if (re.test(lower)) hits++
    }
    if (hits === 0) continue
    const score = (hits / tokens.length) * 100 + hits * 5
    if (!best || score > best.score) best = { name: c, score }
  }
  return best ? best.name : ''
}

// Returns existing customer names that look similar to `name`, ranked best-first.
// Exact match (case-insensitive) is returned alone — caller can skip disambiguation.
export function findCustomerCandidates(name: string, existing: string[]): {
  exact: string | null
  candidates: string[]
} {
  const exact = existing.find(c => c.toLowerCase() === name.toLowerCase()) ?? null
  if (exact) return { exact, candidates: [] }

  const target = normaliseCustomer(name)
  if (!target) return { exact: null, candidates: [] }
  const targetTokens = new Set(target.split(' ').filter(t => t.length >= 2))

  const scored: { name: string; score: number }[] = []
  for (const c of existing) {
    const norm = normaliseCustomer(c)
    if (!norm) continue
    let score = 0
    if (norm === target) score = 100
    else if (norm.includes(target) || target.includes(norm)) score = 80
    else {
      const overlap = norm.split(' ').filter(t => targetTokens.has(t)).length
      if (overlap > 0) score = 30 + overlap * 20
    }
    if (score > 0) scored.push({ name: c, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return { exact: null, candidates: scored.slice(0, 4).map(s => s.name) }
}

// ==================== CHAT — INTENT DETECTION ====================
export type ChatIntent =
  | { kind: 'inquiry'; customer: string; request: string; origin: string; destination: string; channel: 'WhatsApp' | 'Email' | 'Phone'; raw: string }
  | { kind: 'followup'; customer: string; note: string; complete: boolean }
  | { kind: 'task'; customer: string; task: string; due: string }
  | { kind: 'complete'; customer: string; note: string }
  | { kind: 'reopen'; customer: string; note: string }
  | { kind: 'customer-flag'; customer: string; flag: 'blacklist' | 'credit-hold'; on: boolean }
  | { kind: 'customer-update'; customer: string; tier?: CustomerTier; payment?: PaymentTerms; location?: string; minMargin?: number }
  | { kind: 'customer-add'; name: string; tier: CustomerTier; payment: PaymentTerms; location: string }
  | { kind: 'quote'; customer: string }
  | { kind: 'unknown'; reason: string }

// Pull a customer phrase out of a chat command. Tries explicit cues first
// ("for X", "with X", "X:") before falling back to title-case capture.
function extractCustomerFromCommand(text: string): string {
  const patterns: RegExp[] = [
    /(?:for|with|of|to|on)\s+([A-Z][A-Za-z0-9 &.'-]{1,40}?)(?=[,:.\n]|\s+(?:said|asked|wants?|needs?|requested|by|on|—|-)|$)/,
    /^([A-Z][A-Za-z0-9 &.'-]{1,40}?)\s*[:—-]/,
    /customer\s+([A-Z][A-Za-z0-9 &.'-]{1,40}?)(?=[,:.\n]|$)/i,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (m) return m[1].trim().replace(/\s+/g, ' ')
  }
  return ''
}

export function detectIntent(text: string, existingCustomers: string[] = []): ChatIntent {
  const trimmed = text.trim()
  if (!trimmed) return { kind: 'unknown', reason: 'empty' }
  const lower = trimmed.toLowerCase()

  // Helper: try the regex-based extractor, then fall back to scanning existing names.
  const findCustomer = (): string => {
    const direct = extractCustomerFromCommand(trimmed)
    if (direct) return direct
    return findCustomerInText(trimmed, existingCustomers)
  }

  // ============= CUSTOMER MANAGEMENT INTENTS (checked first — explicit keywords) =============

  // ---- Add new customer ----
  // "Add new customer Lanka Exports, Regular tier, in Negombo"
  // "Create customer ABC Trading as Walk-in in Mumbai"
  if (/\b(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?customer\b/i.test(lower)) {
    const m = trimmed.match(/\b(?:add|create|new)\s+(?:a\s+)?(?:new\s+)?customer\s+([A-Z][A-Za-z0-9 &.'-]{1,60}?)(?=,|\s+(?:as|tier|in|at|with)\b|$)/i)
    if (m) {
      let name = m[1].trim()
      let tier: CustomerTier = 'Regular'
      if (/\bkey\s*account\b/i.test(trimmed)) tier = 'Key Account'
      else if (/\bwalk\s*-?\s*in\b/i.test(trimmed)) tier = 'Walk-in'

      let payment: PaymentTerms = 'Pay Upfront'
      if (/\b30\s*-?\s*day\b/i.test(lower)) payment = '30-Day Credit'
      else if (/\b60\s*-?\s*day\b/i.test(lower)) payment = '60-Day Credit'

      let location = ''
      const locM = trimmed.match(/\b(?:in|at|located\s+(?:in|at)|location:?)\s+([A-Z][A-Za-z .,'-]+?)(?:\s+(?:as|tier|with|key|regular|walk)\b|[.!?]|$)/i)
      if (locM) location = locM[1].trim().replace(/[,.]+$/, '')

      if (name) return { kind: 'customer-add', name, tier, payment, location }
    }
  }

  // ---- Blacklist toggle ----
  // OFF first (more specific): "unblacklist X", "remove blacklist on X", "clear blacklist for X"
  const blOff = trimmed.match(/\b(?:un-?blacklist|unban|remove\s+(?:the\s+)?blacklist\s+(?:on|from|for)?|clear\s+blacklist\s+(?:on|from|for)?)\s*(.+?)(?=[,.!?\n]|$)/i)
  if (blOff) {
    const customer = blOff[1].trim()
    if (customer && customer.length > 1) return { kind: 'customer-flag', customer, flag: 'blacklist', on: false }
  }
  // ON: "blacklist X", "ban X" (block is too generic — skip to avoid false positives)
  const blOn = trimmed.match(/\b(?:blacklist|ban)\s+(.+?)(?=[,.!?\n]|$)/i)
  if (blOn && !/\bun\b/i.test(blOn[0])) {
    const customer = blOn[1].trim()
    if (customer && customer.length > 1) return { kind: 'customer-flag', customer, flag: 'blacklist', on: true }
  }

  // ---- Credit hold toggle ----
  if (/\bcredit\s+hold\b/i.test(lower)) {
    const chOff = trimmed.match(/\b(?:clear|remove|release|lift|drop|cancel)\s+(?:the\s+)?credit\s+hold\s+(?:on|from|for)?\s*(.+?)(?=[,.!?\n]|$)/i)
    if (chOff) {
      const customer = chOff[1].trim()
      if (customer) return { kind: 'customer-flag', customer, flag: 'credit-hold', on: false }
    }
    const chOff2 = trimmed.match(/\brelease\s+(.+?)\s+from\s+credit\s+hold\b/i)
    if (chOff2) {
      const customer = chOff2[1].trim()
      if (customer) return { kind: 'customer-flag', customer, flag: 'credit-hold', on: false }
    }
    const chOn = trimmed.match(/\b(?:put|set|place|add|flag|mark)\s+(.+?)\s+(?:on|to|as|in)\s+credit\s+hold\b/i)
    if (chOn) {
      const customer = chOn[1].trim()
      if (customer) return { kind: 'customer-flag', customer, flag: 'credit-hold', on: true }
    }
    const chOn2 = trimmed.match(/\bcredit\s+hold\s+(?:on\s+)?(.+?)(?=[,.!?\n]|$)/i)
    if (chOn2) {
      const customer = chOn2[1].trim()
      if (customer) return { kind: 'customer-flag', customer, flag: 'credit-hold', on: true }
    }
  }

  // ---- Tier change ----
  // "Change Hayleys to Key Account", "Make Customer ABC a Walk-in", "Promote Brandix to Key Account"
  const tierM = trimmed.match(/(?:change|set|make|move|promote|downgrade|update|switch)\s+(.+?)\s+(?:to|as|into)\s+(?:a\s+)?(key\s*account|regular|walk\s*-?\s*in)\b/i)
  if (tierM) {
    const customer = tierM[1].trim()
    const t = tierM[2].toLowerCase().replace(/\s+/g, '').replace(/-/g, '')
    const tier: CustomerTier = t.startsWith('key') ? 'Key Account' : t === 'regular' ? 'Regular' : 'Walk-in'
    if (customer) return { kind: 'customer-update', customer, tier }
  }

  // ---- Payment terms change ----
  // "Change Hayleys payment to 60-Day Credit", "Set MAS payment terms to Pay Upfront"
  const payM = trimmed.match(/(?:change|set|update|switch)\s+(.+?)(?:'s)?\s+(?:payment(?:\s+terms?)?)\s+(?:to)\s+(pay\s*upfront|upfront|prepaid|cash|30-?day(?:\s+credit)?|60-?day(?:\s+credit)?|net\s*30|net\s*60)\b/i)
  if (payM) {
    const customer = payM[1].trim()
    const p = payM[2].toLowerCase()
    let payment: PaymentTerms = 'Pay Upfront'
    if (/30/.test(p)) payment = '30-Day Credit'
    else if (/60/.test(p)) payment = '60-Day Credit'
    if (customer) return { kind: 'customer-update', customer, payment }
  }

  // ---- Location change ----
  // "Change Hayleys location to Galle", "Move Brandix to Negombo", "Update MAS location to Colombo, Sri Lanka"
  const locM = trimmed.match(/(?:change|set|update|move)\s+(.+?)(?:'s)?\s+(?:location|address|hq)\s+(?:to|is)\s+(.+?)(?=[.!?\n]|$)/i)
  if (locM) {
    return { kind: 'customer-update', customer: locM[1].trim(), location: locM[2].trim() }
  }

  // ---- Min-margin change ----
  const marginM = trimmed.match(/(?:change|set|update)\s+(.+?)(?:'s)?\s+(?:min(?:imum)?\s+)?margin\s+(?:to)\s+(\d+)\s*%?/i)
  if (marginM) {
    return { kind: 'customer-update', customer: marginM[1].trim(), minMargin: parseInt(marginM[2], 10) }
  }

  // ---- Quote command (Phase 5.3) ----
  // "Quote Hayleys", "Create a quote for Hayleys", "New quotation for MAS Holdings"
  const quoteVerb = trimmed.match(/\b(?:create|make|build|new|prep(?:are)?|do|prepare)\s+(?:a\s+|an\s+)?quot(?:e|ation)\s+(?:for\s+)?(.+?)(?=[,.!?\n]|$)/i)
  const quoteShort = trimmed.match(/^\s*quot(?:e|ation)\s+(.+?)(?=[,.!?\n]|$)/i)
  const qm = quoteVerb ?? quoteShort
  if (qm) {
    const customer = qm[1].trim().replace(/^for\s+/i, '')
    if (customer && customer.length > 1) return { kind: 'quote', customer }
  }

  // ============= ORIGINAL INTENTS =============

  // 1. Reopen / mark-as-pending — explicit "didn't actually do it" updates.
  // Check before complete + before follow-up so phrases like "mark as pending"
  // and "didnt done … mark as pending" don't get misclassified.
  const reopenPattern = /\b(?:reopen|re-open|mark[a-z]*\s+(?:it\s+|that\s+|this\s+|inquiry\s+|deal\s+)?(?:back\s+)?as\s+pending|set\s+(?:back\s+)?(?:to\s+)?pending|still\s+pending|not\s+(?:yet\s+)?(?:done|complete[d]?|finished|confirmed)|(?:didn'?t|didnt|haven'?t|have\s+not)\s+(?:yet\s+|actually\s+)?(?:do(?:ne)?|complete[d]?|finish(?:ed)?|confirm(?:ed)?))\b/i
  if (reopenPattern.test(trimmed)) {
    const customer = findCustomer()
    if (customer) return { kind: 'reopen', customer, note: trimmed }
  }

  // 2. Mark complete / close — capture customer name between the verb and the modifier
  // Matches: "mark MAS Holdings completed", "mark Hayleys as done", "close Brandix", "close inquiry for Hela"
  const closeMatch = trimmed.match(
    /\b(?:mark(?:ed)?(?:\s+as)?|close[d]?)\s+(?:the\s+)?(?:inquiry\s+(?:for\s+)?|deal\s+(?:for\s+)?)?([A-Za-z][A-Za-z0-9 &.'-]{1,50}?)(?:\s+(?:as\s+)?(?:complete[d]?|done|closed))?(?=[,.:!?\n—-]|\s+(?:by|booking|—)|$)/i,
  )
  if (closeMatch && /\b(?:mark(?:ed)?|close[d]?|done|complete[d]?|deal\s+done|booking\s+confirmed)\b/.test(lower) && !/\bpending\b/.test(lower)) {
    const customer = closeMatch[1].trim()
    if (/[A-Z]/.test(customer) && customer.length >= 2) {
      return { kind: 'complete', customer, note: trimmed }
    }
  }

  // 3. Add task
  if (/\b(add|create|new|set|schedule)\s+(?:a\s+)?(?:task|todo|reminder)|\btask\s*[:\-]/i.test(lower) || /\bremind\s+me\b/.test(lower)) {
    const customer = findCustomer()
    let task = trimmed
    const tm = trimmed.match(/(?:task|todo|reminder)\s*[:\-]?\s*(.+?)(?:\s+by\s+|\s+due\s+|$)/i)
    if (tm) task = tm[1].trim()
    let due = ''
    const dm = trimmed.match(/\b(?:by|due)\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|tomorrow|today|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i)
    if (dm) due = resolveRelativeDate(dm[1])
    if (!due) {
      const d = new Date(); d.setDate(d.getDate() + 1)
      due = d.toISOString().slice(0, 10)
    }
    return { kind: 'task', customer, task: task || 'Task', due }
  }

  // 4. Follow-up (check before inquiry — these messages often look conversational)
  if (/\b(follow(?:ed)?[\s-]?up|f\/u|spoke\s+(?:to|with)|called|rang|messaged|texted|emailed|update[d]?\s+(?:on|with)|chased)\b/.test(lower)) {
    const customer = findCustomer()
    if (customer) {
      const complete = /\b(complete[d]?|done|closed|confirmed|booking\s+confirmed|sorted)\b/.test(lower) && !/\bpending\b/.test(lower)
      return { kind: 'followup', customer, note: trimmed, complete }
    }
  }

  // 5. Inquiry — falls through to the existing parser, but if the parser couldn't
  // find a customer and the message mentions an existing one, treat it as a free-form
  // follow-up note instead of saving an "Unknown Customer" inquiry.
  const parsed = parseInquiry(trimmed)
  if (parsed.customer === 'Unknown Customer' && existingCustomers.length > 0) {
    const fallback = findCustomerInText(trimmed, existingCustomers)
    if (fallback) {
      return { kind: 'followup', customer: fallback, note: trimmed, complete: false }
    }
  }
  return {
    kind: 'inquiry',
    customer: parsed.customer,
    request: parsed.request,
    origin: parsed.origin,
    destination: parsed.destination,
    channel: parsed.channel,
    raw: trimmed,
  }
}

function resolveRelativeDate(token: string): string {
  const t = token.toLowerCase()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = new Date()
  if (t === 'today') return d.toISOString().slice(0, 10)
  if (t === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10) }
  const days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
  const idx = days.indexOf(t.replace(/^next\s+/, ''))
  if (idx >= 0) {
    const diff = (idx - d.getDay() + 7) % 7 || 7
    d.setDate(d.getDate() + diff)
    return d.toISOString().slice(0, 10)
  }
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}
