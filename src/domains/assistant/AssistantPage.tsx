import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, PageHeader, Tabs } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import { isAssistantNotReady } from '@/api/assistant'
import { assistantKeys, useAssistantStatus } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { StatusBar } from './StatusBar'
import { BindSection } from './BindSection'
import { TurnsSection } from './TurnsSection'
import { SubscriptionsSection } from './SubscriptionsSection'
import { RequestsSection } from './RequestsSection'
import { ConversationSettings } from './ConversationSettings'
import { McpSection } from './McpSection'

const TABS = ['requests', 'setup', 'turns', 'subs', 'preferences', 'mcp'] as const

/** 我的助手。状态条常驻顶部，其下按「先接入、再看记录」分四个视图，当前视图挂 URL。 */
export function AssistantPage() {
  const qc = useQueryClient()
  const status = useAssistantStatus()
  const [tab, setTab] = useUrlState<(typeof TABS)[number]>('tab', 'requests', TABS)

  return (
    <div className="w-workspace h-full overflow-y-auto" style={{ paddingRight: 4 }}>
      <PageHeader
        title="我的助手"
        subtitle="查看请求进展、补充执行参数，管理账号绑定、群聊策略和对话偏好。"
        extra={<Button size="small" icon={<RefreshCw size={13} />} onClick={() => void qc.invalidateQueries({ queryKey: assistantKeys.all })}>刷新</Button>}
      />
      {status.isError && isAssistantNotReady(status.error) ? (
        // 后端整体没就绪：只给一条提示，不要每个分区各报一遍
        <div className="w-surface-card"><QueryProblem error={status.error} what="助手状态" onRetry={() => void status.refetch()} /></div>
      ) : (
        <>
      <StatusBar />
      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as (typeof TABS)[number])}
        style={{ marginTop: 'var(--w-space-3)' }}
        items={[
          { key: 'requests', label: '请求与任务', children: <RequestsSection /> },
          { key: 'preferences', label: '对话设置', children: <ConversationSettings /> },
          { key: 'setup', label: '渠道管理', children: <BindSection /> },
          { key: 'turns', label: '会话与轨迹', children: <TurnsSection /> },
          { key: 'subs', label: '订阅', children: <SubscriptionsSection /> },
          { key: 'mcp', label: 'MCP', children: <McpSection /> },
        ]}
      />
        </>
      )}
    </div>
  )
}
