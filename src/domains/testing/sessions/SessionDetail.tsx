import { useEffect, useMemo, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Segmented, Select, Skeleton, StatusPill, errText, toStatusKind, useFeedback } from '@/ui'
import {
  getSessionEventsPage,
  type LlmCall, type SessionEvent, type SessionTurn,
} from '@/api/sessions'
import { useSessionDetail } from './queries'

const EVENT_LABEL: Record<string, string> = {
  'resource/transition': '资源转移',
  'session/start': '会话开始',
  'session/end': '会话结束',
  'session/attribution': '终态归因',
  'contract/blocked': '业务前置阻塞',
  'stream/emit': '流式步骤',
  'assert/vision': '逐项看图验收',
  'orchestrator/blocked': '能力阻塞',
  'progress/stop': '无进展停止',
}

type CheckpointScope = {
  point_id?: string
  passed?: boolean
  evidence_scope?: string
  hidden_content_verified?: boolean
}

type Attribution = {
  first_blocker?: { reason_code?: string; capability_id?: string; turn?: number }
  latest_error?: { error_kind?: string; capability_id?: string; turn?: number }
  stop_reason?: { status?: string; kind?: string }
}

const checkpointScopes = (event: SessionEvent | null): CheckpointScope[] => {
  if (event?.type !== 'assert/vision' || !event.payload || typeof event.payload !== 'object') return []
  const rows = (event.payload as { checkpoint_results?: unknown }).checkpoint_results
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') as CheckpointScope[] : []
}

const scopeLabel = (row: CheckpointScope) => {
  if (!row.passed) return '未通过'
  if (row.evidence_scope === 'visible_partial') return '通过（仅可见部分，隐藏内容未验证）'
  if (row.evidence_scope === 'visible_full') return '通过（完整可见）'
  return '验证范围未知'
}

const clip = (value: unknown, max = 160) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '')
  return text.length > max ? `${text.slice(0, max)}…` : text
}

const turnStatus = (t: SessionTurn) => t.outcome_status || t.think?.status || ''

const turnTitle = (t: SessionTurn) => {
  const bits = [`回合 ${t.turn ?? '?'}`, t.phase || '—']
  const cap = t.outcome_cap || t.think?.capability_id
  const st = turnStatus(t)
  if (cap) bits.push(cap)
  if (st) bits.push(st)
  return bits.join(' · ')
}

/**
 * 单个 session 的真源：回合、原始事件、LLM 调用。
 * Eval / 回放 / 分叉留在契约的「不做」里，这一版先把排查路径打通。
 */
