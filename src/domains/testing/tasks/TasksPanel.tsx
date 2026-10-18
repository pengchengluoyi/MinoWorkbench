import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Filter, RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { Input, Select, Button, DataTable, PageHeader, EmptyState, Segmented, Skeleton, StatusPill, Tooltip, errText, useFeedback, type DataColumn } from '@/ui'
import { cancelTestingTask } from '@/api/caseRunner'
import { onRealtimeState, realtimeState, type RealtimeState } from '@/lib/realtime'
import type { PlatformInput } from '@/constants/appPlatforms'
import { EMPTY_ARRAY } from '@/lib/unwrap'
import { copyToClipboard } from '@/lib/clipboard'
import { CreateTaskDialog } from './CreateTaskDialog'
import { useTaskDetail, useTaskList } from './queries'
import { byAttention, caseId, executionKey, failReason, taskId, verdictOf, type TaskCase, type TaskRow, type Verdict } from './types'
import { taskCount, taskDate, taskName, taskProgress, taskStatus } from './presentation'
import { beginListNavigation, useListPerformance } from '../workbench/performance'

const CaseRunView = lazy(() => import('./CaseRunView').then((module) => ({ default: module.CaseRunView })))
const RunComparison = lazy(() => import('./RunComparison').then(module => ({ default: module.RunComparison })))
const RunSafety = lazy(() => import('./RunSafety').then(module => ({ default: module.RunSafety })))

/**
 * 执行结果分三层，每层只回答一个问题：
 * 批次列表回答「哪一次跑挂了」；批次页回答「哪些用例要看」；
 * 用例页回答「这一条卡在哪一步」。点进去才换页，不在同一屏里再开一栏。
 */
