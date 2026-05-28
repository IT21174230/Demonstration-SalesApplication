import { useEffect, useRef, useState } from 'react'
import {
  Send, Sparkles, User as UserIcon, Wifi, WifiOff,
  UserPlus, PackagePlus, MessageSquarePlus, ListPlus,
  FileSpreadsheet, Search, X, ChevronRight, Lock,
  ShieldAlert, CreditCard, ArrowUpDown, Zap,
  Anchor, Ship, PackageCheck,
} from 'lucide-react'
import { usePersistentState } from '../../hooks'
import {
  nowStamp, SBUS, ROLE_QUICK_COMMANDS, ROLE_LABELS, ROLE_COLORS,
  type Inquiry, type Customer, type SBU, type CustomerTier, type PaymentTerms, type DeliveryType,
} from '../../mockData'
import { useRole } from '../../RoleContext'
import { useWebSocket } from '../../useWebSocket'

/* ------------------------------------------------------------------ */
/*  Quick-command definitions                                          */
/* ------------------------------------------------------------------ */
interface QuickCommand {
  id: string
  label: string
  icon: React.ReactNode
  color: string
  description: string
}

const QUICK_COMMANDS: QuickCommand[] = [
  { id: 'new-customer',   label: '/new customer',     icon: <UserPlus size={14} />,         color: '#4f46e5', description: 'Register a new customer' },
  { id: 'new-inquiry',    label: '/new inquiry',      icon: <PackagePlus size={14} />,      color: '#0891b2', description: 'Log a shipping inquiry' },
  { id: 'follow-up',      label: '/follow up',        icon: <MessageSquarePlus size={14} />,color: '#16a34a', description: 'Log a follow-up note' },
  { id: 'new-task',       label: '/new task',         icon: <ListPlus size={14} />,         color: '#d97706', description: 'Create a task or reminder' },
  { id: 'quote',          label: '/quote',            icon: <FileSpreadsheet size={14} />,  color: '#7c3aed', description: 'Request a quotation' },
  { id: 'lookup',         label: '/lookup',           icon: <Search size={14} />,           color: '#64748b', description: 'Look up customer or inquiry' },
  { id: 'blacklist',      label: '/blacklist',        icon: <ShieldAlert size={14} />,      color: '#dc2626', description: 'Toggle customer blacklist' },
  { id: 'credit-hold',    label: '/credit hold',      icon: <CreditCard size={14} />,       color: '#ea580c', description: 'Toggle credit hold' },
  { id: 'change-tier',    label: '/change tier',      icon: <ArrowUpDown size={14} />,      color: '#0d9488', description: 'Update customer tier' },
  { id: 'complete',       label: '/complete',         icon: <Zap size={14} />,              color: '#15803d', description: 'Mark inquiry complete' },
  { id: 'new-booking',    label: '/new booking',      icon: <Anchor size={14} />,           color: '#0d9488', description: 'Create booking from confirmed quote' },
  { id: 'confirm-booking',label: '/confirm booking',  icon: <Ship size={14} />,             color: '#d97706', description: 'Confirm liner space (Procurement)' },
  { id: 'release-booking',label: '/release booking',  icon: <PackageCheck size={14} />,     color: '#16a34a', description: 'Release container to customer' },
]

/* ------------------------------------------------------------------ */
/*  Form state types                                                   */
/* ------------------------------------------------------------------ */
interface NewCustomerForm { name: string; location: string; tier: CustomerTier; payment: PaymentTerms }
interface NewInquiryForm  { customer: string; request: string; origin: string; destination: string; channel: 'WhatsApp' | 'Email' | 'Phone'; sbu: SBU; deliveryType: DeliveryType }
interface FollowUpForm    { customer: string; note: string; markComplete: boolean }
interface NewTaskForm     { customer: string; task: string; dueDate: string }
interface QuoteForm       { customer: string }
interface LookupForm      { query: string }
interface BlacklistForm   { customer: string; action: 'add' | 'remove' }
interface CreditHoldForm  { customer: string; action: 'add' | 'remove' }
interface ChangeTierForm  { customer: string; tier: CustomerTier }
interface CompleteForm    { customer: string; note: string }
interface NewBookingForm     { customer: string; quoteId: string; shippingLine: string; containerType: string; quantity: string; isUrgent: boolean }
interface ConfirmBookingForm { bookingId: string; vesselName: string; voyageNumber: string }
interface ReleaseBookingForm { bookingId: string; note: string }

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
interface ChatAssistantProps {
  inquiries: Inquiry[]
  customers: Customer[]
  onRefreshData?: () => void
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  ts: string
  variant?: 'danger' | 'warning'
}

