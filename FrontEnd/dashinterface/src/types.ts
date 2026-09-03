// ==================== FREIGHTOS ====================
export type PageId =
  | 'dashboard'
  | 'chat'
  | 'workspace'
  | 'new-inquiry'
  | 'record-rate'
  | 'rate-check'
  | 'inquiry-list'
  | 'rate-list'
  | 'booking-list'
  | 'quotations'
  | 'shipments'
  | 'followups'
  | 'customers'
  | 'kyc'
  | 'profile'

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: 'Dashboard',
  chat: 'Command Center',
  workspace: 'Workspace',
  'new-inquiry': 'New Inquiry',
  'record-rate': 'Record Rate',
  'rate-check': 'Rate Check',
  'inquiry-list': 'Inquiry List',
  'rate-list': 'Rate List',
  'booking-list': 'Booking List',
  quotations: 'Quotations',
  shipments: 'Shipments',
  followups: 'Operations',
  customers: 'Customers',
  kyc: 'KYC Form',
  profile: 'Profile',
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
  Sales:       '#2c2c82',
  Finance:     '#16a34a',
  Procurement: '#d97706',
  Admin:       '#7c3aed',
}

export const ROLE_PAGE_ACCESS: Record<UserRole, PageId[]> = {
  CS:          ['dashboard', 'chat', 'workspace', 'new-inquiry', 'inquiry-list', 'rate-list', 'booking-list', 'followups', 'customers', 'kyc', 'profile'],
  Sales:       ['dashboard', 'chat', 'workspace', 'new-inquiry', 'inquiry-list', 'rate-list', 'followups', 'customers', 'profile'],
  Finance:     ['dashboard', 'chat', 'workspace', 'customers', 'kyc', 'profile'],
  Procurement: ['dashboard', 'chat', 'workspace', 'inquiry-list', 'record-rate', 'rate-check', 'rate-list', 'booking-list', 'followups', 'profile'],
  Admin:       ['dashboard', 'chat', 'workspace', 'new-inquiry', 'record-rate', 'rate-check', 'inquiry-list', 'rate-list', 'booking-list', 'shipments', 'followups', 'customers', 'kyc', 'profile'],
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

// ==================== WORKFLOW STAGES ====================

// Stages match the backend WorkflowStage enum exactly (snake_case → kebab-case via BE_STAGE_TO_FE).
// inquiry_received / customer_check_pending are NOT backend stages — they were removed.
export type WorkflowStage =
  | 'rate-check'
  | 'procurement-request'
  | 'quotation-prep'
  | 'quotation-sent'
  | 'customer-response'
  | 'booking-request'
  | 'completed'

export const WORKFLOW_STAGES: { id: WorkflowStage; label: string; roles: UserRole[]; step: number; skippable?: boolean }[] = [
  { id: 'rate-check',          label: 'Rate Check',            roles: ['CS', 'Sales'],  step: 1 },
  { id: 'procurement-request', label: 'Procurement Escalation', roles: ['Procurement'], step: 2, skippable: true },
  { id: 'quotation-prep',      label: 'Quotation Prep',        roles: ['CS', 'Sales'],  step: 3 },
  { id: 'quotation-sent',      label: 'Quote Sent',            roles: ['CS', 'Sales'],  step: 4 },
  { id: 'customer-response',   label: 'Customer Response',     roles: ['CS', 'Sales'],  step: 5 },
  { id: 'booking-request',     label: 'Booking Request',       roles: ['CS', 'Sales'],  step: 6 },
  { id: 'completed',           label: 'Completed',             roles: ['CS', 'Sales'],  step: 7 },
]

/** Display helper — join role labels for a stage (e.g. "CS / Sales") */
export function stageRoleLabel(stage: typeof WORKFLOW_STAGES[number]): string {
  return stage.roles.map(r => ROLE_LABELS[r]).join(' / ')
}

/** Color for a stage — uses the first role's color */
export function stageRoleColor(stage: typeof WORKFLOW_STAGES[number]): string {
  return ROLE_COLORS[stage.roles[0]]
}

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

export type DeliveryType = 'port-to-port' | 'door-to-door' | 'port-to-door' | 'door-to-port'

// Priority levels — can be set at creation and changed mid-workflow by Sales or CS.
export type InquiryPriority = 'Low' | 'Medium' | 'High' | 'Urgent'
export const INQUIRY_PRIORITIES: InquiryPriority[] = ['Low', 'Medium', 'High', 'Urgent']

// Commodity types — aligned with HS chapter groupings for accurate classification.
export type CommodityType =
  | 'Live animals; animal products'
  | 'Vegetable products'
  | 'Animal/vegetable fats and oils'
  | 'Prepared foodstuffs; beverages, spirits, tobacco'
  | 'Mineral products'
  | 'Chemicals and allied industries'
  | 'Plastics and rubber'
  | 'Raw hides, skins, leather, furskins'
  | 'Wood, cork, basketware'
  | 'Pulp, paper, paperboard'
  | 'Textiles and textile articles'
  | 'Footwear, headgear, umbrellas'
  | 'Stone, plaster, cement, ceramic, glass'
  | 'Pearls, precious stones/metals'
  | 'Base metals and articles thereof'
  | 'Machinery and electrical equipment'
  | 'Vehicles, aircraft, vessels, transport equipment'
  | 'Optical/medical/precision instruments, clocks'
  | 'Arms and ammunition'
  | 'Miscellaneous manufactured articles — furniture, toys'
  | 'Works of art, collectors\' pieces, antiques'

export const COMMODITY_TYPES: CommodityType[] = [
  'Live animals; animal products',
  'Vegetable products',
  'Animal/vegetable fats and oils',
  'Prepared foodstuffs; beverages, spirits, tobacco',
  'Mineral products',
  'Chemicals and allied industries',
  'Plastics and rubber',
  'Raw hides, skins, leather, furskins',
  'Wood, cork, basketware',
  'Pulp, paper, paperboard',
  'Textiles and textile articles',
  'Footwear, headgear, umbrellas',
  'Stone, plaster, cement, ceramic, glass',
  'Pearls, precious stones/metals',
  'Base metals and articles thereof',
  'Machinery and electrical equipment',
  'Vehicles, aircraft, vessels, transport equipment',
  'Optical/medical/precision instruments, clocks',
  'Arms and ammunition',
  'Miscellaneous manufactured articles — furniture, toys',
  'Works of art, collectors\' pieces, antiques',
]

// Container types — structured field instead of free text.
export type ContainerType = '20 GP' | '40 GP' | '20 OPEN TOP' | '40 OPEN TOP' | '40 HC' | '20 REEFER' | '40 REEFER' | '20 FLAT RACK' | '40 FLAT RACK' | 'TANKER'
export const CONTAINER_TYPES: ContainerType[] = ['20 GP', '40 GP', '20 OPEN TOP', '40 OPEN TOP', '40 HC', '20 REEFER', '40 REEFER', '20 FLAT RACK', '40 FLAT RACK', 'TANKER']

// Container line — one entry per container in a multi-container inquiry.
export interface ContainerLine {
  containerType: ContainerType
  quantity: number
  weight: number | ''
  commodityType: CommodityType
  commodityName: string
  destination: string
  isFcl: boolean
  zipCode: string
  doorAgents: string[]
  freeTime: number | ''
  // Backend fields (ContainerNew / container table)
  temperature?: number       // reefer set-point in °C
  address?: string           // door-delivery address (distinct from zip code)
  hs_code?: string           // commodity HS tariff code (CommodityNew.hs_code)
  description?: string       // commodity description (CommodityNew.description)
  com_id?: number            // backend commodity row PK — required for PATCH /commodities/{com_id}
  cont_id?: number           // backend container row PK — required for PATCH /containers/{cont_id}
}

export const emptyContainerLine = (): ContainerLine => ({
  containerType: '20 GP',
  quantity: 1,
  weight: '',
  commodityType: 'Miscellaneous manufactured articles — furniture, toys',
  commodityName: '',
  destination: '',
  isFcl: true,
  zipCode: '',
  doorAgents: [],
  freeTime: '',
})

export interface Inquiry {
  id: string
  customer_name: string
  inquiry_text?: string  // frontend-only — no backend column
  request?: string       // frontend-only — auto-generated label
  origin: string         // where cargo ships from (e.g. 'Colombo')
  destination: string    // where cargo ships to   (e.g. 'Hamburg')
  delivery_type: DeliveryType
  channel?: 'WhatsApp' | 'Email' | 'Phone' | 'WeChat'  // frontend-only — stored in contact record
  sbu: SBU
  employee_id: number
  status: InquiryStatus
  created_at: string
  completed_at?: string
  followup_note?: string
  workflow_stage?: WorkflowStage
  priority?: InquiryPriority        // settable at creation, changeable mid-workflow
  commodity_type?: CommodityType     // cargo commodity classification
  container_type?: ContainerType     // structured container size/type
  container_qty?: number             // number of containers requested
  cargo_weight?: number              // cargo weight in kg
  is_fcl?: boolean                   // true = FCL, false = LCL
  remark?: string                    // special instructions / notes
  contact_person?: string            // name of the person who made the inquiry
  contact_designation?: string       // job title / role of the contact person
  contact_channel_id?: string        // channel-specific: email address, WhatsApp number, or phone number
  containers?: ContainerLine[]       // multi-container support
  preferred_liners?: string[]        // multiple preferred shipping lines
  recorded_by?: number               // employee_id of the person who created this inquiry
  // Backend fields — populated after successful API create / fetch
  inq_id?: number          // backend integer PK (inquiry table)
  cli_id?: number          // backend client ID
  cpid?: number            // backend contact-person ID
  com_ids?: number[]       // backend commodity row IDs
  cont_ids?: number[]      // backend container row IDs
  quotation_id?: number    // backend quotation PK — set when quotation is created in prepare-quotation
  kyc_completed?: boolean  // true when the client's KYC stage is 'kyc_completed' (from inquiry list response)
  incoterm?: string        // trade term: FOB / CIF / EXW / DDP …
  cargo_ready_date?: string // ISO date when cargo is ready to ship
  preferred_rate?: number  // client's target buy rate (USD)
}

// ==================== CUSTOMER MASTER ====================
// Key Account = top recurring customers (best rates, longer terms, lower margin floor).
// Regular     = standard recurring customers.
// Walk-in     = ad-hoc / one-off (highest margin floor, cash only).
export type CustomerTier = 'Key Account' | 'Regular' | 'Walk-in'
export type PaymentTerms = 'Pay Upfront' | '30-Day Credit' | '60-Day Credit'

export type KycStatus = 'not_started' | 'pending_customer' | 'approved'

// Customer classification — shipper, buyer, agent, trader per the meeting requirement.
export type CustomerType = 'Shipper' | 'Buyer' | 'Agent' | 'Trader'
export const CUSTOMER_TYPES: CustomerType[] = ['Shipper', 'Buyer', 'Agent', 'Trader']

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
  contact_person?: string    // primary contact person name
  customer_type?: CustomerType // classification: shipper, buyer, agent, trader
  assigned_salesperson_id?: number // salesperson responsible for this customer
}

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
  dept?: string
  email?: string
}

