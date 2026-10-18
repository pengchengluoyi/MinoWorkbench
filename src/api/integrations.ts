import { request } from '@/lib/request'

export interface CaseAPISettings {
  base_url: string
}

export const getCaseAPISettings = () =>
  request<CaseAPISettings>({ url: '/settings/integrations/case-api', method: 'get' })

export const saveCaseAPISettings = (baseUrl: string) =>
  request<CaseAPISettings>({ url: '/settings/integrations/case-api', method: 'put', data: { base_url: baseUrl } })
