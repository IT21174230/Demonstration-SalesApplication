import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { KPIItem } from '../../mockData'

export default function KPICard({ label, value, change, trend, color, sub }: KPIItem) {
  return (
    <div className={`db-kpi-card c-${color}`}>
      <div className="db-kpi-label">{label}</div>
      <div className="db-kpi-value">{value}</div>
      <div className={`db-kpi-change ${trend}`}>
        {trend === 'up' && <TrendingUp size={12} />}
        {trend === 'down' && <TrendingDown size={12} />}
        {trend === 'neutral' && <Minus size={12} />}
        <span>{change}</span>
        {trend !== 'neutral' && <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 10 }}>vs prev</span>}
      </div>
      {sub && <div className="db-kpi-sub">{sub}</div>}
    </div>
  )
}
