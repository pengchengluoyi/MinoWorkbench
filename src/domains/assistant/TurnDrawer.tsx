import { Link } from 'react-router-dom'
import { Drawer, Skeleton, StatusPill } from '@/ui'
import { isAssistantNotReady, type AssistantTurn } from '@/api/assistant'
import { channelLabel, fmtMs, fmtTime, surfaceLabel, turnStatus } from './format'
import { useAssistantProfile, useTurn, useTurnMessages } from './queries'
import { MinoCardView, TraceList } from './MinoCardView'
import { QueryProblem } from './AssistantNotReady'

/** 从 detail.task_id 或步骤参数摘要里找任务 id；找不到就不给链接，不猜。 */
export function findTaskId(t: AssistantTurn): string {
  const d = t.detail || {}
  const direct = d.task_id ?? d.run_id
  if (typeof direct === 'string' && direct) return direct
  for (const s of t.steps || []) {
    const m = /(?:task_id|run_id)\s*[=:]\s*["']?([\w-]+)/.exec(s.args_brief || '')
    if (m) return m[1]
  }
  return ''
}

function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ margin: '16px 0 6px', fontSize: 'var(--w-font-sm)', fontWeight: 700, color: 'var(--w-text-secondary)' }}>{children}</div>
}

function Messages({ turnId }: { turnId: string }) {
  const q = useTurnMessages(turnId)
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 3 }} title={false} />
  if (q.isError) {
    return <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
      {isAssistantNotReady(q.error) ? '助手服务尚未就绪，暂时取不到对话正文。' : '对话正文读取失败。'}
    </div>
  }
  const d = q.data!
  if (!d.available) {
    return (
      <div role="status" style={{ padding: '8px 12px', borderRadius: 'var(--w-radius-sm)', background: 'var(--w-warn-bg)', color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>
        节点离线，正文暂不可见{d.reason ? `（${d.reason}）` : ''}
      </div>
    )
  }
  if (!(d.messages ?? []).length) return <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>节点上没有这一轮的正文（可能已过保留期）</span>
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {d.messages.map((m, i) => (
        <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
          <div style={{ padding: '6px 10px', borderRadius: 'var(--w-radius-sm)', background: m.role === 'user' ? 'var(--w-primary-soft)' : 'var(--w-fill)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 'var(--w-font-base)' }}>{m.text}</div>
          <div style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            {m.role === 'user' ? '用户' : '助手'} · {fmtTime(m.ts)}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TurnDrawer({ turnId, onClose }: { turnId: string; onClose: () => void }) {
  const q = useTurn(turnId)
  const profile = useAssistantProfile()
  const t = q.data
  const taskId = t ? findTaskId(t) : ''
  const appId = (t && typeof t.detail?.app_id === 'string' && t.detail.app_id) || profile.data?.default_app_id || ''
  const st = t ? turnStatus(t.status) : null

  return (
    <Drawer open={!!turnId} onClose={onClose} width={560} title="会话详情" destroyOnHidden>
      {q.isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : q.isError ? (
        <QueryProblem error={q.error} what="会话详情" onRetry={() => void q.refetch()} />
      ) : t ? (
        <>
          <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
            {st ? <StatusPill status={st.kind}>{st.text}</StatusPill> : null}
            <span>{surfaceLabel(t.surface)}{t.channel ? ` · ${channelLabel(t.channel)}` : ''}</span>
            {t.chat_id_masked ? <span className="w-mono">{t.chat_id_masked}</span> : null}
            <span>{fmtTime(t.created_at)}</span>
            <span>耗时 {fmtMs(t.elapsed_ms)}</span>
            <span>token {t.prompt_tokens ?? 0}/{t.completion_tokens ?? 0}</span>
          </div>

          <Title>意图</Title>
          <div style={{ fontSize: 'var(--w-font-base)' }}>{t.intent || '无'}</div>

          {taskId && appId ? (
            <div style={{ marginTop: 10 }}>
              <Link to={`/testing/${encodeURIComponent(appId)}?tab=tasks&run=${encodeURIComponent(taskId)}`} style={{ fontWeight: 650 }}>
                在任务页查看这次执行（{taskId}）
              </Link>
            </div>
          ) : taskId ? (
            <div className="w-mono" style={{ marginTop: 10, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>关联任务 {taskId}（缺少应用信息，无法跳转）</div>
          ) : null}

          <Title>调用步骤</Title>
          <TraceList steps={t.steps ?? []} />

          <Title>卡片预览</Title>
          {t.card ? <MinoCardView card={t.card} /> : <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>这一轮没有生成卡片</span>}

          <Title>对话正文</Title>
          <Messages turnId={t.turn_id} />

          {t.detail && Object.keys(t.detail).length ? (
            <>
              <Title>原始 detail</Title>
              <pre className="w-mono" style={{ margin: 0, padding: 10, overflow: 'auto', maxHeight: 240, background: 'var(--w-fill)', borderRadius: 'var(--w-radius-sm)', fontSize: 'var(--w-font-sm)' }}>
                {JSON.stringify(t.detail, null, 2)}
              </pre>
            </>
          ) : null}
        </>
      ) : null}
    </Drawer>
  )
}