export function TasksPanel({ appId, projectId, platforms }: { appId: string; projectId: string; platforms: PlatformInput }) {
  const fb = useFeedback()
  const [params, setParams] = useSearchParams()
  const pageValue = Number(params.get('taskPage'))
  const page = Number.isFinite(pageValue) ? Math.max(1, Math.trunc(pageValue) || 1) : 1
  const sizeValue = Number(params.get('taskSize'))
  const size = [20, 50, 100, 200].includes(sizeValue) ? sizeValue : 50
  const statusFilter = params.get('taskStatus') || ''
  const [taskLookup, setTaskLookup] = useState('')
  const list = useTaskList(appId, page, size, statusFilter)
  const tasks: TaskRow[] = list.data?.items ?? EMPTY_ARRAY
  const urlRun = params.get('run') || ''
  useListPerformance(appId, 'tasks', list.isSuccess && !urlRun, list.isError, !!list.data, JSON.stringify([page, size]))
  const tcase = params.get('tcase') || ''
  const unit = params.get('unit') || ''

  const detail = useTaskDetail(urlRun, true)
  const task = detail.data
  const live = verdictOf(task?.status) === 'running'
  const [onlyAttention, setOnlyAttention] = useState(true)
  const [creating, setCreating] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelNotice, setCancelNotice] = useState('')
  const [rt, setRt] = useState<RealtimeState>(realtimeState)

  useEffect(() => onRealtimeState(setRt), [])

  const allCases = useMemo(() => [...(task?.cases || [])].sort(byAttention), [task?.cases])
  const cases = useMemo(() => {
    if (!onlyAttention) return allCases
    const attention = allCases.filter((c) => {
      const v = verdictOf(c.status || c.overall_status)
      return v === 'fail' || v === 'other'
    })
    return attention
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
    setParams(next, { replace: !Object.keys(patch).some(key => ['run', 'tcase', 'unit'].includes(key)) })
  }

  useEffect(() => {
    if (!list.isSuccess || !list.data?.total || page <= Math.ceil(list.data.total / size)) return
    const next = new URLSearchParams(params); next.set('taskPage', String(Math.max(1, Math.ceil(list.data.total / size)))); setParams(next, { replace: true })
  }, [list.isSuccess, list.data, page, size, params, setParams])
  const cancel = async () => {
    const ok = await fb.confirm({ title: `请求取消任务 ${urlRun}？`, content: '服务端会记录取消请求。记录取消不代表所有设备动作已停止，请继续核对执行证据和资源状态。', okText: '请求取消' })
    if (!ok || cancelBusy) return
    setCancelBusy(true)
    try { await cancelTestingTask(urlRun); setCancelNotice('服务端已响应取消请求，请核对最新任务与设备状态。'); await detail.refetch() }
    catch (error) { setCancelNotice(errText(error, '取消受理结果待确认，请重新读取任务状态，不自动重发')) }
    finally { setCancelBusy(false) }
  }
  const createButton = (
    <Button size="small" type="primary" disabled={!projectId} onClick={() => setCreating(true)}>新建任务</Button>
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

  if (list.isError && !urlRun) {
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

  if (!urlRun && !statusFilter && !list.isLoading && !tasks.length && !list.data?.total) {
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
        <div className="w-workspace flex h-full min-h-0 flex-col">
          <PageHeader title="执行任务" subtitle="查看任务目标、执行进度与结果，逐层进入用例和执行证据。" extra={createButton} />
          <DataTable<TaskRow>
            viewId="testing.tasks"
            fill
            rowKey={(row) => taskId(row)}
            dataSource={tasks}
            loading={list.isLoading}
            columns={batchColumns(row => setQuery({ run: taskId(row), tcase: null, unit: null }), fb)}
            pagination={{ page, pageSize: size, total: list.data?.total || 0,
              onChange: (next, nextSize) => {
                beginListNavigation(appId, 'tasks')
                setQuery({ taskPage: String(next), taskSize: String(nextSize) })
              } }}
            onRowClick={(row) => setQuery({ run: taskId(row), tcase: null })}
            toolbar={(
              <>
                <Button size="small" icon={<RefreshCw size={13} />} loading={list.isFetching} onClick={() => void list.refetch()}>刷新</Button>
                <Select aria-label="任务状态筛选" value={statusFilter} style={{ minWidth: 140 }} onChange={value => setQuery({ taskStatus: value, taskPage: '1' })} options={[{ value: '', label: '全部状态' }, { value: 'running', label: '执行中' }, { value: 'pass', label: '通过' }, { value: 'fail', label: '失败' }, { value: 'cancelled', label: '已取消' }, { value: 'blocked', label: '受阻' }]} />
                <Input aria-label="任务编号直达" placeholder="输入完整任务编号" value={taskLookup} onChange={event => setTaskLookup(event.target.value)} style={{ width: 230 }} /><Button disabled={!taskLookup.trim()} onClick={() => setQuery({ run: taskLookup.trim(), tcase: null, unit: null })}>查看任务</Button>
                <span>本页 {tasks.length} 条 · 上次读取 {list.dataUpdatedAt ? new Date(list.dataUpdatedAt).toLocaleTimeString() : '尚未读取'}</span>
              </>
            )}
            emptyTitle="还没有执行批次"
          />
        </div>
        {createDialog}
      </>
    )
  }

  const current = allCases.find((row) => caseId(row) === tcase && (!unit || executionKey(row) === unit))
  if (task?.app_id && task.app_id !== appId) return <Card><EmptyState title="任务不属于当前应用" action={<Button onClick={() => setQuery({ run: null, tcase: null })}>返回列表</Button>} /></Card>
  if (tcase && current) {
    return <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} />}><CaseRunView row={current} taskId={urlRun} platforms={typeof task?.platform === 'string' && task.platform ? task.platform : platforms} onBack={() => setQuery({ tcase: null, unit: null })} /></Suspense>
  }

  const progress = taskProgress(task)
  const title = task ? taskName(task) : '任务详情'

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
        {live && <Button danger loading={cancelBusy} onClick={() => void cancel()}>请求取消</Button>}
        {createButton}
      </header>
      {cancelNotice && <p role="status">{cancelNotice}</p>}
      <Suspense fallback={<p>正在读取报告对比入口</p>}><RunComparison key={urlRun} runId={urlRun} derivedFrom={String(task?.derived_from || '')} /></Suspense>
      {!live && task && <Suspense fallback={<p>正在加载安全状态</p>}><RunSafety key={urlRun} runId={urlRun} onStarted={id => setQuery({ run: id, tcase: null, unit: null })} /></Suspense>}
      <div className="flex shrink-0 flex-wrap gap-2" style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>
        <span>原请求总数：{typeof task?.requested_total === 'number' ? task.requested_total : '服务端未报告'} · 本批次返回 {allCases.length} 个执行单元</span>
        {batchFacts(task).map((fact) => <span key={fact}>{fact}</span>)}
      </div>
      <div className="grid shrink-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Stat kicker="进度" value={progress.percent != null ? `${progress.percent}%` : '未提供'} note={`已执行 ${progress.completed ?? '未知'} / 总数 ${progress.total ?? '未知'}`} />
        <Stat kicker="通过" value={String(counts.pass)} tone="var(--w-pass)" />
        <Stat kicker="失败" value={String(counts.fail)} tone="var(--w-fail)" /><Stat kicker="进行中" value={String(counts.running)} /><Stat kicker="其他 / 未核验" value={String(counts.other)} note="包括取消、阻塞、跳过及未知状态；不计为通过" />
      </div>
      {detail.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} title={false} />
      ) : detail.isError ? (
        <EmptyState title="读取批次详情失败" hint={errText(detail.error, '这个批次可能已被清理。')} />
      ) : (
        <DataTable<TaskCase>
          viewId="testing.task.cases"
          fill
          rowKey={executionKey}
          dataSource={cases}
          columns={caseColumns}
          onRowClick={(row) => setQuery({ tcase: caseId(row), unit: executionKey(row) })}
          emptyTitle={onlyAttention && allCases.length ? "当前没有需关注项" : "这个批次还没有用例结果"}
          emptyHint={onlyAttention && allCases.length ? "切换到全部可以查看所有结果。" : "执行器还没有回传，稍等或手动刷新。"}
        />
      )}
      {createDialog}
    </div>
  )
}

