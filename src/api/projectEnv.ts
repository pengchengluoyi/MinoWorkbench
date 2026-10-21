import { request } from '@/lib/request'
import { normalizeEnvDoc, type EnvDocument } from '@/domains/testing/config/envModel'

interface ProjectEnvironmentResponse {
  project_id: string
  project_name: string
  env: EnvDocument
  profile_labels: Record<string, string>
}

/** GET /project/:id/env returns an envelope whose data contains env. */
export const getProjectEnv = async (projectId: string): Promise<EnvDocument> => {
  const response = await request<ProjectEnvironmentResponse>({
    url: `/project/${projectId}/env`,
    method: 'get',
  })
  const payload = response.data
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || payload.project_id !== projectId || !Object.hasOwn(payload, 'env')) {
    throw new Error('环境配置接口返回结构或项目归属不匹配')
  }
  return normalizeEnvDoc(payload.env)
}

export const updateProjectEnv = (projectId: string, payload: EnvDocument) =>
  request({ url: `/project/${projectId}/env`, method: 'put', data: payload })
