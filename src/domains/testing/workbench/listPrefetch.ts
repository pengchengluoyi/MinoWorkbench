import { queryClient } from '@/lib/queryClient'
import { appDetailOptions } from './queries'
import { casePageOptions } from '../cases/queries'
import type { CasePageParams } from '@/api/projectCases'
import { taskListOptions } from '../tasks/queries'
import type { Tab } from './nav'

export const loadCasesPanel = () => import('../cases/CasesPanel')
export const loadTasksPanel = () => import('../tasks/TasksPanel')

export async function preloadAppPanel(appId: string, tab: Tab, page = 1, caseParams?: CasePageParams, taskSize = 50) {
  if (!appId) return
  if (tab === 'tasks') {
    await Promise.all([loadTasksPanel(), queryClient.prefetchQuery(taskListOptions(appId, page, taskSize))])
  } else if (tab === 'cases') {
    await Promise.all([
      loadCasesPanel(),
      (async () => {
        const app = queryClient.getQueryData(appDetailOptions(appId).queryKey)
          || await queryClient.fetchQuery(appDetailOptions(appId))
        if (app.project_id) await queryClient.prefetchQuery(casePageOptions(app.project_id,
          caseParams || { appId, page: 1, size: 50, search: '', module: '', result: 'all' }))
      })(),
    ])
  }
}
