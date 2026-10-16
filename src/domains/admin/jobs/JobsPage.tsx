import { catalogData } from '@/lib/catalogData'
import { useUrlState } from '@/hooks/useUrlState'
import { CatalogDetail } from '@/ui/CatalogDetail'
import { CatalogToolbar, useCatalogSearch } from '@/ui/CatalogBrowser'
import { useQuery } from '@tanstack/react-query'
import { Button, DataTable, EmptyState, PageHeader, Skeleton, EnabledPill, errText, type DataColumn } from '@/ui'
import { getJobsHealth, listJobs, type JobRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** Jobs 目录。健康检查只说明模板能不能渲染，不在这里改提示词。 */
export function JobsPage() {
  const [selectedId, setSelectedId] = useUrlState<string>('job', '')
  const jobs = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: async () => catalogData(unwrapOne<{ jobs?: JobRow[] }>(await listJobs()), 'jobs', '任务模板'),
  })
  const health = useQuery({
    queryKey: ['admin', 'jobs', 'health'],
    queryFn: async () => unwrapOne<{ ok?: number; broken?: { id: string; error: string }[] }>(await getJobsHealth()) || {},
  })
  const rows = jobs.data?.jobs || []
  const browser = useCatalogSearch(rows)
  const broken = health.data?.broken || []

  if (jobs.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (jobs.isError && !jobs.data) return <EmptyState title="读取 Jobs 失败" hint={errText(jobs.error, '确认 Nexus 可达。')} action={<Button onClick={() => void jobs.refetch()}>重试读取</Button>} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Jobs"
        subtitle={broken.length ? `${broken.length} 个启用中的 Job 渲染失败` : '模型任务模板在仓库 prompts/jobs 里维护。这里只读。'}
        count={health.data?.ok != null ? `可用 ${health.data.ok}` : `${rows.length} 条`}
      />
      {health.isPending ? <p role="status" style={{ color: 'var(--w-text-tertiary)' }}>正在检查模板可用性…</p> : health.isError ? <div role="alert" style={{ marginBottom: 12, padding: 12, background: 'var(--w-warn-bg)', borderRadius: 'var(--w-radius-lg)', color: 'var(--w-warn)' }}>模板健康检查失败：{errText(health.error)} <Button size="small" onClick={() => void health.refetch()}>重试检查</Button></div> : broken.length ? <div role="alert" style={{ marginBottom: 12, padding: 12, background: 'var(--w-fail-bg)', borderRadius: 'var(--w-radius-lg)' }}>{broken.map((item) => <div key={item.id}><strong>{item.id}</strong>：{item.error}</div>)}</div> : null}
      <CatalogToolbar {...browser} count={browser.rows.length} refreshing={jobs.isFetching || health.isFetching} onRefresh={() => { void jobs.refetch(); void health.refetch() }} />
      <DataTable<JobRow>
        viewId="admin.jobs"
        fill
        rowKey={(row) => row.id}
        dataSource={browser.rows}
        error={jobs.isError ? jobs.error : undefined}
        onRetry={() => void jobs.refetch()}
        columns={columns}
        activeRowKey={selectedId}
        onRowClick={row => setSelectedId(row.id)}
        emptyTitle="还没有 Job"
      />
      <CatalogDetail title="目录详情" openId={selectedId} row={rows.find(row => row.id === selectedId)} onClose={() => setSelectedId('')} />
    </div>
  )
}

const columns: DataColumn<JobRow>[] = [
  {
    key: 'label',
    title: '名称',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.label || row.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.id}</div>
      </div>
    ),
  },
  { key: 'summary', title: '说明', ellipsis: true, render: (_: unknown, row) => row.summary || '无' },
  { key: 'engine', title: '引擎', width: 120, render: (_: unknown, row) => row.engine || '无' },
  { key: 'version', title: '版本', width: 72, render: (_: unknown, row) => String(row.prompt_version || '') },
  { key: 'sha', title: 'sha', width: 88, render: (_: unknown, row) => <span className="w-mono">{(row.prompt_sha || '').slice(0, 7)}</span> },
  { key: 'path', title: '文件', ellipsis: true, render: (_: unknown, row) => <span className="w-mono">{row.source_path || ''}</span> },
  { key: 'role', title: '角色', width: 140, render: (_: unknown, row) => <span className="w-mono">{row.role_id || '无'}</span> },
  {
    key: 'enabled',
    title: '状态',
    width: 88,
    render: (_: unknown, row) => <EnabledPill enabled={row.enabled} />,
  },
]
