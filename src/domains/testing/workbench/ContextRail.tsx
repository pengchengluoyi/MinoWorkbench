import { useCallback, useState } from 'react'
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Button, Tooltip } from '@/ui'
import { formatPlatformTags } from '@/constants/appPlatforms'
import type { AppRow } from '@/types/project'

const KEY = 'mino.workbench.contextRail'

const read = (): boolean => {
  try { return localStorage.getItem(KEY) !== 'collapsed' } catch { return true }
}

/**
 * 上下文侧栏（手册 §7.3）。
 * 替掉原实现「tab + 二级 board 两层平铺」里塞不下的应用元信息。
 * 收起状态持久化——数据密集的表格页用户通常会收起它。
 */
export function ContextRail({ app }: { app: AppRow | undefined }) {
  const [open, setOpen] = useState(read)

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev
      try { localStorage.setItem(KEY, next ? 'open' : 'collapsed') } catch { /* 隐私模式 */ }
      return next
    })
  }, [])

  if (!open) {
    return (
      <div
        className="shrink-0 flex justify-center"
        style={{ width: 36, borderLeft: '1px solid var(--w-border)', paddingTop: 'var(--w-space-3)' }}
      >
        <Tooltip title="展开上下文" placement="left">
          <Button size="small" type="text" icon={<PanelRightOpen size={15} />} onClick={toggle} />
        </Tooltip>
      </div>
    )
  }

  const tags = formatPlatformTags(app?.platforms)

  return (
    <aside
      className="shrink-0 flex flex-col overflow-y-auto"
      style={{
        width: 240,
        borderLeft: '1px solid var(--w-border)',
        background: 'var(--w-surface-subtle)',
        padding: 'var(--w-space-3)',
        gap: 'var(--w-space-4)',
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-text-quaternary)', letterSpacing: '0.04em' }}>
          上下文
        </span>
        <Tooltip title="收起" placement="left">
          <Button size="small" type="text" icon={<PanelRightClose size={15} />} onClick={toggle} />
        </Tooltip>
      </div>

      <div className="w-field">
        <em>应用</em>
        <span>{app?.name || '—'}</span>
      </div>

      {app?.description && (
        <div className="w-field">
          <em>说明</em>
          <span>{app.description}</span>
        </div>
      )}

      <div className="w-field">
        <em>覆盖端</em>
        <span>{tags.length ? tags.join(' · ') : '—'}</span>
      </div>

      <div className="w-field">
        <em>应用 ID</em>
        <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)' }}>{app?.id || '—'}</span>
      </div>
    </aside>
  )
}
