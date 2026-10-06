import { request } from '@/lib/request'
import type { EnvDocument } from '@/domains/testing/config/envModel'

export const getProjectEnv = (projectId: string) =>
  request<EnvDocument & { env?: EnvDocument; project_name?: string }>({
    url: `/project/${projectId}/env`,
    method: 'get',
  })

export const updateProjectEnv = (projectId: string, payload: EnvDocument) =>
  request({ url: `/project/${projectId}/env`, method: 'put', data: payload })
