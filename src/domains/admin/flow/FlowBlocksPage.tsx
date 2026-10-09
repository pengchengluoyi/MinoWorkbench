import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable, EmptyState, PageHeader, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { listFlowBlocks, type FlowBlockRow } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

/** 逻辑块和事件目录用同一个 block_id。这里看块有哪些槽。 */
export function FlowBlocksPage() {
  const query = useQuery({
    queryKey: ['admin', 'flow-blocks'],
    queryFn: async () => unwrapOne<{ items?: FlowBlockRow[] }>(await listFlowBlocks()) || {},
  })
  const rows = query.data?.items || []
  const [picked, setPicked] = useState('')
  const current = rows.find((row) => row.id === picked) || rows[0]

  if (query.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) return <EmptyState title="读取逻辑块失败" hint={errText(query.error, '确认 Nexus 可达。')} />

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="FSM 逻辑块" subtitle="登录这类多步动作收成一块。槽位和用例资源里的事件目录对齐。" count={`${rows.length} 块`} />
      <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(280px, 1fr) minmax(240px, 0.8fr)', gap: 12 }}>
        <DataTable<FlowBlockRow>
          viewId="admin.flow-blocks"
          fill
          rowKey={(row) => row.id}
          dataSource={rows}
          columns={columns}
          onRowClick={(row) => setPicked(row.id)}
          emptyTitle="还没有逻辑块"
        />
        <aside style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', padding: 16, overflow: 'auto' }}>
          {current ? (
            <div className="flex flex-col" style={{ gap: 8 }}>
              <strong>{current.name || current.id}</strong>
              <span className="w-mono" style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{current.id}</span>
              {(current.slots || []).length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {(current.slots || []).map((slot) => (
                    <li key={slot.id || slot.name}>{slot.name || slot.id}</li>
                  ))}
                </ul>
              ) : <p style={{ margin: 0, color: 'var(--w-text-quaternary)' }}>这块还没有声明槽位。</p>}
            </div>
          ) : <EmptyState title="选一块" />}
        </aside>
      </div>
    </div>
  )
}

const columns: DataColumn<FlowBlockRow>[] = [
  {
    key: 'name',
    title: '名称',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.name || row.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.id}</div>
      </div>
    ),
  },
  { key: 'slots', title: '槽', width: 72, render: (_: unknown, row) => String(row.slots?.length || 0) },
  {
    key: 'enabled',
    title: '状态',
    width: 88,
    render: (_: unknown, row) => <StatusPill status={row.enabled === false ? 'muted' : 'pass'}>{row.enabled === false ? '停用' : '启用'}</StatusPill>,
  },
]
