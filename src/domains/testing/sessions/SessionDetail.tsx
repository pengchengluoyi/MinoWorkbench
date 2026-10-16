import { mergeSessionEvents } from './sessionRecords'
import { redactedText } from '@/lib/redact'
import { copyToClipboard } from '@/lib/clipboard'
import { useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Search, TriangleAlert } from 'lucide-react'
import { Button, Checkbox, EmptyState, Input, Segmented, Select, Skeleton, StatusPill, errText, toStatusKind, useFeedback } from '@/ui'
import type { SessionEvent, SessionTurn } from '@/api/sessions'
import { isExecutionActive, isExecutionTerminal } from '@/lib/liveQuery'
import { sessionKeys, useSessionDetail } from './queries'
import { useSession } from '@/lib/session'
import { nextEventCursor, readEventHistory } from './sessionHistory'
import { reportedCount, tokenUsage } from './sessionUsage'
import { inStepScope, inTurnScope, knownTurns, linkedTurns, turnOf, type ExecutionEntry, type ExecutionScope } from './executionLinks'
import { DesktopEvidence } from './DesktopEvidence'
import { V5Evidence } from './V5Evidence'
import { RawParameters, SessionModelCalls, SessionTurns, type TurnFocus } from './SessionLogViews'
import './SessionDetail.css'

const EVENT_LABEL: Record<string, string> = {
  'resource/transition': '资源转移', 'session/start': '会话开始', 'session/end': '会话结束',
  'session/attribution': '终态归因', 'contract/blocked': '业务前置阻塞', 'stream/emit': '流式步骤',
  'assert/dom': '逐项 DOM 验收', 'assert/vision': '逐项看图验收', 'orchestrator/blocked': '能力阻塞', 'progress/stop': '无进展停止',
  'observe/screen': '屏幕观察', 'tool/call': '调用工具', 'tool/result': '工具结果',
  'llm/request': '模型请求', 'llm/response': '模型响应',
}

type CheckpointScope = {
  point_id?: string; passed?: boolean; evidence_scope?: string; hidden_content_verified?: boolean
  error_kind?: string; text_match?: string; observed_text?: string; observed_language?: string; evidence?: string
}
type Attribution = {
  first_blocker?: { reason_code?: string; capability_id?: string; turn?: number }
  latest_error?: { error_kind?: string; capability_id?: string; turn?: number }
  stop_reason?: { status?: string; kind?: string }
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}
const payloadText = redactedText
const checkpointScopes = (event: SessionEvent | undefined): CheckpointScope[] => {
  if (event?.type !== 'assert/vision' && event?.type !== 'assert/dom') return []
  const rows = record(event.payload).checkpoint_results
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row === 'object') as CheckpointScope[] : []
}
const scopeLabel = (row: CheckpointScope) => {
  if (row.error_kind) return '未核验'
  if (row.text_match === 'intent') return row.passed ? '通过（多语言意图一致）' : '未通过（意图或明确语言要求不符）'
  if (row.text_match === 'exact') return row.passed ? '通过（指定文案匹配）' : '未通过（指定文案不符）'
  if (!row.passed) return '未通过'
  if (row.evidence_scope === 'visible_partial') return '通过（仅可见部分，隐藏内容未验证）'
  if (row.evidence_scope === 'visible_full') return '通过（完整可见）'
  return '验证范围未知'
}
const eventKind = (event: SessionEvent) => {
  const payload = record(event.payload)
  if (/blocked|progress\/stop/.test(event.type || '') || /blocked/.test(String(payload.result_status || payload.status || payload.outcome_status || ''))) return 'warn'
  if (/error|fail/.test(event.type || '') || payload.error || payload.passed === false || payload.success === false || checkpointScopes(event).some((row) => row.passed === false)) return 'fail'
  return toStatusKind(payload.result_status || payload.status || payload.outcome_status)
}
const isIssue = (event: SessionEvent) => ['fail', 'warn'].includes(eventKind(event))
const eventSummary = (event: SessionEvent) => {
  const scopes = checkpointScopes(event)
  if (scopes.length) return scopes.map((row) => `${row.point_id || '检查点'} ${scopeLabel(row)}`).join(' · ')
  const payload = record(event.payload)
  const message = ['message', 'summary', 'thought', 'reason', 'error', 'blocked_reason', 'text', 'capability_id', 'tool', 'name'].map((key) => payload[key]).find((value) => typeof value === 'string' && value)
  const text = typeof message === 'string' ? message : payloadText(event.payload)
  const safeText = redactedText(text)
  return safeText && safeText !== '""' ? safeText.length > 240 ? `${safeText.slice(0, 240)}…` : safeText : '无附加内容'
}
const statusLabel = (raw: unknown) => {
  const kind = /blocked/.test(String(raw || '')) ? 'warn' : toStatusKind(raw)
  return kind === 'muted' ? String(raw || '未标记') : { pass: '通过', fail: '失败', warn: '异常', cancel: '已取消', running: '执行中' }[kind]
}
const timeLabel = (raw?: string) => {
  const date = raw ? new Date(raw) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleTimeString('zh-CN', { hour12: false }) : '—'
}
const turnStatus = (turn: SessionTurn) => turn.outcome_status || turn.think?.status || ''