// UI-only employee directory for name lookups, dropdowns, and dashboard KPIs.
// Not used for authentication (SSO handles that via JWT).
// TODO: replace with dynamic data from GET /employees once all components are refactored.
export const EMPLOYEES: Employee[] = [
  { id: 5, name: 'procu-test',         role: 'Procurement',         dept: 'procurement' },
  { id: 6, name: 'fin-test',           role: 'Finance',             dept: 'finance' },
  { id: 7, name: 'cs-test',            role: 'Customer Service',    dept: 'customer-service' },
  { id: 8, name: 'sales-test',         role: 'Sales Executive',     dept: 'sales' },
  { id: 9, name: 'IT-AD',              role: 'Admin (All Access)',   dept: 'IT' },
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

// ==================== MISSING ITEMS (POWER FEATURE) ====================
export interface MissingItem {
  id: string
  customer_name: string
  missing_item: string
  since: string
  cutoff_date?: string
  employee_id: number
}

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

// ==================== UNIFIED RATE (from all DB rate tables) ====================
export type RateSourceType = 'Contracted' | 'FAK' | 'Spot' | 'Tariff Rate' | 'NAC' | 'Special'

export type ServiceScope = 'Import' | 'Export' | 'Within'

export interface UnifiedRate {
  id: string                          // e.g. "contracted_fak_rate:1"
  source_type: RateSourceType
  liner_name: string | null
  origin: string | null
  destination: string | null
  container_type: string | null
  rate: number | null
  currency: string
  valid_from: string | null
  valid_to: string | null
  trade_lane: string | null
  vessel_name: string | null
  departure_date: string | null
  is_sold: boolean | null
  service_scope: ServiceScope | null  // Service Lane: Import / Within / Export
  // NAC-specific
  client_name: string | null
  employee_name: string | null
  // Special-specific
  commodity_name: string | null
  commodity_type: string | null
  remark: string | null
}

export interface PortRecord {
  port_id: number
  name: string
  country: string
}

/** UN/LOCODE lookup — keyed by port name (matches PortRecord.name) */
export const PORT_UNLOCODES: Record<string, string> = {
  'Colombo': 'LKCMB',
  'Hamburg': 'DEHAM',
  'Rotterdam': 'NLRTM',
  'Singapore': 'SGSIN',
  'Dubai': 'AEDXB',
  'Mumbai': 'INBOM',
  'Shanghai': 'CNSHA',
  'Antwerp': 'BEANR',
  'Felixstowe': 'GBFXT',
  'Jebel Ali': 'AEJEA',
  'Nhava Sheva': 'INNSA',
  'Chennai': 'INMAA',
}

/** Build datalist <option> elements for a port list — provides both Port/Country and UNLOCODE entries */
export function portOptions(ports: PortRecord[]): { value: string; label?: string }[] {
  const opts: { value: string; label?: string }[] = []
  for (const p of ports) {
    const display = `${p.name}/${p.country}`
    const code = PORT_UNLOCODES[p.name]
    opts.push({ value: display, label: code })
    if (code) opts.push({ value: code, label: display })
  }
  return opts
}

export interface LinerRecord {
  lin_id: number
  name: string
  is_on_inttra: boolean
  has_portal: boolean
}

export interface TradeLaneRecord {
  trln_id: number
  trln_name: string
}

export interface ContactPersonRecord {
  cp_id: number
  name: string | null
  email: string | null
  whatsapp: string | null
  wechat: string | null
  cli_id: number
  client_name: string
}

export interface EmployeeRecord {
  emp_id: number
  name: string
  desig: string | null
  dept: string | null
}

export interface ClientRecord {
  cli_id: number
  name: string
  vat_no: string | null
  credit_limit: number | null
  kyc_completed: boolean
  city: string | null
}

// Badge colors per rate source type
export const RATE_SOURCE_COLORS: Record<RateSourceType, string> = {
  Contracted: '#2563eb',
  FAK: '#7c3aed',
  Spot: '#ea580c',
  'Tariff Rate': '#0891b2',
  NAC: '#059669',
  Special: '#64748b',
}

// ---- INTTRA Rates → Spot response shape ---------------------------------
// Mirrors GET /rates/spot/inttraCompanyId/:inttraCompanyId (INTTRA Ocean
// Execution API v1). Field names are verified against INTTRA's published
// Postman schema so swapping mock data for the real API is a transport-
// layer swap, not a UI rewrite.

export interface InttraSchedule {
  fromLocation: string
  toLocation: string
  departureDate: string
  arrivalDate: string
  vessel: string
  voyageNumber: string
  transitTimeInDays: number
  bookingCutoffDate?: string  // not in INTTRA's published shape — see backend note
  scheduleDetails: unknown[]
}

export interface InttraPrice {
  priceId: string
  containerType: string          // ISO code: 20GP, 40HC, etc.
  priceValidFromDate: string
  priceLineItems: unknown[]
  totalPriceUSD: number
  totalBaseOceanFreightPriceUSD: number
}

export interface InttraDetentionDemurrage {
  displayName: string
  chargeType: string
  direction: string              // 'destination' | 'origin'
  commodity: string
  containerSizeType: string
  freeTimeInDays: number
  freeTimeStartEvent: string
  perDiemChargeList: unknown[]
}

export interface InttraScheduleRate {
  schedule: InttraSchedule
  prices: InttraPrice[]
  totalPriceUSD: number
  totalBaseOceanFreightPriceUSD: number
  rollable: boolean
  detentionAndDemurrageList: InttraDetentionDemurrage[]
  penaltiesList: unknown[]
}

export interface InttraSpotRate {
  spotRateId: string
  carrierScac: string
  carrierName: string
  originUnloc: string
  originDisplayName: string
  destinationUnloc: string
  destinationDisplayName: string
  validFromDate: string
  validToDate: string
  scheduleRates: InttraScheduleRate[]
  termsAndConditionsUrl: string
  customerSupportUrl: string
}

// Flatten one INTTRA offer into the single row the demo card renders.
// A real offer can carry multiple sailings (`scheduleRates[]`) and multiple
// container-type prices per sailing — for the demo UI we pick the first of
// each. When a multi-sailing UI is needed later, replace this with a fuller
// projection.
export interface InttraSpotRateCard {
  spotRateId: string
  carrierScac: string
  carrierName: string
  containerType: string
  totalPriceUSD: number
  transitTimeInDays: number
  freeTimeInDays: number
  bookingCutoffDate: string
  validFromDate: string
  validToDate: string
}

export function toInttraCard(offer: InttraSpotRate): InttraSpotRateCard {
  const sr = offer.scheduleRates?.[0]
  const price = sr?.prices?.[0]
  const dnd = sr?.detentionAndDemurrageList?.[0]
  return {
    spotRateId: offer.spotRateId,
    carrierScac: offer.carrierScac,
    carrierName: offer.carrierName,
    containerType: price?.containerType ?? '',
    totalPriceUSD: price?.totalPriceUSD ?? 0,
    transitTimeInDays: sr?.schedule?.transitTimeInDays ?? 0,
    freeTimeInDays: dnd?.freeTimeInDays ?? 0,
    bookingCutoffDate: sr?.schedule?.bookingCutoffDate ?? '',
    validFromDate: offer.validFromDate,
    validToDate: offer.validToDate,
  }
}

// ==================== QUOTATIONS ====================
export type RateType = 'Spot' | 'Contractual' | 'NAC' | 'Volume-based' | 'Convoy'
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

// ==================== BOOKINGS ====================
export type BookingStatus = 'Pending Liner' | 'RA Assigned' | 'Liner Confirmed' | 'Released' | 'Cancelled'

// Backend booking status enum — matches the API exactly
export type BackendBookingStatus =
  | 'request_initiated'
  | 'request_reviewed'
  | 'request_booking_success'
  | 'request_booking_failure'
  | 'release_order_received'

export const FE_TO_BE_BOOKING_STATUS: Record<BookingStatus, BackendBookingStatus> = {
  'Pending Liner':    'request_initiated',
  'RA Assigned':      'request_reviewed',
  'Liner Confirmed':  'request_booking_success',
  'Released':         'release_order_received',
  'Cancelled':        'request_initiated',
}

export const BE_TO_FE_BOOKING_STATUS: Record<BackendBookingStatus, BookingStatus> = {
  request_initiated:        'Pending Liner',
  request_reviewed:         'RA Assigned',
  request_booking_success:  'Liner Confirmed',
  request_booking_failure:  'Pending Liner',
  release_order_received:   'Released',
}

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
  si_cutoff_date?: string
  bl_cutoff_date?: string
  vgm_cutoff_date?: string
  filing_cutoff_date?: string
  si_requested?: boolean
  si_submitted?: boolean
  draft_bl_sent?: boolean
  bl_status?: 'pending' | 'approved' | 'changes-requested'
  delivery_type?: DeliveryType
  master_bl_number?: string
  master_bl_shipper?: string
  master_bl_consignee?: string
  master_bl_recorded?: boolean
  house_bl_number?: string
  house_bl_shipper?: string
  house_bl_consignee?: string
  house_bl_created?: boolean
  pre_advice_sent?: boolean         // true after CS sends pre-advice to door agent (door-to-door / port-to-door)
  release_order_attached?: boolean  // true after Procurement attaches release order and sends to CS
  release_order_fields?: ReleaseOrderFields
  // --- Backend integration IDs (internal, never rendered in UI) ---
  booking_id?: number       // Backend PK from POST /booking-requests
  inq_id?: number           // Inquiry PK — needed for booking & release-order API calls
  cli_id?: number           // Client PK — needed for booking & release-order API calls
  lin_id?: number           // Liner PK — resolved from LinerRecord by shipping_line name
  ro_id?: number            // Release order PK — set after POST /booking-requests/release-orders
  commodity_id?: number     // Commodity com_id — needed for POST /booking-requests
  // --- Structured fields stored alongside notes for API payloads ---
  vessel_etd?: string
  agreed_rate?: number
  delivery_term?: string
  contract_no?: string
  hs_code?: string
  bl_type?: string
  booking_type?: string
  ra_number?: string
  specific_routing?: string
  reefer_temp?: string
  delivery_agent?: string
  cargo_ready_date?: string
}

