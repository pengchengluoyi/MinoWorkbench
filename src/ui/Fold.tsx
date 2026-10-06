import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'

/**
 * 段落折叠。标题是按钮，展开状态可记住。
 * 导航轨、侧栏轨是另外两种折叠，不走这个组件。
 */
export function Fold({
  title,
  storageKey,
  defaultOpen = true,
  meta,
  children,
}: {
  title: string
  storageKey: string
  defaultOpen?: boolean
  meta?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = usePersistedFlag(storageKey, defaultOpen)

  return (
    <section style={{ marginBottom: 'var(--w-space-4)' }}>
      <button
        type="button"
        className="w-hit flex w-full items-center gap-1.5"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          border: 'none',
          background: 'transparent',
          padding: '4px 2px',
          cursor: 'pointer',
          textAlign: 'left',
          borderRadius: 'var(--w-radius-sm)',
          color: 'var(--w-text)',
        }}
      >
        <ChevronRight
          size={14}
          aria-hidden
          className="w-fold-chevron"
          data-open={open ? 'true' : 'false'}
          style={{ color: 'var(--w-text-tertiary)', flexShrink: 0 }}
        />
        <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700 }}>{title}</span>
        {meta && (
          <span style={{ marginLeft: 'auto', fontSize: 'var(--w-font-meta)', fontWeight: 650, color: 'var(--w-text-tertiary)' }}>
            {meta}
          </span>
        )}
      </button>
      {open && <div style={{ paddingTop: 8 }}>{children}</div>}
    </section>
  )
}
