import { ChevronRight, Check, Clock } from 'lucide-react'
import { WORKFLOW_STAGES, stageRoleLabel, stageRoleColor, type WorkflowStage } from '../../types'
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

  const isResponsible = WORKFLOW_STAGES[currentIdx]?.roles.includes(activeRole) || activeRole === 'Admin'

  return (
    <div className="wf-stepper">
      <div className="wf-timeline">
        {WORKFLOW_STAGES.map((stage, idx) => {
          const done = idx < currentIdx
          const active = idx === currentIdx
          const pending = idx > currentIdx
          const roleColor = stageRoleColor(stage)
          const isLast = idx === WORKFLOW_STAGES.length - 1

          return (
            <div key={stage.id} className={`wf-tl-row ${done ? 'done' : ''} ${active ? 'active' : ''} ${pending ? 'pending' : ''}`}>
              {/* Dot + vertical connector */}
              <div className="wf-tl-track">
                <div
                  className="wf-tl-dot"
                  style={{
                    background: done ? roleColor : active ? roleColor : 'var(--border)',
                    borderColor: done || active ? roleColor : 'var(--border)',
                    boxShadow: active ? `0 0 0 3px ${roleColor}20` : undefined,
                  }}
                >
                  {done ? <Check size={9} strokeWidth={3} color="#fff" /> : (
                    <span style={{ fontSize: 8, color: active ? '#fff' : 'var(--text-muted)', fontWeight: 700 }}>
                      {stage.step}
                    </span>
                  )}
                </div>
                {!isLast && (
                  <div className="wf-tl-line" style={{ background: done ? roleColor : 'var(--border)' }} />
                )}
              </div>

              {/* Label + role */}
              <div className="wf-tl-content">
                <span
                  className="wf-tl-label"
                  style={{
                    color: active ? 'var(--text)' : done ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontWeight: active ? 700 : done ? 500 : 400,
                  }}
                >
                  {stage.label}
                </span>
                <span
                  className="wf-tl-role"
                  style={{ color: roleColor, opacity: pending ? 0.5 : 1 }}
                >
                  {stageRoleLabel(stage)}
                </span>
              </div>

              {/* Active indicator */}
              {active && (
                <span className="wf-tl-current">Current</span>
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
            Push to {stageRoleLabel(nextStage)} <ChevronRight size={12} />
          </button>
        ) : (
          <div className="wf-status-badge" style={{ background: 'rgba(217,119,6,0.06)', color: '#d97706' }}>
            <Clock size={12} /> Waiting on {WORKFLOW_STAGES[currentIdx] ? stageRoleLabel(WORKFLOW_STAGES[currentIdx]) : 'Customer Service / Sales'}
          </div>
        )}
      </div>
    </div>
  )
}
