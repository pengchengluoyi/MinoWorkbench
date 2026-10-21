import { catalogData } from '@/lib/catalogData'
import { useUrlState } from '@/hooks/useUrlState'
import { CatalogReferences, CatalogToolbar, useCatalogSearch } from '@/ui/CatalogBrowser'
import { useQuery } from '@tanstack/react-query'
import { Button, DataTable, EmptyState, PageHeader, Skeleton, errText, type DataColumn } from '@/ui'
import { getRole, listRoles, type RoleRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 角色列表。提示词在仓库里改，这里只读。 */
export function RolesPage() {
  const roles = useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: async () => catalogData(unwrapOne<{ roles?: RoleRow[] }>(await listRoles()), 'roles', '提示词角色'),
  })
  const rows = roles.data?.roles || []
  const browser = useCatalogSearch(rows)
  const [picked, setPicked] = useUrlState<string>('role', '')
  const id = picked || rows[0]?.id || ''
  const detail = useQuery({
    queryKey: ['admin', 'roles', id],
    enabled: !!id,
    queryFn: async () => unwrapOne<RoleRow>(await getRole(id)),
  })

  if (roles.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (roles.isError && !roles.data) return <EmptyState title="读取角色失败" hint={errText(roles.error, '确认 Nexus 可达。')} action={<Button onClick={() => void roles.refetch()}>重试读取</Button>} />

  const row = detail.data
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="模型提示词角色" subtitle="提示词在仓库的 prompts/roles 里维护，这里只读。" count={`${rows.length} 个`} />
      <CatalogToolbar {...browser} count={browser.rows.length} refreshing={roles.isFetching} onRefresh={() => { void roles.refetch(); if (id) void detail.refetch() }} />
      <div className="w-catalog-layout grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(280px, 0.9fr) minmax(320px, 1.1fr)', gap: 12 }}>
        <DataTable<RoleRow>
          viewId="admin.roles"
          fill
          rowKey={(item) => item.id}
          dataSource={browser.rows}
          error={roles.isError ? roles.error : undefined}
          onRetry={() => void roles.refetch()}
          columns={columns}
          activeRowKey={id}
          onRowClick={(item) => setPicked(item.id)}
          emptyTitle="还没有角色"
        />
        <section className="flex min-h-0 flex-col" style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', padding: 16, gap: 10 }}>
          {!id ? <EmptyState title="选一个角色" /> : detail.isLoading ? <Skeleton active paragraph={{ rows: 6 }} title={false} /> : detail.isError ? <EmptyState title="角色详情读取失败" hint={errText(detail.error)} action={<Button size="small" onClick={() => void detail.refetch()}>重试</Button>} /> : (
            <>
              <strong>{row?.label || id}</strong>
              <span className="w-mono" style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>
                {row?.sha ? row.sha.slice(0, 7) : ''}
              </span>
              <span className="w-mono" style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{row?.source_path || id}</span>
              {row ? <CatalogReferences row={row} /> : null}
              <pre className="min-h-0 flex-1 overflow-auto" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>{row?.system_prompt || '无'}</pre>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

const columns: DataColumn<RoleRow>[] = [
  {
    key: 'label',
    title: '角色',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.label || row.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.id}</div>
      </div>
    ),
  },
  {
    key: 'skills',
    title: '技能',
    width: 80,
    render: (_: unknown, row) => String(row.skill_ids?.length || 0),
  },
]
