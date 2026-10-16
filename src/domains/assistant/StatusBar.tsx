import { Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { Alert, Button, Skeleton, StatusPill, Switch, errText, useFeedback } from '@/ui'
import { imConnectionLabel } from '@/lib/imStatus'
import { channelLabel, fmtAgo } from './format'
import { useAssistantMutations, useAssistantStatus, useIdentities } from './queries'
import { QueryProblem } from './AssistantNotReady'

export function StatusBar() {
  const q = useAssistantStatus()
  const identities = useIdentities()
  const { saveProfile } = useAssistantMutations()
  const feedback = useFeedback()
  if (q.isLoading && !q.data) return <Skeleton active paragraph={{ rows: 1 }} title={false} />
  if (!q.data) return <div className="w-surface-card"><QueryProblem error={q.error} what="助手状态" onRetry={() => void q.refetch()} /></div>
  const s = q.data
  const nodes = s.im_nodes ?? []
  const bound = nodes.flatMap(node => node.channels.filter(channel => channel.bound === true).map(channel => ({ node, channel })))
  const visible = new Set(bound.map(({ node, channel }) => `${node.node_id}:${channel.channel}`))
  const unmatched = (identities.data || []).filter(identity => {
    const key = `${identity.node_id}:${identity.channel}`
    if (visible.has(key)) return false
    visible.add(key)
    return true
  })
  const hasBinding = bound.length > 0 || unmatched.length > 0
  return <div className="flex flex-col gap-2">
    {(q.isError || identities.isError) && <Alert type="warning" showIcon message="渠道信息刷新失败，保留已知绑定；不能据此判断未绑定" description={errText(q.error || identities.error)} action={<Button onClick={() => { void q.refetch(); void identities.refetch() }}>重试</Button>} />}
    <section className="w-channel-strip" aria-label="当前账号助手与绑定渠道">
      <Bot size={19} style={{ color: 'var(--w-primary)', flexShrink: 0 }} />
      <strong>{!s.enabled ? '助手已停用' : '已绑定渠道'}</strong>
      {bound.map(({ node, channel }) => {
        const connection = imConnectionLabel(channel, node.alive)
        return <Link className="w-channel-item w-hit" key={`${node.node_id}:${channel.channel}`} to={`/settings/runtime?node=${encodeURIComponent(node.node_id)}&pane=connect`} title={`${node.name || node.node_id} · 我的账号已绑定${channel.last_message_at ? ` · 最后消息 ${fmtAgo(channel.last_message_at)}` : ''}${channel.error ? ` · ${channel.error}` : ''}`}>
          <span>{channelLabel(channel.channel)}</span><StatusPill status={connection.kind}>{connection.text}</StatusPill><span className="w-form-hint">{node.name || node.node_id}</span>
        </Link>
      })}
      {unmatched.map(identity => <Link className="w-channel-item w-hit" key={`${identity.node_id}:${identity.channel}`} to="/assistant?tab=setup"><span>{channelLabel(identity.channel)}</span><StatusPill status="muted">已绑定 · 连接待确认</StatusPill><span className="w-form-hint">{identity.node_name || identity.node_id}</span></Link>)}
      {!hasBinding && identities.isLoading && <span className="w-form-hint" role="status">正在读取绑定渠道…</span>}
      {!hasBinding && identities.isSuccess && !q.isError && <span className="w-form-hint">尚未绑定IM渠道，可按需绑定一到两个常用渠道。</span>}
      <span style={{ flex: 1 }} />
      <Link to="/assistant?tab=setup">渠道管理</Link>
      <Link to="/assistant?tab=mcp" className="w-form-hint">MCP · {s.mcp_available ? '可用' : '未启用'}</Link>
      <span className="flex items-center gap-2"><span className="w-form-hint">启用助手</span><Switch aria-label="启用助手" checked={s.enabled} disabled={q.isError} loading={saveProfile.isPending} onChange={enabled => saveProfile.mutate({ enabled }, {
        onSuccess: () => feedback.ok(enabled ? '助手已启用' : '助手已停用'),
        onError: failure => feedback.fail(errText(failure, '保存失败')),
      })} /></span>
    </section>
  </div>
}
