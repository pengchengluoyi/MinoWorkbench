import { usesDesktopExecutor } from '@/constants/platformContract'
import { request } from '@/lib/request'

export interface RunDevice {
  sn: string
  type?: string
  model?: string
  status?: string
  platform?: string
  node_id?: string
  node_name?: string
  os?: 'macos' | 'windows' | 'linux' | string
  desktop_state?: string
  session_key?: string
  session_generation?: string
  executable?: boolean
  blocked_reason?: string
  blocking_code?: string
  capabilities?: string[] | null
  [key: string]: unknown
}

/** 下发参数按原实现的 payload 对齐，字段名不改。 */
export interface RunPayload {
  client_request_id?: string
  app_id: string
  case_ids: string[]
  sn?: string
  sns?: string[]
  platform?: string
  env_profile?: string
  env_surface?: string
  action_scheme?: 'visual' | 'dom_preferred'
  async_exec?: boolean
  use_cache?: boolean
  run_type?: string
  execution_mode?: 'legacy' | 'v5'
  playwright_headless?: boolean
}

export const getRunRequest = (requestId: string) => request<{ request_id: string; run_id: string }>({
  url: `/case-runner/requests/${encodeURIComponent(requestId)}`, method: 'get',
})

export const runCaseRunner = (data: RunPayload) =>
  request<{ run_id?: string; task_id?: string }>({
    url: '/case-runner/run',
    method: 'post',
    data,
    timeout: 120_000,
  })

export interface RunDeviceContext {
  app_id?: string
  env_surface?: string
  env_profile?: string
  action_scheme?: 'visual' | 'dom_preferred'
  playwright_headless?: boolean
}

export const listRunDevices = (onlyOnline = false, context: RunDeviceContext = {}) =>
  request<{ items?: RunDevice[] }>({
    url: '/case-runner/devices',
    method: 'get',
    params: { only_online: onlyOnline, ...context },
  })

/** 只有这些通道的设备真能跑用例。 */
export const isExecutable = (d: RunDevice): boolean => {
  return d.executable === true && !!d.sn
}

export const deviceFamilyLabel = (d: RunDevice) =>
  d.platform === 'mac' ? 'Mac 桌面' : d.platform === 'win' ? 'Windows 桌面' : d.platform === 'desktop' ? `PC 桌面 · ${d.os || '系统未知'}` : d.platform === 'web' ? 'Web 浏览器' : `移动设备 · ${d.platform || '平台未知'}`

export const deviceLabel = (d: RunDevice) => `${d.node_name || d.node_id || 'Scout'} / ${deviceFamilyLabel(d)}${d.model && !usesDesktopExecutor(d.platform) ? ` · ${d.model}` : ''}`
