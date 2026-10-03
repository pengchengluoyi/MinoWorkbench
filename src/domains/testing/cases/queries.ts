import { useQuery } from '@tanstack/react-query'
import { getProjectCases, type CaseRow } from '@/api/projectCases'
import { listRunDevices, isExecutable, type RunDevice } from '@/api/run'
import { listTestingTasks } from '@/api/caseRunner'
import { unwrapList } from '@/lib/unwrap'

export const caseKeys = {
  list: (projectId: string) => ['cases', projectId] as const,
  devices: ['run', 'devices'] as const,
  lastResults: (appId: string) => ['cases', 'lastResults', appId] as const,
}

export const useProjectCases = (projectId: string) =>
  useQuery({
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

/** 在线且真能跑的设备。没有它就不能下发，所以 30 秒刷一次。 */
export const useRunDevices = () =>
  useQuery({
    queryKey: caseKeys.devices,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<RunDevice[]> => {
      const items = unwrapList<RunDevice>(await listRunDevices(true), {
        keys: ['devices'],
        label: 'GET /case-runner/devices',
      })
      return items.filter(isExecutable)
    },
  })

export type LastStatus = 'pass' | 'fail' | 'other'
export interface LastResult {
  status: LastStatus
  reason?: string
  at?: string
}

/**
 * 用例的「上次结果」。
 *
 * 注意：/project/:id/cases 的行上**没有**这个字段，只能从最近的执行批次里反推
 * （批次的 cases 数组带每条用例的状态）。这是选择用例时的真实依据
 * ——「哪些一直在挂」——所以值得多一个查询。
 */
export const useLastResults = (appId: string) =>
  useQuery({
    queryKey: caseKeys.lastResults(appId),
    enabled: !!appId,
    retry: false,
    queryFn: async (): Promise<Record<string, LastResult>> => {
      const tasks = unwrapList<any>(await listTestingTasks({ appId, limit: 20 }), {
        keys: ['tasks'],
        label: 'GET /case-runner/tasks',
      })
      const out: Record<string, LastResult> = {}
      // 任务按时间倒序，先到的就是最近的，已有的不覆盖
      for (const task of tasks) {
        for (const c of task?.cases || []) {
          const id = String(c?.case_id || c?.caseId || '')
          if (!id || out[id]) continue
          const s = String(c?.status || c?.overall_status || '').toLowerCase()
          const status: LastStatus = /pass|success|done/.test(s)
            ? 'pass'
            : /fail|error|exception/.test(s)
              ? 'fail'
              : 'other'
          out[id] = {
            status,
            reason: c?.fail_reason || c?.failure || c?.message || '',
            at: task?.finished_at || task?.started_at || '',
          }
        }
      }
      return out
    },
  })
