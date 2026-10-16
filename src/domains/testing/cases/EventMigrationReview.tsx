import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'
import { caseBase, type CompileJob } from './CaseCompileJobs'

type Candidate = { project_id: string; case_id: string; status: string; expected_revision: number; expected_job_id: string; state_digest: string; candidate_digest: string; candidate: unknown; changes: { path: (string | number)[]; former_event_id: string }[]; blockers: { reason_code: string; path?: (string | number)[] }[] }
export function EventMigrationReview({ projectId, caseId }: { projectId: string; caseId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  const qc = useQueryClient()
  const base = caseBase(projectId, caseId)
  const key = ['event-migration', owner, projectId, caseId]
  const [reviewed, setReviewed] = useState('')
  const [reason, setReason] = useState('')
  const [identity, setIdentity] = useState(() => crypto.randomUUID())
  const [attempt, setAttempt] = useState<{ expected_revision: number; expected_job_id: string; state_digest: string; candidate_digest: string; request_id: string; reason: string } | null>(null)
  const proposal = useQuery({ queryKey: key, queryFn: async () => unwrapOne<Candidate>(await request({ url: `${base}/event-migration-preview`, method: 'get' })) })
  useEffect(() => { setReviewed(''); setReason(''); setIdentity(crypto.randomUUID()); setAttempt(null) }, [projectId, caseId, owner])
  const apply = useMutation({ mutationFn: async () => {
    const p = proposal.data!
    const body = attempt || { expected_revision: p.expected_revision, expected_job_id: p.expected_job_id, state_digest: p.state_digest, candidate_digest: p.candidate_digest, request_id: identity, reason }
    setAttempt(body)
    return unwrapOne<CompileJob>(await request({ url: `${base}/event-migration-apply`, method: 'post', data: body }))
  }, onSuccess: async () => { setReviewed(''); await qc.invalidateQueries({ queryKey: ['case-version-chain', owner, projectId, caseId] }); await qc.invalidateQueries({ queryKey: ['case-review', owner, projectId, caseId] }); await proposal.refetch() } })
  const discard = () => { setAttempt(null); setIdentity(crypto.randomUUID()); setReviewed(''); apply.reset(); void proposal.refetch() }
  return <section aria-label="业务事件迁移审核" className="case-version-chain">
    <strong>业务事件迁移审核</strong>
    <p>核对旧事件的新逻辑块或导航目标后应用。系统创建独立编译任务，保留原文和已发布版本；编译后仍需预检，严格 Web 版本须重新审阅发布。</p>
    {proposal.isPending ? <p role="status">正在读取迁移候选</p> : proposal.error ? <p role="alert">{errText(proposal.error)} <Button onClick={() => void proposal.refetch()}>重试读取</Button></p> : proposal.data ? <>
      <p>原文 r{proposal.data.expected_revision} · {proposal.data.status === 'candidate' ? '待审核' : proposal.data.status === 'blocked' ? '需要处理阻塞' : '没有待迁移事件'}</p>
      <ul>{proposal.data.changes.map((c, i) => <li key={i}>{c.former_event_id} · {c.path.join(' / ')}</li>)}</ul>
      {proposal.data.blockers.length ? <ul role="alert">{proposal.data.blockers.map((b, i) => <li key={i}>{b.reason_code}{b.path?.length ? ` · ${b.path.join(' / ')}` : ''}</li>)}</ul> : null}
      <details><summary>查看候选计划</summary><pre style={{ maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(proposal.data.candidate, null, 2)}</pre></details>
      <label><input type="checkbox" checked={reviewed === proposal.data.state_digest + proposal.data.candidate_digest} disabled={apply.isPending || Boolean(attempt)} onChange={e => setReviewed(e.target.checked ? proposal.data!.state_digest + proposal.data!.candidate_digest : '')} />已核对本次候选及语义变化</label>
      <label>审核理由<input value={reason} maxLength={1000} disabled={Boolean(attempt)} onChange={e => setReason(e.target.value)} /></label>
      <Button disabled={apply.isPending || apply.isSuccess || (!attempt && (proposal.data.status !== 'candidate' || !reason.trim() || reviewed !== proposal.data.state_digest + proposal.data.candidate_digest))} onClick={() => apply.mutate()}>{attempt && apply.isError ? '查询或重试同一次应用' : '应用并创建编译任务'}</Button>
      <Button disabled={apply.isPending} onClick={discard}>重新读取并审核</Button>
    </> : null}
    {apply.error ? <p role="alert">{errText(apply.error)}。若响应丢失，请重试同一次应用；版本冲突需重新读取并审核。输入已保留。</p> : null}
    {apply.isSuccess ? <p role="status">已创建任务 {apply.data.job_id}；尚未发布或完成业务验收。</p> : null}
  </section>
}