const batchColumns = (onOpen: (row: TaskRow) => void, fb: { ok: (s: string) => void; fail: (s: string) => void }): DataColumn<TaskRow>[] => [
  {
    key: 'id', title: '任务 / 用例范围', alwaysVisible: true, width: 260,
    render: (_: unknown, row) => <div><div className="w-task-title">{taskName(row)}</div><div className="w-task-meta">{taskCount(row.total) != null ? `${row.total} 个执行单元` : '执行范围未提供'} · <button type="button" className="w-mono" title="复制完整批次编号" style={idBtn} onClick={() => copyTaskId(taskId(row), fb)}>{taskId(row)}</button></div></div>,
  },
  {
    key: 'target', title: '目标 / 环境', width: 180,
    render: (_: unknown, row) => <div><div className="w-task-title">{String(row.platform || '平台未提供')} · {String(row.env_profile || row.envProfile || '环境未提供')}</div><div className="w-task-meta">{String(row.sn || row.device_sn || row.node_id || '目标未提供')}</div></div>,
  },
  {
    key: 'status', title: '执行进度与结果', width: 230,
    render: (_: unknown, row) => {
      const status = taskStatus(row.status)
      const progress = taskProgress(row)
      return <div><StatusPill status={status.tone}>{status.label}</StatusPill><div className="w-task-meta">已执行 {progress.completed ?? '未知'} / {progress.total ?? '未知'} · 通过 {taskCount(row.passed) ?? '未提供'} · 失败 {taskCount(row.failed) ?? '未提供'}</div>{progress.percent != null && <div className="w-task-progress" role="progressbar" aria-label="任务执行进度" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent}%` }} /></div>}</div>
    },
  },
  {
    key: 'events', title: '执行证据', width: 180,
    render: (_: unknown, row) => <div><Button type="link" style={{ padding: 0 }} onClick={() => onOpen(row)}>查看用例与事件</Button><div className="w-task-meta">当前列表未提供事件摘要</div></div>,
  },
  {
    key: 'started', title: '时间', width: 165,
    render: (_: unknown, row) => <div><span title={String(row.started_at || '')}>{taskDate(row.started_at)}</span><div className="w-task-meta">{row.finished_at ? `结束 ${taskDate(row.finished_at)}` : verdictOf(row.status) === 'running' ? '尚未结束' : '结束时间未提供'}</div></div>,
  },
  { key: 'open', title: '详情', width: 80, fixed: 'right', alwaysVisible: true, render: (_: unknown, row) => <Button onClick={() => onOpen(row)}>查看</Button> },
]

const caseColumns: DataColumn<TaskCase>[] = [
  {
    key: 'status',
    title: '状态',
    width: 90,
    render: (_: unknown, row) => {
      const status = taskStatus(row.status || row.overall_status)
      return <StatusPill status={status.tone}>{status.label}</StatusPill>
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
  copyToClipboard(text).then(() => fb.ok('已复制')).catch(() => fb.fail('复制失败，请选中文本手动复制'))
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
