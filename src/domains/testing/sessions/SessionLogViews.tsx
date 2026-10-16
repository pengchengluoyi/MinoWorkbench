import { redactedText } from '@/lib/redact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Copy, Search } from 'lucide-react'
import { Button, EmptyState, Input, Select, StatusPill, toStatusKind, type StatusKind } from '@/ui'
import type { LlmCall, SessionEvent, SessionTurn } from '@/api/sessions'

import { turnOf } from './executionLinks'

type CopyParameters = (value: unknown, label: string) => void
export type TurnFocus = { turn: number; phase?: string; request: number }

const kindOf = (raw: unknown): StatusKind => /blocked/.test(String(raw || '')) ? 'warn' : toStatusKind(raw)
const labelOf = (raw: unknown) => {
  const kind = kindOf(raw)
  return kind === 'muted' ? String(raw || '未标记') : { pass: '通过', fail: '失败', warn: '异常', cancel: '已取消', running: '执行中' }[kind]
}
const numberOf = (value?: number) => value != null && Number.isFinite(value) ? value.toLocaleString() : '—'
const durationOf = (value?: number) => value != null && Number.isFinite(value) ? `${value.toLocaleString()} ms` : '—'
const turnStatus = (turn: SessionTurn) => turn.outcome_status || turn.think?.status
const turnCapability = (turn: SessionTurn) => turn.outcome_cap || turn.think?.capability_id || '能力未标记'
const turnMatches = (turn: SessionTurn, picked: SessionTurn | null) => turn === picked || (picked && turn.turn != null && turn.turn === picked.turn && turn.phase === picked.phase)

function StatusFilter({ value, onChange, name }: { value: string; onChange: (value: string) => void; name: string }) {
  return <Select size="small" allowClear aria-label={name} placeholder="全部状态" value={value || undefined} onChange={(next) => onChange(next || '')} options={[
    { value: 'pass', label: '通过' }, { value: 'fail', label: '失败' }, { value: 'warn', label: '异常 / 阻塞' },
    { value: 'running', label: '执行中' }, { value: 'cancel', label: '已取消' }, { value: 'muted', label: '未标记' },
  ]} />
}

