import { Button, Drawer, Tabs } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import { TurnsSection } from '@/domains/assistant/TurnsSection'
import { RequestsSection } from '@/domains/assistant/RequestsSection'
import { SubscriptionsSection } from '@/domains/assistant/SubscriptionsSection'
import { ConversationSettings } from '@/domains/assistant/ConversationSettings'
import { McpSection } from '@/domains/assistant/McpSection'

const LOCAL = ['requests', 'turns', 'subs'] as const
const GLOBAL = ['preferences', 'mcp'] as const

export function NodeAssistant({ nodeId }: { nodeId?: string }) {
  const [tab, setTab] = useUrlState<string>('tab', nodeId ? 'turns' : 'preferences', nodeId ? LOCAL : GLOBAL)
  return <div style={{ padding: 16, minWidth: 0, width: '100%' }}>
    {!nodeId && <p className="w-form-hint">全局设置作用于当前账号的所有 Scout 节点；MCP 凭据共用。</p>}
    <Tabs tabBarExtraContent={nodeId ? <Button onClick={() => setTab('subs')}>通知订阅</Button> : undefined} activeKey={tab === 'subs' ? 'turns' : tab} onChange={setTab} items={!nodeId ? [
        { key: 'preferences', label: '对话设置', children: <ConversationSettings /> },
        { key: 'mcp', label: 'MCP', children: <McpSection /> },
      ] : [
      { key: 'turns', label: '消息与调用', children: <TurnsSection nodeId={nodeId} /> },
      { key: 'requests', label: '执行进度', children: <RequestsSection nodeId={nodeId} /> },
    ]} />
    {nodeId && <Drawer open={tab === 'subs'} title="通知订阅" width={720} onClose={() => setTab('turns')} destroyOnHidden>
      <SubscriptionsSection nodeId={nodeId} />
    </Drawer>}
  </div>
}
