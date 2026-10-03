import { useQuery } from '@tanstack/react-query'
import { getProjects } from '@/api/project'
import { listCaseRunnerRuns, listTestingTaskSummary } from '@/api/caseRunner'
import type { ProjectRow } from '@/types/project'

export const projectKeys = {
  all: ['projects'] as const,
  taskSummary: (appIds: string[]) => ['tasks', 'summary', appIds.join(',')] as const,
}

/**
 * 两处双形状兜底沿用原实现：历史上这两个接口的返回体变过
 * （裸数组 / 信封、items / 裸数组），去掉兜底会在老 Nexus 上炸。
 */
export const useProjects = () =>
  useQuery({
    queryKey: projectKeys.all,
    queryFn: async (): Promise<ProjectRow[]> => {
      const res = await getProjects()
      const rows = Array.isArray(res) ? res : res?.data
      return Array.isArray(rows) ? rows : []
    },
  })

export interface AppTaskStat {
  runningCount: number
  status?: string
  completed?: number
  total?: number
}

/**
 * 任务角标。summary 接口在老 Nexus 上不存在，失败时降级到 /case-runner/runs。
 * 两个都失败就返回空 —— 计数是增强信息，不该拖垮主列表（契约「边界」节）。
 */
export const useAppTaskStats = (appIds: string[]) =>
  useQuery({
    queryKey: projectKeys.taskSummary(appIds),
    enabled: appIds.length > 0,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<Record<string, AppTaskStat>> => {
      try {
        const res = await listTestingTaskSummary(appIds)
        const raw = (res?.data as any)?.items ?? res?.data
        const list: any[] = Array.isArray(raw) ? raw : []
        if (list.length) {
          const out: Record<string, AppTaskStat> = {}
          for (const row of list) {
            const id = row.app_id || row.appId
            if (!id) continue
            out[id] = {
              runningCount: Number(row.running_count || 0),
              status: row.status || row.latest?.status,
              completed: row.completed ?? row.latest?.completed,
              total: row.total ?? row.latest?.total,
            }
          }
          return out
        }
      } catch {
        // 落到 runs 兜底
      }

      try {
        const res = await listCaseRunnerRuns(40)
        const runs: any[] = (res?.data as any)?.runs || []
        const out: Record<string, AppTaskStat> = {}
        for (const run of runs) {
          const id = run.app_id || run.appId
          if (!id) continue
          const prev = out[id] || { runningCount: 0 }
          const running = String(run.status || '').toLowerCase() === 'running'
          out[id] = {
            runningCount: prev.runningCount + (running ? 1 : 0),
            status: prev.status ?? run.status,
            completed: prev.completed ?? run.completed,
            total: prev.total ?? run.total,
          }
        }
        return out
      } catch {
        return {}
      }
    },
  })