export function RawParameters({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(true)
  return (
    <details className="session-raw" open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>原始参数</summary>
      {expanded && <pre className="w-mono">{redactedText(value)}</pre>}
    </details>
  )
}

export function SessionTurns({ rows, focus, onCopy, events, calls, hasMore, onSelectTurn, onOpenTurn, contextKey }: { rows: SessionTurn[]; focus: TurnFocus | null; onCopy: CopyParameters; events: SessionEvent[]; calls: LlmCall[]; hasMore: boolean; onSelectTurn: (turn: number | undefined) => void; onOpenTurn: (turn: number, view: 'events' | 'llm') => void; contextKey: string }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [picked, setPicked] = useState<SessionTurn | null>(null)
  const selectedRow = useRef<HTMLButtonElement>(null)
  const focusedRequest = useRef(-1)
  useEffect(() => { setSearch(''); setStatus(''); setPicked(null) }, [contextKey])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((turn) => (!status || kindOf(turnStatus(turn)) === status)
      && (!query || [turn.turn, turn.phase, turnCapability(turn), ...(turn.tools?.map((tool) => `${tool.kind || ''} ${tool.name || tool.tool || ''}`) || [])].join(' ').toLowerCase().includes(query)))
  }, [rows, search, status])
  const selected = filtered.find((turn) => turnMatches(turn, picked)) || filtered[0]

  useEffect(() => {
    if (!focus) { focusedRequest.current = -1; return }
    if (focusedRequest.current === focus.request) return
    focusedRequest.current = focus.request
    setSearch('')
    setStatus('')
    setPicked(rows.find((turn) => turn.turn === focus.turn && turn.phase === focus.phase) || rows.find((turn) => turn.turn === focus.turn) || null)
  }, [focus, rows])

  useLayoutEffect(() => {
    if (focus && selected?.turn === focus.turn && selected.phase === focus.phase) selectedRow.current?.scrollIntoView({ block: 'nearest' })
  }, [focus, selected])

  if (!rows.length) return <EmptyState title="暂无执行回合" hint="当前范围没有返回回合摘要，可通过所属回合筛选查看现有事件和模型调用。" />

  return (
    <div className="session-tab-content">
      <div className="session-subview-summary" aria-label="回合概览">
        <span>执行回合 <strong>{rows.length}</strong></span>
        <span>失败 <strong data-status="fail">{rows.filter((turn) => kindOf(turnStatus(turn)) === 'fail').length}</strong></span>
        <span>工具记录 <strong>{rows.reduce((sum, turn) => sum + (turn.tools?.length || 0), 0)}</strong></span>
      </div>
      <div className="session-inspector session-turn-inspector">
        <section className="session-inspector-browser" aria-label="回合列表">
          <div className="session-inspector-filters">
            <Input size="small" allowClear prefix={<Search size={14} />} aria-label="搜索回合、能力或工具" placeholder="搜索回合、能力或工具" value={search} onChange={(event) => setSearch(event.target.value)} />
            <StatusFilter name="回合状态" value={status} onChange={setStatus} />
          </div>
          <div className="session-inspector-list">
            {!filtered.length && <EmptyState title="没有符合条件的回合" hint="调整搜索或状态筛选条件。" />}
            {filtered.map((turn, index) => (
              <button key={`${turn.turn}-${turn.phase}-${index}`} ref={selected === turn ? selectedRow : undefined} className="session-turn-row" type="button" aria-pressed={selected === turn} onClick={() => { setPicked(turn); onSelectTurn(turnOf(turn)) }}>
                <span className="session-turn-number w-mono">{turn.turn ?? '—'}</span>
                <span className="session-turn-row-content">
                  <span className="session-turn-row-title"><strong>回合 {turn.turn ?? '—'}</strong><StatusPill status={kindOf(turnStatus(turn))}>{labelOf(turnStatus(turn))}</StatusPill></span>
                  <span className="session-turn-row-capability w-mono">{turnCapability(turn)}</span>
                  <span className="session-turn-row-meta">{turn.phase || '阶段未标记'} · 工具 {turn.tools?.length || 0}</span>
                  <span className="session-turn-row-meta">事件 {turnOf(turn) != null ? events.filter((event) => turnOf(event) === turnOf(turn)).length : '未关联'} · 模型调用 {turnOf(turn) != null ? calls.filter((call) => turnOf(call) === turnOf(turn)).length : '未关联'}</span>
                </span>
              </button>
            ))}
          </div>
          <footer className="session-event-footer">匹配 {filtered.length} / {rows.length} 个回合</footer>
        </section>
        <aside className="session-inspector-detail" aria-label="回合详情">
          {selected ? <>
            <header className="session-detail-heading">
              <div><span className="session-eyebrow">回合详情</span><h3>回合 {selected.turn ?? '—'}</h3></div>
              <Button size="small" icon={<Copy size={13} />} onClick={() => onCopy(selected, '回合原始参数')}>复制原始参数</Button>
            </header>
            <div className="session-detail-scroll">
              <section className="session-turn-records" aria-label="本回合记录">
                <div><h4>本回合记录</h4><p>{hasMore ? '事件尚未全部加载，下方显示已加载数量。' : '查看事件与模型调用，了解这个回合的处理过程。'}</p></div>
                <div className="session-record-actions">
                  <Button size="small" disabled={turnOf(selected) == null} onClick={() => onOpenTurn(turnOf(selected)!, 'events')}>查看本回合事件 · {turnOf(selected) != null ? events.filter((event) => turnOf(event) === turnOf(selected)).length : '未关联'}</Button>
                  <Button size="small" disabled={turnOf(selected) == null} onClick={() => onOpenTurn(turnOf(selected)!, 'llm')}>查看本回合模型调用 · {turnOf(selected) != null ? calls.filter((call) => turnOf(call) === turnOf(selected)).length : '未关联'}</Button>
                </div>
              </section>
              <dl className="session-event-properties">
                <div><dt>执行状态</dt><dd><StatusPill status={kindOf(turnStatus(selected))}>{labelOf(turnStatus(selected))}</StatusPill></dd></div>
                <div><dt>执行阶段</dt><dd>{selected.phase || '未标记'}</dd></div>
                <div className="session-property-wide"><dt>执行能力</dt><dd className="w-mono">{turnCapability(selected)}</dd></div>
              </dl>
              <section className="session-turn-section">
                <h4>执行思考</h4>
                {selected.think ? <dl className="session-event-properties">
                  <div><dt>能力</dt><dd className="w-mono">{selected.think.capability_id || '未标记'}</dd></div>
                  <div><dt>状态</dt><dd><StatusPill status={kindOf(selected.think.status)}>{labelOf(selected.think.status)}</StatusPill></dd></div>
                </dl> : <p className="session-detail-hint">当前回合没有返回思考记录。</p>}
              </section>
              <section className="session-turn-section">
                <h4>工具执行 <span>{selected.tools?.length || 0}</span></h4>
                {selected.tools?.length ? <ol className="session-tool-list">{selected.tools.map((tool, index) => <li key={index}><span className="session-tool-index w-mono">{index + 1}</span><div><strong className="w-mono">{tool.name || tool.tool || '未命名工具'}</strong><span>{tool.kind || '类型未标记'}</span></div></li>)}</ol> : <p className="session-detail-hint">当前回合没有返回工具记录。</p>}
              </section>
              <section className="session-turn-section">
                <h4>决策结果 <span>{selected.decisions?.length || 0}</span></h4>
                {selected.decisions?.length ? <div className="session-decision-list">{selected.decisions.map((decision, index) => <span className="w-mono" key={index}>{decision.type || '未标记'}</span>)}</div> : <p className="session-detail-hint">当前回合没有返回决策记录。</p>}
              </section>
              <RawParameters key={`${selected.turn}-${selected.phase}-${rows.indexOf(selected)}`} value={selected} />
            </div>
          </> : <EmptyState title="没有可查看的回合" hint="清除搜索或筛选条件。" />}
        </aside>
      </div>
    </div>
  )
}

