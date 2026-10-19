import { request } from '@/lib/request'

export interface CollabBotTemplate {
  id: string
  label: string
  description: string
  job_ids: string[]
}

export interface CollabBot {
  bot_id: string
  name: string
  template_id: string
  status: string
  app_ids?: string[]
}

export interface CollabTopicAnchor {
  kind?: string
  case_id?: string
  app_id?: string
  case_title?: string
}

export interface CollabTopicMember {
  kind: string
  id: string
  label?: string
}

export interface CollabTopicMemory {
  summary?: string
  updated_at?: string
}

export interface CollabImRoute {
  channel?: string
  chat_id?: string
  node_id?: string
  label?: string
}

export interface CollabAgentNode {
  id: string
  label: string
  kind: string
  status: string
  snippet?: string
  position?: { x: number; y: number }
}

export interface CollabLangGraphStep {
  id: string
  label: string
  agent_id: string
  status: string
}

export interface CollabAgentCanvas {
  nodes: CollabAgentNode[]
  edges: { from: string; to: string }[]
  langgraph_steps?: CollabLangGraphStep[]
  agent_to_langgraph?: Record<string, string>
  langgraph_to_agent?: Record<string, string>
  transcript?: {
    agent_id: string
    label: string
    step: string
    status: string
    body?: string
  }[]
  trace?: unknown[]
  engine?: string
  mermaid?: string
  langgraph_mermaid?: string
  active_agent?: string
  layout?: string
  renderers?: Record<string, string>
}

export interface StewardOverview {
  total: number
  executable: number
  blocked: number
  last_pass: number
  last_fail: number
  progress_hint: string
  stages: { id: string; label: string; status: string }[]
}

export interface CollabScopeSnapshot {
  total?: number
  executable?: string[]
  blocked?: unknown[]
  blocked_message?: string
  cases?: { case_id: string; title?: string; executable?: boolean }[]
  version?: string
}

export interface CollabTopic {
  topic_id: string
  project_id: string
  app_id: string
  title: string
  goal: string
  status: string
  lead_user_id: string
  input_version: string
  paused?: boolean
  requirement_id?: string
  modules?: string[]
  scope_case_ids?: string[]
  scope_snapshot?: CollabScopeSnapshot
  overview?: StewardOverview
  anchor?: CollabTopicAnchor
  memory?: CollabTopicMemory
  pipeline_state?: Record<string, unknown>
  im_route?: CollabImRoute
  members: CollabTopicMember[]
  agent_canvas?: CollabAgentCanvas
}

export interface CollabActivity {
  activity_id: string
  topic_id: string
  kind: string
  body: string
  refs?: Record<string, unknown>
  created_at: string
}

export interface OpenHandsStatus {
  configured: boolean
  reachable: boolean
  url: string
  message: string
  setup?: string
  ui_home?: string
  embed_hint?: string
  oss?: string
  config_source?: 'env' | 'settings' | 'none'
  editable?: boolean
}

export interface OpenHandsUiLinks {
  conversation_id?: string
  ui_url?: string
  ui_url_alt?: string
}

export interface CollabMarketItem {
  id: string
  template_id: string
  label: string
  description: string
  oss?: string
  source?: string
  requires_openhands?: boolean
  openhands_ready?: boolean
  installed?: boolean
}

export interface CollabApproval {
  approval_id: string
  work_item_id: string
  status: string
  approver_user_id: string
  comment: string
}

export interface CollabMessage {
  reply_status?: 'sending' | 'queued' | 'running' | 'succeeded' | 'failed' | 'interrupted' | ''
  reply_error?: string
  message_id: string
  author_kind: string
  author_id: string
  acting_bot_id: string
  body: string
  created_at: string
}

export interface CollabWorkItem {
  work_item_id: string
  task_id: string
  title: string
  goal: string
  acceptance: string
  status: string
  action_kind: string
  action_label?: string
  action_hint?: string
  activity?: string
  run_id?: string
  case_ids?: string[]
  evidence?: Record<string, unknown>
  blocked_reason: string
  holder_user_id: string
  assignee_kind: string
  assignee_id: string
  input_version: string
  last_result: Record<string, unknown>
}

const base = (projectId: string) => `/project/${encodeURIComponent(projectId)}/collab`

export const getCollabOpenHandsStatus = (projectId: string) =>
  request<OpenHandsStatus>({ url: `${base(projectId)}/openhands/status`, method: 'get' })

export const saveCollabOpenHandsConfig = (projectId: string, api_url: string) =>
  request<OpenHandsStatus>({ url: `${base(projectId)}/openhands/config`, method: 'put', data: { api_url } })

export const listCollabTemplates = (projectId: string) =>
  request<{ items: CollabBotTemplate[] }>({ url: `${base(projectId)}/templates`, method: 'get' })

export const listCollabMarketplace = (projectId: string) =>
  request<{ items: CollabMarketItem[] }>({ url: `${base(projectId)}/marketplace`, method: 'get' })

export const installCollabMarketBot = (projectId: string, data: { market_id: string; name?: string }) =>
  request<CollabBot>({ url: `${base(projectId)}/bots/install`, method: 'post', data })

export const ensureCollabBots = (projectId: string) =>
  request<{ items: CollabBot[] }>({ url: `${base(projectId)}/bots/ensure-defaults`, method: 'post' })

export const listCollabBots = (projectId: string) =>
  request<{ items: CollabBot[] }>({ url: `${base(projectId)}/bots`, method: 'get' })

export const createCollabBot = (
  projectId: string,
  data: { name?: string; template_id: string; app_ids?: string[] },
) => request<CollabBot>({ url: `${base(projectId)}/bots`, method: 'post', data })

