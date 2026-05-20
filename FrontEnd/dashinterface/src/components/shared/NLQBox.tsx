import { useState } from 'react'
import { Sparkles, Send } from 'lucide-react'
import {
  EMPLOYEES, isOverdue, daysOverdue, todayISO,
  type Inquiry, type Task, type MissingItem, type Followup,
} from '../../mockData'

interface NLQBoxProps {
  inquiries: Inquiry[]
  tasks: Task[]
  missingItems: MissingItem[]
  followups: Followup[]
}

interface NLQRow {
  cells: string[]
}

interface NLQResult {
  summary: string
  columns?: string[]
  rows?: NLQRow[]
}

const SUGGESTIONS = [
  'Show pending inquiries',
  'Which tasks are overdue?',
  'What is missing for Hayleys?',
  'Follow-ups today',
  'Active customers',
]

function answer(query: string, inquiries: Inquiry[], tasks: Task[], missingItems: MissingItem[], followups: Followup[]): NLQResult {
  const q = query.toLowerCase().trim()
  if (!q) return { summary: 'Ask a question — try one of the suggestions below.' }

  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`
  const today = todayISO()

  // missing for {customer}
  const missingMatch = q.match(/(?:missing|outstand|pending)\s+(?:for|on)\s+(.+)/)
  if (missingMatch) {
    const name = missingMatch[1].trim()
    const matched = missingItems.filter(m => m.customer_name.toLowerCase().includes(name))
    if (matched.length === 0) return { summary: `Nothing flagged as missing for "${name}".` }
    return {
      summary: `${matched.length} item${matched.length > 1 ? 's' : ''} missing for ${matched[0].customer_name}:`,
      columns: ['Item', 'Since', 'Cutoff', 'Owner'],
      rows: matched.map(m => ({ cells: [m.missing_item, m.since, m.cutoff_date ?? '—', empName(m.employee_id)] })),
    }
  }

  // overdue
  if (q.includes('overdue')) {
    const overdueTasks = tasks.filter(t => t.status === 'pending' && isOverdue(t.due_date))
    const overdueMissing = missingItems.filter(m => isOverdue(m.cutoff_date))
    const rows: NLQRow[] = [
      ...overdueTasks.map(t => ({ cells: ['Task', t.customer_name, t.task, `${daysOverdue(t.due_date)}d`, empName(t.employee_id)] })),
      ...overdueMissing.map(m => ({ cells: ['Missing', m.customer_name, m.missing_item, `${daysOverdue(m.cutoff_date)}d`, empName(m.employee_id)] })),
    ]
    if (rows.length === 0) return { summary: 'Nothing overdue. ✓' }
    return {
      summary: `${rows.length} overdue item${rows.length > 1 ? 's' : ''}:`,
      columns: ['Type', 'Customer', 'Item', 'Days', 'Owner'],
      rows,
    }
  }

  // due today
  if (q.includes('today') && (q.includes('task') || q.includes('due'))) {
    const matched = tasks.filter(t => t.status === 'pending' && t.due_date === today)
    if (matched.length === 0) return { summary: 'No tasks due today.' }
    return {
      summary: `${matched.length} task${matched.length > 1 ? 's' : ''} due today:`,
      columns: ['Customer', 'Task', 'Owner'],
      rows: matched.map(t => ({ cells: [t.customer_name, t.task, empName(t.employee_id)] })),
    }
  }

  // pending inquiries
  if ((q.includes('pending') && q.includes('inquir')) || q === 'pending') {
    const matched = inquiries.filter(i => i.status === 'pending')
    if (matched.length === 0) return { summary: 'No pending inquiries.' }
    return {
      summary: `${matched.length} pending inquir${matched.length > 1 ? 'ies' : 'y'}:`,
      columns: ['Customer', 'Request', 'Destination', 'Channel', 'Owner'],
      rows: matched.map(i => ({ cells: [i.customer_name, i.request, i.destination, i.channel, empName(i.employee_id)] })),
    }
  }

  // completed today
  if (q.includes('complet') && q.includes('today')) {
    const matched = inquiries.filter(i => i.status === 'completed' && i.completed_at?.startsWith(today))
    if (matched.length === 0) return { summary: 'No inquiries completed today yet.' }
    return {
      summary: `${matched.length} inquir${matched.length > 1 ? 'ies' : 'y'} completed today:`,
      columns: ['Customer', 'Request', 'Closed at', 'Owner'],
      rows: matched.map(i => ({ cells: [i.customer_name, i.request, i.completed_at ?? '', empName(i.employee_id)] })),
    }
  }

  // follow-ups today
  if (q.includes('follow') && q.includes('today')) {
    const matched = followups.filter(f => f.created_at.startsWith(today))
    if (matched.length === 0) return { summary: 'No follow-ups logged today.' }
    return {
      summary: `${matched.length} follow-up${matched.length > 1 ? 's' : ''} today:`,
      columns: ['Customer', 'Note', 'Closed?', 'Owner'],
      rows: matched.map(f => ({ cells: [f.customer_name, f.note, f.completion_flag ? 'Yes' : 'No', empName(f.employee_id)] })),
    }
  }

  // active customers
  if (q.includes('active customer') || (q.includes('active') && q.includes('customer'))) {
    const set = new Map<string, number>()
    for (const i of inquiries) {
      if (i.status === 'pending') set.set(i.customer_name, (set.get(i.customer_name) ?? 0) + 1)
    }
    if (set.size === 0) return { summary: 'No active customers.' }
    return {
      summary: `${set.size} active customer${set.size > 1 ? 's' : ''} with open requests:`,
      columns: ['Customer', 'Open inquiries'],
      rows: Array.from(set.entries()).map(([name, count]) => ({ cells: [name, String(count)] })),
    }
  }

  // generic customer query: "show ABC" / "ABC inquiries"
  const customerNames = Array.from(new Set(inquiries.map(i => i.customer_name)))
  const found = customerNames.find(c => q.includes(c.toLowerCase()))
  if (found) {
    const cust = inquiries.filter(i => i.customer_name === found)
    return {
      summary: `${cust.length} inquir${cust.length > 1 ? 'ies' : 'y'} for ${found}:`,
      columns: ['ID', 'Status', 'Request', 'Date'],
      rows: cust.map(i => ({ cells: [i.id, i.status, i.request, i.created_at] })),
    }
  }

  return {
    summary: `I didn't recognise "${query}". Try: pending inquiries, overdue, tasks today, follow-ups today, missing for <customer>, active customers.`,
  }
}

