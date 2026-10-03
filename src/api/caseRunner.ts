import { request } from '@/lib/request'
import type { RunRow, TaskSummary } from '@/types/project'

/** 主路径用到的 case-runner 子集。其余接口在对应阶段按需补。 */

export const listCaseRunnerRuns = (limit = 30) =>
  request<RunRow[]>({ url: '/case-runner/runs', method: 'get', params: { limit } })

export const getCaseRunnerRun = (runId: string) =>
  request<RunRow>({ url: `/case-runner/runs/${runId}`, method: 'get' })

export const listTestingTasks = (
  { appId, status, limit = 50, offset = 0 }: { appId?: string; status?: string; limit?: number; offset?: number } = {},
) =>
  request<unknown>({
    url: '/case-runner/tasks',
    method: 'get',
    params: { app_id: appId || undefined, status: status || undefined, limit, offset },
  })

export const getTestingTask = (taskId: string) =>
  request<unknown>({ url: `/case-runner/tasks/${taskId}`, method: 'get' })

export const cancelTestingTask = (taskId: string) =>
  request({ url: `/case-runner/tasks/${taskId}/cancel`, method: 'post' })

export const retryFailedTestingTask = (taskId: string) =>
  request({ url: `/case-runner/tasks/${taskId}/retry`, method: 'post' })

/** 应用卡片上的任务计数。appIds 为空时不带参数，避免拉全量。 */
export const listTestingTaskSummary = (appIds: string[] = []) =>
  request<TaskSummary[] | Record<string, TaskSummary>>({
    url: '/case-runner/tasks/summary',
    method: 'get',
    params: { app_ids: appIds.filter(Boolean).join(',') || undefined },
  })

export const listCaseRunnerDevices = (onlyOnline = true) =>
  request<unknown>({ url: '/case-runner/devices', method: 'get', params: { only_online: onlyOnline } })
