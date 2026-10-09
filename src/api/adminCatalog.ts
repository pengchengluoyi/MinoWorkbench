import { request } from '@/lib/request'

export interface ResourceKeyEntry {
  key_ref?: string
  key_layer?: string
  write_category?: string
  event_name?: string
  kind?: string
  block_id?: string
  platforms?: string[]
  schemes?: string[]
  write_examples?: string[]
}

export interface TransitionRule {
  rule_id: string
  trigger_id?: string
  platform?: string
  label?: string
  effects?: unknown[]
  enabled?: boolean
}

export interface SkillRow {
  id: string
  label?: string
  description?: string
  enabled?: boolean
  sort_order?: number
}

export const getCaseResourceCatalog = () =>
  request<{ entries?: ResourceKeyEntry[]; key_layers?: { id: string; label: string }[] }>({
    url: '/settings/case-resource-key',
    method: 'get',
  })

export const getTransitionRules = () =>
  request<{ rules?: TransitionRule[] }>({
    url: '/settings/resource-transition-rules',
    method: 'get',
  })

export const listSkills = () =>
  request<{ skills?: SkillRow[] }>({
    url: '/settings/ai/skills',
    method: 'get',
  })

export interface JobRow {
  id: string
  label?: string
  summary?: string
  engine?: string
  role_id?: string
  enabled?: boolean
}

export interface JobHealth {
  ok?: number
  broken?: { id: string; error: string }[]
}

export interface RoleRow {
  id: string
  label?: string
  group?: string
  system_prompt?: string
  skill_ids?: string[]
}

export interface StackSkill { id: string; label?: string }
export interface StackRole { id: string; label?: string; skill_ids?: string[] }
export interface StackTrigger { id: string; label?: string; intents?: string[] }

export interface PackRow {
  uid?: string
  id: string
  kind?: string
  title?: string
  display_name?: string
  description?: string
  enabled?: boolean
  lifecycle?: string
  platforms?: string[]
}

export interface FlowBlockRow {
  id: string
  name?: string
  enabled?: boolean
  slots?: { id?: string; name?: string }[]
}

export const listJobs = () =>
  request<{ jobs?: JobRow[] }>({ url: '/settings/ai/jobs', method: 'get' })

export const getJobsHealth = () =>
  request<JobHealth>({ url: '/settings/ai/jobs/health', method: 'get' })

export const listRoles = () =>
  request<{ roles?: RoleRow[] }>({ url: '/settings/ai/roles', method: 'get' })

export const getRole = (id: string) =>
  request<RoleRow>({ url: `/settings/ai/roles/${encodeURIComponent(id)}`, method: 'get' })

export const saveRolePrompt = (id: string, system_prompt: string) =>
  request<RoleRow>({
    url: `/settings/ai/roles/${encodeURIComponent(id)}/prompt`,
    method: 'put',
    data: { system_prompt },
  })

export const getStack = () =>
  request<{ roles?: StackRole[]; skills?: StackSkill[]; triggers?: StackTrigger[] }>({
    url: '/settings/ai/stack',
    method: 'get',
  })

export const listPacks = () =>
  request<{ items?: PackRow[]; counts?: Record<string, number> }>({ url: '/packs', method: 'get' })

export const listFlowBlocks = () =>
  request<{ items?: FlowBlockRow[] }>({ url: '/flow-blocks', method: 'get' })
