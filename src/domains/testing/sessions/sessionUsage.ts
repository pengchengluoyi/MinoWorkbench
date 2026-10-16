import type { LlmCall } from '@/api/sessions'

export const reportedCount = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined

export function tokenUsage(reported: unknown, calls: LlmCall[], failed = false): { value: number | string; partial: boolean } {
  const total = reportedCount(reported)
  if (total != null) return { value: total, partial: false }
  const values = calls.map(call => reportedCount(call.total_tokens))
  if (failed || !values.length || values.some(value => value == null)) return { value: '未报告', partial: false }
  const sum = values.reduce((count, value) => count + value!, 0)
  return { value: reportedCount(sum) ?? '未报告', partial: true }
}