export function SessionModelCalls({ rows, onCopy, onOpenTurn, contextKey }: { rows: LlmCall[]; onCopy: CopyParameters; onOpenTurn: (turn: number) => void; contextKey: string }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [model, setModel] = useState('')
  const [order, setOrder] = useState<'record' | 'duration' | 'tokens'>('record')
  const [picked, setPicked] = useState<LlmCall | null>(null)
  useEffect(() => { setSearch(''); setStatus(''); setModel(''); setOrder('record'); setPicked(null) }, [contextKey])
  const models = useMemo(() => [...new Set(rows.map((call) => call.model).filter(Boolean))], [rows])
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    const entries = rows.map((call, index) => ({ call, index })).filter(({ call }) => (!status || kindOf(call.status) === status)
      && (!model || call.model === model)
      && (!query || [call.turn, call.job, call.model, call.dispatch_id].join(' ').toLowerCase().includes(query)))
    if (order === 'duration') entries.sort((left, right) => (right.call.elapsed_ms ?? -1) - (left.call.elapsed_ms ?? -1))
    if (order === 'tokens') entries.sort((left, right) => (right.call.total_tokens ?? -1) - (left.call.total_tokens ?? -1))
    return entries
  }, [rows, search, status, model, order])
  const selectedEntry = filtered.find(({ call }) => call === picked) || filtered[0]
  const selected = selectedEntry?.call
  const tokenCalls = filtered.filter(({ call }) => call.total_tokens != null && Number.isFinite(call.total_tokens))
  const timedCalls = filtered.filter(({ call }) => call.elapsed_ms != null && Number.isFinite(call.elapsed_ms))

  if (!rows.length) return <EmptyState title="暂无模型调用" hint="当前回合或步骤范围没有返回模型调用记录，可返回回合或查看全部日志。" />

  return (
    <div className="session-tab-content">
      <div className="session-subview-summary" aria-label="模型调用概览">
        <span>匹配调用 <strong>{filtered.length}</strong></span>
        <span>已返回 Tokens <strong>{tokenCalls.length ? numberOf(tokenCalls.reduce((sum, { call }) => sum + call.total_tokens!, 0)) : '—'}</strong></span>
        <span>平均调用耗时 <strong>{timedCalls.length ? durationOf(Math.round(timedCalls.reduce((sum, { call }) => sum + call.elapsed_ms!, 0) / timedCalls.length)) : '—'}</strong></span>
        <span>失败 <strong data-status="fail">{filtered.filter(({ call }) => kindOf(call.status) === 'fail').length}</strong></span>
      </div>
      <div className="session-inspector session-model-inspector">
        <section className="session-inspector-browser" aria-label="模型调用列表">
          <div className="session-inspector-filters session-model-filters">
            <Input size="small" allowClear prefix={<Search size={14} />} aria-label="搜索模型调用" placeholder="搜索回合、任务、模型或调用 ID" value={search} onChange={(event) => setSearch(event.target.value)} />
            <div className="session-model-filter-row">
              <Select size="small" allowClear aria-label="筛选模型" placeholder="全部模型" value={model || undefined} onChange={(value) => setModel(value || '')} options={models.map((value) => ({ value, label: value }))} />
              <StatusFilter name="模型调用状态" value={status} onChange={setStatus} />
              <Select size="small" aria-label="模型调用排序" value={order} onChange={setOrder} options={[{ value: 'record', label: '记录顺序' }, { value: 'duration', label: '耗时从高到低' }, { value: 'tokens', label: 'Tokens 从高到低' }]} />
            </div>
          </div>
          <div className="session-model-list">
            {!filtered.length ? <EmptyState title="没有符合条件的模型调用" hint="调整搜索、模型或状态筛选条件。" /> : <table className="session-model-table">
              <colgroup><col style={{ width: 56 }} /><col style={{ width: 104 }} /><col /><col style={{ width: 84 }} /><col style={{ width: 90 }} /><col style={{ width: 104 }} /></colgroup>
              <thead><tr><th>回合</th><th>任务</th><th>模型</th><th>状态</th><th>Tokens</th><th>耗时</th></tr></thead>
              <tbody>{filtered.map(({ call, index }) => <tr key={`${call.dispatch_id}-${index}`} aria-selected={selected === call} tabIndex={0} onClick={() => setPicked(call)} onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setPicked(call) }
              }}>
                <td className="w-mono">{call.turn ?? '—'}</td><td>{call.job || '—'}</td><td className="w-mono">{call.model || '—'}</td>
                <td><StatusPill status={kindOf(call.status)}>{labelOf(call.status)}</StatusPill></td><td className="w-mono">{numberOf(call.total_tokens)}</td><td className="w-mono">{durationOf(call.elapsed_ms)}</td>
              </tr>)}</tbody>
            </table>}
          </div>
          <footer className="session-event-footer">匹配 {filtered.length} / {rows.length} 次调用<span>点击记录查看完整参数</span></footer>
        </section>
        <aside className="session-inspector-detail" aria-label="模型调用详情">
          {selected ? <>
            <header className="session-detail-heading">
              <div><span className="session-eyebrow">模型调用详情 · 回合 {turnOf(selected) ?? '未关联'}</span><h3>{selected.job || '任务未标记'}</h3></div>
              <Button size="small" icon={<Copy size={13} />} onClick={() => onCopy(selected, '模型调用原始参数')}>复制原始参数</Button>
            </header>
            <div className="session-detail-scroll">
              <dl className="session-event-properties">
                <div className="session-property-wide"><dt>所属回合</dt><dd>{turnOf(selected) != null ? <button type="button" className="session-inline-link" onClick={() => onOpenTurn(turnOf(selected)!)}>回合 {turnOf(selected)} · 查看回合</button> : '未关联回合'}</dd></div>
                <div><dt>模型</dt><dd className="w-mono">{selected.model || '未标记'}</dd></div>
                <div><dt>调用状态</dt><dd><StatusPill status={kindOf(selected.status)}>{labelOf(selected.status)}</StatusPill></dd></div>
                <div><dt>Tokens</dt><dd className="session-call-value w-mono">{numberOf(selected.total_tokens)}</dd></div>
                <div><dt>调用耗时</dt><dd className="session-call-value w-mono">{durationOf(selected.elapsed_ms)}</dd></div>
                <div className="session-property-wide"><dt>调用 ID</dt><dd className="w-mono">{selected.dispatch_id || '未返回'}</dd></div>
              </dl>
              <p className="session-detail-hint">原始参数展示接口返回的完整调用记录；未返回的请求或响应内容无法在此还原。</p>
              <RawParameters key={selectedEntry!.index} value={selected} />
            </div>
          </> : <EmptyState title="没有可查看的模型调用" hint="清除搜索或筛选条件。" />}
        </aside>
      </div>
    </div>
  )
}
