import { request } from '@/lib/request'

export interface AccountRow {
  account_id?: string
  account_ident?: string
  username?: string
  email?: string
  phone?: string
  display_name?: string
  env?: string
  locked?: boolean
  registered?: boolean
  note?: string
  session_display?: string
  identity_display?: string
  [key: string]: unknown
}

export interface ResourceLogRow {
  id?: string
  action?: string
  detail?: string
  reason?: string
  created_at?: string
  account_ident?: string
  case_id?: string
  task_id?: string
  [key: string]: unknown
}

export interface DeviceAppSessionRow {
  sn?: string
  package_id?: string
  app_version?: string
  app_version_display?: string
  session_id?: string
  session_display?: string
  note?: string
  created_at?: string
  [key: string]: unknown
}

export const getProjectAccounts = (projectId: string, env = '') =>
  request<{ accounts?: AccountRow[] }>({
    url: `/project/${projectId}/accounts`,
    method: 'get',
    params: env ? { env } : {},
  })

export const getResourceLogs = (projectId: string, params: { page?: number; page_size?: number } = {}) =>
  request<{ logs?: ResourceLogRow[] }>({
    url: `/project/${projectId}/resource-allocation-logs`,
    method: 'get',
    params: { page: params.page ?? 1, page_size: params.page_size ?? 50 },
  })

export const getDeviceAppSessions = (projectId: string, limit = 200) =>
  request<{ sessions?: DeviceAppSessionRow[] }>({
    url: `/project/${projectId}/device-app-sessions`,
    method: 'get',
    params: { limit },
  })
