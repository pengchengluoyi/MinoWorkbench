import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Segmented, Skeleton, StatusPill, toStatusKind, errText, EmptyState, useFeedback } from '@/ui'
import { useSessionDetail } from '../sessions/queries'
import { belongsToSession, linkedTurns, stepIdOf, type ExecutionEntry, type ExecutionScope } from '../sessions/executionLinks'
import { SessionDetail } from '../sessions/SessionDetail'
import { loadRunTrace } from './traceQueries'
import { liveRefreshDelay } from '@/lib/liveQuery'
import { copyToClipboard } from '@/lib/clipboard'
import { expandPlatforms, type PlatformInput } from '@/constants/appPlatforms'
import { fieldPresentation, originalLines, type PreviewTask, type ScriptKind } from '../cases/caseUnderstanding'
import { CaseScriptSections } from '../cases/CaseScriptSections'
import type { ScriptInteraction } from '../cases/ScriptField'
import { CaseVersionChain } from '../cases/CaseVersionChain'
import { caseId, failReason, verdictOf, type TaskCase } from './types'
import { traceKey, type TraceStep } from './trace'
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

  const session = useSessionDetail(sessionId, verdict === 'running')
  const trace = useQuery({
    queryKey: ['task', 'trace', runId, sessionId],
    enabled: !!(runId || sessionId),
    refetchInterval: (query) => verdict === 'running' ? liveRefreshDelay(query.state.fetchFailureCount) : false,
    refetchIntervalInBackground: false,
    queryFn: () => loadRunTrace(runId, sessionId, fallback),
  })

  const steps = useMemo(() => trace.data?.steps || [], [trace.data?.steps])
  const presentations = useMemo(() => ({ pre: fieldPresentation(row, 'pre'), op: fieldPresentation(row, 'op'), ex: fieldPresentation(row, 'ex') }), [row])
  const script = useMemo(() => ({ pre: originalLines(presentations.pre.value), op: originalLines(presentations.op.value), ex: originalLines(presentations.ex.value) }), [presentations])
  const opEvents = useMemo(() => executionTasks(presentations.op.tasks, 'op'), [presentations.op.tasks])
  const exEvents = useMemo(() => executionTasks(presentations.ex.tasks, 'ex'), [presentations.ex.tasks])

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
    setEntry((previous) => ({ request: (previous?.request || 0) + 1, scope, returnLabel: (pane === 'log' ? returnPane : pane) === 'script' ? '用例内容' : '执行步骤' }))
    setPane('log')
  }
  const changePane = (value: 'script' | 'trace' | 'log') => { if (value !== 'log') setReturnPane(value); setPane(value) }
  const firstScreenshot = steps.find((step) => step.thumb)
  const screenshotSrc = currentTrace?.thumb || firstScreenshot?.thumb || ''
  const isPortrait = expandPlatforms(platforms).some((platform) => /^(android|ios|mobile)$/i.test(platform))
  const splitView = isPortrait || detailPane === 'trace'
  const interaction = currentTrace?.interaction || (currentTrace ? parseInteraction(currentTrace.event, { attrs: currentTrace.attrs, param: currentTrace.param }) : undefined)
  const screenshot = <StepScreenshot key={runId} src={screenshotSrc} fallbackStep={!currentTrace?.thumb ? firstScreenshot?.step : undefined} interaction={currentTrace?.thumb ? interaction : undefined} coordinateUnknown={!!currentTrace?.thumb && /click|tap|press|drag|swipe|点击|拖拽|滑动/.test(currentTrace.event) && !interaction} />

  return (
    <div className="case-run-view flex h-full min-h-0 flex-col" style={{ gap: 10 }}>
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="small" onClick={onBack}>返回这个批次</Button>
        <StatusPill status={verdict === 'other' ? 'muted' : verdict}>{label}</StatusPill>
        <h1 className="w-record-title">{row.title || row.name as string || '用例结果'}</h1>
        <CopyId
          text={taskId && id ? `${taskId} ${id}` : (taskId || id)}
          shown="复制执行引用"
          title={taskId && id ? '复制任务和用例 ID' : '复制 ID'}
          onCopy={(text) => copyId(text, fb, Boolean(taskId && id))}
        />
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={pane}
          onChange={(value) => changePane(value as 'script' | 'trace' | 'log')}
          options={[{ value: 'script', label: '用例内容' }, { value: 'trace', label: '执行步骤' }, { value: 'log', label: '详细日志' }]}
        />
      </header>

      {trace.isError && trace.data ? <div className="execution-source-alert" role="alert">轨迹刷新失败，当前保留上次读取的记录。<Button size="small" onClick={() => void trace.refetch()}>重新读取</Button></div> : null}
      {trace.data?.errors.length ? <div className="execution-source-alert" role="alert">{trace.data.errors.map((item) => <span key={item.source}>{item.source}读取失败：{errText(item.error)}。 </span>)}<Button size="small" onClick={() => void trace.refetch()}>重试缺失来源</Button></div> : null}
      <div className="case-content-pane" style={{ display: pane === 'log' ? 'none' : 'flex' }}>
      {trace.isLoading ? <Skeleton active paragraph={{ rows: 8 }} title={false} /> : trace.isError && !trace.data ? <EmptyState title="轨迹读取失败" hint={errText(trace.error)} action={<Button onClick={() => void trace.refetch()}>重试</Button>} /> : (
        <div className="case-run-layout flex min-h-0 flex-1 gap-2.5" style={{ flexDirection: splitView ? 'row' : 'column' }}>
          {splitView ? (
            <div className="case-run-shot" style={{ ...shot, flex: `0 0 ${isPortrait ? '35%' : '52%'}`, maxWidth: isPortrait ? '35%' : '52%', borderRadius: 'var(--w-radius-lg)' }}>{screenshot}</div>
          ) : null}
          <div className="case-run-details min-h-0 min-w-0 flex-1" style={{ display: detailPane === 'trace' ? 'grid' : 'flex', flexDirection: 'column', gridTemplateRows: detailPane === 'trace' ? 'minmax(0, 1fr) minmax(0, 3fr)' : undefined, gap: 10, overflow: isPortrait && detailPane !== 'trace' ? 'auto' : undefined }}>
            {detailPane === 'script' ? (
              <div className="case-execution-script">
                <p className="case-execution-reading">原文与理解来自本次执行返回的记录；未返回的解析不会以当前草稿补位。</p>
                <CaseScriptSections row={row} emptyResultText="本次执行未返回这部分解析，原文完整保留" interactionOf={(kind: ScriptKind): ScriptInteraction => {
                  const reference = (task: PreviewTask, number: number) => task.step > 0 ? `${kind === 'pre' ? '前置' : kind === 'op' ? '操作' : '预期'} ${task.step}-${number}` : undefined
                  return {
                    activeTaskId: activeClause,
                    idOf: (task, number) => `${kind}-${task.step}-${number}`,
                    onPick: (task, number) => setPicked(`${kind}-${task.step}-${number}`),
                    onInspect: (task, number) => { setPicked(`${kind}-${task.step}-${number}`); openLogs(scopeFor(reference(task, number), task.title || task.source)) },
                    turnsOf: (task, number) => scopeFor(reference(task, number), task.title || task.source).turns.length,
                    statusOf: (task, number) => uiStatus(linked.byClause.get(`${kind}-${task.step}-${number}`)?.at(-1)),
                  }
                }} />
                <details className="session-summary"><summary>执行版本来源</summary><CaseVersionChain row={row} execution context={session.data?.meta?.runtime_context} /></details>
              </div>
            ) : null}

            <section className="case-run-stage" style={{ ...stage, minHeight: detailPane === 'trace' ? 0 : 240, gridTemplateColumns: splitView ? 'minmax(0, 1fr)' : stage.gridTemplateColumns }}>
              {!splitView ? <div className="case-run-shot" style={shot}>{screenshot}</div> : null}
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
              <div className="case-run-traces min-h-0 overflow-auto" style={{ ...panel, padding: 0 }}>
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
        {sessionId ? <SessionDetail key={sessionId} sessionId={sessionId} live={verdict === 'running'} entry={entry} onReturn={() => setPane(returnPane)} /> : <Empty>这次执行没有 session。</Empty>}
      </div>
    </div>
  )
}

function StepScreenshot({ src, fallbackStep, interaction, coordinateUnknown }: { src: string; fallbackStep?: number; interaction?: TraceInteraction; coordinateUnknown?: boolean }) {
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
    : fallbackStep != null ? `补位截图 · 第 ${fallbackStep} 步，仅供参考` : ''

  return (
    <>
      {src && displayedSrc ? (
        <img src={displayedSrc} alt={fallbackStep != null ? `参考截图，来自第 ${fallbackStep} 步` : "当前步骤截图"} style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : <p style={{ margin: 0, color: '#94a3b8' }}>{!src ? '本次执行没有截图。' : failed ? '截图加载失败。' : '截图加载中…'}</p>}
      {coordinateUnknown && <p role="status" style={{ position: 'absolute', top: 8, left: 8, right: 8, zIndex: 2, margin: 0, padding: 6, background: 'rgba(15,23,42,.8)', color: '#fff', fontSize: 12 }}>坐标空间或落点范围未确认，当前截图保留，暂不绘制落点。</p>}
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

function executionTasks(tasks: PreviewTask[], prefix: 'op' | 'ex'): ScriptEvent[][] {
  const groups = new Map<number, ScriptEvent[]>()
  for (const task of tasks) {
    const group = groups.get(task.step) || []
    group.push({ id: `${prefix}-${task.step}-${group.length + 1}`, stepNum: task.step, verb: '', param: task.title, blocked: !!task.blocked, uncovered: false })
    groups.set(task.step, group)
  }
  return [...groups.values()]
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
  copyToClipboard(text).then(() => fb.ok(both ? '已复制任务和用例 ID' : '已复制')).catch(() => fb.fail('复制失败，请选中文本手动复制'))
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
const copyBtn: CSSProperties = {
  border: '1px solid var(--w-border)', background: 'var(--w-surface)', borderRadius: 8,
  padding: '2px 8px', fontSize: 12, color: 'var(--w-text-secondary)', cursor: 'pointer',
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
