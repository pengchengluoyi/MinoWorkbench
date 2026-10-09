import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Segmented, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { listPacks, type PackRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 扩展包目录。按种类筛选，不在这里改包内容。 */
export function PacksPage() {
  const query = useQuery({
    queryKey: ['admin', 'packs'],
    queryFn: async () => unwrapOne<{ items?: PackRow[]; counts?: Record<string, number> }>(await listPacks()) || {},
  })
  const [kind, setKind] = useState('all')
  const kinds = useMemo(() => Object.keys(query.data?.counts || {}), [query.data])
  const rows = (query.data?.items || []).filter((row) => kind === 'all' || row.kind === kind)

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) return <EmptyState title="读取扩展包失败" hint={errText(query.error, '确认 Nexus 可达。')} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="扩展包"
        subtitle="按种类查看已登记的能力包。停用和草稿只在这里辨认，不在这页改内容。"
        count={`${rows.length} 条`}
        extra={kinds.length ? (
          <Segmented
            size="small"
            value={kind}
            onChange={(value) => setKind(String(value))}
            options={[{ value: 'all', label: '全部' }, ...kinds.map((item) => ({ value: item, label: item }))]}
          />
        ) : null}
      />
      <DataTable<PackRow>
        viewId="admin.packs"
        fill
        rowKey={(row) => row.uid || `${row.kind}-${row.id}`}
        dataSource={rows}
        columns={columns}
        emptyTitle="这个种类下没有扩展包"
      />
    </div>
  )
}

const columns: DataColumn<PackRow>[] = [
  {
    key: 'title',
    title: '名称',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.title || row.display_name || row.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.id}</div>
      </div>
    ),
  },
  { key: 'kind', title: '种类', width: 120, render: (_: unknown, row) => row.kind || '无' },
  { key: 'lifecycle', title: '生命周期', width: 110, render: (_: unknown, row) => row.lifecycle || '无' },
  {
    key: 'enabled',
    title: '状态',
    width: 88,
    render: (_: unknown, row) => <StatusPill status={row.enabled === false ? 'muted' : 'pass'}>{row.enabled === false ? '停用' : '启用'}</StatusPill>,
  },
  { key: 'platforms', title: '端', width: 140, render: (_: unknown, row) => (row.platforms || []).join('、') || '不限' },
]
