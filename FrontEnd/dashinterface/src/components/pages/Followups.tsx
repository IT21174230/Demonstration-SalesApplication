import { useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, ListPlus, History, Phone, Zap, Lock } from 'lucide-react'
import {
  EMPLOYEES, isOverdue, daysOverdue, todayISO, isSpotInquiry,
  type Inquiry, type Task, type MissingItem, type Followup,
} from '../../mockData'
import { useRole } from '../../RoleContext'

interface FollowupsProps {
  inquiries: Inquiry[]
  tasks: Task[]
  missingItems: MissingItem[]
  followups: Followup[]
  onAddFollowup: (customerName: string, note: string, completionFlag: boolean, employeeId?: number) => void
  onAddTask: (customerName: string, taskText: string, dueDate: string, employeeId: number) => void
  onCompleteTask: (id: string) => void
}

export default function Followups({
  inquiries, tasks, missingItems, followups,
  onAddFollowup, onAddTask, onCompleteTask,
}: FollowupsProps) {
  const { hasPermission } = useRole()
  const canCreateFollowup = hasPermission('followup:create')
  const canCreateTask = hasPermission('task:create')
  const canCompleteTask = hasPermission('task:complete')
  const [followupCustomer, setFollowupCustomer] = useState('')
  const [followupNote, setFollowupNote] = useState('')
  const [followupEmployee, setFollowupEmployee] = useState<number>(1)
  const [completionFlag, setCompletionFlag] = useState<boolean>(true)

  const [taskCustomer, setTaskCustomer] = useState('')
  const [taskText, setTaskText] = useState('')
  const [taskDue, setTaskDue] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [taskEmployee, setTaskEmployee] = useState<number>(1)

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`
  const customerOptions = Array.from(new Set(inquiries.map(i => i.customer_name)))

  const handleLogFollowup = () => {
    if (!followupCustomer.trim()) return
    onAddFollowup(followupCustomer.trim(), followupNote.trim(), completionFlag, followupEmployee)
    setFollowupCustomer('')
    setFollowupNote('')
  }

  const handleAddTask = () => {
    if (!taskCustomer.trim() || !taskText.trim()) return
    onAddTask(taskCustomer.trim(), taskText.trim(), taskDue, taskEmployee)
    setTaskCustomer('')
    setTaskText('')
  }

  const today = todayISO()

  // ---- Phase 4.1: Most-chased pending inquiries (the "15× chasing procurement" pain point) ----
  const mostChased = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of followups) {
      if (!f.inquiry_id) continue
      counts.set(f.inquiry_id, (counts.get(f.inquiry_id) ?? 0) + 1)
    }
    return inquiries
      .filter(i => i.status === 'pending')
      .map(i => ({ inquiry: i, chases: counts.get(i.id) ?? 0 }))
      .sort((a, b) => b.chases - a.chases)
      .slice(0, 5)
  }, [inquiries, followups])

  // ---- Phase 4.2: Spot-rate / urgent inquiries (15-min windows per the Friday meeting) ----
  const spotInquiries = useMemo(
    () => inquiries.filter(i => i.status === 'pending' && isSpotInquiry(i.inquiry_text)),
    [inquiries],
  )

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Operations</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Follow-ups, tasks, urgent spot rates, and most-chased inquiries — everything that needs attention today
            </div>
          </div>
        </div>
      </div>

      {/* Phase 4.2: Spot Rate / Urgent — only render if we actually have any */}
      {spotInquiries.length > 0 && (
        <div className="db-chart-card" style={{ marginBottom: 18, borderColor: 'rgba(220,38,38,0.25)' }}>
          <div className="db-chart-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={15} style={{ color: '#dc2626' }} />
              <div>
                <div className="db-chart-title">Spot Rate / Urgent — Time Critical</div>
                <div className="db-chart-sub">Confirm within 15 minutes · spot-rate validity windows are short</div>
              </div>
            </div>
            <span className="lt-pill overdue">{spotInquiries.length} urgent</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {spotInquiries.map(i => (
              <div
                key={i.id}
                style={{
                  padding: '10px 12px',
                  background: 'rgba(220,38,38,0.04)',
                  border: '1px solid rgba(220,38,38,0.15)',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{i.customer_name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i.id}</span>
                    <span className="lt-pill overdue">SPOT · 15-min window</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.origin} → {i.destination} · {i.request} · via {i.channel}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {empName(i.employee_id)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phase 4.1: Most-chased inquiries — surfaces the procurement chase load */}
      {mostChased.length > 0 && (
        <div className="db-chart-card" style={{ marginBottom: 18 }}>
          <div className="db-chart-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Phone size={14} style={{ color: '#d97706' }} />
              <div>
                <div className="db-chart-title">Most-Chased Pending Inquiries</div>
                <div className="db-chart-sub">How many times sales has followed up — high counts = procurement bottleneck</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mostChased.map(({ inquiry: i, chases }) => {
              const intensity = Math.min(1, chases / 10)
              const barColor = chases >= 5 ? '#dc2626' : chases >= 2 ? '#d97706' : '#16a34a'
              return (
                <div
                  key={i.id}
                  style={{
                    padding: '10px 12px',
                    background: '#ffffff',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{i.customer_name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{i.id}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {i.origin} → {i.destination}
                      </span>
                    </div>
                    <span style={{ color: barColor, fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                      {chases} {chases === 1 ? 'chase' : 'chases'}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(0,0,0,0.03)', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${intensity * 100}%`,
                      height: '100%',
                      background: barColor,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Section 1: Add Follow-up */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Section 1 — Log Follow-up</div>
            <div className="db-chart-sub">Every entry creates a row in fact_followups · check "complete" to also close the inquiry</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr 1fr auto', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
          <input
            list="customer-options"
            value={followupCustomer}
            onChange={e => setFollowupCustomer(e.target.value)}
            placeholder="Select / type customer"
            className="lt-input"
          />
          <datalist id="customer-options">
            {customerOptions.map(c => <option key={c} value={c} />)}
          </datalist>
          <input
            value={followupNote}
            onChange={e => setFollowupNote(e.target.value)}
            placeholder='Note (e.g. "Called, awaiting SI")'
            className="lt-input"
          />
          <select
            value={followupEmployee}
            onChange={e => setFollowupEmployee(Number(e.target.value))}
            className="lt-select"
            style={{ padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
          >
            {EMPLOYEES.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <button
            className="db-btn primary"
            onClick={() => canCreateFollowup && handleLogFollowup()}
            disabled={!canCreateFollowup}
            title={canCreateFollowup ? 'Log follow-up' : 'Restricted — requires CS, Sales, or Procurement role'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: canCreateFollowup ? 1 : 0.4, cursor: canCreateFollowup ? 'pointer' : 'not-allowed' }}
          >
            {canCreateFollowup ? <CheckCircle2 size={12} /> : <Lock size={10} />} Log Follow-up
          </button>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={completionFlag}
            onChange={e => setCompletionFlag(e.target.checked)}
          />
          Mark inquiry as Completed
        </label>
      </div>

      {/* Section 1b: Recent follow-ups history */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div className="db-chart-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={14} style={{ color: 'var(--accent-light)' }} />
            <div>
              <div className="db-chart-title">Recent Follow-ups (fact_followups)</div>
              <div className="db-chart-sub">{followups.length} records · most recent first</div>
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>When</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Note</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Closed inquiry?</th>
              </tr>
            </thead>
            <tbody>
              {followups.map(f => (
                <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{f.created_at}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>{f.customer_name}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{f.note}</td>
                  <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(f.employee_id)}</td>
                  <td style={{ padding: '12px 8px' }}>
                    <span className={`lt-pill ${f.completion_flag ? 'completed' : 'pending'}`}>
                      {f.completion_flag ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
              {followups.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No follow-ups logged yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Tasks */}
      <div className="db-chart-card" style={{ marginBottom: 18 }}>
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Section 2 — Tasks</div>
            <div className="db-chart-sub">
              {tasks.filter(t => t.status === 'pending').length} pending · {tasks.filter(t => t.status === 'pending' && isOverdue(t.due_date)).length} overdue · {tasks.filter(t => t.status === 'completed').length} completed
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 140px 1fr auto', gap: 10, marginBottom: 14 }}>
          <input
            list="customer-options"
            value={taskCustomer}
            onChange={e => setTaskCustomer(e.target.value)}
            placeholder="Customer"
            className="lt-input"
          />
          <input
            value={taskText}
            onChange={e => setTaskText(e.target.value)}
            placeholder="Task (e.g. Send Quotation)"
            className="lt-input"
          />
          <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="lt-input" />
          <select
            value={taskEmployee}
            onChange={e => setTaskEmployee(Number(e.target.value))}
            className="lt-select"
            style={{ padding: '10px 12px', fontSize: 13, borderRadius: 8 }}
          >
            {EMPLOYEES.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
          </select>
          <button
            className="db-btn primary"
            onClick={() => canCreateTask && handleAddTask()}
            disabled={!canCreateTask || !taskCustomer.trim() || !taskText.trim()}
            title={canCreateTask ? 'Add task' : 'Restricted — requires CS, Sales, or Procurement role'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', opacity: canCreateTask && taskCustomer.trim() && taskText.trim() ? 1 : 0.4, cursor: canCreateTask ? 'pointer' : 'not-allowed' }}
          >
            {canCreateTask ? <ListPlus size={12} /> : <Lock size={10} />} Add Task
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Task</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Due Date</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const isPending = t.status === 'pending'
                const overdue = isPending && isOverdue(t.due_date)
                const dueToday = isPending && t.due_date === today
                return (
                  <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>{t.customer_name}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{t.task}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={`lt-pill ${isPending ? 'pending' : 'completed'}`}>
                        {isPending ? 'Pending' : 'Completed'}
                      </span>
                      {overdue && <span className="lt-pill overdue" style={{ marginLeft: 6 }}>{daysOverdue(t.due_date)}d overdue</span>}
                      {dueToday && <span className="lt-pill due-today" style={{ marginLeft: 6 }}>Due today</span>}
                    </td>
                    <td style={{ padding: '12px 8px', color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>{t.due_date}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(t.employee_id)}</td>
                    <td style={{ padding: '12px 8px' }}>
                      {isPending && (
                        <button
                          className="lt-icon-btn"
                          title={canCompleteTask ? 'Complete task' : 'Restricted — requires CS, Sales, or Procurement role'}
                          onClick={() => canCompleteTask && onCompleteTask(t.id)}
                          disabled={!canCompleteTask}
                          style={{ opacity: canCompleteTask ? 1 : 0.4, cursor: canCompleteTask ? 'pointer' : 'not-allowed' }}
                        >
                          <CheckCircle2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {tasks.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No tasks yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Missing Tasks */}
      <div className="db-chart-card" style={{ borderColor: 'rgba(217,119,6,0.25)' }}>
        <div className="db-chart-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: '#d97706' }} />
            <div>
              <div className="db-chart-title">Section 3 — Missing Tasks (Power Feature)</div>
              <div className="db-chart-sub">Customers with outstanding documents or actions blocking the deal · cutoff dates flagged</div>
            </div>
          </div>
          <span className="lt-pill pending">{missingItems.length} items</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Missing Item</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Outstanding Since</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Cutoff</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Owner</th>
              </tr>
            </thead>
            <tbody>
              {missingItems.map(m => {
                const overdue = isOverdue(m.cutoff_date)
                const dueToday = m.cutoff_date === today
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>{m.customer_name}</td>
                    <td style={{ padding: '12px 8px', color: '#d97706', fontWeight: 600 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AlertTriangle size={11} /> {m.missing_item}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{m.since}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span style={{ color: overdue ? '#dc2626' : 'var(--text-muted)', fontWeight: overdue ? 600 : 400 }}>
                        {m.cutoff_date ?? '—'}
                      </span>
                      {overdue && <span className="lt-pill overdue" style={{ marginLeft: 6 }}>{daysOverdue(m.cutoff_date)}d past</span>}
                      {dueToday && <span className="lt-pill due-today" style={{ marginLeft: 6 }}>Cutoff today</span>}
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(m.employee_id)}</td>
                  </tr>
                )
              })}
              {missingItems.length === 0 && (
                <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Nothing missing — all customers up to date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
