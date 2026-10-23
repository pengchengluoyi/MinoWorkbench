import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { onRealtimeMessage } from '@/lib/realtime'
import { Button, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'
import {
  cancelWork, createWork, decideWorkApproval, getWork, instructWork, listWork,
  patchWorkPlan, pauseWork, resolveWorkStep, retryWorkStep, resumeWork, takeoverWorkStep,
} from '@/api/work'
import type { WorkApproval, WorkDetail, WorkSummary } from '@/api/work'
import './WorkspaceWork.css'

const labels: Record<string, string> = {
  draft: '草稿', planning: '制定计划', running: '执行中', waiting_human: '等待你确认',
  blocked: '已阻塞', paused: '已暂停', done: '已完成', failed: '失败', cancelled: '已取消',
  pending: '等待', ready: '待执行', waiting: '等待中', skipped: '已跳过', unknown: '结果未知',
  'agent.plan': '制定计划', 'agent.turn': '角色回合', 'tool.call': '调用工具',
  'run.wait': '等待执行', 'human.approval': '等待确认', 'job.call': '委派角色',
  'work.review': '验收',
}
const active = new Set(['planning', 'running', 'waiting_human'])
const stepTone = (status: string) => status === 'done' ? 'done'
  : status === 'running' ? 'running'
  : ['failed', 'unknown'].includes(status) ? 'bad'
  : status === 'waiting' ? 'waiting' : 'idle'

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

function SummaryCard({ work, selected, onSelect }: {
  work: WorkSummary; selected: boolean; onSelect: () => void
}) {
  return <button type="button" className={'work-summary' + (selected ? ' is-selected' : '')} onClick={onSelect}>
    <span className={'work-dot work-dot--' + work.status} />
    <span className="work-summary-main">
      <strong>{work.title || work.goal}</strong>
      <small>{labels[work.status] || work.status}
        {work.progress.total ? ` · ${work.progress.done}/${work.progress.total}` : ''}
        {work.blocked_reason ? ` · ${work.blocked_reason}` : ''}</small>
    </span>
    <span className="work-summary-percent">{work.progress.percent}%</span>
  </button>
}

function ApprovalCard({ work, approval, onDecision, busy }: {
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
    </> : <p className="work-approval-lead">{approval.prompt || '工作已暂停在需要你决定的地方。'}</p>}
    <footer>
      <Button type="primary" disabled={busy} onClick={() => onDecision('approve')}>批准并继续</Button>
      <Button danger disabled={busy} onClick={() => onDecision('reject')}>驳回</Button>
      <span>批准的是这份计划和这一次具体参数；不会扩大范围。</span>
    </footer>
    <small className="work-muted">工作 {work.work_id.slice(-8)} · 审批 {approval.approval_id.slice(-8)}</small>
  </article>
}

type PlanStepDraft = { id: string; title: string; agent_id: string; intent: string }

function PlanEditor({ plan, acceptance, busy, onCancel, onSave }: {
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

export function WorkspaceWork({ projectId, topicId }: { projectId: string; topicId: string }) {
  const qc = useQueryClient()
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [goal, setGoal] = useState('')
  const [acceptanceText, setAcceptanceText] = useState('')
  const [filter, setFilter] = useState('all')
  const [editing, setEditing] = useState(false)
  const key = useMemo(() => ['workspace-work', projectId, topicId, filter], [projectId, topicId, filter])
  const list = useQuery({
    queryKey: key,
    queryFn: () => listWork(projectId, topicId, filter === 'all' ? '' : filter),
    enabled: !!projectId,
    retry: false,
    refetchInterval: q => q.state.data?.some(item => active.has(item.status)) ? 2500 : 15000,
  })
  useEffect(() => {
    if (!list.data?.length) { setSelected(''); return }
    if (!selected || !list.data.some(item => item.work_id === selected)) setSelected(list.data[0].work_id)
  }, [list.data, selected])
  const detail = useQuery({
    queryKey: ['workspace-work-detail', projectId, selected],
    queryFn: () => getWork(projectId, selected),
    enabled: !!selected,
    retry: false,
    refetchInterval: q => {
      const status = q.state.data?.status
      return status && active.has(status) ? 2500 : 15000
    },
  })
  useEffect(() => setEditing(false), [selected])
  useEffect(() => onRealtimeMessage(message => {
    if (message.type !== 'work_event') return
    const data = message.data as Record<string, unknown> | undefined
    if (!data || String(data.project_id || '') !== projectId) return
    void qc.invalidateQueries({ queryKey: key })
    if (selected && String(data.work_id || '') === selected) {
      void qc.invalidateQueries({ queryKey: ['workspace-work-detail', projectId, selected] })
    }
  }), [qc, projectId, selected, key])
  const mutation = useMutation({
    mutationFn: async (action: () => Promise<unknown>) => action(),
    onSuccess: async () => {
      setNote('')
      await qc.invalidateQueries({ queryKey: key })
      if (selected) await qc.invalidateQueries({ queryKey: ['workspace-work-detail', projectId, selected], exact: true })
    },
    onError: error => setNote(errText(error)),
  })
  const run = (action: () => Promise<unknown>) => mutation.mutate(action)
  const submitCreate = () => {
    const text = goal.trim()
    if (!text) return
    const acceptance = acceptanceText.split('\n').map(text => text.trim()).filter(Boolean)
    run(() => createWork(projectId, { goal: text, topic_id: topicId, acceptance }).then(item => {
      setGoal(''); setAcceptanceText(''); setCreating(false); setSelected(item.work_id)
      return item
    }))
  }
  const work = detail.data
  const pending = work?.approvals.filter(item => item.status === 'pending') || []
  const current = work?.steps.find(step => ['running', 'waiting'].includes(step.status))
  const issues = work?.steps.filter(step => ['failed', 'unknown'].includes(step.status)) || []
  return <section className="workspace-work" aria-label="工作项">
    <header className="work-header">
      <div>
        <span className="work-eyebrow">可接管的任务</span>
        <h2>{topicId ? '工作' : '项目工作'}</h2>
        <p>{topicId ? '先看计划，再执行；卡住时暂停、补充或接管。执行仍由 Scout 完成。' : '这里汇总项目下所有工作项；进入具体工作区后可以按工作区查看。'}</p>
      </div>
      <div className="work-header-actions">
        <Button size="small" onClick={() => setCreating(value => !value)}>{creating ? '取消' : '新建工作'}</Button>
        <Button size="small" onClick={() => { void list.refetch(); if (selected) void detail.refetch() }}>刷新</Button>
      </div>
    </header>
    {creating && <form className="work-create" onSubmit={event => { event.preventDefault(); submitCreate() }}>
      <label htmlFor={'work-goal-' + topicId}>新工作目标</label>
      <textarea id={'work-goal-' + topicId} value={goal} maxLength={4000}
        placeholder="例如：跑 api-1-227，拿到 run/session 证据；失败就停下来告诉我"
        onChange={event => setGoal(event.target.value)} />
      <label htmlFor={'work-acceptance-' + topicId}>验收标准（每行一条，可留空让计划补）</label>
      <textarea id={'work-acceptance-' + topicId} value={acceptanceText} maxLength={4000}
        placeholder="例如：有真实 run_id；有 run 终态；有 session 证据"
        onChange={event => setAcceptanceText(event.target.value)} />
      <Button htmlType="submit" size="small" type="primary" disabled={!goal.trim() || mutation.isPending}>创建工作</Button>
      <small>创建后先出计划，批准后才执行。{topicId ? '这项工作会绑定当前工作区。' : '这项工作属于项目级，不绑定具体工作区。'}</small>
    </form>}
    {list.isPending && <p role="status">正在读取工作项…</p>}
    {list.error && <p role="alert" className="work-error">读取工作项失败：{errText(list.error)}</p>}
    {!list.isPending && !list.error && !list.data?.length && <div className="work-empty">
      <strong>还没有工作项</strong>
      <p>在对话里提出多步任务（例如“跑回归、归类失败、出报告”），管家会创建工作项并先给出计划。</p>
    </div>}
    <div className="work-filters" role="tablist" aria-label="工作状态筛选">
      {[['all', '全部'], ['running', '进行中'], ['waiting_human', '待确认'], ['blocked', '阻塞'], ['done', '完成']].map(([value, label]) =>
        <button key={value} type="button" className={'work-filter' + (filter === value ? ' is-active' : '')}
          onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {!!list.data?.length && <div className="work-layout">
      <nav className="work-list" aria-label="工作项列表">
        {list.data.map(item => <SummaryCard key={item.work_id} work={item} selected={item.work_id === selected}
          onSelect={() => setSelected(item.work_id)} />)}
      </nav>
      <div className="work-detail">
        {detail.isPending && selected && <p role="status">正在读取详情…</p>}
        {detail.error && <p role="alert" className="work-error">读取详情失败：{errText(detail.error)}</p>}
        {work && <>
          <div className="work-detail-head">
            <div>
              <span className={'work-status work-status--' + work.status}>{labels[work.status] || work.status}</span>
              <h3>{work.title || work.goal}</h3>
              <p>{work.goal}</p>
            </div>
            <div className="work-actions">
              {!!work.plan.steps?.length && !['done', 'cancelled', 'failed'].includes(work.status) && <Button size="small"
                disabled={mutation.isPending} onClick={() => setEditing(value => !value)}>{editing ? '收起编辑' : '编辑计划'}</Button>}
              {['running', 'planning'].includes(work.status) && <Button size="small" disabled={mutation.isPending}
                onClick={() => run(() => pauseWork(projectId, work.work_id))}>暂停</Button>}
              {work.status === 'paused' && <Button size="small" type="primary" disabled={mutation.isPending}
                onClick={() => run(() => resumeWork(projectId, work.work_id))}>恢复</Button>}
              {work.status === 'blocked' && work.blocked_reason.startsWith('approval_rejected') && <Button size="small" disabled={mutation.isPending}
                onClick={() => run(() => resumeWork(projectId, work.work_id))}>重新提交审批</Button>}
              {!['done', 'cancelled', 'failed'].includes(work.status) && <Button size="small" danger disabled={mutation.isPending}
                onClick={() => run(() => cancelWork(projectId, work.work_id))}>取消</Button>}
            </div>
          </div>
          {note && <p className="work-error" role="alert">{note}</p>}
          <progress className="work-progress" aria-label="工作进度" max={Math.max(1, work.progress.total)} value={work.progress.done} />
          <p className="work-muted">{work.progress.done}/{work.progress.total} 步完成
            {work.blocked_reason ? ` · 卡住原因：${work.blocked_reason}` : ''}
            {work.spent?.tokens ? ` · 已用 ${work.spent.tokens} tokens` : ''}</p>
          {pending.map(approval => <ApprovalCard key={approval.approval_id} work={work} approval={approval}
            busy={mutation.isPending}
            onDecision={decision => run(() => decideWorkApproval(projectId, work.work_id, approval.approval_id, decision))} />)}
          {editing && <section className="work-section">
            <h4>编辑计划</h4>
            <PlanEditor key={work.plan_revision} plan={work.plan} acceptance={work.acceptance}
              busy={mutation.isPending} onCancel={() => setEditing(false)}
              onSave={(plan, acceptance) => run(() => patchWorkPlan(projectId, work.work_id, {
                plan, acceptance, expected_revision: work.plan_revision,
              }).then(() => setEditing(false)))} />
          </section>}
          {!!work.plan.steps?.length && <section className="work-section">
            <h4>计划</h4>
            <ol className="work-plan-list work-plan-list--compact">
              {work.plan.steps.map((step, index) => {
                const row = work.steps.find(item => item.plan_step_id === step.id)
                const tone = row ? stepTone(row.status) : index < work.plan_index ? 'done' : 'idle'
                return <li key={step.id} className={'is-' + tone}>
                  <span>{index + 1}</span>
                  <div><strong>{step.title}</strong><small>{step.agent_id} · {step.intent}</small></div>
                  <em>{row ? labels[row.status] || row.status : index < work.plan_index ? '已完成' : '未开始'}</em>
                </li>
              })}
            </ol>
          </section>}
          {current && <section className="work-section">
            <h4>现在在做什么</h4>
            <p><strong>{current.title}</strong> · {labels[current.kind] || current.kind} · {labels[current.status] || current.status}</p>
            {current.error && <p className="work-error">{current.error}</p>}
            {current.status === 'unknown' && <div className="work-unknown">
              <p>这一步的写结果无法确认；不会自动重放。请核对后再决定。</p>
              <Button size="small" onClick={() => run(() => resolveWorkStep(projectId, work.work_id, current.step_id, 'executed'))}>确认已执行</Button>
              <Button size="small" onClick={() => run(() => resolveWorkStep(projectId, work.work_id, current.step_id, 'not_executed'))}>确认未执行</Button>
            </div>}
            {current.status === 'failed' && <Button size="small" onClick={() => run(() => retryWorkStep(projectId, work.work_id, current.step_id))}>重试这一步</Button>}
            {['running', 'waiting'].includes(current.status) && <Button size="small" onClick={() => run(() => takeoverWorkStep(projectId, work.work_id, current.step_id))}>接管这一步</Button>}
          </section>}
          {!!issues.length && <section className="work-section work-issues">
            <h4>卡住的步骤</h4>
            {issues.map(step => <div key={step.step_id} className="work-issue">
              <div><strong>{step.title}</strong><small>{labels[step.status] || step.status}{step.error ? ' · ' + step.error : ''}</small></div>
              {step.status === 'unknown' ? <>
                <Button size="small" onClick={() => run(() => resolveWorkStep(projectId, work.work_id, step.step_id, 'executed'))}>确认已执行</Button>
                <Button size="small" onClick={() => run(() => resolveWorkStep(projectId, work.work_id, step.step_id, 'not_executed'))}>确认未执行</Button>
              </> : <Button size="small" onClick={() => run(() => retryWorkStep(projectId, work.work_id, step.step_id))}>重试</Button>}
            </div>)}
          </section>}
          <section className="work-section">
            <h4>证据</h4>
            {!work.artifacts.length && <p className="work-muted">还没有证据。执行结束后，run、session 和产物会出现在这里。</p>}
            {!!work.artifacts.length && <ul className="work-evidence">
              {work.artifacts.slice().reverse().map(item => <li key={item.artifact_id}>
                <span className="work-eyebrow">{item.kind}</span>
                {item.ref_type === 'run' && item.ref_id
                  ? <Link to={projectHref(projectId, { tab: 'tasks', run: item.ref_id })}>{item.title}</Link>
                  : <span>{item.title}</span>}
                {item.ref_type === 'session' && item.ref_id && <Link to={projectHref(projectId, { tab: 'session-log', session: item.ref_id })}>查看 Session</Link>}
              </li>)}
            </ul>}
          </section>
          {!!work.instructions.length && <section className="work-section">
            <h4>你补充的约束</h4>
            <ul className="work-instructions">{work.instructions.map((text, index) => <li key={index}>{text}</li>)}</ul>
          </section>}
          <form className="work-instruct" onSubmit={event => {
            event.preventDefault()
            const text = draft.trim()
            if (!text) return
            run(() => instructWork(projectId, work.work_id, text).then(() => setDraft('')))
          }}>
            <label htmlFor={'work-instruct-' + work.work_id}>补充指令</label>
            <textarea id={'work-instruct-' + work.work_id} value={draft} maxLength={1000}
              placeholder="例如：只跑 P0；先不要改生产代码；失败后停下来问我"
              onChange={event => setDraft(event.target.value)} />
            <Button htmlType="submit" size="small" disabled={!draft.trim() || mutation.isPending}>加入当前工作</Button>
          </form>
          <details className="work-events">
            <summary>事件记录（{work.events.length}）</summary>
            <ol>{work.events.slice().reverse().map(event => <li key={event.event_id}>
              <time dateTime={event.created_at}>{new Date(event.created_at).toLocaleTimeString()}</time>
              <span>{event.type}</span>
            </li>)}</ol>
          </details>
        </>}
      </div>
    </div>}
  </section>
}
