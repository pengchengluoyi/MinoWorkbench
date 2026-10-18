import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

type Fact = { candidate_id: string; account_id: string; env: string; source: string; session_id: string; evidence_context: { app_id?: string; platform?: string; build?: string };
 before: Record<string, string>; proposed: Record<string, string>; status: string; stale: boolean; busy: boolean; expired: boolean; scope_complete: boolean; expected_digest: string; decision: { reason?: string; expires_at?: number } }
export function AccountFactsPanel({ projectId }: { projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  return <Facts key={`${owner}:${projectId}`} projectId={projectId} owner={owner} />
}
function Facts({ projectId, owner }: { projectId: string; owner: string }) {
  const base = `/project/${encodeURIComponent(projectId)}/account-facts`
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: ['account-facts', owner, projectId, page], enabled: Boolean(owner && projectId), queryFn: async () => unwrapOne<{ project_id: string; owner_user_id: string; items: Fact[]; total: number }>(await request({ url: base, method: 'get', params: { limit: 50, offset: (page - 1) * 50 } })) })
  const [validHours, setValidHours] = useState(24)
  const [reason, setReason] = useState('')
  const [seqs, setSeqs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const rows = query.data?.owner_user_id === owner && query.data.project_id === projectId ? query.data.items : []
  const decide = async (row: Fact, approve: boolean) => {
    setBusy(true); setError(''); setNotice('')
    try {
      await request({ url: `${base}/${encodeURIComponent(row.candidate_id)}`, method: 'post', data: { approve, reason, expected_digest: row.expected_digest, valid_for_seconds: validHours * 3600, evidence_seq: seqs[row.candidate_id]?.trim() ? Number(seqs[row.candidate_id]) : null } })
      setNotice(approve ? '已人工确认并写入账号事实。' : '已拒绝候选。'); await query.refetch()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return <section aria-label="账号事实复核" style={{ padding: 16, overflow: 'auto' }}>
    <h2>账号事实复核</h2><p>候选不参与资源匹配；确认需要观察事件、空闲账号和未变化的事实基线。确认事实仅对证据中的应用、平台、环境与构建生效，到期后停止复用。人工确认不等于自动业务验证。</p>
    <label>确认有效小时数 <input type="number" min="1" max="720" value={validHours} onChange={e => setValidHours(Math.min(720, Math.max(1, Number(e.target.value) || 1)))} /></label>
    <Button disabled={busy} onClick={() => void query.refetch()}>刷新账号候选</Button>{' '}
    <label>复核原因 <input maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>
    {query.isPending && <p role="status">正在读取候选</p>}{query.error && <p role="alert">{errText(query.error)}</p>}
    {error && <p role="alert">{error}。事实冲突需重新观察，不能覆盖新状态。</p>}{notice && <p role="status">{notice}</p>}
    {!query.isPending && !query.error && !rows.length && <p>暂无待复核记录。</p>}
    {rows.map(row => <article key={row.candidate_id} style={{ borderTop: '1px solid var(--w-border)', padding: 12 }}>
      <p>{row.account_id} · {row.env} · {({ candidate: '待确认', confirmed: '已人工确认', rejected: '已拒绝' } as Record<string, string>)[row.status]}{row.stale ? ' · 基线已变化' : ''}{row.busy ? ' · 账号占用中' : ''}{row.expired ? ' · 已到期' : ''}{!row.scope_complete ? ' · 缺少适用范围' : ''}</p>
      <p>来源：{row.source} · 会话：{row.session_id}</p>
      <p>应用：{row.evidence_context.app_id || '未知'} · 平台：{row.evidence_context.platform || '未知'} · 构建：{row.evidence_context.build || '未知（旧会话未记录）'}</p>
      <table><thead><tr><th>字段</th><th>原值</th><th>候选值</th></tr></thead><tbody>{Object.entries(row.proposed).map(([key, value]) => <tr key={key}><td>{key}</td><td>{row.before[key] || 'unknown'}</td><td>{value}</td></tr>)}</tbody></table>
      {row.status === 'candidate' ? <><label>确认依据事件序号 <input type="number" min="0" step="1" value={seqs[row.candidate_id] || ''} onChange={e => setSeqs({ ...seqs, [row.candidate_id]: e.target.value })} /></label>{' '}
        <Button disabled={busy || row.stale || row.busy || !row.scope_complete || !reason.trim() || !seqs[row.candidate_id]?.trim()} onClick={() => void decide(row, true)}>确认事实</Button>{' '}
        <Button disabled={busy || !reason.trim()} onClick={() => void decide(row, false)}>拒绝候选</Button></> : <p>{row.decision.reason}</p>}
    </article>)}
    <Button disabled={page <= 1 || query.isFetching} onClick={() => setPage(n => n - 1)}>上一页</Button>{' '}
    <span>第 {page} 页 · 共 {query.data?.total ?? '—'} 条</span>{' '}
    <Button disabled={query.isFetching || page * 50 >= (query.data?.total || 0)} onClick={() => setPage(n => n + 1)}>下一页</Button>
  </section>
}
