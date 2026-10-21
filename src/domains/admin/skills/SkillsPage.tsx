import { catalogData } from '@/lib/catalogData'
import { useUrlState } from '@/hooks/useUrlState'
import { CatalogDetail } from '@/ui/CatalogDetail'
import { CatalogToolbar, useCatalogSearch } from '@/ui/CatalogBrowser'
import { useQuery } from '@tanstack/react-query'
import { Button, DataTable, EmptyState, PageHeader, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { listSkills, type SkillRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 技能列表。这一版只读目录，编辑留到接口字段稳定之后。 */
export function SkillsPage() {
  const [selectedId, setSelectedId] = useUrlState<string>('skill', '')
  const query = useQuery({
    queryKey: ['admin', 'skills'],
    queryFn: async () => catalogData(unwrapOne<{ skills?: SkillRow[] }>(await listSkills()), 'skills', '技能目录'),
  })
  const rows = query.data?.skills || []
  const browser = useCatalogSearch(rows)

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError && !query.data) return <EmptyState title="读取技能失败" hint={errText(query.error, '确认 Nexus 可达。')} action={<Button onClick={() => void query.refetch()}>重试读取</Button>} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="技能" subtitle="技能在仓库 prompts/skills 里维护，这里只读。" count={`${rows.length} 条`} />
      <CatalogToolbar {...browser} count={browser.rows.length} refreshing={query.isFetching} onRefresh={() => void query.refetch()} />
      <DataTable<SkillRow>
        viewId="admin.skills"
        fill
        rowKey={(row) => row.id}
        dataSource={browser.rows}
        error={query.isError ? query.error : undefined}
        onRetry={() => void query.refetch()}
        columns={columns}
        activeRowKey={selectedId}
        onRowClick={row => setSelectedId(row.id)}
        emptyTitle="还没有技能"
      />
      <CatalogDetail title="目录详情" openId={selectedId} row={rows.find(row => row.id === selectedId)} onClose={() => setSelectedId('')} />
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
    render: (_: unknown, row) => row.summary || row.description || '无',
  },
  { key: 'path', title: '文件', ellipsis: true, render: (_: unknown, row) => <span className="w-mono">{row.source_path || ''}</span> },
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
