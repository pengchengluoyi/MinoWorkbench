import { useEffect, useState } from 'react'
import { Alert } from '@/ui'
import { callNodePlugin } from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
type MessageState = { enabled?: boolean; connection_verified?: boolean; error?: string; holding?: boolean }
export function FeishuMessages({ nodeId, disabled }: { nodeId: string; disabled: boolean }) {
  const [state, setState] = useState<MessageState>({})
  const [error, setError] = useState('')
  useEffect(() => {
    if (disabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = unwrapOne(await callNodePlugin(nodeId, { capability_id: 'plugin.cli.feishu', params: { action: 'messages_status' } }, 20_000))
        const data = ((result as { data?: { messages: MessageState } }).data || result) as { messages: MessageState }
        if (!stopped) { setState(data.messages || {}); setError('') }
      } catch {
        if (!stopped) setError('无法获取消息监听状态，请确认 Scout 已加载支持消息接入的版本。')
      } finally {
        if (!stopped) timer = setTimeout(poll, 3000)
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [nodeId, disabled])
  return <div aria-label="飞书 CLI 连接状态" style={{ marginTop: 12 }}>
    <p role="status" style={{ margin: 0 }}>{disabled ? '节点不可用' : state.error ? '连接异常' : !state.enabled ? '未启用' : state.holding === false ? '已暂停' : state.connection_verified ? '已连接' : '已接入'}</p>
    {(error || state.error) && <Alert type="warning" message={error || state.error} />}
  </div>
}
