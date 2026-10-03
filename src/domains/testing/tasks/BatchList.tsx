import { RefreshCw } from 'lucide-react'
import { Button, Skeleton, Tooltip } from '@/ui'
import { taskId, verdictOf, type TaskRow, type Verdict } from './types'

/**
 * 批次列表。
 *
 * 上一版把列表整个删了，只留一个下拉选择器——过度纠正。
 * 原设计的问题不是"有列表"，而是列表**不带答案**：要点进去才知道通过几条、挂几条。
 * 所以列表留着，但每行直接给出状态、通过/失败计数和时间。
 */
export function BatchList({
  tasks,
  activeId,
  loading,
  fetching,
  onPick,
  onRefresh,
}: {
  tasks: TaskRow[]
  activeId: string
  loading: boolean
  fetching: boolean
  onPick: (id: string) => void
  onRefresh: () => void
}) {
  return (
    <aside
      className="flex flex-col shrink-0"
      style={{
        width: 258,
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-lg)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '8px 8px 8px 12px', borderBottom: '1px solid var(--w-border)' }}
      >
        <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-text-quaternary)', letterSpacing: '.04em' }}>
          执行批次 {tasks.length ? `· ${tasks.length}` : ''}
        </span>
        <Tooltip title="刷新">
          <Button size="small" type="text" icon={<RefreshCw size={13} />} loading={fetching} onClick={onRefresh} aria-label="刷新批次列表" />
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div style={{ padding: 12 }}><Skeleton active title={false} paragraph={{ rows: 6 }} /></div>
        ) : (
          tasks.map((t) => {
            const id = taskId(t)
            const v = verdictOf(t.status)
            const active = id === activeId
            const passed = Number(t.passed ?? 0)
            const failed = Number(t.failed ?? 0)
            const total = Number(t.total ?? t.cases?.length ?? 0)

            return (
              <button
                key={id}
                type="button"
                onClick={() => onPick(id)}
                className="flex w-full flex-col text-left"
                style={{
                  gap: 5,
                  padding: '10px 12px',
                  border: 'none',
                  borderLeft: `2px solid ${active ? 'var(--w-primary)' : 'transparent'}`,
                  borderBottom: '1px solid var(--w-border)',
                  background: active ? 'var(--w-primary-soft)' : 'transparent',
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Dot verdict={v} />
                  <span
                    className="w-mono truncate"
                    style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: active ? 'var(--w-primary)' : 'var(--w-text)' }}
                  >
                    {id.slice(0, 14)}
                  </span>
                </span>

                {/* 列表直接带答案：通过 / 失败 / 总数 */}
                <span
                  className="flex items-center gap-2"
                  style={{ fontSize: 'var(--w-font-meta)', fontWeight: 650 }}
                >
                  {failed > 0 && <span style={{ color: 'var(--w-fail)' }}>挂 {failed}</span>}
                  {passed > 0 && <span style={{ color: 'var(--w-pass)' }}>过 {passed}</span>}
                  {total > 0 && <span style={{ color: 'var(--w-text-quaternary)' }}>/ {total}</span>}
                  {v === 'running' && <span style={{ color: 'var(--w-running)' }}>执行中</span>}
                </span>

                <span
                  className="truncate"
                  style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}
                >
                  {t.started_at || t.finished_at || ''}
                </span>
              </button>
            )
          })
        )}
      </div>
    </aside>
  )
}

function Dot({ verdict }: { verdict: Verdict }) {
  const bg =
    verdict === 'pass' ? 'var(--w-pass)'
      : verdict === 'fail' ? 'var(--w-fail)'
        : verdict === 'running' ? 'var(--w-running)'
          : 'var(--w-muted)'
  return <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: bg, flexShrink: 0 }} />
}
