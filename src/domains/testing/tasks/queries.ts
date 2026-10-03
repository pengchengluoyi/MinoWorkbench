import { useQuery } from '@tanstack/react-query'
import { getTestingTask, listTestingTasks } from '@/api/caseRunner'
import { unwrapList, unwrapOne } from '@/lib/unwrap'
import type { TaskRow } from './types'

export const taskKeys = {
  list: (appId: string) => ['tasks', appId] as const,
  detail: (id: string) => ['task', id] as const,
}

/** 批次列表只用来做顶部选择器，所以只要最近若干条。 */
export const useTaskList = (appId: string) =>
  useQuery({
    queryKey: taskKeys.list(appId),
    enabled: !!appId,
    refetchInterval: 15_000,
    queryFn: async () => unwrapList<TaskRow>(await listTestingTasks({ appId, limit: 30 }), {
      keys: ['tasks'],
      label: 'GET /case-runner/tasks',
    }),
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
    queryFn: async (): Promise<TaskRow> => unwrapOne<TaskRow>(await getTestingTask(id)) || ({} as TaskRow),
  })
