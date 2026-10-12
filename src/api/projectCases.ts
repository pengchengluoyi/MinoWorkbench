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

export interface CasePageParams {
  appId: string
  page: number
  size: number
  search: string
  module: string
  result: 'all' | 'failed' | 'never'
}

export const getCasePage = (projectId: string, params: CasePageParams) =>
  request<{ cases: CaseRow[]; total: number }>({
    url: `/project/${projectId}/cases`, method: 'get',
    params: { app_id: params.appId, limit: params.size, offset: (params.page - 1) * params.size,
      search: params.search, module: params.module, result: params.result },
  })

export const getCaseModules = (projectId: string) =>
  request<{ items: { name: string; count: number }[]; total: number }>({ url: `/project/${projectId}/case-modules`, method: 'get' })

export const getProjectCase = (projectId: string, caseId: string) =>
  request<{ case: CaseRow }>({ url: `/project/${projectId}/cases/${encodeURIComponent(caseId)}`, method: 'get' })

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
  parse_status?: string
  [key: string]: unknown
}

export const listImportRequirements = (projectId: string) =>
  request<{ requirements?: { id: string; title?: string }[] }>({
    url: `/project/${projectId}/requirements`,
    method: 'get',
  })

export const previewCaseImport = (projectId: string, data: Record<string, unknown>) =>
  request<{ preview_token?: string; rows?: ImportPreviewRow[]; parsed?: number; total?: number; done?: boolean; conflicts?: unknown[] }>({
    url: `/project/${projectId}/cases/import/preview`,
    method: 'post',
    data,
    timeout: 60_000,
  })

export const getImportPreview = (projectId: string, token: string) =>
  request<{ preview_token?: string; rows?: ImportPreviewRow[]; parsed?: number; total?: number; done?: boolean }>({
    url: `/project/${projectId}/cases/import/preview/${token}`,
    method: 'get',
  })

export const cancelImportPreview = (projectId: string, token: string) =>
  request({ url: `/project/${projectId}/cases/import/preview/${token}/cancel`, method: 'post' })

export const retryImportPreviewRow = (projectId: string, token: string, rowIndex: number) =>
  request<{ rows?: ImportPreviewRow[]; parsed?: number; total?: number; done?: boolean }>({
    url: `/project/${projectId}/cases/import/preview/${token}/retry`,
    method: 'post',
    data: { row_index: rowIndex },
  })

export const commitCaseImport = (projectId: string, data: Record<string, unknown>) =>
  request<{ created?: number; updated?: number; skipped?: number }>({
    url: `/project/${projectId}/cases/import/commit`,
    method: 'post',
    data,
    timeout: 120_000,
  })
