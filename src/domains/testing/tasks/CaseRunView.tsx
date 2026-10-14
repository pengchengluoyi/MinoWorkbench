import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Segmented, Skeleton, StatusPill, toStatusKind, useFeedback } from '@/ui'
import { useSessionDetail } from '../sessions/queries'
import { belongsToSession, linkedTurns, stepIdOf, type ExecutionEntry, type ExecutionScope } from '../sessions/executionLinks'
import { SessionDetail } from '../sessions/SessionDetail'
import { getCaseRunnerTraceDetail, getSessionTrajectory } from '@/api/caseRunner'
import { unwrapOne } from '@/lib/unwrap'
import { expandPlatforms, type PlatformInput } from '@/constants/appPlatforms'
import { conditionPair, splitNumbered } from '../cases/caseText'
import { caseId, failReason, verdictOf, type TaskCase } from './types'
import { mergeTraceSteps, parseTrace, traceKey, type TraceStep } from './trace'
import { parseInteraction, type TraceInteraction } from './interaction'
import { ScreenshotOverlay } from './ScreenshotOverlay'
import './CaseRunView.css'

/**
 * 单条用例的执行页。
 * 三栏读原文句子，轨迹读执行记录，同一时间只显示一个。
 * 布局按应用平台固定，截图与当前事件同步更新。
 */
