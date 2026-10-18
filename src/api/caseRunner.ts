import { request } from '@/lib/request'
import type { RunRow, TaskSummary } from '@/types/project'

/** 主路径用到的 case-runner 子集。其余接口在对应阶段按需补。 */

export const listCaseRunnerRuns = (limit = 30) =>
  request<RunRow[]>({ url: '/case-runner/runs', method: 'get', params: { limit } })

export const getCaseRunnerRun = (runId: string) =>
  request<RunRow>({ url: `/case-runner/runs/${runId}`, method: 'get' })

export const listTestingTasks = (
  { appId, status, limit = 50, offset = 0, summary = false }: { appId?: string; status?: string; limit?: number; offset?: number; summary?: boolean } = {},
) =>
  request<unknown>({
    url: '/case-runner/tasks',
    method: 'get',
    params: { app_id: appId || undefined, status: status || undefined, limit, offset, summary },
  })

export const getCaseLastResults = (appId: string, caseIds: string[]) =>
  request<{ items: Record<string, { status: string; reason?: string; at?: string }> }>({
    url: '/case-runner/case-results', method: 'post', data: { app_id: appId, case_ids: caseIds },
  })

export const getTestingTask = (taskId: string) =>
  request<unknown>({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}`, method: 'get' })

export const getSessionTrajectory = (sessionId: string) =>
  request<Record<string, unknown>>({ url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/trajectory`, method: 'get' })

export const getCaseRunnerTraceDetail = (runId: string) =>
  request<Record<string, unknown>>({ url: `/case-runner/traces/${encodeURIComponent(runId)}`, method: 'get' })

export const cancelTestingTask = (taskId: string) =>
  request({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}/cancel`, method: 'post' })

export const retryFailedTestingTask = (taskId: string, unitIds: string[], requestId: string) =>
  request<{ task_id: string }>({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}/retry-failed`, method: 'post',
    data: { execution_unit_ids: unitIds, client_request_id: requestId } })

export interface RetryEligibility {
  eligible: boolean
  eligible_unit_ids: string[]
  remaining_budget_seconds: number | null
  blockers: { reason_code: string; message: string }[]
  execution_units: { execution_unit_id: string; case_id: string; sn: string; eligible: boolean; reason_codes: string[] }[]
}
export const getRetryEligibility = (taskId: string) => request<RetryEligibility>({
  url: `/case-runner/tasks/${encodeURIComponent(taskId)}/retry-eligibility`, method: 'get',
})
export const getTaskWriteSafety = (taskId: string) => request<{
  resource_isolated: boolean
  missing_evidence: string[]
  actions: { sn: string; stop_confirmed: boolean; resource_reset_verified: boolean; reason_code: string }[]
  resources: { resource_key: string; state: string; expired: boolean; epoch: number }[]
  reconciliation_count: number
}>({ url: `/case-runner/tasks/${encodeURIComponent(taskId)}/write-safety`, method: 'get' })

/** 应用卡片上的任务计数。appIds 为空时不带参数，避免拉全量。 */
export const listTestingTaskSummary = (appIds: string[] = []) =>
  request<TaskSummary[] | Record<string, TaskSummary>>({
    url: '/case-runner/tasks/summary',
    method: 'get',
    params: { app_ids: appIds.filter(Boolean).join(',') || undefined },
  })

export const listCaseRunnerDevices = (onlyOnline = true) =>
  request<unknown>({ url: '/case-runner/devices', method: 'get', params: { only_online: onlyOnline } })

export const recheckTaskWriteSafety = (taskId: string) =>
  request<{
    resource_isolated: boolean
    business_result_unchanged: boolean
    actions?: { recovered: boolean; stop_confirmed?: boolean; resource_reset_verified?: boolean; mode?: string; reason_code: string }[]
    baseline_required?: { sn: string; package_id: string; session: string }[]
  }>({
    url: `/case-runner/tasks/${encodeURIComponent(taskId)}/write-safety/recheck`, method: 'post', timeout: 120_000,
  })
