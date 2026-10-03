import { useQuery } from '@tanstack/react-query'
import { getHealth, getServerInfo } from '@/api/me'
import { getRuntimeStatus } from '@/api/system'

/** query key 集中声明（手册 §8），不在组件里拼数组。 */
export const healthKeys = {
  serverInfo: ['sys', 'server_info'] as const,
  health: ['sys', 'health'] as const,
  runtime: ['sys', 'runtime'] as const,
}

export const useServerInfo = () =>
  useQuery({ queryKey: healthKeys.serverInfo, queryFn: getServerInfo, retry: false })

export const useHealth = () =>
  useQuery({ queryKey: healthKeys.health, queryFn: getHealth, retry: false, refetchInterval: 30_000 })

export const useRuntimeStatus = () =>
  useQuery({ queryKey: healthKeys.runtime, queryFn: getRuntimeStatus, retry: false })
