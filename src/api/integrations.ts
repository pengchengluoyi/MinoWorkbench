import { request } from '@/lib/request'

export interface CaseAPISettings {
  base_url: string
}

export const getCaseAPISettings = () =>
  request<CaseAPISettings>({ url: '/settings/integrations/case-api', method: 'get' })

export const saveCaseAPISettings = (baseUrl: string) =>
  request<CaseAPISettings>({ url: '/settings/integrations/case-api', method: 'put', data: { base_url: baseUrl } })

export type CaseImportSettings = {
  block_on_step_key_issues_default?: boolean
  preview_batch_size?: number
  compile_regex_fallback?: boolean
}

export const getCaseImportSettings = () =>
  request<CaseImportSettings>({ url: '/settings/case-import', method: 'get' })

export const saveCaseImportSettings = (data: Partial<CaseImportSettings>) =>
  request<CaseImportSettings>({ url: '/settings/case-import', method: 'put', data })
