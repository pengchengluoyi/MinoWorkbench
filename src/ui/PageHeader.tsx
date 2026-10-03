import type { ReactNode } from 'react'

/** 页头。标题 + 计数 + 右侧工具条，所有管理页共用一个。 */
export function PageHeader({
  title,
  subtitle,
  count,
  extra,
}: {
  title: ReactNode
  subtitle?: ReactNode
  count?: ReactNode
  extra?: ReactNode
}) {
  return (
    <header
      className="flex flex-wrap items-start justify-between gap-4"
      style={{ marginBottom: 'var(--w-gap)' }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <h2
            className="m-0 truncate"
            style={{
              fontSize: 'var(--w-font-h2)',
              fontWeight: 'var(--w-weight-heavy)' as any,
              color: 'var(--w-text)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {count != null && (
            <span className="w-pill" data-status="muted">{count}</span>
          )}
        </div>
        {subtitle && (
          <p
            className="m-0"
            style={{
              marginTop: 4,
              fontSize: 'var(--w-font-sm)',
              color: 'var(--w-text-quaternary)',
              fontWeight: 'var(--w-weight-medium)' as any,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {extra && <div className="flex flex-wrap items-center gap-2">{extra}</div>}
    </header>
  )
}
