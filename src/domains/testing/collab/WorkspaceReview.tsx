import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { request } from '@/lib/request'
import { Button, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'

type Occurrence = { run_id: string; app_id: string; session_id: string; status: string; freshness: string }
type Review = { issues: { id: string; name: string; reason: string; occurrences: Occurrence[] }[];
  decisions: { message_id: string; body: string; created_at: string; ref_id: string }[]; truncated: boolean; run_count: number }
export function WorkspaceReview({ base, projectId, readOnly }: { base: string; projectId: string; readOnly: boolean }) {
  const qc = useQueryClient()
  const key = ['workspace-review', base]
  const query = useQuery({ queryKey: key, queryFn: async () => (await request<Review>({ url: base + '/review' })).data!, refetchInterval: 10000 })
  const [body, setBody] = useState('')
  const [run, setRun] = useState('')
  const [id, setId] = useState(() => crypto.randomUUID())
  const save = useMutation({ mutationFn: () => request({ url: base + '/decisions', method: 'post', data: { body, run_id: run, request_id: id } }),
    onSuccess: () => { setBody(''); setId(crypto.randomUUID()); void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['workspaces-v7'] }) } })
  const runs = [...new Set(query.data?.issues.flatMap(i => i.occurrences.map(o => o.run_id)) || [])]
  return <section className="workspace-review"><h3>问题与人工决策</h3>
    {query.isPending && <p role="status">正在读取运行证据…</p>}
    {query.error && <p role="alert">{errText(query.error)}<Button onClick={() => void query.refetch()}>重试</Button></p>}
    {query.data && <><p>按用例和已记录原因聚合，已读取 {query.data.run_count} 次运行。{query.data.truncated ? '仅展示最近 100 次运行；更早证据请到任务页查看。' : ''}</p>
      {!query.data.issues.length && <p>这些运行中没有已记录的失败项；这不代表范围已全部通过。</p>}
      {query.data.issues.map(issue => <article key={issue.id} className="steward-run-card"><strong>{issue.name}</strong><p>{issue.reason}</p>
        {issue.occurrences.map((o, i) => <p key={o.run_id + ':' + i}>{o.status} · {o.freshness === 'stale' ? '范围或目标已变化，结果已过期' : o.freshness === 'unknown' ? '未记录范围版本' : '范围版本一致'} · <Link to={projectHref(projectId, { tab: 'tasks', run: o.run_id, appId: o.app_id })}>运行证据</Link>{o.session_id && <> · <Link to={projectHref(projectId, { tab: 'session-log', session: o.session_id, appId: o.app_id })}>Session</Link></>}</p>)}</article>)}
      <fieldset disabled={readOnly || save.isPending}><legend>记录人工决策</legend><p>仅留痕，不修改通过率或自动执行。补充或更正请追加记录。</p>
        <select aria-label="决策关联运行" value={run} onChange={e => { setRun(e.target.value); setId(crypto.randomUUID()) }}><option value="">整个工作区</option>{runs.map(r => <option key={r} value={r}>{r}</option>)}</select>
        <textarea aria-label="人工决策内容" maxLength={4000} value={body} onChange={e => { setBody(e.target.value); setId(crypto.randomUUID()) }} />
        <Button disabled={!body.trim()} loading={save.isPending} onClick={() => save.mutate()}>记录决策</Button>
      </fieldset>{save.error && <p role="alert">{errText(save.error)}</p>}
      {query.data.decisions.map(d => <article key={d.message_id}><time>{new Date(d.created_at).toLocaleString()}</time><p>{d.body}</p>{d.ref_id && <small>关联运行：{d.ref_id}</small>}</article>)}
    </>}
  </section>
}
