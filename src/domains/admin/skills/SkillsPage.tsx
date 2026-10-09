import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { listSkills, type SkillRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 技能列表。这一版只读目录，编辑留到接口字段稳定之后。 */
export function SkillsPage() {
  const query = useQuery({
    queryKey: ['admin', 'skills'],
    queryFn: async () => unwrapOne<{ skills?: SkillRow[] }>(await listSkills()) || {},
  })
  const rows = query.data?.skills || []

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) return <EmptyState title="读取技能失败" hint={errText(query.error, '确认 Nexus 可达。')} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="技能" subtitle="执行时可以调用的技能目录" count={`${rows.length} 条`} />
      <DataTable<SkillRow>
        viewId="admin.skills"
        fill
        rowKey={(row) => row.id}
        dataSource={rows}
        columns={columns}
        emptyTitle="还没有技能"
      />
    </div>
  )
}

const columns: DataColumn<SkillRow>[] = [
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
  {
    key: 'description',
    title: '说明',
    ellipsis: true,
    render: (_: unknown, row) => row.description || '无',
  },
  {
    key: 'enabled',
    title: '状态',
    width: 88,
    render: (_: unknown, row) => {
      if (row.enabled == null) return <span style={{ color: 'var(--w-text-quaternary)' }}>未声明</span>
      return <StatusPill status={row.enabled ? 'pass' : 'muted'}>{row.enabled ? '启用' : '停用'}</StatusPill>
    },
  },
]
