import { useState, useEffect } from 'react'
import './dashboard.css'
import TopBar from './components/layout/TopBar'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './components/pages/Dashboard'
import ChatAssistant from './components/pages/ChatAssistant'
import InquiryList from './components/pages/InquiryList'
import RateList from './components/pages/RateList'
import Followups from './components/pages/Followups'
import Customers from './components/pages/Customers'
import Quotations from './components/pages/Quotations'
import Shipments from './components/pages/Shipments'
import KYCForm from './components/pages/KYCForm'
import Workspace from './components/pages/Workspace'
import NewInquiry from './components/pages/NewInquiry'
import RecordRate from './components/pages/RecordRate'
import RateCheck from './components/pages/RateCheck'
import Login from './components/pages/Login'
import Profile from './components/pages/Profile'
import {
  PAGE_LABELS, nowStamp,
  EMPLOYEES, EMPLOYEE_ROLE_MAP, ROLE_ACTIONS, ROLE_PAGE_ACCESS, ROLE_LABELS,
  WORKFLOW_STAGES,
  type PageId, type Inquiry, type Task, type Followup, type Customer,
  type Quote, type QuoteStatus, type Shipment, type ShipmentStatus, type Booking,
  type MissingItem, type UserRole, type WorkflowStage, type ActivityEntry, type ContainerLine,
  type ClientRecord, type ContactPersonRecord,
} from './types'
import { RoleContext, type RoleContextValue } from './RoleContext'
import {
  apiCreateFollowup,
  apiCreateQuote, apiSetQuoteStatus,
  apiCreateTask, apiCompleteTask,
  apiAdvanceShipmentLeg, apiRecordShipmentPOD,
  apiCreateInquiry, apiCreateInquiryOldNew, apiCreateInquiryOldOld, apiFetchAllInquiries,
  apiGetClientsDb, apiGetKycPendingClients, type KycPendingClient,
  apiGetKycRequests, type KycRequestRecord,
  type InquiryRow,
  apiCreateActivity, apiCreateBooking, apiConfirmBooking, apiReleaseBooking, apiNotifyProcurement,
  apiSetBookingSiCutoff, apiMarkSiRequested,
  apiSetBookingBlCutoff, apiMarkSiSubmitted, apiMarkDraftBlSent, apiSetBlStatus,
  apiRecordMasterBl, apiCreateHouseBl,
  apiUpdateCustomer, apiAdvanceWorkflow, apiGetInquiry,
  apiPatchInquiry, apiPatchCommodity, apiPatchContainer, apiDeleteInquiry,
  apiGetClientKycStatus, BE_STAGE_TO_FE,
  apiSwitchUser,
} from './api'

// crypto.randomUUID() requires HTTPS (secure context). Fall back for plain HTTP deployments.
const uuid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

// Container type codes the backend uses → frontend ContainerType labels
const BE_CONTAINER_TYPE: Record<string, string> = {
  '20GP': '20 GP', '40GP': '40 GP', '40HC': '40 HC',
  '20RF': '20 REEFER', '40RF': '40 REEFER',
  '20OT': '20 OPEN TOP', '40OT': '40 OPEN TOP',
  '20FR': '20 FLAT RACK', '40FR': '40 FLAT RACK',
}
// Priority codes from backend → frontend InquiryPriority labels
const BE_PRIORITY: Record<string, Inquiry['priority']> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent',
}
// Commodity type name normalisation (backend may use singular form)
const BE_COM_TYPE: Record<string, string> = {
  Textile: 'Textiles', Textiles: 'Textiles',
  General: 'General', Food: 'Food', Hazardous: 'Hazardous',
  Pharmaceuticals: 'Pharmaceuticals', Electronics: 'Electronics',
  Chemicals: 'Chemicals', Other: 'Other',
}

/**
 * Converts the flat InquiryRow[] from GET /inquiries/inquiries into Inquiry[]
 * by grouping rows on inq_id (one row per container in the backend join).
 */
