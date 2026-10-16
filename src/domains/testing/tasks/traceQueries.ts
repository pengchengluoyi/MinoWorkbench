import { getCaseRunnerTraceDetail, getSessionTrajectory } from '@/api/caseRunner'
import { unwrapOne } from '@/lib/unwrap'
import { mergeTraceSteps, parseTrace } from './trace'

export async function loadRunTrace(runId: string, sessionId: string, fallback: string) {
  const sources = [
    ...(sessionId ? [{ label: '会话轨迹', source: 'session' as const, load: () => getSessionTrajectory(sessionId) }] : []),
    ...(runId ? [{ label: '执行轨迹', source: 'trace' as const, load: () => getCaseRunnerTraceDetail(runId) }] : []),
  ]
  const results = await Promise.allSettled(sources.map((source) => source.load()))
  const errors = results.flatMap((result, index) => result.status === 'rejected' ? [{ source: sources[index].label, error: result.reason as unknown }] : [])
  if (sources.length && errors.length === sources.length) throw new AggregateError(errors.map((item) => item.error), '轨迹来源均读取失败，请重试。')
  const views = results.map((result, index) => result.status === 'fulfilled' ? parseTrace(unwrapOne<Record<string, unknown>>(result.value), fallback, { source: sources[index].source, sessionId }) : null)
  return {
    summary: views.at(-1)?.summary || views[0]?.summary || fallback,
    steps: views.reduce((steps, view) => mergeTraceSteps(steps, view?.steps || []), [] as ReturnType<typeof parseTrace>['steps']),
    errors,
  }
}
