import { useState, useEffect } from 'react'
import { usePersistentState } from './hooks'
import './dashboard.css'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './components/pages/Dashboard'
import ChatAssistant from './components/pages/ChatAssistant'
import InquiryList from './components/pages/InquiryList'
import Followups from './components/pages/Followups'
import Customers from './components/pages/Customers'
import Quotations from './components/pages/Quotations'
import Shipments from './components/pages/Shipments'
import KYCForm from './components/pages/KYCForm'
import Workspace from './components/pages/Workspace'
import {
  SEED_INQUIRIES, SEED_TASKS, SEED_MISSING_ITEMS, SEED_FOLLOWUPS, SEED_CUSTOMERS,
  SEED_QUOTES, SEED_SHIPMENTS, SEED_BOOKINGS, SEED_ACTIVITY_LOG,
  PAGE_LABELS, nowStamp,
  EMPLOYEES, EMPLOYEE_ROLE_MAP, ROLE_ACTIONS, ROLE_PAGE_ACCESS, ROLE_LABELS,
  WORKFLOW_STAGES,
  type PageId, type Inquiry, type Task, type Followup, type Customer,
  type Quote, type QuoteStatus, type Shipment, type ShipmentStatus, type Booking,
  type MissingItem, type UserRole, type WorkflowStage, type ActivityEntry,
} from './mockData'
import { RoleContext, type RoleContextValue } from './RoleContext'
import {
  fetchDashboardInit,
  apiCreateFollowup,
  apiCreateQuote, apiSetQuoteStatus,
  apiCreateTask, apiCompleteTask,
  apiAdvanceShipmentLeg, apiRecordShipmentPOD,
  apiCreateActivity, apiCreateBooking, apiConfirmBooking, apiReleaseBooking, apiNotifyProcurement,
  apiUpdateCustomer, apiAdvanceWorkflow,
} from './api'

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('chat')

  // ---- IAM simulation ----
  const [activeEmployeeId, setActiveEmployeeId] = usePersistentState<number>('active-employee', 2) // default: Anjali (CS)
  const activeEmployee = EMPLOYEES.find(e => e.id === activeEmployeeId) ?? EMPLOYEES[0]
  const activeRole: UserRole = EMPLOYEE_ROLE_MAP[activeEmployeeId] ?? 'CS'

  const canAccessPage = (page: PageId) => ROLE_PAGE_ACCESS[activeRole].includes(page)
  const hasPermission = (action: string) => ROLE_ACTIONS[activeRole].includes(action as any)

  const navigateTo = (page: PageId) => {
    if (canAccessPage(page)) {
      setCurrentPage(page)
    } else {
      setCurrentPage('dashboard')
      flash(`Access denied: ${PAGE_LABELS[page]} requires ${ROLE_LABELS[activeRole]} does not have access`)
    }
  }

  // Redirect if current page becomes inaccessible after role switch
  useEffect(() => {
    if (!canAccessPage(currentPage)) {
      setCurrentPage('dashboard')
    }
  }, [activeEmployeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const advanceWorkflow = (inquiryId: string, nextStage: WorkflowStage) => {
    setInquiries(prev => prev.map(i =>
      i.id === inquiryId ? { ...i, workflow_stage: nextStage } : i
    ))
    apiAdvanceWorkflow(inquiryId, nextStage).catch(() => console.warn('API: advance workflow failed'))
    const stageLabel = WORKFLOW_STAGES.find(s => s.id === nextStage)?.label ?? nextStage
    flash(`${inquiryId} → ${stageLabel}`)
  }

  // All data state persists across refresh via localStorage (demo behaviour).
  // On mount we fetch from the backend API; localStorage acts as cache.
  const [inquiries, setInquiries] = usePersistentState<Inquiry[]>('inquiries', SEED_INQUIRIES)
  const [tasks, setTasks] = usePersistentState<Task[]>('tasks', SEED_TASKS)
  const [missingItems, setMissingItems] = usePersistentState<MissingItem[]>('missingItems', SEED_MISSING_ITEMS)
  const [followups, setFollowups] = usePersistentState<Followup[]>('followups', SEED_FOLLOWUPS)
  const [customers, setCustomers] = usePersistentState<Customer[]>('customers', SEED_CUSTOMERS)
  const [quotes, setQuotes] = usePersistentState<Quote[]>('quotes', SEED_QUOTES)
  const [shipments, setShipments] = usePersistentState<Shipment[]>('shipments', SEED_SHIPMENTS)
  const [bookings, setBookings] = usePersistentState<Booking[]>('bookings', SEED_BOOKINGS)
  const [activityLog, setActivityLog] = usePersistentState<ActivityEntry[]>('activityLog', SEED_ACTIVITY_LOG)
  const [backendReady, setBackendReady] = useState(false)
  // Lets the chat tell the Quotations page to open its builder pre-filled with a customer.
  const [quotePrefillCustomer, setQuotePrefillCustomer] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // ---- Fetch all data from the backend on mount ----
  useEffect(() => {
    fetchDashboardInit()
      .then(data => {
        setCustomers(data.customers)
        setInquiries(data.inquiries)
        setTasks(data.tasks)
        setMissingItems(data.missing_items)
        setFollowups(data.followups)
        setQuotes(data.quotes)
        setShipments(data.shipments)
        if (data.bookings) setBookings(data.bookings)
        if (data.activity_log) setActivityLog(data.activity_log)
        setBackendReady(true)
      })
      .catch(() => {
        // Backend unreachable — fall back to localStorage / seed data
        console.warn('Backend unreachable — using cached data')
        setBackendReady(true)
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch all dashboard data from the backend. Called after AI chat
  // tool calls that may have mutated mock_data.json directly.
  const refreshData = () => {
    fetchDashboardInit()
      .then(data => {
        // Detect newly added customers → prompt CS to initiate KYC
        const oldIds = new Set(customers.map(c => c.id))
        const newCusts = data.customers.filter((c: Customer) => !oldIds.has(c.id))

        setCustomers(data.customers)
        setInquiries(data.inquiries)
        setTasks(data.tasks)
        setMissingItems(data.missing_items)
        setFollowups(data.followups)
        setQuotes(data.quotes)
        setShipments(data.shipments)
        if (data.bookings) setBookings(data.bookings)
        if (data.activity_log) setActivityLog(data.activity_log)

        if (newCusts.length > 0) {
          const names = newCusts.map((c: Customer) => c.name).join(', ')
          flash(`New customer "${names}" added — initiate KYC process from Workspace`)
        }
      })
      .catch(() => console.warn('Refresh failed — backend unreachable'))
  }

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const addFollowup = (
    customerName: string,
    note: string,
    completionFlag: boolean,
    employeeId: number = 1,
  ) => {
    const target = inquiries.find(
      i => i.customer_name.toLowerCase() === customerName.toLowerCase() &&
        (completionFlag ? i.status === 'pending' : true),
    )
    const stamp = nowStamp()
    const newFup: Followup = {
      id: `FUP-${405 + followups.length - SEED_FOLLOWUPS.length}`,
      inquiry_id: target?.id,
      customer_name: customerName,
      note: note || (completionFlag ? 'Completed' : 'Follow-up logged'),
      employee_id: employeeId,
      created_at: stamp,
      completion_flag: completionFlag,
    }
    setFollowups(prev => [newFup, ...prev])
    // Persist to backend
    apiCreateFollowup({
      customer_name: customerName,
      note: newFup.note,
      completion_flag: completionFlag,
      employee_id: employeeId,
    }).catch(() => console.warn('API: create followup failed'))

    if (completionFlag && target) {
      setInquiries(prev =>
        prev.map(i =>
          i.id === target.id
            ? { ...i, status: 'completed', completed_at: stamp, followup_note: newFup.note }
            : i,
        ),
      )
      flash(`Marked ${customerName} as completed`)
    } else if (completionFlag && !target) {
      flash(`Logged follow-up — no pending inquiry found for "${customerName}"`)
    } else {
      flash(`Follow-up logged for ${customerName}`)
    }
  }

  const completeInquiryById = (id: string) => {
    const target = inquiries.find(i => i.id === id)
    if (!target || target.status === 'completed') return
    addFollowup(target.customer_name, 'Marked complete from list', true, target.employee_id)
  }

  // ---- Phase 5: Quote handlers ----
  // Adds a quote and auto-routes to 'Awaiting Approval' when margin is under
  // the customer's min_margin_pct floor.
  const addQuote = (q: Omit<Quote, 'id' | 'created_at' | 'status' | 'approval_reason'>): Quote => {
    const cust = customers.find(c => c.name.toLowerCase() === q.customer_name.toLowerCase())
    const needsApproval = !!cust && q.margin_pct < cust.min_margin_pct
    const newQ: Quote = {
      ...q,
      id: `QUO-${502 + quotes.length - SEED_QUOTES.length}`,
      created_at: nowStamp(),
      status: needsApproval ? 'Awaiting Approval' : 'Draft',
      approval_reason: needsApproval ? `margin ${q.margin_pct}% < min ${cust!.min_margin_pct}%` : undefined,
    }
    setQuotes(prev => [newQ, ...prev])
    flash(needsApproval ? `Quote ${newQ.id} pending approval (${cust!.name} floor ${cust!.min_margin_pct}%)` : `Quote ${newQ.id} saved as ${newQ.status}`)
    // Persist to backend
    apiCreateQuote({
      customer_name: q.customer_name,
      origin: q.origin,
      destination: q.destination,
      quote_type: q.quote_type,
      margin_pct: q.margin_pct,
      created_by: q.created_by,
      inquiry_id: q.inquiry_id,
      lines: q.lines,
    }).catch(() => console.warn('API: create quote failed'))
    return newQ
  }

  const setQuoteStatus = (id: string, status: QuoteStatus) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    // Persist to backend
    apiSetQuoteStatus(id, status).catch(() => console.warn('API: set quote status failed'))
    // Phase 7.2 — mock automated email triggers (the meeting's "automated email
    // notifications as alternative to client login" requirement).
    const q = quotes.find(x => x.id === id)
    if (status === 'Sent' && q) flash(`Quote ${id} → Sent · Email dispatched to ${q.customer_name}`)
    else if (status === 'Approved') flash(`Quote ${id} → Approved · ready to send`)
    else if (status === 'Confirmed' && q) flash(`Quote ${id} → Confirmed · Booking instructions emailed to ${q.customer_name}`)
    else flash(`Quote ${id} → ${status}`)
  }

  // ---- Phase 6: Shipment handlers ----
  const recordShipmentPOD = (id: string) => {
    const s = shipments.find(x => x.id === id)
    setShipments(prev => prev.map(x =>
      x.id === id ? { ...x, status: 'Delivered', pod_received: nowStamp() } : x,
    ))
    if (s) flash(`POD recorded for ${id} · Delivery confirmation emailed to ${s.customer_name}`)
    // Persist to backend
    apiRecordShipmentPOD(id).catch(() => console.warn('API: record POD failed'))
  }

  const advanceShipmentLeg = (shipmentId: string, legId: string) => {
    setShipments(prev => prev.map(s => {
      if (s.id !== shipmentId) return s
      const legs = s.legs.map(leg => {
        if (leg.id !== legId) return leg
        // Cycle Pending → Arrived → Departed; Destination stops at Arrived.
        if (leg.status === 'Pending') return { ...leg, status: 'Arrived' as const, actual_at: nowStamp().slice(0, 10) }
        if (leg.status === 'Arrived' && leg.type !== 'Destination') return { ...leg, status: 'Departed' as const }
        return leg
      })
      // Compute aggregate shipment status from leg progress.
      const allDelivered = legs.every(l => l.type !== 'Destination' || l.status === 'Arrived')
      const transshipmentArrived = legs.some(l => l.type === 'Transshipment' && l.status === 'Arrived' && !legs.some(x => x.type === 'Transshipment' && x.id !== l.id && x.status === 'Departed'))
      let status: ShipmentStatus = s.status
      if (allDelivered) status = 'Delivered'
      else if (transshipmentArrived) status = 'At Transshipment'
      else status = 'In Transit'
      return { ...s, legs, status }
    }))
    // Persist to backend
    apiAdvanceShipmentLeg(shipmentId, legId).catch(() => console.warn('API: advance leg failed'))
  }

  const addTask = (customerName: string, taskText: string, dueDate: string, employeeId: number) => {
    const newTask: Task = {
      id: `TSK-${206 + tasks.length - SEED_TASKS.length}`,
      customer_name: customerName,
      task: taskText,
      status: 'pending',
      due_date: dueDate,
      employee_id: employeeId,
    }
    setTasks(prev => [newTask, ...prev])
    flash(`Task added for ${customerName}`)
    // Persist to backend
    apiCreateTask({
      customer_name: customerName,
      task: taskText,
      due_date: dueDate,
      employee_id: employeeId,
    }).catch(() => console.warn('API: create task failed'))
  }

  const completeTask = (id: string) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status: 'completed' } : t)))
    // Persist to backend
    apiCompleteTask(id).catch(() => console.warn('API: complete task failed'))
  }

  // ---- Workspace handlers ----
  const logActivity = (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
    const newEntry: ActivityEntry = {
      ...entry,
      id: `ACT-${Date.now()}`,
      timestamp: nowStamp(),
    }
    setActivityLog(prev => [newEntry, ...prev])
    apiCreateActivity({
      actor_role: entry.actor_role,
      actor_id: entry.actor_id,
      action: entry.action,
      ref_type: entry.ref_type,
      ref_id: entry.ref_id,
      customer_name: entry.customer_name,
      pushed_to: entry.pushed_to,
      notes: entry.notes,
    }).catch(() => console.warn('API: create activity failed'))
  }

  const confirmBooking = (bookingId: string, vesselName: string, voyageNumber: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId
        ? { ...b, status: 'Liner Confirmed' as const, vessel_name: vesselName, voyage_number: voyageNumber, confirmed_by: activeEmployeeId, confirmed_at: nowStamp() }
        : b
    ))
    apiConfirmBooking(bookingId, { vessel_name: vesselName, voyage_number: voyageNumber, confirmed_by: activeEmployeeId })
      .catch(() => console.warn('API: confirm booking failed'))
    flash(`${bookingId} → Liner Confirmed`)
  }

  const releaseBooking = (bookingId: string, note: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId
        ? { ...b, status: 'Released' as const, released_by: activeEmployeeId, released_at: nowStamp(), notes: note || b.notes }
        : b
    ))
    apiReleaseBooking(bookingId, { note, released_by: activeEmployeeId })
      .catch(() => console.warn('API: release booking failed'))
    flash(`${bookingId} → Released`)
  }

  const acknowledgeProcurement = (bookingId: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, procurement_notified: true } : b
    ))
    apiNotifyProcurement(bookingId)
      .catch(() => console.warn('API: notify procurement failed'))
    flash(`${bookingId} → Procurement acknowledged`)
  }

  const createBooking = (payload: {
    customer_name: string; quote_id: string; shipping_line: string;
    container_type: string; quantity: number; origin: string; destination: string;
    is_urgent: boolean; booked_by: number; notes: string;
  }) => {
    const newId = `BKG-${900 + bookings.length + 1}`
    const stamp = nowStamp()
    const newBooking: Booking = {
      id: newId,
      quote_id: payload.quote_id,
      customer_name: payload.customer_name,
      origin: payload.origin,
      destination: payload.destination,
      shipping_line: payload.shipping_line,
      vessel_name: '',
      voyage_number: '',
      container_type: payload.container_type,
      quantity: payload.quantity,
      status: 'Pending Liner',
      is_urgent: payload.is_urgent,
      booked_by: payload.booked_by,
      confirmed_by: null,
      released_by: null,
      created_at: stamp,
      confirmed_at: null,
      released_at: null,
      procurement_notified: false,
      notes: payload.notes,
    }
    setBookings(prev => [newBooking, ...prev])
    apiCreateBooking(payload).catch(() => console.warn('API: create booking failed'))
    flash(`${newId} → Booking created for ${payload.customer_name}`)
    return newId
  }

  const updateCustomerKyc = (customerName: string, kycStatus: 'not_started' | 'pending_customer' | 'approved') => {
    setCustomers(prev => prev.map(c =>
      c.name === customerName ? { ...c, kyc_status: kycStatus } : c
    ))
    apiUpdateCustomer(customerName, { kyc_status: kycStatus })
      .catch(() => console.warn('API: update customer KYC failed'))
  }

  const autoAdvanceForCustomer = (customerName: string, targetStage: WorkflowStage) => {
    setInquiries(prev => prev.map(inq => {
      if (inq.customer_name.toLowerCase() !== customerName.toLowerCase()) return inq
      if (inq.status === 'completed') return inq
      const stuckStages: WorkflowStage[] = ['inquiry-received', 'customer-check', 'kyc-pending', 'kyc-verification']
      if (inq.workflow_stage && stuckStages.includes(inq.workflow_stage)) {
        apiAdvanceWorkflow(inq.id, targetStage).catch(() => console.warn('API: auto-advance workflow failed'))
        return { ...inq, workflow_stage: targetStage }
      }
      return inq
    }))
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return (
          <Dashboard
            inquiries={inquiries}
            tasks={tasks}
            followups={followups}
            missingItems={missingItems}
            quotes={quotes}
            onGoTo={setCurrentPage}
          />
        )
      case 'chat':
        return (
          <ChatAssistant
            inquiries={inquiries}
            customers={customers}
            onRefreshData={refreshData}
          />
        )
      case 'quotations':
        return (
          <Quotations
            quotes={quotes}
            customers={customers}
            inquiries={inquiries}
            onAddQuote={addQuote}
            onSetQuoteStatus={setQuoteStatus}
            onFlash={flash}
            preFillCustomer={quotePrefillCustomer ?? undefined}
            onPreFillConsumed={() => setQuotePrefillCustomer(null)}
          />
        )
      case 'shipments':
        return (
          <Shipments
            shipments={shipments}
            bookings={bookings}
            onAdvanceLeg={advanceShipmentLeg}
            onRecordPOD={recordShipmentPOD}
          />
        )
      case 'inquiry-list':
        return (
          <InquiryList
            inquiries={inquiries}
            followups={followups}
            customers={customers}
            quotes={quotes}
            onCompleteById={completeInquiryById}
            onAdvanceWorkflow={advanceWorkflow}
          />
        )
      case 'followups':
        return (
          <Followups
            inquiries={inquiries}
            tasks={tasks}
            missingItems={missingItems}
            followups={followups}
            onAddFollowup={addFollowup}
            onAddTask={addTask}
            onCompleteTask={completeTask}
          />
        )
      case 'customers':
        return <Customers inquiries={inquiries} customers={customers} />
      case 'kyc':
        return <KYCForm customers={customers} onFlash={flash} />
      case 'workspace':
        return (
          <Workspace
            inquiries={inquiries}
            bookings={bookings}
            quotes={quotes}
            customers={customers}
            activityLog={activityLog}
            onAdvanceWorkflow={advanceWorkflow}
            onConfirmBooking={confirmBooking}
            onReleaseBooking={releaseBooking}
            onAcknowledgeProcurement={acknowledgeProcurement}
            onCreateBooking={createBooking}
            onSetQuoteStatus={setQuoteStatus}
            onUpdateCustomerKyc={updateCustomerKyc}
            onAutoAdvanceForCustomer={autoAdvanceForCustomer}
            onLogActivity={logActivity}
            onFlash={flash}
          />
        )
    }
  }

  if (!backendReady) {
    return (
      <div className="db-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#94a3b8', fontSize: 14 }}>Loading dashboard...</span>
      </div>
    )
  }

  const roleCtx: RoleContextValue = {
    activeEmployee,
    activeRole,
    hasPermission: (action) => ROLE_ACTIONS[activeRole].includes(action),
    canAccessPage,
  }

  return (
    <RoleContext.Provider value={roleCtx}>
      <div className="db-app">
        <TopBar
          currentPageLabel={PAGE_LABELS[currentPage]}
          activeEmployee={activeEmployee}
          activeRole={activeRole}
          onSwitchEmployee={setActiveEmployeeId}
        />

        <div className="db-body">
          <Sidebar current={currentPage} onNav={navigateTo} activeRole={activeRole} />
          <main className="db-main" style={{ padding: '24px 28px' }}>
            {renderPage()}
          </main>
        </div>

        {toast && <div className="lt-toast">{toast}</div>}
      </div>
    </RoleContext.Provider>
  )
}
