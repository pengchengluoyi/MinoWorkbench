import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, PageHeader, Tabs } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import { isAssistantNotReady } from '@/api/assistant'
import { assistantKeys, useAssistantStatus } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { StatusBar } from './StatusBar'
import { BindSection } from './BindSection'
import { DefaultsSection } from './DefaultsSection'
import { TurnsSection } from './TurnsSection'
import { SubscriptionsSection } from './SubscriptionsSection'
import { McpSection } from './McpSection'

const TABS = ['setup', 'turns', 'subs', 'mcp'] as const

/** 我的助手。状态条常驻顶部，其下按「先接入、再看记录」分四个视图，当前视图挂 URL。 */
export function AssistantPage() {
  const qc = useQueryClient()
  const status = useAssistantStatus()
  const [tab, setTab] = useUrlState<(typeof TABS)[number]>('tab', 'setup', TABS)

  return (
    <div className="h-full overflow-y-auto" style={{ paddingRight: 4 }}>
      <PageHeader
        title="我的助手"
        subtitle="这里管你自己：认领 IM 账号、默认设备和 MCP token。飞书 CLI、邮箱和机器人登录仍在 Scout 节点页，按节点配置。"
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
          { key: 'setup', label: '接入与默认值', children: <div className="flex flex-col" style={{ gap: 'var(--w-space-3)' }}><BindSection /><DefaultsSection /></div> },
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
