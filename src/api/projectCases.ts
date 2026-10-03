import { request } from '@/lib/request'

export interface CaseRow {
  case_id: string
  title?: string
  module?: string
  platform?: string
  precondition?: string
  steps?: string[] | string
  steps_raw?: string
  expected?: string[] | string
  expected_raw?: string
  requirement?: string
  source?: string
  [key: string]: unknown
}

export const getProjectCases = (projectId: string) =>
  request<CaseRow[]>({ url: `/project/${projectId}/cases`, method: 'get' })

export const deleteProjectCases = (projectId: string, caseIds: string[]) =>
  request({ url: `/project/${projectId}/cases/delete`, method: 'post', data: { case_ids: caseIds } })
