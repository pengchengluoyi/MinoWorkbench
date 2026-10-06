import { useQuery } from '@tanstack/react-query'
import { getSessionBundle, listSessions } from '@/api/sessions'

export const sessionKeys = {
  list: (appId: string, status: string, page: number, pageSize: number) =>
    ['sessions', 'list', appId, status, page, pageSize] as const,
  detail: (id: string) => ['sessions', 'detail', id] as const,
}

export const useSessionList = (appId: string, status: string, page: number, pageSize: number) =>
  useQuery({
    queryKey: sessionKeys.list(appId, status, page, pageSize),
    queryFn: () => listSessions({
      appId,
      status,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  })

export const useSessionDetail = (sessionId: string) =>
  useQuery({
    queryKey: sessionKeys.detail(sessionId),
    enabled: Boolean(sessionId),
    queryFn: () => getSessionBundle(sessionId),
  })
