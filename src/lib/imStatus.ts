import type { ImChannelStatus } from '@/types/im'
import type { StatusKind } from '@/ui'

export function imConnectionLabel(channel: ImChannelStatus | undefined, alive: boolean): { text: string; kind: StatusKind } {
  if (!alive) return { text: '节点离线', kind: 'fail' }
  if (!channel) return { text: '状态未上报', kind: 'muted' }
  const states: Record<ImChannelStatus['connection_state'], { text: string; kind: StatusKind }> = {
    connected: { text: '渠道已连接', kind: 'pass' },
    disconnected: { text: '渠道未连接', kind: 'warn' },
    pending: { text: '待确认', kind: 'warn' },
    unreported: { text: '状态未上报', kind: 'muted' },
    not_installed: { text: '未安装', kind: 'muted' },
    disabled: { text: '渠道已停用', kind: 'muted' },
    yielded: { text: '已让出持有权', kind: 'muted' },
    error: { text: '渠道异常', kind: 'fail' },
  }
  return states[channel.connection_state] || states.unreported
}
