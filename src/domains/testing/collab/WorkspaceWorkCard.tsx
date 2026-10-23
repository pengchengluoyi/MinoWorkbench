import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { onRealtimeMessage } from '@/lib/realtime'
import { Button, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'
import {
  decideWorkApproval, getWork, handoffWork, patchWorkPlan, resolveWorkStep, retryWorkStep, takeoverWorkStep,
} from '@/api/work'
import type { WorkApproval, WorkDetail, WorkStep } from '@/api/work'
import type { WorkspaceMember } from './WorkspacePeople'
import './WorkspaceWork.css'
import './WorkspaceWorkCard.css'

function planPreview(approval: WorkApproval) {
  try {
    const parsed = JSON.parse(approval.prompt)
    if (parsed && typeof parsed === 'object') return parsed as {
      title?: string; steps?: { id: string; title: string; agent_id: string; intent: string }[]
      acceptance?: { id: string; text: string; required?: boolean }[]; risks?: string[]
    }
  } catch {
    // 普通文本审批没有 JSON 计划，直接显示原文。
  }
  return null
}

export function ApprovalCard({ work, approval, onDecision, busy }: {
  work: WorkDetail; approval: WorkApproval
  onDecision: (decision: 'approve' | 'reject') => void; busy: boolean
}) {
  const preview = planPreview(approval)
  return <article className="work-approval" role="alert">
    <header>
      <span className="work-eyebrow">需要你确认</span>
      <h3>{approval.title || '确认继续'}</h3>
    </header>
    {preview ? <>
      {preview.title && <p className="work-approval-lead">{preview.title}</p>}
      {!!preview.steps?.length && <ol className="work-plan-list">
        {preview.steps.map((step, index) => <li key={step.id || index}>
          <span>{index + 1}</span>
          <div><strong>{step.title}</strong><small>{step.agent_id} · {step.intent}</small></div>
        </li>)}
      </ol>}
      {!!preview.acceptance?.length && <div className="work-acceptance">
        <span>验收</span>
        <ul>{preview.acceptance.map(item => <li key={item.id}>{item.text}</li>)}</ul>
      </div>}
      {!!preview.risks?.length && <p className="work-risk">风险：{preview.risks.join('；')}</p>}
    </> : <p className="work-approval-lead">{approval.prompt || '这项工作需要你决定下一步。'}</p>}
    <footer>
      <Button type="primary" disabled={busy} onClick={() => onDecision('approve')}>批准并继续</Button>
      <Button danger disabled={busy} onClick={() => onDecision('reject')}>驳回</Button>
      <span>批准的是这份计划和这一次具体参数；不会扩大范围。</span>
    </footer>
    <small className="work-muted">工作 {work.work_id.slice(-8)} · 审批 {approval.approval_id.slice(-8)}</small>
  </article>
}

export type PlanStepDraft = { id: string; title: string; agent_id: string; intent: string }

export function PlanEditor({ plan, acceptance, busy, onCancel, onSave }: {
  plan: { title?: string; steps?: PlanStepDraft[]; risks?: string[] }
  acceptance: { id: string; text: string }[]
  busy: boolean
  onCancel: () => void
  onSave: (plan: { title: string; steps: PlanStepDraft[]; risks: string[] },
    acceptance: { id: string; text: string; required: boolean }[]) => void
}) {
  const [title, setTitle] = useState(plan.title || '')
  const [steps, setSteps] = useState<PlanStepDraft[]>(plan.steps?.length ? plan.steps : [
    { id: 'p1', title: '', agent_id: 'conductor', intent: '' },
  ])
  const [risks, setRisks] = useState((plan.risks || []).join('\n'))
  const [criteria, setCriteria] = useState(acceptance.map(item => item.text).join('\n'))
  const update = (index: number, patch: Partial<PlanStepDraft>) => setSteps(rows => rows.map(
    (row, i) => i === index ? { ...row, ...patch } : row))
  const remove = (index: number) => setSteps(rows => rows.length <= 1 ? rows : rows.filter((_, i) => i !== index))
  const add = () => setSteps(rows => [
    ...rows, { id: 'p' + (rows.length + 1), title: '', agent_id: 'conductor', intent: '' },
  ])
  const valid = title.trim() && steps.every(step => step.title.trim() && step.intent.trim())
    && criteria.split('\n').some(text => text.trim())
  return <form className="work-plan-editor" onSubmit={event => {
    event.preventDefault()
    if (!valid) return
    onSave({
      title: title.trim(),
      steps: steps.map(step => ({ ...step, title: step.title.trim(), intent: step.intent.trim() })),
      risks: risks.split('\n').map(text => text.trim()).filter(Boolean),
    }, criteria.split('\n').map(text => text.trim()).filter(Boolean)
      .map((text, index) => ({ id: 'a' + (index + 1), text, required: true })))
  }}>
    <label>计划标题<input value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
    <div className="work-plan-editor-steps">
      {steps.map((step, index) => <div className="work-plan-editor-step" key={index}>
        <span>{index + 1}</span>
        <div>
          <input aria-label={'步骤 ' + (index + 1) + ' 标题'} value={step.title} maxLength={160}
            placeholder="步骤标题" onChange={event => update(index, { title: event.target.value })} />
          <input aria-label={'步骤 ' + (index + 1) + ' 角色'} value={step.agent_id} maxLength={64}
            placeholder="角色 id，例如 test-engineer" onChange={event => update(index, { agent_id: event.target.value })} />
          <textarea aria-label={'步骤 ' + (index + 1) + ' 说明'} value={step.intent} maxLength={1200}
            placeholder="这一步具体做什么、产出什么" onChange={event => update(index, { intent: event.target.value })} />
        </div>
        <Button size="small" disabled={steps.length <= 1} onClick={() => remove(index)}>删除</Button>
      </div>)}
    </div>
    <Button size="small" onClick={add}>加一步</Button>
    <label>验收标准（每行一条）
      <textarea value={criteria} maxLength={4000} onChange={event => setCriteria(event.target.value)} />
    </label>
    <label>风险 / 需要确认（每行一条）
      <textarea value={risks} maxLength={2000} onChange={event => setRisks(event.target.value)} />
    </label>
    <div className="work-plan-editor-actions">
      <Button htmlType="submit" type="primary" size="small" disabled={!valid || busy}>保存并重新审批</Button>
      <Button size="small" disabled={busy} onClick={onCancel}>取消</Button>
      <small>保存后旧审批作废，按新计划重新审批；不会直接执行。</small>
    </div>
  </form>
}

const labels: Record<string, string> = {
  draft: '草稿', planning: '制定计划', running: '执行中', waiting_human: '等待你确认',
  blocked: '已阻塞', paused: '已暂停', done: '已完成', failed: '失败', cancelled: '已取消',
  pending: '等待', ready: '待执行', waiting: '等待中', skipped: '已跳过', unknown: '结果未知',
  'agent.plan': '制定计划', 'agent.turn': '角色回合', 'tool.call': '调用工具',
  'run.wait': '等待执行', 'human.approval': '等待确认', 'job.call': '委派角色',
  'work.review': '验收',
}
const active = new Set(['planning', 'running', 'waiting_human'])
const terminal = new Set(['done', 'cancelled', 'failed'])
const stepTone = (status: string) => status === 'done' ? 'done'
  : status === 'running' ? 'running'
  : ['failed', 'unknown'].includes(status) ? 'bad'
  : status === 'waiting' ? 'waiting' : 'idle'

type Criterion = { id?: string; met?: boolean; note?: string }
type HandoffMember = Pick<WorkspaceMember, 'id' | 'sender_name' | 'label'>

function reviewOf(work: WorkDetail) {
  return (work.review || {}) as { verdict?: string; criteria?: Criterion[]; summary?: string }
}

function StepLine({ step, index, planStep }: { step?: WorkStep; index: number; planStep: { title: string; agent_id: string; intent: string } }) {
  const tone = step ? stepTone(step.status) : 'idle'
  const text = step ? labels[step.status] || step.status : '未开始'
  return <li className={'is-' + tone}>
    <span>{step?.status === 'done' ? '✓' : index + 1}</span>
    <div><strong>{planStep.title}</strong><small>{planStep.agent_id} · {planStep.intent}</small></div>
    <em>{text}</em>
  </li>
}

export function WorkspaceWorkCard({ projectId, topicId, workId, members, readOnly, onError }: {
  projectId: string
  topicId: string
  workId: string
  members: WorkspaceMember[]
  readOnly: boolean
  onError?: (message: string) => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [handoffOpen, setHandoffOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [note, setNote] = useState('')
  const detailKey = useMemo(() => ['workspace-work-card', projectId, workId], [projectId, workId])
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: () => getWork(projectId, workId),
    enabled: !!projectId && !!workId,
    retry: false,
    refetchInterval: q => q.state.data && active.has(q.state.data.status) ? 2500 : 15000,
  })
  useEffect(() => onRealtimeMessage(message => {
    if (message.type !== 'work_event') return
    const data = message.data as Record<string, unknown> | undefined
    if (!data || String(data.work_id || '') !== workId) return
    void qc.invalidateQueries({ queryKey: detailKey })
  }), [qc, detailKey, workId])
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setEditing(false)
      setHandoffOpen(false)
      setNote('')
      await qc.invalidateQueries({ queryKey: detailKey, exact: true })
      await qc.invalidateQueries({ queryKey: ['workspaces-v7', projectId] })
    },
    onError: error => onError?.(errText(error)),
  })
  const run = (action: () => Promise<unknown>) => mutation.mutate(action)
  const work = detail.data
  if (detail.isPending) return <div className="work-chat-card is-loading" role="status">正在读取工作…</div>
  if (detail.error) return <div className="work-chat-card work-error" role="alert">工作读取失败：{errText(detail.error)}</div>
  if (!work) return null
  const pending = work.approvals.filter(item => item.status === 'pending')
  const planSteps = work.plan.steps || []
  const stepOf = (planId: string) => work.steps.find(item => item.plan_step_id === planId && !item.parent_step_id)
  const doneSteps = planSteps.filter(step => stepOf(step.id)?.status === 'done')
  const current = work.steps.find(step => ['running', 'waiting'].includes(step.status) && !step.parent_step_id)
  const issues = work.steps.filter(step => ['failed', 'unknown'].includes(step.status))
  const review = reviewOf(work)
  const handoffs = work.events.filter(event => event.type === 'work.handoff')
  const memberName = (id: unknown) => {
    const member = members.find(row => row.id === String(id || ''))
    return member?.sender_name || member?.label || String(id || '')
  }
  const handoffTargets: HandoffMember[] = members.map(member => ({ id: member.id, sender_name: member.sender_name, label: member.label }))
  return <section className="work-chat-card" aria-label={'工作：' + (work.title || work.goal)}>
    <header className="work-chat-head">
      <div className="work-chat-title">
        <span className={'work-status work-status--' + work.status}>{labels[work.status] || work.status}</span>
        <strong>{work.title || work.goal}</strong>
      </div>
      <span className="work-chat-count">{work.progress.done}/{work.progress.total} 步</span>
    </header>
    <progress className="work-progress" aria-label="工作进度" max={Math.max(1, work.progress.total)} value={work.progress.done} />
    <p className="work-chat-goal">{work.goal}</p>
    {work.blocked_reason && <p className="work-chat-blocked">卡住：{work.blocked_reason}</p>}
    {!!doneSteps.length && <div className="work-chat-done">
      <span>已完成</span>
      <ul>{doneSteps.map(step => <li key={step.id}>✓ {step.title}</li>)}</ul>
    </div>}
    {!!planSteps.length && <div className="work-chat-section">
      <h4>计划进度</h4>
      <ol className="work-plan-list work-plan-list--compact">
        {planSteps.map((step, index) => <StepLine key={step.id} step={stepOf(step.id)} planStep={step} index={index} />)}
      </ol>
    </div>}
    {current && <div className="work-chat-section">
      <h4>现在在做什么</h4>
      <p><strong>{current.title}</strong> · {labels[current.kind] || current.kind} · {labels[current.status] || current.status}</p>
      {current.error && <p className="work-error">{current.error}</p>}
      {!readOnly && ['running', 'waiting'].includes(current.status) && <Button size="small"
        disabled={mutation.isPending} onClick={() => run(() => takeoverWorkStep(projectId, work.work_id, current.step_id))}>接管这一步</Button>}
    </div>}
    {!!pending.length && <div className="work-chat-section">
      <h4>需要你确认</h4>
      {pending.map(approval => <ApprovalCard key={approval.approval_id} work={work} approval={approval}
        busy={mutation.isPending || readOnly}
        onDecision={decision => run(() => decideWorkApproval(projectId, work.work_id, approval.approval_id, decision))} />)}
    </div>}
    {!!issues.length && <div className="work-chat-section">
      <h4>卡住的步骤</h4>
      {issues.map(step => <div key={step.step_id} className="work-chat-issue">
        <div><strong>{step.title}</strong><small>{labels[step.status] || step.status}{step.error ? ' · ' + step.error : ''}</small></div>
        {!readOnly && (step.status === 'unknown' ? <>
          <Button size="small" disabled={mutation.isPending} onClick={() => run(() => resolveWorkStep(projectId, work.work_id, step.step_id, 'executed'))}>确认已执行</Button>
          <Button size="small" disabled={mutation.isPending} onClick={() => run(() => resolveWorkStep(projectId, work.work_id, step.step_id, 'not_executed'))}>确认未执行</Button>
        </> : <Button size="small" disabled={mutation.isPending} onClick={() => run(() => retryWorkStep(projectId, work.work_id, step.step_id))}>重试</Button>)}
      </div>)}
    </div>}
    {work.status === 'done' && <div className="work-chat-review">
      <span className="work-eyebrow">验收结果</span>
      <strong>{review.verdict === 'done' ? '工作已完成' : '已给出验收结论'}</strong>
      {review.summary && <p>{review.summary}</p>}
      {!!review.criteria?.length && <ul>{review.criteria.map((item, index) => <li key={item.id || index} className={item.met ? 'is-met' : 'is-unmet'}>
        {item.met ? '✓' : '○'} {item.note || item.id}
      </li>)}</ul>}
    </div>}
    {!!work.artifacts.length && <details className="work-chat-evidence">
      <summary>证据（{work.artifacts.length}）</summary>
      <ul className="work-evidence">{work.artifacts.slice().reverse().map(item => <li key={item.artifact_id}>
        <span className="work-eyebrow">{item.kind}</span>
        {item.ref_type === 'run' && item.ref_id
          ? <Link to={projectHref(projectId, { tab: 'tasks', run: item.ref_id })}>{item.title}</Link>
          : <span>{item.title}</span>}
        {item.ref_type === 'session' && item.ref_id && <Link to={projectHref(projectId, { tab: 'session-log', session: item.ref_id })}>查看 Session</Link>}
      </li>)}</ul>
    </details>}
    {!!handoffs.length && <div className="work-chat-handoffs">
      <span>交接记录</span>
      {handoffs.slice().reverse().map(event => <p key={event.event_id}>
        已交给 <strong>{memberName((event.payload || {}).to)}</strong>
        {(event.payload || {}).note ? ` · ${String((event.payload || {}).note)}` : ''}
      </p>)}
    </div>}
    {!readOnly && <div className="work-chat-actions">
      {!terminal.has(work.status) && <Button size="small" disabled={mutation.isPending} onClick={() => setHandoffOpen(value => !value)}>交接给成员</Button>}
      {!!planSteps.length && !terminal.has(work.status) && <Button size="small" disabled={mutation.isPending} onClick={() => setEditing(value => !value)}>{editing ? '收起计划' : '编辑计划'}</Button>}
    </div>}
    {handoffOpen && <form className="work-chat-handoff" onSubmit={event => {
      event.preventDefault()
      if (!target) return
      run(() => handoffWork(projectId, topicId, workId, target, note))
    }}>
      <label>交给<select value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">选择群成员</option>
        {handoffTargets.map(member => <option key={member.id} value={member.id}>{member.sender_name || member.label || member.id}</option>)}
      </select></label>
      <label>交接说明<input value={note} maxLength={1000} placeholder="例如：接手后续回归，先看我刚跑的 run" onChange={event => setNote(event.target.value)} /></label>
      <div><Button htmlType="submit" size="small" type="primary" disabled={!target || mutation.isPending}>确认交接</Button>
        <Button size="small" onClick={() => setHandoffOpen(false)}>取消</Button></div>
      <small>会在聊天里 @ 对方，并把交接记录写进这项工作。</small>
    </form>}
    {editing && <PlanEditor key={work.plan_revision} plan={work.plan} acceptance={work.acceptance} busy={mutation.isPending}
      onCancel={() => setEditing(false)} onSave={(plan, acceptance) => run(() => patchWorkPlan(projectId, work.work_id, {
        plan, acceptance, expected_revision: work.plan_revision,
      }).then(() => setEditing(false)))} />}
  </section>
}
