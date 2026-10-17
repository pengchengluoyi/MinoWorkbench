import { usesDesktopExecutor } from '@/constants/platformContract'
import { request } from '@/lib/request'
import type { ImChannelStatus } from '@/types/im'

export interface NodeDevice {
  sn: string
  node_id?: string
  current_scout_id?: string
  node_alive?: boolean
  channels?: Record<string, unknown>
  type?: string
  model?: string
  status?: string
  platform?: string
  os?: string
  executable?: boolean
  desktop_state?: string
  blocked_reason?: string
  session_generation?: string
  last_online?: string
  [key: string]: unknown
}

export interface NodeExecutor {
  available?: boolean
  provides?: number
  reason?: string
}

export interface ScoutNode {
  node_id: string
  scout_id?: string
  hostname?: string
  platform?: string
  arch?: string
  scout_version?: string
  alive?: boolean
  busy?: boolean
  draining?: boolean
  status?: string
  online?: boolean
  last_heartbeat?: string
  last_seen_ago_sec?: number
  device_count?: number
  devices?: NodeDevice[]
  executors?: Record<string, NodeExecutor>
  owner_user_id?: string
  owner_name?: string
  host?: {
    os?: string
    hostname?: string
    arch?: string
    desktop?: { state?: string; blocked_reason?: string; session_key?: string; session_generation?: string }
    mode?: string
    power_source?: string
    battery_percent?: number
    cpu_percent?: number
    rss_mb?: number
    [key: string]: unknown
  }
  /** null：这台 Scout 还不认识插件状态。 */
  plugins?: NodePluginStatus[] | null
  im_channels?: ImChannelStatus[]
  plugin_job?: NodePluginJob
  update_job?: NodePluginJob
  [key: string]: unknown
}

export interface NodePluginStatus {
  class: 'cli' | 'mcp' | 'bot' | 'mail' | 'im' | string
  id: string
  installed?: boolean
  configured?: boolean
  /** 非密钥字段，心跳带回，页面要原样显示 */
  values?: Record<string, string>
  /** 已写入保险库的密钥字段名，不含密钥本身 */
  saved_secrets?: string[]
  /** 对话类（微信 iLink / LangBot）的连接状态；Scout 还不上报时为空 */
  status?: PluginConnStatus
  /** class==='im' 的动态条目由 Scout 自带表单定义 */
  label?: string
  title?: string
  name?: string
  fields?: PluginFieldDef[]
  /** LangBot 把多家渠道放在同一个插件里，用 group 区分 */
  groups?: { id: string; label: string }[]
  platforms?: Record<string, PluginConnStatus & { enabled?: boolean; holding?: boolean }>
}

export interface PluginConnStatus {
  connected?: boolean
  last_message_at?: number
  error?: string
  connection_verified?: boolean
  connection_source?: string
}

export interface PluginFieldDef {
  key: string
  label: string
  secret?: boolean
  optional?: boolean
  placeholder?: string
  /** 同一插件里的渠道，例如 lark / dingtalk */
  group?: string
  type?: string
}

export interface NodePluginJob {
  active?: boolean
  stage?: string
  label?: string
  percent?: number
  class?: string
  id?: string
  error?: string
  bytes_received?: number
  bytes_total?: number
}

/** 休眠 / 唤醒 / 重启 / 升级。离线进程不能从网页拉起。 */
export type NodeCommand = 'sleep' | 'wake' | 'restart' | 'update'

export const listRuntimeNodes = () =>
  request<{ nodes?: ScoutNode[] }>({ url: '/runtime/nodes', method: 'get' })

export type ScoutSystem = 'darwin' | 'win32' | 'linux'

export interface NodeInstallation {
  install_id: string
  expires_at: number
  ttl_sec: number
  nexus_url: string
  targets: Partial<Record<ScoutSystem, string[]>>
  commands: Partial<Record<ScoutSystem, string>>
}

