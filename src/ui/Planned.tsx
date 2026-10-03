import { PageHeader } from './PageHeader'
import { EmptyState } from './EmptyState'
import { Hammer } from 'lucide-react'

/**
 * 还没重建的页面占位。
 * 骨架期让两套导航都能走通，同时把该页排在哪个阶段写明，避免"点进去是空白"。
 */
export function Planned({
  title,
  phase,
  note,
  source,
}: {
  title: string
  phase: string
  note?: string
  source?: string
}) {
  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <PageHeader title={title} count={phase} />
      <div
        style={{
          background: 'var(--w-surface)',
          border: '1px dashed var(--w-border-strong)',
          borderRadius: 'var(--w-radius-lg)',
        }}
      >
        <EmptyState
          icon={<Hammer size={30} strokeWidth={1.5} />}
          title="这个页面还没重建"
          hint={
            <>
              {note || '按重建方案排期，尚未开工。'}
              {source && (
                <>
                  <br />
                  <span className="w-mono" style={{ fontSize: 'var(--w-font-meta)' }}>
                    需求来源：{source}
                  </span>
                </>
              )}
            </>
          }
        />
      </div>
    </div>
  )
}
