import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { Button, DataTable, EmptyState, Segmented, Skeleton, StatusPill, Tooltip, errText, useFeedback, type DataColumn } from '@/ui'
import { onRealtimeState, realtimeState, type RealtimeState } from '@/lib/realtime'
import { EMPTY_ARRAY } from '@/lib/unwrap'
import { CreateTaskDialog } from './CreateTaskDialog'
import { useTaskDetail, useTaskList } from './queries'
import { CaseRunView } from './CaseRunView'
import { byAttention, caseId, failReason, taskId, verdictOf, type TaskCase, type TaskRow, type Verdict } from './types'

/**
 * 执行结果分三层，每层只回答一个问题：
 * 批次列表回答「哪一次跑挂了」；批次页回答「哪些用例要看」；
 * 用例页回答「这一条卡在哪一步」。点进去才换页，不在同一屏里再开一栏。
 */
export function TasksPanel({ appId }: { appId: string }) {
  const fb = useFeedback()
  const [params, setParams] = useSearchParams()
  const list = useTaskList(appId)
  const tasks: TaskRow[] = list.data ?? EMPTY_ARRAY
  const urlRun = params.get('run') || ''
  const tcase = params.get('tcase') || ''

  const detail = useTaskDetail(urlRun, true)
  const task = detail.data
  const live = verdictOf(task?.status) === 'running'
  const [onlyAttention, setOnlyAttention] = useState(true)
  const [creating, setCreating] = useState(false)
  const [rt, setRt] = useState<RealtimeState>(realtimeState)
  const projectId = params.get('projectId') || ''

  useEffect(() => onRealtimeState(setRt), [])

  const allCases = useMemo(() => [...(task?.cases || [])].sort(byAttention), [task?.cases])
  const cases = useMemo(() => {
    if (!onlyAttention) return allCases
    const attention = allCases.filter((c) => {
      const v = verdictOf(c.status || c.overall_status)
      return v === 'fail' || v === 'other'
    })
    return attention.length ? attention : allCases
  }, [allCases, onlyAttention])

  const counts = useMemo(() => {
    const out: Record<Verdict, number> = { pass: 0, fail: 0, running: 0, other: 0 }
    for (const c of allCases) out[verdictOf(c.status || c.overall_status)] += 1
    return out
  }, [allCases])

  const setQuery = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }

  const createButton = (
    <Button size="small" type="primary" onClick={() => setCreating(true)}>新建任务</Button>
  )
  const createDialog = (
    <CreateTaskDialog
      open={creating}
      appId={appId}
      projectId={projectId}
      onClose={() => setCreating(false)}
      onStarted={(runId) => {
        setCreating(false)
        setQuery({ run: runId, tcase: null })
      }}
    />
  )

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
      <>
        <Card>
          <EmptyState title="还没有执行过" hint="新建一次任务，执行结果会出现在这里。" action={createButton} />
        </Card>
        {createDialog}
      </>
    )
  }

  if (!urlRun) {
    return (
      <>
        <div className="flex h-full min-h-0 flex-col">
          <DataTable<TaskRow>
            viewId="testing.tasks"
            fill
            rowKey={(row) => taskId(row)}
            dataSource={tasks}
            loading={list.isLoading}
            columns={batchColumns}
            onRowClick={(row) => setQuery({ run: taskId(row), tcase: null })}
            toolbar={(
              <>
                <Button size="small" icon={<RefreshCw size={13} />} loading={list.isFetching} onClick={() => void list.refetch()}>刷新</Button>
                {createButton}
              </>
            )}
            emptyTitle="还没有执行批次"
          />
        </div>
        {createDialog}
      </>
    )
  }

  const current = allCases.find((row) => caseId(row) === tcase)
  if (tcase && current) {
    return <CaseRunView row={current} taskId={urlRun} onBack={() => setQuery({ tcase: null })} />
  }

  const total = Number(task?.total ?? allCases.length) || allCases.length
  const done = Number(task?.completed ?? (counts.pass + counts.fail)) || 0
  const pct = total ? Math.round((done / total) * 100) : 0
  const title = String(task?.title || allCases[0]?.title || urlRun)

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 12 }}>
      <header className="flex shrink-0 flex-wrap items-center gap-3">
        <Button size="small" onClick={() => setQuery({ run: null, tcase: null })}>返回列表</Button>
        <strong className="min-w-0 truncate" style={{ fontSize: 18 }}>{title}</strong>
        <button type="button" className="w-mono" title="复制任务 ID" onClick={() => copyTaskId(urlRun, fb)} style={idBtn}>{urlRun}</button>
        <span style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{taskClock(task)}</span>
        {live && <StatusPill status="running">执行中</StatusPill>}
        {live && rt !== 'open' && (
          <Tooltip title="实时推送已中断，当前靠 5 秒轮询兜底。">
            <span className="inline-flex items-center gap-1" style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}>
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
        <Button size="small" icon={<RefreshCw size={13} />} loading={detail.isFetching} onClick={() => void detail.refetch()} aria-label="刷新详情" />
        {createButton}
      </header>
      <div className="flex shrink-0 flex-wrap gap-2" style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>
        {batchFacts(task).map((fact) => <span key={fact}>{fact}</span>)}
      </div>
      <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat kicker="进度" value={`${pct}%`} note={total ? `${done} / ${total} 已结束` : ''} />
        <Stat kicker="通过" value={String(counts.pass)} tone="var(--w-pass)" />
        <Stat kicker="失败" value={String(counts.fail)} tone="var(--w-fail)" />
      </div>
      {detail.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} title={false} />
      ) : detail.isError ? (
        <EmptyState title="读取批次详情失败" hint={errText(detail.error, '这个批次可能已被清理。')} />
      ) : (
        <DataTable<TaskCase>
          viewId="testing.task.cases"
          fill
          rowKey={(row) => caseId(row)}
          dataSource={cases}
          columns={caseColumns}
          onRowClick={(row) => setQuery({ tcase: caseId(row) })}
          emptyTitle="这个批次还没有用例结果"
          emptyHint="执行器还没有回传，稍等或手动刷新。"
        />
      )}
      {createDialog}
    </div>
  )
}

