import { request } from '@/lib/request'
import { nexusOrigin, usesDevProxy } from '@/lib/config'
import type { HealthInfo, ServerInfo } from '@/types/auth'

export const getMeBootstrap = () => request<Record<string, unknown>>({ url: '/me/bootstrap', method: 'get' })

export const getServerInfo = () => request<ServerInfo>({ url: '/sys/server_info', method: 'get' })

/** /health 不走 Nexus 信封，是裸 JSON，所以这里不用 request。 */
export const getHealth = async (): Promise<HealthInfo> => {
  const path = usesDevProxy() ? '/health' : `${nexusOrigin()}/health`
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
