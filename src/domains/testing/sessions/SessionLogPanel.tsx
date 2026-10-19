import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, DataTable, Select, PageHeader, StatusPill, toStatusKind, type DataColumn } from '@/ui'
import type { SessionRow } from '@/api/sessions'
import { useSessionList } from './queries'
import { SessionDetail } from './SessionDetail'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = [
  { value: 'running', label: '执行中' },
  { value: 'pass', label: '通过' },
  { value: 'fail', label: '失败' },
  { value: 'blocked', label: '受阻' },
  { value: 'cancelled', label: '已取消' },
]

/**
 * Session Log 先是一张表。点一行进入详情页，详情和表格不同时占同一屏。
 * session 挂在 URL 上，刷新和分享都还在。
 */
export function SessionLogPanel({ appId }: { appId: string }) {
  const [params, setParams] = useSearchParams()
  const requestedStatus = params.get('sstatus') || ''
  const status = STATUS_OPTIONS.some(option => option.value === requestedStatus) ? requestedStatus : ''
  const pageRaw = Number(params.get('spage'))
  const page = Number.isFinite(pageRaw) ? Math.min(100000, Math.max(1, Math.trunc(pageRaw) || 1)) : 1
  const pageSize = [20, 50, 100, 200].includes(Number(params.get('sps'))) ? Number(params.get('sps')) : DEFAULT_PAGE_SIZE
  const sessionId = params.get('session') || ''

  const list = useSessionList(appId, status, page, pageSize)

  const setQuery = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: !Object.hasOwn(patch, 'session') })
  }

  useEffect(() => {
    if (!list.isSuccess || list.isFetching) return
    const lastPage = Math.max(1, Math.ceil(list.data.total / pageSize))
    if (page > lastPage) {
      const next = new URLSearchParams(params); next.set('spage', String(lastPage)); setParams(next, { replace: true })
    }
  }, [list.data, list.isSuccess, list.isFetching, page, pageSize, params, setParams])

  const columns = useMemo<DataColumn<SessionRow>[]>(() => [
    {
      key: 'session_id',
      title: '执行摘要',
      alwaysVisible: true,
      ellipsis: true,
      render: (_: unknown, row) => (
        <span style={{ fontWeight: 650 }}>{row.summary || '执行记录'}</span>
      ),
    },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_: unknown, row) => <StatusPill status={toStatusKind(row.status)}>{sessionStatusLabel(row.status)}</StatusPill>,
    },
    { key: 'event_count', title: '事件', dataIndex: 'event_count', width: 72, render: (v: number) => v ?? '—' },
    { key: 'started_at', title: '开始', dataIndex: 'started_at', width: 168, ellipsis: true, render: (v: string) => v || '—' },

  ], [])

  if (sessionId) {
    return (
      <div className="flex h-full min-h-0 flex-col" style={{ gap: 10 }}>
        <div className="shrink-0">
          <Button size="small" onClick={() => setQuery({ session: '' })}>返回列表</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <SessionDetail sessionId={sessionId} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <PageHeader title="执行记录" subtitle="查看每次执行的结果与过程。" />
      <DataTable<SessionRow>
        viewId="testing.sessions"
        fill
        columns={columns}
        dataSource={list.data?.items}
        rowKey="session_id"
        loading={list.isLoading}
        error={list.isError ? list.error : undefined}
        onRetry={() => void list.refetch()}
        emptyTitle="还没有执行会话"
        emptyHint="下发用例之后，每次执行会在这里留下一条记录。点一行查看回合和事件。"
        onRowClick={(row) => setQuery({ session: row.session_id })}
        toolbar={(
          <div className="flex flex-wrap items-center gap-2">
            <Select
              allowClear
              placeholder="状态"
              size="small"
              style={{ width: 140 }}
              value={status || undefined}
              options={STATUS_OPTIONS}
              onChange={(v) => setQuery({ sstatus: v || '', spage: '1' })}
            />
            <Button size="small" onClick={() => void list.refetch()}>刷新</Button>
          </div>
        )}
        pagination={{
          page,
          pageSize,
          total: list.data?.total || 0,
          onChange: (next, size) => setQuery({ spage: String(next), sps: String(size) }),
        }}
      />
    </div>
  )
}

function sessionStatusLabel(status?: string) {
 const labels: Record<string, string> = { running: '执行中', pass: '通过', fail: '失败', blocked: '受阻', cancelled: '已取消', canceled: '已取消', done: '已结束，结果待核验', completed: '已结束，结果待核验' }
 return status ? labels[status.toLowerCase()] || `未知状态 · ${status}` : '状态未报告'
}
