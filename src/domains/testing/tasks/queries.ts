import { queryOptions, useQuery } from '@tanstack/react-query'
import { getTestingTask, listTestingTasks } from '@/api/caseRunner'
import { unwrapList, unwrapOne } from '@/lib/unwrap'
import type { TaskRow } from './types'
import { useSession } from '@/lib/session'
import { verdictOf } from './types'

export const taskKeys = {
  list: (appId: string) => ['tasks', appId, useSession.getState().user?.user_id || ''] as const,
  detail: (id: string) => ['account', useSession.getState().user?.user_id || '', 'task', id] as const,
}

/** 批次列表只用来做顶部选择器，所以只要最近若干条。 */
export const taskListOptions = (appId: string, page = 1, size = 50, status = '') => queryOptions({
    queryKey: [...taskKeys.list(appId), status, page, size],
    enabled: !!appId,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const result = await listTestingTasks({ appId, status, limit: size, offset: (page - 1) * size, summary: true })
      const body = unwrapOne<{ total?: number }>(result)
      const items = unwrapList<TaskRow>(result, { keys: ['tasks'], label: 'GET /case-runner/tasks' })
      return { items, total: Number(body?.total ?? items.length) }
    },
  })

export const useTaskList = (appId: string, page = 1, size = 50, status = '') => useQuery(taskListOptions(appId, page, size, status))

/**
 * 批次详情。执行中时 5 秒轮询——WebSocket 推送之外留一条兜底，
 * 断线时页面不会静默停更（设计见 docs/交互设计.md §三）。
 */
export const useTaskDetail = (id: string, live: boolean) =>
  useQuery({
    queryKey: taskKeys.detail(id),
    enabled: !!id,
    refetchInterval: (query) => live && verdictOf(query.state.data?.status) === 'running' ? 5_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<TaskRow> => unwrapOne<TaskRow>(await getTestingTask(id)) || ({} as TaskRow),
  })
