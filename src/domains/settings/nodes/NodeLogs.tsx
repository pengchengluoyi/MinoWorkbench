import { useEffect, useState } from 'react'
import { Button, Input, Select, Segmented, Skeleton, errText } from '@/ui'
import { useNodeLogs } from './queries'
export function NodeLogs({ nodeId, embedded = false }: { nodeId: string; embedded?: boolean }) {
 const [lines, setLines] = useState(200), [open, setOpen] = useState(embedded)
 const [search, setSearch] = useState(''), [level, setLevel] = useState('all'), [follow, setFollow] = useState(false)
 const logs = useNodeLogs(nodeId, lines, open)
 const { refetch, isFetching } = logs
 useEffect(() => { if (!open || !follow) return; const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !isFetching) void refetch() }, 5000); return () => window.clearInterval(timer) }, [open, follow, refetch, isFetching])
 const shown = (logs.data || []).filter(line => (!search || line.toLowerCase().includes(search.toLowerCase())) && (level === 'all' || new RegExp(`\\b${level}\\b`, 'i').test(line)))
 if (!open) return <Button onClick={() => setOpen(true)}>查看日志</Button>
 return <section className="flex flex-col" style={{ gap: 10, minHeight: 0 }}><div className="flex flex-wrap gap-2 items-center"><Segmented value={String(lines)} onChange={value => setLines(Number(value))} options={['100','200','1000'].map(value => ({value,label:`最近 ${value} 行`}))} /><Input aria-label="节点日志关键词" placeholder="仅检索已加载窗口" value={search} onChange={event => setSearch(event.target.value)} style={{ width: 230 }} /><Select aria-label="节点日志级别" value={level} onChange={setLevel} options={['all','error','warn','info','debug'].map(value => ({ value, label: value === 'all' ? '全部级别' : value }))} /><Button loading={isFetching} onClick={() => void refetch()}>刷新</Button><Button aria-pressed={follow} onClick={() => setFollow(!follow)}>{follow ? '暂停自动读取' : '每 5 秒读取'}</Button>{!embedded && <Button onClick={() => setOpen(false)}>关闭</Button>}</div><p style={{ margin: 0, color: 'var(--w-text-tertiary)' }}>节点尾部窗口，已加载 {(logs.data || []).length} 行，匹配 {shown.length} 行；不代表全部历史。{logs.dataUpdatedAt ? ` 上次读取 ${new Date(logs.dataUpdatedAt).toLocaleTimeString()}` : ''}</p>{logs.isError && <p role="alert">{errText(logs.error, '节点日志读取失败')}，保留上次读取窗口。<Button onClick={() => void refetch()}>重试</Button></p>}{logs.isLoading ? <Skeleton active /> : <pre className="w-read-detail" style={{ margin: 0, maxHeight: 440, overflow: 'auto', padding: 12, background: 'var(--w-surface-subtle)', borderRadius: 10 }}>{shown.join('\n') || '当前窗口没有匹配日志。'}</pre>}</section>
}
