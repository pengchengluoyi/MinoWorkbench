import { requestData } from '@/lib/request'

export interface NodeToolTask {
  task_id: string
  operation_id: string
  node_id: string
  tool_id: string
  action: 'install' | 'update'
  state: 'pending' | 'running' | 'unknown' | 'succeeded' | 'failed' | 'interrupted'
  active: boolean
  stage?: string
  label?: string
  error?: string
  percent?: number
  bytes_total?: number
  bytes_received?: number
  created_at: number
  updated_at: number
}
export interface NodeTool {
  tool_id: string
  label: string
  purpose: string
  state: string
  version?: string | null
  runtime_environment?: 'development' | 'production'
  running_version?: string
  source_version?: string | null
  source_changed?: boolean
  restart_required?: boolean
  configured?: boolean | null
  removable?: boolean
  plugin_class?: string
  plugin_id?: string
  installable?: boolean
  updatable?: boolean
  required_by_config?: boolean
  config_key?: string
  detail?: string
  devices?: { sn: string; state: string; checked_at?: number }[]
}
export interface NodeTools {
  node_id: string
  online: boolean
  supported: boolean
  contract_version?: number
  stale: boolean
  reported_at?: number
  items: NodeTool[]
  tasks: NodeToolTask[]
}
export const getNodeTools = (nodeId: string) => requestData<NodeTools>({
  url: `/runtime/nodes/${encodeURIComponent(nodeId)}/tools`, method: 'get', timeout: 30_000,
})
export const submitNodeToolTask = (nodeId: string, toolId: string, operationId: string, action: 'install' | 'update' = 'install') => requestData<NodeToolTask>({
  url: `/runtime/nodes/${encodeURIComponent(nodeId)}/tool-tasks`, method: 'post', timeout: 22_000,
  data: { tool_id: toolId, operation_id: operationId, action },
})
