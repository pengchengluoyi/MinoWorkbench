export interface TracePoint {
  x: number
  y: number
}

export interface TraceInteraction {
  kind: 'point' | 'path'
  points: TracePoint[]
  width?: number
  height?: number
}

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const numeric = (value: unknown) => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

const textPoints = (value: unknown): TracePoint[] => typeof value === 'string'
  ? [...value.matchAll(/[([]\s*(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)\s*[)\]]/g)].map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
  : []

const point = (value: unknown): TracePoint | undefined => {
  if (typeof value === 'string') return textPoints(value)[0]
  const fields = record(value)
  const x = numeric(Array.isArray(value) ? value[0] : fields.x ?? fields.client_x)
  const y = numeric(Array.isArray(value) ? value[1] : fields.y ?? fields.client_y)
  return x != null && y != null ? { x, y } : undefined
}

export function parseInteraction(event: string, raw: Record<string, unknown>): TraceInteraction | undefined {
  if (!/tap|click|press|drag|swipe|点击|拖拽|滑动|长按/i.test(event) || /未执行|无法|assert|check/i.test(event)) return undefined
  const fields = { ...raw, ...record(raw.params ?? raw.parameters ?? raw.arguments) }
  const path = fields.path ?? fields.trajectory ?? fields.points
  const pathPoints = Array.isArray(path) ? path.map(point).filter((value): value is TracePoint => !!value) : []
  const start = point(fields.start ?? fields.from ?? fields.start_point ?? fields.start_coordinate)
    || point({ x: fields.start_x ?? fields.x1, y: fields.start_y ?? fields.y1 })
    || point(fields.coordinate ?? fields.coord ?? fields.point) || point(fields)
  const end = point(fields.end ?? fields.to ?? fields.end_point ?? fields.end_coordinate)
    || point({ x: fields.end_x ?? fields.x2, y: fields.end_y ?? fields.y2 })
  const fromText = textPoints([fields.attrs, fields.param, fields.target, fields.text, fields.value].filter((value) => typeof value === 'string').join(' · '))
  const moving = /drag|swipe|拖拽|滑动/i.test(event)
  const points = moving ? pathPoints.length >= 2 ? pathPoints : start && end ? [start, end] : fromText
    : start ? [start] : fromText.slice(0, 1)
  if (points.length < (moving ? 2 : 1)) return undefined

  const space = String(fields.coordinate_space || fields.coordinate_unit || '').toLowerCase()
  const screen = record(fields.screen_size ?? fields.viewport)
  const pixels = space === 'pixel' || space === 'pixels'
  const extent = /^(relative|ratio|fraction)$/.test(space) ? 1 : space === 'percent' ? 100 : 1000
  const width = numeric(fields.coordinate_width ?? fields.screen_width ?? fields.image_width ?? screen.width)
  const height = numeric(fields.coordinate_height ?? fields.screen_height ?? fields.image_height ?? screen.height)
  return {
    kind: moving ? 'path' : 'point',
    points,
    width: pixels ? width && width > 0 ? width : undefined : extent,
    height: pixels ? height && height > 0 ? height : undefined : extent,
  }
}
