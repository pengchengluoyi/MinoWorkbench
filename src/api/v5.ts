import { request } from '@/lib/request'

export interface V5Preview {
  compile_job_id?: string
  compile_job?: { status: string }
  eligible: boolean
  draft_revision: number
  errors: { reason_code: string; control_id?: string; point_id?: string }[]
  actions: Record<string, unknown>[]
  check_program_plan: Record<string, unknown>
  source: Record<string, unknown>
  provenance: Record<string, unknown>
  baseline: { control_id?: string }
  baseline_controls: { control_id: string; target_desc: string }[]
}
const base = (projectId: string, caseId: string) => `/project/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}/v5`
export const getV5Preview = (projectId: string, caseId: string) => request<V5Preview>({ url: `${base(projectId, caseId)}/preview`, method: 'get' })
export const compileV5Draft = (projectId: string, caseId: string, expectedRevision: number, requestId: string) => request<{ preview: V5Preview }>({ url: `${base(projectId, caseId)}/compile`, method: 'post', data: { expected_revision: expectedRevision, client_request_id: requestId } })
export const getV5Metrics = (projectId: string) => request<Record<string, unknown>>({ url: `/project/${encodeURIComponent(projectId)}/v5/metrics`, method: 'get' })
export const getV5Controls = (projectId: string) => request<{ items: Record<string, unknown>[] }>({ url: `/project/${encodeURIComponent(projectId)}/controls`, method: 'get' })

export interface V5Control {
  control_id: string
  project_id: string
  target_desc: string
  scope: string
  revision: number
  sensitive: boolean
  publish_state: string
  published_by: string
  published_at: string
  locator_spec: { playwright?: { contract: string; scope: { kind: string; page_id: string }; selector: { kind: string; value: string; name?: string; exact?: boolean }; cardinality: string } }
}
const controlBase = (projectId: string, controlId: string) => `/project/${encodeURIComponent(projectId)}/controls/${encodeURIComponent(controlId)}`
export const listV5Controls = (projectId: string) => request<{ items: V5Control[]; identity_conflicts: { control_id: string; count: number }[] }>({ url: `/project/${encodeURIComponent(projectId)}/controls`, method: 'get' })
export const saveV5Control = (projectId: string, controlId: string, data: { expected_revision: number; locator_spec: V5Control['locator_spec']; sensitive: boolean; publish?: boolean }) => request<V5Control>({ url: controlBase(projectId, controlId), method: 'put', data })
export const probeV5Control = (projectId: string, controlId: string, data: { expected_revision: number; sn: string; url: string }) => request<Record<string, unknown>>({ url: `${controlBase(projectId, controlId)}/probe`, method: 'post', data, timeout: 25_000 })


export interface ExecutionPreview {
  status: 'ready' | 'needs_input' | 'blocked' | 'not_applicable'
  diagnostics: { reason_code: string; operation_ref?: string; step_ref?: string; clause_ref?: string; missing_fields?: string[]; blocking?: boolean; requirement_status?: string }[]
  runnable_now: false
}
export const previewExecution = (projectId: string, caseId: string, params: {
  app_id: string; sn: string; env_profile: string; env_surface: string; action_scheme: string; execution_mode: string
}) => request<ExecutionPreview>({ url: `/project/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}/execution-preview`, method: 'get', params })