export const listCollabTopics = (projectId: string, signal?: AbortSignal) =>
  request<{ items: CollabTopic[] }>({ url: `${base(projectId)}/topics`, method: 'get', signal })

export const getCollabTopic = (projectId: string, topicId: string, signal?: AbortSignal) =>
  request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}`, method: 'get', signal })

export const createCollabTopic = (
  projectId: string,
  data: { title: string; goal?: string; app_id?: string; bot_ids?: string[] },
) => request<CollabTopic>({ url: `${base(projectId)}/topics`, method: 'post', data })

export const patchCollabTopic = (
  projectId: string,
  topicId: string,
  data: { title?: string; goal?: string; status?: string },
) => request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}`, method: 'patch', data })

export const pauseCollabTopic = (projectId: string, topicId: string) =>
  request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}/pause`, method: 'post' })

export const resumeCollabTopic = (projectId: string, topicId: string) =>
  request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}/resume`, method: 'post' })

export const closeCollabTopic = (projectId: string, topicId: string) =>
  request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}/close`, method: 'post' })

export const deleteCollabTopic = (projectId: string, topicId: string, force = false) =>
  request({
    url: `${base(projectId)}/topics/${topicId}/delete`,
    method: 'post',
    data: { force },
  })

export const startCollabSteward = (projectId: string, topicId: string) =>
  request({ url: `${base(projectId)}/topics/${topicId}/steward/start`, method: 'post' })

export const listCollabActivities = (projectId: string, topicId: string, signal?: AbortSignal) =>
  request<{ items: CollabActivity[] }>({ url: `${base(projectId)}/topics/${topicId}/activities`, method: 'get', signal })

export const openCollabTopicFromCase = (projectId: string, data: { app_id: string; case_id: string }) =>
  request<{ topic: CollabTopic; created: boolean }>({ url: `${base(projectId)}/topics/from-case`, method: 'post', data })

export const listCollabMessages = (projectId: string, topicId: string, signal?: AbortSignal) =>
  request<{ items: CollabMessage[] }>({ url: `${base(projectId)}/topics/${topicId}/messages`, method: 'get', signal })

export const postCollabMessage = (projectId: string, topicId: string, body: string) =>
  request({ url: `${base(projectId)}/topics/${topicId}/messages`, method: 'post', data: { body } })

export const listCollabWorkItems = (projectId: string, topicId: string, signal?: AbortSignal) =>
  request<{ items: CollabWorkItem[] }>({ url: `${base(projectId)}/topics/${topicId}/work-items`, method: 'get', signal })

export const decomposeCollabTopic = (
  projectId: string,
  topicId: string,
  data: {
    goal?: string
    use_llm?: boolean
    bump_version?: boolean
    include_case_run?: boolean
  },
) =>
  request<{ items: CollabWorkItem[]; idempotent?: boolean; input_version?: string }>({
    url: `${base(projectId)}/topics/${topicId}/decompose`,
    method: 'post',
    data,
  })

export const transferCollabWorkItem = (
  projectId: string,
  workItemId: string,
  data: { holder_user_id?: string; assignee_kind?: string; assignee_id?: string },
) => request<CollabWorkItem>({ url: `${base(projectId)}/work-items/${workItemId}/transfer`, method: 'post', data })

export const runCollabPipeline = (
  projectId: string,
  topicId: string,
  data: { goal?: string; bump_version?: boolean; engine?: string },
) =>
  request<{ items: CollabWorkItem[]; pipeline?: Record<string, unknown> }>({
    url: `${base(projectId)}/topics/${topicId}/pipeline/run`,
    method: 'post',
    data: { goal: data.goal, bump_version: data.bump_version ?? true, engine: data.engine || 'agentscope' },
  })

export const advanceCollabTopic = (
  projectId: string,
  topicId: string,
  data: { goal?: string; message?: string; sync_memory?: boolean; engine?: string },
) =>
  request<{ hint?: string; next_steps?: { work_item_id: string; action: string; label: string }[]; items?: CollabWorkItem[] }>({
    url: `${base(projectId)}/topics/${topicId}/advance`,
    method: 'post',
    data,
  })

export const refreshCollabKnowledge = (projectId: string, topicId: string) =>
  request({ url: `${base(projectId)}/topics/${topicId}/knowledge/refresh`, method: 'post' })

export const listCollabApprovals = (projectId: string, workItemId: string) =>
  request<{ items: CollabApproval[] }>({ url: `${base(projectId)}/work-items/${workItemId}/approvals`, method: 'get' })

export const decideCollabApproval = (
  projectId: string,
  workItemId: string,
  approvalId: string,
  data: { decision: string; comment?: string },
) =>
  request<CollabApproval>({
    url: `${base(projectId)}/work-items/${workItemId}/approvals/${approvalId}/decide`,
    method: 'post',
    data,
  })

export const refreshCollabMemory = (projectId: string, topicId: string) =>
  request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}/memory/refresh`, method: 'post' })

export const bindCollabIm = (
  projectId: string,
  topicId: string,
  data: { channel: string; chat_id: string; node_id?: string; label?: string },
) => request<CollabTopic>({ url: `${base(projectId)}/topics/${topicId}/im/bind`, method: 'post', data })

export const applyCollabDrafts = (projectId: string, workItemId: string, confirm = true, replace = false) =>
  request({ url: `${base(projectId)}/work-items/${workItemId}/apply-drafts`, method: 'post', data: { confirm, replace } })

export const triggerCollabWorkItem = (
  projectId: string,
  workItemId: string,
  opts: { forceRetry?: boolean } = {},
) =>
  request({
    url: `${base(projectId)}/work-items/${workItemId}/trigger`,
    method: 'post',
    data: {
      force_retry: opts.forceRetry ?? false,
    },
  })
