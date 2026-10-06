import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { formatPlatformTags } from '@/constants/appPlatforms'
import type { AppRow as App } from '@/types/project'

/**
 * 应用行。整行是链接，方便中键和新标签打开。
 * 焦点行右侧写出「进入」，键盘和鼠标共用这一态。
 */
export function AppRow({
  app,
  projectName,
  running,
  recent,
  focused,
  href,
  onHover,
  onOpen,
}: {
  app: App
  projectName?: string
  running: number
  recent?: boolean
  focused?: boolean
  href: string
  onHover: () => void
  onOpen: () => void
}) {
  const tags = formatPlatformTags(app.platforms)

  return (
    <Link
      to={href}
      onClick={onOpen}
      onMouseEnter={onHover}
      data-focus={focused ? 'true' : 'false'}
      className="w-app-row w-hit"
      title={app.name}
    >
      <span className="min-w-0 flex items-baseline gap-2">
        <strong
          className="truncate"
          style={{ fontSize: 'var(--w-font-base)', fontWeight: 650, color: 'var(--w-text)' }}
        >
          {app.name || '未命名应用'}
        </strong>
        {projectName && (
          <span className="truncate" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
            {projectName}
          </span>
        )}
        {recent && (
          <span
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 700,
              color: 'var(--w-text-tertiary)',
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

      <span className="w-app-tags flex items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 650,
              color: 'var(--w-text-secondary)',
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

      <span className="w-app-status" style={{ textAlign: 'right' }}>
        {running > 0 && (
          <span
            className="inline-flex items-center justify-end gap-1"
            style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700, color: 'var(--w-pass)', fontVariantNumeric: 'tabular-nums' }}
          >
            <Activity size={12} strokeWidth={2.2} aria-hidden />
            {running} 执行中
          </span>
        )}
      </span>

      <span
        style={{
          textAlign: 'right',
          fontSize: 'var(--w-font-sm)',
          fontWeight: focused ? 700 : 500,
          color: focused ? 'var(--w-primary)' : 'var(--w-text-quaternary)',
        }}
      >
        {focused ? '进入' : '›'}
      </span>
    </Link>
  )
}
