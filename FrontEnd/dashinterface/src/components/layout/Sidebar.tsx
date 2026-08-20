import { useState } from 'react'
import {
  LayoutDashboard, MessageSquare, ListChecks, ClipboardList,
  Users, FileText, Ship, LogOut, ShieldCheck, HelpCircle, X,
  UserPlus, PackagePlus, MessageSquarePlus,
  ListPlus, FileSpreadsheet, Search, ShieldAlert, CreditCard,
  ArrowUpDown, Zap, Lock, Anchor, PackageCheck, AlertTriangle, Inbox, DollarSign,
} from 'lucide-react'
import {
  ROLE_PAGE_ACCESS, ROLE_QUICK_COMMANDS, ROLE_ACTIONS, ROLE_COLORS,
  type PageId, type UserRole,
} from '../../types'

interface SidebarProps {
  current: PageId
  onNav: (page: PageId) => void
  activeRole: UserRole
}

const NAV_ITEMS: { id: PageId; label: string; icon: typeof MessageSquare }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Command Center', icon: MessageSquare },
  { id: 'workspace', label: 'Workspace', icon: Inbox },
  { id: 'inquiry-list', label: 'Inquiry List', icon: ListChecks },
  { id: 'rate-list', label: 'Rate List', icon: DollarSign },
  { id: 'booking-list', label: 'Booking List', icon: PackageCheck },
  { id: 'quotations', label: 'Quotations', icon: FileText },
  { id: 'shipments', label: 'Shipments', icon: Ship },
  { id: 'followups', label: 'Operations', icon: ClipboardList },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'kyc', label: 'KYC Form', icon: ShieldCheck },
]

const ROLE_NAV_VISIBLE: Partial<Record<UserRole, PageId[]>> = {
  CS: ['workspace', 'inquiry-list', 'rate-list', 'booking-list', 'customers'],
  Sales: ['workspace', 'inquiry-list', 'rate-list', 'customers'],
  Procurement: ['workspace', 'inquiry-list', 'rate-list', 'booking-list'],
  Finance: ['workspace'],
}