const batchColumns: DataColumn<TaskRow>[] = [
  {
    key: 'status',
    title: '状态',
    width: 100,
    render: (_: unknown, row) => {
      const v = verdictOf(row.status)
      const label = v === 'pass' ? '通过' : v === 'fail' ? '失败' : v === 'running' ? '执行中' : '其他'
      return <StatusPill status={v === 'other' ? 'muted' : v}>{label}</StatusPill>
    },
  },
  {
    key: 'id',
    title: '批次',
    alwaysVisible: true,
    render: (_: unknown, row) => <span className="w-mono">{taskId(row)}</span>,
  },
  {
    key: 'result',
    title: '结果',
    width: 180,
    render: (_: unknown, row) => {
      const passed = Number(row.passed ?? 0)
      const failed = Number(row.failed ?? 0)
      const total = Number(row.total ?? row.cases?.length ?? 0)
      return (
        <span style={{ fontWeight: 650 }}>
          {failed > 0 && <span style={{ color: 'var(--w-fail)', marginRight: 8 }}>挂 {failed}</span>}
          {passed > 0 && <span style={{ color: 'var(--w-pass)', marginRight: 8 }}>过 {passed}</span>}
          <span style={{ color: 'var(--w-text-quaternary)' }}>/ {total}</span>
        </span>
      )
    },
  },
  { key: 'started', title: '开始', width: 180, render: (_: unknown, row) => row.started_at || row.finished_at || '—' },
]

