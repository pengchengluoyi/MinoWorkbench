import { request, type NexusEnvelope } from '@/lib/request'

export interface SessionRow {
  session_id: string
  case_id?: string
  status?: string
  event_count?: number
  started_at?: string
  summary?: string
  [key: string]: unknown
}

export interface SessionMeta {
  status?: string
  event_count?: number
  run_id?: string
  case_id?: string
  started_at?: string
  finished_at?: string
  summary?: string
}

export interface SessionEvent {
  seq?: number
  type?: string
  turn?: number
  phase?: string
  ts?: string
  payload?: unknown
}

export interface SessionTurn {
  turn?: number
  phase?: string
  outcome_status?: string
  outcome_cap?: string
  think?: { capability_id?: string; status?: string }
  tools?: { kind?: string; name?: string; tool?: string }[]
  decisions?: { type?: string }[]
}

export interface LlmCall {
  turn?: number
  job?: string
  model?: string
  status?: string
  total_tokens?: number
  elapsed_ms?: number
  dispatch_id?: string
}

export interface SessionMetrics {
  llm_calls?: number
  llm_tokens?: number
  tool_calls?: number
  tool_failures?: number
  recovery_hits?: number
  inspection_count?: number
  guard_blocks?: number
}

export interface SessionListData {
  items?: SessionRow[]
  total?: number
}

export interface SessionEventsData {
  events?: SessionEvent[]
  total?: number
  has_more?: boolean
  meta?: SessionMeta
}

const dataOf = <T>(res: NexusEnvelope<T>): T => (res?.data ?? {}) as T

export const listSessions = async (params: {
  appId?: string
  status?: string
  limit: number
  offset: number
}) => {
  const res = await request<SessionListData>({
    url: '/case-runner/sessions',
    method: 'get',
    params: {
      app_id: params.appId || undefined,
      status: params.status || undefined,
      limit: params.limit,
      offset: params.offset,
    },
  })
  const data = dataOf(res)
  return {
    items: data.items || [],
    total: Number(data.total || 0),
  }
}

export const getSessionBundle = async (sessionId: string) => {
  const id = encodeURIComponent(sessionId)
  const [eventsRes, llmRes, metricsRes, turnsRes] = await Promise.all([
    request<SessionEventsData>({
      url: `/case-runner/sessions/${id}/events`,
      method: 'get',
      params: { from_seq: 0, limit: 100 },
    }),
    request<{ items?: LlmCall[] }>({ url: `/case-runner/sessions/${id}/llm`, method: 'get' }),
    request<SessionMetrics>({ url: `/case-runner/sessions/${id}/metrics`, method: 'get' }),
    request<{ turns?: SessionTurn[] }>({ url: `/case-runner/sessions/${id}/turns`, method: 'get' }),
  ])
  const events = dataOf(eventsRes)
  return {
    meta: events.meta || null,
    events: events.events || [],
    eventTotal: Number(events.total ?? events.meta?.event_count ?? events.events?.length ?? 0),
    hasMore: Boolean(events.has_more),
    llm: dataOf(llmRes).items || [],
    metrics: eventsRes ? dataOf(metricsRes) : null,
    turns: dataOf(turnsRes).turns || [],
  }
}

export const getSessionEventsPage = async (sessionId: string, fromSeq: number) => {
  const res = await request<SessionEventsData>({
    url: `/case-runner/sessions/${encodeURIComponent(sessionId)}/events`,
    method: 'get',
    params: { from_seq: fromSeq, limit: 100 },
  })
  const data = dataOf(res)
  return {
    events: data.events || [],
    total: Number(data.total ?? 0),
    hasMore: Boolean(data.has_more),
  }
}
