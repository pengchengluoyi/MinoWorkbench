import { Bot, TriangleAlert } from 'lucide-react'
import { Skeleton, StatusPill } from '@/ui'
import type { AssistantStatus } from '@/api/assistant'
import { channelLabel, fmtAgo } from './format'
import { useAssistantStatus } from './queries'
import { QueryProblem } from './AssistantNotReady'

/** 顶部状态条：助手在不在线、谁持有、各渠道连没连。离线时直接说该找谁。 */
export function StatusBar() {
  const q = useAssistantStatus()
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 1 }} title={false} />
  if (q.isError) {
    return <div className="w-surface-card"><QueryProblem error={q.error} what="助手状态" onRetry={() => void q.refetch()} /></div>
  }
  const s = q.data as AssistantStatus
  const nodes = s.im_nodes ?? []
  const holders = nodes.map((n) => n.name || n.node_id)

  let tone: 'pass' | 'warn' | 'fail' = 'pass'
  let headline = '助手在线'
  let detail = ''
  if (!s.enabled) {
    tone = 'warn'; headline = '助手已停用'; detail = '在「接入与默认值」里打开「启用助手」后，IM 和 MCP 才会响应。'
  } else if (!s.online) {
    tone = 'fail'; headline = '助手离线，请联系节点管理员'
    detail = holders.length ? `持有对话渠道的节点：${holders.join('、')}。` : '当前没有任何节点持有对话渠道。'
  } else if (!nodes.length) {
    tone = 'warn'; detail = '还没有节点持有对话渠道，IM 暂不可用（MCP 不受影响）。管理员可在「Scout 节点 → 接入 → 对话」配置。'
  }

  const color = tone === 'pass' ? 'var(--w-pass)' : tone === 'warn' ? 'var(--w-warn)' : 'var(--w-fail)'
  const bg = tone === 'pass' ? 'var(--w-pass-bg)' : tone === 'warn' ? 'var(--w-warn-bg)' : 'var(--w-fail-bg)'
  const Icon = tone === 'pass' ? Bot : TriangleAlert

  return (
    <section role="status" style={{ border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', background: 'var(--w-surface)', overflow: 'hidden' }}>
      <div className="flex items-center gap-3" style={{ padding: '10px 14px', background: bg, color }}>
        <Icon size={18} />
        <strong style={{ fontSize: 'var(--w-font-title)' }}>{headline}</strong>
        {detail ? <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 600 }}>{detail}</span> : null}
      </div>
      {nodes.length ? (
        <div className="flex flex-col" style={{ padding: '8px 14px', gap: 6 }}>
          {nodes.map((n) => (
            <div key={n.node_id} className="flex flex-wrap items-center gap-3" style={{ fontSize: 'var(--w-font-sm)' }}>
              <span style={{ fontWeight: 650, minWidth: 120 }}>{n.name || n.node_id}</span>
              <StatusPill status={n.alive ? 'pass' : 'fail'}>{n.alive ? '节点在线' : '节点离线'}</StatusPill>
              {(n.channels ?? []).length ? n.channels.map((c) => (
                <span key={c.channel} className="inline-flex items-center gap-1.5">
                  <StatusPill status={c.connected ? 'pass' : 'warn'}>{channelLabel(c.channel)}{c.connected ? ' 已连接' : ' 未连接'}</StatusPill>
                  <span style={{ color: 'var(--w-text-quaternary)' }}>最后消息 {fmtAgo(c.last_message_at)}</span>
                </span>
              )) : <span style={{ color: 'var(--w-text-quaternary)' }}>没有对话渠道</span>}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
