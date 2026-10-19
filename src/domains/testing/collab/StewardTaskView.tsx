import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, Space, StatusPill, Tag, toStatusKind } from '@/ui'
import type { CollabActivity, CollabMessage, CollabTopic, CollabWorkItem } from '@/api/collab'
import { projectHref } from '../workbench/projectNavigation'
import { filterStewardChatMessages } from './chatMessageFilter'

type Tab = 'runs' | 'activity' | 'chat'

export function StewardTaskView({
  projectId,
  topic,
  appId,
  messages,
  workItems,
  activities,
  sendLoading = false,
  actionLoading = false,
  onSend,
  onPause,
  onResume,
  onClose,
  onDelete,
  onRetry,
}: {
  projectId: string
  topic: CollabTopic
  appId?: string
  messages: CollabMessage[]
  workItems: CollabWorkItem[]
  activities: CollabActivity[]
  sendLoading?: boolean
  actionLoading?: boolean
  onSend: (text: string) => Promise<unknown>
  onPause: () => void
  onResume: () => void
  onClose: () => void
  onDelete: (force?: boolean) => void
  onRetry: (workItemId: string, forceRetry: boolean) => void
}) {
  const [tab, setTab] = useState<Tab>('chat')
  const [draft, setDraft] = useState('')
  const ov = topic.overview
  const snap = topic.scope_snapshot || {}
  const runs = useMemo(
    () => workItems.filter(w => w.action_kind === 'run' || w.action_kind === 'case_run'),
    [workItems],
  )
  const chatMessages = useMemo(() => filterStewardChatMessages(messages), [messages])

  const scopeLine = useMemo(() => {
    const parts: string[] = []
    if (topic.requirement_id) parts.push(`需求 ${topic.requirement_id}`)
    if (topic.modules?.length) parts.push(`模块 ${topic.modules.join('、')}`)
    if (topic.scope_case_ids?.length) parts.push(`${topic.scope_case_ids.length} 条指定用例`)
    const anchor = topic.anchor?.case_id
    if (anchor) parts.push(topic.anchor?.case_title || anchor)
    if (topic.app_id || appId) parts.push(`应用 ${topic.app_id || appId}`)
    return parts.join(' · ') || topic.title
  }, [topic, appId])

  const send = async () => {
    const submitted = draft
    const text = submitted.trim()
    if (!text || sendLoading) return
    try {
      await onSend(text)
      setDraft(current => current === submitted ? '' : current)
    } catch { /* Keep the draft; the parent displays the send error. */ }
  }

  return (
    <div className="steward-task">
      <header className="steward-task-header">
        <div>
          <h2 className="collab-topic-title-main">{topic.title}</h2>
          <p className="collab-muted steward-scope-line">{scopeLine}</p>
        </div>
        <Space wrap>
          {topic.paused ? (
            <Button onClick={onResume}>继续</Button>
          ) : (
            <Button onClick={onPause}>暂停</Button>
          )}
          {topic.status !== 'closed' && (
            <Button onClick={onClose}>结束</Button>
          )}
          <Button danger onClick={() => onDelete(false)}>删除</Button>
        </Space>
      </header>

      <div className="steward-overview">
        <div className="steward-stat">
          <span className="steward-stat-n">{ov?.total ?? snap.total ?? '—'}</span>
          <span className="steward-stat-l">用例</span>
        </div>
        <div className="steward-stat">
          <span className="steward-stat-n">{ov?.executable ?? (snap.executable as string[] | undefined)?.length ?? '—'}</span>
          <span className="steward-stat-l">可执行</span>
        </div>
        <div className="steward-stat">
          <span className="steward-stat-n">{ov?.blocked ?? (snap.blocked as unknown[] | undefined)?.length ?? '—'}</span>
          <span className="steward-stat-l">阻塞</span>
        </div>
        <div className="steward-stat">
          <span className="steward-stat-n">{ov?.progress_hint || '—'}</span>
          <span className="steward-stat-l">进度</span>
        </div>
      </div>

      {ov?.stages?.length ? (
        <div className="steward-stages">
          {ov.stages.map(s => (
            <Tag key={s.id}>{s.label} · {s.status}</Tag>
          ))}
        </div>
      ) : null}

      <div className="steward-tabs">
        <Button type={tab === 'runs' ? 'primary' : 'default'} size="small" onClick={() => setTab('runs')}>执行</Button>
        <Button type={tab === 'activity' ? 'primary' : 'default'} size="small" onClick={() => setTab('activity')}>活动</Button>
        <Button type={tab === 'chat' ? 'primary' : 'default'} size="small" onClick={() => setTab('chat')}>聊天</Button>
      </div>

      {tab === 'runs' && (
        <div className="steward-panel">
          {!runs.length && <p className="collab-muted">尚无跑批；从用例页进入或聊天里说「跑吧」。</p>}
          <ul className="steward-run-list">
            {runs.map(run => (
              <li key={run.work_item_id} className="steward-run-card">
                <div className="collab-work-head">
                  <strong>{run.activity || run.title}</strong>
                  <StatusPill status={toStatusKind(run.status)}>{run.status}</StatusPill>
                </div>
                {run.run_id && appId && (
                  <Link to={projectHref(projectId, { tab: 'tasks', appId, run: run.run_id })}>
                    批次 {run.run_id.slice(0, 12)}…
                  </Link>
                )}
                {run.blocked_reason && <p className="collab-blocked">{run.blocked_reason}</p>}
                {(run.status === 'failed' || run.status === 'blocked') && (
                  <Button size="small" loading={actionLoading} onClick={() => onRetry(run.work_item_id, true)}>重试</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'activity' && (
        <div className="steward-panel steward-activity">
          {!activities.length && <p className="collab-muted">后台动作会显示在这里。</p>}
          <ul>
            {activities.map(a => (
              <li key={a.activity_id}>
                <span className="collab-muted">{a.created_at?.slice(11, 19) || ''}</span>
                <span>{a.body}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'chat' && (
        <div className="steward-panel collab-card-chat">
          <div className="collab-messages">
            {chatMessages.map(msg => (
              <div key={msg.message_id} className="collab-message">
                <span className="collab-muted">{msg.author_kind === 'user' ? '成员' : '管家'}</span>
                <p>{msg.body}</p>
                {msg.reply_status === 'sending' && <span role="status">正在发送…</span>}
                {msg.reply_status === 'queued' && <span role="status">已发送，等待管家处理…</span>}
                {msg.reply_status === 'running' && <span role="status">管家正在处理…</span>}
                {(msg.reply_status === 'failed' || msg.reply_status === 'interrupted') && (
                  <span role="alert">{msg.reply_error || '回复未完成，请先查看任务状态。'}</span>
                )}
              </div>
            ))}
          </div>
          <div className="collab-compose">
            <Input.TextArea
              value={draft}
              rows={2}
              onChange={e => setDraft(e.target.value)}
              placeholder="说「现在怎么样了」「跑吧」「失败的重跑」"
            />
            <Button type="primary" disabled={!draft.trim()} loading={sendLoading} onClick={send}>发送</Button>
          </div>
        </div>
      )}
    </div>
  )
}