export interface NodeInstallationStatus {
  install_id: string
  status: 'pending' | 'registered' | 'expired' | 'revoked'
  expires_at: number
  registered_at: number
  node_id: string
  hostname: string
  online: boolean
}

export const createNodeInstallation = () =>
  request<NodeInstallation>({ url: '/runtime/nodes/install-token', method: 'post' })

export const getNodeInstallationStatus = (installId: string) =>
  request<NodeInstallationStatus>({
    url: `/runtime/nodes/installations/${encodeURIComponent(installId)}`,
    method: 'get',
  })

export const detectScoutSystem = (): ScoutSystem | undefined => {
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
  const value = `${agent.userAgentData?.platform || ''} ${navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase()
  if (/android|iphone|ipad|ipod/.test(value) || (value.includes('mac') && navigator.maxTouchPoints > 1)) return undefined
  if (/windows|win32|win64/.test(value)) return 'win32'
  if (/mac|darwin/.test(value)) return 'darwin'
  if (/linux/.test(value)) return 'linux'
  return undefined
}

export interface ScoutUpdateTarget { operation_id: string; build_id: string; release_tag: string }
export interface ScoutUpdateStatus { operation?: { operation_id: string; state: string; running_version_verified?: boolean; result?: { reason?: string } } }
export const getScoutUpdateStatus = (nodeId: string) =>
  request<ScoutUpdateStatus>({ url: `/runtime/nodes/${encodeURIComponent(nodeId)}/update-status`, method: 'get' })

export const sendNodeCommand = (nodeId: string, command: NodeCommand, update?: ScoutUpdateTarget) => {
  if (command === 'update' && !update) throw new Error('升级需要固定版本和操作编号，请先检查更新')
  return request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/${command === 'update' ? 'update' : 'command'}`,
    method: 'post',
    data: command === 'update' ? { ...update, reason: 'workbench' } : { command, reason: 'workbench' },
    timeout: 60_000,
  })
}

export const configNodePlugin = (
  nodeId: string,
  body: { kind: string; plugin_id: string; values: Record<string, string>; clear?: string[] },
) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/plugins/config`,
    method: 'post',
    data: body,
    timeout: 60_000,
  })

export const installNodePlugin = (nodeId: string, body: { kind: string; plugin_id: string }) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/plugins/install`,
    method: 'post',
    data: body,
    timeout: 660_000,
  })

export const removeNodePlugin = (nodeId: string, body: { kind: string; plugin_id: string }) =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/plugins/remove`,
    method: 'post',
    data: body,
    timeout: 180_000,
  })

export const callNodePlugin = (
  nodeId: string,
  body: { capability_id: string; params: Record<string, unknown> },
  timeout = 90_000,
) =>
  request<{ data?: Record<string, unknown>; summary?: string }>({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/plugins/call`,
    method: 'post',
    data: body,
    timeout,
  })

