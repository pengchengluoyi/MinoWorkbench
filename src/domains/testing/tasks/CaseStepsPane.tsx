import { MousePointerClick } from 'lucide-react'
import { EmptyState, StatusPill } from '@/ui'
import { caseId, failReason, verdictOf, type TaskCase } from './types'

/**
 * 选中用例的步骤。
 *
 * 这里只做基础步骤列表 —— 完整的执行时间线（瀑布图、胶片条、截图对比、
 * 失败步骤跳转）是独立一块，见 contracts/execution-timeline.md，排在后续阶段。
 * 当前先保证「失败用例 → 看到挂在哪一步」这条下钻能走通。
 */
export function CaseStepsPane({ taskId, caseRow }: { taskId: string; caseRow?: TaskCase }) {
  if (!caseRow) {
    return (
      <aside style={paneStyle}>
        <EmptyState
          icon={<MousePointerClick size={26} strokeWidth={1.5} />}
          title="选一条用例"
          hint="左侧点一条用例，这里显示它的执行步骤。失败的用例排在最前面。"
        />
      </aside>
    )
  }

  const steps = Array.isArray(caseRow.steps) ? (caseRow.steps as any[]) : []
  const v = verdictOf(caseRow.status || caseRow.overall_status)
  const reason = failReason(caseRow)

  return (
    <aside style={paneStyle} className="overflow-y-auto">
      <div style={{ padding: 'var(--w-space-3)', borderBottom: '1px solid var(--w-border)' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
          {v === 'pass' && <StatusPill status="pass">通过</StatusPill>}
          {v === 'fail' && <StatusPill status="fail">失败</StatusPill>}
          {v === 'running' && <StatusPill status="running">执行中</StatusPill>}
          {v === 'other' && <StatusPill status="muted">其他</StatusPill>}
          <span className="w-mono" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
            {caseId(caseRow).slice(0, 14)}
          </span>
        </div>
        <div style={{ fontSize: 'var(--w-font-base)', fontWeight: 700, color: 'var(--w-text)' }}>
          {caseRow.title || caseId(caseRow)}
        </div>
        {reason && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              borderRadius: 'var(--w-radius-sm)',
              background: 'var(--w-fail-bg)',
              color: 'var(--w-fail)',
              fontSize: 'var(--w-font-sm)',
              lineHeight: 'var(--w-line-base)',
              overflowWrap: 'anywhere',
            }}
          >
            {reason}
          </div>
        )}
      </div>

      {!steps.length ? (
        <EmptyState
          title="没有步骤明细"
          hint={`批次 ${taskId.slice(0, 10)} 的这条用例没有回传步骤。完整的执行时间线排在后续阶段。`}
        />
      ) : (
        <ol style={{ margin: 0, padding: 'var(--w-space-2)', listStyle: 'none' }}>
          {steps.map((s, i) => {
            const sv = verdictOf(s?.status)
            return (
              <li
                key={i}
                className="flex items-start gap-2"
                style={{
                  padding: '7px 8px',
                  borderRadius: 'var(--w-radius-sm)',
                  background: sv === 'fail' ? 'var(--w-fail-bg)' : 'transparent',
                }}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--w-fill)',
                    fontSize: 10, fontWeight: 800,
                    color: 'var(--w-text-secondary)',
                  }}
                >
                  {i + 1}
                </span>
                <span
                  style={{
                    fontSize: 'var(--w-font-sm)',
                    lineHeight: 'var(--w-line-base)',
                    color: sv === 'fail' ? 'var(--w-fail)' : 'var(--w-text-secondary)',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {String(s?.description || s?.capability || s?.action || JSON.stringify(s)).slice(0, 300)}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}

const paneStyle: React.CSSProperties = {
  width: 340,
  flexShrink: 0,
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  minHeight: 0,
}