export function CaseRunView({ row, taskId, platforms, onBack }: { row: TaskCase; taskId: string; platforms: PlatformInput; onBack: () => void }) {
  const fb = useFeedback()
  const id = caseId(row)
  const sessionId = String(row.session_id || (String(row.report_run_id || '').includes('::') ? '' : row.report_run_id) || '')
  const runId = String(row.report_run_id || (taskId && id ? `${taskId}::${id}` : ''))
  const verdict = verdictOf(row.status || row.overall_status)
  const label = verdict === 'pass' ? '通过' : verdict === 'fail' ? '失败' : verdict === 'running' ? '执行中' : '其他'
  const fallback = String(row.summary || failReason(row) || '')

  const session = useSessionDetail(sessionId)
  const trace = useQuery({
    queryKey: ['task', 'trace', runId, sessionId],
    enabled: !!runId,
    queryFn: async () => {
      const trajectory = unwrapOne<Record<string, unknown>>(await (sessionId ? getSessionTrajectory(sessionId).catch(() => ({ data: {} })) : Promise.resolve({ data: {} })))
      const detail = unwrapOne<Record<string, unknown>>(await getCaseRunnerTraceDetail(runId).catch(() => ({ data: {} })))
      const fromEvents = parseTrace(trajectory, fallback, { source: 'session', sessionId })
      const fromTrace = parseTrace(detail, fallback, { source: 'trace', sessionId })
      return {
        summary: fromTrace.summary || fromEvents.summary || fallback,
        steps: mergeTraceSteps(fromEvents.steps, fromTrace.steps),
      }
    },
  })

  const steps = useMemo(() => trace.data?.steps || [], [trace.data?.steps])
  const script = useMemo(() => ({
    pre: splitNumbered(row.precondition),
    op: splitNumbered(row.steps || row.steps_raw),
    ex: splitNumbered(row.expected || row.expected_raw),
  }), [row.precondition, row.steps, row.steps_raw, row.expected, row.expected_raw])
  const opEvents = useMemo(() => columnEvents(row.steps_parsed, script.op, 'op'), [row.steps_parsed, script.op])
  const exEvents = useMemo(() => columnEvents(row.expected_parsed, script.ex, 'ex'), [row.expected_parsed, script.ex])

  const linked = useMemo(() => linkClauses(opEvents, exEvents, steps), [opEvents, exEvents, steps])
  const [pane, setPane] = useState<'script' | 'trace' | 'log'>('trace')
  const [picked, setPicked] = useState('')
  const [returnPane, setReturnPane] = useState<'script' | 'trace'>('trace')
  const [entry, setEntry] = useState<ExecutionEntry | null>(null)
  const detailPane = pane === 'log' ? returnPane : pane
  useEffect(() => { setPane('trace'); setReturnPane('trace'); setPicked(''); setEntry(null) }, [runId, sessionId, id])
  const activeId = picked || linked.fallbackId

  const currentTrace = activeId.startsWith('tr-') ? steps.find((step) => `tr-${traceKey(step)}` === activeId) : linked.byClause.get(activeId)?.at(-1)
  const activeClause = currentTrace ? stepIdOf(currentTrace.stepRef) : activeId
  const currentScript = findClause({ op: opEvents, ex: exEvents }, activeClause)
  const condition = activeClause.match(/^pre-(\d+)-1$/)
  const currentCondition = condition ? script.pre.find((line) => line.num === Number(condition[1])) : undefined
  const relationRecords = useMemo(() => [...steps, ...(session.data?.events || []), ...(session.data?.turns || []), ...(session.data?.llm || [])], [steps, session.data])
  const scopeFor = (ref: string | undefined, title: string, seed: number[] = []): ExecutionScope => ({
    key: ref || (currentTrace ? traceKey(currentTrace) : activeId), sessionId, title, stepRef: ref,
    turns: linkedTurns(ref, seed, relationRecords, sessionId),
  })
  const activeRef = currentTrace?.stepRef || currentScript?.stepRef || (currentCondition ? `前置 ${currentCondition.num}-1` : '')
  const seedTurn = currentTrace?.turn != null && belongsToSession(currentTrace, sessionId) ? [currentTrace.turn] : []
  const activeScope = scopeFor(activeRef || undefined, currentScript?.clause.param || currentCondition?.text || currentTrace?.param || currentTrace?.event || '当前步骤', seedTurn)
  const openLogs = (scope: ExecutionScope = activeScope) => {
    if (pane !== 'log') setReturnPane(pane)
    setEntry((previous) => ({ request: (previous?.request || 0) + 1, scope, returnLabel: (pane === 'log' ? returnPane : pane) === 'script' ? '三栏' : '轨迹' }))
    setPane('log')
  }
  const changePane = (value: 'script' | 'trace' | 'log') => { if (value !== 'log') setReturnPane(value); setPane(value) }
  const firstScreenshot = steps.find((step) => step.thumb)
  const screenshotSrc = currentTrace?.thumb || firstScreenshot?.thumb || ''
  const isPortrait = expandPlatforms(platforms).some((platform) => /^(android|ios|mobile)$/i.test(platform))
  const splitView = isPortrait || detailPane === 'trace'
  const interaction = currentTrace?.interaction || (currentTrace ? parseInteraction(currentTrace.event, { attrs: currentTrace.attrs, param: currentTrace.param }) : undefined)
  const screenshot = <StepScreenshot key={runId} src={screenshotSrc} fallbackStep={!currentTrace?.thumb ? firstScreenshot?.step : undefined} interaction={interaction} />

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 10 }}>
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="small" onClick={onBack}>返回这个批次</Button>
        <StatusPill status={verdict === 'other' ? 'muted' : verdict}>{label}</StatusPill>
        <strong className="min-w-0 truncate" style={{ fontSize: 16 }}>{row.title || row.name as string || id}</strong>
        <CopyId
          text={taskId && id ? `${taskId} ${id}` : (taskId || id)}
          shown={taskId && id ? `${taskId} · ${id}` : (taskId || id)}
          title={taskId && id ? '复制任务和用例 ID' : '复制 ID'}
          onCopy={(text) => copyId(text, fb, Boolean(taskId && id))}
        />
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={pane}
          onChange={(value) => changePane(value as 'script' | 'trace' | 'log')}
          options={[{ value: 'script', label: '三栏' }, { value: 'trace', label: '轨迹' }, { value: 'log', label: '日志' }]}
        />
      </header>

      <div className="case-content-pane" style={{ display: pane === 'log' ? 'none' : 'flex' }}>
      {trace.isLoading ? <Skeleton active paragraph={{ rows: 8 }} title={false} /> : (
        <div className="flex min-h-0 flex-1 gap-2.5" style={{ flexDirection: splitView ? 'row' : 'column' }}>
          {splitView ? (
            <div style={{ ...shot, flex: `0 0 ${isPortrait ? '35%' : '52%'}`, maxWidth: isPortrait ? '35%' : '52%', borderRadius: 'var(--w-radius-lg)' }}>{screenshot}</div>
          ) : null}
          <div className="min-h-0 min-w-0 flex-1" style={{ display: detailPane === 'trace' ? 'grid' : 'flex', flexDirection: 'column', gridTemplateRows: detailPane === 'trace' ? 'minmax(0, 1fr) minmax(0, 3fr)' : undefined, gap: 10, overflow: isPortrait && detailPane !== 'trace' ? 'auto' : undefined }}>
            {detailPane === 'script' ? (
              <div className="grid shrink-0" style={{ gridTemplateColumns: isPortrait ? 'minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1.2fr)' : 'minmax(180px, 0.8fr) minmax(220px, 1.1fr) minmax(240px, 1.2fr)', gap: 10 }}>
                <Card title="前置条件">
                  {script.pre.length ? script.pre.map((line) => {
                    const pair = conditionPair(line.text)
                    return (
                      <div key={line.num} style={lineRow}>
                        <span style={num}>{line.num}</span>
                        <button type="button" className="case-script-chip" aria-pressed={activeClause === `pre-${line.num}-1`} onClick={() => setPicked(`pre-${line.num}-1`)}>
                          {pair.label ? <span style={verb}>{pair.label}</span> : null}
                          <b>{pair.value}</b>
                        </button><button type="button" className="case-step-inspect" onClick={() => { setPicked(`pre-${line.num}-1`); openLogs(scopeFor(`前置 ${line.num}-1`, line.text)) }}>查看回合</button>
                      </div>
                    )
                  }) : <Empty>没有写前置条件</Empty>}
                </Card>
                <Card title="操作步骤">
                  <ScriptColumn events={opEvents} activeId={activeClause} onPick={setPicked} toneOf={(clauseId) => eventTone(linked.byClause.get(clauseId)?.at(-1))} onInspect={(clause) => openLogs(scopeFor(`操作 ${clause.stepNum}-${clause.id.split('-')[2]}`, clause.param))} turnsOf={(clause) => scopeFor(`操作 ${clause.stepNum}-${clause.id.split('-')[2]}`, clause.param).turns.length} empty="没有写操作步骤" />
                </Card>
                <Card title="预期结果">
                  <ScriptColumn events={exEvents} activeId={activeClause} onPick={setPicked} toneOf={(clauseId) => eventTone(linked.byClause.get(clauseId)?.at(-1))} onInspect={(clause) => openLogs(scopeFor(`预期 ${clause.stepNum}-${clause.id.split('-')[2]}`, clause.param))} turnsOf={(clause) => scopeFor(`预期 ${clause.stepNum}-${clause.id.split('-')[2]}`, clause.param).turns.length} empty="没有写预期结果" />
                </Card>
              </div>
            ) : null}

            <section style={{ ...stage, minHeight: detailPane === 'trace' ? 0 : 240, gridTemplateColumns: splitView ? 'minmax(0, 1fr)' : stage.gridTemplateColumns }}>
              {!splitView ? <div style={shot}>{screenshot}</div> : null}
              <div style={{ ...params, padding: detailPane === 'trace' ? 12 : 16, borderLeft: splitView ? 0 : params.borderLeft }}>
                <h3 style={{ margin: detailPane === 'trace' ? '0 0 8px' : '0 0 12px', fontSize: 15 }}>{currentTrace?.event || currentScript?.clause.param || currentCondition?.text || '当前步骤'}</h3>
                <dl style={{ ...grid, gridTemplateColumns: detailPane === 'trace' ? '52px minmax(0, 1fr) 52px minmax(0, 1fr)' : grid.gridTemplateColumns, gap: detailPane === 'trace' ? '8px 12px' : grid.gap }}>
                  <Param k="事件" v={currentTrace?.event || currentScript?.clause.param || '无'} />
                  <Param k="参数" v={currentTrace?.param || currentScript?.clause.param || '无'} bold />
                  <Param k="属性" v={currentTrace?.attrs || '无'} />
                  <Param k="步骤" v={activeRef || '未关联用例步骤'} />
                  <Param k="状态" v={currentTrace ? statusLabel(currentTrace.status) : currentScript?.clause.blocked ? '无法执行' : '无'} />
                  <Param k="时间" v={currentTrace?.seconds ? `${currentTrace.seconds} s` : '无'} />
                </dl>
                <div className="case-step-context">
                  <span>{activeRef || '执行记录'} · {activeScope.turns.length ? `关联 ${activeScope.turns.length} 个回合` : '未返回明确回合关联'}</span>
                  <Button size="small" disabled={!sessionId} onClick={() => openLogs()}>查看关联回合</Button>
                </div>
              </div>
            </section>

            {detailPane === 'trace' ? (
              <div className="min-h-0 overflow-auto" style={{ ...panel, padding: 0 }}>
                {steps.length ? (
                  <table className="case-trace-table" style={{ width: '100%', minWidth: 640, tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                    <colgroup><col style={{ width: 44 }} /><col style={{ width: 112 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 76 }} /><col style={{ width: 80 }} /><col style={{ width: 88 }} /></colgroup>
                    <thead>
                      <tr>
                        {['编号', '事件', '属性', '步骤', '回合', '状态', '时间戳 (s)'].map((title) => (
                          <th key={title} style={th}>{title}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {steps.map((step, index) => {
                        const rowId = `tr-${traceKey(step)}`
                        const on = currentTrace && traceKey(currentTrace) === traceKey(step)
                        return (
                          <tr key={traceKey(step)} aria-selected={on} data-status={uiStatus(step)} tabIndex={0} onClick={() => setPicked(rowId)} onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setPicked(rowId)
                            }
                          }}>
                            <td style={td}><span className="case-trace-index">{index + 1}</span></td>
                            <td style={td}>{step.event}</td>
                            <td style={td}>{step.attrs || step.summary || '无'}</td>
                            <td style={td}>{step.stepRef ? <span style={refPill}>{step.stepRef}</span> : '无'}</td>
                            <td style={td}>{step.turn != null && belongsToSession(step, sessionId) ? <button type="button" className="case-turn-link" onClick={(event) => { event.stopPropagation(); setPicked(rowId); openLogs(scopeFor(step.stepRef || undefined, step.param || step.event, [step.turn!])) }}>回合 {step.turn}</button> : <span className="case-unlinked">未关联</span>}</td>
                            <td style={td}><StatusPill status={toStatusKind(step.status)}>{statusLabel(step.status)}</StatusPill></td>
                            <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--w-font-mono)' }}>{step.seconds || '无'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                ) : <Empty>这条用例没有回传轨迹。</Empty>}
              </div>
            ) : null}
          </div>
        </div>
      )}
      </div>
      <div className="case-content-pane" style={{ display: pane === 'log' ? 'flex' : 'none' }}>
        {sessionId ? <SessionDetail key={sessionId} sessionId={sessionId} entry={entry} onReturn={() => setPane(returnPane)} /> : <Empty>这次执行没有 session。</Empty>}
      </div>
    </div>
  )
}

function StepScreenshot({ src, fallbackStep, interaction }: { src: string; fallbackStep?: number; interaction?: TraceInteraction }) {
  const [displayed, setDisplayed] = useState({ src: '', width: 0, height: 0 })
  const displayedSrc = displayed.src
  const [failedSrc, setFailedSrc] = useState('')

  useEffect(() => {
    if (!src || src === displayedSrc) return
    let active = true
    const image = new Image()
    image.src = src
    image.decode().then(() => {
      if (!active) return
      setDisplayed({ src, width: image.naturalWidth, height: image.naturalHeight })
      setFailedSrc('')
    }).catch(() => {
      if (active) setFailedSrc(src)
    })
    return () => { active = false }
  }, [src, displayedSrc])

  const failed = !!src && failedSrc === src
  const loading = !!src && src !== displayedSrc && !failed
  const notice = failed ? '截图加载失败，保留上一张截图。'
    : loading ? '正在切换截图…'
    : fallbackStep != null ? `补位截图 · 第 ${fallbackStep} 步` : ''

  return (
    <>
      {src && displayedSrc ? (
        <img src={displayedSrc} alt="当前步骤截图" style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : <p style={{ margin: 0, color: '#94a3b8' }}>{!src ? '本次执行没有截图。' : failed ? '截图加载失败。' : '截图加载中…'}</p>}
      {src && src === displayedSrc && !failed && interaction ? <ScreenshotOverlay interaction={interaction} imageWidth={displayed.width} imageHeight={displayed.height} /> : null}
      {src && displayedSrc && notice ? (
        <span role={loading || failed ? 'status' : undefined} style={{ position: 'absolute', bottom: 12, left: 12, right: 12, width: 'fit-content', maxWidth: 'calc(100% - 24px)', padding: '4px 8px', borderRadius: 6, background: 'rgba(16, 20, 28, 0.8)', color: '#e2e8f0', fontSize: 12, zIndex: 2 }}>{notice}</span>
      ) : null}
    </>
  )
}

type ScriptEvent = {
  id: string
  stepNum: number
  verb: string
  param: string
  blocked: boolean
  uncovered: boolean
}

function columnEvents(
  parsed: unknown,
  lines: { num: number; text: string }[],
  prefix: 'op' | 'ex',
): ScriptEvent[][] {
  const compiled = Array.isArray(parsed)
    ? parsed.map((item) => String(item ?? '').trim()).filter(Boolean).map((line) => {
      const matched = line.match(/^(\d+)\.\s*(.*)$/)
      return matched ? { step: matched[1], text: matched[2] } : { step: '', text: line }
    })
    : []
  const grouped = new Map<string, string[]>()
  for (const item of compiled) {
    const key = item.step || '1'
    grouped.set(key, [...(grouped.get(key) || []), item.text])
  }
  return lines.map((line) => {
    const texts = compiled.length ? (grouped.get(String(line.num)) || []) : []
    const shown = texts.length ? texts : ['未编译']
    return shown.map((text, index) => ({
      id: `${prefix}-${line.num}-${index + 1}`,
      stepNum: line.num,
      verb: '',
      param: text,
      uncovered: text.includes('未执行'),
      blocked: text.startsWith('×') || (text.includes('无法') && !text.includes('未执行')),
    }))
  })
}

function ScriptColumn({
  events, activeId, onPick, toneOf, empty, onInspect, turnsOf,
}: {
  events: ScriptEvent[][]
  activeId: string
  onPick: (id: string) => void
  toneOf: (id: string) => CSSProperties
  empty: string
  onInspect: (clause: ScriptEvent) => void
  turnsOf: (clause: ScriptEvent) => number
}) {
  if (!events.length) return <Empty>{empty}</Empty>
  return (
    <>
      {events.map((row) => (
        <div key={row[0]?.id || 'empty'} style={lineRow}>
          <span style={num}>{row[0]?.stepNum}</span>
          <span style={{ lineHeight: 1.75 }}>
            {row.map((clause, index) => (
              <span key={clause.id}>
                {index > 0 ? <span>，</span> : null}
                <button type="button" className="case-script-chip" aria-pressed={clause.id === activeId} onClick={() => onPick(clause.id)} style={{ ...chipBtn, ...(clause.uncovered ? { background: 'transparent', color: 'var(--w-text-quaternary)' } : clause.blocked ? skipChip : toneOf(clause.id)) }}>
                  <i style={{ ...badge, background: clause.uncovered ? 'var(--w-text-quaternary)' : clause.blocked ? 'var(--w-warn)' : 'var(--w-primary)' }}>{index + 1}</i>
                  <b>{clause.param}</b>
                </button>
                <button type="button" className="case-step-inspect" onClick={() => { onPick(clause.id); onInspect(clause) }}>{turnsOf(clause) ? `${turnsOf(clause)} 个回合` : '查看回合'}</button>
                {clause.blocked ? <span style={{ marginLeft: 4, color: 'var(--w-warn)', fontSize: 11, fontWeight: 750 }}>无法执行</span> : null}
              </span>
            ))}
          </span>
        </div>
      ))}
    </>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-col" style={panel}>
      <h2 style={heading}>{title}</h2>
      <div className="overflow-auto" style={{ maxHeight: 220 }}>{children}</div>
    </section>
  )
}

function Param({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <>
      <dt style={{ color: 'var(--w-text-tertiary)', fontWeight: 650 }}>{k}</dt>
      <dd style={{ margin: 0, fontWeight: bold ? 800 : 650, overflowWrap: 'anywhere' }}>{v}</dd>
    </>
  )
}

function CopyId({ text, shown, title, onCopy }: { text: string; shown?: string; title: string; onCopy: (text: string) => void }) {
  if (!text) return null
  return (
    <button type="button" className="w-mono" onClick={() => onCopy(text)} style={copyBtn} title={title}>
      {shown || text}
    </button>
  )
}

function copyId(text: string, fb: { ok: (s: string) => void; fail: (s: string) => void }, both: boolean) {
  navigator.clipboard.writeText(text).then(() => fb.ok(both ? '已复制任务和用例 ID' : '已复制')).catch(() => fb.fail('剪贴板不可用'))
}

type UiStatus = 'pass' | 'skip' | 'retry' | 'fail' | 'pending' | 'blocked'

function uiStatus(step?: TraceStep): UiStatus {
  const raw = String((step as TraceStep & { ui_status?: string } | undefined)?.ui_status || step?.status || '').toLowerCase()
  if (raw === 'blocked') return 'blocked'
  if (/retry/.test(raw)) return 'retry'
  if (/skip|cancel|无法/.test(raw)) return 'skip'
  if (/fail|error|give_up|declined/.test(raw)) return 'fail'
  if (/pass|success|done|ok/.test(raw)) return 'pass'
  return 'pending'
}

function eventTone(step?: TraceStep): CSSProperties {
  const status = uiStatus(step)
  if (status === 'pass') return { background: 'var(--w-pass-bg)', color: 'var(--w-pass)' }
  if (status === 'fail') return { background: 'var(--w-fail-bg)', color: 'var(--w-fail)' }
  if (status === 'retry' || status === 'blocked') return { background: 'var(--w-warn-bg)', color: 'var(--w-warn)' }
  if (status === 'skip') return { background: 'transparent', color: 'var(--w-text-quaternary)', textDecoration: 'line-through' }
  return { background: 'var(--w-fill)', color: 'var(--w-text-tertiary)' }
}

function Empty({ children }: { children: string }) {
  return <p style={{ margin: '8px 0', color: 'var(--w-text-quaternary)' }}>{children}</p>
}

function linkClauses(ops: ScriptEvent[][], expects: ScriptEvent[][], steps: TraceStep[]) {
  const valid = new Set([...ops.flat(), ...expects.flat()].map((clause) => clause.id))
  const byClause = new Map<string, TraceStep[]>()
  for (const step of steps) {
    const id = stepIdOf(step.stepRef)
    if (!id || (!valid.has(id) && !id.startsWith('pre-'))) continue
    byClause.set(id, [...(byClause.get(id) || []), step])
  }
  const first = [...steps].reverse().find((step) => /fail|give_up|declined/.test(step.status)) || steps[0]
  return { byClause, fallbackId: first ? `tr-${traceKey(first)}` : ops.flat()[0]?.id || '' }
}

function findClause(events: { op: ScriptEvent[][]; ex: ScriptEvent[][] }, id: string) {
  const matched = id.match(/^(op|ex)-(\d+)-(\d+)$/)
  if (!matched) return null
  const rows = matched[1] === 'ex' ? events.ex : events.op
  const clause = rows.flat().find((item) => item.id === id)
  if (!clause) return null
  const stepRef = `${matched[1] === 'ex' ? '预期' : '操作'} ${clause.stepNum}-${matched[3]}`
  return { clause, stepRef }
}

function statusLabel(status: string) {
  if (String(status).toLowerCase() === 'blocked') return '阻塞（未验证）'
  const kind = toStatusKind(status)
  if (kind === 'pass') return '通过'
  if (kind === 'fail') return '失败'
  if (kind === 'cancel') return '跳过'
  if (kind === 'running') return '执行中'
  if (kind === 'warn') return '需处理'
  return status || '其他'
}

const panel: CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  padding: 12,
}
const heading: CSSProperties = { margin: '0 0 8px', fontSize: 14, fontWeight: 750 }
const lineRow: CSSProperties = { display: 'grid', gridTemplateColumns: '22px minmax(0, 1fr)', gap: 6, padding: '8px 0', borderBottom: '1px solid var(--w-border)' }
const num: CSSProperties = { color: 'var(--w-text-tertiary)', fontWeight: 750, fontVariantNumeric: 'tabular-nums' }
const chip: CSSProperties = { display: 'inline', background: '#e7ebf8', borderRadius: 5, padding: '1px 5px', lineHeight: 1.75 }
const chipBtn: CSSProperties = { ...chip, border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }
const skipChip: CSSProperties = { background: 'transparent', color: 'var(--w-text-quaternary)', textDecoration: 'line-through' }
const copyBtn: CSSProperties = {
  border: '1px solid var(--w-border)', background: 'var(--w-surface)', borderRadius: 8,
  padding: '2px 8px', fontSize: 12, color: 'var(--w-text-secondary)', cursor: 'pointer',
}
const verb: CSSProperties = { fontWeight: 750, color: '#312e81', marginRight: 3 }
const badge: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 15, height: 15, marginRight: 3,
  borderRadius: 4, color: '#fff', fontSize: 10, fontWeight: 800, fontStyle: 'normal', verticalAlign: '1px',
}
const stage: CSSProperties = {
  flex: 1, minWidth: 0, minHeight: 240, display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(220px, 0.8fr)', gridTemplateRows: 'minmax(0, 1fr)',
  background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', overflow: 'hidden',
}
const shot: CSSProperties = { position: 'relative', minWidth: 0, minHeight: 0, overflow: 'hidden', background: '#10141c', display: 'grid', placeItems: 'center', color: '#94a3b8' }
const params: CSSProperties = { minWidth: 0, minHeight: 0, padding: 16, borderLeft: '1px solid var(--w-border)', overflow: 'auto' }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: '10px 12px', margin: 0 }
const th: CSSProperties = { position: 'sticky', top: 0, zIndex: 1, textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--w-fill)', color: 'var(--w-text-tertiary)', fontSize: 11, fontWeight: 650, padding: '9px 10px', borderBottom: '1px solid var(--w-border)' }
const td: CSSProperties = { padding: '10px', borderBottom: '1px solid var(--w-border)', verticalAlign: 'middle', overflowWrap: 'anywhere' }
const refPill: CSSProperties = { display: 'inline-block', whiteSpace: 'nowrap', fontWeight: 650, color: 'var(--w-primary)', background: 'var(--w-primary-soft)', borderRadius: 'var(--w-radius-pill)', padding: '2px 8px' }
