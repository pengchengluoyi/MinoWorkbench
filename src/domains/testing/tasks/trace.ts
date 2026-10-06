export interface TraceStep {
  step: number
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
}

export interface TraceView {
  summary: string
  steps: TraceStep[]
}

const thumbOf = (raw: unknown) => {
  if (raw && typeof raw === 'object') {
    const bag = raw as Record<string, unknown>
    return thumbOf(bag.url || bag.src || bag.thumb || bag.data || bag.base64 || bag.image_base64)
  }
  const text = String(raw || '').trim()
  if (!text || text.includes('(+')) return ''
  if (text.startsWith('data:image/')) return text.length > 64 ? text : ''
  if (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('/')) return text
  if (text.startsWith('iVBOR')) return `data:image/png;base64,${text}`
  if (text.startsWith('/9j/')) return `data:image/jpeg;base64,${text}`
  if (text.length > 80 && /^[A-Za-z0-9+/=\s]+$/.test(text.slice(0, 120))) {
    return `data:image/png;base64,${text.replace(/\s/g, '')}`
  }
  return ''
}

const thumbFrom = (event: Record<string, unknown>) => {
  for (const key of ['thumb', 'screenshot_thumb', 'result_thumb', 'image_base64', 'screenshot', 'image']) {
    const hit = thumbOf(event[key])
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

const eventLabel = (raw: string) => EVENT_LABEL[raw] || raw

const stepRefOf = (row: Record<string, unknown>) => {
  const kind = String(row.script_kind || row.kind || row.column || '')
  const step = row.script_step ?? row.case_step ?? row.item_no
  const point = row.script_point ?? row.clause
  if (step == null || point == null || step === '' || point === '') return ''
  const expect = /expect|预期|assert/.test(kind)
  return `${expect ? '预期' : '操作'} ${step}-${point}`
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
export function parseTrace(raw: Record<string, unknown> | null | undefined, fallback = ''): TraceView {
  const data = raw || {}
  const events = (Array.isArray(data.event_results) ? data.event_results : Array.isArray(data.events) ? data.events : []) as Record<string, unknown>[]
  const origin = events.reduce<number | null>((earliest, event) => {
    const ms = epochMs(event.ts || event.timestamp || event.time)
    if (ms == null) return earliest
    return earliest == null || ms < earliest ? ms : earliest
  }, null)
  const byStep = new Map<number, TraceStep>()
  events.forEach((event, index) => {
    const step = Number(event.seq ?? event.step ?? index + 1)
    if (!Number.isFinite(step)) return
    const prev = byStep.get(step)
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
    byStep.set(step, {
      step,
      title: rawTitle || `步骤 ${step}`,
      event: eventLabel(rawTitle) || prev?.event || `步骤 ${step}`,
      param,
      attrs,
      stepRef: stepRefOf(bag) || prev?.stepRef || '',
      seconds,
      status: String(event.result_status || event.status || prev?.status || ''),
      summary: String(event.summary || event.error || prev?.summary || ''),
      thumb: thumb || prev?.thumb || '',
      expected: compared.expected || prev?.expected || '',
      actual: compared.actual || prev?.actual || '',
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

/** 两条轨迹按步骤号合并，截图留在有图的那一条上。 */
export function mergeTraceSteps(left: TraceStep[], right: TraceStep[]) {
  const byStep = new Map<number, TraceStep>()
  for (const step of [...left, ...right]) {
    const prev = byStep.get(step.step)
    if (!prev) {
      byStep.set(step.step, step)
      continue
    }
    byStep.set(step.step, {
      ...prev,
      event: step.event || prev.event,
      param: step.param || prev.param,
      attrs: step.attrs || prev.attrs,
      stepRef: step.stepRef || prev.stepRef,
      seconds: step.seconds || prev.seconds,
      status: step.status || prev.status,
      summary: step.summary || prev.summary,
      thumb: step.thumb || prev.thumb,
      expected: step.expected || prev.expected,
      actual: step.actual || prev.actual,
    })
  }
  return [...byStep.values()].sort((a, b) => a.step - b.step)
}
