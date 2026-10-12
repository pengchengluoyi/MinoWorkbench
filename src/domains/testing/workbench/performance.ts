import { useEffect, useRef } from 'react'

type ListKind = 'cases' | 'tasks'

export interface ListPerformanceSample {
  appId: string
  kind: ListKind
  success: boolean
  cached: boolean
  totalMs: number
  routeMs: number
  jsLoadMs: number
  apiMs: number
  renderMs: number
  error?: string
  requests: { path: string; durationMs: number }[]
}

interface PendingSample {
  appId: string
  kind: ListKind
  startedAt: number
  mountedAt: number
  readyAt: number
  done: boolean
}

let pending: PendingSample | undefined
const samples: ListPerformanceSample[] = []

export function beginListNavigation(appId: string, kind: ListKind, startedAt = performance.now()) {
  if (pending && !pending.done) finish(pending, false, false, 'navigation_interrupted')
  pending = { appId, kind, startedAt, mountedAt: 0, readyAt: 0, done: false }
  return pending
}

export function ensureListNavigation(appId: string, kind: ListKind) {
  if (pending?.appId === appId && pending.kind === kind) return pending
  const initial = samples.length === 0 && !pending
  return beginListNavigation(appId, kind, initial ? 0 : performance.now())
}

function finish(sample: PendingSample, success: boolean, cached: boolean, error?: string) {
  if (sample.done) return
  sample.done = true
  const endedAt = performance.now()
  const resources = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .filter((entry) => entry.startTime >= sample.startedAt && entry.responseEnd <= endedAt)
  const requests = resources.filter((entry) => {
    const path = new URL(entry.name).pathname
    return path.startsWith('/project/') || path === '/case-runner/tasks'
  })
  const result: ListPerformanceSample = {
    appId: sample.appId,
    kind: sample.kind,
    success,
    cached,
    totalMs: endedAt - sample.startedAt,
    routeMs: Math.max(0, (sample.mountedAt || endedAt) - sample.startedAt),
    jsLoadMs: resources.filter((entry) => /\.m?js(?:\?|$)/.test(entry.name)).reduce((sum, entry) => sum + entry.duration, 0),
    apiMs: requests.length ? Math.max(...requests.map((entry) => entry.responseEnd)) - Math.min(...requests.map((entry) => entry.startTime)) : 0,
    renderMs: sample.readyAt ? endedAt - sample.readyAt : 0,
    ...(error ? { error } : {}),
    requests: requests.map((entry) => ({ path: new URL(entry.name).pathname, durationMs: entry.duration })),
  }
  samples.push(result)
  if (samples.length > 500) samples.shift()
  window.dispatchEvent(new CustomEvent('mino:list-performance', { detail: result }))
}

export const readListPerformance = () => samples.map((sample) => ({ ...sample, requests: [...sample.requests] }))

export function failListNavigation(appId: string, kind: ListKind) {
  if (pending?.appId === appId && pending.kind === kind) finish(pending, false, false, 'context_failed')
}

export function useListPerformance(appId: string, kind: ListKind, ready: boolean, error: boolean, cached: boolean, identity = '') {
  const current = useRef<{ sample: PendingSample; cached: boolean; identity: string } | null>(null)
  const active = ensureListNavigation(appId, kind)
  if (!current.current || current.current.sample !== active || current.current.identity !== identity) {
    const sample = current.current?.identity !== identity && active.done ? beginListNavigation(appId, kind) : active
    if (!sample.mountedAt) sample.mountedAt = performance.now()
    current.current = { sample, cached, identity }
  }
  const { sample, cached: initiallyCached } = current.current
  useEffect(() => {
    if (sample.done) return
    if (error) {
      finish(sample, false, initiallyCached, 'list_or_context_failed')
      return
    }
    if (!ready) return
    let afterPaint = 0
    let frame = 0
    const paint = () => {
      if (sample.done || document.visibilityState === 'hidden') return
      cancelAnimationFrame(frame)
      cancelAnimationFrame(afterPaint)
      sample.readyAt = performance.now()
      frame = requestAnimationFrame(() => {
        afterPaint = requestAnimationFrame(() => {
          if (document.visibilityState !== 'hidden') finish(sample, true, initiallyCached)
        })
      })
    }
    paint()
    document.addEventListener('visibilitychange', paint)
    return () => {
      document.removeEventListener('visibilitychange', paint)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(afterPaint)
    }
  }, [sample, ready, error, initiallyCached])
}

declare global {
  interface Window {
    minoListPerformance: typeof readListPerformance
  }
}
window.minoListPerformance = readListPerformance
