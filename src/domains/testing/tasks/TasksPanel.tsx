import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ChevronDown, ChevronRight, Filter, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { Button, EmptyState, Segmented, Skeleton, StatusPill, Tooltip, errText } from '@/ui'
import { onRealtimeState, realtimeState, type RealtimeState } from '@/lib/realtime'
import { EMPTY_ARRAY } from '@/lib/unwrap'
import { useTaskDetail, useTaskList } from './queries'
import { byAttention, caseId, failReason, taskId, verdictOf, type TaskCase, type TaskRow, type Verdict } from './types'
import { BatchList } from './BatchList'

/**
 * 执行结果面板 —— 批次列表 + 批次详情。
 *
 * 上一版只留了一个下拉选择器、没有列表也没有详情页，用户直接看不懂那是什么。
 * 反思：原设计的问题不是"有列表"，而是列表不带答案。所以列表留着，
 * 每行直接给通过/失败计数；详情默认落在最近一个批次；
 * 批次内失败置顶，点用例就地展开步骤，不再另开第三个面板。
 */
export function TasksPanel({ appId }: { appId: string }) {
  const [params, setParams] = useSearchParams()
  const list = useTaskList(appId)

  const tasks: TaskRow[] = list.data ?? EMPTY_ARRAY
  const urlRun = params.get('run') || ''
  const activeId = urlRun || taskId(tasks[0])

  const detail = useTaskDetail(activeId, true)
  const task = detail.data
  const live = verdictOf(task?.status) === 'running'

  const [onlyAttention, setOnlyAttention] = useState(true)
  const [expanded, setExpanded] = useState<string>('')
  const [rt, setRt] = useState<RealtimeState>(realtimeState)

  useEffect(() => onRealtimeState(setRt), [])

  const allCases = useMemo(() => [...(task?.cases || [])].sort(byAttention), [task?.cases])

  const cases = useMemo(() => {
    if (!onlyAttention) return allCases
    const attention = allCases.filter((c) => {
      const v = verdictOf(c.status || c.overall_status)
      return v === 'fail' || v === 'other'
    })
    // 全通过时不要给一张空表，退回全部
    return attention.length ? attention : allCases
  }, [allCases, onlyAttention])

  const counts = useMemo(() => {
    const out: Record<Verdict, number> = { pass: 0, fail: 0, running: 0, other: 0 }
    for (const c of allCases) out[verdictOf(c.status || c.overall_status)] += 1
    return out
  }, [allCases])

  const pickRun = (id: string) => {
    const p = new URLSearchParams(params)
    p.set('run', id)
    setParams(p, { replace: true })
    setExpanded('')
  }

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

  if (!list.isLoading && !tasks.length) {
    return (
      <Card>
        <EmptyState title="还没有执行过" hint="去「用例」挑几条用例下发，执行结果会出现在这里。" />
      </Card>
    )
  }

  return (
    <div className="flex min-h-0" style={{ height: '100%', gap: 'var(--w-space-3)' }}>
      <BatchList
        tasks={tasks}
        activeId={activeId}
        loading={list.isLoading}
        fetching={list.isFetching}
        onPick={pickRun}
        onRefresh={() => void list.refetch()}
      />

      {/* 批次详情 */}
      <section
        className="flex flex-1 flex-col min-w-0"
        style={{
          background: 'var(--w-surface)',
          border: '1px solid var(--w-border)',
          borderRadius: 'var(--w-radius-lg)',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <header
          className="flex flex-wrap items-center gap-3 shrink-0"
          style={{ padding: '10px 14px', borderBottom: '1px solid var(--w-border)' }}
        >
          <span className="w-mono" style={{ fontSize: 'var(--w-font-base)', fontWeight: 700, color: 'var(--w-text)' }}>
            {activeId ? activeId.slice(0, 18) : '—'}
          </span>
          {live && <StatusPill status="running">执行中</StatusPill>}

          {/* 实时断线显式提示，不静默停更 */}
          {live && rt !== 'open' && (
            <Tooltip title="实时推送已中断，当前靠 5 秒轮询兜底。可以手动刷新。">
              <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}>
                <WifiOff size={12} /> 实时中断
              </span>
            </Tooltip>
          )}

          <span aria-hidden style={{ width: 1, height: 14, background: 'var(--w-border-strong)' }} />

          <Metric label="总计" value={task?.total ?? allCases.length} />
          <Metric label="通过" value={counts.pass} color="var(--w-pass)" />
          <Metric label="失败" value={counts.fail} color="var(--w-fail)" />
          {counts.running > 0 && (
            <Metric label="执行中" value={counts.running} color="var(--w-running)" icon={<Activity size={11} strokeWidth={2.4} />} />
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
            <Button size="small" icon={<RefreshCw size={13} />} loading={detail.isFetching} onClick={() => void detail.refetch()} aria-label="刷新详情" />
          </Tooltip>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
          {detail.isLoading ? (
            <div style={{ padding: 14 }}><Skeleton active title={false} paragraph={{ rows: 7 }} /></div>
          ) : detail.isError ? (
            <EmptyState
              icon={<TriangleAlert size={26} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
              title="读取批次详情失败"
              hint={errText(detail.error, '这个批次可能已被清理。')}
            />
          ) : !cases.length ? (
            <EmptyState title="这个批次还没有用例结果" hint="执行器还没有回传，稍等或手动刷新。" />
          ) : (
            cases.map((c) => (
              <CaseRow
                key={caseId(c)}
                row={c}
                open={expanded === caseId(c)}
                onToggle={() => setExpanded((prev) => (prev === caseId(c) ? '' : caseId(c)))}
              />
            ))
          )}
        </div>
      </section>
    </div>
  )
}

/** 用例结果行。点开就地展开步骤 —— 不再为步骤另开一个面板。 */
function CaseRow({ row, open, onToggle }: { row: TaskCase; open: boolean; onToggle: () => void }) {
  const v = verdictOf(row.status || row.overall_status)
  const reason = failReason(row)
  const steps = Array.isArray(row.steps) ? (row.steps as any[]) : []

  return (
    <div style={{ borderBottom: '1px solid var(--w-border)' }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left"
        style={{
          padding: 'var(--w-cell-padding-y) var(--w-cell-padding-x)',
          minHeight: 'var(--w-row-height)',
          border: 'none',
          borderLeft: `2px solid ${v === 'fail' ? 'var(--w-fail)' : 'transparent'}`,
          background: open ? 'var(--w-surface-hover)' : 'transparent',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        {open
          ? <ChevronDown size={14} style={{ color: 'var(--w-text-quaternary)', flexShrink: 0 }} />
          : <ChevronRight size={14} style={{ color: 'var(--w-text-quaternary)', flexShrink: 0 }} />}

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

        <span className="w-mono shrink-0" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
          {caseId(row).slice(0, 10)}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 14px 12px 40px', background: 'var(--w-surface-subtle)' }}>
          {reason && (
            <div
              style={{
                margin: '6px 0 10px',
                padding: '8px 10px',
                borderRadius: 'var(--w-radius-sm)',
                background: 'var(--w-fail-bg)',
                color: 'var(--w-fail)',
                fontSize: 'var(--w-font-sm)',
                overflowWrap: 'anywhere',
              }}
            >
              {reason}
            </div>
          )}
          {!steps.length ? (
            <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)', padding: '6px 0' }}>
              这条用例没有回传步骤明细。完整的执行时间线（瀑布图、截图对比）排在后续阶段。
            </div>
          ) : (
            <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {steps.map((s, i) => {
                const sv = verdictOf(s?.status)
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2"
                    style={{
                      padding: '5px 8px',
                      borderRadius: 'var(--w-radius-sm)',
                      background: sv === 'fail' ? 'var(--w-fail-bg)' : 'transparent',
                    }}
                  >
                    <span
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 17, height: 17, borderRadius: '50%',
                        background: 'var(--w-fill)', fontSize: 10, fontWeight: 800,
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
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, color, icon }: { label: string; value: number; color?: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--w-font-sm)', color: color || 'var(--w-text-tertiary)', fontWeight: 650 }}>
      {icon}
      <span>{label}</span>
      <strong style={{ fontWeight: 800, color: color || 'var(--w-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </span>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
