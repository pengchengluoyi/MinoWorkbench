import { request } from '@/lib/request'
import type { ImChannelStatus } from '@/types/im'
export type { ImChannelStatus } from '@/types/im'

/**
 * 助手（我的助手 / 助手工具）。契约见 docs/contracts/assistant.md。
 * 字段名与 Nexus 一致，不在前端改名。
 */

export interface ImNodeStatus {
  node_id: string
  name: string
  alive: boolean
  channels: ImChannelStatus[]
}

export interface AssistantStatus {
  enabled: boolean
  online: boolean
  mcp_available: boolean
  mcp_url: string
  im_nodes: ImNodeStatus[]
}

export interface AssistantProfile {
  user_id: string
  persona: string
  enabled: boolean
}

export interface ProfilePatch {
  persona?: string
  enabled?: boolean
}

export interface BindCode {
  code: string
  expires_in: number
}

export interface AssistantIdentity {
  instance_id: string
  node_id: string
  node_name?: string
  status?: string
  id: number
  channel: string
  sender_id_masked: string
  tenant: string
  bound_at: number
}

export interface AssistantTool {
  id: string
  title: string
  description: string
  risk: 'read' | 'write'
  surfaces: ('im' | 'mcp')[]
  route: string
  async: boolean
  params_schema: Record<string, unknown>
}

export type CardTone = 'info' | 'success' | 'warn' | 'danger'
export type CardStatus = 'running' | 'done' | 'failed' | 'need_input' | 'submitted' | 'blocked' | 'uncertain'

export interface TraceStep {
  tool: string
  label: string
  /** MCP 面写 error，IM 面（assistant_agent）写 fail，两种都要认。 */
  status: 'ok' | 'error' | 'fail' | 'ask'
  ms: number
  args_brief?: string
}

export type CardBlock =
  | { type: 'intent'; text: string }
  | { type: 'trace'; steps: TraceStep[] }
  | { type: 'kv'; items: [string, string][] }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'progress'; done: number; total: number }
  | { type: 'summary'; text: string }
  | { type: 'image'; ref: string }
  | { type: 'problem'; text: string }
  | { type: 'next_steps'; items: string[] }
  | { type: 'choices'; items: RequestChoice[] }
  | { type: 'case_results'; items: { number: number | string; case_id: string; name: string; status: string; status_label: string; summary: string; advice: string }[] }

export interface CardAction {
  id: string
  label: string
  url?: string
}

export interface MinoCard {
  // Nexus 实际不下发 card_id / turn_id（build_card 只有 status/header/blocks/actions）
  card_id?: string
  turn_id?: string
  card_type?: 'clarification' | 'notification' | 'dialogue'
  body_redacted?: boolean
  status: CardStatus
  request?: { id: string; revision: number; state: string; expires_at: number; question: { field?: string; candidates?: RequestChoice[] } }
  header: { title: string; tone: CardTone }
  blocks: CardBlock[]
  actions: CardAction[]
}

export interface AssistantTurn {
  turn_id: string
  surface: 'im' | 'mcp'
  channel: string
  chat_id_masked: string
  /** MCP 面 ok/error；IM 面是卡片状态 done/failed/need_input/running。 */
  status: 'ok' | 'error' | CardStatus
  intent: string
  steps: TraceStep[]
  card: MinoCard | null
  prompt_tokens: number
  completion_tokens: number
  elapsed_ms: number
  created_at: number
  detail: Record<string, unknown>
}

export interface TurnMessages {
  available: boolean
  reason: string
  messages: { role: 'user' | 'assistant'; text: string; ts: number; card?: MinoCard }[]
}

export interface McpToken {
  id: number
  name: string
  prefix: string
  created_at: number
  last_used_at: number
  revoked: boolean
}

export interface McpTokenCreated {
  id: number
  name: string
  token: string
  mcp_url: string
}