function mapInquiryRows(rows: InquiryRow[]): Inquiry[] {
  const grouped = new Map<number, InquiryRow[]>()
  for (const r of rows) {
    if (!grouped.has(r.inq_id)) grouped.set(r.inq_id, [])
    grouped.get(r.inq_id)!.push(r)
  }

  const result: Inquiry[] = []
  for (const [inq_id, group] of grouped) {
    const h = group[0]
    const containers: ContainerLine[] = group.map(r => ({
      containerType: (BE_CONTAINER_TYPE[r.container_type ?? ''] ?? r.container_type ?? '20 GP') as ContainerLine['containerType'],
      quantity: r.qty ?? 1,
      weight: r.commodity_weight ?? '',
      commodityType: (BE_COM_TYPE[r.commodity_type ?? ''] ?? r.commodity_type ?? 'Miscellaneous manufactured articles — furniture, toys') as ContainerLine['commodityType'],
      commodityName: r.commodity_name ?? '',
      destination: r.destination,
      isFcl: r.is_fully_loaded,
      zipCode: r.zip_code ?? '',
      doorAgents: [],
      freeTime: r.free_time ? (parseInt(r.free_time, 10) || '') : '',
      temperature: r.temperature ?? undefined,
      address: r.address ?? undefined,
      hs_code: r.hs_code ?? undefined,
      com_id: r.com_id,
      cont_id: r.cont_id,
    }))

    result.push({
      id: String(inq_id),
      inq_id,
      cli_id: h.cli_id,
      customer_name: h.name,
      employee_id: 0, // not returned by list endpoint; overwritten when activeEmployeeId is known
      origin: h.origin,
      destination: group[0]?.destination ?? '',
      status: 'pending',
      created_at: h.cargo_ready_date ?? '',
      sbu: (h.sbu as Inquiry['sbu']) ?? 'Ocean Exports',
      priority: h.priority ? (BE_PRIORITY[h.priority] ?? undefined) : undefined,
      delivery_type: h.service_mode === 'DOOR_TO_DOOR' ? 'door-to-door' : 'port-to-port',
      preferred_liners: h.preferred_liners
        ? h.preferred_liners.split(',').map(s => s.trim()).filter(Boolean)
        : undefined,
      incoterm: h.incoterm ?? undefined,
      cargo_ready_date: h.cargo_ready_date ?? undefined,
      preferred_rate: h.preferred_rate ?? undefined,
      containers,
      workflow_stage: (h.workflow_stage ? BE_STAGE_TO_FE[h.workflow_stage] ?? 'rate-check' : 'rate-check') as WorkflowStage,
      kyc_completed: h.kyc_completed ?? undefined,
    })
  }
  return result
}