export default function NLQBox({ inquiries, tasks, missingItems, followups }: NLQBoxProps) {
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<NLQResult | null>(null)

  const run = (q: string) => {
    setQuery(q)
    setResult(answer(q, inquiries, tasks, missingItems, followups))
  }

  return (
    <div className="db-chart-card" style={{ marginBottom: 18, borderColor: 'rgba(79,70,229,0.2)' }}>
      <div className="db-chart-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />
          <div>
            <div className="db-chart-title">Ask anything</div>
            <div className="db-chart-sub">Natural-language queries against your live data</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') run(query) }}
          placeholder='e.g. "Which tasks are overdue?"'
          className="lt-input"
          style={{ flex: 1 }}
        />
        <button
          className="db-btn primary"
          onClick={() => run(query)}
          disabled={!query.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: query.trim() ? 1 : 0.5 }}
        >
          <Send size={12} /> Ask
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {SUGGESTIONS.map(s => (
          <button
            key={s}
            onClick={() => run(s)}
            className="lt-tab"
            style={{ fontSize: 11 }}
          >
            {s}
          </button>
        ))}
      </div>

      {result && (
        <div style={{
          background: 'rgba(79,70,229,0.03)', border: '1px solid rgba(79,70,229,0.12)',
          borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, marginBottom: result.rows ? 10 : 0 }}>
            {result.summary}
          </div>
          {result.columns && result.rows && result.rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                    {result.columns.map(c => (
                      <th key={c} style={{ padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      {r.cells.map((c, i) => (
                        <td key={i} style={{ padding: '8px', color: i === 0 ? 'var(--text)' : 'var(--text-secondary)', fontWeight: i === 0 ? 600 : 400 }}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
