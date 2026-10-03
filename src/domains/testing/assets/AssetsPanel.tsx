import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { DataTable, EmptyState, StatusPill, type DataColumn } from '@/ui'
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
export function AssetsPanel() {
  const [params] = useSearchParams()
  const projectId = params.get('projectId') || ''
  const section = (params.get('section') || 'accounts') as Section

  if (!projectId) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-warn)' }} />}
          title="缺少项目信息"
          hint="测试资源挂在项目下，这个链接里没有 projectId。从应用列表重新进入即可。"
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
          {r.locked ? <StatusPill status="warn">占用中</StatusPill> : <StatusPill status="pass">可用</StatusPill>}
          {r.registered === false && <StatusPill status="muted">未登记</StatusPill>}
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
      dataSource={q.data}
      rowKey={(r) => String(r.account_id || r.account_ident || r.username || Math.random())}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      scrollY="calc(100vh - 230px)"
      emptyTitle="这个项目还没有测试账号"
      emptyHint="账号可以从号池模板分配，或手工登记。"
    />
  )
}

function ResourceLogs({ projectId }: { projectId: string }) {
  const q = useQuery({
    queryKey: ['assets', projectId, 'logs'],
    queryFn: async () =>
      unwrapList<ResourceLogRow>(await getResourceLogs(projectId), {
        keys: ['logs'],
        label: 'GET /project/:id/resource-allocation-logs',
      }),
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
      columns={columns}
      dataSource={q.data}
      rowKey={(r) => String(r.id || `${r.created_at}-${r.action}`)}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      scrollY="calc(100vh - 230px)"
      emptyTitle="还没有资源日志"
      emptyHint="账号的分配、归还、转移会记录在这里。"
    />
  )
}

function DeviceApps({ projectId }: { projectId: string }) {
  const q = useQuery({
    queryKey: ['assets', projectId, 'device-apps'],
    queryFn: async () =>
      unwrapList<DeviceAppSessionRow>(await getDeviceAppSessions(projectId), {
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
    { key: 'session', title: '绑定账号', width: 190, render: (_: unknown, r) => r.session_display || r.session_id || '—' },
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
      columns={columns}
      dataSource={q.data}
      rowKey={(r) => String(`${r.sn}-${r.package_id}-${r.created_at}`)}
      loading={q.isLoading}
      error={q.isError ? q.error : undefined}
      scrollY="calc(100vh - 230px)"
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
