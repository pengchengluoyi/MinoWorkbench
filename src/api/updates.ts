import { requestData } from '@/lib/request'
export type Component = 'nexus' | 'workbench'
export interface UpdateInfo {
  installation_id?: string
  current_build_id?: string
  current_version?: string
  target_build_id?: string
  target_version?: string
  release_tag?: string
  update_available?: boolean
  package_verified?: boolean
  operation_id?: string
  state?: string
  phase?: string
  error?: string
  recovery?: string
  recovery_error?: string
  helper_started?: boolean
}
const base = (c: Component) => c === 'nexus' ? '/sys/updates' : '/sys/workbench/updates'
export const installation = (c: Component) => requestData<UpdateInfo>({ url: c === 'nexus' ? '/sys/updates/status' : '/sys/workbench/installation' })
export const checkUpdate = (c: Component, installation_id?: string) => requestData<UpdateInfo>({ url: `${base(c)}/check`, params: { installation_id } })
export const prepareUpdate = (c: Component, data: object) => requestData<UpdateInfo>({ url: `${base(c)}/prepare`, method: 'post', data, timeout: 600_000 })
export const startUpdate = (c: Component, data: object) => requestData<UpdateInfo>({ url: `${base(c)}/request`, method: 'post', data })
export const updateStatus = (c: Component, operation_id: string, installation_id?: string) => requestData<UpdateInfo>({ url: `${base(c)}/status`, params: { operation_id, installation_id } })
export const cancelUpdate = (c: Component, operation_id: string, installation_id?: string) => requestData<UpdateInfo>({ url: c === 'nexus' ? `${base(c)}/${encodeURIComponent(operation_id)}/cancel` : `${base(c)}/cancel`, method: 'post', data: c === 'workbench' ? { operation_id, installation_id } : undefined })
