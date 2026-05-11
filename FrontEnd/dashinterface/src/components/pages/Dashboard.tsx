import { useMemo } from 'react'
import { Clock, CheckCircle2, Users as UsersIcon, AlertTriangle, ArrowRight, ShieldCheck, Target, Building2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import KPICard from '../shared/KPICard'
import NLQBox from '../shared/NLQBox'
import { EMPLOYEES, SBUS, isOverdue, type Inquiry, type Task, type Followup, type MissingItem, type KPIItem, type PageId, type SBU, type Quote } from '../../mockData'

interface DashboardProps {
  inquiries: Inquiry[]
  tasks: Task[]
  followups: Followup[]
  missingItems: MissingItem[]
  quotes: Quote[]
  onGoTo: (page: PageId) => void
}

const Tip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="db-tooltip">
      <div className="db-tooltip-label">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="db-tooltip-val" style={{ color: p.color || '#f1f5f9' }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  )
}

// SBU label colours (used by both the SBU card and the per-SBU list).
const SBU_COLORS: Record<SBU, string> = {
  'Ocean Exports': '#6366f1',
  'Ocean Imports': '#22c55e',
  'Air Freight': '#f59e0b',
  'Domestic': '#8b5cf6',
}

// Hit-rate band colours so 70%+ reads green, 40–69% amber, below red.
const rateColor = (rate: number) =>
  rate >= 70 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444'

