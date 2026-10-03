import { Activity, ChevronRight } from 'lucide-react'
import { formatPlatformTags, getPlatformIcon } from '@/constants/appPlatforms'
import type { AppRow as App } from '@/types/project'
import type { AppTaskStat } from './queries'

/**
 * 应用行。列表优先于网格：本产品数据密度高，
 * 网格方案一屏只放得下 4 个应用，列表能放 10+。
 */
export function AppRow({
  app,
  projectName,
  stat,
  recent,
  focused,
  onOpen,
  onHover,
}: {
  app: App
  projectName?: string
  stat?: AppTaskStat
  recent?: boolean
  focused?: boolean
  onOpen: () => void
  onHover: () => void
}) {
  const tags = formatPlatformTags(app.platforms)
  const running = stat?.runningCount || 0

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onHover}
      className="flex w-full items-center text-left"
      style={{
        gap: 'var(--w-space-3)',
        minHeight: 'var(--w-row-height)',
        padding: '0 var(--w-space-3)',
        border: 'none',
        borderLeft: `2px solid ${running > 0 ? 'var(--w-running)' : 'transparent'}`,
        borderBottom: '1px solid var(--w-border)',
        background: focused ? 'var(--w-surface-hover)' : 'transparent',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 15, lineHeight: 1, flexShrink: 0 }} aria-hidden>
        {getPlatformIcon(app.platforms)}
      </span>

      <span className="min-w-0 flex-1 flex items-baseline gap-2">
        <strong
          className="truncate"
          style={{ fontSize: 'var(--w-font-base)', fontWeight: 650, color: 'var(--w-text)' }}
          title={app.name}
        >
          {app.name || '未命名应用'}
        </strong>
        {projectName && (
          <span
            className="truncate"
            style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)', flexShrink: 1 }}
          >
            {projectName}
          </span>
        )}
        {recent && (
          <span
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 700,
              color: 'var(--w-text-quaternary)',
              border: '1px solid var(--w-border-strong)',
              padding: '0 5px',
              borderRadius: 'var(--w-radius-pill)',
              flexShrink: 0,
            }}
          >
            最近
          </span>
        )}
      </span>

      <span className="flex items-center gap-1.5 shrink-0">
        {tags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 650,
              color: 'var(--w-text-tertiary)',
              background: 'var(--w-fill)',
              padding: '1px 7px',
              borderRadius: 'var(--w-radius-pill)',
              whiteSpace: 'nowrap',
            }}
          >
            {t}
          </span>
        ))}
      </span>

      {/* 状态三件齐备：颜色 + 图标 + 文字 */}
      <span className="shrink-0" style={{ width: 92, textAlign: 'right' }}>
        {running > 0 && (
          <span
            className="inline-flex items-center gap-1"
            style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-running)' }}
          >
            <Activity size={11} strokeWidth={2.4} />
            {running} 执行中
          </span>
        )}
      </span>

      <ChevronRight size={15} style={{ color: 'var(--w-text-quaternary)', flexShrink: 0 }} />
    </button>
  )
}
