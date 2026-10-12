import { Link } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { Skeleton, StatusPill, Switch, errText, useFeedback } from '@/ui'
import { imConnectionLabel } from '@/lib/imStatus'
import { channelLabel, fmtAgo } from './format'
import { useAssistantMutations, useAssistantStatus } from './queries'
import { QueryProblem } from './AssistantNotReady'

export function StatusBar() {
  const q = useAssistantStatus()
  const { saveProfile } = useAssistantMutations()
  const feedback = useFeedback()
  if (q.isLoading) return <Skeleton active paragraph={{ rows: 1 }} title={false} />
  if (q.isError) {
    return <div className="w-surface-card"><QueryProblem error={q.error} what="助手状态" onRetry={() => void q.refetch()} /></div>
  }
  const s = q.data!
  const nodes = s.im_nodes ?? []
  return (
    <section className="w-surface-card" role="status" style={{ padding: 14 }}>
      <div className="flex flex-wrap items-center gap-3">
        <Bot size={18} />
        <strong>{!s.enabled ? '助手已停用' : s.online ? 'IM 助手在线' : 'IM 尚未就绪'}</strong>
        <span style={{ flex: 1 }} />
        <span>启用助手</span>
        <Switch aria-label="启用助手" checked={s.enabled} loading={saveProfile.isPending} onChange={(enabled) => {
          saveProfile.mutate({ enabled }, {
            onSuccess: () => feedback.ok(enabled ? '助手已启用' : '助手已停用'),
            onError: (failure) => feedback.fail(errText(failure, '保存失败')),
          })
        }} />
      </div>
      <div className="flex flex-col" style={{ marginTop: 12, gap: 10 }}>
        {nodes.flatMap((node) => node.channels.map((channel) => {
          const connection = imConnectionLabel(channel, node.alive)
          return (
            <div key={`${node.node_id}:${channel.channel}`} style={{ borderTop: '1px solid var(--w-border)', paddingTop: 8 }}>
              <div className="flex flex-wrap items-center gap-3">
                <strong>{channelLabel(channel.channel)} · {node.name || node.node_id}</strong>
                <StatusPill status={connection.kind}>{connection.text}</StatusPill>
                <StatusPill status={channel.bound ? 'pass' : 'warn'}>{channel.bound ? '我的账号已绑定' : '待绑定账号'}</StatusPill>
                {!channel.bound ? <Link to="/assistant?tab=setup">绑定</Link> : null}
                <Link to="/settings/runtime">查看节点</Link>
              </div>
              <div style={{ marginTop: 4, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
                {channel.installed === true ? '已安装' : channel.installed === false ? '未安装' : '安装状态未上报'}
                {' · '}{!node.alive ? '节点离线' : channel.running === true ? '进程运行' : channel.running === false ? '进程未运行' : '进程状态未上报'}
                {channel.last_message_at ? ` · 最后消息 ${fmtAgo(channel.last_message_at)}` : ''}
                {channel.error ? <span style={{ color: 'var(--w-fail)' }}> · {channel.error}</span> : null}
              </div>
            </div>
          )
        }))}
        {!nodes.length ? <span style={{ color: 'var(--w-text-tertiary)' }}>当前可访问节点尚未上报对话渠道。请在 Scout 节点页配置。</span> : null}
        <div className="flex items-center gap-3" style={{ borderTop: '1px solid var(--w-border)', paddingTop: 8 }}>
          <strong>MCP</strong>
          <StatusPill status={s.mcp_available ? 'pass' : 'muted'}>{s.mcp_available ? '可用' : '已停用'}</StatusPill>
          <Link to="/assistant?tab=mcp">接入说明</Link>
        </div>
      </div>
    </section>
  )
}
