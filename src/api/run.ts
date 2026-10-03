import { request } from '@/lib/request'

export interface RunDevice {
  sn: string
  type?: string
  model?: string
  status?: string
  platform?: string
  node_id?: string
  [key: string]: unknown
}

/** 下发参数按原实现的 payload 对齐，字段名不改。 */
export interface RunPayload {
  app_id: string
  case_ids: string[]
  sn?: string
  sns?: string[]
  platform?: string
  env_profile?: string
  action_scheme?: 'visual' | 'dom'
  async_exec?: boolean
  use_cache?: boolean
  run_type?: string
}

export const runCaseRunner = (data: RunPayload) =>
  request<{ run_id?: string; task_id?: string }>({
    url: '/case-runner/run',
    method: 'post',
    data,
    timeout: 120_000,
  })

export const listRunDevices = (onlyOnline = true) =>
  request<{ items?: RunDevice[] }>({
    url: '/case-runner/devices',
    method: 'get',
    params: { only_online: onlyOnline },
  })

/** 只有这些通道的设备真能跑用例。 */
export const isExecutable = (d: RunDevice): boolean => {
  const status = String(d.status || '').toLowerCase()
  if (status && status !== 'online' && status !== 'idle' && status !== 'ready') return false
  return !!d.sn
}