export default function App() {
  // Valid employee IDs the backend accepts — stale sessionStorage values must be rejected
  const validEmpIds = EMPLOYEES.map(e => e.id)

  const [loggedInEmployeeId, setLoggedInEmployeeId] = useState<number | null>(
    () => {
      const stored = sessionStorage.getItem('loggedInEmployeeId')
      if (!stored) return null
      const id = Number(stored)
      if (!validEmpIds.includes(id)) {
        // Stale session from old employee IDs — clear and force re-login
        sessionStorage.removeItem('loggedInEmployeeId')
        return null
      }
      return id
    }
  )

  const loadAppData = () => {
    apiGetClientsDb().then(cl => {
      setClientList(cl)
      setCustomers(cl.map(r => ({
        id:            String(r.cli_id),
        name:          r.name,
        location:      r.city ?? '',
        tier:          'Regular'     as const,
        payment_terms: 'Pay Upfront' as const,
        blacklisted:   false,
        credit_hold:   false,
        min_margin_pct: 0,
        kyc_status:    r.kyc_completed ? 'approved' as const : 'not_started' as const,
      })))
    }).catch(() => console.warn('[loadAppData] Could not load client list'))
    apiGetKycPendingClients()
      .then(setKycPendingClients)
      .catch(() => console.warn('[loadAppData] Could not load KYC pending clients'))
    apiGetKycRequests()
      .then(setKycRequests)
      .catch(() => console.warn('[loadAppData] Could not load KYC requests'))
    apiFetchAllInquiries()
      .then(rows => setInquiries(mapInquiryRows(rows)))
      .catch(() => console.warn('[loadAppData] Could not load inquiries from backend'))
      .finally(() => setInitState('ready'))
  }

  const handleLogin = (empId: number) => {
    sessionStorage.setItem('loggedInEmployeeId', String(empId))
    setLoggedInEmployeeId(empId)
    setActiveEmployeeId(empId)
    // Switch backend user context, then re-fetch all employee-scoped data
    apiSwitchUser(empId)
      .then(() => loadAppData())
      .catch(err => console.error('Failed to switch user on backend:', err))
  }

  const handleLogout = () => {
    sessionStorage.removeItem('loggedInEmployeeId')
    setLoggedInEmployeeId(null)
  }

  const [currentPage, setCurrentPage] = useState<PageId>('workspace')
  // When navigating to workspace from rate-check, this tells Workspace which step to open on mount.
  // Cleared by a useEffect once workspace has mounted and captured the value.
  const [workspaceInitialStep, setWorkspaceInitialStep] = useState<string | null>(null)

  // ---- Role-based access control ----
  const [activeEmployeeId, setActiveEmployeeId] = useState<number>(() => {
    const stored = sessionStorage.getItem('loggedInEmployeeId')
    if (stored && validEmpIds.includes(Number(stored))) return Number(stored)
    return EMPLOYEES[0].id
  })
  const activeEmployee = EMPLOYEES.find(e => e.id === activeEmployeeId) ?? EMPLOYEES[0]
  const activeRole: UserRole = EMPLOYEE_ROLE_MAP[activeEmployeeId] ?? 'CS'

  const canAccessPage = (page: PageId) => ROLE_PAGE_ACCESS[activeRole].includes(page)

  const navigateTo = (page: PageId) => {
    if (canAccessPage(page)) {
      setCurrentPage(page)
    } else {
      setCurrentPage('dashboard')
      flash(`Access denied: ${PAGE_LABELS[page]} requires ${ROLE_LABELS[activeRole]} does not have access`)
    }
  }

  const startRateCheck = (inquiry: Inquiry, container?: ContainerLine, variant: 'procurement' | 'cs-sales' = 'procurement') => {
    setRateCheckContext({ inquiry, container, variant })
    setCurrentPage('rate-check')
  }

  // Redirect if current page becomes inaccessible after role switch
  useEffect(() => {
    if (!canAccessPage(currentPage)) {
      setCurrentPage('dashboard')
    }
  }, [activeEmployeeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once workspace mounts and captures initialStep, clear the hint so the next
  // manual navigation to workspace doesn't jump to the same step again.
  useEffect(() => {
    if (currentPage === 'workspace' && workspaceInitialStep) {
      setWorkspaceInitialStep(null)
    }
  }, [currentPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // skipApi: set to true when the backend already auto-advanced the workflow
  // as a side effect of another API call (e.g. POST /rate-requests, POST .../options,
  // PATCH /quotations/.../send, PATCH .../response). In that case we only update
  // local React state — no redundant PATCH to the workflow endpoint.
  // Either way, we re-fetch the inquiry from the backend after the update so the
  // displayed stage always reflects the backend's actual state.
  const advanceWorkflow = (inquiryId: string, nextStage: WorkflowStage, skipApi = false) => {
    setInquiries(prev => prev.map(i =>
      i.id === inquiryId ? { ...i, workflow_stage: nextStage } : i
    ))
    const inqId = inquiries.find(i => i.id === inquiryId)?.inq_id
    if (!skipApi && inqId) {
      apiAdvanceWorkflow(inquiryId, nextStage, inqId).catch(() => console.warn('API: advance workflow failed'))
    }
    // Re-fetch from backend so local state matches the server's actual stage
    // (backend may have auto-advanced further, e.g. after adding a rate option)
    if (inqId) {
      apiGetInquiry(inqId).then(rows => {
        if (rows.length === 0) return
        const beStage = (BE_STAGE_TO_FE[rows[0].workflow_stage ?? ''] ?? 'rate-check') as WorkflowStage
        setInquiries(prev => prev.map(i =>
          i.id === inquiryId ? { ...i, workflow_stage: beStage } : i
        ))
      }).catch(() => {/* silent — local optimistic state is acceptable fallback */})
    }
    const stageLabel = WORKFLOW_STAGES.find(s => s.id === nextStage)?.label ?? nextStage
    flash(`${inquiryId} → ${stageLabel}`)
  }

  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [missingItems, _setMissingItems] = useState<MissingItem[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([])
  // Reference data — fetched once at startup and cached for the session
  const [clientList, setClientList] = useState<ClientRecord[]>([])
  const contactPersonList: ContactPersonRecord[] = []  // disabled until backend provides bulk endpoint
  const [kycPendingClients, setKycPendingClients] = useState<KycPendingClient[]>([])
  const [kycRequests, setKycRequests] = useState<KycRequestRecord[]>([])
  const [initState, setInitState] = useState<'loading' | 'ready' | 'error'>('loading')
  // Lets the chat tell the Quotations page to open its builder pre-filled with a customer.
  const [quotePrefillCustomer, setQuotePrefillCustomer] = useState<string | null>(null)
  const [rateCheckContext, setRateCheckContext] = useState<{ inquiry: Inquiry; container?: ContainerLine; variant: 'procurement' | 'cs-sales' } | null>(null)
  const [toast, setToast] = useState<{ message: string; action?: { label: string; onClick: () => void } } | null>(null)

  // ---- Initialise app state ----
  useEffect(() => {
    // Only load data on startup if user is already logged in (valid session).
    // If not logged in, Login screen is shown and handleLogin will call loadAppData after switch-user.
    if (!loggedInEmployeeId) {
      setInitState('ready')
      return
    }
    apiSwitchUser(loggedInEmployeeId)
      .catch(() => console.warn('[startup] switch-user failed'))
      .then(() => loadAppData())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refreshData = () => {
    apiFetchAllInquiries()
      .then(rows => setInquiries(mapInquiryRows(rows)))
      .catch(() => console.warn('[refreshData] Failed to fetch inquiries'))
  }

  const handlePatchInquiry = (
    inq_id: number,
    data: Parameters<typeof apiPatchInquiry>[1],
    commodityPatches?: Array<{ com_id: number; data: Parameters<typeof apiPatchCommodity>[2] }>,
    containerPatches?: Array<{ cont_id: number; data: Parameters<typeof apiPatchContainer>[2] }>
  ) => {
    const calls: Promise<unknown>[] = [
      apiPatchInquiry(inq_id, data),
      ...(commodityPatches ?? []).map(cp => apiPatchCommodity(inq_id, cp.com_id, cp.data)),
      ...(containerPatches ?? []).map(cp => apiPatchContainer(inq_id, cp.cont_id, cp.data)),
    ]
    Promise.all(calls)
      .then(() => { refreshData(); flash(`Inquiry #${inq_id} updated`) })
      .catch(e => flash(`Failed to save inquiry: ${(e as Error).message}`))
  }

  const handleDeleteInquiry = (inq_id: number) => {
    apiDeleteInquiry(inq_id)
      .then(() => {
        setInquiries(prev => prev.filter(i => i.inq_id !== inq_id))
        flash(`Inquiry #${inq_id} deleted`)
      })
      .catch(e => flash(`Failed to delete inquiry: ${(e as Error).message}`))
  }

  const flash = (msg: string, action?: { label: string; onClick: () => void }) => {
    setToast({ message: msg, action })
    setTimeout(() => setToast(null), action ? 8000 : 3500)
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
      id: `FUP-${uuid()}`,
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
      employee_id: activeEmployeeId,
    }).then(created => {
      setFollowups(prev => prev.map(f => f.id === newFup.id ? created : f))
    }).catch(err => console.error('Create followup failed:', err))

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

  // Adds a quote and auto-routes to 'Awaiting Approval' when margin is under
  // the customer's min_margin_pct floor.
  const addQuote = (q: Omit<Quote, 'id' | 'created_at' | 'status' | 'approval_reason'>): Quote => {
    const cust = customers.find(c => c.name.toLowerCase() === q.customer_name.toLowerCase())
    const needsApproval = !!cust && q.margin_pct < cust.min_margin_pct
    const tempId = `QUO-${uuid()}`
    const newQ: Quote = {
      ...q,
      id: tempId,
      created_at: nowStamp(),
      status: needsApproval ? 'Awaiting Approval' : 'Draft',
      approval_reason: needsApproval ? `margin ${q.margin_pct}% < min ${cust!.min_margin_pct}%` : undefined,
    }
    setQuotes(prev => [newQ, ...prev])
    flash(needsApproval ? `Quote pending approval (${cust!.name} floor ${cust!.min_margin_pct}%)` : `Quote saved as ${newQ.status}`)
    apiCreateQuote({
      customer_name: q.customer_name,
      origin: q.origin,
      destination: q.destination,
      quote_type: q.quote_type,
      margin_pct: q.margin_pct,
      created_by: q.created_by,
      inquiry_id: q.inquiry_id,
      lines: q.lines,
    }).then(created => {
      setQuotes(prev => prev.map(x => x.id === tempId ? created : x))
    }).catch(err => console.error('Create quote failed:', err))
    return newQ
  }

  const setQuoteStatus = (id: string, status: QuoteStatus) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status } : q))
    apiSetQuoteStatus(id, status).catch(err => console.error('Set quote status failed:', err))
    const q = quotes.find(x => x.id === id)
    if (status === 'Sent' && q) {
      // Advance the linked inquiry to quotation-sent stage
      if (q.inquiry_id) {
        setInquiries(prev => prev.map(i =>
          i.id === q.inquiry_id ? { ...i, workflow_stage: 'quotation-sent' as WorkflowStage } : i
        ))
        const inqId = inquiries.find(i => i.id === q.inquiry_id)?.inq_id
        apiAdvanceWorkflow(q.inquiry_id, 'quotation-sent', inqId)
          .catch(() => console.warn('API: advance workflow to quotation-sent failed'))
      }
      flash(`Quote ${id} → Sent · Quotation shared with ${q.customer_name}`)
    }
    else if (status === 'Approved') flash(`Quote ${id} → Approved · ready to send`)
    else if (status === 'Confirmed' && q) flash(`Quote ${id} → Confirmed`)
    else flash(`Quote ${id} → ${status}`)
  }

  const recordShipmentPOD = (id: string) => {
    const s = shipments.find(x => x.id === id)
    setShipments(prev => prev.map(x =>
      x.id === id ? { ...x, status: 'Delivered', pod_received: nowStamp() } : x,
    ))
    if (s) flash(`POD recorded for ${id} · Delivery confirmation emailed to ${s.customer_name}`)
    apiRecordShipmentPOD(id).catch(err => console.error('Record POD failed:', err))
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
    apiAdvanceShipmentLeg(shipmentId, legId).catch(err => console.error('Advance shipment leg failed:', err))
  }

  const addTask = (customerName: string, taskText: string, dueDate: string, employeeId: number) => {
    const newTask: Task = {
      id: `TSK-${uuid()}`,
      customer_name: customerName,
      task: taskText,
      status: 'pending',
      due_date: dueDate,
      employee_id: employeeId,
    }
    setTasks(prev => [newTask, ...prev])
    flash(`Task added for ${customerName}`)
    apiCreateTask({
      customer_name: customerName,
      task: taskText,
      due_date: dueDate,
      employee_id: activeEmployeeId,
    }).then(created => {
      setTasks(prev => prev.map(t => t.id === newTask.id ? created : t))
    }).catch(err => console.error('Create task failed:', err))
  }

  const completeTask = (id: string) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, status: 'completed' } : t)))
    apiCompleteTask(id).catch(err => console.error('Complete task failed:', err))
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
      actor_id: 1,
      action: entry.action,
      ref_type: entry.ref_type,
      ref_id: entry.ref_id,
      customer_name: entry.customer_name,
      pushed_to: entry.pushed_to,
      notes: entry.notes,
    }).catch(err => console.error('Create activity failed:', err))
  }

  const confirmBooking = (bookingId: string, vesselName: string, voyageNumber: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId
        ? { ...b, status: 'Liner Confirmed' as const, vessel_name: vesselName, voyage_number: voyageNumber, confirmed_by: 1, confirmed_at: nowStamp() }
        : b
    ))
    apiConfirmBooking(bookingId, { vessel_name: vesselName, voyage_number: voyageNumber, confirmed_by: 1 })
      .catch(err => console.error('Confirm booking failed:', err))
    flash(`${bookingId} → Liner Confirmed`)
  }

  const releaseBooking = (bookingId: string, note: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId
        ? { ...b, status: 'Released' as const, released_by: 1, released_at: nowStamp(), notes: note || b.notes }
        : b
    ))
    apiReleaseBooking(bookingId, { note, released_by: 1 })
      .catch(err => console.error('Release booking failed:', err))
    flash(`${bookingId} → Released`)
  }

  const acknowledgeProcurement = (bookingId: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, procurement_notified: true } : b
    ))
    apiNotifyProcurement(bookingId)
      .catch(err => console.error('Notify procurement failed:', err))
    flash(`${bookingId} → Procurement acknowledged`)
  }

  const setBookingSiCutoff = (bookingId: string, date: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, si_cutoff_date: date } : b
    ))
    apiSetBookingSiCutoff(bookingId, date)
      .catch(err => console.error('Set SI cutoff failed:', err))
  }

  const markSiRequested = (bookingId: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, si_requested: true } : b
    ))
    apiMarkSiRequested(bookingId)
      .catch(err => console.error('Mark SI requested failed:', err))
  }

  const setBookingBlCutoff = (bookingId: string, date: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, bl_cutoff_date: date } : b
    ))
    apiSetBookingBlCutoff(bookingId, date)
      .catch(err => console.error('Set BL cutoff failed:', err))
  }

  const markSiSubmitted = (bookingId: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, si_submitted: true } : b
    ))
    apiMarkSiSubmitted(bookingId)
      .catch(err => console.error('Mark SI submitted failed:', err))
  }

  const markDraftBlSent = (bookingId: string) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, draft_bl_sent: true } : b
    ))
    apiMarkDraftBlSent(bookingId)
      .catch(err => console.error('Mark draft BL sent failed:', err))
  }

  const setBlStatus = (bookingId: string, status: 'pending' | 'approved' | 'changes-requested') => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, bl_status: status } : b
    ))
    apiSetBlStatus(bookingId, status)
      .catch(err => console.error('Set BL status failed:', err))
  }

  const recordMasterBl = (bookingId: string, data: { master_bl_number: string; shipper: string; consignee: string }) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, master_bl_number: data.master_bl_number, master_bl_shipper: data.shipper, master_bl_consignee: data.consignee, master_bl_recorded: true } : b
    ))
    apiRecordMasterBl(bookingId, data)
      .catch(err => console.error('Record master BL failed:', err))
  }

  const createHouseBl = (bookingId: string, data: { house_bl_number: string; shipper: string; consignee: string }) => {
    setBookings(prev => prev.map(b =>
      b.id === bookingId ? { ...b, house_bl_number: data.house_bl_number, house_bl_shipper: data.shipper, house_bl_consignee: data.consignee, house_bl_created: true } : b
    ))
    apiCreateHouseBl(bookingId, data)
      .catch(err => console.error('Create house BL failed:', err))
  }

  const createBooking = (payload: {
    customer_name: string; quote_id: string; shipping_line: string;
    container_type: string; quantity: number; origin: string; destination: string;
    is_urgent: boolean; booked_by: number; notes: string; delivery_type?: 'port-to-port' | 'door-to-door';
  }) => {
    const newId = `BKG-${uuid()}`
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
      delivery_type: payload.delivery_type,
    }
    setBookings(prev => [newBooking, ...prev])
    apiCreateBooking(payload).then(created => {
      setBookings(prev => prev.map(b => b.id === newId ? created : b))
    }).catch(err => console.error('Create booking failed:', err))
    flash(`Booking created for ${payload.customer_name}`)
    return newId
  }

  const addInquiry = (data: Omit<Inquiry, 'id' | 'created_at' | 'status' | 'completed_at' | 'followup_note' | 'inquiry_text'>): Inquiry => {
    const tempId = `INQ-${uuid()}`
    const stamp = nowStamp()
    const tempInq: Inquiry = {
      ...data,
      id: tempId,
      inquiry_text: data.request,
      status: 'pending',
      created_at: stamp,
      workflow_stage: 'rate-check',   // backend auto-creates workflow at rate_check_in_progress
      recorded_by: activeEmployeeId,
    }
    setInquiries(prev => [tempInq, ...prev])
    // Route to the correct create endpoint based on client / contact identity.
    const sharedFields = {
      origin:           data.origin,
      destination:      data.destination,
      delivery_type:    data.delivery_type,
      sbu:              data.sbu,
      priority:         data.priority,
      incoterm:         data.incoterm,
      cargo_ready_date: data.cargo_ready_date,
      preferred_rate:   data.preferred_rate,
      remark:           data.remark,
      preferred_liners: data.preferred_liners,
      containers:       data.containers,
    }
    const apiCall = (data.cli_id && data.cpid)
      // Case 3 — existing client + existing contact
      ? apiCreateInquiryOldOld({ cli_id: data.cli_id, cp_id: data.cpid, ...sharedFields })
      : data.cli_id
        // Case 2 — existing client + new contact
        ? apiCreateInquiryOldNew({
            cli_id:              data.cli_id,
            channel:             data.channel,
            contact_person:      data.contact_person,
            contact_designation: data.contact_designation,
            contact_channel_id:  data.contact_channel_id,
            ...sharedFields,
          })
        // Case 1 — new client + new contact (original path)
        : apiCreateInquiry({
            customer_name:       data.customer_name,
            request:             data.request,
            channel:             data.channel,
            employee_id:         data.employee_id,
            commodity_type:      data.commodity_type,
            container_type:      data.container_type,
            container_qty:       data.container_qty,
            cargo_weight:        data.cargo_weight,
            is_fcl:              data.is_fcl,
            contact_person:      data.contact_person,
            contact_designation: data.contact_designation,
            contact_channel_id:  data.contact_channel_id,
            ...sharedFields,
          })
    apiCall.then(created => {
      // Replace temp UUID with backend IDs; keep all optimistic fields intact
      setInquiries(prev => prev.map(i =>
        i.id === tempId
          ? {
              ...i,
              id:       String(created.inq_id),
              inq_id:   created.inq_id,
              cli_id:   created.cli_id,
              cpid:     created.cpid,
              com_ids:  created.com_ids,
              cont_ids: created.cont_ids,
            }
          : i
      ))
      // Workflow is auto-created at rate_check_in_progress by the backend inquiry endpoint.
      // No manual apiCreateWorkflowEntry call needed.
      // If this was a new client (Case 1), add them to the customers list and KYC pending queue immediately
      if (!data.cli_id && created.cli_id) {
        setCustomers(prev => {
          if (prev.some(c => c.name.toLowerCase() === data.customer_name.toLowerCase())) return prev
          return [...prev, {
            id:            String(created.cli_id),
            name:          data.customer_name,
            location:      '',
            tier:          'Regular'     as const,
            payment_terms: 'Pay Upfront' as const,
            blacklisted:   false,
            credit_hold:   false,
            min_margin_pct: 0,
            kyc_status:    'not_started' as const,
          }]
        })
        // Also add to KYC pending queue so CS's KYC tab shows this client without re-login
        setKycPendingClients(prev => {
          if (prev.some(c => c.cli_id === created.cli_id)) return prev
          return [...prev, { cli_id: created.cli_id, name: data.customer_name }]
        })
      }
    }).catch(err => console.error('Create inquiry failed:', err))
    flash(`Inquiry created for ${data.customer_name}`)  // optimistic flash
    return tempInq
  }

  const updateCustomer = (customerName: string, patch: Partial<Omit<Customer, 'id'>>) => {
    setCustomers(prev => prev.map(c =>
      c.name === customerName ? { ...c, ...patch } : c
    ))
    apiUpdateCustomer(customerName, patch)
      .catch(err => console.error('Update customer failed:', err))
  }

  const updateCustomerKyc = (customerName: string, kycStatus: 'not_started' | 'pending_customer' | 'approved') => {
    setCustomers(prev => prev.map(c =>
      c.name === customerName ? { ...c, kyc_status: kycStatus } : c
    ))
    apiUpdateCustomer(customerName, { kyc_status: kycStatus })
      .catch(err => console.error('Update customer KYC failed:', err))
  }

  const autoAdvanceForCustomer = (customerName: string, targetStage: WorkflowStage) => {
    setInquiries(prev => prev.map(inq => {
      if (inq.customer_name.toLowerCase() !== customerName.toLowerCase()) return inq
      if (inq.status === 'completed') return inq
      // Only advance inquiries that are actually in KYC stages
      const kycStages: WorkflowStage[] = ['kyc-pending', 'kyc-verification']
      if (inq.workflow_stage && kycStages.includes(inq.workflow_stage)) {
        apiAdvanceWorkflow(inq.id, targetStage, inq.inq_id).catch(err => console.error('Auto-advance workflow failed:', err))
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
            onUpdateCustomer={updateCustomer}
            onAddFollowup={addFollowup}
            onFlash={flash}
            onPatchInquiry={handlePatchInquiry}
            onDeleteInquiry={handleDeleteInquiry}
          />
        )
      case 'rate-list':
        return <RateList />
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
        return <Customers inquiries={inquiries} customers={customers} onUpdateCustomer={updateCustomer} onFlash={flash} />
      case 'kyc':
        return <KYCForm customers={customers} onFlash={flash} />
      case 'workspace':
        return (
          <Workspace
            inquiries={inquiries}
            bookings={bookings}
            quotes={quotes}
            customers={customers}
            clientList={clientList}
            activityLog={activityLog}
            onGoTo={navigateTo}
            onAdvanceWorkflow={advanceWorkflow}
            onConfirmBooking={confirmBooking}
            onReleaseBooking={releaseBooking}
            onAcknowledgeProcurement={acknowledgeProcurement}
            onCreateBooking={createBooking}
            onSetBookingSiCutoff={setBookingSiCutoff}
            onMarkSiRequested={markSiRequested}
            onSetBookingBlCutoff={setBookingBlCutoff}
            onMarkSiSubmitted={markSiSubmitted}
            onMarkDraftBlSent={markDraftBlSent}
            onSetBlStatus={setBlStatus}
            onRecordMasterBl={recordMasterBl}
            onCreateHouseBl={createHouseBl}
            onSetQuoteStatus={setQuoteStatus}
            onUpdateCustomerKyc={updateCustomerKyc}
            onAutoAdvanceForCustomer={autoAdvanceForCustomer}
            onLogActivity={logActivity}
            onFlash={flash}
            onStartRateCheck={startRateCheck}
            kycPendingClients={kycPendingClients}
            onSetKycPendingClients={setKycPendingClients}
            kycRequests={kycRequests}
            onSetKycRequests={setKycRequests}
            onRefreshKycRequests={() =>
              apiGetKycRequests().then(setKycRequests).catch(() => {})
            }
            initialStep={workspaceInitialStep ?? undefined}
          />
        )
      case 'new-inquiry':
        return (
          <NewInquiry
            clientList={clientList}
            contactPersonList={contactPersonList}
            activeEmployee={activeEmployee}
            onCreateInquiry={addInquiry}
            onFlash={flash}
            onGoBack={() => navigateTo('workspace')}
          />
        )
      case 'record-rate':
        return (
          <RecordRate
            onFlash={flash}
            onGoBack={() => navigateTo('workspace')}
          />
        )
      case 'rate-check':
        return rateCheckContext ? (
          <RateCheck
            inquiry={rateCheckContext.inquiry}
            container={rateCheckContext.container}
            customers={customers}
            variant={rateCheckContext.variant}
            onAdvanceWorkflow={advanceWorkflow}
            onLogActivity={logActivity}
            onFlash={flash}
            onGoBack={() => { setRateCheckContext(null); navigateTo('workspace') }}
            onGoToQuotations={() => {
              const variant = rateCheckContext?.variant
              setRateCheckContext(null)
              // After rate-check, always go to Workspace.
              // For Sales/CS doing their own check, jump straight to the Prepare Quotation step.
              if (variant !== 'procurement') {
                setWorkspaceInitialStep('sales-prep-quote')
              }
              navigateTo('workspace')
            }}
          />
        ) : null
      case 'profile':
        return <Profile onLogout={handleLogout} />
    }
  }

  if (initState === 'loading') {
    return (
      <div className="db-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: '#94a3b8', fontSize: 14 }}>Connecting to backend...</span>
      </div>
    )
  }

  if (initState === 'error') {
    return (
      <div className="db-app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 12 }}>
        <span style={{ color: '#dc2626', fontSize: 15, fontWeight: 600 }}>Unable to connect to the backend</span>
        <span style={{ color: '#94a3b8', fontSize: 13 }}>Please ensure the API server is running and refresh the page.</span>
        <button
          style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: '#2c2c82', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
          onClick={() => setInitState('ready')}
        >
          Retry
        </button>
      </div>
    )
  }

  const roleCtx: RoleContextValue = {
    activeEmployee,
    activeRole,
    hasPermission: (action) => ROLE_ACTIONS[activeRole].includes(action),
    canAccessPage,
  }

  if (!loggedInEmployeeId) {
    return <Login onLogin={handleLogin} />
  }

  return (
    <RoleContext.Provider value={roleCtx}>
      <div className="db-app">
        <TopBar
          currentPageLabel={PAGE_LABELS[currentPage]}
          activeEmployee={activeEmployee}
          activeRole={activeRole}
          onNavigateProfile={() => setCurrentPage('profile')}
        />

        <div className="db-body">
          <Sidebar current={currentPage} onNav={navigateTo} activeRole={activeRole} />
          <main className={`db-main ${currentPage === 'workspace' ? 'db-main-flush' : ''}`}>
            {renderPage()}
          </main>
        </div>

        {toast && (
          <div className="lt-toast">
            {toast.message}
            {toast.action && (
              <button
                className="lt-toast-action"
                onClick={() => { toast.action!.onClick(); setToast(null) }}
              >
                {toast.action.label} &rarr;
              </button>
            )}
          </div>
        )}
      </div>
    </RoleContext.Provider>
  )
}