// ==================== VESSEL SCHEDULES ====================
export interface VesselSchedule {
  id: string
  vessel_name: string
  voyage_number: string
  schedule_type: 'FCL' | 'CONSOL' | 'BOTH'
  pol: string
  eta_pol: string
  etd_pol: string
  routing_type: 'DIRECT' | 'TRANSSHIPMENT'
  final_pod: string
  eta_fpod: string
  remarks: string
  agent: string
  created_at: string
  created_by: number
}

// ==================== RELEASE ORDER ====================
export interface ReleaseOrderFields {
  reference_nbr: string
  pickup_empty_date: string
  validity_expiration_date: string
  pickup_depot: string
  pickup_depot_address: string
  cargo_description: string
  cargo_weight: string
  cut_off_date: string
  etd: string
  eta: string
  next_port_of_discharge?: string
  transport_mode?: string
  transport_carrier?: string
}

// Maps frontend ReleaseOrderFields → backend POST /booking-requests/release-orders body
export interface BackendReleaseOrderPayload {
  inq_id: number
  booking_id: number
  cli_id: number
  liner_ref?: string         // ← reference_nbr
  empty_pickup?: string      // ← pickup_empty_date
  validity_exp?: string      // ← validity_expiration_date
  depot_name?: string        // ← pickup_depot
  depot_addr?: string        // ← pickup_depot_address
  vessel_cutoff?: string     // ← cut_off_date
  etd?: string               // ← etd
  eta_destination?: string   // ← eta
  next_port?: string         // ← next_port_of_discharge
  remark?: string            // ← transport_mode + transport_carrier concatenated
  cargo_weight?: number      // ← parseFloat(cargo_weight)
  cargo_desc?: string        // ← cargo_description
}

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
  pushed_to: string
  notes: string
}

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

