import type { StatusKind } from '@/ui'

/** epoch 秒 → 本地时间文本；0/空 → 「无」。 */
export const fmtTime = (sec?: number): string => {
  if (!sec) return '无'
  const d = new Date(sec * 1000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export { fmtAgo } from '@/lib/timeText'

export const fmtMs = (ms?: number): string => {
  if (ms == null) return '无'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

const CHANNEL_LABELS: Record<string, string> = {
  wechat: '微信', weixin: '微信', feishu: '飞书', lark: '飞书', wecom: '企业微信', dingtalk: '钉钉', qq: 'QQ', mcp: 'MCP',
}
export const channelLabel = (c: string): string => CHANNEL_LABELS[String(c || '').toLowerCase()] || c || '未知'

export const surfaceLabel = (s: string): string => (s === 'mcp' ? 'MCP' : s === 'im' ? 'IM' : s || '未知')

export const turnStatus = (s: string): { kind: StatusKind; text: string } =>
  // Nexus 真实值：MCP 面是 ok/error，IM 面取卡片状态 done/failed/need_input/running。
  s === 'ok' || s === 'done' ? { kind: 'pass', text: '成功' }
    : s === 'error' || s === 'failed' ? { kind: 'fail', text: '出错' }
    : s === 'running' ? { kind: 'running', text: '进行中' }
    : { kind: 'warn', text: '待补充' }
