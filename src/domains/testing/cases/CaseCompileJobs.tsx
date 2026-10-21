import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

export type CompileJob = { job_id: string; revision_id: string; source_revision: number; status: string; activated: boolean; parent_job_id: string; created_at: string; finished_at: string; diagnostics: { reason_code: string }[] }
type VersionChain = { expected_revision: number; source_revision: number; source_revision_id: string; latest_compile_job_id: string; effective_artifact: { job_id: string; source_revision: number } | null; jobs: CompileJob[]; revisions: { revision_id: string; revision: number; source: Record<string, unknown>; origin: Record<string, unknown>; created_at: string }[]; publication: { frozen_revision?: number; source_revision?: number; compile_job_id?: string } | null }
export const compileStatus: Record<string, string> = { queued: '排队中', running: '编译中', succeeded: '编译已完成', failed: '编译失败', interrupted: '编译已中断', cancelled: '已取消' }
const diagnosticText: Record<string, string> = { compile_input_or_build_changed: '编译期间原文、依赖配置或编译器版本发生变化，旧任务已失效。请在变更稳定后重新编译；不代表用例本身无法自动化。', compile_model_call_failed: '模型调用未返回可用 JSON，请检查模型调度记录后显式恢复编译；无需修改原文。', compile_model_response_incomplete: '模型响应被截断或仅恢复了部分 JSON，未激活产物。请检查模型输出限制后显式恢复编译；无需修改原文。', compile_provider_unavailable: '编译账号未配置或未启用可用于用例的模型。请在该账号的模型密钥页配置，再恢复编译；无需修改原文。', compile_prompt_unavailable: '编译提示词任务不可用，请维护者检查任务配置后恢复编译；无需修改原文。' }
export const caseBase = (projectId: string, caseId: string) => `/project/${encodeURIComponent(projectId)}/cases/${encodeURIComponent(caseId)}`

export function CaseCompileJobs({ projectId, caseId }: { projectId: string; caseId: string }) {
  const owner = useSession(state => state.user?.user_id || '')
  const qc = useQueryClient()
  const key = ['case-version-chain', owner, projectId, caseId]
  const url = caseBase(projectId, caseId)
  const chain = useQuery({ queryKey: key, queryFn: async () => unwrapOne<VersionChain>(await request({ url: `${url}/version-chain`, method: 'get' })),
    refetchInterval: query => query.state.data?.jobs.some(j => j.job_id === query.state.data?.latest_compile_job_id && ['queued', 'running'].includes(j.status)) ? 2000 : false })
  const latest = chain.data?.jobs.find(job => job.job_id === chain.data?.latest_compile_job_id)
  const previousState = useRef('')
  useEffect(() => {
    const state = `${latest?.job_id}:${latest?.status}`
    if (previousState.current && state !== previousState.current) {
      void qc.invalidateQueries({ queryKey: ['case-review', owner, projectId, caseId] })
      void qc.invalidateQueries({ queryKey: ['v5-preview', owner, projectId, caseId] })
      void qc.invalidateQueries({ queryKey: ['cases', projectId, owner] })
    }
    previousState.current = state
  }, [latest?.job_id, latest?.status, qc, owner, projectId, caseId])
  // An uncertain response keeps its request identity for explicit retry.
  const identities = useRef(new Map<string, string>())
  const change = useMutation({ mutationFn: async ({ action, job }: { action: 'cancel' | 'recover' | 'queue'; job?: CompileJob }) => {
    const identity = `${action}:${job?.job_id || chain.data?.source_revision_id}`
    if (!identities.current.has(identity)) identities.current.set(identity, crypto.randomUUID())
    const endpoint = action === 'queue' ? `${url}/compile-jobs` : `${url}/compile-jobs/${encodeURIComponent(job!.job_id)}/${action}`
    await request({ url: endpoint, method: 'post', data: { expected_revision: chain.data!.expected_revision, client_request_id: identities.current.get(identity) } })
    identities.current.delete(identity)
  }, onSuccess: async () => { await qc.invalidateQueries({ queryKey: key }); await qc.invalidateQueries({ queryKey: ['case-review', owner, projectId, caseId] }); await qc.invalidateQueries({ queryKey: ['v5-preview', owner, projectId, caseId] }) } })
  return <section className="case-version-chain" aria-label="编译任务">
    <strong>编译任务</strong>
    {chain.isPending ? <p role="status">正在读取编译状态</p> : chain.error ? <p role="alert">{errText(chain.error)} <Button onClick={() => void chain.refetch()}>重试读取编译状态</Button></p> : chain.data ? <>
      <p>最新原文：{chain.data.source_revision ? `r${chain.data.source_revision}` : '历史记录，尚未登记不可变版本'}；最新编译：{latest ? `${compileStatus[latest.status] || latest.status}（原文 r${latest.source_revision}）` : '尚无持久化任务'}。</p>
      <p>当前有效产物：{chain.data.effective_artifact ? `对应原文 r${chain.data.effective_artifact.source_revision}` : '无'}。编译成功后自动用于执行，无需发布。</p>
      {latest?.status === 'failed' ? latest.diagnostics.map((d, i) => <p role="alert" key={i}>{diagnosticText[d.reason_code] || d.reason_code}</p>) : null}
      {latest && ['queued', 'running'].includes(latest.status) ? <Button disabled={change.isPending} onClick={() => change.mutate({ action: 'cancel', job: latest })}>取消当前编译</Button> : latest && ['failed', 'interrupted', 'cancelled'].includes(latest.status) ? <><p>中断或取消的远程调用可能仍会返回，旧结果只入历史。显式恢复会创建关联的新任务，并可能再次调用模型。</p><Button disabled={change.isPending} onClick={() => change.mutate({ action: 'recover', job: latest })}>恢复编译任务</Button></> : <Button disabled={change.isPending} onClick={() => change.mutate({ action: 'queue' })}>排队重新编译</Button>}
      <Button disabled={change.isPending} onClick={() => void chain.refetch()}>刷新编译状态</Button>
      <details><summary>原文版本与任务历史</summary>
        {chain.data.revisions.map(rev => <details key={rev.revision_id}><summary>原文 r{rev.revision} · {rev.created_at} · {String(rev.origin.kind || '保存')}</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(rev.source, null, 2)}</pre></details>)}
        <ul>{chain.data.jobs.map(job => <li key={job.job_id}>原文 r{job.source_revision} · {compileStatus[job.status] || job.status} · {job.job_id}{job.activated ? ' · 曾激活为有效产物' : ''}{job.parent_job_id ? ' · 恢复任务' : ''}{job.diagnostics.map((d, i) => <span key={i}> · {diagnosticText[d.reason_code] || d.reason_code}</span>)}</li>)}</ul>
      </details>
    </> : null}
    {change.error ? <p role="alert">{errText(change.error)}。可刷新状态查询结果；重试会复用同一提交身份。</p> : null}
  </section>
}
