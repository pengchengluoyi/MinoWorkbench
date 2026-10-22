import { queryOptions, useQuery } from '@tanstack/react-query'
import { caseCompilePhase } from './caseUnderstanding'
import { useSession } from '@/lib/session'
import { getCaseModules, getCasePage, getProjectCase, getProjectCases, type CasePageParams, type CaseRow } from '@/api/projectCases'
import { listRunDevices, type RunDevice, type RunDeviceContext } from '@/api/run'
import { getCaseLastResults } from '@/api/caseRunner'
import { unwrapList, unwrapOne } from '@/lib/unwrap'

export const caseKeys = {
  list: (projectId: string) => ['cases', projectId, useSession.getState().user?.user_id || ''] as const,
  devices: ['run', 'devices'] as const,
  lastResults: (appId: string) => ['cases', 'lastResults', appId, useSession.getState().user?.user_id || ''] as const,
}

export const projectCasesOptions = (projectId: string) => queryOptions({
    queryKey: caseKeys.list(projectId),
    enabled: !!projectId,
    queryFn: async (): Promise<CaseRow[]> =>
      // 实际形状是 { data: { cases: [...] } } —— 之前按 .data 取，
      // 拿到对象不是数组，静默变空列表
      unwrapList<CaseRow>(await getProjectCases(projectId), {
        keys: ['cases'],
        label: 'GET /project/:id/cases',
      }),
  })

export const useProjectCases = (projectId: string, enabled = true) => useQuery({ ...projectCasesOptions(projectId), enabled: enabled && !!projectId })

export const casePageOptions = (projectId: string, params: CasePageParams) => queryOptions({
  queryKey: [...caseKeys.list(projectId), 'page', params.appId, params.search, params.module, params.result, params.page, params.size],
  enabled: !!projectId && !!params.appId,
  refetchInterval: query => query.state.data?.items.some(row => caseCompilePhase(row) === 'pending') ? 2000 : false,
  queryFn: async () => {
    const response = await getCasePage(projectId, params)
    return { items: unwrapList<CaseRow>(response, { keys: ['cases'], label: 'GET /project/:id/cases' }), total: Number(response.data?.total || 0) }
  },
})

export const useCasePage = (projectId: string, params: CasePageParams) => useQuery(casePageOptions(projectId, params))

export const useCaseModules = (projectId: string) => useQuery({
  queryKey: [...caseKeys.list(projectId), 'modules'], enabled: !!projectId,
  queryFn: async () => unwrapOne<{ items: { name: string; count: number }[]; total: number }>(await getCaseModules(projectId))!,
})

export const projectCaseOptions = (projectId: string, caseId: string) => queryOptions({
  queryKey: [...caseKeys.list(projectId), 'detail', caseId], enabled: !!projectId && !!caseId,
  staleTime: 0,
  refetchInterval: query => query.state.data && caseCompilePhase(query.state.data) === 'pending' ? 2000 : false,
  queryFn: async (): Promise<CaseRow> => {
    const response = await getProjectCase(projectId, caseId)
    const row = response.data?.case
    if (!row) throw new Error('用例详情未返回')
    const summary = response.data?.step_keys_summary
    return {
      ...row,
      title: row.title || String(row.name || row.case_id),
      ...(summary ? { step_keys_summary: summary } : {}),
    }
  },
})

export const useProjectCase = (projectId: string, caseId: string) => useQuery(projectCaseOptions(projectId, caseId))

/** 账号内的全部设备及服务端可执行判定，每 30 秒刷新任务上下文。 */
export const useRunDevices = (enabled = true, context: RunDeviceContext = {}) =>
  useQuery({
    queryKey: [...caseKeys.devices, useSession.getState().user?.user_id || '', context],
    enabled,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<RunDevice[]> => {
      const items = unwrapList<RunDevice>(await listRunDevices(false, context), {
        keys: ['devices'],
        label: 'GET /case-runner/devices',
      })
      return items
    },
  })

export type LastStatus = 'pass' | 'fail' | 'other'
export interface LastResult {
  status: LastStatus
  reason?: string
  at?: string
}

export const useLastResults = (appId: string, caseIds: string[]) =>
  useQuery({
    queryKey: [...caseKeys.lastResults(appId), [...caseIds].sort()],
    enabled: !!appId && !!caseIds.length,
    retry: false,
    queryFn: async (): Promise<Record<string, LastResult>> => {
      const response = await getCaseLastResults(appId, caseIds)
      const items = response.data?.items
      if (!items) throw new Error('上次结果未返回')
      const out: Record<string, LastResult> = {}
      for (const [id, result] of Object.entries(items)) {
        const value = String(result.status || '').toLowerCase()
        out[id] = { ...result, status: ['pass', 'passed', 'success', 'succeeded'].includes(value) ? 'pass' : /fail|error|exception/.test(value) ? 'fail' : 'other' }
      }
      return out
    },
  })
