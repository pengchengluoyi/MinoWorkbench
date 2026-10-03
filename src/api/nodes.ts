import { request } from '@/lib/request'

export interface NodeDevice {
  sn: string
  type?: string
  model?: string
  status?: string
  platform?: string
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
  owner_name?: string
  host?: {
    mode?: string
    power_source?: string
    battery_percent?: number
    cpu_percent?: number
    rss_mb?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** Scout 的停止 / 重启 / 升级 —— Nexus 现成的 HTTP 接口，不需要 Electron。 */
export type NodeCommand = 'stop' | 'restart' | 'update' | 'drain' | 'undrain'

export const listRuntimeNodes = () =>
  request<{ nodes?: ScoutNode[] }>({ url: '/runtime/nodes', method: 'get' })

export const sendNodeCommand = (nodeId: string, command: NodeCommand, reason = 'workbench') =>
  request({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/command`,
    method: 'post',
    data: { command, reason },
    // 升级要拉包重启，给足时间
    timeout: command === 'update' ? 660_000 : 60_000,
  })

export const getNodeLogs = (nodeId: string, lines = 200) =>
  request<{ lines?: string[]; text?: string }>({
    url: `/runtime/nodes/${encodeURIComponent(nodeId)}/logs`,
    method: 'get',
    params: { lines },
    timeout: 60_000,
  })

export const nodeIsOnline = (n: ScoutNode): boolean => {
  if (n.status === 'offline') return false
  return n.status === 'online' || n.status === 'asleep' || n.online === true || n.alive === true
}

/** 真能跑用例的设备。离线设备不算。 */
export const executableDevices = (n: ScoutNode): NodeDevice[] =>
  (n.devices || []).filter((d) => String(d.status || '').toLowerCase() === 'online')

export interface ScoutRelease {
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

/** 把 0.1.57 / v0.1.57 这类写法比出大小。返回 -1/0/1。 */
export const compareVersion = (a: string, b: string): number => {
  const norm = (v: string) => String(v || '').trim().replace(/^v/i, '').split('.').map((n) => Number(n) || 0)
  const x = norm(a)
  const y = norm(b)
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

/** 节点平台 → manifest 的 os/arch 取值。 */
export const releaseTargetOf = (n: ScoutNode): { os: string; arch: string } => {
  const p = String(n.platform || '').toLowerCase()
  const os = p.includes('darwin') || p.includes('mac') ? 'darwin'
    : p.includes('win') ? 'win32'
      : 'linux'
  const arch = String(n.arch || '').toLowerCase().includes('arm') ? 'arm64' : 'x64'
  return { os, arch }
}
