import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { DataTable, EmptyState, PageHeader, Segmented, Skeleton, StatusPill, errText, type DataColumn } from '@/ui'
import { getCaseResourceCatalog, getTransitionRules, type ResourceKeyEntry, type TransitionRule } from '@/api/adminCatalog'
import { unwrapOne } from '@/lib/unwrap'

const LAYER: Record<string, string> = {
  precondition: '前置',
  operation: '操作',
  expected: '预期',
  generic: '通用',
}

/**
 * 事件目录和转移规则放在同一页，数据仍然分开。
 * 目录回答「这句话能编译成什么」，规则回答「触发之后资源怎么变」。
 */
export function CaseResourcePage() {
  const [params, setParams] = useSearchParams()
  const zone = params.get('zone') === 'rules' ? 'rules' : 'keys'
  const keys = useQuery({
    queryKey: ['admin', 'case-resource-key'],
    queryFn: async () => unwrapOne<{ entries?: ResourceKeyEntry[] }>(await getCaseResourceCatalog()) || {},
  })
  const rules = useQuery({
    queryKey: ['admin', 'transition-rules'],
    queryFn: async () => unwrapOne<{ rules?: TransitionRule[] }>(await getTransitionRules()) || {},
  })

  const entries = useMemo(() => {
    const rows = keys.data?.entries || []
    return [...rows].sort((a, b) => String(a.key_layer).localeCompare(String(b.key_layer)) || String(a.key_ref).localeCompare(String(b.key_ref)))
  }, [keys.data])
  const [picked, setPicked] = useState('')
  const current = entries.find((row) => row.key_ref === picked) || entries[0]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="用例资源"
        subtitle="上面是编译用的事件目录。下面是跑批时资源怎么变。两条记录不会写进同一张表。"
        extra={(
          <Segmented
            size="small"
            value={zone}
            onChange={(value) => {
              const next = new URLSearchParams(params)
              next.set('zone', String(value))
              setParams(next, { replace: true })
            }}
            options={[{ value: 'keys', label: '事件目录' }, { value: 'rules', label: '转移规则' }]}
          />
        )}
      />
      {zone === 'keys' ? (
        keys.isLoading ? <Skeleton active paragraph={{ rows: 8 }} title={false} />
          : keys.isError ? <EmptyState title="读取事件目录失败" hint={errText(keys.error, '确认 Nexus 可达。')} />
            : (
              <div className="grid min-h-0 flex-1" style={{ gridTemplateColumns: 'minmax(280px, 1.1fr) minmax(240px, 0.9fr)', gap: 12 }}>
                <DataTable<ResourceKeyEntry>
                  viewId="admin.case-resource.keys"
                  fill
                  rowKey={(row) => row.key_ref || row.write_category || ''}
                  dataSource={entries}
                  columns={keyColumns}
                  onRowClick={(row) => setPicked(row.key_ref || '')}
                  emptyTitle="目录是空的"
                />
                <aside style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', padding: 16, overflow: 'auto' }}>
                  {current ? <KeyDetail row={current} /> : <EmptyState title="选一条事件" />}
                </aside>
              </div>
            )
      ) : (
        rules.isLoading ? <Skeleton active paragraph={{ rows: 8 }} title={false} />
          : rules.isError ? <EmptyState title="读取转移规则失败" hint={errText(rules.error, '确认 Nexus 可达。')} />
            : (
              <DataTable<TransitionRule>
                viewId="admin.case-resource.rules"
                fill
                rowKey={(row) => row.rule_id}
                dataSource={rules.data?.rules || []}
                columns={ruleColumns}
                emptyTitle="还没有转移规则"
                emptyHint="规则描述触发之后账号、设备、验证码怎样变化，不是事件本身的定义。"
              />
            )
      )}
    </div>
  )
}

function KeyDetail({ row }: { row: ResourceKeyEntry }) {
  return (
    <div className="flex flex-col" style={{ gap: 10 }}>
      <strong style={{ fontSize: 16 }}>{row.event_name || row.write_category || row.key_ref}</strong>
      <span className="w-mono" style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{row.key_ref || '无 key_ref'}</span>
      <p style={{ margin: 0, color: 'var(--w-text-secondary)' }}>
        {LAYER[row.key_layer || ''] || row.key_layer || '未分层'}
        {row.kind ? ` · ${row.kind}` : ''}
        {row.block_id ? ` · 块 ${row.block_id}` : ''}
      </p>
      <p style={{ margin: 0, color: 'var(--w-text-tertiary)', fontSize: 12 }}>
        端 {(row.platforms || []).join('、') || '不限'}
        {' · '}
        路线 {(row.schemes || []).join('、') || '未声明'}
      </p>
      {(row.write_examples || []).length ? (
        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--w-text-secondary)' }}>
          {(row.write_examples || []).slice(0, 6).map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : <p style={{ margin: 0, color: 'var(--w-text-quaternary)' }}>这条没有句式示例。</p>}
    </div>
  )
}

const keyColumns: DataColumn<ResourceKeyEntry>[] = [
  {
    key: 'layer',
    title: '层',
    width: 72,
    render: (_: unknown, row) => LAYER[row.key_layer || ''] || row.key_layer || '通用',
  },
  {
    key: 'name',
    title: '事件',
    alwaysVisible: true,
    render: (_: unknown, row) => (
      <div className="min-w-0">
        <div className="truncate" style={{ fontWeight: 650 }}>{row.event_name || row.write_category || row.key_ref}</div>
        <div className="w-mono truncate" style={{ color: 'var(--w-text-quaternary)', fontSize: 11 }}>{row.key_ref}</div>
      </div>
    ),
  },
]

const ruleColumns: DataColumn<TransitionRule>[] = [
  { key: 'label', title: '规则', alwaysVisible: true, render: (_: unknown, row) => <strong style={{ fontWeight: 650 }}>{row.label || row.rule_id}</strong> },
  { key: 'trigger', title: '触发', width: 180, render: (_: unknown, row) => <span className="w-mono">{row.trigger_id || '无'}</span> },
  { key: 'platform', title: '端', width: 100, render: (_: unknown, row) => row.platform || '不限' },
  {
    key: 'enabled',
    title: '启用',
    width: 88,
    render: (_: unknown, row) => <StatusPill status={row.enabled ? 'pass' : 'muted'}>{row.enabled ? '启用' : '停用'}</StatusPill>,
  },
  {
    key: 'effects',
    title: '效果',
    render: (_: unknown, row) => {
      const n = Array.isArray(row.effects) ? row.effects.length : 0
      return n ? `${n} 项` : '无'
    },
  },
]