export interface AssistantSubscription {
  id: number
  kind: 'run_done' | 'daily_report'
  target_id: string
  channel: string
  created_at: number
  status: 'active' | 'done'
}

/** 解开 `{code:200, ok:true, data}` 信封；业务失败（ok=false / code!=200）抛错。 */
async function call<T>(config: Parameters<typeof request>[0]): Promise<T> {
  let response: unknown
  try {
    response = await request<T>(config)
  } catch (error) {
    const failure = error as { message?: string; response?: { data?: { detail?: unknown } } }
    if (typeof failure.response?.data?.detail === 'string') failure.message = failure.response.data.detail
    throw error
  }
  const res = response as { ok?: boolean; code?: number; message?: string; data?: T }
  if (res?.ok === false || (typeof res?.code === 'number' && res.code !== 200)) {
    throw new Error(res?.message || '请求失败')
  }
  return res?.data as T
}

/** 后端未就绪：404/501/502/503，或 dev 代理没转发（返回了 HTML）。 */
export const isAssistantNotReady = (e: unknown): boolean => {
  const any = e as { response?: { status?: number }; message?: string }
  const s = any?.response?.status
  if (s === 404 || s === 501 || s === 502 || s === 503) return true
  return /返回了 HTML/.test(String(any?.message || ''))
}

export const getAssistantStatus = () => call<AssistantStatus>({ url: '/assistant/status', method: 'get' })
export interface ReportSettings { workbench_url: string; effective_url: string; source: 'configured' | 'environment' | 'lan_default'; available: boolean }
export const getReportSettings = () => call<ReportSettings>({ url: '/assistant/report-settings', method: 'get' })
export const saveReportSettings = (workbench_url: string) => call<ReportSettings>({ url: '/assistant/report-settings', method: 'put', data: { workbench_url } })
export const getAssistantProfile = () => call<AssistantProfile>({ url: '/assistant/profile', method: 'get' })
export const putAssistantProfile = (body: ProfilePatch) =>
  call<AssistantProfile>({ url: '/assistant/profile', method: 'put', data: body })

export const createBindCode = () => call<BindCode>({ url: '/assistant/bind/code', method: 'post' })
export const listIdentities = () => call<{ items: AssistantIdentity[] }>({ url: '/assistant/identities', method: 'get' })
export const deleteIdentity = (id: number) => call<unknown>({ url: `/assistant/identities/${id}`, method: 'delete' })

export const listAssistantTools = () => call<{ items: AssistantTool[] }>({ url: '/assistant/tools', method: 'get' })

export const listTurns = (params: { limit: number; offset: number; surface?: string }) =>
  call<{ items: AssistantTurn[]; total: number }>({
    url: '/assistant/turns',
    method: 'get',
    params: { limit: params.limit, offset: params.offset, ...(params.surface ? { surface: params.surface } : {}) },
  })
export const getTurn = (turnId: string) =>
  call<AssistantTurn>({ url: `/assistant/turns/${encodeURIComponent(turnId)}`, method: 'get' })
export const getTurnMessages = (turnId: string) =>
  call<TurnMessages>({ url: `/assistant/turns/${encodeURIComponent(turnId)}/messages`, method: 'get' })

export const listMcpTokens = () => call<{ items: McpToken[] }>({ url: '/assistant/mcp-tokens', method: 'get' })
export const createMcpToken = (name: string) =>
  call<McpTokenCreated>({ url: '/assistant/mcp-tokens', method: 'post', data: { name } })
export const revokeMcpToken = (id: number) => call<unknown>({ url: `/assistant/mcp-tokens/${id}`, method: 'delete' })

export const listSubscriptions = () =>
  call<{ items: AssistantSubscription[] }>({ url: '/assistant/subscriptions', method: 'get' })
export const deleteSubscription = (id: number) =>
  call<unknown>({ url: `/assistant/subscriptions/${id}`, method: 'delete' })

