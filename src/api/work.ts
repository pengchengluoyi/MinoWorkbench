import { request } from '@/lib/request'

export type WorkStatus =
  | 'draft' | 'planning' | 'running' | 'waiting_human' | 'blocked'
  | 'paused' | 'done' | 'failed' | 'cancelled'

export interface WorkProgress {
  done: number
  total: number
  percent: number
  counts: Record<string, number>
}

export interface WorkStep {
  step_id: string
  work_id: string
  seq: number
  step_key: string
  plan_step_id: string
  kind: string
  agent_id: string
  job_id: string
  role_id: string
  title: string
  intent: string
  status: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  ref_type: string
  ref_id: string
  parent_step_id: string
  attempt: number
  max_attempts: number
  error: string
  created_at: string
  updated_at: string
  started_at?: string | null
  finished_at?: string | null
}

export interface WorkApproval {
  approval_id: string
  work_id: string
  step_id: string
  kind: string
  status: string
  title: string
  prompt: string
  options: { value: string; label: string }[]
  decision: Record<string, unknown>
  requested_by: string
  decided_by: string
  created_at: string
  decided_at: string
  expires_at: string
}

export interface WorkArtifact {
  artifact_id: string
  work_id: string
  step_id: string
  kind: string
  title: string
  ref_type: string
  ref_id: string
  uri: string
  sha256: string
  meta: Record<string, unknown>
  created_at: string
}

export interface WorkEvent {
  event_id: string
  seq: number
  type: string
  step_id: string
  actor: string
  payload: Record<string, unknown>
  created_at: string
}

export interface WorkSummary {
  work_id: string
  project_id: string
  topic_id: string
  owner_user_id: string
  source_message_id: string
  title: string
  goal: string
  status: WorkStatus
  plan_revision: number
  plan_index: number
  blocked_reason: string
  stop_requested: number
  created_at: string
  updated_at: string
  finished_at?: string | null
  progress: WorkProgress
}

export interface WorkDetail extends WorkSummary {
  plan: {
    title?: string
    goal?: string
    steps?: { id: string; title: string; agent_id: string; intent: string }[]
    risks?: string[]
  }
  acceptance: { id: string; text: string; required?: boolean }[]
  review: Record<string, unknown>
  instructions: string[]
  budget: Record<string, number>
  spent: Record<string, number>
  steps: WorkStep[]
  approvals: WorkApproval[]
  artifacts: WorkArtifact[]
  links: { link_id: string; kind: string; ref_id: string; step_id: string; meta: Record<string, unknown> }[]
  events: WorkEvent[]
}

const base = (projectId: string) => `/project/${encodeURIComponent(projectId)}/work`

export async function createWork(projectId: string, body: {
  goal: string; title?: string; topic_id?: string; acceptance?: string[]; instructions?: string[]
}) {
  return (await request<WorkSummary>({
    url: base(projectId), method: 'post', data: body,
  })).data!
}

export async function listWork(projectId: string, topicId: string, status = '') {
  return (await request<WorkSummary[]>({
    url: base(projectId), params: { topic_id: topicId, status, limit: 50 },
  })).data || []
}

export async function getWork(projectId: string, workId: string) {
  return (await request<WorkDetail>({
    url: base(projectId) + '/' + encodeURIComponent(workId),
  })).data!
}

export async function decideWorkApproval(projectId: string, workId: string, approvalId: string,
  decision: 'approve' | 'reject', comment = '') {
  return (await request<WorkApproval>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/approvals/' + encodeURIComponent(approvalId),
    method: 'post', data: { decision, comment },
  })).data
}

export async function pauseWork(projectId: string, workId: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/pause', method: 'post',
  })).data
}

export async function resumeWork(projectId: string, workId: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/resume', method: 'post',
  })).data
}

export async function cancelWork(projectId: string, workId: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/cancel', method: 'post',
  })).data
}

export async function handoffWork(projectId: string, topicId: string, workId: string, memberId: string, note = '') {
  return (await request<{ message: unknown; work: WorkSummary }>({
    url: `/project/${encodeURIComponent(projectId)}/collab/workspaces/${encodeURIComponent(topicId)}/handoff`,
    method: 'post', data: { work_id: workId, member_id: memberId, note },
  })).data!
}

export async function instructWork(projectId: string, workId: string, text: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/instruct',
    method: 'post', data: { text },
  })).data
}


export async function patchWorkPlan(projectId: string, workId: string, body: {
  plan: {
    title?: string
    goal?: string
    steps: { id: string; title: string; agent_id: string; intent: string }[]
    risks?: string[]
  }
  acceptance: { id: string; text: string; required?: boolean }[]
  expected_revision: number
}) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/plan',
    method: 'patch', data: body,
  })).data
}

export async function takeoverWorkStep(projectId: string, workId: string, stepId: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/steps/' + encodeURIComponent(stepId) + '/takeover',
    method: 'post',
  })).data
}

export async function retryWorkStep(projectId: string, workId: string, stepId: string) {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/steps/' + encodeURIComponent(stepId) + '/retry',
    method: 'post',
  })).data
}

export async function resolveWorkStep(projectId: string, workId: string, stepId: string,
  decision: 'executed' | 'not_executed', note = '') {
  return (await request<WorkSummary>({
    url: base(projectId) + '/' + encodeURIComponent(workId) + '/steps/' + encodeURIComponent(stepId) + '/resolve',
    method: 'post', data: { decision, note },
  })).data
}
