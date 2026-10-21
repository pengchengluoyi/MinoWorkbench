import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { MessageCircle, Bell, CornerDownRight, Clock3 } from 'lucide-react'
import { Button, Empty, Input, Segmented, Skeleton, StatusPill, useFeedback, errText } from '@/ui'
import { getAssistantRequests, respondAssistantRequest, cancelAssistantRequest, focusAssistantRequest, type PendingAssistantRequest, type MinoCard } from '@/api/assistant'
import { assistantKeys } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { MinoCardView } from './MinoCardView'
import { ScopeEditor } from './ScopeEditor'
import { fmtTime, channelLabel } from './format'

const LABELS: Record<string, string> = { env_surface: '应用渠道', app_id: '应用', project_id: '项目', sn: '执行设备', module: '测试模块', task_id: '任务' }
const TASK_STATES: Record<string, string> = { queued: '排队中', pending: '等待执行', running: '执行中', done: '已完成', failed: '执行失败', cancelled: '已取消', cancelling: '停止中', unknown: '状态待确认' }
const STATES: Record<string, string> = { need_input: '等待补充', resolving: '正在校验', submitted: '已提交', expired: '已过期', cancelled: '已撤销', failed: '未执行', uncertain: '结果待确认', done: '已完成' }

function RequestItem({ item, focused, taskFocused, onResult }: { item: PendingAssistantRequest; focused: boolean; taskFocused: boolean; onResult: (card: MinoCard) => void }) {
  const [text, setText] = useState('')
  const qc = useQueryClient()
  const feedback = useFeedback()
  const refresh = () => { void qc.invalidateQueries({ queryKey: assistantKeys.all }) }
  const respond = useMutation({
    mutationFn: (value: string) => respondAssistantRequest(item.id, item.revision, { [item.question.field || '']: value }),
    onSuccess: (data) => { onResult(data.card); setText(''); refresh() },
    onError: (error) => { feedback.fail(errText(error)); refresh() },
  })
  const cancel = useMutation({
    mutationFn: () => cancelAssistantRequest(item.id, item.revision),
    onSuccess: refresh,
    onError: (error) => { feedback.fail(errText(error)); refresh() },
  })
  const focusTask = useMutation({
    mutationFn: () => focusAssistantRequest(item.id),
    onSuccess: refresh,
    onError: (error) => feedback.fail(errText(error)),
  })
  const choices = item.question.candidates || []
  const pending = item.state === 'need_input'
  const expired = item.expires_at <= Date.now() / 1000
  const appId = typeof item.args.app_id === 'string' ? item.args.app_id : ''
  const hasTask = !!item.task_id
  return (
    <article className="w-surface-card" style={{ padding: 18, borderLeft: `3px solid ${pending ? 'var(--w-warn)' : 'var(--w-primary)'}` }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {pending ? <CornerDownRight size={16} /> : <Bell size={16} />}
          <strong>{pending ? `请补充${LABELS[item.question.field || ''] || '执行信息'}` : hasTask ? '测试任务' : '请求状态'}</strong>
          <StatusPill status={pending ? 'warn' : item.state === 'failed' || item.state === 'uncertain' ? 'fail' : hasTask && item.task_status === 'done' ? 'pass' : hasTask && item.task_status === 'failed' ? 'fail' : item.state === 'submitted' ? 'running' : 'muted'}>{hasTask ? TASK_STATES[item.task_status || ''] || '已提交' : STATES[item.state] || item.state}</StatusPill>
          {focused || taskFocused ? <span style={{ color: 'var(--w-primary)', fontSize: 12 }}>{taskFocused ? '会话当前任务' : '会话当前请求'}</span> : null}
        </div>
        <span style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{item.origin.channel ? channelLabel(item.origin.channel) : '平台请求'} · {item.origin.chat_id_masked}</span>
      </div>
      <div className="flex flex-wrap gap-3" style={{ margin: '10px 0', fontSize: 13, color: 'var(--w-text-secondary)' }}>
        {(['app_id', 'env_surface', 'env_profile', 'module', 'sn'] as const).map((key) => item.args[key] ? <span key={key}>{({ app_id: '应用', env_surface: '渠道', env_profile: '环境', module: '模块', sn: '设备' })[key]}：{key === 'app_id' ? item.display?.app || String(item.args[key]) : key === 'env_surface' ? item.display?.channel || String(item.args[key]) : String(item.args[key])}</span> : null)}
        {Array.isArray(item.args.modules) && !item.args.module ? <span>模块：{item.args.modules.join('、')}</span> : null}
        {Array.isArray(item.args.case_ids) ? <span>范围：{item.args.case_ids.length} 条用例</span> : null}
      </div>
      {pending ? (
        <div style={{ background: 'var(--w-warn-bg)', padding: 12, borderRadius: 'var(--w-radius-md)' }}>
          <p style={{ margin: '0 0 10px', fontSize: 13 }}>选择后会校验最新配置与资源，并继续执行原请求。</p>
          {choices.length ? <div className="flex flex-wrap gap-2">{choices.map((choice, index) => (
            <Button key={choice.value} disabled={respond.isPending || cancel.isPending || expired} onClick={() => respond.mutate(choice.value)}>
              {index + 1}. {choice.label}
            </Button>
          ))}</div> : <div className="flex gap-2"><Input aria-label="补充执行信息" value={text} onChange={(event) => setText(event.target.value)} onPressEnter={() => text.trim() && respond.mutate(text.trim())} placeholder={`输入${LABELS[item.question.field || ''] || '所需信息'}`} /><Button type="primary" disabled={!text.trim() || expired} loading={respond.isPending} onClick={() => respond.mutate(text.trim())}>补充并继续</Button></div>}
          <ScopeEditor item={item} onResult={onResult} disabled={respond.isPending || cancel.isPending || expired} />
          <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
            <span className="flex items-center gap-1" style={{ fontSize: 12, color: 'var(--w-text-tertiary)' }}><Clock3 size={12} />{expired ? '已过期，请重新发起请求' : `有效至 ${fmtTime(item.expires_at)}`}</span>
            <Button size="small" disabled={respond.isPending} loading={cancel.isPending} onClick={() => cancel.mutate()}>撤销本次请求</Button>
          </div>
        </div>
      ) : hasTask ? (
        <div className="flex justify-between flex-wrap gap-2" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 13 }}>任务 {item.task_id}{item.task_status ? ` · ${TASK_STATES[item.task_status] || '状态待确认'}` : ''}</span>
          <div className="flex gap-3 items-center"><Button size="small" disabled={taskFocused} loading={focusTask.isPending} onClick={() => focusTask.mutate()}>{taskFocused ? '已关注该任务' : '关注该任务'}</Button>
          {appId ? <Link to={`/testing/${encodeURIComponent(appId)}?tab=tasks&run=${encodeURIComponent(item.task_id)}`}>查看执行结果</Link> : null}</div>
        </div>
      ) : item.result?.problem ? <div style={{ marginTop: 12, padding: 12, background: 'var(--w-fill)', borderRadius: 'var(--w-radius-md)' }}><strong>{item.state === 'uncertain' ? '受理状态待确认' : '本次请求未完成'}</strong><div style={{ marginTop: 10, fontSize: 13 }}><strong style={{ display: 'block', marginBottom: 4 }}>问题</strong><div style={{ whiteSpace: 'pre-line', lineHeight: 1.8 }}>{item.result.problem}</div></div>{item.result.next_steps?.length ? <div style={{ marginTop: 10 }}><strong style={{ fontSize: 13 }}>接下来</strong><ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>{item.result.next_steps.map((step) => <li key={step}>{step}</li>)}</ol></div> : null}</div> : item.state === 'uncertain' ? <p style={{ color: 'var(--w-warn)', fontSize: 13 }}>操作结果尚未确认，请查询任务记录；系统不会重复创建。</p> : null}
    </article>
  )
}

