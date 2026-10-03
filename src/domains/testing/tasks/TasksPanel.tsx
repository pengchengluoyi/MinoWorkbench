import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, Filter, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import {
  Button, EmptyState, Segmented, Select, Skeleton, StatusPill, Tooltip, errText,
} from '@/ui'
import { onRealtimeState, realtimeState, type RealtimeState } from '@/lib/realtime'
import { useTaskDetail, useTaskList } from './queries'
import { byAttention, caseId, failReason, taskId, verdictOf, type TaskCase, type Verdict } from './types'
import { CaseStepsPane } from './CaseStepsPane'

/**
 * 执行结果面板。
 *
 * 设计见 docs/交互设计.md §三。与原实现的关键差异：
 * 1. **默认落在最近一个批次的结果**，而不是时间倒序的任务列表
 *    —— 列表是陈列，不是答案
 * 2. 批次内**失败置顶**，默认「只看需要关注的」
 * 3. 三层下钻（批次 → 失败用例 → 步骤）都在同一页内完成
 * 4. 实时断线**显式提示**，不静默停更
 */
export function TasksPanel({ appId }: { appId: string }) {
  const [params, setParams] = useSearchParams()
  const list = useTaskList(appId)

  const urlRun = params.get('run') || ''
  const tasks = list.data || []
  // 默认落在最近一个批次：列表按时间倒序，取第一条
  const activeId = urlRun || taskId(tasks[0])

  const detail = useTaskDetail(activeId, true)
  const task = detail.data
  const live = verdictOf(task?.status) === 'running'

  const [onlyAttention, setOnlyAttention] = useState(true)
  const [pickedCase, setPickedCase] = useState<string>('')
  const [rt, setRt] = useState<RealtimeState>(realtimeState)

  useEffect(() => onRealtimeState(setRt), [])

  const cases = useMemo(() => {
    const all = [...(task?.cases || [])].sort(byAttention)
    if (!onlyAttention) return all
    const attention = all.filter((c) => {
      const v = verdictOf(c.status || c.overall_status)
      return v === 'fail' || v === 'other'
    })
    // 全通过时不要给一个空表，退回显示全部
    return attention.length ? attention : all
  }, [task?.cases, onlyAttention])

  const counts = useMemo(() => {
    const out = { pass: 0, fail: 0, running: 0, other: 0 } as Record<Verdict, number>
    for (const c of task?.cases || []) out[verdictOf(c.status || c.overall_status)] += 1
    return out
  }, [task?.cases])

  const pickRun = (id: string) => {
    const p = new URLSearchParams(params)
    p.set('run', id)
    setParams(p, { replace: true })
    setPickedCase('')
  }

  if (list.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 180 }} />

  if (list.isError) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取执行批次失败"
          hint={errText(list.error, '确认 Nexus 可达。')}
          action={<Button size="small" onClick={() => void list.refetch()}>重试</Button>}
        />
      </Card>
    )
  }

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState
          title="还没有执行过"
          hint="去「用例」挑几条用例下发，执行结果会出现在这里。"
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 0, height: '100%', gap: 'var(--w-space-3)' }}>
      {/* 批次选择器收成一个控件，不占一整页列表 */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        <Select
          size="small"
          value={activeId || undefined}
          onChange={pickRun}
          style={{ minWidth: 280 }}
          options={tasks.map((t) => {
            const v = verdictOf(t.status)
            const id = taskId(t)
            return {
              value: id,
              label: (
                <span className="flex items-center gap-2">
                  <Dot verdict={v} />
                  <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)' }}>{id.slice(0, 12)}</span>
                  <span style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-meta)' }}>
                    {t.started_at || ''}
                  </span>
                </span>
              ),
            }
          })}
        />

        {live && <StatusPill status="running">执行中</StatusPill>}

        {/* 实时断线显式提示，不静默停更 */}
        {live && rt !== 'open' && (
          <Tooltip title="实时推送已中断，当前靠轮询兜底。可以手动刷新。">
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}
            >
              <WifiOff size={12} /> 实时中断
            </span>
          </Tooltip>
        )}

        <span style={{ flex: 1 }} />

        <Segmented
          size="small"
          value={onlyAttention ? 'attention' : 'all'}
          onChange={(v) => setOnlyAttention(v === 'attention')}
          options={[
            { value: 'attention', label: <span className="flex items-center gap-1"><Filter size={12} />只看需关注</span> },
            { value: 'all', label: '全部' },
          ]}
        />
        <Tooltip title="刷新">
          <Button
            size="small"
            icon={<RefreshCw size={13} />}
            loading={detail.isFetching}
            onClick={() => void detail.refetch()}
            aria-label="刷新"
          />
        </Tooltip>
      </div>

      {/* 批次概览 */}
      <div className="flex flex-wrap items-center gap-4 shrink-0" style={{ fontSize: 'var(--w-font-sm)' }}>
        <Metric label="总计" value={task?.total ?? (task?.cases?.length || 0)} />
        <Metric label="已完成" value={task?.completed ?? 0} />
        <Metric label="通过" value={counts.pass} color="var(--w-pass)" />
        <Metric label="失败" value={counts.fail} color="var(--w-fail)" />
        {counts.running > 0 && (
          <Metric label="执行中" value={counts.running} color="var(--w-running)" icon={<Activity size={11} strokeWidth={2.4} />} />
        )}
      </div>

      {detail.isLoading ? (
        <Skeleton active paragraph={{ rows: 6 }} title={false} />
      ) : (
        <div className="flex flex-1 min-h-0" style={{ gap: 'var(--w-space-3)' }}>
          {/* 用例结果：失败置顶 */}
          <div
            className="flex-1 min-w-0 overflow-y-auto"
            style={{
              background: 'var(--w-surface)',
              border: '1px solid var(--w-border)',
              borderRadius: 'var(--w-radius-lg)',
            }}
          >
            {!cases.length ? (
              <EmptyState title="这个批次还没有用例结果" hint="执行器还没有回传，稍等或手动刷新。" />
            ) : (
              cases.map((c) => (
                <CaseResultRow
                  key={caseId(c)}
                  row={c}
                  active={pickedCase === caseId(c)}
                  onPick={() => setPickedCase(caseId(c))}
                />
              ))
            )}
          </div>

          {/* 步骤在同一页内分栏展示，不用弹窗——诊断时要同时看列表和步骤 */}
          <CaseStepsPane
            taskId={activeId}
            caseRow={cases.find((c) => caseId(c) === pickedCase)}
          />
        </div>
      )}
    </div>
  )
}