export function daysUntil(date?: string): number {
  if (!date) return Infinity
  const today = new Date(todayISO()).getTime()
  const target = new Date(date).getTime()
  return Math.round((target - today) / 86400000)
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

// Enhanced duplicate detection — fuzzy match on name, email, phone, address, contact person.
// Returns potential duplicates with match reasons so the UI can warn before creation.
export function findDuplicateCustomers(
  newCust: { name: string; email?: string; phone?: string; address?: string; contact_person?: string },
  existing: Customer[]
): { customer: Customer; reasons: string[]; score: number }[] {
  const results: { customer: Customer; reasons: string[]; score: number }[] = []
  const normName = normaliseCustomer(newCust.name)
  const normNameTokens = new Set(normName.split(' ').filter(t => t.length >= 2))
  const normEmail = newCust.email?.toLowerCase().trim() ?? ''
  const normPhone = newCust.phone?.replace(/[\s\-()+ ]/g, '') ?? ''
  const normAddress = newCust.address?.toLowerCase().trim() ?? ''
  const normContact = newCust.contact_person?.toLowerCase().trim() ?? ''

  for (const c of existing) {
    const reasons: string[] = []
    let score = 0

    // Name matching (fuzzy)
    const cn = normaliseCustomer(c.name)
    if (cn === normName) { reasons.push('Exact name match'); score += 50 }
    else if (cn.includes(normName) || normName.includes(cn)) { reasons.push('Similar name'); score += 35 }
    else {
      const overlap = cn.split(' ').filter(t => normNameTokens.has(t)).length
      if (overlap > 0) { reasons.push(`Name token overlap (${overlap} words)`); score += 15 + overlap * 10 }
    }

    // Email matching
    if (normEmail && c.contact_email) {
      const ce = c.contact_email.toLowerCase().trim()
      if (ce === normEmail) { reasons.push('Same email'); score += 40 }
      else if (ce.split('@')[1] === normEmail.split('@')[1] && normEmail.includes('@')) {
        reasons.push('Same email domain'); score += 15
      }
    }

    // Phone matching (strip formatting)
    if (normPhone && c.contact_phone) {
      const cp = c.contact_phone.replace(/[\s\-()+ ]/g, '')
      if (cp === normPhone || cp.endsWith(normPhone.slice(-7)) || normPhone.endsWith(cp.slice(-7))) {
        reasons.push('Same phone number'); score += 35
      }
    }

    // Address matching
    if (normAddress && c.location) {
      const cl = c.location.toLowerCase().trim()
      if (cl === normAddress) { reasons.push('Same address'); score += 25 }
      else if (cl.includes(normAddress) || normAddress.includes(cl)) { reasons.push('Similar address'); score += 10 }
    }

    // Contact person matching
    if (normContact && c.contact_person) {
      const cc = c.contact_person.toLowerCase().trim()
      if (cc === normContact) { reasons.push('Same contact person'); score += 20 }
    }

    if (score > 0) results.push({ customer: c, reasons, score })
  }

  results.sort((a, b) => b.score - a.score)
  return results.filter(r => r.score >= 15) // minimum threshold to be considered a potential duplicate
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
  const findCust = (): string => {
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
      const name = m[1].trim()
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
    const customer = findCust()
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
    const customer = findCust()
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
    const customer = findCust()
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