export default function Dashboard({ inquiries, tasks, followups, missingItems, quotes, onGoTo }: DashboardProps) {
  const today = new Date().toISOString().slice(0, 10)
  const pending = inquiries.filter(i => i.status === 'pending').length
  const completedToday = inquiries.filter(
    i => i.status === 'completed' && i.completed_at?.startsWith(today),
  ).length
  const activeCustomers = new Set(
    inquiries.filter(i => i.status === 'pending').map(i => i.customer_name),
  ).size
  const overdueCount =
    tasks.filter(t => t.status === 'pending' && isOverdue(t.due_date)).length +
    missingItems.filter(m => isOverdue(m.cutoff_date)).length

  // Phase 5: real count of quotes awaiting SBU-head approval (margin under floor).
  const pendingApprovals = quotes.filter(q => q.status === 'Awaiting Approval').length
  const confirmedQuotes = quotes.filter(q => q.status === 'Confirmed').length

  const kpis: KPIItem[] = [
    { label: 'Pending Inquiries', value: String(pending), change: 'awaiting action', trend: 'neutral', color: 'warning' },
    { label: 'Completed Today',  value: String(completedToday), change: 'closed today', trend: 'up', color: 'success' },
    { label: 'Active Customers', value: String(activeCustomers), change: 'with open requests', trend: 'neutral', color: 'accent' },
    { label: 'Overdue Items',    value: String(overdueCount), change: 'past due / cutoff', trend: overdueCount > 0 ? 'down' : 'neutral', color: 'danger' },
    { label: 'Pending Approvals', value: String(pendingApprovals), change: 'margin reviews', trend: pendingApprovals > 0 ? 'down' : 'neutral', color: 'purple', sub: `${confirmedQuotes} confirmed quotes` },
  ]

  const kpiIcons = [Clock, CheckCircle2, UsersIcon, AlertTriangle, ShieldCheck]

  const total = inquiries.length
  const completedTotal = inquiries.filter(i => i.status === 'completed').length
  const completionRate = total === 0 ? 0 : Math.round((completedTotal / total) * 100)

  // ---- Salesperson hit-rate (3.1) ----
  const hitRates = useMemo(() => {
    return EMPLOYEES.map(emp => {
      const owned = inquiries.filter(i => i.employee_id === emp.id)
      const completed = owned.filter(i => i.status === 'completed').length
      const totalOwned = owned.length
      const rate = totalOwned === 0 ? 0 : Math.round((completed / totalOwned) * 100)
      return { id: emp.id, name: emp.name, role: emp.role, total: totalOwned, completed, rate }
    }).sort((a, b) => b.rate - a.rate)
  }, [inquiries])

  // ---- SBU breakdown (3.2) ----
  const sbuStats = useMemo(() => {
    return SBUS.map(sbu => {
      const owned = inquiries.filter(i => i.sbu === sbu)
      return {
        sbu,
        total: owned.length,
        pending: owned.filter(i => i.status === 'pending').length,
        completed: owned.filter(i => i.status === 'completed').length,
      }
    }).sort((a, b) => b.total - a.total)
  }, [inquiries])
  const maxSbuTotal = Math.max(1, ...sbuStats.map(s => s.total))

  // ---- Existing charts ----
  const byDay = useMemo(() => {
    const map = new Map<string, { day: string; pending: number; completed: number }>()
    for (const inq of inquiries) {
      const day = inq.created_at.slice(0, 10)
      const row = map.get(day) ?? { day, pending: 0, completed: 0 }
      if (inq.status === 'pending') row.pending += 1
      else row.completed += 1
      map.set(day, row)
    }
    return Array.from(map.values()).sort((a, b) => (a.day < b.day ? -1 : 1))
  }, [inquiries])

  const byChannel = useMemo(() => {
    const map = new Map<string, number>()
    for (const inq of inquiries) {
      map.set(inq.channel, (map.get(inq.channel) ?? 0) + 1)
    }
    const colors: Record<string, string> = { WhatsApp: '#22c55e', Email: '#6366f1', Phone: '#f59e0b' }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: colors[name] ?? '#8b5cf6' }))
  }, [inquiries])

  const recent = inquiries.slice(0, 5)
  const empName = (id: number) => EMPLOYEES.find(e => e.id === id)?.name ?? `EMP-${id}`

  return (
    <div className="db-page-anim">
      <div className="db-page-head">
        <div className="db-page-head-row">
          <div>
            <h1 className="db-page-title">Dashboard</h1>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
              Operations snapshot, lifetime activity, and salesperson performance
            </div>
          </div>
          <button className="db-btn primary" onClick={() => onGoTo('chat')}>
            New Inquiry <ArrowRight size={12} style={{ marginLeft: 4 }} />
          </button>
        </div>
      </div>

      {/* Top KPI cards — operational right-now snapshot, plus approval queue placeholder */}
      <div className="db-kpi-grid db-kpi-5" style={{ marginBottom: 14 }}>
        {kpis.map((k, i) => {
          const Icon = kpiIcons[i]
          return (
            <div key={k.label} style={{ position: 'relative' }}>
              <KPICard {...k} />
              <div style={{ position: 'absolute', top: 12, right: 12, color: 'var(--text-muted)', opacity: 0.5 }}>
                <Icon size={14} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Lifetime summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
        {[
          { label: 'Total Inquiries', value: total, color: '#6366f1' },
          { label: 'Completed', value: completedTotal, color: '#22c55e' },
          { label: 'Completion Rate', value: `${completionRate}%`, color: '#f59e0b' },
        ].map(t => (
          <div key={t.label} style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '14px 16px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: t.color }}>{t.value}</div>
          </div>
        ))}
      </div>

      {/* NLQ box */}
      <NLQBox inquiries={inquiries} tasks={tasks} missingItems={missingItems} followups={followups} />

      {/* Performance row — hit rate + SBU breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
        <div className="db-chart-card">
          <div className="db-chart-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Target size={14} style={{ color: 'var(--accent-light)' }} />
              <div>
                <div className="db-chart-title">Salesperson Hit Rate</div>
                <div className="db-chart-sub">Inquiry → completion conversion</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {hitRates.map(r => (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <div>
                    <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13 }}>{r.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 8 }}>{r.role}</span>
                  </div>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {r.completed}/{r.total} ·{' '}
                    <strong style={{ color: rateColor(r.rate), fontSize: 13 }}>{r.rate}%</strong>
                  </span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    width: `${r.rate}%`,
                    height: '100%',
                    background: rateColor(r.rate),
                    transition: 'width 0.3s',
                    borderRadius: 999,
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="db-chart-card">
          <div className="db-chart-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} style={{ color: 'var(--accent-light)' }} />
              <div>
                <div className="db-chart-title">SBU Breakdown</div>
                <div className="db-chart-sub">Inquiries per Strategic Business Unit</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {sbuStats.map(s => {
              const widthPct = (s.total / maxSbuTotal) * 100
              const pendingPct = s.total === 0 ? 0 : (s.pending / s.total) * 100
              return (
                <div key={s.sbu}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: SBU_COLORS[s.sbu] }} />
                      {s.sbu}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {s.total > 0 ? (
                        <>
                          {s.pending} pending · {s.completed} completed · <strong style={{ color: 'var(--text)' }}>{s.total} total</strong>
                        </>
                      ) : (
                        <span style={{ fontStyle: 'italic' }}>no activity</span>
                      )}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${widthPct}%`,
                      height: '100%',
                      background: SBU_COLORS[s.sbu],
                      display: 'flex',
                      borderRadius: 999,
                      overflow: 'hidden',
                    }}>
                      {/* Pending portion appears slightly faded to distinguish from completed */}
                      <div style={{ width: `${pendingPct}%`, height: '100%', background: 'rgba(0,0,0,0.35)' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 14, fontSize: 10, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(0,0,0,0.35)', border: '1px solid var(--border)' }} />
              Pending portion
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#6366f1' }} />
              Completed portion
            </span>
          </div>
        </div>
      </div>

      {/* Charts — pending vs completed per day, plus channel mix */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 18 }}>
        <div className="db-chart-card">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">Inquiries per day</div>
              <div className="db-chart-sub">Pending vs completed</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={byDay} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#475569', fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<Tip />} />
              <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="completed" name="Completed" fill="#22c55e" radius={[3, 3, 0, 0]} opacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            {[['#f59e0b', 'Pending'], ['#22c55e', 'Completed']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="db-chart-card">
          <div className="db-chart-head">
            <div>
              <div className="db-chart-title">By Channel</div>
              <div className="db-chart-sub">Where inquiries come from</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={byChannel} dataKey="value" innerRadius={50} outerRadius={86} paddingAngle={4} startAngle={90} endAngle={450}>
                {byChannel.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
            {byChannel.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{c.name}</span>
                </div>
                <span style={{ color: 'var(--text)', fontWeight: 700 }}>{c.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="db-chart-card">
        <div className="db-chart-head">
          <div>
            <div className="db-chart-title">Recent Activity</div>
            <div className="db-chart-sub">Latest 5 customer inquiries</div>
          </div>
          <button className="db-btn secondary" onClick={() => onGoTo('inquiry-list')}>
            View all
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.06em' }}>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Customer</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Inquiry</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Status</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Employee</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--border)' }}>Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map(i => {
                const isPending = i.status === 'pending'
                return (
                  <tr key={i.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '12px 8px', color: 'var(--text)', fontWeight: 600 }}>
                      {i.customer_name}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
                        {i.id} · {i.channel}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)', maxWidth: 320 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={i.inquiry_text}>
                        {i.inquiry_text}
                      </div>
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={`lt-pill ${isPending ? 'pending' : 'completed'}`}>
                        {isPending ? 'Pending' : 'Completed'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-secondary)' }}>{empName(i.employee_id)}</td>
                    <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{i.created_at}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
