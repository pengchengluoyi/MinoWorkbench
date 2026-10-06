import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, DataTable, Select, StatusPill, toStatusKind, type DataColumn } from '@/ui'
import type { SessionRow } from '@/api/sessions'
import { useSessionList } from './queries'
import { SessionDetail } from './SessionDetail'

const DEFAULT_PAGE_SIZE = 20
const STATUS_OPTIONS = [
  { value: 'running', label: 'running' },
  { value: 'pass', label: 'pass' },
  { value: 'fail', label: 'fail' },
  { value: 'blocked', label: 'blocked' },
  { value: 'cancelled', label: 'cancelled' },
]

/**
 * Session Log 先是一张表。点一行进入详情页，详情和表格不同时占同一屏。
 * session 挂在 URL 上，刷新和分享都还在。
 */
export function SessionLogPanel({ appId }: { appId: string }) {
  const [params, setParams] = useSearchParams()
  const status = params.get('sstatus') || ''
  const page = Math.max(1, Number(params.get('spage') || 1) || 1)
  const pageSize = Math.max(1, Number(params.get('sps') || DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE)
  const sessionId = params.get('session') || ''

  const list = useSessionList(appId, status, page, pageSize)

  const setQuery = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const columns = useMemo<DataColumn<SessionRow>[]>(() => [
    {
      key: 'session_id',
      title: 'session',
      alwaysVisible: true,
      ellipsis: true,
      render: (_: unknown, row) => (
        <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>{row.session_id}</span>
      ),
    },
    { key: 'case_id', title: '用例', dataIndex: 'case_id', width: 140, ellipsis: true, render: (v: string) => v || '—' },
    {
      key: 'status',
      title: '状态',
      width: 100,
      render: (_: unknown, row) => <StatusPill status={toStatusKind(row.status)}>{row.status || '—'}</StatusPill>,
    },
    { key: 'event_count', title: '事件', dataIndex: 'event_count', width: 72, render: (v: number) => v ?? '—' },
    { key: 'started_at', title: '开始', dataIndex: 'started_at', width: 168, ellipsis: true, render: (v: string) => v || '—' },
    {
      key: 'summary',
      title: '摘要',
      ellipsis: true,
      render: (_: unknown, row) => {
        const text = String(row.summary || '')
        return text.length > 80 ? `${text.slice(0, 80)}…` : (text || '—')
      },
    },
  ], [])

  if (sessionId) {
    return (
      <div className="flex h-full min-h-0 flex-col" style={{ gap: 10 }}>
        <div className="shrink-0">
          <Button size="small" onClick={() => setQuery({ session: '' })}>返回列表</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SessionDetail sessionId={sessionId} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DataTable<SessionRow>
        viewId="testing.sessions"
        fill
        columns={columns}
        dataSource={list.data?.items}
        rowKey="session_id"
        loading={list.isLoading}
        error={list.isError ? list.error : undefined}
        emptyTitle="还没有 session"
        emptyHint="下发用例之后，每次执行会在这里留下一条记录。点一行查看回合和事件。"
        onRowClick={(row) => setQuery({ session: row.session_id })}
        toolbar={(
          <div className="flex items-center gap-2">
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