export type AssistantRequestState = 'need_input' | 'resolving' | 'submitted' | 'cancelled' | 'expired' | 'failed' | 'uncertain' | 'done'
export interface RequestChoice { label: string; value: string }
export interface PendingAssistantRequest {
  id: string
  lane: string
  tool_id: string
  args: Record<string, unknown>
  target: Record<string, unknown>
  question: { field?: string; candidates?: RequestChoice[] }
  result?: { problem?: string; next_steps?: string[] }
  state: AssistantRequestState
  revision: number
  task_id: string
  task_status?: string
  display?: { app?: string; channel?: string }
  origin: { channel: string; chat_id_masked: string }
  created_at: number
  updated_at: number
  expires_at: number
}
export interface AssistantRequests {
  items: PendingAssistantRequest[]
  focuses: { lane: string; request_id: string; task_id: string }[]
}
export interface AssistantCapabilities {
  node_id: string
  node_name: string
  channel: string
  instance_id: string
  capabilities: { markdown: boolean; cards: boolean; buttons: boolean; streaming: boolean; threads: boolean; max_characters: number; attachment_types: string[] }
}
export interface AssistantGroupPolicy {
  id?: number
  channel: string
  instance_id: string
  tenant: string
  chat_id: string
  enabled: boolean
  allow_execute: boolean
  disclose_results: boolean
  project_ids: string[]
}
export const getAssistantRequests = () => call<AssistantRequests>({ url: '/assistant/requests', method: 'get' })
export const respondAssistantRequest = (id: string, revision: number, values: Record<string, unknown>) =>
  call<{ card: MinoCard }>({ url: `/assistant/requests/${encodeURIComponent(id)}/respond`, method: 'post', data: { revision, values } })
export const cancelAssistantRequest = (id: string, revision: number) =>
  call<{ cancelled: boolean }>({ url: `/assistant/requests/${encodeURIComponent(id)}/cancel`, method: 'post', data: { revision } })
export const getAssistantPreferences = () => call<Record<string, string>>({ url: '/assistant/preferences', method: 'get' })
export const setAssistantPreference = (key: string, value: string | null) =>
  call<Record<string, string>>({ url: `/assistant/preferences/${encodeURIComponent(key)}`, method: 'put', data: { value } })
export const getAssistantCapabilities = () => call<{ items: AssistantCapabilities[] }>({ url: '/assistant/capabilities', method: 'get' })
export const getAssistantGroupPolicies = () => call<{ items: AssistantGroupPolicy[] }>({ url: '/assistant/group-policies', method: 'get' })
export const putAssistantGroupPolicy = (data: AssistantGroupPolicy) => {
  const body = { ...data }
  delete body.id
  return call<{ id: number }>({ url: '/assistant/group-policies', method: 'put', data: body })
}

export interface AssistantMediaSettings {
  asr_provider_id: string
  asr_model: string
  providers: { id: string; name: string; configured: boolean }[]
}
export const getAssistantMediaSettings = () => call<AssistantMediaSettings>({ url: '/assistant/media-settings', method: 'get' })
export const putAssistantMediaSettings = (data: Pick<AssistantMediaSettings, 'asr_provider_id' | 'asr_model'>) =>
  call<Pick<AssistantMediaSettings, 'asr_provider_id' | 'asr_model'>>({ url: '/assistant/media-settings', method: 'put', data })

export const getAssistantRequestModules = (id: string) =>
  call<{ items: { name: string; count: number }[] }>({ url: `/assistant/requests/${encodeURIComponent(id)}/modules`, method: 'get' })
export const reviseAssistantRequestScope = (id: string, revision: number, modules: string[]) =>
  call<{ card: MinoCard }>({ url: `/assistant/requests/${encodeURIComponent(id)}/scope`, method: 'post', data: { revision, modules } })

export const focusAssistantRequest = (id: string) =>
  call<{ task_id: string }>({ url: `/assistant/requests/${encodeURIComponent(id)}/focus`, method: 'post' })
