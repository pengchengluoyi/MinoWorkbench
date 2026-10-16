import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Skeleton, errText, type DataColumn } from '@/ui'
import { getStack, type StackRole, type StackTrigger } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 编排只展示当前绑定：角色挂了哪些技能，触发器有哪些意图。此页和角色页均只读，绑定由现有服务端目录维护。 */
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
      <PageHeader title="编排" subtitle="绑定写在 prompts/stack/stack.yaml，这里只读。" />
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
  { key: 'label', title: '角色', alwaysVisible: true, render: (_: unknown, row) => <Link to={`/roles?role=${encodeURIComponent(row.id)}`}>{row.label || row.id}</Link> },
  { key: 'id', title: 'ID', width: 180, render: (_: unknown, row) => <span className="w-mono">{row.id}</span> },
  { key: 'skills', title: '技能', render: (_: unknown, row) => (row.skill_ids || []).map(id => <Link key={id} style={{ marginRight: 8 }} to={`/skills?skill=${encodeURIComponent(id)}`}>{id}</Link>) },
]

const triggerColumns: DataColumn<StackTrigger>[] = [
  { key: 'label', title: '触发器', alwaysVisible: true, render: (_: unknown, row) => <strong>{row.label || row.id}</strong> },
  { key: 'id', title: 'ID', width: 180, render: (_: unknown, row) => <span className="w-mono">{row.id}</span> },
  { key: 'intents', title: '意图', render: (_: unknown, row) => (row.intents || []).join('、') || '无' },
]
