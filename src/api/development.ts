import { request } from '@/lib/request'

export interface DevelopmentConfig {
  enabled: boolean
  node_id: string
  connection_id: string
  connection_revision: number
  project_path: string
  source_dir: string
  run_configuration: string
  build_configuration: string
  target_url: string
  expected_build: string
  expected_instance_id?: string
  build_field: string
  service_log_path: string
  apk_path: string
  android_serial: string
  apk_package: string
  apk_version_code: string
  execution_allowed: boolean
  test_parameters_confirmed: boolean
}
export interface IDEConnection { connection_id: string; revision: number; url: string; transport: string }
export interface PreparationResult {
  reason?: string
  reason_code?: string
  operation_id?: string
  stage?: string
  stages?: { name: string; at: number }[]
  actual_build?: string
  build?: string
  expected_build?: string
  actual_instance_id?: string
  instance_verified?: boolean
  support?: { read: boolean; execute: boolean; restart: boolean; restart_mode?: string; logs: boolean }
  recovery?: { at: number; source: string }
  receipt_lookup?: { reason?: string }
  package?: string
  version_code?: string
  device?: string
  apk_sha256?: string
  connected?: boolean
  project_matched?: boolean
  target_ready?: boolean
  build_verified?: boolean
  configurations?: string[]
  tools?: string[]
  server?: { name?: string; version?: string }
  checked_at?: number
  connection?: IDEConnection
  connections?: IDEConnection[]
  manual_review?: { confirmed_idle: boolean }
  receipt?: { output: string; source: string; truncated: boolean; timedOut?: boolean; exitCode?: number }
}
export interface DevelopmentBinding {
  revision: number; checked_revision: number; config: DevelopmentConfig; check: PreparationResult
}
export interface Preparation {
  operation_id: string; node_id: string; action: string; revision: number
  state: 'queued' | 'running' | 'ready' | 'failed' | 'awaiting_developer' | 'unknown'
  created_at: number; deadline: number; result: PreparationResult
}
const base = (appId: string) => `/project/app/${encodeURIComponent(appId)}/development`
export const getDevelopment = (appId: string) => request<DevelopmentBinding>({ url: base(appId) })
export const saveDevelopment = (appId: string, data: { revision: number; config: DevelopmentConfig }) =>
  request<DevelopmentBinding>({ url: base(appId), method: 'put', data })
export const listPreparations = (appId: string) => request<{ items: Preparation[] }>({ url: `${base(appId)}/operations` })
export const prepareDevelopment = (appId: string, action: string, revision: number, operationId: string) =>
  request<Preparation>({ url: `${base(appId)}/operations`, method: 'post', data: { operation_id: operationId, action, revision } })
export const configureIDE = (appId: string, data: Record<string, unknown>) =>
  request<Preparation>({ url: `${base(appId)}/connections`, method: 'post', data })
export const recoverPreparation = (appId: string, operationId: string) =>
  request<Preparation>({ url: `${base(appId)}/operations/${encodeURIComponent(operationId)}/recover`, method: 'post' })
export const reviewPreparation = (appId: string, operationId: string) =>
  request<Preparation>({ url: `${base(appId)}/operations/${encodeURIComponent(operationId)}/manual-review`, method: 'post', data: { confirmed_idle: true } })

/** Pure import preview. Never executes a command or persists the pasted JSON. */
export function parseIDEImport(text: string): { name: string; url: string; transport: string; headers?: Record<string, string>; header_env?: Record<string, string> }[] {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('需要 JSON 对象')
  const root = value as Record<string, unknown>
  if (root.mcpServers && root.servers) throw new Error('配置同时含两种服务器列表，请只保留一种')
  const servers = root.mcpServers ?? root.servers
  if (servers && (typeof servers !== 'object' || Array.isArray(servers))) throw new Error('服务器列表格式无效')
  const entries = servers ? Object.entries(servers as Record<string, unknown>) : [['pycharm', root] as const]
  return entries.map(([name, item]) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('服务器配置无效')
    const row = item as Record<string, unknown>
    if (Object.keys(row).some(key => !['url', 'type', 'transport', 'headers', 'header_env'].includes(key))) throw new Error('不支持此配置格式；不执行 Stdio command/args')
    if (!['http', 'streamable-http', 'sse'].includes(String(row.transport ?? row.type ?? 'streamable-http'))) throw new Error('仅支持显式 HTTP 流或 SSE，不自动切换')
    const url = new URL(String(row.url))
    if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !url.port || url.username || url.password || url.search || url.hash) throw new Error('只接受带明确端口的本机回环地址，不接受凭据或查询参数')
    const headers = row.headers as Record<string, string> | undefined
    if (headers && (typeof headers !== 'object' || Array.isArray(headers) || Object.entries(headers).some(([key, value]) => key.toLowerCase() !== 'x-idea-project' || typeof value !== 'string' || /[\r\n]/.test(value) || value.length > 2048))) throw new Error('不接收明文认证 header；请使用 header_env 本机环境变量名称引用')
    const env = row.header_env as Record<string, string> | undefined
    if (env && (typeof env !== 'object' || Array.isArray(env) || Object.entries(env).some(([key, value]) => !['authorization', 'x-api-key'].includes(key.toLowerCase()) || typeof value !== 'string' || !/^MINO_IDE_[A-Z0-9_]{1,100}$/.test(value)))) throw new Error('header_env 只能引用 MINO_IDE_ 开头的本机环境变量名，不要粘贴密钥值')
    return { name, url: String(row.url), transport: (row.transport ?? row.type) === 'sse' ? 'sse' : 'streamable-http', ...(headers ? { headers } : {}), ...(env ? { header_env: env } : {}) }
  })
}
