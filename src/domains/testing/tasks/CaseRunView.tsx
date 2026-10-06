import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Segmented, Skeleton, StatusPill, toStatusKind } from '@/ui'
import { getCaseRunnerTraceDetail, getSessionTrajectory } from '@/api/caseRunner'
import { unwrapOne } from '@/lib/unwrap'
import { conditionPair, markClauses, splitNumbered } from '../cases/caseText'
import { caseId, failReason, verdictOf, type TaskCase } from './types'
import { mergeTraceSteps, parseTrace, type TraceStep } from './trace'

/**
 * 单条用例的执行页。
 * 三栏读原文句子，轨迹读执行记录，同一时间只显示一个。
 * 画面始终在下面：左边截图，右边是当前这一点的参数。
 */
export function CaseRunView({ row, taskId, onBack }: { row: TaskCase; taskId: string; onBack: () => void }) {
  const id = caseId(row)
  const runId = String(row.report_run_id || (taskId && id ? `${taskId}::${id}` : ''))
  const verdict = verdictOf(row.status || row.overall_status)
  const label = verdict === 'pass' ? '通过' : verdict === 'fail' ? '失败' : verdict === 'running' ? '执行中' : '其他'
  const fallback = String(row.summary || failReason(row) || '')

  const trace = useQuery({
    queryKey: ['task', 'trace', runId],
    enabled: !!runId,
    queryFn: async () => {
      const trajectory = unwrapOne<Record<string, unknown>>(await getSessionTrajectory(runId).catch(() => ({ data: {} })))
      const detail = unwrapOne<Record<string, unknown>>(await getCaseRunnerTraceDetail(runId).catch(() => ({ data: {} })))
      const fromEvents = parseTrace(trajectory, fallback)
      const fromTrace = parseTrace(detail, fallback)
      return {
        summary: fromTrace.summary || fromEvents.summary || fallback,
        steps: mergeTraceSteps(fromEvents.steps, fromTrace.steps),
      }
    },
  })

  const steps = trace.data?.steps || []
  const script = useMemo(() => ({
    pre: splitNumbered(row.precondition),
    op: splitNumbered(row.steps || row.steps_raw),
    ex: splitNumbered(row.expected || row.expected_raw),
  }), [row.precondition, row.steps, row.steps_raw, row.expected, row.expected_raw])

  const linked = useMemo(() => linkClauses(script.op, script.ex, steps), [script.op, script.ex, steps])
  const [pane, setPane] = useState<'script' | 'trace'>('script')
  const [picked, setPicked] = useState('')
  const activeId = picked || linked.fallbackId

  const currentTrace = linked.byClause.get(activeId) || steps.find((step) => `tr-${step.step}` === activeId)
  const currentScript = findClause(script, activeId)

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 10 }}>
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Button size="small" onClick={onBack}>返回这个批次</Button>
        <StatusPill status={verdict === 'other' ? 'muted' : verdict}>{label}</StatusPill>
        <strong className="min-w-0 truncate" style={{ fontSize: 16 }}>{row.title || row.name as string || id}</strong>
        <span className="w-mono" style={{ color: 'var(--w-text-quaternary)', fontSize: 12 }}>{id}</span>
        <span style={{ flex: 1 }} />
        <Segmented
          size="small"
          value={pane}
          onChange={(value) => setPane(value as 'script' | 'trace')}
          options={[{ value: 'script', label: '三栏' }, { value: 'trace', label: '轨迹' }]}
        />
      </header>

      {trace.isLoading ? <Skeleton active paragraph={{ rows: 8 }} title={false} /> : (
        <>
          {pane === 'script' ? (
            <div className="grid shrink-0" style={{ gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(220px, 1.1fr) minmax(240px, 1.2fr)', gap: 10 }}>
              <Card title="前置条件">
                {script.pre.length ? script.pre.map((line) => {
                  const pair = conditionPair(line.text)
                  return (
                    <div key={line.num} style={lineRow}>
                      <span style={num}>{line.num}</span>
                      <span style={chip}>
                        {pair.label ? <span style={verb}>{pair.label}</span> : null}
                        <b>{pair.value}</b>
                      </span>
                    </div>
                  )
                }) : <Empty>没有写前置条件</Empty>}
              </Card>
              <Card title="操作步骤">
                <ScriptColumn lines={script.op} prefix="op" activeId={activeId} onPick={setPicked} empty="没有写操作步骤" />
              </Card>
              <Card title="预期结果">
                <ScriptColumn lines={script.ex} prefix="ex" activeId={activeId} onPick={setPicked} empty="没有写预期结果" />
              </Card>
            </div>
          ) : null}

          <section style={stage}>
            <div style={shot}>
              {currentTrace?.thumb ? (
                <img src={currentTrace.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                <p style={{ margin: 0, color: '#94a3b8' }}>这一步没有截图。</p>
              )}
            </div>
            <div style={params}>
              <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{currentTrace?.event || currentScript?.clause.verb || '当前步骤'}</h3>
              <dl style={grid}>
                <Param k="事件" v={currentTrace?.event || currentScript?.clause.verb || '无'} />
                <Param k="参数" v={currentTrace?.param || currentScript?.clause.param || '无'} bold />
                <Param k="属性" v={currentTrace?.attrs || '无'} />
                <Param k="步骤" v={currentTrace?.stepRef || currentScript?.stepRef || '无'} />
                <Param k="状态" v={currentTrace ? statusLabel(currentTrace.status) : currentScript?.clause.skip ? '跳过' : '无'} />
                <Param k="时间" v={currentTrace?.seconds ? `${currentTrace.seconds} s` : '无'} />
              </dl>
            </div>
          </section>

          {pane === 'trace' ? (
            <div className="min-h-0 shrink-0 overflow-auto" style={{ ...panel, maxHeight: '42%', padding: 0 }}>
              {steps.length ? (
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['编号', '事件', '属性', '步骤', '状态', '时间戳 (s)'].map((title) => (
                        <th key={title} style={th}>{title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {steps.map((step, index) => {
                      const rowId = linked.byStep.get(step.step) || `tr-${step.step}`
                      const on = rowId === activeId
                      return (
                        <tr key={step.step} onClick={() => setPicked(rowId)} style={{ cursor: 'pointer', background: on ? 'var(--w-primary-soft)' : undefined }}>
                          <td style={td}>{index + 1}</td>
                          <td style={td}>{step.event}</td>
                          <td style={td}>{step.attrs || step.summary || '无'}</td>
                          <td style={td}>{step.stepRef ? <span style={refPill}>{step.stepRef}</span> : '无'}</td>
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
        </>
      )}
    </div>
  )
}

function ScriptColumn({
  lines, prefix, activeId, onPick, empty,
}: {
  lines: { num: number; text: string }[]
  prefix: 'op' | 'ex'
  activeId: string
  onPick: (id: string) => void
  empty: string
}) {
  if (!lines.length) return <Empty>{empty}</Empty>
  return (
    <>
      {lines.map((line) => (
        <div key={line.num} style={lineRow}>
          <span style={num}>{line.num}</span>
          <span style={{ lineHeight: 1.75 }}>
            {markClauses(line.text).map((clause, index) => {
              const id = `${prefix}-${line.num}-${index + 1}`
              return (
                <span key={id}>
                  {index > 0 ? <span>，</span> : null}
                  <button type="button" onClick={() => onPick(id)} style={{ ...chipBtn, ...(clause.skip ? skipChip : {}), ...(id === activeId ? onChip : {}) }}>
                    <i style={{ ...badge, background: clause.skip ? 'var(--w-warn)' : 'var(--w-primary)' }}>{index + 1}</i>
                    {clause.verb ? <span style={verb}>{clause.verb}</span> : null}
                    <b>{clause.param}</b>
                  </button>
                  {clause.skip ? <span style={{ marginLeft: 4, color: 'var(--w-warn)', fontSize: 11, fontWeight: 750 }}>无法执行</span> : null}
                </span>
              )
            })}
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

function Empty({ children }: { children: string }) {
  return <p style={{ margin: '8px 0', color: 'var(--w-text-quaternary)' }}>{children}</p>
}

/** 三栏徽章按先后对上带截图的轨迹。有「操作 1-2」这种步骤号就直接用。 */
function linkClauses(
  ops: { num: number; text: string }[],
  expects: { num: number; text: string }[],
  steps: TraceStep[],
) {
  const points = [...pointsOf(ops, 'op'), ...pointsOf(expects, 'ex')]
  const byClause = new Map<string, TraceStep>()
  const used = new Set<number>()
  for (const step of steps) {
    const id = refId(step.stepRef)
    if (!id || byClause.has(id)) continue
    byClause.set(id, step)
    used.add(step.step)
  }
  const pool = () => steps.filter((step) => !used.has(step.step))
  for (const point of points) {
    if (byClause.has(point.id) || point.skip) continue
    const open = pool()
    const chosen = open.find((step) => step.thumb || !/^(think|observe|done|resource)$/i.test(step.event)) || open[0]
    if (!chosen) break
    byClause.set(point.id, chosen)
    used.add(chosen.step)
  }
  const byStep = new Map<number, string>()
  for (const [id, step] of byClause) byStep.set(step.step, id)
  const failed = [...steps].reverse().find((step) => /fail|give_up|declined/.test(step.status))
  const fallbackId = (failed && byStep.get(failed.step)) || points.find((point) => byClause.has(point.id))?.id || ''
  return { byClause, byStep, fallbackId }
}

function pointsOf(lines: { num: number; text: string }[], prefix: 'op' | 'ex') {
  return lines.flatMap((line) => markClauses(line.text).map((clause, index) => ({
    id: `${prefix}-${line.num}-${index + 1}`,
    verb: clause.verb,
    param: clause.param,
    skip: clause.skip,
  })))
}

function refId(ref: string) {
  const matched = ref.match(/^(操作|预期)\s*(\d+)\s*-\s*(\d+)$/)
  if (!matched) return ''
  return `${matched[1] === '预期' ? 'ex' : 'op'}-${matched[2]}-${matched[3]}`
}

function findClause(
  script: { op: { num: number; text: string }[]; ex: { num: number; text: string }[] },
  id: string,
) {
  const matched = id.match(/^(op|ex)-(\d+)-(\d+)$/)
  if (!matched) return null
  const lines = matched[1] === 'ex' ? script.ex : script.op
  const line = lines.find((item) => item.num === Number(matched[2]))
  const clause = line ? markClauses(line.text)[Number(matched[3]) - 1] : undefined
  if (!line || !clause) return null
  const stepRef = `${matched[1] === 'ex' ? '预期' : '操作'} ${line.num}-${matched[3]}`
  return { clause, stepRef }
}

function statusLabel(status: string) {
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
const skipChip: CSSProperties = { background: 'var(--w-warn-bg)' }
const onChip: CSSProperties = { outline: '2px solid var(--w-primary)', outlineOffset: 1 }
const verb: CSSProperties = { fontWeight: 750, color: '#312e81', marginRight: 3 }
const badge: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 15, height: 15, marginRight: 3,
  borderRadius: 4, color: '#fff', fontSize: 10, fontWeight: 800, fontStyle: 'normal', verticalAlign: '1px',
}
const stage: CSSProperties = {
  flex: 1, minHeight: 240, display: 'grid', gridTemplateColumns: 'minmax(280px, 1.2fr) minmax(220px, 0.8fr)',
  background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', overflow: 'hidden',
}
const shot: CSSProperties = { minHeight: 240, background: '#10141c', display: 'grid', placeItems: 'center', color: '#94a3b8' }
const params: CSSProperties = { padding: 16, borderLeft: '1px solid var(--w-border)', overflow: 'auto' }
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr)', gap: '10px 12px', margin: 0 }
const th: CSSProperties = { position: 'sticky', top: 0, textAlign: 'left', background: 'var(--w-fill)', color: 'var(--w-text-tertiary)', fontSize: 11, fontWeight: 750, padding: '7px 10px', borderBottom: '1px solid var(--w-border)' }
const td: CSSProperties = { padding: '7px 10px', borderBottom: '1px solid var(--w-border)', verticalAlign: 'middle' }
const refPill: CSSProperties = { fontWeight: 750, color: '#312e81', background: 'var(--w-primary-soft)', borderRadius: 999, padding: '2px 8px' }
