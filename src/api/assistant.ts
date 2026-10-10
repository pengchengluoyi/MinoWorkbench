import { request } from '@/lib/request'

/**
 * 助手（我的助手 / 助手工具）。契约见 docs/contracts/assistant.md。
 * 字段名与 Nexus 一致，不在前端改名。
 */

export interface ImChannelStatus {
  channel: string
  connected: boolean
  last_message_at: number
}

export interface ImNodeStatus {
  node_id: string
  name: string
  alive: boolean
  channels: ImChannelStatus[]
}

export interface AssistantStatus {
  enabled: boolean
  online: boolean
  mcp_url: string
  im_nodes: ImNodeStatus[]
}

export interface AssistantProfile {
  user_id: string
  persona: string
  default_app_id: string
  default_app_name: string
  default_sn: string
  default_device_name: string
  enabled: boolean
}

export interface ProfilePatch {
  default_app_id?: string
  default_sn?: string
  persona?: string
  enabled?: boolean
}

export interface BindCode {
  code: string
  expires_in: number
}

export interface AssistantIdentity {
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
export type CardStatus = 'running' | 'done' | 'failed' | 'need_input'

export interface TraceStep {
  tool: string
  label: string
  /** MCP 面写 error，IM 面（assistant_agent）写 fail，两种都要认。 */
  status: 'ok' | 'error' | 'fail'
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

export interface CardAction {
  id: string
  label: string
  url?: string
}

export interface MinoCard {
  // Nexus 实际不下发 card_id / turn_id（build_card 只有 status/header/blocks/actions）
  card_id?: string
  turn_id?: string
  status: CardStatus
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
  status: 'ok' | 'error' | 'need_input' | 'done' | 'failed' | 'running'
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
  messages: { role: 'user' | 'assistant'; text: string; ts: number }[]
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
  const res = (await request<T>(config)) as { ok?: boolean; code?: number; message?: string; data?: T }
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
