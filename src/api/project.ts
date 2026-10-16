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

export interface ProjectMaintainer {
  user_id: string
  name: string
  email: string
  source: 'creator' | 'member'
  added_by: string
  added_at: number
}

export interface ProjectMaintainers {
  items: ProjectMaintainer[]
  can_edit: boolean
  can_manage: boolean
}

export const getProjectMaintainers = (projectId: string) =>
  request<ProjectMaintainers>({ url: `/project/${projectId}/maintainers`, method: 'get' })

export const addProjectMaintainer = (projectId: string, userId: string) =>
  request<ProjectMaintainer[]>({ url: `/project/${projectId}/maintainers`, method: 'post', data: { user_id: userId } })

export const removeProjectMaintainer = (projectId: string, userId: string) =>
  request<ProjectMaintainer[]>({ url: `/project/${projectId}/maintainers/${userId}`, method: 'delete' })

export interface AuthUser { user_id: string; name: string; username: string; email: string }

export const listAuthUsers = () =>
  request<{ users: AuthUser[] }>({ url: '/auth/users', method: 'get' })
