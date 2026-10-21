import type { StatusKind } from '@/ui/StatusPill'
import type { TaskRow } from './types'
import { verdictOf } from './types'

export const taskCount = (raw: unknown): number | undefined => typeof raw === 'number' && Number.isSafeInteger(raw) && raw >= 0 ? raw : undefined
export function taskStatus(raw: unknown): { label: string; tone: StatusKind } {
  const value = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (value === 'product_fail') return { label: '产品断言失败', tone: 'fail' }
  if (value === 'tool_blocked') return { label: '工具受阻', tone: 'warn' }
  if (value === 'env_blocked') return { label: '环境受阻', tone: 'warn' }
  if (value === 'unverified') return { label: '未核验', tone: 'warn' }
  if (['cancelled', 'canceled'].includes(value)) return { label: '已取消', tone: 'cancel' }
  if (['blocked', 'waiting_input', 'need_input', 'waiting_for_input'].includes(value)) return { label: '受阻 / 待补充', tone: 'warn' }
  if (value === 'skipped') return { label: '已跳过', tone: 'muted' }
  if (['done', 'finished', 'completed', 'ended'].includes(value)) return { label: '已结束 · 未核验', tone: 'muted' }
  if (['queued', 'queue', 'pending', 'created', 'submitted', 'init', 'initializing'].includes(value)) return { label: '等待执行', tone: 'muted' }
  const verdict = verdictOf(value)
  if (verdict === 'pass') return { label: '通过', tone: 'pass' }
  if (verdict === 'fail') return { label: '失败', tone: 'fail' }
  if (verdict === 'running') return { label: '执行中', tone: 'running' }
  return { label: value ? `状态未识别 · ${value}` : '状态未提供', tone: 'muted' }
}
export function taskProgress(row: TaskRow | undefined) {
  const total = taskCount(row?.total)
  const completed = taskCount(row?.completed)
  const percent = total != null && total > 0 && completed != null && completed <= total ? Math.round(completed / total * 100) : undefined
  return { total, completed, percent }
}
export function taskName(row: TaskRow) {
  if (row.title) return String(row.title)
  const cases = row.cases || []
  if (cases.length === 1 && cases[0].title) return String(cases[0].title)
  return '用例执行批次'
}
export function taskDate(raw: unknown) {
  if (!raw) return '时间未提供'
  const value = new Date(String(raw))
  return Number.isNaN(value.getTime()) ? String(raw) : value.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}
