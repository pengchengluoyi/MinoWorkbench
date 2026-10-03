import { request } from '@/lib/request'
import { serializePlatformSelection } from '@/constants/appPlatforms'
import type { AppRow, ProjectRow } from '@/types/project'

export const getProjects = () => request<ProjectRow[]>({ url: '/project/list', method: 'get' })

export const createProject = (data: { name: string; description?: string }) =>
  request<ProjectRow>({ url: '/project/create', method: 'post', data })

export const deleteProject = (projectId: string) =>
  request({ url: `/project/${projectId}`, method: 'delete' })

export const createAppInProject = (
  projectId: string,
  app: { name: string; description?: string; platforms?: string | string[]; env?: Record<string, unknown> },
) =>
  request<AppRow>({
    url: '/project/app/create',
    method: 'post',
    data: {
      project_id: projectId,
      name: app.name,
      description: app.description,
      platforms: serializePlatformSelection(app.platforms).join(','),
      env: app.env || {},
    },
  })

export const getAppDetail = (appId: string) =>
  request<AppRow>({ url: `/project/app/${appId}`, method: 'get' })

export const deleteApp = (appId: string) =>
  request({ url: `/project/app/${appId}`, method: 'delete' })

export const updateAppEnv = (appId: string, env: Record<string, unknown>) =>
  request({ url: `/project/app/${appId}/env`, method: 'put', data: { env } })
