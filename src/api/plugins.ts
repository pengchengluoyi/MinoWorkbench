import { request } from '@/lib/request'

export interface PluginCapability {
  id: string
  label?: string
  categories?: string[]
  [key: string]: unknown
}

export interface Plugin {
  id: string
  name?: string
  kind?: string
  categories?: string[]
  connected?: boolean
  enabled?: boolean
  status?: string
  description?: string
  capabilities?: PluginCapability[]
  [key: string]: unknown
}

export const listPlugins = () => request<{ plugins?: Plugin[] }>({ url: '/settings/plugins', method: 'get' })

export const getPlugin = (pluginId: string) =>
  request<Plugin>({ url: `/settings/plugins/${encodeURIComponent(pluginId)}`, method: 'get' })

export const savePlugin = (pluginId: string, data: Record<string, unknown>) =>
  request({ url: `/settings/plugins/${encodeURIComponent(pluginId)}`, method: 'put', data })
