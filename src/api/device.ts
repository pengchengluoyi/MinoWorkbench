import { request, type NexusEnvelope } from '@/lib/request'
import { unwrapList } from '@/lib/unwrap'

export interface DeviceRow {
  sn: string
  type?: string
  model?: string
  status?: string
  platform?: string
  last_online?: string
  password_configured?: boolean
  password?: string
  [key: string]: unknown
}


/** 设备列表。密码只留「已配置」标记，不把明文放进界面状态。 */
export const listDevices = async (): Promise<DeviceRow[]> => {
  const res = await request({ url: '/device/list', method: 'get' })
  return unwrapList<DeviceRow>(res, { keys: ['devices', 'list', 'items'], label: 'GET /device/list' }).map((item) => {
    const next = { ...item }
    if (next.password) next.password_configured = true
    delete next.password
    return next
  })
}

const assertOk = (res: NexusEnvelope) => {
  const code = Number(res?.code)
  if (Number.isFinite(code) && code !== 200) {
    throw new Error(String(res?.message || res?.msg || '操作失败'))
  }
}

export const setDevicePassword = async (sn: string, password: string) => {
  const res = await request({
    url: '/device/set_password',
    method: 'post',
    data: { sn, password },
  })
  assertOk(res)
  return res
}

export const setAdbKeyboard = async (sn: string, enabled: boolean) => {
  const res = await request({
    url: `/device/${encodeURIComponent(sn)}/ime/${enabled ? 'adbkeyboard' : 'system'}`,
    method: 'post',
  })
  assertOk(res)
  return String(res?.message || res?.msg || (enabled ? '已启用 ADB Keyboard' : '已恢复系统输入法'))
}
