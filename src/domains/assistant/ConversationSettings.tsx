import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Select, Skeleton, useFeedback, errText } from '@/ui'
import { getAssistantPreferences, setAssistantPreference, getAssistantCapabilities } from '@/api/assistant'
import { assistantKeys } from './queries'
import { QueryProblem } from './AssistantNotReady'
import { channelLabel } from './format'
import { MediaSettings } from './MediaSettings'
import { GroupPolicies } from './GroupPolicies'

const PREFERENCES = [
  { key: 'detail', label: '回复详略', options: [{ label: '默认', value: '' }, { label: '简洁', value: 'brief' }, { label: '完整', value: 'full' }] },
  { key: 'process', label: '处理过程', options: [{ label: '默认收起', value: '' }, { label: '显示过程', value: 'show' }, { label: '隐藏过程', value: 'hide' }] },
  { key: 'language', label: '回复语言', options: [{ label: '跟随输入', value: '' }, { label: '中文', value: 'zh-CN' }, { label: 'English', value: 'en-US' }] },
]

export function ConversationSettings() {
  const qc = useQueryClient()
  const feedback = useFeedback()
  const preferences = useQuery({ queryKey: [...assistantKeys.all, 'preferences'], queryFn: getAssistantPreferences })
  const capabilities = useQuery({ queryKey: [...assistantKeys.all, 'capabilities'], queryFn: getAssistantCapabilities })
  const update = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | null }) => setAssistantPreference(key, value),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...assistantKeys.all, 'preferences'] }),
    onError: (error) => feedback.fail(errText(error)),
  })
  return <div className="flex flex-col gap-4" style={{ paddingTop: 16 }}>
    <section className="w-surface-card" style={{ padding: 18 }}>
      <strong>展示偏好</strong>
      <p style={{ color: 'var(--w-text-tertiary)', fontSize: 13 }}>偏好由你明确设置，可以随时恢复默认；执行目标仍由每次请求确定。</p>
      {preferences.isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : preferences.isError ? <QueryProblem error={preferences.error} what="展示偏好" onRetry={() => void preferences.refetch()} /> :
        <div className="flex flex-wrap gap-6">{PREFERENCES.map((preference) => <div key={preference.key} style={{ minWidth: 180 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13 }}>{preference.label}</label>
          <Select aria-label={preference.label} style={{ width: '100%' }} disabled={update.isPending} options={preference.options} value={preferences.data?.[preference.key] || ''} onChange={(value) => update.mutate({ key: preference.key, value: value || null })} />
          {preferences.data?.[preference.key] ? <Button type="link" size="small" disabled={update.isPending} onClick={() => update.mutate({ key: preference.key, value: null })}>撤销偏好</Button> : null}
        </div>)}</div>}
    </section>
    <section className="w-surface-card" style={{ padding: 18 }}>
      <strong>当前渠道能力</strong>
      <p style={{ color: 'var(--w-text-tertiary)', fontSize: 13 }}>按当前适配器实际支持的能力展示。原生卡片或按钮不可用时，会分段发送清晰文本，通过序号继续追问。</p>
      {capabilities.isLoading ? <Skeleton active paragraph={{ rows: 2 }} /> : capabilities.isError ? <QueryProblem error={capabilities.error} what="渠道能力" onRetry={() => void capabilities.refetch()} /> : capabilities.data?.items.length ?
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['渠道 / 节点', 'Markdown', '原生卡片', '按钮', '流式', '线程', '单段上限'].map((text) => <th key={text} style={{ textAlign: 'left', padding: 10, borderBottom: '1px solid var(--w-border)' }}>{text}</th>)}</tr></thead>
          <tbody>{capabilities.data.items.map((item) => <tr key={`${item.node_id}:${item.channel}:${item.instance_id}`}>
            <td style={{ padding: 10 }}>{channelLabel(item.channel)} · {item.node_name}</td>
            {(['markdown', 'cards', 'buttons', 'streaming', 'threads'] as const).map((key) => <td key={key} style={{ padding: 10, color: item.capabilities[key] ? 'var(--w-pass)' : 'var(--w-text-tertiary)' }}>{item.capabilities[key] ? '支持' : '文本降级'}</td>)}
            <td style={{ padding: 10 }}>{item.capabilities.max_characters} 字符</td>
          </tr>)}</tbody>
        </table></div> : <p style={{ fontSize: 13, color: 'var(--w-text-tertiary)' }}>尚未接入 IM 渠道。请在接入页绑定账号。</p>}
    </section>
    <MediaSettings />
    <GroupPolicies />
  </div>
}
