import { useQuery } from '@tanstack/react-query'
import { getTestingTask, listTestingTasks } from '@/api/caseRunner'
import type { TaskRow } from './types'

export const taskKeys = {
  list: (appId: string) => ['tasks', appId] as const,
  detail: (id: string) => ['task', id] as const,
}

const unwrapList = (res: any): TaskRow[] => {
  const raw = res?.data?.items ?? res?.data?.tasks ?? res?.data ?? []
  return Array.isArray(raw) ? raw : []
}

/** 批次列表只用来做顶部选择器，所以只要最近若干条。 */
export const useTaskList = (appId: string) =>
  useQuery({
    queryKey: taskKeys.list(appId),
    enabled: !!appId,
    refetchInterval: 15_000,
    queryFn: async () => unwrapList(await listTestingTasks({ appId, limit: 30 })),
  })

/**
 * 批次详情。执行中时 5 秒轮询——WebSocket 推送之外留一条兜底，
 * 断线时页面不会静默停更（设计见 docs/交互设计.md §三）。
 */
export const useTaskDetail = (id: string, live: boolean) =>
  useQuery({
    queryKey: taskKeys.detail(id),
    enabled: !!id,
    refetchInterval: live ? 5_000 : false,
    queryFn: async (): Promise<TaskRow> => {
      const res = await getTestingTask(id)
      return ((res as any)?.data ?? res) as TaskRow
    },
  })