function CaseResultRow({
  row,
  active,
  onPick,
}: {
  row: TaskCase
  active: boolean
  onPick: () => void
}) {
  const v = verdictOf(row.status || row.overall_status)
  const reason = failReason(row)

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 text-left"
      style={{
        padding: 'var(--w-cell-padding-y) var(--w-cell-padding-x)',
        minHeight: 'var(--w-row-height)',
        border: 'none',
        borderLeft: `2px solid ${v === 'fail' ? 'var(--w-fail)' : 'transparent'}`,
        borderBottom: '1px solid var(--w-border)',
        background: active ? 'var(--w-surface-hover)' : 'transparent',
        cursor: 'pointer',
        minWidth: 0,
      }}
    >
      <span style={{ width: 62, flexShrink: 0 }}>
        {v === 'pass' && <StatusPill status="pass">通过</StatusPill>}
        {v === 'fail' && <StatusPill status="fail">失败</StatusPill>}
        {v === 'running' && <StatusPill status="running">执行</StatusPill>}
        {v === 'other' && <StatusPill status="muted">其他</StatusPill>}
      </span>
      <span className="min-w-0 flex-1" style={{ display: 'block' }}>
        <span
          className="truncate"
          style={{ display: 'block', fontSize: 'var(--w-font-base)', fontWeight: 650, color: 'var(--w-text)' }}
          title={row.title}
        >
          {row.title || caseId(row)}
        </span>
        {reason && (
          <span
            className="truncate"
            style={{ display: 'block', marginTop: 2, fontSize: 'var(--w-font-meta)', color: 'var(--w-fail)' }}
            title={reason}
          >
            {reason}
          </span>
        )}
      </span>
      <span
        className="w-mono shrink-0"
        style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}
      >
        {caseId(row).slice(0, 10)}
      </span>
    </button>
  )
}

function Metric({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: number
  color?: string
  icon?: React.ReactNode
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ color: color || 'var(--w-text-tertiary)', fontWeight: 650 }}>
      {icon}
      <span>{label}</span>
      <strong style={{ fontWeight: 800, color: color || 'var(--w-text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </strong>
    </span>
  )
}

function Dot({ verdict }: { verdict: Verdict }) {
  const bg =
    verdict === 'pass' ? 'var(--w-pass)'
      : verdict === 'fail' ? 'var(--w-fail)'
        : verdict === 'running' ? 'var(--w-running)'
          : 'var(--w-muted)'
  return <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: bg, flexShrink: 0 }} />
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
