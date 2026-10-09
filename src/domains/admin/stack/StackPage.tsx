import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Skeleton, errText, type DataColumn } from '@/ui'
import { getStack, type StackRole, type StackTrigger } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 编排只展示当前绑定：角色挂了哪些技能，触发器有哪些意图。改绑定仍走角色页。 */
export function StackPage() {
  const query = useQuery({
    queryKey: ['admin', 'stack'],
    queryFn: async () => unwrapOne<{ roles?: StackRole[]; triggers?: StackTrigger[] }>(await getStack()) || {},
  })

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) return <EmptyState title="读取编排失败" hint={errText(query.error, '确认 Nexus 可达。')} />

  const roles = query.data?.roles || []
  const triggers = query.data?.triggers || []

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 16 }}>
      <PageHeader title="编排" subtitle="当前角色和技能的绑定，以及触发器。提示词在角色页修改。" />
      <section className="min-h-0 flex-1">
        <h2 style={heading}>角色绑定</h2>
        <DataTable<StackRole>
          viewId="admin.stack.roles"
          rowKey={(row) => row.id}
          dataSource={roles}
          columns={roleColumns}
          emptyTitle="没有角色绑定"
        />
      </section>
      <section>
        <h2 style={heading}>触发器</h2>
        <DataTable<StackTrigger>
          viewId="admin.stack.triggers"
          rowKey={(row) => row.id}
          dataSource={triggers}
          columns={triggerColumns}
          emptyTitle="没有触发器"
        />
      </section>
    </div>
  )
}

const heading = { margin: '0 0 8px', fontSize: 14, fontWeight: 750 } as const

const roleColumns: DataColumn<StackRole>[] = [
  { key: 'label', title: '角色', alwaysVisible: true, render: (_: unknown, row) => <strong style={{ fontWeight: 650 }}>{row.label || row.id}</strong> },
  { key: 'id', title: 'ID', width: 180, render: (_: unknown, row) => <span className="w-mono">{row.id}</span> },
  { key: 'skills', title: '技能', render: (_: unknown, row) => (row.skill_ids || []).join('、') || '无' },
]

const triggerColumns: DataColumn<StackTrigger>[] = [
  { key: 'label', title: '触发器', alwaysVisible: true, render: (_: unknown, row) => <strong style={{ fontWeight: 650 }}>{row.label || row.id}</strong> },
  { key: 'id', title: 'ID', width: 180, render: (_: unknown, row) => <span className="w-mono">{row.id}</span> },
  { key: 'intents', title: '意图', render: (_: unknown, row) => (row.intents || []).join('、') || '无' },
]
