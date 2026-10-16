import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Input, Button } from 'antd'
import { RefreshCw, Search } from 'lucide-react'
import { useUrlState } from '@/hooks/useUrlState'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { redactedText } from '@/lib/redact'

export function useCatalogSearch<T extends object>(rows: T[]) {
  const [search, setSearch] = useUrlState<string>('q', '')
  const query = useDebouncedValue(search.trim().toLowerCase(), 180)
  const filtered = useMemo(() => query ? rows.filter(row => redactedText(row).toLowerCase().includes(query)) : rows, [rows, query])
  return { search, setSearch, rows: filtered, total: rows.length }
}

export function CatalogToolbar({ search, setSearch, count, total, refreshing, onRefresh }: {
  search: string; setSearch: (value: string) => void; count: number; total: number; refreshing: boolean; onRefresh: () => void
}) {
  return <div className="flex shrink-0 flex-wrap items-center gap-3" style={{ marginBottom: 12 }}>
    <Input prefix={<Search size={14} />} allowClear aria-label="搜索当前目录" placeholder="搜索名称、编号和已返回的说明" value={search} onChange={event => setSearch(event.target.value)} style={{ maxWidth: 360 }} />
    <span style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>匹配 {count} / 当前目录 {total} 条</span>
    <Button icon={<RefreshCw size={14} />} loading={refreshing} onClick={onRefresh}>刷新目录</Button>
  </div>
}

export function CatalogReferences({ row }: { row: object }) {
  const data = row as Record<string, unknown>
  const definitions = [
    { fields: ['role_id', 'role_ids'], label: '角色', path: '/roles', query: 'role' },
    { fields: ['skill_id', 'skill_ids'], label: '技能', path: '/skills', query: 'skill' },
    { fields: ['block_id', 'block_ids'], label: '逻辑块', path: '/flow-blocks', query: 'block' },
    { fields: ['job_id', 'job_ids'], label: '任务模板', path: '/jobs', query: 'job' },
  ]
  const links = definitions.flatMap(definition => [...new Set(definition.fields.flatMap(field => {
    const raw = data[field]
    return (Array.isArray(raw) ? raw : [raw]).filter((value): value is string => typeof value === 'string' && !!value.trim())
  }))].map(id => ({ ...definition, id })))
  return <div style={{ padding: '10px 0', lineHeight: 1.8 }}><strong>关联目录</strong>
    {links.length ? <div className="flex flex-wrap gap-3">{links.map(link => <Link key={`${link.path}:${link.id}`} to={`${link.path}?${link.query}=${encodeURIComponent(link.id)}`}>{link.label} · {link.id}</Link>)}</div> : <p style={{ margin: '4px 0', color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)' }}>当前记录未返回可定位的目录引用，未推断关联关系。</p>}
  </div>
}
