export interface AppRow {
  id: string
  name?: string
  description?: string
  platforms?: string | string[]
  env?: Record<string, unknown>
  project_id?: string
  [key: string]: unknown
}

export interface ProjectRow {
  id: string
  name?: string
  description?: string
  apps?: AppRow[]
  [key: string]: unknown
}

/** /case-runner/tasks/summary 的每应用聚合 */
export interface TaskSummary {
  app_id?: string
  running?: number
  pending?: number
  failed?: number
  total?: number
  [key: string]: unknown
}

export interface RunRow {
  run_id?: string
  app_id?: string
  case_id?: string
  status?: string
  started_at?: string
  finished_at?: string
  [key: string]: unknown
}
