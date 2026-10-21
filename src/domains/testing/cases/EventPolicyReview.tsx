import { createUUID } from '@/lib/uuid'
import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/session'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { Button, errText } from '@/ui'

type Policy = { kind: string; id: string; title: string; source_digest: string; candidate: Record<string, unknown>; retired_event: boolean; blockers: { reason_code: string }[] }
function PolicyRow({ row, base, refresh }: { row: Policy; base: string; refresh: () => void }) {
  const [payload, setPayload] = useState(JSON.stringify(row.candidate, null, 2))
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [identity, setIdentity] = useState(() => createUUID())
  const [submitted, setSubmitted] = useState<Record<string, unknown> | null>(null)
  const save = useMutation({ mutationFn: async (action: 'replace' | 'retire') => {
    const data = submitted || { kind: row.kind, entry_id: row.id, source_digest: row.source_digest, request_id: identity, reason, action, replacement: action === 'replace' ? JSON.parse(payload) : {} }
    setSubmitted(data)
    return request({ url: `${base}/migration-apply`, method: 'post', data })
  }, onSuccess: refresh })
  return <li><strong>{row.title || row.id}</strong><p>{row.id} · 全局目录规则</p>
    {row.blockers.map((b, i) => <p key={i}>{b.reason_code}</p>)}
    {!row.retired_event ? <label>审核后的恢复规则（需包含 match、actions、verify）<textarea aria-label={`规则 ${row.id}`} rows={8} style={{ display: 'block', width: '100%' }} disabled={Boolean(submitted)} value={payload} onChange={e => setPayload(e.target.value)} /></label> : <p>此事件已退役，只能归档；业务应迁入用例逻辑块或项目导航。</p>}
    <label>理由<input value={reason} disabled={Boolean(submitted)} onChange={e => setReason(e.target.value)} /></label>
    <label><input type="checkbox" checked={confirmed} disabled={Boolean(submitted)} onChange={e => setConfirmed(e.target.checked)} />确认影响全局目录；原记录保留在审核历史</label>
    {!row.retired_event ? <Button disabled={save.isPending || !reason.trim() || !confirmed || Boolean(submitted && submitted.action !== 'replace')} onClick={() => save.mutate('replace')}>应用审核后的规则</Button> : null}
    <Button disabled={save.isPending || !reason.trim() || !confirmed || Boolean(submitted && submitted.action !== 'retire')} onClick={() => save.mutate('retire')}>停用并归档旧条目</Button>
    {save.error ? <Button disabled={save.isPending} onClick={() => { setSubmitted(null); setConfirmed(false); setIdentity(createUUID()); save.reset(); refresh() }}>重新读取并审核（不自动重试）</Button> : null}
    {save.error ? <p role="alert">{errText(save.error)}。未确认成功；重复点击同一操作会复用请求编号。</p> : null}
  </li>
}
export function EventPolicyReview({ projectId }: { projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  const base = `/project/${encodeURIComponent(projectId)}/event-policies`
  const q = useQuery({ queryKey: ['event-policies', owner, projectId], queryFn: async () => unwrapOne<{ items: Policy[] }>(await request({ url: `${base}/migration-preview`, method: 'get' })) })
  return <details><summary>管理员：全局恢复规则与守卫迁移</summary><p>此处修改全局能力目录，不限于当前用例。业务登录不能作为恢复原子动作；请在用例逻辑块中表达。</p>
    {q.isPending ? <p role="status">正在读取规则</p> : q.error ? <p role="alert">{errText(q.error)}</p> : <ul>{q.data?.items.map(row => <PolicyRow key={row.kind + row.id + row.source_digest} row={row} base={base} refresh={() => void q.refetch()} />)}</ul>}
    <Button onClick={() => void q.refetch()}>刷新规则</Button>
  </details>
}