export function RequestsSection({ nodeId }: { nodeId?: string }) {
  const [filter, setFilter] = useState('active')
  const [result, setResult] = useState<MinoCard | null>(null)
  const query = useQuery({ queryKey: [...assistantKeys.all, 'requests', nodeId || ''], queryFn: () => getAssistantRequests(nodeId), refetchInterval: 10_000, retry: 1 })
  if (query.isLoading) return <Skeleton active paragraph={{ rows: 5 }} />
  if (query.isError) return <QueryProblem error={query.error} what="执行请求" onRetry={() => void query.refetch()} />
  const items = query.data?.items || []
  const visible = items.filter((item) => filter === 'all' || (filter === 'pending' ? item.state === 'need_input' : ['need_input', 'resolving', 'uncertain', 'cancelling'].includes(item.state) || (!!item.task_id && !['done', 'completed', 'failed', 'cancelled', 'canceled'].includes(item.task_status || ''))))
  return <div>
    <div className="flex items-start justify-between flex-wrap gap-3" style={{ margin: '16px 0' }}>
      <div><strong className="flex items-center gap-2"><MessageCircle size={16} />执行进度</strong></div>
      <Segmented value={filter} onChange={(value) => setFilter(String(value))} options={[{ label: '当前请求', value: 'active' }, { label: '等待补充', value: 'pending' }, { label: '全部记录', value: 'all' }]} />
    </div>
    {result ? <div style={{ marginBottom: 16 }}><div className="flex justify-between items-center" style={{ marginBottom: 6 }}><strong>最近一次处理结果</strong><Button type="text" size="small" onClick={() => setResult(null)}>收起回复</Button></div><MinoCardView card={result} /></div> : null}
    <div className="flex flex-col gap-3">{visible.map((item) => <RequestItem key={item.id} item={item} onResult={setResult} focused={['need_input', 'resolving'].includes(item.state) && !!query.data?.focuses.some((focus) => focus.request_id === item.id)} taskFocused={!!item.task_id && !!query.data?.focuses.some((focus) => focus.task_id === item.task_id)} />)}</div>
    {!visible.length ? <Empty description="当前没有待处理请求。在 IM 中说明要测试的应用和模块即可开始。" /> : null}
  </div>
}
