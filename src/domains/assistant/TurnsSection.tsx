import { useSearchParams } from 'react-router-dom'
import { Segmented, StatusPill, DataTable, type DataColumn } from '@/ui'
import type { AssistantTurn } from '@/api/assistant'
import { isAssistantNotReady } from '@/api/assistant'
import { useUrlState } from '@/hooks/useUrlState'
import { channelLabel, fmtMs, fmtTime, fmtTokens, surfaceLabel, turnStatus } from './format'
import { useTurns } from './queries'
import { TurnDrawer } from './TurnDrawer'
import { QueryProblem } from './AssistantNotReady'


const columns: DataColumn<AssistantTurn>[] = [
  { key: 'created_at', title: '时间', width: 160, alwaysVisible: true, render: (_: unknown, r) => <span className="w-mono">{fmtTime(r.created_at)}</span> },
  {
    key: 'surface', title: '来源', width: 120,
    render: (_: unknown, r) => <span>{surfaceLabel(r.surface)}{r.surface === 'im' && r.channel ? ` · ${channelLabel(r.channel)}` : ''}</span>,
  },
  { key: 'intent', title: '意图', ellipsis: true, alwaysVisible: true, render: (_: unknown, r) => r.intent || '无' },
  { key: 'status', title: '状态', width: 90, render: (_: unknown, r) => { const s = turnStatus(r.status); return <StatusPill status={s.kind}>{s.text}</StatusPill> } },
  { key: 'elapsed', title: '耗时', width: 80, render: (_: unknown, r) => fmtMs(r.elapsed_ms) },
  { key: 'tokens', title: 'Tokens · 输入 / 输出', width: 180, render: (_: unknown, r) => <span className="w-mono" style={{ whiteSpace: 'nowrap' }}>{fmtTokens(r.prompt_tokens, r.completion_tokens, r.detail?.usage_status)}</span> },
]

/** 会话与轨迹。只存调用轨迹，原话不在这里，点开详情再从节点现取。 */
export function TurnsSection({ nodeId }: { nodeId?: string }) {
  const [surface] = useUrlState<'' | 'im' | 'mcp'>('surface', '', ['', 'im', 'mcp'])
  const [pageRaw] = useUrlState<string>('turnPage', '1')
  const [sizeRaw] = useUrlState<string>('turnSize', '20')
  const page = Math.min(100000, Math.max(1, Math.trunc(Number(pageRaw)) || 1))
  const size = [20, 50, 100, 200].includes(Number(sizeRaw)) ? Number(sizeRaw) : 20
  const [, setParams] = useSearchParams()
  const [openId, setOpenId] = useUrlState<string>('turn', '')
  const q = useTurns(page, size, surface, nodeId)

  if (q.isError && isAssistantNotReady(q.error)) {
    return <div className="w-surface-card"><QueryProblem error={q.error} what="会话" onRetry={() => void q.refetch()} /></div>
  }

  return (
    <>
      <DataTable<AssistantTurn>
        viewId="assistant.turns"
        rowKey={(r) => r.turn_id}
        dataSource={q.data?.items}
        loading={q.isLoading}
        error={q.error}
        columns={columns}
        activeRowKey={openId}
        onRetry={() => void q.refetch()}
        onRowClick={(r) => setOpenId(r.turn_id)}
        emptyTitle="还没有会话记录"
        emptyHint="在 IM 里对机器人说一句话，或用 MCP 调一次工具，这里就会出现一条轨迹。"
        toolbar={(
          <Segmented
            value={surface}
            onChange={(v) => setParams(previous => {
              const next = new URLSearchParams(previous)
              if (v) next.set('surface', String(v))
              else next.delete('surface')
              next.delete('turnPage')
              next.delete('turn')
              return next
            })}
            options={[{ label: '全部', value: '' }, { label: 'IM', value: 'im' }, { label: 'MCP', value: 'mcp' }]}
          />
        )}
        pagination={{ page, pageSize: size, total: q.data?.total ?? 0, onChange: (p, s) => setParams(previous => {
          const next = new URLSearchParams(previous)
          next.set('turnPage', String(p)); next.set('turnSize', String(s))
          return next
        }) }}
      />
      <TurnDrawer turnId={openId} onClose={() => setOpenId('')} />
    </>
  )
}
