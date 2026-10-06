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

export interface ImportPreviewRow {
  row_index: number
  case_id?: string
  title?: string
  name?: string
  module?: string
  conflict?: boolean
  selected_by_default?: boolean
  selected?: boolean
  [key: string]: unknown
}

export const listImportRequirements = (projectId: string) =>
  request<{ requirements?: { id: string; title?: string }[] }>({
    url: `/project/${projectId}/requirements`,
    method: 'get',
  })

export const previewCaseImport = (projectId: string, data: Record<string, unknown>) =>
  request<{ preview_token?: string; rows?: ImportPreviewRow[]; parsed?: number; conflicts?: unknown[] }>({
    url: `/project/${projectId}/cases/import/preview`,
    method: 'post',
    data,
    timeout: 120_000,
  })

export const commitCaseImport = (projectId: string, data: Record<string, unknown>) =>
  request<{ created?: number; updated?: number; skipped?: number }>({
    url: `/project/${projectId}/cases/import/commit`,
    method: 'post',
    data,
    timeout: 120_000,
  })
