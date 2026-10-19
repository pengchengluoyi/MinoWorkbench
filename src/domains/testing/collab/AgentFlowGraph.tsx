import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { CollabAgentCanvas, CollabAgentNode } from '@/api/collab'
import { loadTopicNodeLayout, saveTopicNodePosition } from './agentCanvasLayout'

type AgentNodeData = {
  label: string
  status: string
  snippet?: string
  kind?: string
  active?: boolean
  highlighted?: boolean
}

const STATUS_BORDER: Record<string, string> = {
  ok: '#52c41a',
  running: '#1677ff',
  error: '#ff4d4f',
  blocked: '#ff4d4f',
  idle: '#d9d9d9',
  pending: '#d48806',
}

function AgentFlowNode({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  const border = STATUS_BORDER[data.status] || STATUS_BORDER.idle
  return (
    <div
      className={`agent-flow-node${selected ? ' is-selected' : ''}${data.active ? ' is-active' : ''}${
        data.highlighted ? ' is-highlighted' : ''
      }`}
      style={{ borderColor: border }}
      title={data.snippet || data.label}
    >
      <Handle type="target" position={Position.Left} />
      <span className="agent-flow-node-kind">{data.kind === 'leader' ? '协调' : '成员'}</span>
      <strong>{data.label}</strong>
      <span className="agent-flow-node-st">{data.status}</span>
      {data.snippet ? <p className="agent-flow-node-snippet">{data.snippet}</p> : null}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { agent: memo(AgentFlowNode) }

function toFlowNodes(
  canvas: CollabAgentCanvas,
  saved: Record<string, { x: number; y: number }>,
  highlightAgentId: string,
): Node<AgentNodeData>[] {
  const active = canvas.active_agent || ''
  return (canvas.nodes || []).map((n: CollabAgentNode, i) => {
    const fallback = n.position || { x: i * 200, y: n.kind === 'leader' ? 0 : 48 }
    const pos = saved[n.id] || fallback
    return {
      id: n.id,
      type: 'agent',
      position: { x: pos.x, y: pos.y },
      data: {
        label: n.label,
        status: n.status,
        snippet: n.snippet,
        kind: n.kind,
        active: n.id === active,
        highlighted: Boolean(highlightAgentId && n.id === highlightAgentId),
      },
      draggable: true,
    }
  })
}

function toFlowEdges(canvas: CollabAgentCanvas, highlightAgentId: string): Edge[] {
  return (canvas.edges || []).map((e, i) => {
    const touch =
      Boolean(highlightAgentId) && (e.from === highlightAgentId || e.to === highlightAgentId)
    return {
      id: `e-${e.from}-${e.to}-${i}`,
      source: e.from,
      target: e.to,
      animated: canvas.active_agent === e.to || touch,
      style: touch ? { stroke: '#1677ff', strokeWidth: 2 } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }
  })
}

export function AgentFlowGraph({
  canvas,
  projectId,
  topicId,
  highlightAgentId,
  onSelectAgent,
}: {
  canvas: CollabAgentCanvas
  projectId: string
  topicId: string
  highlightAgentId: string
  onSelectAgent: (agentId: string) => void
}) {
  const savedLayout = useMemo(
    () => loadTopicNodeLayout(projectId, topicId),
    [projectId, topicId],
  )
  const layoutRef = useRef(savedLayout)
  layoutRef.current = savedLayout

  const initialNodes = useMemo(
    () => toFlowNodes(canvas, savedLayout, highlightAgentId),
    [canvas, savedLayout, highlightAgentId],
  )
  const initialEdges = useMemo(
    () => toFlowEdges(canvas, highlightAgentId),
    [canvas, highlightAgentId],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    setNodes(toFlowNodes(canvas, layoutRef.current, highlightAgentId))
    setEdges(toFlowEdges(canvas, highlightAgentId))
  }, [canvas, highlightAgentId, setNodes, setEdges])

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (!node.id) return
      saveTopicNodePosition(projectId, topicId, node.id, node.position)
      layoutRef.current = {
        ...layoutRef.current,
        [node.id]: { x: node.position.x, y: node.position.y },
      }
    },
    [projectId, topicId],
  )

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.id) onSelectAgent(node.id)
    },
    [onSelectAgent],
  )

  return (
    <div className="agent-flow-wrap">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.35}
        maxZoom={1.4}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} />
        <Controls showInteractive={false} />
        <MiniMap zoomable pannable nodeStrokeWidth={2} />
      </ReactFlow>
    </div>
  )
}
