import type { CollabAgentCanvas, CollabLangGraphStep } from '@/api/collab'
import './LangGraphStepStrip.css'

export type CanvasSelection =
  | { kind: 'agent'; id: string }
  | { kind: 'langgraph'; id: string }
  | null

export function resolveSelectionPair(
  canvas: CollabAgentCanvas,
  selection: CanvasSelection,
): { agentId: string; langgraphId: string } {
  if (!selection) return { agentId: '', langgraphId: '' }
  const toLg = canvas.langgraph_to_agent || {}
  const toAgent = canvas.agent_to_langgraph || {}
  if (selection.kind === 'agent') {
    return {
      agentId: selection.id,
      langgraphId: toAgent[selection.id] || '',
    }
  }
  return {
    agentId: toLg[selection.id] || '',
    langgraphId: selection.id,
  }
}

export function LangGraphStepStrip({
  canvas,
  selection,
  onSelectAgent,
  onSelectLangGraph,
}: {
  canvas: CollabAgentCanvas
  selection: CanvasSelection
  onSelectAgent: (agentId: string) => void
  onSelectLangGraph: (stepId: string) => void
}) {
  const steps = canvas.langgraph_steps || []
  if (!steps.length) return null
  const pair = resolveSelectionPair(canvas, selection)

  return (
    <div className="lg-step-strip" aria-label="LangGraph 与 Agent 映射">
      <span className="lg-step-strip-label">编排步骤</span>
      {steps.map((step: CollabLangGraphStep) => {
        const agentId = step.agent_id
        const lgActive = pair.langgraphId === step.id
        const agentActive = pair.agentId === agentId
        return (
          <button
            key={step.id}
            type="button"
            className={`lg-step-chip${lgActive || agentActive ? ' is-active' : ''}`}
            onClick={() => {
              onSelectLangGraph(step.id)
              if (agentId) onSelectAgent(agentId)
            }}
            title={`LangGraph: ${step.id} → Agent: ${agentId}`}
          >
            <span className="lg-step-chip-lg">{step.id}</span>
            <span className="lg-step-chip-sep">→</span>
            <span className="lg-step-chip-agent">{step.label}</span>
            <span className={`lg-step-chip-st st-${step.status}`}>{step.status}</span>
          </button>
        )
      })}
      {pair.agentId && pair.langgraphId && (
        <span className="lg-step-strip-hint">
          已关联 <code>{pair.langgraphId}</code> ↔ <code>{pair.agentId}</code>
        </span>
      )}
    </div>
  )
}
