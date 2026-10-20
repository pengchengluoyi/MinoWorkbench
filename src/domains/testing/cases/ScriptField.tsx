import { Fragment, type ReactNode } from 'react'
import { Info, MousePointer2, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react'
import { originalLines, summaryTasks, type AutomationDetail, type PreviewParameter, type PreviewTask, type ScriptKind } from './caseUnderstanding'
import { displayParameters, parameterLabel, sourceAnchor } from './caseAnnotations'
import './ScriptField.css'

export type ScriptInteraction = {
  activeTaskId?: string
  idOf: (task: PreviewTask, number: number) => string
  onPick: (task: PreviewTask, number: number) => void
  onInspect: (task: PreviewTask, number: number) => void
  turnsOf: (task: PreviewTask, number: number) => number
  statusOf?: (task: PreviewTask, number: number) => string
}

export type { AutomationDetail } from './caseUnderstanding'

export function ScriptField({ value, kind, compiled, automation, tasks: suppliedTasks, resourceParameters = [], resolved, status = 'ready', onRetry, compact = false, interaction, emptyResultText }: {
  value: unknown
  kind: ScriptKind
  compiled?: unknown
  automation?: AutomationDetail[]
  tasks?: PreviewTask[]
  resourceParameters?: PreviewParameter[]
  resolved?: boolean
  status?: 'ready' | 'loading' | 'pending' | 'error' | 'cancelled' | 'incomplete'
  onRetry?: () => void
  compact?: boolean
  interaction?: ScriptInteraction
  emptyResultText?: string
}) {
  const lines = originalLines(value)
  const tasks = suppliedTasks ?? summaryTasks(compiled, automation, kind, lines)
  const unlinked = tasks.filter(task => !lines.some(line => line.num === task.step))
  const hasResults = resolved ?? tasks.length > 0
  return <div className={`case-script-field${compact ? ' is-compact' : ''}`} onClick={event => event.stopPropagation()}>
    {!lines.length ? <p className="case-script-empty">{kind === 'pre' ? '无额外前置条件' : '原文未返回'}</p> : null}
    <div className="case-script-lines">
      {lines.map((line, index) => {
        const items = tasks.filter(task => task.step === line.num)
        const executable = items.filter(task => !task.blocked).length
        const blocked = items.filter(task => task.blocked).length
        const advisory = items.filter(task => task.tone === 'advisory' && !task.blocked).length
        return <section key={`${line.num}-${index}`} className="case-script-step" aria-label={`原文步骤 ${line.num}`}>
          <p className="case-script-original"><span className="case-script-step-number" aria-label={`步骤 ${line.num}`}>{line.num}</span><AnnotatedSource text={line.text} tasks={items} interaction={interaction} />
            {(items.length > 1 || blocked > 0 || advisory > 0) && kind !== 'pre' ? <span className="case-script-count">{kind === 'ex' ? `${executable} 项校验` : `${executable} 个任务`}{advisory ? ` · ${advisory} 处提示` : ''}{blocked ? ` · ${blocked} 处待处理` : ''}</span> : null}
          </p>
        </section>
      })}
    </div>
    {unlinked.length ? <div className="case-script-unlinked"><span>未关联原文编号的解析记录</span><p>{unlinked.map((task, index) => <TaskAnnotation key={`${task.id}-${index}`} task={task} number={unlinked.slice(0, index + 1).filter(item => item.step === task.step).length} interaction={interaction} unlocated />)}</p></div> : null}
    {resourceParameters.length ? <div className="case-resource-summary"><p><span>资源准备：</span>{resourceParameters.map((parameter, index) => <span className="case-resource-parameter" key={`${parameter.label}-${index}`}>{parameter.label}：{parameter.value}{parameter.origin === 'inferred' ? <small className="case-parameter-origin">原文推断</small> : null}</span>)}</p></div> : null}
    {status !== 'ready' || (kind !== 'pre' && !hasResults) ? <div className="case-script-notice" data-status={status} role={status === 'error' ? 'alert' : 'status'}>
      <Info size={12} /><span>{status === 'pending' ? '正在解析，完成后显示事件标注' : status === 'loading' ? '正在读取已保存的解析结果' : status === 'error' ? '解析结果读取失败，原文仍可查看' : status === 'cancelled' ? '本次解析已停止' : status === 'incomplete' ? '缺少必要字段，补全列映射后重新解析' : emptyResultText || '暂无保存的解析结果，原文完整保留'}</span>
      {status === 'error' && onRetry ? <button type="button" onClick={onRetry}>重试</button> : null}
    </div> : null}
  </div>
}

function AnnotatedSource({ text, tasks, interaction }: { text: string; tasks: PreviewTask[]; interaction?: ScriptInteraction }) {
  const anchored = tasks.map((task, index) => ({ task, number: index + 1, end: sourceAnchor(text, task.source) }))
  const endpoints = [...new Set(anchored.flatMap(item => item.end === null ? [] : [item.end]))].sort((a, b) => a - b)
  const output: ReactNode[] = []
  let cursor = 0
  for (const end of endpoints) {
    output.push(<span className="case-source-text" key={`text-${cursor}`}>{text.slice(cursor, end)}</span>)
    for (const item of anchored.filter(item => item.end === end)) output.push(<TaskAnnotation key={`task-${item.number}`} task={item.task} number={item.number} interaction={interaction} />)
    cursor = end
  }
  if (cursor < text.length) output.push(<span className="case-source-text" key={`text-${cursor}`}>{text.slice(cursor)}</span>)
  for (const item of anchored.filter(item => item.end === null)) output.push(<TaskAnnotation key={`task-${item.number}`} task={item.task} number={item.number} interaction={interaction} originalText={text} unlocated />)
  return <>{output}</>
}

function TaskAnnotation({ task, number, unlocated = false, interaction, originalText = '' }: { task: PreviewTask; number: number; unlocated?: boolean; interaction?: ScriptInteraction; originalText?: string }) {
  const parameters = displayParameters(task)
  const Icon = task.blocked ? TriangleAlert : task.tone === 'advisory' ? Info : task.tone === 'logic' ? Sparkles : task.tone === 'check' ? ShieldCheck : task.tone === 'condition' ? Info : MousePointer2
  const normalizeSummary = (value: string) => value.trim().replace(/[。.!！;；]+$/, '')
  const repeatsSource = !!originalText && task.summaryOnly && !task.blocked && !task.source && normalizeSummary(task.title) === normalizeSummary(originalText)
  const displayTitle = repeatsSource ? task.tone === 'check' ? '校验' : '执行任务' : task.title
  const readingCondition = task.tone === 'condition' && task.summaryOnly
  const selected = !!interaction && interaction.activeTaskId === interaction.idOf(task, number)
  const status = interaction?.statusOf?.(task, number)
  const heading = <><Icon size={11} /><strong>{readingCondition ? '条件' : `${number} · ${displayTitle}`}</strong></>
  return <span className="case-task-annotation" data-tone={task.tone} data-task-id={task.id} data-selected={selected || undefined} data-result={status} title={`${task.summaryOnly ? readingCondition ? '按原文整理的展示条件' : '服务端解析摘要' : '服务端结构化任务'}；${task.source ? `依据：${task.source}` : task.summaryOnly ? `摘要：${task.title}；接口未返回片段依据` : '接口未返回解析依据'}`}>
    <span className={`case-task-heading${displayTitle.length <= 22 ? ' is-short' : ''}`}>{interaction ? <button type="button" className="case-task-select" aria-pressed={selected} onClick={() => interaction.onPick(task, number)}>{heading}</button> : heading}</span>
    {parameters.map((parameter, index) => <Fragment key={`${parameter.label}-${index}`}><span className="case-task-separator"> · </span><span className={`case-task-parameter${parameterLabel(parameter.label).length + parameter.value.length <= 18 && !parameter.value.includes('\n') ? ' is-short' : ''}`}><span className={`case-task-parameter-label${parameterLabel(parameter.label).length <= 12 ? ' is-short' : ''}`}>{parameterLabel(parameter.label)}：</span>{parameter.value}{parameter.origin === 'inferred' ? <small className="case-parameter-origin">原文推断</small> : null}</span></Fragment>)}
    {task.titleInferred ? <span className="case-task-origin"> · 方式由原文推断</span> : null}
    {interaction ? <button type="button" className="case-task-inspect" onClick={() => interaction.onInspect(task, number)}>{interaction.turnsOf(task, number) ? `${interaction.turnsOf(task, number)} 个回合` : '查看回合'}</button> : null}
    {task.blocked ? <span className="case-task-state"> · 待处理</span> : null}
    {task.reason && task.reason !== task.title ? <span className="case-task-reason"> · {task.reason}</span> : null}
    {task.summaryOnly && !readingCondition && !task.blocked ? <span className="case-task-summary-only"> · {repeatsSource ? '同义摘要' : '解析摘要'}</span> : null}
    {unlocated && !repeatsSource ? <span className="case-task-location"> · 未定位原文片段{task.source ? `「${task.source}」` : ''}</span> : null}
  </span>
}
