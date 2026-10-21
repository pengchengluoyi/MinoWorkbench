import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RefreshCw, TriangleAlert, WifiOff } from 'lucide-react'
import { Input, Select, Button, DataTable, Drawer, Dropdown, Space, PageHeader, EmptyState, Skeleton, StatusPill, Tooltip, errText, useFeedback, type DataColumn } from '@/ui'
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
  const [taskPanel, setTaskPanel] = useState('')
  const list = useTaskList(appId, page, size, statusFilter)
  const tasks: TaskRow[] = list.data?.items ?? EMPTY_ARRAY
  const urlRun = params.get('run') || ''
  useEffect(() => { setTaskPanel('') }, [urlRun])
  useListPerformance(appId, 'tasks', list.isSuccess && !urlRun, list.isError, !!list.data, JSON.stringify([page, size]))
  const tcase = params.get('tcase') || ''
  const unit = params.get('unit') || ''

  const detail = useTaskDetail(urlRun, true)
  const task = detail.data
  const live = verdictOf(task?.status) === 'running'
  const [creating, setCreating] = useState(false)
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelNotice, setCancelNotice] = useState('')
  const [rt, setRt] = useState<RealtimeState>(realtimeState)

  useEffect(() => onRealtimeState(setRt), [])

  const allCases = useMemo(() => [...(task?.cases || [])].sort(byAttention), [task?.cases])
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

  if (!urlRun) {
    return (
      <>
        <div className="w-workspace flex h-full min-h-0 flex-col">
          <PageHeader title="执行批次" extra={<Space wrap><Button onClick={() => setTaskPanel('lookup')}>按编号查找</Button>{createButton}</Space>} />
          <DataTable<TaskRow>
            viewId="testing.tasks"
            fill
            rowKey={(row) => taskId(row)}
            dataSource={tasks}
            loading={list.isLoading}
            columns={batchColumns(row => setQuery({ run: taskId(row), tcase: null, unit: null }))}
            rowLabel={taskName}
            renderCard={row => { const status = taskStatus(row.status); const progress = taskProgress(row); return <><div className="w-record-line"><StatusPill status={status.tone}>{status.label}</StatusPill><span className="w-record-meta">{taskDate(row.started_at)}</span></div><strong className="w-record-title">{taskName(row)}</strong><span className="w-record-meta">{String(row.platform || '平台待确认')} · {String(row.env_profile || row.envProfile || '环境待确认')}{progress.total != null ? ` · 已执行 ${progress.completed ?? '未知'} / ${progress.total}` : ''}</span></> }}
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

              </>
            )}
            emptyTitle="还没有执行批次"
          />
        </div>
        {createDialog}
        <Drawer title="按编号查找任务" width="min(480px, 100vw)" open={taskPanel === 'lookup'} onClose={() => setTaskPanel('')}><label className="w-form-field">任务编号<Input aria-label="任务编号直达" placeholder="输入完整任务编号" value={taskLookup} onChange={event => setTaskLookup(event.target.value)} onPressEnter={() => { if (taskLookup.trim()) { setTaskPanel(''); setQuery({ run: taskLookup.trim(), tcase: null, unit: null }) } }} /></label><Button style={{ marginTop: 16 }} type="primary" disabled={!taskLookup.trim()} onClick={() => { setTaskPanel(''); setQuery({ run: taskLookup.trim(), tcase: null, unit: null }) }}>查看任务</Button></Drawer>
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
    <section className="task-detail">
      <header className="case-detail-heading">
        <div className="min-w-0"><h1>{title}</h1><div className="w-record-line w-record-meta">{task && <StatusPill status={taskStatus(task.status).tone}>{taskStatus(task.status).label}</StatusPill>}<span>{taskClock(task)}</span>{live && rt !== 'open' && <Tooltip title="实时连接已中断，正在定期更新状态。"><span><WifiOff size={12} /> 连接中断</span></Tooltip>}</div></div>
        <Space wrap><Button onClick={() => setQuery({ run: null, tcase: null, unit: null })}>返回批次</Button><Button icon={<RefreshCw size={14} />} loading={detail.isFetching} onClick={() => void detail.refetch()}>刷新</Button>{live && <Button danger loading={cancelBusy} onClick={() => void cancel()}>请求取消</Button>}<Dropdown trigger={['click']} menu={{ items: [{ key: 'info', label: '任务信息' }, { key: 'comparison', label: '历史报告对比' }], onClick: ({ key }) => setTaskPanel(key) }}><Button>更多操作</Button></Dropdown></Space>
      </header>
      <div className="w-page-scroll" role="region" aria-label="任务结果" tabIndex={0}>
        {cancelNotice && <p role="status">{cancelNotice}</p>}
        {task && <dl className="task-summary" aria-label="执行统计">
          <Stat kicker="进度" value={progress.percent != null ? `${progress.percent}%` : '待确认'} />
          <Stat kicker="通过" value={String(counts.pass)} tone="var(--w-pass)" />
          <Stat kicker="失败" value={String(counts.fail)} tone="var(--w-fail)" />
          <Stat kicker="进行中" value={String(counts.running)} />
          <Stat kicker="其他" value={String(counts.other)} note="取消、阻塞、跳过及未核验结果，不计为通过" />
        </dl>}
        {!!task?.skipped_cases?.length && <details aria-label="未纳入执行的用例" open>
          <summary>{task.skipped_cases.length} 条未纳入本次执行</summary>
          <ul>{task.skipped_cases.map(item => <li key={item.case_id}>
            <strong>{item.name || item.case_id}</strong> · <code>{item.case_id}</code>
            <p>{item.reasons?.join('；') || '服务端未提供原因，请查看当前用例编译状态。'}</p>
          </li>)}</ul>
        </details>}
        {!live && task && <Suspense fallback={<p>正在读取资源状态…</p>}><RunSafety key={urlRun} runId={urlRun} onStarted={id => setQuery({ run: id, tcase: null, unit: null })} /></Suspense>}
        {detail.isLoading ? <Skeleton active paragraph={{ rows: 6 }} title={false} /> : detail.isError ? <EmptyState title="读取批次详情失败" hint={errText(detail.error, '这个批次可能已被清理。')} action={<Button onClick={() => void detail.refetch()}>重试</Button>} /> : <div className="task-detail-results">
          <DataTable<TaskCase>
            viewId="testing.task.cases" fill rowKey={executionKey} dataSource={allCases} columns={caseColumns}
            rowLabel={row => row.title || '用例结果'}
            renderCard={row => { const status = taskStatus(row.status || row.overall_status); return <><div className="w-record-line"><StatusPill status={status.tone}>{status.label}</StatusPill><span>{caseDuration(row)}</span></div><strong className="w-record-title">{row.title || '未命名用例'}</strong><span className="w-record-excerpt">{String(row.summary || failReason(row) || '查看执行详情')}</span></> }}
            onRowClick={row => setQuery({ tcase: caseId(row), unit: executionKey(row) })}
            emptyTitle="这个批次还没有用例结果"
            emptyHint="执行结果尚未回传，可稍后刷新。"
          />
        </div>}
      </div>
      <Drawer title={taskPanel === 'comparison' ? '历史报告对比' : '任务信息'} open={taskPanel === 'info' || taskPanel === 'comparison'} onClose={() => setTaskPanel('')} width="min(860px, 100vw)" destroyOnHidden>
        {taskPanel === 'comparison' && <Suspense fallback={<Skeleton active />}><RunComparison key={urlRun} runId={urlRun} derivedFrom={String(task?.derived_from || '')} embedded /></Suspense>}
        {taskPanel === 'info' && <dl className="task-info"><div><dt>任务编号</dt><dd>{urlRun} <Button onClick={() => copyTaskId(urlRun, fb)}>复制编号</Button></dd></div><div><dt>执行范围</dt><dd>请求 {String(task?.requested_total ?? '未知')} 项 · 返回 {allCases.length} 项</dd></div><div><dt>执行信息</dt><dd>{batchFacts(task).join(' · ') || '未提供'}</dd></div></dl>}
      </Drawer>
      {createDialog}
    </section>
  )
}

const batchColumns = (onOpen: (row: TaskRow) => void): DataColumn<TaskRow>[] => [
  {
    key: 'id', title: '任务 / 用例范围', alwaysVisible: true, width: 260,
    render: (_: unknown, row) => <div><div className="w-task-title">{taskName(row)}</div><div className="w-task-meta">{taskCount(row.total) != null ? `${row.total} 项执行` : '执行范围待确认'}</div></div>,
  },
  {
    key: 'target', title: '目标 / 环境', width: 180,
    render: (_: unknown, row) => <div><div className="w-task-title">{String(row.platform || '平台未提供')} · {String(row.env_profile || row.envProfile || '环境未提供')}</div></div>,
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
          <div className="truncate" style={{ fontWeight: 650 }}>{row.title || '未命名用例'}</div>
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
  return <div title={note}><dt>{kicker}</dt><dd style={{ color: tone }}>{value}</dd></div>
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
