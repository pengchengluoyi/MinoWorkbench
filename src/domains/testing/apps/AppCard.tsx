import { Activity, ChevronRight } from 'lucide-react'
import { formatPlatformTags, getPlatformIcon } from '@/constants/appPlatforms'
import type { AppRow } from '@/types/project'
import type { AppTaskStat } from './queries'

/** 应用卡片。落地页的主要视觉单元，所以留白和层级都放宽。 */
export function AppCard({
  app,
  stat,
  onClick,
}: {
  app: AppRow
  stat?: AppTaskStat
  onClick: () => void
}) {
  const tags = formatPlatformTags(app.platforms)
  const running = stat?.runningCount || 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left flex flex-col"
      style={{
        padding: 16,
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-xl)',
        cursor: 'pointer',
        minWidth: 0,
        gap: 12,
        transition: 'border-color .12s, box-shadow .12s, transform .12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--w-border-strong)'
        e.currentTarget.style.boxShadow = 'var(--w-shadow)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--w-border)'
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      }}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 38,
            height: 38,
            borderRadius: 'var(--w-radius)',
            background: 'var(--w-fill)',
            fontSize: 18,
            lineHeight: 1,
          }}
          aria-hidden
        >
          {getPlatformIcon(app.platforms)}
        </span>

        <span className="min-w-0 flex-1" style={{ display: 'block' }}>
          <strong
            className="truncate"
            style={{
              display: 'block',
              fontSize: 'var(--w-font-title)',
              fontWeight: 700,
              color: 'var(--w-text)',
              lineHeight: 'var(--w-line-snug)',
            }}
            title={app.name}
          >
            {app.name || '未命名应用'}
          </strong>
          <span
            className="truncate"
            style={{
              display: 'block',
              marginTop: 2,
              fontSize: 'var(--w-font-sm)',
              color: 'var(--w-text-quaternary)',
            }}
            title={app.description || ''}
          >
            {app.description || '没有填写说明'}
          </span>
        </span>

        <ChevronRight
          size={16}
          style={{ color: 'var(--w-text-quaternary)', flexShrink: 0, marginTop: 2 }}
        />
      </div>

      <div
        className="flex items-center justify-between gap-2 min-w-0"
        style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid var(--w-border)' }}
      >
        <span className="flex flex-wrap items-center gap-1.5 min-w-0">
          {tags.length ? (
            tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 'var(--w-font-meta)',
                  fontWeight: 650,
                  color: 'var(--w-text-tertiary)',
                  background: 'var(--w-fill)',
                  padding: '2px 8px',
                  borderRadius: 'var(--w-radius-pill)',
                  whiteSpace: 'nowrap',
                }}
              >
                {t}
              </span>
            ))
          ) : (
            <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
              未设覆盖端
            </span>
          )}
        </span>

        {/* 状态语义：图标 + 文字 + 颜色三者齐备，不靠颜色单独表意 */}
        {running > 0 && (
          <span
            className="flex items-center gap-1 shrink-0"
            style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-running)' }}
          >
            <Activity size={12} strokeWidth={2.4} />
            {running} 个执行中
          </span>
        )}
      </div>
    </button>
  )
}
