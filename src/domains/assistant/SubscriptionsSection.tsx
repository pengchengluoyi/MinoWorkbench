import { Button, DataTable, Popconfirm, StatusPill, errText, useFeedback, type DataColumn } from '@/ui'
import type { AssistantSubscription } from '@/api/assistant'
import { channelLabel, fmtTime } from './format'
import { useAssistantMutations, useSubscriptions } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { isAssistantNotReady } from '@/api/assistant'

const KIND: Record<string, string> = { run_done: '运行完成通知', daily_report: '每日报告' }

export function SubscriptionsSection() {
  const fb = useFeedback()
  const q = useSubscriptions()
  const { cancelSub } = useAssistantMutations()

  const columns: DataColumn<AssistantSubscription>[] = [
    { key: 'kind', title: '类型', width: 140, alwaysVisible: true, render: (_: unknown, r) => KIND[r.kind] || r.kind },
    { key: 'target', title: '对象', ellipsis: true, render: (_: unknown, r) => <span className="w-mono">{r.target_id || '全部'}</span> },
    { key: 'channel', title: '推送渠道', width: 110, render: (_: unknown, r) => channelLabel(r.channel) },
    { key: 'created', title: '创建时间', width: 170, render: (_: unknown, r) => <span className="w-mono">{fmtTime(r.created_at)}</span> },
    { key: 'status', title: '状态', width: 90, render: (_: unknown, r) => <StatusPill status={r.status === 'active' ? 'running' : 'muted'}>{r.status === 'active' ? '生效中' : '已结束'}</StatusPill> },
    {
      key: 'op', title: '操作', width: 90, alwaysVisible: true,
      render: (_: unknown, r) => (
        <Popconfirm
          title="取消这个订阅？"
          okText="取消订阅"
          okButtonProps={{ danger: true }}
          onConfirm={() => cancelSub.mutateAsync(r.id).then(() => fb.ok('已取消')).catch((e) => fb.fail(errText(e, '取消失败')))}
        >
          <Button size="small" type="text" danger onClick={(e) => e.stopPropagation()}>取消</Button>
        </Popconfirm>
      ),
    },
  ]

  if (q.isError && isAssistantNotReady(q.error)) {
    return <div className="w-surface-card"><QueryProblem error={q.error} what="订阅" onRetry={() => void q.refetch()} /></div>
  }
  return (
    <DataTable<AssistantSubscription>
      viewId="assistant.subscriptions"
      rowKey={(r) => String(r.id)}
      dataSource={q.data}
      loading={q.isLoading}
      error={q.error}
      columns={columns}
      emptyTitle="还没有订阅"
      emptyHint="在 IM 里对助手说「跑完告诉我」，它会替你订阅一次运行完成通知。"
    />
  )
}
