export type StatusKind = 'pass' | 'fail' | 'warn' | 'cancel' | 'running' | 'muted'

/** 执行结果语义胶囊。样式在 global.css 的 .w-pill，颜色全走 token。 */
export function StatusPill({ status, children }: { status: StatusKind; children?: React.ReactNode }) {
  return <span className="w-pill" data-status={status}>{children}</span>
}

/** Nexus 返回的状态字符串五花八门，统一收口到六种语义。 */
export const toStatusKind = (raw: unknown): StatusKind => {
  const s = String(raw || '').toLowerCase()
  if (/pass|success|ok|done|complete/.test(s)) return 'pass'
  if (/fail|error|fatal/.test(s)) return 'fail'
  if (/warn|exception|flaky|partial/.test(s)) return 'warn'
  if (/cancel|abort|skip/.test(s)) return 'cancel'
  if (/run|pending|queue|progress|init/.test(s)) return 'running'
  return 'muted'
}