export default function Sidebar({ current, onNav, activeRole }: SidebarProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const accessiblePages = ROLE_PAGE_ACCESS[activeRole]
  const visibleNavItems = ROLE_NAV_VISIBLE[activeRole]
    ? NAV_ITEMS.filter(item => ROLE_NAV_VISIBLE[activeRole]!.includes(item.id))
    : NAV_ITEMS

  return (
    <>
      <nav className="db-sidebar">
        <div className="db-sidebar-section">Menu</div>

        {visibleNavItems.map(item => {
          const Icon = item.icon
          const accessible = accessiblePages.includes(item.id)
          return (
            <div
              key={item.id}
              className={`db-nav-item ${current === item.id ? 'active' : ''} ${!accessible ? 'disabled' : ''}`}
              onClick={() => accessible && onNav(item.id)}
              title={accessible ? item.label : `Restricted — requires different role`}
              style={{ opacity: accessible ? 1 : 0.35, cursor: accessible ? 'pointer' : 'not-allowed' }}
            >
              <span className="db-nav-item-icon"><Icon size={15} /></span>
              {item.label}
              {!accessible && <Lock size={10} style={{ marginLeft: 'auto', opacity: 0.6 }} />}
            </div>
          )
        })}

        <div className="db-sidebar-footer">
          <div className="db-nav-item" onClick={() => setHelpOpen(true)}>
            <span className="db-nav-item-icon"><HelpCircle size={15} /></span>
            Help &amp; Guide
          </div>
          <div className="db-nav-item">
            <span className="db-nav-item-icon"><LogOut size={15} /></span>
            Sign Out
          </div>
        </div>
      </nav>

      {/* ---- Help Panel Overlay ---- */}
      {helpOpen && (
        <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
          <div className="help-panel" onClick={e => e.stopPropagation()}>
            <div className="help-header">
              <h2 className="help-title">Help &amp; Guide</h2>
              <button className="qc-form-close" onClick={() => setHelpOpen(false)}><X size={14} /></button>
            </div>

            <div className="help-scroll">

              {/* ===================== SECTION 1 ===================== */}
              <section className="help-section">
                <h3 className="help-section-title">Navigation Menu</h3>
                <p className="help-intro">Each page in the sidebar serves a specific purpose in your sales workflow.</p>

                <div className="help-item-list">
                  <HelpNavItem icon={<LayoutDashboard size={14} />} title="Dashboard" color="#0f8fa8">
                    High-level overview of your sales performance — KPIs, pipeline stages, conversion funnel, and top-performing accounts. Use it for a quick morning check or when reporting to management.
                  </HelpNavItem>
                  <HelpNavItem icon={<MessageSquare size={14} />} title="Command Center" color="#7c3aed">
                    AI-powered chat assistant. Ask questions in plain English, or use the <strong>Quick Commands</strong> panel on the right to fill structured forms. The AI can create customers, log inquiries, build quotes, and manage your entire workflow.
                  </HelpNavItem>
                  <HelpNavItem icon={<ListChecks size={14} />} title="Inquiry List" color="#0891b2">
                    All shipping inquiries in one place. Filter by status (pending/completed), SBU, or employee. Click any inquiry to see details, add follow-ups, or mark it complete.
                  </HelpNavItem>
                  <HelpNavItem icon={<FileText size={14} />} title="Quotations" color="#7c3aed">
                    Manage freight quotations. View draft, pending approval, sent, and confirmed quotes. Each quote shows shipping lines, rates, transit times, and margin calculations.
                  </HelpNavItem>
                  <HelpNavItem icon={<Ship size={14} />} title="Shipments" color="#0d9488">
                    Track booked shipments from origin to destination. Monitor leg-by-leg status (departed, in transit, at transshipment, delivered) and record proof of delivery.
                  </HelpNavItem>
                  <HelpNavItem icon={<ClipboardList size={14} />} title="Operations" color="#d97706">
                    Operational task board — pending tasks, overdue items, missing documents (SI, KYC, PO, B/L), and follow-up notes. This is where day-to-day action items live.
                  </HelpNavItem>
                  <HelpNavItem icon={<Users size={14} />} title="Customers" color="#16a34a">
                    Customer master list. View tiers (Key Account, Regular, Walk-in), payment terms, blacklist/credit-hold flags, and margin floors. Edit customer details directly.
                  </HelpNavItem>
                  <HelpNavItem icon={<ShieldCheck size={14} />} title="KYC Form" color="#ea580c">
                    Know Your Customer form for new customer onboarding. Fill out company info, trade details, required documents, and declarations. Can be printed or emailed.
                  </HelpNavItem>
                </div>
              </section>

              {/* ===================== SECTION 2 ===================== */}
              <section className="help-section">
                <h3 className="help-section-title">Quick Commands Reference</h3>
                <p className="help-intro">
                  Available in the <strong>Command Center</strong> on the right sidebar. Click a command to open a structured form — the AI processes your input automatically.
                </p>

                <div className="help-cmd-grid">
                  <HelpCmdItem icon={<UserPlus size={13} />} cmd="/new customer" color="#0f8fa8">
                    <strong>Fields:</strong> Name*, Location, Tier, Payment Terms<br />
                    Registers a new customer in the system with default settings.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<PackagePlus size={13} />} cmd="/new inquiry" color="#0891b2">
                    <strong>Fields:</strong> Customer*, Request*, Origin, Destination, Channel, SBU<br />
                    Logs a new shipping inquiry and links it to the customer.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<MessageSquarePlus size={13} />} cmd="/follow up" color="#16a34a">
                    <strong>Fields:</strong> Customer*, Note*, Mark Complete<br />
                    Records a follow-up interaction. Optionally closes the inquiry.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<ListPlus size={13} />} cmd="/new task" color="#d97706">
                    <strong>Fields:</strong> Customer, Task*, Due Date<br />
                    Creates a task or reminder for the sales team.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<FileSpreadsheet size={13} />} cmd="/quote" color="#7c3aed">
                    <strong>Fields:</strong> Customer*<br />
                    Initiates a quotation for the customer's pending inquiry.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<Search size={13} />} cmd="/lookup" color="#64748b">
                    <strong>Fields:</strong> Search Query*<br />
                    Searches customers, inquiries, shipments, or any records.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<ShieldAlert size={13} />} cmd="/blacklist" color="#dc2626">
                    <strong>Fields:</strong> Customer*, Action (Add/Remove)<br />
                    Adds or removes a customer from the blacklist.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<CreditCard size={13} />} cmd="/credit hold" color="#ea580c">
                    <strong>Fields:</strong> Customer*, Action (Add/Remove)<br />
                    Puts a customer on credit hold or clears the hold.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<ArrowUpDown size={13} />} cmd="/change tier" color="#0d9488">
                    <strong>Fields:</strong> Customer*, New Tier<br />
                    Changes customer tier (Key Account, Regular, Walk-in).
                  </HelpCmdItem>
                  <HelpCmdItem icon={<Zap size={13} />} cmd="/complete" color="#15803d">
                    <strong>Fields:</strong> Customer*, Note<br />
                    Marks the customer's pending inquiry as complete.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<Anchor size={13} />} cmd="/new booking" color="#0d9488">
                    <strong>Fields:</strong> Customer*, Quote ID*, Shipping Line, Container Type, Qty, Urgent<br />
                    Creates a booking from a confirmed quotation. If urgent, skips Procurement.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<Ship size={13} />} cmd="/confirm booking" color="#d97706">
                    <strong>Fields:</strong> Booking ID*, Vessel Name, Voyage Number<br />
                    Procurement confirms liner space and vessel allocation for a booking.
                  </HelpCmdItem>
                  <HelpCmdItem icon={<PackageCheck size={13} />} cmd="/release booking" color="#16a34a">
                    <strong>Fields:</strong> Booking ID*, Note<br />
                    CS releases container/collection instructions to the customer.
                  </HelpCmdItem>
                </div>
                <p className="help-note">* = required field</p>
              </section>

              {/* ===================== SECTION 3 ===================== */}
              <section className="help-section">
                <h3 className="help-section-title">Inquiry Process Guide</h3>
                <p className="help-intro">
                  Step-by-step instructions for handling shipping inquiries — from first contact to confirmed booking.
                </p>

                {/* --- New Customer Flow --- */}
                <div className="help-flow">
                  <div className="help-flow-badge new">New Customer</div>
                  <h4 className="help-flow-title">When a new customer contacts you for the first time</h4>

                  <ol className="help-steps">
                    <li>
                      <div className="help-step-num">1</div>
                      <div className="help-step-body">
                        <strong>Register the customer</strong>
                        <p>Go to <strong>Command Center</strong> and click <code>/new customer</code>. Fill in the company name, location, tier (usually "Walk-in" or "Regular" for new customers), and payment terms ("Pay Upfront" for new customers).</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">2</div>
                      <div className="help-step-body">
                        <strong>Send KYC form</strong>
                        <p>Navigate to the <strong>KYC Form</strong> page. Fill in the customer's details, then use the <strong>Send KYC</strong> button to email it to them. The customer's KYC status will update to "Pending".</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">3</div>
                      <div className="help-step-body">
                        <strong>Log the inquiry</strong>
                        <p>In the <strong>Command Center</strong>, click <code>/new inquiry</code>. Select the customer, enter what they need (e.g. "12 reefer containers"), the origin and destination ports, communication channel, and SBU.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">4</div>
                      <div className="help-step-body">
                        <strong>Check rates &amp; build quotation</strong>
                        <p>Use <code>/quote</code> with the customer name. The AI will look up available rates from AMS and help you build a quotation with margin calculations. If rates aren't available, a rate request goes to Procurement.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">5</div>
                      <div className="help-step-body">
                        <strong>Send quotation &amp; follow up</strong>
                        <p>Once the quote is approved, send it from the <strong>Quotations</strong> page. Log follow-ups using <code>/follow up</code> as you communicate with the customer.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">6</div>
                      <div className="help-step-body">
                        <strong>Confirm booking &amp; close inquiry</strong>
                        <p>When the customer confirms, use <code>/complete</code> to mark the inquiry as done. The shipment will appear in the <strong>Shipments</strong> page for tracking.</p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* --- Existing Customer Flow --- */}
                <div className="help-flow">
                  <div className="help-flow-badge existing">Existing Customer</div>
                  <h4 className="help-flow-title">When an existing customer sends a new inquiry</h4>

                  <ol className="help-steps">
                    <li>
                      <div className="help-step-num">1</div>
                      <div className="help-step-body">
                        <strong>Log the inquiry</strong>
                        <p>Go to <strong>Command Center</strong> and click <code>/new inquiry</code>. Start typing the customer name — it will autocomplete from existing records. Enter the request details, ports, channel, and SBU.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">2</div>
                      <div className="help-step-body">
                        <strong>Check customer status</strong>
                        <p>The AI will automatically flag if the customer is <span style={{color:'#dc2626'}}>blacklisted</span> or on <span style={{color:'#ea580c'}}>credit hold</span>. If flagged, resolve the issue before proceeding — use <code>/blacklist</code> or <code>/credit hold</code> to update flags.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">3</div>
                      <div className="help-step-body">
                        <strong>Build quotation</strong>
                        <p>Use <code>/quote</code>. For Key Account customers, contracted rates from AMS are typically available. For Regular customers, the AI will find the best available spot or NAC rates. Margin is checked against the customer's minimum margin floor.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">4</div>
                      <div className="help-step-body">
                        <strong>Send quote &amp; track</strong>
                        <p>Send the quotation from the <strong>Quotations</strong> page. Use <code>/new task</code> to set a reminder for follow-up. Log all interactions with <code>/follow up</code>.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">5</div>
                      <div className="help-step-body">
                        <strong>Close the loop</strong>
                        <p>Once confirmed, use <code>/complete</code> to mark the inquiry done. The booking moves to <strong>Shipments</strong> for tracking through to delivery and POD.</p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* --- Booking Process Flow --- */}
                <div className="help-flow">
                  <div className="help-flow-badge" style={{ background: '#0d9488', color: '#fff' }}>Post-Quotation</div>
                  <h4 className="help-flow-title">Booking Process — After customer accepts a quotation</h4>

                  <ol className="help-steps">
                    <li>
                      <div className="help-step-num">1</div>
                      <div className="help-step-body">
                        <strong>CS creates a booking</strong>
                        <p>In the <strong>Command Center</strong>, click <code>/new booking</code>. Select the customer, enter the confirmed quote ID, shipping line, container type, and quantity. The booking starts at <strong>"Pending Liner"</strong> status.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">2</div>
                      <div className="help-step-body">
                        <strong>Procurement confirms with liner</strong>
                        <p>Procurement contacts the shipping line, confirms vessel space, then uses <code>/confirm booking</code> with the booking ID, vessel name, and voyage number. Status advances to <strong>"Liner Confirmed"</strong>.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">3</div>
                      <div className="help-step-body">
                        <strong>CS releases to customer</strong>
                        <p>CS uses <code>/release booking</code> to send container collection instructions to the customer. Status advances to <strong>"Released"</strong>. The shipment then appears in the <strong>Shipments</strong> page for tracking.</p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* --- Urgent Booking Flow --- */}
                <div className="help-flow" style={{ borderColor: 'rgba(220,38,38,0.25)' }}>
                  <div className="help-flow-badge" style={{ background: '#dc2626', color: '#fff' }}>Urgent Bypass</div>
                  <h4 className="help-flow-title">When a booking is time-critical or a spot rate is available</h4>

                  <ol className="help-steps">
                    <li>
                      <div className="help-step-num">1</div>
                      <div className="help-step-body">
                        <strong>CS books directly with liner</strong>
                        <p>In <code>/new booking</code>, check the <strong>"Urgent"</strong> checkbox. The booking skips "Pending Liner" and starts at <strong>"Liner Confirmed"</strong> directly. Procurement is <em>not</em> notified automatically.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">2</div>
                      <div className="help-step-body">
                        <strong>Inform Procurement</strong>
                        <p>CS must notify Procurement about the urgent booking. The <strong>Shipments</strong> page will show an <span style={{color:'#dc2626', fontWeight: 700}}><AlertTriangle size={11} style={{display:'inline', marginBottom: -2}} /> URGENT</span> flag and a "Procurement not notified" warning until this is done.</p>
                      </div>
                    </li>
                    <li>
                      <div className="help-step-num">3</div>
                      <div className="help-step-body">
                        <strong>CS releases to customer</strong>
                        <p>Same as normal flow — use <code>/release booking</code> to send instructions.</p>
                      </div>
                    </li>
                  </ol>
                </div>

                {/* --- Tips --- */}
                <div className="help-tips">
                  <div className="help-tips-title">Tips</div>
                  <ul>
                    <li>You can always type free-form questions in the Command Center chat — the AI understands natural language too.</li>
                    <li>Use <code>/lookup</code> to quickly find any customer, inquiry ID, or shipment.</li>
                    <li>The <strong>Operations</strong> page shows overdue tasks and missing documents — check it daily.</li>
                    <li>Quotations below the customer's minimum margin floor will be routed for SBU head approval automatically.</li>
                    <li>Urgent bookings bypass Procurement but <strong>must</strong> be reported — check the Shipments page for unnotified bookings.</li>
                    <li>The <strong>Bookings Pipeline</strong> on the Shipments page shows the real-time status of all bookings with a workflow progress bar.</li>
                  </ul>
                </div>
              </section>

              {/* ===================== SECTION 4 ===================== */}
              <section className="help-section">
                <h3 className="help-section-title">Roles &amp; Permissions</h3>
                <p className="help-intro">
                  Each team member is assigned a role that determines which pages they can access, which quick commands they can use, and what actions they can perform. Use the role switcher in the top bar to preview different roles.
                </p>

                <div className="help-roles-list">
                  {/* CS */}
                  <div className="help-role-card">
                    <div className="help-role-header">
                      <span className="help-role-dot" style={{ background: ROLE_COLORS.CS }} />
                      <span className="help-role-name">Customer Service (CS)</span>
                    </div>
                    <div className="help-role-desc">Front-line team handling customer communication, inquiries, and bookings.</div>
                    <div className="help-role-section">
                      <div className="help-role-label">Pages</div>
                      <div className="help-role-tags">
                        {ROLE_PAGE_ACCESS.CS.map(p => <span key={p} className="help-role-tag">{p}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Quick Commands</div>
                      <div className="help-role-tags">
                        {ROLE_QUICK_COMMANDS.CS.map(c => <span key={c} className="help-role-tag cmd">/{c.replace(/-/g, ' ')}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Key Actions</div>
                      <div className="help-role-tags">
                        {ROLE_ACTIONS.CS.map(a => <span key={a} className="help-role-tag action">{a}</span>)}
                      </div>
                    </div>
                  </div>

                  {/* Sales */}
                  <div className="help-role-card">
                    <div className="help-role-header">
                      <span className="help-role-dot" style={{ background: ROLE_COLORS.Sales }} />
                      <span className="help-role-name">Sales</span>
                    </div>
                    <div className="help-role-desc">Manages quotations, pricing, and customer relationships. Drives revenue targets.</div>
                    <div className="help-role-section">
                      <div className="help-role-label">Pages</div>
                      <div className="help-role-tags">
                        {ROLE_PAGE_ACCESS.Sales.map(p => <span key={p} className="help-role-tag">{p}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Quick Commands</div>
                      <div className="help-role-tags">
                        {ROLE_QUICK_COMMANDS.Sales.map(c => <span key={c} className="help-role-tag cmd">/{c.replace(/-/g, ' ')}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Key Actions</div>
                      <div className="help-role-tags">
                        {ROLE_ACTIONS.Sales.map(a => <span key={a} className="help-role-tag action">{a}</span>)}
                      </div>
                    </div>
                  </div>

                  {/* Procurement */}
                  <div className="help-role-card">
                    <div className="help-role-header">
                      <span className="help-role-dot" style={{ background: ROLE_COLORS.Procurement }} />
                      <span className="help-role-name">Procurement</span>
                    </div>
                    <div className="help-role-desc">Handles shipping line negotiations, rate sourcing, and booking confirmations with liners.</div>
                    <div className="help-role-section">
                      <div className="help-role-label">Pages</div>
                      <div className="help-role-tags">
                        {ROLE_PAGE_ACCESS.Procurement.map(p => <span key={p} className="help-role-tag">{p}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Quick Commands</div>
                      <div className="help-role-tags">
                        {ROLE_QUICK_COMMANDS.Procurement.map(c => <span key={c} className="help-role-tag cmd">/{c.replace(/-/g, ' ')}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Key Actions</div>
                      <div className="help-role-tags">
                        {ROLE_ACTIONS.Procurement.map(a => <span key={a} className="help-role-tag action">{a}</span>)}
                      </div>
                    </div>
                  </div>

                  {/* Finance */}
                  <div className="help-role-card">
                    <div className="help-role-header">
                      <span className="help-role-dot" style={{ background: ROLE_COLORS.Finance }} />
                      <span className="help-role-name">Finance</span>
                    </div>
                    <div className="help-role-desc">Manages credit approvals, customer flags (blacklist/credit hold), KYC verification, and tier changes.</div>
                    <div className="help-role-section">
                      <div className="help-role-label">Pages</div>
                      <div className="help-role-tags">
                        {ROLE_PAGE_ACCESS.Finance.map(p => <span key={p} className="help-role-tag">{p}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Quick Commands</div>
                      <div className="help-role-tags">
                        {ROLE_QUICK_COMMANDS.Finance.map(c => <span key={c} className="help-role-tag cmd">/{c.replace(/-/g, ' ')}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Key Actions</div>
                      <div className="help-role-tags">
                        {ROLE_ACTIONS.Finance.map(a => <span key={a} className="help-role-tag action">{a}</span>)}
                      </div>
                    </div>
                  </div>

                  {/* Admin */}
                  <div className="help-role-card">
                    <div className="help-role-header">
                      <span className="help-role-dot" style={{ background: ROLE_COLORS.Admin }} />
                      <span className="help-role-name">Admin</span>
                    </div>
                    <div className="help-role-desc">Full access to all pages, commands, and actions. Use for testing or system administration.</div>
                    <div className="help-role-section">
                      <div className="help-role-label">Pages</div>
                      <div className="help-role-tags">
                        {ROLE_PAGE_ACCESS.Admin.map(p => <span key={p} className="help-role-tag">{p}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Quick Commands</div>
                      <div className="help-role-tags">
                        {ROLE_QUICK_COMMANDS.Admin.map(c => <span key={c} className="help-role-tag cmd">/{c.replace(/-/g, ' ')}</span>)}
                      </div>
                    </div>
                    <div className="help-role-section">
                      <div className="help-role-label">Key Actions</div>
                      <div className="help-role-tags">
                        {ROLE_ACTIONS.Admin.map(a => <span key={a} className="help-role-tag action">{a}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

            </div>
          </div>
        </div>
      )}
    </>
  )
}

/* ---- Sub-components for help panel content ---- */

function HelpNavItem({ icon, title, color, children }: { icon: React.ReactNode; title: string; color: string; children: React.ReactNode }) {
  return (
    <div className="help-nav-item">
      <div className="help-nav-icon" style={{ color, background: color + '12' }}>{icon}</div>
      <div>
        <div className="help-nav-title">{title}</div>
        <div className="help-nav-desc">{children}</div>
      </div>
    </div>
  )
}

function HelpCmdItem({ icon, cmd, color, children }: { icon: React.ReactNode; cmd: string; color: string; children: React.ReactNode }) {
  return (
    <div className="help-cmd-item">
      <div className="help-cmd-head">
        <span className="help-cmd-icon" style={{ color }}>{icon}</span>
        <code className="help-cmd-name">{cmd}</code>
      </div>
      <div className="help-cmd-desc">{children}</div>
    </div>
  )
}