const caseColumns: DataColumn<TaskCase>[] = [
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (_: unknown, row) => {
      const v = verdictOf(row.status || row.overall_status)
      const label = v === 'pass' ? '通过' : v === 'fail' ? '失败' : v === 'running' ? '执行' : '其他'
      return <StatusPill status={v === 'other' ? 'muted' : v}>{label}</StatusPill>
    },
  },
  {
    key: 'title',
    title: '用例',
    alwaysVisible: true,
    render: (_: unknown, row) => {
      return (
        <div className="min-w-0">
          <div className="truncate" style={{ fontWeight: 650 }}>{row.title || caseId(row)}</div>
          <div className="w-mono" style={{ marginTop: 2, color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-meta)' }}>{caseId(row)}</div>
        </div>
      )
    },
  },
  {
    key: 'duration',
    title: '耗时',
    width: 100,
    render: (_: unknown, row) => caseDuration(row),
  },
  {
    key: 'summary',
    title: '结果',
    render: (_: unknown, row) => {
      const text = String(row.summary || failReason(row) || '')
      const bad = verdictOf(row.status || row.overall_status) === 'fail'
      return <span style={{ color: bad ? 'var(--w-fail)' : 'var(--w-text-secondary)', overflowWrap: 'anywhere' }}>{text || '—'}</span>
    },
  },
]

function batchFacts(task: TaskRow | undefined) {
  if (!task) return []
  const bits = [
    task.env_profile || task.envProfile,
    task.platform,
    task.sn,
    task.model_name || task.modelName || task.provider_name || task.providerName,
    elapsedText(task),
  ].map((item) => String(item || '').trim()).filter(Boolean)
  return bits
}

function copyTaskId(text: string, fb: { ok: (s: string) => void; fail: (s: string) => void }) {
  navigator.clipboard.writeText(text).then(() => fb.ok('已复制')).catch(() => fb.fail('剪贴板不可用'))
}

function taskClock(task: TaskRow | undefined) {
  if (!task) return '总耗时 无'
  const done = elapsedText(task)
  if (done) return `总耗时 ${done}`
  const start = Date.parse(String(task.started_at || task.startedAt || ''))
  if (verdictOf(task.status) === 'running' && Number.isFinite(start)) {
    const seconds = Math.max(0, Math.round((Date.now() - start) / 1000))
    return `已进行 ${seconds} 秒`
  }
  return '总耗时 无'
}

function caseDuration(row: TaskCase) {
  const explicit = Number(row.duration_ms)
  if (Number.isFinite(explicit) && explicit > 0) return formatSpan(explicit)
  const start = Date.parse(String(row.started_at || ''))
  const end = Date.parse(String(row.finished_at || ''))
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return formatSpan(end - start)
  return '无'
}

function formatSpan(ms: number) {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`
}

function elapsedText(task: TaskRow) {
  const start = Date.parse(String(task.started_at || task.startedAt || ''))
  const end = Date.parse(String(task.finished_at || task.finishedAt || ''))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return ''
  const seconds = Math.round((end - start) / 1000)
  const minutes = Math.floor(seconds / 60)
  return minutes ? `${minutes} 分 ${seconds % 60} 秒` : `${seconds} 秒`
}

function Stat({ kicker, value, note, tone }: { kicker: string; value: string; note?: string; tone?: string }) {
  return (
    <section style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', padding: '12px 14px' }}>
      <div style={{ fontSize: 12, color: 'var(--w-text-quaternary)', fontWeight: 700 }}>{kicker}</div>
      <div style={{ marginTop: 4, fontSize: 28, fontWeight: 800, color: tone || 'var(--w-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {note ? <div style={{ marginTop: 2, fontSize: 12, color: 'var(--w-text-tertiary)' }}>{note}</div> : null}
    </section>
  )
}

const idBtn: CSSProperties = {
  border: '1px solid var(--w-border)',
  background: 'var(--w-surface)',
  borderRadius: 8,
  padding: '2px 8px',
  fontSize: 12,
  color: 'var(--w-text-secondary)',
  cursor: 'pointer',
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}

