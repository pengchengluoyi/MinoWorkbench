import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { getJobsHealth, listJobs, type JobRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** Jobs 目录。健康检查只说明模板能不能渲染，不在这里改提示词。 */
export function JobsPage() {
  const jobs = useQuery({
    queryKey: ['admin', 'jobs'],
    queryFn: async () => unwrapOne<{ jobs?: JobRow[] }>(await listJobs()) || {},
  })
  const health = useQuery({
    queryKey: ['admin', 'jobs', 'health'],
    queryFn: async () => unwrapOne<{ ok?: number; broken?: { id: string; error: string }[] }>(await getJobsHealth()) || {},
  })
  const rows = jobs.data?.jobs || []
  const broken = health.data?.broken || []

  if (jobs.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (jobs.isError) return <EmptyState title="读取 Jobs 失败" hint={errText(jobs.error, '确认 Nexus 可达。')} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Jobs"
        subtitle={broken.length ? `${broken.length} 个启用中的 Job 渲染失败` : '模型任务模板。启用的条目会参与健康检查'}
        count={health.data?.ok != null ? `可用 ${health.data.ok}` : `${rows.length} 条`}
      />
      <DataTable<JobRow>
        viewId="admin.jobs"
        fill
        rowKey={(row) => row.id}
        dataSource={rows}
        columns={columns}
        emptyTitle="还没有 Job"
      />
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
  { key: 'role', title: '角色', width: 140, render: (_: unknown, row) => <span className="w-mono">{row.role_id || '无'}</span> },
  {
    key: 'enabled',
    title: '状态',
    width: 88,
    render: (_: unknown, row) => <StatusPill status={row.enabled === false ? 'muted' : 'pass'}>{row.enabled === false ? '停用' : '启用'}</StatusPill>,
  },
]
