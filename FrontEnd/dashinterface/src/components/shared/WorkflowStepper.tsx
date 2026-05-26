import { ChevronRight, Check, Clock } from 'lucide-react'
import { WORKFLOW_STAGES, ROLE_LABELS, ROLE_COLORS, type WorkflowStage, type UserRole } from '../../mockData'
import { useRole } from '../../RoleContext'

interface WorkflowStepperProps {
  currentStage: WorkflowStage
  onAdvance: (nextStage: WorkflowStage) => void
}

export default function WorkflowStepper({ currentStage, onAdvance }: WorkflowStepperProps) {
  const { activeRole } = useRole()

  const currentIdx = WORKFLOW_STAGES.findIndex(s => s.id === currentStage)

  const nextStage = currentIdx < WORKFLOW_STAGES.length - 1
    ? WORKFLOW_STAGES[currentIdx + 1]
    : null

  const isResponsible = WORKFLOW_STAGES[currentIdx]?.role === activeRole || activeRole === 'Admin'

  return (
    <div className="wf-stepper">
      <div className="wf-stepper-track">
        {WORKFLOW_STAGES.map((stage, idx) => {
          const done = idx < currentIdx
          const active = idx === currentIdx
          const pending = idx > currentIdx
          const roleColor = ROLE_COLORS[stage.role]

          return (
            <div key={stage.id} className="wf-step-wrapper">
              <div className={`wf-step ${done ? 'done' : ''} ${active ? 'active' : ''} ${pending ? 'pending' : ''}`}>
                <div
                  className="wf-step-dot"
                  style={{
                    background: done ? roleColor : active ? roleColor : 'var(--border)',
                    borderColor: done || active ? roleColor : 'var(--border)',
                  }}
                >
                  {done ? <Check size={10} strokeWidth={3} color="#fff" /> : (
                    <span style={{ fontSize: 8, color: active ? '#fff' : 'var(--text-muted)', fontWeight: 700 }}>
                      {stage.step}
                    </span>
                  )}
                </div>
                <div className="wf-step-label" style={{ color: active ? 'var(--text)' : done ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                  {stage.label}
                </div>
                <div
                  className="wf-step-role"
                  style={{
                    color: roleColor,
                    opacity: pending ? 0.5 : 1,
                  }}
                >
                  {ROLE_LABELS[stage.role]}
                </div>
              </div>
              {idx < WORKFLOW_STAGES.length - 1 && (
                <div className="wf-step-connector" style={{ background: done ? roleColor : 'var(--border)' }} />
              )}
            </div>
          )
        })}
      </div>

      {/* Action row */}
      <div className="wf-stepper-action">
        {currentStage === 'completed' ? (
          <div className="wf-status-badge" style={{ background: 'rgba(22,163,74,0.08)', color: '#16a34a' }}>
            <Check size={12} /> Workflow completed
          </div>
        ) : isResponsible && nextStage ? (
          <button
            className="db-btn primary"
            onClick={() => onAdvance(nextStage.id)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}
          >
            Push to {ROLE_LABELS[nextStage.role]} <ChevronRight size={12} />
          </button>
        ) : (
          <div className="wf-status-badge" style={{ background: 'rgba(217,119,6,0.06)', color: '#d97706' }}>
            <Clock size={12} /> Waiting on {ROLE_LABELS[WORKFLOW_STAGES[currentIdx]?.role ?? 'CS']}
          </div>
        )}
      </div>
    </div>
  )
}