export function SessionDetail({ sessionId }: { sessionId: string }) {
  const feedback = useFeedback()
  const detail = useSessionDetail(sessionId)
  const [view, setView] = useState<'turns' | 'events' | 'llm'>('turns')
  const [typeFilter, setTypeFilter] = useState('')
  const [picked, setPicked] = useState<SessionEvent | null>(null)
  const [more, setMore] = useState<SessionEvent[]>([])
  const [moreBusy, setMoreBusy] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [eventTotal, setEventTotal] = useState(0)

  useEffect(() => {
    setMore([])
    setPicked(null)
    setTypeFilter('')
    setHasMore(Boolean(detail.data?.hasMore))
    setEventTotal(detail.data?.eventTotal || 0)
  }, [sessionId, detail.data])

  const events = useMemo(
    () => [...(detail.data?.events || []), ...more],
    [detail.data?.events, more],
  )
  const filtered = typeFilter ? events.filter((e) => e.type === typeFilter) : events
  const types = useMemo(
    () => [...new Set(events.map((e) => e.type).filter(Boolean))] as string[],
    [events],
  )
  const attribution = [...events].reverse().find((e) => e.type === 'session/attribution')?.payload as Attribution | undefined

  if (detail.isLoading) return <Skeleton active paragraph={{ rows: 6 }} title={{ width: 180 }} />

  if (detail.isError) {
    return (
      <EmptyState
        icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
        title="读不到这个 session"
        hint={errText(detail.error, '确认 session_id 还在，或 Nexus 可达。')}
      />
    )
  }

  const data = detail.data
  if (!data || (!data.meta && !data.events.length && !data.turns.length)) {
    return <EmptyState title="没有这个 session" hint="列表里点一行，或核对粘贴的 session_id。" />
  }

  const loadMore = async () => {
    const last = events[events.length - 1]
    const fromSeq = last?.seq != null ? last.seq + 1 : 0
    setMoreBusy(true)
    try {
      const page = await getSessionEventsPage(sessionId, fromSeq)
      setMore((prev) => [...prev, ...page.events])
      setHasMore(page.hasMore)
      if (page.total) setEventTotal(page.total)
    } catch (e) {
      feedback.fail(errText(e, '加载更多事件失败'))
    } finally {
      setMoreBusy(false)
    }
  }

  const jumpFail = () => {
    const hit = data.turns.find((t) => toStatusKind(turnStatus(t)) === 'fail')
    if (hit == null || hit.turn == null) return
    setView('turns')
    document.getElementById(`turn-${hit.turn}`)?.scrollIntoView({ block: 'nearest' })
  }

  const m = data.metrics

  return (
    <div className="flex flex-col" style={{ gap: 'var(--w-space-3)', marginTop: 'var(--w-space-3)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={toStatusKind(data.meta?.status)}>{data.meta?.status || '未知'}</StatusPill>
        <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
          {eventTotal || events.length} 条事件
          {data.meta?.case_id ? ` · 用例 ${data.meta.case_id}` : ''}
          {data.meta?.run_id ? ` · 批次 ${data.meta.run_id}` : ''}
        </span>
        {data.turns.some((t) => toStatusKind(turnStatus(t)) === 'fail') && (
          <Button size="small" onClick={jumpFail}>跳到失败回合</Button>
        )}
      </div>

      {m && (
        <div className="flex flex-wrap gap-2" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>
          <Metric label={`LLM ${m.llm_calls ?? 0} 次 / ${m.llm_tokens ?? 0} tokens`} />
          <Metric label={`工具 ${m.tool_calls ?? 0} 次`} />
          {!!m.tool_failures && <Metric label={`失败 ${m.tool_failures}`} />}
          {!!m.recovery_hits && <Metric label={`恢复 ${m.recovery_hits}`} />}
          {!!m.guard_blocks && <Metric label={`拦截 ${m.guard_blocks}`} />}
        </div>
      )}

      {data.meta?.summary && (
        <p style={{ margin: 0, color: 'var(--w-text-secondary)', fontSize: 'var(--w-font-sm)' }}>{data.meta.summary}</p>
      )}
      {attribution && (
        <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' }}>
          终止类别：{attribution.stop_reason?.kind || '未分类'}
          {attribution.first_blocker && ` · 首个阻塞：${attribution.first_blocker.reason_code || 'blocked'}（回合 ${attribution.first_blocker.turn ?? '?'}）`}
          {attribution.latest_error && ` · 最近错误：${attribution.latest_error.error_kind || '未知'}（回合 ${attribution.latest_error.turn ?? '?'}）`}
        </div>
      )}

      <Segmented
        size="small"
        value={view}
        onChange={(v) => setView(v as typeof view)}
        options={[
          { label: `回合 ${data.turns.length}`, value: 'turns' },
          { label: `事件 ${events.length}`, value: 'events' },
          { label: `LLM ${data.llm.length}`, value: 'llm' },
        ]}
      />

      {view === 'turns' && (
        <div className="flex flex-col" style={{ gap: 6 }}>
          {!data.turns.length && <EmptyState title="这个 session 没有回合" />}
          {data.turns.map((t) => (
            <article
              id={t.turn != null ? `turn-${t.turn}` : undefined}
              key={`${t.turn}-${t.phase}`}
              style={{
                padding: '8px 10px',
                borderRadius: 'var(--w-radius-sm)',
                border: '1px solid var(--w-border)',
                background: 'var(--w-surface)',
              }}
            >
              <div className="flex items-center gap-2">
                <StatusPill status={toStatusKind(turnStatus(t))}>{turnStatus(t) || '未知'}</StatusPill>
                <strong style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>{turnTitle(t)}</strong>
              </div>
              {!!t.tools?.length && (
                <div className="w-mono" style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>
                  {t.tools.map((tool, i) => `${tool.kind || 'tool'}:${tool.name || tool.tool || i}`).join('  ')}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {view === 'events' && (
        <div className="flex gap-3" style={{ minHeight: 0 }}>
          <div className="flex-1 min-w-0">
            <Select
              allowClear
              placeholder="事件类型"
              size="small"
              style={{ width: 180, marginBottom: 8 }}
              value={typeFilter || undefined}
              onChange={(v) => setTypeFilter(v || '')}
              options={types.map((t) => ({ value: t, label: EVENT_LABEL[t] || t }))}
            />
            {!filtered.length && <EmptyState title="没有符合筛选的事件" />}
            {filtered.map((e) => (
              <button
                key={`${e.seq}-${e.type}`}
                type="button"
                className="w-hit flex w-full items-center gap-2"
                data-active={picked?.seq === e.seq ? 'true' : 'false'}
                onClick={() => setPicked(e)}
                style={{
                  padding: '6px 8px',
                  border: 'none',
                  borderBottom: '1px solid var(--w-border)',
                  background: picked?.seq === e.seq ? 'var(--w-fill)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 'var(--w-font-sm)',
                }}
              >
                <span className="w-mono" style={{ width: 36, color: 'var(--w-text-quaternary)' }}>{e.seq ?? ''}</span>
                <span style={{ width: 88, fontWeight: 650 }}>{EVENT_LABEL[e.type || ''] || e.type || '—'}</span>
                <span className="truncate" style={{ flex: 1, color: 'var(--w-text-tertiary)' }}>
                  {checkpointScopes(e).length
                    ? checkpointScopes(e).map((row) => `${row.point_id || '?'} ${scopeLabel(row)}`).join(' · ')
                    : clip(e.payload)}
                </span>
              </button>
            ))}
            {hasMore && (
              <Button size="small" style={{ marginTop: 8 }} loading={moreBusy} onClick={() => void loadMore()}>
                继续加载（{events.length}/{eventTotal || '?'}）
              </Button>
            )}
          </div>
          <aside
            className="shrink-0"
            style={{
              width: 280,
              padding: 10,
              borderRadius: 'var(--w-radius-sm)',
              border: '1px solid var(--w-border)',
              background: 'var(--w-surface-subtle)',
              maxHeight: 420,
              overflow: 'auto',
            }}
          >
            {picked ? (
              <>
                <strong style={{ fontSize: 'var(--w-font-sm)' }}>#{picked.seq} {picked.type}</strong>
                {checkpointScopes(picked).map((row) => (
                  <div key={row.point_id} style={{ marginTop: 5, fontSize: 'var(--w-font-sm)' }}>
                    {row.point_id || '检查点'}：{scopeLabel(row)}
                  </div>
                ))}
                <div style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', margin: '4px 0 8px' }}>
                  回合 {picked.turn ?? '—'} · {picked.phase || '—'}
                </div>
                <pre className="w-mono" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 'var(--w-font-meta)' }}>
                  {clip(picked.payload, 4000)}
                </pre>
              </>
            ) : (
              <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>点一条事件看载荷</span>
            )}
          </aside>
        </div>
      )}

      {view === 'llm' && (
        <LlmTable rows={data.llm} />
      )}
    </div>
  )
}

function Metric({ label }: { label: string }) {
  return (
    <span style={{
      padding: '2px 8px',
      borderRadius: 'var(--w-radius-pill)',
      background: 'var(--w-fill)',
    }}
    >
      {label}
    </span>
  )
}

function LlmTable({ rows }: { rows: LlmCall[] }) {
  if (!rows.length) return <EmptyState title="没有 LLM 调用" />
  return (
    <div>
      {rows.map((row, i) => (
        <div
          key={`${row.turn}-${row.job}-${i}`}
          className="flex items-center gap-3"
          style={{ padding: '7px 0', borderBottom: '1px solid var(--w-border)', fontSize: 'var(--w-font-sm)' }}
        >
          <span className="w-mono" style={{ width: 36, color: 'var(--w-text-quaternary)' }}>{row.turn ?? ''}</span>
          <span style={{ width: 120, fontWeight: 650 }}>{row.job || '—'}</span>
          <span className="truncate" style={{ flex: 1 }}>{row.model || '—'}</span>
          <StatusPill status={toStatusKind(row.status)}>{row.status || '—'}</StatusPill>
          <span className="w-mono" style={{ width: 72, textAlign: 'right', color: 'var(--w-text-tertiary)' }}>
            {row.total_tokens ?? '—'}
          </span>
          <span className="w-mono" style={{ width: 64, textAlign: 'right', color: 'var(--w-text-quaternary)' }}>
            {row.elapsed_ms != null ? `${row.elapsed_ms}ms` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}
