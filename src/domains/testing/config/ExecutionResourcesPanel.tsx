import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

type Domain = { domain_id: string; name: string; env: string; app_id: string; account_ids: string[]; enabled: boolean }
type Lease = { resource_key: string; run_id: string; attempt_id: string; epoch: number; expires_at: number; state: string }
export function ExecutionResourcesPanel({ projectId }: { projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  return <Resources key={`${owner}:${projectId}`} projectId={projectId} owner={owner} />
}
function Resources({ projectId, owner }: { projectId: string; owner: string }) {
  const base = `/project/${encodeURIComponent(projectId)}/execution-resources`
  const query = useQuery({ queryKey: ['execution-resources', owner, projectId], enabled: !!owner,
    queryFn: async () => unwrapOne<{ domains: Domain[]; leases: Lease[] }>(await request({ url: base, method: 'get' })) })
  const [editing, setEditing] = useState<Domain>({ domain_id: 'new', name: '', env: 'test', app_id: '', account_ids: [], enabled: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async () => {
    setBusy(true); setError('')
    const { domain_id, ...body } = editing
    try { await request({ url: `${base}/domains/${encodeURIComponent(domain_id)}`, method: 'put', data: body }); await query.refetch()
      setEditing({ domain_id: 'new', name: '', env: 'test', app_id: '', account_ids: [], enabled: true })
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return <section aria-label="执行资源" style={{ padding: 16, overflow: 'auto' }}><h2>执行资源与共享数据域</h2>
    <p>共享数据域由维护者明确声明。相同数据域的执行互斥，设备、账号和数据域在同一事务领取。租约到期不代表动作已停止，隔离资源须完成停止与复位核验后才可释放。</p>
    <Button onClick={() => void query.refetch()}>刷新资源状态</Button>
    {query.isPending && <p role="status">正在读取资源</p>}{(query.error || error) && <p role="alert">{error || errText(query.error)}</p>}
    {!query.isPending && !query.error && !query.data?.leases.length && <p>当前账号没有持有或隔离的组合租约。</p>}
    {query.data?.leases.map(row => <p key={row.resource_key}>{row.resource_key} · {row.state === 'isolated' ? '隔离' : '持有'} · 任务 {row.run_id} · epoch {row.epoch} · 到期 {new Date(row.expires_at * 1000).toLocaleString()}</p>)}
    {query.data?.domains.map(row => <p key={row.domain_id}>{row.name} · {row.env} · {row.enabled ? '启用' : '停用'} <Button onClick={() => setEditing({ ...row, enabled: !!row.enabled })}>编辑数据域</Button></p>)}
    <form onSubmit={event => { event.preventDefault(); void save() }} style={{ display: 'grid', gap: 8, maxWidth: 650 }}>
      <label>数据域名称 <input required maxLength={100} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></label>
      <label>运行环境 <input required value={editing.env} onChange={e => setEditing({ ...editing, env: e.target.value })} /></label>
      <label>应用编号（留空覆盖项目所有应用） <input value={editing.app_id} onChange={e => setEditing({ ...editing, app_id: e.target.value })} /></label>
      <label>账号编号（逗号分隔，留空覆盖该环境所有账号） <input value={editing.account_ids.join(',')} onChange={e => setEditing({ ...editing, account_ids: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>
      <label><input type="checkbox" checked={editing.enabled} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} />启用互斥</label>
      <Button htmlType="submit" disabled={busy}>保存数据域</Button>
    </form>
  </section>
}
