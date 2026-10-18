import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { Button, Select, DataTable, EmptyState, StatusPill, type DataColumn } from '@/ui'
import {
  getDeviceAppSessions, getProjectAccounts, getResourceLogs,
  type AccountRow, type DeviceAppSessionRow, type ResourceLogRow,
} from '@/api/assets'
import { unwrapList } from '@/lib/unwrap'

type Section = 'accounts' | 'logs' | 'device-apps'

/**
 * 测试资源。三段共用一个面板，由 URL 的 section 参数切换
 * （左栏导航已经负责切 section，这里不再重复画一层 tab —— 省一层嵌套和一行高度）。
 */
export function AssetsPanel({ projectId }: { projectId: string }) {
  const [params] = useSearchParams()
  const section = (params.get('section') || 'accounts') as Section

  if (!projectId) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-warn)' }} />}
          title="缺少项目信息"
          hint="测试资源挂在项目下，这个链接里没有 projectId。从项目列表重新进入即可。"
        />
      </Card>
    )
  }

  if (section === 'logs') return <ResourceLogs projectId={projectId} />
  if (section === 'device-apps') return <DeviceApps projectId={projectId} />
  return <Accounts projectId={projectId} />
}

function Accounts({ projectId }: { projectId: string }) {
  const q = useQuery({
    queryKey: ['assets', projectId, 'accounts'],
    queryFn: async () =>
      unwrapList<AccountRow>(await getProjectAccounts(projectId), {
        keys: ['accounts'],
        label: 'GET /project/:id/accounts',
      }),
  })

  const columns = useMemo<DataColumn<AccountRow>[]>(() => [
    {
      key: 'ident',
      title: '账号',
      alwaysVisible: true,
      render: (_: unknown, r) => (
        <div className="min-w-0">
          <div className="truncate" style={{ fontWeight: 650, color: 'var(--w-text)' }}>
            {r.account_ident || r.username || r.email || r.phone || r.account_id || '—'}
          </div>
          {r.display_name && (
            <div className="truncate" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
              {r.display_name}
            </div>
          )}
        </div>
      ),
    },
    { key: 'env', title: '环境', dataIndex: 'env', width: 100, render: (v: string) => v || '—' },
    {
      key: 'state',
      title: '状态',
      width: 150,
      render: (_: unknown, r) => (
        <span className="flex items-center gap-1.5">
          {r.locked === true ? <StatusPill status="warn">占用中</StatusPill> : <StatusPill status="muted">{r.locked === false ? '未占用' : '占用未知'}</StatusPill>}
          <StatusPill status="muted">{r.registered === true ? '已登记' : r.registered === false ? '未登记' : '登记未知'}</StatusPill>
        </span>
      ),
    },
    { key: 'phone', title: '手机号', dataIndex: 'phone', width: 130, render: (v: string) => v || '—' },
    { key: 'email', title: '邮箱', dataIndex: 'email', ellipsis: true, render: (v: string) => v || '—' },
    { key: 'session', title: '会话', width: 140, render: (_: unknown, r) => r.session_display || '—' },
    { key: 'note', title: '备注', dataIndex: 'note', ellipsis: true, render: (v: string) => v || '—' },
  ], [])

  return (
    <DataTable<AccountRow>
      viewId="assets.accounts"
      columns={columns}
      dataSource={q.data ? withDisplayKeys(q.data) : undefined}
      rowKey={r => String(r.__viewKey)}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      onRetry={() => void q.refetch()}
      fill
      emptyTitle="这个项目还没有测试账号"
      emptyHint="当前页面仅查看服务端账号目录；账号补齐需通过项目现有资源管理流程，Workbench 尚未提供登记或分配接口。"
    />
  )
}