export default function ChatAssistant({
  customers,
  onRefreshData,
}: ChatAssistantProps) {
  const { activeEmployee, activeRole } = useRole()
  const allowedCommands = ROLE_QUICK_COMMANDS[activeRole]
  const roleColor = ROLE_COLORS[activeRole]

  const [messages, setMessages] = usePersistentState<ChatMessage[]>('chat-messages', [{
    id: 'sys-1',
    role: 'assistant',
    ts: nowStamp(),
    content:
      "Hi — I'm an AI assistant for ABC Logistics. I can help you look up customers, inquiries, quotations, rates, and shipments. " +
      "I can also create records, update statuses, and help manage your sales workflow.\n\nAsk me anything, or use the quick commands on the right!",
  }])
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { connected: aiConnected, waiting: aiWaiting, sendMessage: aiSend } = useWebSocket()

  // Active quick-command form
  const [activeCmd, setActiveCmd] = useState<string | null>(null)

  // Form states
  const [custForm, setCustForm]           = useState<NewCustomerForm>({ name: '', location: '', tier: 'Regular', payment: 'Pay Upfront' })
  const [inqForm, setInqForm]             = useState<NewInquiryForm>({ customer: '', request: '', origin: '', destination: '', channel: 'Email', sbu: 'Ocean Exports', deliveryType: 'port-to-port' })
  const [fuForm, setFuForm]               = useState<FollowUpForm>({ customer: '', note: '', markComplete: false })
  const [taskForm, setTaskForm]           = useState<NewTaskForm>({ customer: '', task: '', dueDate: '' })
  const [quoteForm, setQuoteForm]         = useState<QuoteForm>({ customer: '' })
  const [lookupForm, setLookupForm]       = useState<LookupForm>({ query: '' })
  const [blForm, setBlForm]               = useState<BlacklistForm>({ customer: '', action: 'add' })
  const [chForm, setChForm]               = useState<CreditHoldForm>({ customer: '', action: 'add' })
  const [tierForm, setTierForm]           = useState<ChangeTierForm>({ customer: '', tier: 'Regular' })
  const [completeForm, setCompleteForm]   = useState<CompleteForm>({ customer: '', note: '' })
  const [bookingForm, setBookingForm]     = useState<NewBookingForm>({ customer: '', quoteId: '', shippingLine: '', containerType: "20'GP", quantity: '1', isUrgent: false })
  const [confirmBkgForm, setConfirmBkgForm] = useState<ConfirmBookingForm>({ bookingId: '', vesselName: '', voyageNumber: '' })
  const [releaseBkgForm, setReleaseBkgForm] = useState<ReleaseBookingForm>({ bookingId: '', note: '' })

  const customerNames = customers.map(c => c.name)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const pushUser = (content: string) => {
    setMessages(prev => [...prev, {
      id: `m-${prev.length}-${Date.now()}`,
      role: 'user',
      content,
      ts: nowStamp(),
    }])
  }

  // ------- Send handler — all messages go through WebSocket -------
  const send = (text?: string) => {
    const message = (text ?? draft).trim()
    if (!message) return
    pushUser(message)
    setDraft('')

    if (!aiConnected) {
      setMessages(prev => [...prev, {
        id: `m-err-${Date.now()}`,
        role: 'assistant',
        content: 'AI assistant is offline. Please make sure the backend server is running.',
        ts: nowStamp(),
        variant: 'danger',
      }])
      return
    }

    // Show "Thinking..." then replace with AI response
    const thinkingId = `m-thinking-${Date.now()}`
    setMessages(prev => [...prev, {
      id: thinkingId,
      role: 'assistant',
      content: 'Thinking...',
      ts: nowStamp(),
    }])

    // Prepend role context so the AI knows who is acting
    const rolePrefix = `[ROLE: ${ROLE_LABELS[activeRole]} | User: ${activeEmployee.name}] `
    aiSend(rolePrefix + message)
      .then(aiResponse => {
        setMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, content: aiResponse, ts: nowStamp() }
            : m,
        ))
        // AI tools may have mutated data — re-sync dashboard
        onRefreshData?.()
      })
      .catch(() => {
        setMessages(prev => prev.map(m =>
          m.id === thinkingId
            ? { ...m, content: "The AI assistant didn't respond. Please try again.", variant: 'danger' as const }
            : m,
        ))
      })
  }

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  // ------- Quick-command form handlers -------
  const openCommand = (id: string) => {
    setActiveCmd(id)
    // Reset forms when opening
    setCustForm({ name: '', location: '', tier: 'Regular', payment: 'Pay Upfront' })
    setInqForm({ customer: '', request: '', origin: '', destination: '', channel: 'Email', sbu: 'Ocean Exports', deliveryType: 'port-to-port' })
    setFuForm({ customer: '', note: '', markComplete: false })
    setTaskForm({ customer: '', task: '', dueDate: '' })
    setQuoteForm({ customer: '' })
    setLookupForm({ query: '' })
    setBlForm({ customer: '', action: 'add' })
    setChForm({ customer: '', action: 'add' })
    setTierForm({ customer: '', tier: 'Regular' })
    setCompleteForm({ customer: '', note: '' })
    setBookingForm({ customer: '', quoteId: '', shippingLine: '', containerType: "20'GP", quantity: '1', isUrgent: false })
    setConfirmBkgForm({ bookingId: '', vesselName: '', voyageNumber: '' })
    setReleaseBkgForm({ bookingId: '', note: '' })
  }

  const closeCommand = () => setActiveCmd(null)

  const submitForm = () => {
    let message = ''
    switch (activeCmd) {
      case 'new-customer':
        if (!custForm.name.trim()) return
        message = `[CMD /new customer] name=${custForm.name} | location=${custForm.location || 'Colombo, Sri Lanka'} | tier=${custForm.tier} | payment_terms=${custForm.payment}`
        break
      case 'new-inquiry':
        if (!inqForm.customer.trim() || !inqForm.request.trim()) return
        message = `[CMD /new inquiry] customer=${inqForm.customer} | request=${inqForm.request} | origin=${inqForm.origin || 'TBD'} | destination=${inqForm.destination || 'TBD'} | channel=${inqForm.channel} | sbu=${inqForm.sbu} | delivery_type=${inqForm.deliveryType}`
        break
      case 'follow-up':
        if (!fuForm.customer.trim() || !fuForm.note.trim()) return
        message = `[CMD /follow up] customer=${fuForm.customer} | note=${fuForm.note} | mark_complete=${fuForm.markComplete}`
        break
      case 'new-task':
        if (!taskForm.task.trim()) return
        message = `[CMD /new task] customer=${taskForm.customer || ''} | task=${taskForm.task} | due_date=${taskForm.dueDate || ''}`
        break
      case 'quote':
        if (!quoteForm.customer.trim()) return
        message = `[CMD /quote] customer=${quoteForm.customer}`
        break
      case 'lookup':
        if (!lookupForm.query.trim()) return
        message = `[CMD /lookup] query=${lookupForm.query}`
        break
      case 'blacklist':
        if (!blForm.customer.trim()) return
        message = `[CMD /blacklist] customer=${blForm.customer} | action=${blForm.action}`
        break
      case 'credit-hold':
        if (!chForm.customer.trim()) return
        message = `[CMD /credit hold] customer=${chForm.customer} | action=${chForm.action}`
        break
      case 'change-tier':
        if (!tierForm.customer.trim()) return
        message = `[CMD /change tier] customer=${tierForm.customer} | tier=${tierForm.tier}`
        break
      case 'complete':
        if (!completeForm.customer.trim()) return
        message = `[CMD /complete] customer=${completeForm.customer} | note=${completeForm.note || ''}`
        break
      case 'new-booking':
        if (!bookingForm.customer.trim() || !bookingForm.quoteId.trim()) return
        message = `[CMD /new booking] customer=${bookingForm.customer} | quote_id=${bookingForm.quoteId} | shipping_line=${bookingForm.shippingLine || ''} | container_type=${bookingForm.containerType || "20'GP"} | quantity=${bookingForm.quantity || '1'} | is_urgent=${bookingForm.isUrgent}`
        break
      case 'confirm-booking':
        if (!confirmBkgForm.bookingId.trim()) return
        message = `[CMD /confirm booking] booking_id=${confirmBkgForm.bookingId} | vessel_name=${confirmBkgForm.vesselName || ''} | voyage_number=${confirmBkgForm.voyageNumber || ''}`
        break
      case 'release-booking':
        if (!releaseBkgForm.bookingId.trim()) return
        message = `[CMD /release booking] booking_id=${releaseBkgForm.bookingId} | note=${releaseBkgForm.note || ''}`
        break
      default:
        return
    }
    send(message)
    closeCommand()
  }

  // ------- Render active form -------
  const renderForm = () => {
    if (!activeCmd) return null
    const cmd = QUICK_COMMANDS.find(c => c.id === activeCmd)
    if (!cmd) return null

    return (
      <div className="qc-form-overlay">
        <div className="qc-form-header">
          <div className="qc-form-header-left">
            <span className="qc-form-icon" style={{ color: cmd.color, background: cmd.color + '12' }}>{cmd.icon}</span>
            <span className="qc-form-title">{cmd.label}</span>
          </div>
          <button className="qc-form-close" onClick={closeCommand}><X size={14} /></button>
        </div>
        <div className="qc-form-body">
          {activeCmd === 'new-customer' && (
            <>
              <FormField label="Customer Name" required>
                <input className="qc-input" placeholder="e.g. Lanka Exports" value={custForm.name} onChange={e => setCustForm(p => ({ ...p, name: e.target.value }))} autoFocus />
              </FormField>
              <FormField label="Location">
                <input className="qc-input" placeholder="e.g. Colombo, Sri Lanka" value={custForm.location} onChange={e => setCustForm(p => ({ ...p, location: e.target.value }))} />
              </FormField>
              <div className="qc-form-row">
                <FormField label="Tier">
                  <select className="qc-select" value={custForm.tier} onChange={e => setCustForm(p => ({ ...p, tier: e.target.value as CustomerTier }))}>
                    <option>Key Account</option><option>Regular</option><option>Walk-in</option>
                  </select>
                </FormField>
                <FormField label="Payment Terms">
                  <select className="qc-select" value={custForm.payment} onChange={e => setCustForm(p => ({ ...p, payment: e.target.value as PaymentTerms }))}>
                    <option>Pay Upfront</option><option>30-Day Credit</option><option>60-Day Credit</option>
                  </select>
                </FormField>
              </div>
            </>
          )}
          {activeCmd === 'new-inquiry' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list" placeholder="Select or type customer name" value={inqForm.customer} onChange={e => setInqForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Request Details" required>
                <input className="qc-input" placeholder="e.g. 12 reefer containers" value={inqForm.request} onChange={e => setInqForm(p => ({ ...p, request: e.target.value }))} />
              </FormField>
              <div className="qc-form-row">
                <FormField label="Origin">
                  <input className="qc-input" placeholder="e.g. Colombo" value={inqForm.origin} onChange={e => setInqForm(p => ({ ...p, origin: e.target.value }))} />
                </FormField>
                <FormField label="Destination">
                  <input className="qc-input" placeholder="e.g. Hamburg" value={inqForm.destination} onChange={e => setInqForm(p => ({ ...p, destination: e.target.value }))} />
                </FormField>
              </div>
              <div className="qc-form-row">
                <FormField label="Channel">
                  <select className="qc-select" value={inqForm.channel} onChange={e => setInqForm(p => ({ ...p, channel: e.target.value as 'WhatsApp' | 'Email' | 'Phone' }))}>
                    <option>Email</option><option>WhatsApp</option><option>Phone</option>
                  </select>
                </FormField>
                <FormField label="SBU">
                  <select className="qc-select" value={inqForm.sbu} onChange={e => setInqForm(p => ({ ...p, sbu: e.target.value as SBU }))}>
                    {SBUS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </FormField>
              </div>
              <FormField label="Delivery Type">
                <select className="qc-select" value={inqForm.deliveryType} onChange={e => setInqForm(p => ({ ...p, deliveryType: e.target.value as DeliveryType }))}>
                  <option value="port-to-port">Port-to-Port</option>
                  <option value="door-to-door">Door-to-Door</option>
                </select>
              </FormField>
            </>
          )}
          {activeCmd === 'follow-up' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list2" placeholder="Select or type customer name" value={fuForm.customer} onChange={e => setFuForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list2">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Follow-up Note" required>
                <textarea className="qc-textarea" placeholder="e.g. Called, awaiting SI submission." value={fuForm.note} onChange={e => setFuForm(p => ({ ...p, note: e.target.value }))} rows={3} />
              </FormField>
              <label className="qc-checkbox-label">
                <input type="checkbox" checked={fuForm.markComplete} onChange={e => setFuForm(p => ({ ...p, markComplete: e.target.checked }))} />
                <span>Mark inquiry as complete</span>
              </label>
            </>
          )}
          {activeCmd === 'new-task' && (
            <>
              <FormField label="Customer">
                <input className="qc-input" list="qc-cust-list3" placeholder="Select or type customer name" value={taskForm.customer} onChange={e => setTaskForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list3">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Task Description" required>
                <input className="qc-input" placeholder="e.g. Send quotation" value={taskForm.task} onChange={e => setTaskForm(p => ({ ...p, task: e.target.value }))} />
              </FormField>
              <FormField label="Due Date">
                <input className="qc-input" type="date" value={taskForm.dueDate} onChange={e => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} />
              </FormField>
            </>
          )}
          {activeCmd === 'quote' && (
            <FormField label="Customer" required>
              <input className="qc-input" list="qc-cust-list4" placeholder="Select or type customer name" value={quoteForm.customer} onChange={e => setQuoteForm({ customer: e.target.value })} autoFocus />
              <datalist id="qc-cust-list4">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
            </FormField>
          )}
          {activeCmd === 'lookup' && (
            <FormField label="Search Query" required>
              <input className="qc-input" placeholder="e.g. Hayleys Logistics, INQ-1041, shipments" value={lookupForm.query} onChange={e => setLookupForm({ query: e.target.value })} autoFocus />
            </FormField>
          )}
          {activeCmd === 'blacklist' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list5" placeholder="Select or type customer name" value={blForm.customer} onChange={e => setBlForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list5">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Action">
                <select className="qc-select" value={blForm.action} onChange={e => setBlForm(p => ({ ...p, action: e.target.value as 'add' | 'remove' }))}>
                  <option value="add">Add to Blacklist</option>
                  <option value="remove">Remove from Blacklist</option>
                </select>
              </FormField>
            </>
          )}
          {activeCmd === 'credit-hold' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list6" placeholder="Select or type customer name" value={chForm.customer} onChange={e => setChForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list6">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Action">
                <select className="qc-select" value={chForm.action} onChange={e => setChForm(p => ({ ...p, action: e.target.value as 'add' | 'remove' }))}>
                  <option value="add">Put on Credit Hold</option>
                  <option value="remove">Clear Credit Hold</option>
                </select>
              </FormField>
            </>
          )}
          {activeCmd === 'change-tier' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list7" placeholder="Select or type customer name" value={tierForm.customer} onChange={e => setTierForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list7">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="New Tier">
                <select className="qc-select" value={tierForm.tier} onChange={e => setTierForm(p => ({ ...p, tier: e.target.value as CustomerTier }))}>
                  <option>Key Account</option><option>Regular</option><option>Walk-in</option>
                </select>
              </FormField>
            </>
          )}
          {activeCmd === 'complete' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list8" placeholder="Select or type customer name" value={completeForm.customer} onChange={e => setCompleteForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list8">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Note (optional)">
                <input className="qc-input" placeholder="e.g. Booking confirmed" value={completeForm.note} onChange={e => setCompleteForm(p => ({ ...p, note: e.target.value }))} />
              </FormField>
            </>
          )}
          {activeCmd === 'new-booking' && (
            <>
              <FormField label="Customer" required>
                <input className="qc-input" list="qc-cust-list9" placeholder="Select or type customer name" value={bookingForm.customer} onChange={e => setBookingForm(p => ({ ...p, customer: e.target.value }))} autoFocus />
                <datalist id="qc-cust-list9">{customerNames.map(n => <option key={n} value={n} />)}</datalist>
              </FormField>
              <FormField label="Quote ID" required>
                <input className="qc-input" placeholder="e.g. QUO-501" value={bookingForm.quoteId} onChange={e => setBookingForm(p => ({ ...p, quoteId: e.target.value }))} />
              </FormField>
              <FormField label="Shipping Line">
                <input className="qc-input" placeholder="e.g. Maersk, Hapag-Lloyd" value={bookingForm.shippingLine} onChange={e => setBookingForm(p => ({ ...p, shippingLine: e.target.value }))} />
              </FormField>
              <div className="qc-form-row">
                <FormField label="Container Type">
                  <input className="qc-input" placeholder="e.g. 20'GP, 40'HC" value={bookingForm.containerType} onChange={e => setBookingForm(p => ({ ...p, containerType: e.target.value }))} />
                </FormField>
                <FormField label="Quantity">
                  <input className="qc-input" type="number" min="1" value={bookingForm.quantity} onChange={e => setBookingForm(p => ({ ...p, quantity: e.target.value }))} />
                </FormField>
              </div>
              <label className="qc-checkbox-label">
                <input type="checkbox" checked={bookingForm.isUrgent} onChange={e => setBookingForm(p => ({ ...p, isUrgent: e.target.checked }))} />
                <span>Urgent — book directly with liner (skip Procurement)</span>
              </label>
            </>
          )}
          {activeCmd === 'confirm-booking' && (
            <>
              <FormField label="Booking ID" required>
                <input className="qc-input" placeholder="e.g. BKG-901" value={confirmBkgForm.bookingId} onChange={e => setConfirmBkgForm(p => ({ ...p, bookingId: e.target.value }))} autoFocus />
              </FormField>
              <FormField label="Vessel Name">
                <input className="qc-input" placeholder="e.g. Ever Given" value={confirmBkgForm.vesselName} onChange={e => setConfirmBkgForm(p => ({ ...p, vesselName: e.target.value }))} />
              </FormField>
              <FormField label="Voyage Number">
                <input className="qc-input" placeholder="e.g. VOY-2026-042" value={confirmBkgForm.voyageNumber} onChange={e => setConfirmBkgForm(p => ({ ...p, voyageNumber: e.target.value }))} />
              </FormField>
            </>
          )}
          {activeCmd === 'release-booking' && (
            <>
              <FormField label="Booking ID" required>
                <input className="qc-input" placeholder="e.g. BKG-901" value={releaseBkgForm.bookingId} onChange={e => setReleaseBkgForm(p => ({ ...p, bookingId: e.target.value }))} autoFocus />
              </FormField>
              <FormField label="Instructions / Note">
                <textarea className="qc-textarea" placeholder="e.g. Container available at depot, collect by May 20" value={releaseBkgForm.note} onChange={e => setReleaseBkgForm(p => ({ ...p, note: e.target.value }))} rows={3} />
              </FormField>
            </>
          )}
        </div>
        <div className="qc-form-footer">
          <button className="db-btn secondary" onClick={closeCommand}>Cancel</button>
          <button className="db-btn primary" onClick={submitForm} disabled={aiWaiting}>
            <Send size={12} /> Send to AI
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="db-page-anim ca-wrap">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Command Center</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              AI-powered assistant — ask questions, look up data, create records, and manage your sales workflow.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }} title={aiConnected ? 'AI assistant connected' : 'AI assistant offline'}>
              {aiConnected
                ? <Wifi size={13} style={{ color: '#16a34a' }} />
                : <WifiOff size={13} style={{ color: '#94a3b8' }} />}
              <span style={{ fontSize: 11, color: aiConnected ? '#16a34a' : '#94a3b8' }}>
                {aiWaiting ? 'AI thinking...' : aiConnected ? 'AI online' : 'AI offline'}
              </span>
            </div>
            <span
              className="db-topbar-role-pill"
              style={{ background: roleColor + '12', color: roleColor, border: `1px solid ${roleColor}30` }}
            >
              {activeEmployee.name} — {ROLE_LABELS[activeRole]}
            </span>
          </div>
        </div>
      </div>

      <div className="ca-layout">
        {/* ---- Chat column ---- */}
        <div className="ca-shell">
          <div ref={scrollRef} className="ca-scroll">
            {messages.map(m => (
              <ChatBubble key={m.id} message={m} />
            ))}
          </div>

          {/* Active form overlay above the input */}
          {renderForm()}

          <div className="ca-input-row">
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask a question or give an instruction — or use a quick command on the right. Enter to send."
              rows={2}
              className="ca-textarea"
            />
            <button
              className="db-btn primary ca-send-btn"
              onClick={() => send()}
              disabled={!draft.trim() || aiWaiting}
              style={{ opacity: draft.trim() && !aiWaiting ? 1 : 0.5, cursor: draft.trim() && !aiWaiting ? 'pointer' : 'not-allowed' }}
            >
              <Send size={12} /> {aiWaiting ? 'Waiting...' : 'Send'}
            </button>
          </div>
        </div>

        {/* ---- Quick Commands sidebar ---- */}
        <div className="qc-sidebar">
          <div className="qc-sidebar-header">
            <ChevronRight size={13} />
            <span>Quick Commands</span>
          </div>
          <div className="qc-sidebar-list">
            {QUICK_COMMANDS.map(cmd => {
              const allowed = allowedCommands.includes(cmd.id)
              return (
                <button
                  key={cmd.id}
                  className={`qc-cmd-btn${activeCmd === cmd.id ? ' active' : ''}${!allowed ? ' restricted' : ''}`}
                  onClick={() => allowed && openCommand(cmd.id)}
                  title={allowed ? cmd.description : `Restricted — requires different role`}
                  disabled={!allowed}
                  style={{ opacity: allowed ? 1 : 0.35 }}
                >
                  <span className="qc-cmd-icon" style={{ color: cmd.color }}>{cmd.icon}</span>
                  <span className="qc-cmd-label">{cmd.label}</span>
                  {!allowed && <Lock size={9} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
                </button>
              )
            })}
          </div>
          <div className="qc-sidebar-hint">
            Click a command to open a structured form. The AI will process your input.
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Shared sub-components                                              */
/* ------------------------------------------------------------------ */
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="qc-field">
      <label className="qc-field-label">
        {label}{required && <span className="qc-required">*</span>}
      </label>
      {children}
    </div>
  )
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const variantClass = message.variant ? ` ${message.variant}` : ''
  return (
    <div className={`ca-row ${isUser ? 'me' : 'bot'}`}>
      <div className={`ca-avatar ${isUser ? 'me' : 'bot'}`}>
        {isUser ? <UserIcon size={13} /> : <Sparkles size={13} />}
      </div>
      <div className="ca-bubble-col">
        <div className="ca-bubble-meta">
          <span className="ca-bubble-name">{isUser ? 'You' : 'AI Assistant'}</span>
          <span className="ca-bubble-ts">{message.ts}</span>
        </div>
        <div className={`ca-bubble ${isUser ? 'me' : 'bot'}${variantClass}`}>
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        </div>
      </div>
    </div>
  )
}
