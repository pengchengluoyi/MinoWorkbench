import { Alert, DataTable, Drawer, EmptyState, PageHeader, Skeleton, StatusPill, Tag, type DataColumn } from '@/ui'
import { isAssistantNotReady, type AssistantTool } from '@/api/assistant'
import { useUrlState } from '@/hooks/useUrlState'
import { useAssistantTools } from '@/domains/assistant/queries'
import { QueryProblem } from '@/domains/assistant/AssistantNotReady'
import { CopyButton } from '@/domains/assistant/CopyButton'

const RISK = { read: { kind: 'pass', text: '只读' }, write: { kind: 'warn', text: '写入/执行' } } as const

const columns: DataColumn<AssistantTool>[] = [
  {
    key: 'title', title: '工具', alwaysVisible: true,
    render: (_: unknown, r) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{r.title || r.id}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{r.id}</div>
      </div>
    ),
  },
  { key: 'description', title: '描述', ellipsis: true, render: (_: unknown, r) => r.description || '无' },
  { key: 'risk', title: '档位', width: 100, render: (_: unknown, r) => { const k = RISK[r.risk] || { kind: 'muted', text: r.risk }; return <StatusPill status={k.kind as 'pass' | 'warn' | 'muted'}>{k.text}</StatusPill> } },
  { key: 'surfaces', title: '入口', width: 120, render: (_: unknown, r) => (r.surfaces ?? []).map((s) => <Tag key={s}>{s === 'im' ? 'IM' : 'MCP'}</Tag>) },
  { key: 'route', title: '绑定路由', width: 220, ellipsis: true, render: (_: unknown, r) => <span className="w-mono">{r.route}</span> },
  { key: 'async', title: '异步', width: 70, render: (_: unknown, r) => (r.async ? '是' : '否') },
]

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3" style={{ padding: '6px 0', borderBottom: '1px solid var(--w-border)', fontSize: 'var(--w-font-base)' }}>
      <span style={{ width: 80, flexShrink: 0, color: 'var(--w-text-tertiary)' }}>{k}</span>
      <span className="min-w-0" style={{ wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

/** 助手工具表（只读）。真源在仓库 mino_nexus/prompts/assistant/tools/，这里只展示。 */
export function AssistantToolsPage() {
  const q = useAssistantTools()
  const [openId, setOpenId] = useUrlState<string>('tool', '')
  const rows = q.data
  const cur = rows?.find((t) => t.id === openId)
  const schema = cur ? JSON.stringify(cur.params_schema ?? {}, null, 2) : ''

  if (q.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (q.isError) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <PageHeader title="助手工具" />
        <QueryProblem error={q.error} what="助手工具" onRetry={() => void q.refetch()} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title="助手工具" subtitle="IM 助手与 MCP 共用的白名单工具表" count={`${rows?.length ?? 0} 个`} />
      <Alert type="info" showIcon style={{ marginBottom: 'var(--w-gap)' }} message="工具在仓库里维护（git），此页只读" />
      <DataTable<AssistantTool>
        viewId="admin.assistant-tools"
        fill
        rowKey={(r) => r.id}
        dataSource={rows}
        columns={columns}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle="工具表为空"
        emptyHint="仓库里 mino_nexus/prompts/assistant/tools/ 下还没有启用的工具。"
      />
      <Drawer open={!!openId} onClose={() => setOpenId('')} width={560} title={cur?.title || '工具详情'} destroyOnHidden>
        {cur ? (
          <>
            <Row k="id"><span className="w-mono">{cur.id}</span></Row>
            <Row k="标题">{cur.title}</Row>
            <Row k="描述">{cur.description || '无'}</Row>
            <Row k="档位"><StatusPill status={cur.risk === 'read' ? 'pass' : 'warn'}>{RISK[cur.risk]?.text || cur.risk}</StatusPill></Row>
            <Row k="入口">{(cur.surfaces ?? []).map((s) => <Tag key={s}>{s === 'im' ? 'IM' : 'MCP'}</Tag>)}</Row>
            <Row k="绑定路由"><span className="w-mono">{cur.route}</span></Row>
            <Row k="异步">{cur.async ? '是（先返回受理，结果稍后推送）' : '否'}</Row>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 'var(--w-font-sm)' }}>参数 schema（JSON）</summary>
              <div style={{ margin: '6px 0' }}><CopyButton text={schema} /></div>
              <pre className="w-mono" style={{ margin: 0, padding: 10, overflow: 'auto', maxHeight: '55vh', background: 'var(--w-fill)', borderRadius: 'var(--w-radius-sm)', fontSize: 'var(--w-font-sm)' }}>{schema}</pre>
            </details>
          </>
        ) : (
          <EmptyState title="没有找到这个工具" hint={isAssistantNotReady(q.error) ? undefined : `id「${openId}」不在当前工具表里，可能已被移除。`} />
        )}
      </Drawer>
    </div>
  )
}