export function SessionDetail({ sessionId, live = false, entry, onReturn }: { sessionId: string; live?: boolean; entry?: ExecutionEntry | null; onReturn?: () => void }) {
  const feedback = useFeedback()
  const queryClient = useQueryClient()
  const detail = useSessionDetail(sessionId, live)
  const owner = useSession(state => state.user?.user_id || '')
  const historyRequest = useRef<AbortController | null>(null)
  const [historyMessage, setHistoryMessage] = useState('')
  const activeSession = useRef(sessionId)
  activeSession.current = sessionId
  const [scope, setScope] = useState<ExecutionScope | null>(entry?.scope || null)
  const [params, setParams] = useSearchParams()
  const pendingParams = useRef<URLSearchParams | null>(null)
  useEffect(() => { pendingParams.current = null }, [params])
  const setLog = (key: string, value: string) => { const next = new URLSearchParams(pendingParams.current || params); if (value) next.set(key, value); else next.delete(key); pendingParams.current = next; setParams(next, { replace: key === 'logType' }) }
  const turnScope = params.get('logTurn') || ''
  const setTurnScope = (value: string) => setLog('logTurn', value)
  const [turnFocus, setTurnFocus] = useState<TurnFocus | null>(null)
  const view = (['turns', 'events', 'llm'].includes(params.get('logView') || '') ? params.get('logView') : 'turns') as 'turns' | 'events' | 'llm'
  const setView = (value: 'turns' | 'events' | 'llm') => setLog('logView', value)
  const typeFilter = params.get('logType') || ''
  const setTypeFilter = (value: string) => setLog('logType', value)
  const [search, setSearch] = useState('')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [picked, setPicked] = useState<SessionEvent | null>(null)
  const [moreBusy, setMoreBusy] = useState(false)

  useEffect(() => {
    historyRequest.current?.abort()
    setScope(null)
    setPicked(null)
    setSearch('')
    setOnlyIssues(false)
    setTurnFocus(null)
    setMoreBusy(false)
    setHistoryMessage('')
    return () => { historyRequest.current?.abort() }
  }, [sessionId, owner])
  useEffect(() => {
    if (!entry) return
    setScope(entry.scope)
    setTurnFocus(null)
    setPicked(null)
    setSearch('')
    setOnlyIssues(false)
  }, [entry])

  const events = useMemo(() => detail.data?.events || [], [detail.data?.events])
  const activeScope = scope?.sessionId === sessionId ? scope : null
  const allRecords = useMemo(() => [...events, ...(detail.data?.turns || []), ...(detail.data?.llm || [])], [events, detail.data?.turns, detail.data?.llm])
  const stepTurns = useMemo(() => activeScope ? linkedTurns(activeScope.stepRef, activeScope.turns, allRecords, sessionId) : [], [activeScope, allRecords, sessionId])
  const scopedEvents = useMemo(() => events.filter((event) => inStepScope(event, activeScope, stepTurns)), [events, activeScope, stepTurns])
  const scopedCalls = useMemo(() => (detail.data?.llm || []).filter((call) => inStepScope(call, activeScope, stepTurns)), [detail.data?.llm, activeScope, stepTurns])
  const scopedTurns = useMemo(() => (detail.data?.turns || []).filter((turn) => inStepScope(turn, activeScope, stepTurns)), [detail.data?.turns, activeScope, stepTurns])
  const scopeTurnIds = useMemo(() => [...new Set([...stepTurns, ...knownTurns([...scopedEvents, ...scopedCalls, ...scopedTurns])])].sort((a, b) => a - b), [stepTurns, scopedEvents, scopedCalls, scopedTurns])
  const activeEvents = useMemo(() => scopedEvents.filter((event) => inTurnScope(event, turnScope)), [scopedEvents, turnScope])
  const activeCalls = useMemo(() => scopedCalls.filter((call) => inTurnScope(call, turnScope)), [scopedCalls, turnScope])
  const visibleTurns = useMemo(() => turnScope === 'unassigned' ? scopedTurns.filter((turn) => turnOf(turn) == null) : scopedTurns, [scopedTurns, turnScope])
  const types = useMemo(() => [...new Set(activeEvents.map((event) => event.type).filter(Boolean))] as string[], [activeEvents])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return activeEvents.filter((event) => (!typeFilter || event.type === typeFilter)
      && (!onlyIssues || isIssue(event))
      && (!query || [event.seq, event.type, EVENT_LABEL[event.type || ''], turnOf(event), event.phase, eventSummary(event), payloadText(event.payload)].join(' ').toLowerCase().includes(query)))
  }, [activeEvents, typeFilter, onlyIssues, search])
  const selectedByUrl = params.get('logEvent')
  const selected = filtered.find(event => `${event.seq}:${event.type}` === selectedByUrl) || filtered.find((event) => event === picked || (event.seq != null && event.seq === picked?.seq && event.type === picked.type)) || filtered[0]
  const attribution = [...events].reverse().find((event) => event.type === 'session/attribution')?.payload as Attribution | undefined
  const hasMore = Boolean(detail.data?.hasMore)
  const eventTotal = detail.data?.eventTotal || events.length

  if (detail.isLoading) return <Skeleton active paragraph={{ rows: 6 }} title={{ width: 180 }} />
  if (detail.isError && !detail.data) return <EmptyState icon={<TriangleAlert size={28} style={{ color: 'var(--w-fail)' }} />} title="读取执行日志失败" hint={errText(detail.error, '确认会话仍然存在，或服务可达。')} action={<Button onClick={() => void detail.refetch()}>重试</Button>} />
  const data = detail.data
  if (!data || (!data.sourceErrors.length && !data.meta && !data.events.length && !data.turns.length && !data.llm.length)) return <EmptyState title="暂无执行日志" hint="这次执行还没有可查看的会话记录。" />

  const copyText = async (text: string, label: string) => {
    try {
      await copyToClipboard(text)
      feedback.ok(`已复制${label}`)
    } catch {
      feedback.fail('复制失败，请选中文本手动复制')
    }
  }
  const loadMore = async (all = false) => {
    if (historyRequest.current && !historyRequest.current.signal.aborted) return
    const requestedSession = sessionId
    const key = sessionKeys.detail(requestedSession)
    const controller = new AbortController()
    historyRequest.current = controller
    setMoreBusy(true)
    setHistoryMessage(all ? '正在逐页补读历史，筛选结果会同步更新；每批最多读取50页，可取消。' : '')
    try {
      const result = await readEventHistory({ sessionId: requestedSession, fromSeq: nextEventCursor(events), signal: controller.signal, maxPages: all ? 50 : 1, onPage: page => {
        if (activeSession.current !== requestedSession || useSession.getState().user?.user_id !== owner) { controller.abort(); return }
        queryClient.setQueryData<NonNullable<typeof detail.data>>(key, previous => {
          if (!previous) return previous
          const combined = mergeSessionEvents(previous.events, page.events)
          return { ...previous, events: combined, hasMore: page.hasMore, eventTotal: page.total || previous.eventTotal }
        })
        if (all) setHistoryMessage(`正在补读历史 · 已读取到事件序号 ${nextEventCursor(page.events) - 1}，匹配结果同步更新。`)
      } })
      if (activeSession.current === requestedSession && !controller.signal.aborted) setHistoryMessage(result.hasMore ? '本批历史已读取，仍有后续记录，可继续检索。' : '已读完接口当前可返回的事件历史；运行中的新增记录仍会继续到达。')
    } catch (error) {
      if (activeSession.current === requestedSession && !controller.signal.aborted) { setHistoryMessage(errText(error, '历史读取失败，已读取内容保留，可以继续检索。')); feedback.fail(errText(error, '加载更多事件失败')) }
    } finally {
      if (historyRequest.current === controller) { historyRequest.current = null; setMoreBusy(false) }
    }
  }
  const cancelHistory = () => { historyRequest.current?.abort(); setHistoryMessage('已取消历史检索，已加载事件与筛选结果保留。') }
  const changeTurnScope = (value: string) => {
    if (value !== turnScope) { setPicked(null); setTypeFilter(''); setSearch(''); setOnlyIssues(false) }
    setTurnScope(value)
  }
  const focusTurn = (turn: number, nextView: typeof view = 'turns') => {
    const row = data.turns.find((row) => turnOf(row) === turn)
    changeTurnScope(String(turn))
    setTurnFocus((previous) => ({ turn, phase: row?.phase, request: (previous?.request || 0) + 1 }))
    setView(nextView)
  }
  const failedTurn = scopedTurns.find((turn) => toStatusKind(turnStatus(turn)) === 'fail')
  const jumpFail = () => { const turn = turnOf(failedTurn); if (turn != null) focusTurn(turn) }
  const clearTurn = () => { changeTurnScope(''); setTurnFocus(null); setView('turns') }
  const clearScope = () => { setScope(null); clearTurn() }
  const returnToTurns = () => setView('turns')
  const unrelatedCount = scopedEvents.filter((event) => turnOf(event) == null).length + scopedCalls.filter((call) => turnOf(call) == null).length
  const metrics = data.metrics
  const tokens = tokenUsage(metrics?.llm_tokens, data.llm, data.sourceErrors.some(item => item.source === '模型调用'))

  return (
    <div className="session-detail">
      {detail.isError || data.sourceErrors.length ? <div className="session-source-alert" role="alert">
        {detail.isError ? <span>日志刷新失败，保留上次读取的内容。{errText(detail.error)}</span> : data.sourceErrors.map((item) => <span key={item.source}>{item.source}读取失败：{errText(item.error)}</span>)}
        <Button size="small" loading={detail.isFetching} onClick={() => void detail.refetch()}>重试缺失数据</Button>
      </div> : null}
      {data.meta && <V5Evidence meta={data.meta} events={events} hasMore={hasMore} loadMore={() => void loadMore()} />}
      <p style={{ margin: 0, color: 'var(--w-text-tertiary)' }}>当前视图和回合范围可通过地址复现；关键词检索已加载记录及脱敏参数，可按需补读后续历史。</p>
      <section className="session-overview" aria-label="执行概览">
        <div className="session-overview-heading">
          <h2>执行日志</h2>
          <StatusPill status={toStatusKind(data.meta?.status)}>{statusLabel(data.meta?.status)}</StatusPill>
          <span className="session-id w-mono" title={sessionId}>{sessionId}</span>
          <Button size="small" type="text" aria-label="复制会话 ID" icon={<Copy size={13} />} onClick={() => void copyText(sessionId, '会话 ID')} />
          {failedTurn && <Button size="small" className="session-jump" icon={<TriangleAlert size={13} />} onClick={jumpFail}>定位失败回合</Button>}
        </div>
        <div className="session-metrics">
          <Metric label={reportedCount(metrics?.llm_calls) != null ? '模型调用' : '已加载模型调用'} value={reportedCount(metrics?.llm_calls) ?? (data.sourceErrors.some((item) => item.source === '模型调用') ? '未知' : data.llm.length)} unit="次" />
          <Metric label={tokens.partial ? '已加载 Tokens' : 'Tokens'} value={tokens.value} />
          <Metric label={reportedCount(metrics?.tool_calls) != null ? '工具调用' : '已加载工具调用'} value={reportedCount(metrics?.tool_calls) ?? (data.sourceErrors.some((item) => item.source === '回合') || data.turns.some(turn => !Array.isArray(turn.tools)) ? '未知' : data.turns.reduce((sum, turn) => sum + turn.tools!.length, 0))} unit="次" />
          <Metric label="已加载异常事件" value={events.filter(isIssue).length} unit="条" issue />
        </div>
        <div className="session-context">
          <span>事件 {eventTotal || events.length} 条</span>
          {data.meta?.case_id && <span title={data.meta.case_id}>用例 {data.meta.case_id}</span>}
          {data.meta?.run_id && <span title={data.meta.run_id}>批次 {data.meta.run_id}</span>}
          {data.meta?.started_at && <span title={data.meta.started_at}>开始 {timeLabel(data.meta.started_at)}</span>}
          {data.meta?.finished_at && <span title={data.meta.finished_at}>结束 {timeLabel(data.meta.finished_at)}</span>}
          {!!metrics?.tool_failures && <span>工具失败 {metrics.tool_failures} 次</span>}
          {!!metrics?.recovery_hits && <span>恢复 {metrics.recovery_hits} 次</span>}
          {!!metrics?.guard_blocks && <span>拦截 {metrics.guard_blocks} 次</span>}
          {isExecutionActive(data.meta?.status) || (live && !isExecutionTerminal(data.meta?.status) && !data.meta?.finished_at) ? <span role="status">自动更新中</span> : null}
          {!!metrics?.inspection_count && <span>检查 {metrics.inspection_count} 次</span>}
        </div>
        {(data.meta?.summary || attribution) && (
          <details className="session-summary">
            <summary>{data.meta?.summary || '查看执行归因'}</summary>
            {data.meta?.summary && <p>{data.meta.summary}</p>}
            {attribution && <p>
              终止类别：{attribution.stop_reason?.kind || '未分类'}
              {attribution.first_blocker && ` · 首个阻塞：${attribution.first_blocker.reason_code || 'blocked'}（回合 ${attribution.first_blocker.turn ?? '?'}）`}
              {attribution.latest_error && ` · 最近错误：${attribution.latest_error.error_kind || '未知'}（回合 ${attribution.latest_error.turn ?? '?'}）`}
            </p>}
          </details>
        )}
      </section>

      <nav className="session-hierarchy" aria-label="执行层级">
        <div className="session-breadcrumbs">
          {onReturn && <Button size="small" type="text" onClick={onReturn}>返回{entry?.returnLabel || '轨迹'}</Button>}
          <button type="button" onClick={clearScope}>全部日志</button>
          {activeScope && <><span className="session-path-separator">›</span><span className="session-step-label" title={activeScope.title}>{activeScope.stepRef || '执行记录'} · {activeScope.title}</span></>}
          <span className="session-path-separator">›</span><button type="button" onClick={clearTurn}>关联回合 {scopeTurnIds.length}</button>
          {turnScope && <><span className="session-path-separator">›</span><button type="button" onClick={returnToTurns}>{turnScope === 'unassigned' ? '未关联回合' : `回合 ${turnScope}`}</button></>}
          {view !== 'turns' && <><span className="session-path-separator">›</span><strong>{view === 'events' ? '事件记录' : '模型调用'}</strong></>}
        </div>
        <div className="session-scope-controls">
          <Select size="small" aria-label="所属回合" value={turnScope} onChange={(value) => value && value !== 'unassigned' ? focusTurn(Number(value), view) : changeTurnScope(value)} options={[
            { value: '', label: activeScope ? '全部关联回合' : '全部回合' },
            ...scopeTurnIds.map((turn) => ({ value: String(turn), label: `回合 ${turn}` })),
            { value: 'unassigned', label: `未关联回合 ${unrelatedCount}` },
          ]} />
          {hasMore && <Button size="small" loading={moreBusy} onClick={() => void loadMore()}>继续加载事件</Button>}
        </div>
        {activeScope && !stepTurns.length && <p className="session-scope-hint">当前已加载数据没有明确回合关联。{hasMore ? '可继续加载事件，或查看全部日志。' : '可查看直接引用该步骤的记录，或查看全部日志。'}</p>}
      </nav>
      <div className="session-view-tabs">
        <Segmented size="small" value={view} onChange={(value) => setView(value as typeof view)} options={[
          { label: `回合 ${scopeTurnIds.length}`, value: 'turns' },
          { label: `事件流 ${activeEvents.length}`, value: 'events' },
          { label: `模型调用 ${activeCalls.length}`, value: 'llm' },
        ]} />
        {view !== 'turns' && turnScope && <Button size="small" type="text" onClick={returnToTurns}>返回回合</Button>}
      </div>
      <div className="session-view-panel" style={{ display: view === 'events' ? 'flex' : 'none' }}>
      {(
        <div className="session-events">
          <section className="session-event-browser" aria-label="事件列表">
            <div className="session-event-filters">
              <Input size="small" prefix={<Search size={14} />} allowClear aria-label="搜索事件、回合或摘要" placeholder="仅搜索已加载事件、回合或摘要" value={search} onChange={(event) => setSearch(event.target.value)} />
              <div className="session-event-filter-row">
                <Select size="small" allowClear aria-label="事件类型" placeholder="全部事件类型" value={typeFilter || undefined} onChange={(value) => setTypeFilter(value || '')} options={types.map((type) => ({ value: type, label: EVENT_LABEL[type] || type }))} />
                <Checkbox checked={onlyIssues} onChange={(event) => setOnlyIssues(event.target.checked)}>仅异常</Checkbox>
                {hasMore && !moreBusy ? <Button size="small" onClick={() => void loadMore(true)}>检索后续历史</Button> : null}
                {moreBusy ? <Button size="small" onClick={cancelHistory}>取消检索</Button> : null}
              </div>
              <span className="session-history-status" role="status">{historyMessage || (hasMore ? `已加载 ${events.length} / ${eventTotal} 条，匹配结果尚未覆盖全部历史。` : `接口当前事件历史已加载，共 ${events.length} 条。`)}</span>
            </div>
            <div className="session-event-list">
              {!filtered.length && <EmptyState title="没有符合条件的事件" hint={events.length ? '调整搜索或筛选条件；搜索范围为已加载事件。' : '这次执行还没有事件记录。'} />}
              {filtered.map((event, index) => (
                <div key={`${event.seq}-${event.type}-${index}`}>
                {(index === 0 || turnOf(filtered[index - 1]) !== turnOf(event)) && <div className="session-event-group">{turnOf(event) != null ? <button type="button" onClick={() => focusTurn(turnOf(event)!)}>回合 {turnOf(event)}</button> : <span>未关联回合</span>}</div>}
                <button key={`${event.seq}-${event.type}-${index}`} type="button" className="session-event-row" aria-pressed={selected === event} onClick={() => { setPicked(event); setLog('logEvent', `${event.seq}:${event.type}`) }}>
                  <span className="session-event-number w-mono">#{event.seq ?? index + 1}</span>
                  <span className="session-event-content">
                    <span className="session-event-title">{EVENT_LABEL[event.type || ''] || event.type || '未知事件'}{isIssue(event) && <StatusPill status={eventKind(event)}>{eventKind(event) === 'fail' ? '失败' : '异常'}</StatusPill>}</span>
                    <span className="session-event-preview">{eventSummary(event)}</span>
                    <span className="session-event-meta">回合 {turnOf(event) ?? '未关联'} · {event.phase || '阶段未标记'}</span>
                  </span>
                  <time className="session-event-time" dateTime={event.ts} title={event.ts}>{timeLabel(event.ts)}</time>
                </button>
                </div>
              ))}
            </div>
            <footer className="session-event-footer">
              <span>匹配 {filtered.length} / 当前范围 {activeEvents.length} 条 · 已加载 {events.length}/{eventTotal}</span>
              {hasMore && <Button size="small" loading={moreBusy} onClick={() => void loadMore()}>加载更多</Button>}
            </footer>
          </section>
          <aside className="session-event-detail" aria-label="事件详情">
            {selected ? <>
              <header className="session-detail-heading">
                <div><span className="session-eyebrow">事件详情 · #{selected.seq ?? '—'}</span><h3>{EVENT_LABEL[selected.type || ''] || selected.type || '未知事件'}</h3></div>
                <Button size="small" icon={<Copy size={13} />} onClick={() => void copyText(payloadText(selected.payload), '原始参数')}>复制原始参数</Button>
              </header>
              <div className="session-detail-scroll">
                <dl className="session-event-properties">
                  <div><dt>事件类型</dt><dd className="w-mono">{selected.type || '—'}</dd></div>
                  <div><dt>时间</dt><dd title={selected.ts}>{timeLabel(selected.ts)}</dd></div>
                  <div><dt>所属回合</dt><dd>{turnOf(selected) != null ? <button type="button" className="session-inline-link" onClick={() => focusTurn(turnOf(selected)!)}>回合 {turnOf(selected)} · 查看回合</button> : '未关联回合'}</dd></div>
                  <div><dt>阶段</dt><dd>{selected.phase || '—'}</dd></div>
                </dl>
                <section className="session-event-summary"><h4>事件摘要</h4><p>{eventSummary(selected)}</p></section>
                {!!checkpointScopes(selected).length && <section className="session-checkpoints"><h4>检查点验收</h4>{checkpointScopes(selected).map((row, index) => <p key={`${row.point_id}-${index}`}><strong>{row.point_id || '检查点'}</strong><span>{scopeLabel(row)}</span>{row.observed_language && <span>实际语言：{redactedText(row.observed_language)}</span>}{row.observed_text && <span>实际文案：{redactedText(row.observed_text)}</span>}{row.evidence && <span>依据：{redactedText(row.evidence)}</span>}</p>)}</section>}
                <DesktopEvidence event={selected} events={events} />
                <RawParameters key={`${sessionId}-${selected.seq}-${selected.type}`} value={selected.payload} />
              </div>
            </> : <EmptyState title="没有可查看的事件" hint="清除筛选条件，或加载更多事件。" />}
          </aside>
        </div>
      )}
      </div>
      <div className="session-view-panel" style={{ display: view === 'turns' ? 'flex' : 'none' }}>
        <SessionTurns key={sessionId} rows={visibleTurns} focus={turnFocus} events={scopedEvents} calls={scopedCalls} hasMore={hasMore}
          contextKey={activeScope?.key || 'all'} onSelectTurn={(turn) => changeTurnScope(turn == null ? 'unassigned' : String(turn))} onOpenTurn={focusTurn}
          onCopy={(value, label) => void copyText(payloadText(value), label)} />
      </div>
      <div className="session-view-panel" style={{ display: view === 'llm' ? 'flex' : 'none' }}>
        <SessionModelCalls key={sessionId} contextKey={`${activeScope?.key || 'all'}:${turnScope}`} rows={activeCalls} onOpenTurn={(turn) => focusTurn(turn)} onCopy={(value, label) => void copyText(payloadText(value), label)} />
      </div>
    </div>
  )
}

function Metric({ label, value, unit, issue = false }: { label: string; value: number | string; unit?: string; issue?: boolean }) {
  return <div className="session-metric" data-issue={issue && typeof value === 'number' && value > 0}><span>{label}</span><strong>{value.toLocaleString()}<small>{unit}</small></strong></div>
}
