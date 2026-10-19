import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CollabAgentCanvas } from '@/api/collab'
import { Button, MermaidDiagram } from '@/ui'
import { sanitizeMermaidChart } from '@/lib/mermaidSanitize'
import { AgentFlowGraph } from './AgentFlowGraph'
import { resetTopicNodeLayout } from './agentCanvasLayout'
import { highlightAgentMermaid, highlightLangGraphMermaid } from './langgraphMermaidHighlight'
import {
  LangGraphStepStrip,
  resolveSelectionPair,
  type CanvasSelection,
} from './LangGraphStepStrip'
import './AgentCanvas.css'

const STATUS_CLASS: Record<string, string> = {
  ok: 'is-ok',
  running: 'is-running',
  error: 'is-error',
  blocked: 'is-error',
  idle: 'is-idle',
  pending: 'is-pending',
}

export function AgentCanvas({
  canvas,
  projectId,
  topicId,
}: {
  canvas?: CollabAgentCanvas | null
  projectId: string
  topicId: string
}) {
  const [showDiagram, setShowDiagram] = useState(false)
  const [selection, setSelection] = useState<CanvasSelection>(null)
  const [layoutEpoch, setLayoutEpoch] = useState(0)

  useEffect(() => {
    setSelection(null)
  }, [topicId])

  const pair = useMemo(
    () => (canvas ? resolveSelectionPair(canvas, selection) : { agentId: '', langgraphId: '' }),
    [canvas, selection],
  )

  const onSelectAgent = useCallback((agentId: string) => {
    setSelection({ kind: 'agent', id: agentId })
  }, [])

  const onSelectLangGraph = useCallback((stepId: string) => {
    setSelection({ kind: 'langgraph', id: stepId })
  }, [])

  const resetLayout = () => {
    if (!projectId || !topicId) return
    resetTopicNodeLayout(projectId, topicId)
    setLayoutEpoch(n => n + 1)
  }

  const mermaidChart = useMemo(() => {
    const raw = canvas?.langgraph_mermaid || canvas?.mermaid || ''
    if (!raw.trim()) return ''
    let chart = raw
    if (canvas?.langgraph_mermaid && pair.langgraphId) {
      chart = highlightLangGraphMermaid(raw, pair.langgraphId)
    } else if (canvas?.mermaid && !canvas?.langgraph_mermaid && pair.agentId) {
      chart = highlightAgentMermaid(raw, pair.agentId)
    }
    return sanitizeMermaidChart(chart)
  }, [canvas?.langgraph_mermaid, canvas?.mermaid, pair.langgraphId, pair.agentId])

  if (!canvas?.nodes?.length && !canvas?.mermaid) {
    return <p className="agent-canvas-empty">推进后此处显示多 Agent 画布（React Flow）与对话轨迹。</p>
  }

  const flowKey = `${topicId}:${layoutEpoch}:${canvas.engine}:${(canvas.transcript || []).length}`
  const hasDiagram = Boolean(mermaidChart.trim())

  return (
    <div className="agent-canvas">
      <div className="agent-canvas-toolbar">
        {topicId ? (
          <Button type="link" size="small" onClick={resetLayout}>
            恢复默认布局
          </Button>
        ) : (
          <span />
        )}
        {hasDiagram ? (
          <Button type="link" size="small" onClick={() => setShowDiagram(v => !v)}>
            {showDiagram ? '隐藏静态流程图' : '显示静态流程图'}
          </Button>
        ) : null}
      </div>
      {canvas.langgraph_steps?.length ? (
        <LangGraphStepStrip
          canvas={canvas}
          selection={selection}
          onSelectAgent={id => {
            onSelectAgent(id)
            const lg = canvas.agent_to_langgraph?.[id]
            if (lg) onSelectLangGraph(lg)
          }}
          onSelectLangGraph={id => {
            onSelectLangGraph(id)
            const agent = canvas.langgraph_to_agent?.[id]
            if (agent) onSelectAgent(agent)
          }}
        />
      ) : null}
      {canvas.nodes?.length ? (
        <AgentFlowGraph
          key={flowKey}
          canvas={canvas}
          projectId={projectId}
          topicId={topicId}
          highlightAgentId={pair.agentId}
          onSelectAgent={id => {
            onSelectAgent(id)
            const lg = canvas.agent_to_langgraph?.[id]
            if (lg) onSelectLangGraph(lg)
          }}
        />
      ) : null}
      {showDiagram && hasDiagram ? (
        <MermaidDiagram chart={mermaidChart} className="agent-canvas-mermaid" />
      ) : null}
      <ul className="agent-canvas-transcript">
        {(canvas.transcript || []).slice(-8).map((row, i) => (
          <li
            key={`${row.step}-${i}`}
            className={pair.agentId && row.agent_id === pair.agentId ? 'is-highlighted' : ''}
          >
            <strong>{row.label}</strong>
            <span className={`agent-canvas-st ${STATUS_CLASS[row.status] || ''}`}>{row.status}</span>
            {row.body ? <p>{row.body}</p> : null}
          </li>
        ))}
      </ul>
      <p className="agent-canvas-meta">
        编排：{canvas.engine || 'langgraph'}
        {canvas.active_agent ? ` · 当前 ${canvas.active_agent}` : ''}
        {pair.langgraphId ? ` · 选中 ${pair.langgraphId}` : ''}
      </p>
    </div>
  )
}
