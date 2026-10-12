import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onRealtimeMessage } from '@/lib/realtime'
import { taskKeys } from '../tasks/queries'
import { caseKeys } from '../cases/queries'
import { caseId, type TaskRow } from '../tasks/types'

export function useAppRealtime(appId: string, projectId: string) {
  const client = useQueryClient()
  useEffect(() => onRealtimeMessage((message) => {
    if (message.type !== 'testing_task') return
    const data = message.data as Record<string, unknown> | undefined
    if (!data || data.app_id !== appId) return
    const id = String(data.task_id || data.run_id || '')
    const event = String(data.event || '')
    if (id) {
      client.setQueryData<TaskRow>(taskKeys.detail(id), (previous) => {
        if (!previous) return previous
        if (data.case_id && (event === 'case_finished' || event === 'case_running')) {
          return { ...previous, cases: previous.cases?.map((row) => caseId(row) === data.case_id
            ? { ...row, status: event === 'case_running' ? 'running' : String(data.status || row.status || '') } : row) }
        }
        return data.status && !data.case_id ? { ...previous, status: String(data.status) } : previous
      })
    }
    if (event === 'task_created' || event === 'task_finished' || event === 'case_finished') {
      void client.invalidateQueries({ queryKey: taskKeys.list(appId) })
      if (id) void client.invalidateQueries({ queryKey: taskKeys.detail(id) })
      void client.invalidateQueries({ queryKey: caseKeys.lastResults(appId) })
      if (projectId) void client.invalidateQueries({ queryKey: caseKeys.list(projectId),
        predicate: (query) => query.queryKey[3] === 'page' && query.queryKey[4] === appId && query.queryKey[7] !== 'all' })
    }
  }), [client, appId, projectId])
}
