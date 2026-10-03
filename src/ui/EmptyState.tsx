import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

/** 统一空态。不要各页自己写"暂无数据"。 */
export function EmptyState({
  title = '暂无数据',
  hint,
  action,
  icon,
}: {
  title?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{ padding: '48px 20px', gap: 'var(--w-space-3)' }}
    >
      <div style={{ color: 'var(--w-text-quaternary)' }}>
        {icon ?? <Inbox size={32} strokeWidth={1.5} />}
      </div>
      <div style={{ fontSize: 'var(--w-font-base)', color: 'var(--w-text-tertiary)', fontWeight: 600 }}>
        {title}
      </div>
      {hint && (
        <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)', maxWidth: 420 }}>
          {hint}
        </div>
      )}
      {action}
    </div>
  )
}