function ResourceLogs({ projectId }: { projectId: string }) {
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['assets', projectId, 'logs', page],
    queryFn: async () => {
      const response = await getResourceLogs(projectId, { page, page_size: 50 })
      return { items: unwrapList<ResourceLogRow>(response, { keys: ['logs'], label: '资源日志' }), total: response.data?.total }
    },
  })

  const columns = useMemo<DataColumn<ResourceLogRow>[]>(() => [
    {
      key: 'time',
      title: '时间',
      width: 170,
      alwaysVisible: true,
      render: (_: unknown, r) => (
        <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
          {r.created_at || '—'}
        </span>
      ),
    },
    { key: 'action', title: '动作', dataIndex: 'action', width: 130, render: (v: string) => <strong style={{ fontWeight: 650 }}>{v || '—'}</strong> },
    { key: 'ident', title: '账号', dataIndex: 'account_ident', width: 180, render: (v: string) => v || '—' },
    { key: 'detail', title: '说明', dataIndex: 'detail', ellipsis: true, render: (_: unknown, r) => r.detail || r.reason || '—' },
    { key: 'case', title: '用例', dataIndex: 'case_id', width: 140, render: (v: string) => v || '—' },
  ], [])

  return (
    <DataTable<ResourceLogRow>
      viewId="assets.logs"
      toolbar={<><span>服务端第 {page} 页，每页最多 50 条{q.data?.total != null ? ` · 共 ${q.data.total} 条` : ' · 总量未返回'}</span><Button disabled={page === 1 || q.isFetching} onClick={() => setPage(prev => prev - 1)}>上一页</Button><Button disabled={q.isFetching || (q.data?.items.length || 0) < 50} onClick={() => setPage(prev => prev + 1)}>下一页</Button></>}
      columns={columns}
      dataSource={q.data?.items ? withDisplayKeys(q.data.items) : undefined}
      rowKey={r => String(r.__viewKey)}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      onRetry={() => void q.refetch()}
      fill
      emptyTitle="还没有资源日志"
      emptyHint="账号的分配、归还、转移会记录在这里。"
    />
  )
}

function DeviceApps({ projectId }: { projectId: string }) {
  const [limit, setLimit] = useState(200)
  const q = useQuery({
    queryKey: ['assets', projectId, 'device-apps', limit],
    queryFn: async () =>
      unwrapList<DeviceAppSessionRow>(await getDeviceAppSessions(projectId, limit), {
        keys: ['sessions'],
        label: 'GET /project/:id/device-app-sessions',
      }),
  })

  const columns = useMemo<DataColumn<DeviceAppSessionRow>[]>(() => [
    {
      key: 'sn',
      title: '设备',
      width: 180,
      alwaysVisible: true,
      render: (_: unknown, r) => (
        <span className="w-mono" style={{ fontWeight: 650, fontSize: 'var(--w-font-sm)' }}>{r.sn || '—'}</span>
      ),
    },
    { key: 'pkg', title: '包名', dataIndex: 'package_id', ellipsis: true, render: (v: string) => <span className="w-mono">{v || '—'}</span> },
    { key: 'ver', title: '版本', width: 130, render: (_: unknown, r) => r.app_version_display || r.app_version || '—' },
    { key: 'session', title: '当时观察的身份', width: 190, render: (_: unknown, r) => r.session_display || '身份未返回' },
    {
      key: 'time',
      title: '观测时间',
      width: 170,
      render: (_: unknown, r) => (
        <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
          {r.created_at || '—'}
        </span>
      ),
    },
    { key: 'note', title: '机态备注', dataIndex: 'note', ellipsis: true, render: (v: string) => v || '—' },
  ], [])

  return (
    <DataTable<DeviceAppSessionRow>
      viewId="assets.deviceApps"
      toolbar={<><span>历史机态观察 · 最近最多 {limit} 条，不能代表当前登录或准入状态</span><Select aria-label="机态窗口" value={limit} onChange={setLimit} options={[200, 500, 1000].map(value => ({ value, label: `最近 ${value} 条` }))} /></>}
      columns={columns}
      dataSource={q.data ? withDisplayKeys(q.data) : undefined}
      rowKey={r => String(r.__viewKey)}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      onRetry={() => void q.refetch()}
      fill
      emptyTitle="还没有机态记录"
      emptyHint="执行时观察到的「设备上装了哪个版本、登的哪个账号」会记录在这里。"
    />
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}

function stableRowKey(row: object) { return JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))) }

function withDisplayKeys<T extends object>(rows: T[]): (T & { __viewKey: string })[] { const seen = new Map<string, number>(); return rows.map(row => { const id = String((row as Record<string, unknown>).account_id || (row as Record<string, unknown>).id || stableRowKey(row)); const occurrence = seen.get(id) || 0; seen.set(id, occurrence + 1); return { ...row, __viewKey: `${id}:${occurrence}` } }) }
