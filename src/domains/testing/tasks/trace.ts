import { screenshotSource } from '@/lib/screenshot'
import { bagOf as recordOf, integerOf, stepRefsOf, turnOf } from '../sessions/executionLinks'
import { parseInteraction, type TraceInteraction } from './interaction'

export interface TraceStep {
  step: number
  id?: string
  turn?: number
  sessionId?: string
  eventSeq?: number
  source?: 'session' | 'trace'
  phase?: string
  timestamp?: number
  title: string
  /** 给人看的事件名，例如「点击」。 */
  event: string
  /** 事件作用的对象，表格和右侧参数都用这一列。 */
  param: string
  /** 坐标、match、控件等机器属性。 */
  attrs: string
  /** 「操作 1-2」或「预期 3-1」。对得上用例句子里的徽章。 */
  stepRef: string
  /** 相对这次执行起点的秒数。没有时间戳时为空。 */
  seconds: string
  status: string
  summary: string
  thumb: string
  expected: string
  actual: string
  interaction?: TraceInteraction
}

export interface TraceView {
  summary: string
  steps: TraceStep[]
}

const thumbFrom = (event: Record<string, unknown>) => {
  for (const key of ['thumb', 'screenshot_thumb', 'result_thumb', 'image_base64', 'screenshot', 'image']) {
    const hit = screenshotSource(event[key])
    if (hit) return hit
  }
  return ''
}

const compareOf = (row: Record<string, unknown>) => {
  const inspections = Array.isArray(row.inspections) ? row.inspections : []
  for (const item of inspections) {
    if (!item || typeof item !== 'object') continue
    const hit = item as Record<string, unknown>
    const expected = hit.expected ?? hit.expect ?? hit.want
    const actual = hit.actual ?? hit.got ?? hit.value
    if (expected != null || actual != null) {
      return { expected: String(expected ?? ''), actual: String(actual ?? '') }
    }
  }
  return { expected: '', actual: '' }
}

const EVENT_LABEL: Record<string, string> = {
  tap: '点击',
  click: '点击',
  tap_element: '点击',
  input: '输入',
  input_text: '输入',
  type: '输入',
  swipe: '滑动',
  drag: '拖拽',
  think: '决策（未执行）',
}

const titleOf = (row: Record<string, unknown>) => {
  const action = row.action
  if (action && typeof action === 'object') {
    const cap = String((action as Record<string, unknown>).capability_id || '')
    if (cap) return cap
  }
  return String(row.capability_id || row.cap || row.phase || '')
}

const bagOf = (row: Record<string, unknown>) => {
  const action = row.action
  if (action && typeof action === 'object') return { ...row, ...(action as Record<string, unknown>) }
  return row
}

const textOf = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = row[key]
    if (value == null || value === '') continue
    if (typeof value === 'object') continue
    return String(value)
  }
  return ''
}

const pointOf = (row: Record<string, unknown>) => {
  const x = row.x ?? row.client_x
  const y = row.y ?? row.client_y
  if (x != null && y != null && x !== '' && y !== '') return `(${x}, ${y})`
  const coord = row.coordinate ?? row.coord ?? row.point
  if (Array.isArray(coord) && coord.length >= 2) return `(${coord[0]}, ${coord[1]})`
  return ''
}

const eventLabel = (raw: string, row: Record<string, unknown>) => {
  if (raw === 'think') {
    if (row.event_kind === 'output_contract_error') return '输出契约阻塞（未执行）'
    if (row.event_kind === 'review_reask' || String(row.thought || '').includes('prior_status')) {
      return '回看补答（未执行）'
    }
  }
  return EVENT_LABEL[raw] || raw
}


const epochMs = (raw: unknown) => {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1e12) return raw
    if (raw > 1e9) return raw * 1000
    return null
  }
  const text = String(raw || '').trim()
  if (!text) return null
  const numeric = Number(text)
  if (Number.isFinite(numeric) && numeric > 1e9) return numeric > 1e12 ? numeric : numeric * 1000
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

const secondsLabel = (ms: number | null, origin: number | null) => {
  if (ms == null || origin == null) return ''
  return ((ms - origin) / 1000).toFixed(1)
}

