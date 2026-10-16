export type StatusKind = 'pass' | 'fail' | 'warn' | 'cancel' | 'running' | 'muted'

/** 执行结果语义胶囊。样式在 global.css 的 .w-pill，颜色全走 token。 */
export function StatusPill({ status, children }: { status: StatusKind; children?: React.ReactNode }) {
  return <span className="w-pill" data-status={status}>{children}</span>
}

export function EnabledPill({ enabled }: { enabled: unknown }) {
  return <StatusPill status={enabled === true ? 'pass' : 'muted'}>{enabled === true ? '启用' : enabled === false ? '停用' : '状态未知'}</StatusPill>
}

/** Nexus 返回的状态字符串五花八门，统一收口到六种语义。 */
export const toStatusKind = (raw: unknown): StatusKind => {
  const status = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (['pass', 'passed', 'success', 'successful', 'succeeded', 'ok', 'healthy', 'online', 'available', 'enabled'].includes(status)) return 'pass'
  if (['fail', 'failed', 'failure', 'error', 'fatal', 'exception', 'give_up', 'declined'].includes(status)) return 'fail'
  if (['warn', 'warning', 'flaky', 'partial', 'partial_success', 'blocked', 'retry', 'retrying', 'need_input', 'needs_attention', 'awaiting_review'].includes(status)) return 'warn'
  if (['cancel', 'cancelled', 'canceled', 'abort', 'aborted', 'skip', 'skipped', 'stopped'].includes(status)) return 'cancel'
  if (['running', 'pending', 'queue', 'queued', 'progress', 'in_progress', 'init', 'initializing', 'created', 'submitted', 'executing', 'started'].includes(status)) return 'running'
  // done/completed 只说明执行结束；未返回 verdict 时不能标绿通过。
  return 'muted'
}
