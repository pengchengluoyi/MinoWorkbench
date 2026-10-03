/** 字段名沿用 Nexus 的返回体，不在前端改名（开发手册 §12）。 */

export type RawStatus =
  | 'running' | 'pending' | 'queued'
  | 'success' | 'done' | 'passed'
  | 'failed' | 'exception'
  | 'cancelled' | 'canceled' | 'skipped'

export interface TaskCase {
  case_id?: string
  caseId?: string
  title?: string
  status?: string
  overall_status?: string
  fail_reason?: string
  failure?: string
  message?: string
  steps?: unknown[]
  [key: string]: unknown
}

export interface TaskRow {
  task_id?: string
  taskId?: string
  run_id?: string
  app_id?: string
  title?: string
  status?: string
  total?: number
  completed?: number
  passed?: number
  failed?: number
  started_at?: string
  finished_at?: string
  cases?: TaskCase[]
  [key: string]: unknown
}

export const taskId = (t: TaskRow | undefined): string =>
  String(t?.task_id || t?.taskId || t?.run_id || '')

export const caseId = (c: TaskCase): string => String(c.case_id || c.caseId || '')

/** 9 种原始状态收口成 4 个语义档。 */
export type Verdict = 'pass' | 'fail' | 'running' | 'other'

export const verdictOf = (raw: unknown): Verdict => {
  const s = String(raw || '').toLowerCase()
  if (/fail|error|exception/.test(s)) return 'fail'
  if (/pass|success|done/.test(s)) return 'pass'
  if (/run|pending|queue/.test(s)) return 'running'
  return 'other'
}

/** 失败 → 其他 → 执行中 → 通过。通过的是噪音，排最后。 */
const ORDER: Record<Verdict, number> = { fail: 0, other: 1, running: 2, pass: 3 }
export const byAttention = (a: TaskCase, b: TaskCase): number =>
  ORDER[verdictOf(a.status || a.overall_status)] - ORDER[verdictOf(b.status || b.overall_status)]

export const failReason = (c: TaskCase): string =>
  String(c.fail_reason || c.failure || c.message || '')