/** 把轨迹事件收成「这一步做了什么、截图、预期和实际」。 */
export function parseTrace(raw: Record<string, unknown> | null | undefined, fallback = '', context: { source?: 'session' | 'trace'; sessionId?: string } = {}): TraceView {
  const data = raw || {}
  const events = (Array.isArray(data.event_results) ? data.event_results : Array.isArray(data.events) ? data.events : []) as Record<string, unknown>[]
  const origin = events.reduce<number | null>((earliest, event) => {
    const ms = epochMs(event.ts || event.timestamp || event.time)
    if (ms == null) return earliest
    return earliest == null || ms < earliest ? ms : earliest
  }, null)
  const byStep = new Map<string, TraceStep>()
  events.forEach((event, index) => {
    const step = Number(event.seq ?? event.step ?? index + 1)
    if (!Number.isFinite(step)) return
    const sessionId = String(event.session_id || recordOf(event.payload).session_id || data.session_id || context.sessionId || '')
    const eventSeq = integerOf(event.event_seq ?? recordOf(event.payload).event_seq)
    // Resource records can share a projected step but refer to different raw events.
    const key = `${sessionId}:${step}${eventSeq != null ? `:event:${eventSeq}` : ''}`
    const prev = byStep.get(key)
    const compared = compareOf(event)
    const bag = bagOf(event)
    const rawTitle = titleOf(event) || prev?.title || ''
    const point = pointOf(bag)
    const param = textOf(bag, ['text', 'input', 'value', 'target', 'label', 'query']) || compared.expected || prev?.param || ''
    const extra = [textOf(bag, ['match', 'selector', 'style', 'field']), compared.actual && compared.actual !== param ? compared.actual : '']
      .filter(Boolean)
      .join(' · ')
    const attrs = [point && `坐标 ${point}`, extra].filter(Boolean).join(' · ') || prev?.attrs || ''
    const thumb = thumbFrom(event) || thumbFrom(bag)
    const elapsed = event.elapsed_ms ?? event.elapsed
    const fromClock = secondsLabel(epochMs(event.ts || event.timestamp || event.time), origin)
    const seconds = fromClock || (elapsed != null && elapsed !== '' ? (Number(elapsed) / 1000).toFixed(1) : prev?.seconds || '')
    byStep.set(key, {
      step,
      id: `${context.source || 'legacy'}:${key}`,
      source: context.source,
      sessionId,
      phase: textOf(event, ['phase']) || prev?.phase,
      timestamp: epochMs(event.ts || event.timestamp || event.time) ?? prev?.timestamp,
      turn: turnOf(event) ?? prev?.turn,
      eventSeq: eventSeq ?? prev?.eventSeq,
      title: rawTitle || `步骤 ${step}`,
      event: eventLabel(rawTitle, event) || prev?.event || `步骤 ${step}`,
      param,
      attrs,
      stepRef: stepRefsOf(event)[0] || prev?.stepRef || '',
      seconds,
      status: String(event.result_status || event.status || prev?.status || ''),
      summary: String(event.summary || event.error || (rawTitle === 'think' ? event.thought : '') || prev?.summary || ''),
      thumb: thumb || prev?.thumb || '',
      expected: compared.expected || prev?.expected || '',
      actual: compared.actual || prev?.actual || '',
      interaction: parseInteraction(eventLabel(rawTitle, event), bag) || prev?.interaction,
    })
  })
  const report = data.report_payload && typeof data.report_payload === 'object'
    ? data.report_payload as Record<string, unknown>
    : {}
  const summary = String(
    report.summary || report.final_summary || report.blocked_reason || data.failure_label || data.summary || fallback || '',
  ).trim()
  return { summary, steps: [...byStep.values()].sort((a, b) => a.step - b.step) }
}

/** A stable key for selection; source-local IDs alone cannot identify overlapping projections. */
export const traceKey = (step: TraceStep) => step.id || `${step.source || 'legacy'}:${step.sessionId || ''}:${step.step}`

const compatibleReference = (left: TraceStep, right: TraceStep) =>
  (!left.sessionId || !right.sessionId || left.sessionId === right.sessionId)
  && (left.turn == null || right.turn == null || left.turn === right.turn)
  && (!left.stepRef || !right.stepRef || left.stepRef === right.stepRef)

function sameProjection(left: TraceStep, right: TraceStep) {
  if (!left.source || !right.source || left.source === right.source) return false
  if (!left.sessionId || left.sessionId !== right.sessionId || left.step !== right.step) return false
  if (!compatibleReference(left, right) || left.event !== right.event) return false
  if (left.eventSeq != null && right.eventSeq != null && left.eventSeq !== right.eventSeq) return false
  if (left.timestamp != null && right.timestamp != null && left.timestamp !== right.timestamp) return false
  if (left.phase && right.phase && left.phase !== right.phase) return false
  // Match content as well as position: identical operations at different positions remain separate.
  return (['param', 'attrs', 'summary', 'expected', 'actual', 'status'] as const).every(field =>
    !left[field] || !right[field] || left[field] === right[field])
}

function enrichStep(previous: TraceStep, incoming: TraceStep): TraceStep {
  return {
    ...previous,
    turn: incoming.turn ?? previous.turn,
    eventSeq: incoming.eventSeq ?? previous.eventSeq,
    phase: incoming.phase || previous.phase,
    timestamp: incoming.timestamp ?? previous.timestamp,
    event: incoming.event || previous.event,
    param: incoming.param || previous.param,
    attrs: incoming.attrs || previous.attrs,
    stepRef: incoming.stepRef || previous.stepRef,
    seconds: incoming.seconds || previous.seconds,
    status: incoming.status || previous.status,
    summary: incoming.summary || previous.summary,
    thumb: incoming.thumb || previous.thumb,
    expected: incoming.expected || previous.expected,
    actual: incoming.actual || previous.actual,
    interaction: incoming.interaction || previous.interaction,
  }
}

/** Reconcile overlapping session/run projections without collapsing retries within either source. */
export function mergeTraceSteps(left: TraceStep[], right: TraceStep[]) {
  const merged: TraceStep[] = []
  for (const step of [...left, ...right]) {
    const index = merged.findIndex(previous => {
      if (!compatibleReference(previous, step)) return false
      const sameEvent = step.eventSeq != null && step.sessionId
        && previous.eventSeq === step.eventSeq && previous.sessionId === step.sessionId
      const sameLocalRecord = previous.source === step.source && traceKey(previous) === traceKey(step)
        && (previous.eventSeq == null || step.eventSeq == null || previous.eventSeq === step.eventSeq)
      return Boolean(sameEvent || sameLocalRecord || sameProjection(previous, step))
    })
    if (index < 0) merged.push(step)
    else merged[index] = enrichStep(merged[index], step)
  }
  return merged.sort((a, b) => a.step - b.step)
}
