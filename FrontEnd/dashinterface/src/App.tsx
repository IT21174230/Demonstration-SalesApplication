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
import {
  SEED_INQUIRIES, SEED_TASKS, SEED_MISSING_ITEMS, SEED_FOLLOWUPS, SEED_CUSTOMERS,
  SEED_QUOTES, SEED_SHIPMENTS,
  PAGE_LABELS, nowStamp,
  type PageId, type Inquiry, type Task, type Followup, type Customer,
  type Quote, type QuoteStatus, type Shipment, type ShipmentStatus,
  type MissingItem,
} from './mockData'
import {
  fetchDashboardInit,
  apiCreateFollowup,
  apiCreateQuote, apiSetQuoteStatus,
  apiCreateTask, apiCompleteTask,
  apiAdvanceShipmentLeg, apiRecordShipmentPOD,
} from './api'

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard')
  // All data state persists across refresh via localStorage (demo behaviour).
  // On mount we fetch from the backend API; localStorage acts as cache.
  const [inquiries, setInquiries] = usePersistentState<Inquiry[]>('inquiries', SEED_INQUIRIES)
  const [tasks, setTasks] = usePersistentState<Task[]>('tasks', SEED_TASKS)
  const [missingItems, setMissingItems] = usePersistentState<MissingItem[]>('missingItems', SEED_MISSING_ITEMS)
  const [followups, setFollowups] = usePersistentState<Followup[]>('followups', SEED_FOLLOWUPS)
  const [customers, setCustomers] = usePersistentState<Customer[]>('customers', SEED_CUSTOMERS)
  const [quotes, setQuotes] = usePersistentState<Quote[]>('quotes', SEED_QUOTES)
  const [shipments, setShipments] = usePersistentState<Shipment[]>('shipments', SEED_SHIPMENTS)
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
        setCustomers(data.customers)
        setInquiries(data.inquiries)
        setTasks(data.tasks)
        setMissingItems(data.missing_items)
        setFollowups(data.followups)
        setQuotes(data.quotes)
        setShipments(data.shipments)
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
    }
  }

  if (!backendReady) {
    return (
      <div className="db-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#8899aa', fontSize: 14 }}>Loading dashboard...</span>
      </div>
    )
  }

  return (
    <div className="db-app">
      <TopBar currentPageLabel={PAGE_LABELS[currentPage]} />

      <div className="db-body">
        <Sidebar current={currentPage} onNav={setCurrentPage} />
        <main className="db-main" style={{ padding: '24px 28px' }}>
          {renderPage()}
        </main>
      </div>

      {toast && <div className="lt-toast">{toast}</div>}
    </div>
  )
}