export const getNodeLogs = (nodeId: string, lines = 200) =>
  request<{ lines?: string[]; text?: string }>({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/logs`,
    method: 'get',
    params: { lines },
    timeout: 60_000,
  })

export const nodeIsAsleep = (n: ScoutNode): boolean =>
  n.status === 'asleep' || n.host?.mode === 'asleep'

export const nodeIsOnline = (n: ScoutNode): boolean => {
  if (n.status === 'offline') return false
  if (nodeIsAsleep(n)) return true
  return n.status === 'online' || n.online === true || n.alive === true
}

/** 节点页只使用当前节点的实时设备，不用历史首次归属兜底。 */
export const connectedNodeDevices = (n: ScoutNode): NodeDevice[] => {
  if (!nodeIsOnline(n)) return []
  return (n.devices || []).filter((d) => {
    if (d.node_id !== n.node_id || (d.current_scout_id && d.current_scout_id !== n.node_id)) return false
    if (d.node_alive === false) return false
    if (usesDesktopExecutor(d.platform) || d.platform === 'web') return true
    return Object.values(d.channels || {}).some((value) => {
      const state = typeof value === 'object' && value !== null
        ? String((value as { state?: string; status?: string }).state || (value as { status?: string }).status || '')
        : String(value || '')
      return ['connected', 'online', 'available'].includes(state.toLowerCase())
    })
  })
}

/** 真能跑用例的设备。离线及其他节点的设备不算。 */
export const executableDevices = (n: ScoutNode): NodeDevice[] =>
  connectedNodeDevices(n).filter((d) => d.executable === true)

export interface ScoutRelease {
  build_id?: string
  release_tag?: string
  version?: string
  packaging?: boolean
  manifest_ready?: boolean
  detail?: string
  manifest_url?: string
}

/**
 * Scout 最新稳定版。走 Nexus 的 /releases/scout/meta —— Nexus 自己去代理
 * GitHub manifest。前端**不直连 GitHub**（铁律：只跟 Nexus 说话）。
 */
export const getScoutRelease = (os: string, arch: string) =>
  request<ScoutRelease>({ url: '/releases/scout/meta', method: 'get', params: { os, arch } })

/** 严格比较常规版本与 SemVer 预发布版本；无法比较时不作升级判断。 */
export const compareVersion = (a: string, b: string): number | null => {
  const parse = (value: string) => /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i.exec(String(value || '').trim())
  const x = parse(a), y = parse(b)
  if (!x || !y) return null
  for (let i = 1; i <= 3; i++) {
    const left = BigInt(x[i]), right = BigInt(y[i])
    if (left !== right) return left > right ? 1 : -1
  }
  if (!x[4] || !y[4]) return x[4] === y[4] ? 0 : x[4] ? -1 : 1
  const left = x[4].split('.'), right = y[4].split('.')
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === right[i]) continue
    if (left[i] == null || right[i] == null) return left[i] == null ? -1 : 1
    const numericLeft = /^\d+$/.test(left[i]), numericRight = /^\d+$/.test(right[i])
    if (numericLeft && numericRight) return BigInt(left[i]) > BigInt(right[i]) ? 1 : -1
    if (numericLeft !== numericRight) return numericLeft ? -1 : 1
    return left[i] > right[i] ? 1 : -1
  }
  return 0
}

/** 仅映射已上报的平台，不能把未知系统猜成 Linux、未知架构猜成 x64。 */
export const releaseTargetOf = (n: ScoutNode): { os: string; arch: string } => {
  const platform = String(n.host?.os || n.platform || '').toLowerCase()
  const rawArch = String(n.arch || n.host?.arch || '').toLowerCase()
  const os = /darwin|mac/.test(platform) ? 'darwin' : /win/.test(platform) ? 'win32' : /linux/.test(platform) ? 'linux' : ''
  const arch = /^(arm64|aarch64)$/.test(rawArch) ? 'arm64' : /^(x64|amd64|x86_64)$/.test(rawArch) ? 'x64' : ''
  return { os, arch }
}

/**
 * 这台节点正连着哪些对话渠道。微信 iLink 的数据仍在 class='bot' id='wechat' 这一行，
 * LangBot 等以后出现在 class='im'。status.connected 为真才算持有。
 */
export const heldChannels = (n: ScoutNode): string[] => {
  if (!nodeIsOnline(n)) return []
  const labels: Record<string, string> = { wechat: '微信', 'langbot:lark': '飞书', 'langbot:dingtalk': '钉钉', 'langbot:wecombot': '企业微信' }
  return (n.im_channels || [])
    .filter((channel) => channel.connection_state === 'connected' && channel.connected === true && channel.holding !== false)
    .map((channel) => labels[channel.channel] || channel.channel)
}

export const claimLegacyNode = (nodeId: string) => request({ url: `/runtime/nodes/${encodeURIComponent(nodeId)}/claim`, method: 'post' })
