import { EventMigrationReview } from './EventMigrationReview'
import { EventPolicyReview } from './EventPolicyReview'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Link } from 'react-router-dom'
import { Button, errText } from '@/ui'
import { botsHref } from '@/domains/bots/botsNavigation'
import { caseBase, compileStatus, type CompileJob } from './CaseCompileJobs'

type Source = { precondition: string; steps_raw: string; expected_raw: string }
type Item = { phase: string; id: string; message: string; missing_fields: string[]; origin: string; reason_code: string; category: string | null; action: string; source_clause: string; review_status: string; point_ref: string; operation_ref: string; freshness?: string }
type History = { record_id: string; item_id: string; review_status: string; reviewer_user_id: string; reviewed_at: string; reason: string; source_revision: number; evidence: { session_id?: string; execution_verified?: boolean } }
type Review = { project_id: string; case_id: string; owner_user_id: string; expected_revision: number; expected_job_id: string; source: Source; status: string; requirements: Item[]; history: History[]; compile_job: CompileJob | null; execution_verified: boolean; resolution_status: string }
const initialContext = () => ({ app_id: '', sn: '', env_profile: '', env_surface: '', execution_mode: 'agent', action_scheme: 'dom_preferred', provider_id: '' })
const categories: Record<string, string> = { case_definition: '用例定义', semantic_parsing: '语义解析 / 应用识别', capability_gap: '动作 / 核验能力', configuration: '配置 / 环境 / 资源', execution_toolchain: '执行工具链', external_evidence: '外部证据 / 人工前置' }
const statuses: Record<string, string> = { pending_review: '待复核', needs_input: '待补充信息', needs_configuration: '待完善配置', confirmed: '已确认', fixed_pending_run: '复检缺口已清除，待实跑', verified_resolved: '实跑证据已验证解决' }
const actions: Record<string, string> = { configure: '请在现有应用环境、资源或控件配置中处理，再复检。', platform_fix: '登记或确认平台缺陷；修复后复检。', recover_compile: '请在上方编译任务中恢复或重新编译。', wait: '等待任务完成后复检。', provide_evidence: '请关联同版本的实跑证据，或在复核理由中记录所需人工前置。', review: '先复核原句与系统理解，确认根因后再修复。', recheck: '该目标诊断已过时，请带原目标重新复检。' }

export function CaseReview({ projectId, caseId, appId }: { projectId: string; caseId: string; appId?: string }) {
  const role = useSession(state => state.role)
  const owner = useSession(state => state.user?.user_id || '')
  const qc = useQueryClient()
  const key = ['case-review', owner, projectId, caseId]
  const url = `${caseBase(projectId, caseId)}/review-requirements`
  const query = useQuery({ queryKey: key, queryFn: async () => unwrapOne<Review>(await request({ url, method: 'get' })),
    refetchInterval: q => ['queued', 'running'].includes(q.state.data?.compile_job?.status || '') ? 2000 : false })
  const [editing, setEditing] = useState(false)
  const [source, setSource] = useState<Source>({ precondition: '', steps_raw: '', expected_raw: '' })
  const [revision, setRevision] = useState(0)
  const [reason, setReason] = useState('')
  const [reviewReason, setReviewReason] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [context, setContext] = useState(initialContext)
  const [sessionId, setSessionId] = useState('')
  const [filter, setFilter] = useState('')
  const [phase, setPhase] = useState('')
  const [reviewStatus, setReviewStatus] = useState('')
  useEffect(() => { setEditing(false); setReason(''); setReviewReason(''); setSelected({}); setContext(initialContext()); setSessionId(''); setFilter(''); setPhase(''); setReviewStatus('') }, [projectId, caseId])
  const matches = (data: Review) => data.project_id === projectId && data.case_id === caseId && data.owner_user_id === useSession.getState().user?.user_id
  const refresh = async (data: Review) => { if (!matches(data)) return; qc.setQueryData(key, data); await qc.invalidateQueries({ queryKey: ['case-version-chain', owner, projectId, caseId] }); await qc.invalidateQueries({ queryKey: ['v5-preview', owner, projectId, caseId] }); await qc.invalidateQueries({ queryKey: ['cases', projectId, owner] }) }
  const save = useMutation({ mutationFn: async () => unwrapOne<Review>(await request({ url, method: 'put', data: { expected_revision: revision, source, reason } })),
    onSuccess: async data => { if (!matches(data)) return; setEditing(false); setReason(''); await refresh(data) } })
  const review = useMutation({ mutationFn: async (item: Item) => unwrapOne<Review>(await request({ url: `${url}/${encodeURIComponent(item.id)}/review`, method: 'post', data: { expected_revision: query.data!.expected_revision, expected_job_id: query.data!.expected_job_id, reason: reviewReason, category: selected[item.id] || item.category || null } })), onSuccess: refresh })
  const recheck = useMutation({ mutationFn: async () => unwrapOne<Review>(await request({ url: `${url}/recheck`, method: 'post', data: { expected_revision: query.data!.expected_revision, expected_job_id: query.data!.expected_job_id, reason: reviewReason, context: context.app_id && context.sn ? context : null, evidence_session_id: sessionId } })), onSuccess: refresh })
  const begin = () => { if (!query.data) return; setSource(query.data.source); setRevision(query.data.expected_revision); setEditing(true); save.reset() }
  const error = review.error || recheck.error
  return <section aria-label="执行诊断与逐项复核" className="case-version-chain">
    <EventMigrationReview key={owner + projectId + caseId} projectId={projectId} caseId={caseId} />
    {['admin', 'superadmin', 'super_admin'].includes(role) ? <EventPolicyReview key={owner + projectId} projectId={projectId} /> : null}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <strong>执行诊断与逐项复核</strong>
      {appId ? (
        <Link to={botsHref(projectId, { appId, collabCase: caseId })}>加到工作区</Link>
      ) : null}
    </div>
    <p>按诊断来源处理原文、配置、平台能力或工具链。复核意见单独保存；只读复检通过表示缺口暂时清除，实际执行结果以同版本 session 证据为准。请勿填写密码、验证码或令牌。</p>
    {query.isPending ? <p role="status">正在读取诊断事项</p> : query.error ? <p role="alert">{errText(query.error)} <Button onClick={() => void query.refetch()}>重试读取诊断</Button></p> : query.data ? <>
      {query.data.compile_job ? <p>原文 r{query.data.expected_revision} · {compileStatus[query.data.compile_job.status] || query.data.compile_job.status}</p> : null}
      <label>根因筛选 <select value={filter} onChange={e => setFilter(e.target.value)}><option value="">全部</option><option value="unconfirmed">根因待确认</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>阶段 <select value={phase} onChange={e => setPhase(e.target.value)}><option value="">全部</option><option value="prep">前置</option><option value="do">操作</option><option value="check">预期</option><option value="cleanup">清理</option></select></label>
      <label>复核状态 <select value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}><option value="">全部</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {query.data.requirements.length ? <ul>{query.data.requirements.filter(item => (!filter || (item.category || 'unconfirmed') === filter) && (!phase || item.phase === phase) && (!reviewStatus || item.review_status === reviewStatus)).map(item => <li key={item.id} style={{ marginBlock: 12 }}>
        <strong>{categories[item.category || ''] || '根因待确认'} · {statuses[item.review_status] || item.review_status}</strong>
        <p>{item.message} {actions[item.action] || ''}</p>
        {item.source_clause ? <blockquote>{item.source_clause}</blockquote> : null}
        <p>来源：{item.origin} · {item.reason_code}{item.operation_ref ? ` · 操作 ${item.operation_ref}` : ''}{item.point_ref ? ` · 检查点 ${item.point_ref}` : ''}{item.missing_fields.length ? ` · 缺项 ${item.missing_fields.join('、')}` : ''}{item.freshness === 'stale' ? ' · 目标观察已过时' : ''}</p>
        <label>复核分类 <select aria-label={`复核分类 ${item.id}`} value={selected[item.id] ?? item.category ?? ''} onChange={e => setSelected({ ...selected, [item.id]: e.target.value })}><option value="">暂不定责</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <Button disabled={review.isPending || !reviewReason.trim()} onClick={() => review.mutate(item)}>记录本项复核</Button>
        {item.action === 'edit_source' ? <Button onClick={begin}>补充标注的原文信息</Button> : null}
      </li>)}</ul> : <p>{query.data.execution_verified ? '同版本严格实跑证据已核验，当前复核事项已关闭。' : query.data.resolution_status === 'fixed_pending_run' ? '复检缺口已清除，仍待同版本实跑证据核验。' : '当前没有未解决诊断；这不代表业务断言已通过。'}</p>}
      <label>复核 / 复检理由<input style={{ display: 'block', width: '100%' }} value={reviewReason} maxLength={1000} onChange={e => setReviewReason(e.target.value)} /></label>
      <details><summary>复检指定执行目标 / 关联实跑证据（可选）</summary>
        {(['app_id', 'sn', 'env_profile', 'env_surface'] as const).map((field, i) => <label key={field} style={{ display: 'block' }}>{['应用编号', '设备编号', '环境配置', '目标渠道'][i]}<input value={context[field]} onChange={e => setContext({ ...context, [field]: e.target.value })} /></label>)}
        <label>执行路线 <select value={context.execution_mode} onChange={e => setContext({ ...context, execution_mode: e.target.value })}><option value="agent">普通执行</option><option value="v5">严格 Web</option></select></label>
        <label>执行方式 <select value={context.action_scheme} onChange={e => setContext({ ...context, action_scheme: e.target.value })}><option value="dom_preferred">DOM 优先</option><option value="visual">看图</option></select></label>
        <label>模型配置编号（可选）<input value={context.provider_id} onChange={e => setContext({ ...context, provider_id: e.target.value })} /></label>
        <label>已完成且核验通过的 session 编号<input value={sessionId} onChange={e => setSessionId(e.target.value)} /></label><p>目标复检只读取当前登记信息和绑定解析，不租设备、不调用执行器。历史证据必须属于当前账号、用例、原文与编译产物。</p>
      </details>
      <Button disabled={recheck.isPending || !reviewReason.trim() || Boolean(context.app_id) !== Boolean(context.sn)} onClick={() => recheck.mutate()}>执行只读复检</Button>
      {error ? <p role="alert">{errText(error)}。复核未提交，输入保留。</p> : null}
      {recheck.isSuccess ? <p role="status">{recheck.data?.execution_verified ? '已核对同版本实跑证据并关闭对应事项；历史执行结果未改写。' : '复检已记录。仍需合格实跑证据，不能据此标为已解决。'}</p> : null}
      <details><summary>逐项复核历史（{query.data.history.length}）</summary><ul>{query.data.history.map(record => <li key={record.record_id}>r{record.source_revision} · {statuses[record.review_status] || record.review_status} · {record.reason} · {record.reviewer_user_id} · {record.reviewed_at}{record.evidence.session_id ? ` · session ${record.evidence.session_id}` : ''}</li>)}</ul></details>
      {editing ? <>
        {(['precondition', 'steps_raw', 'expected_raw'] as const).map((field, i) => <label key={field} style={{ display: 'block', marginBlock: 8 }}>{['前置条件与资源要求', '操作步骤与检查点', '预期与断言范围'][i]}<textarea rows={5} style={{ display: 'block', width: '100%' }} disabled={save.isPending} value={source[field] || ''} onChange={e => setSource({ ...source, [field]: e.target.value })} /></label>)}
        <label>修订理由<input style={{ display: 'block', width: '100%' }} disabled={save.isPending} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} /></label>
        <Button disabled={save.isPending || !reason.trim()} onClick={() => save.mutate()}>保存新原文并排队编译</Button><Button disabled={save.isPending} onClick={() => setEditing(false)}>取消编辑</Button>
        {save.error ? <p role="alert">保存未完成：{errText(save.error)}。如版本冲突，请先保留输入、取消编辑并刷新后合并，不会自动覆盖。</p> : null}
      </> : <Button onClick={begin}>主动修订原文</Button>}
      {save.isSuccess ? <p role="status">原文已提交；编译状态见上方任务。发布与历史实跑记录保持可追溯。</p> : null}
    </> : null}
  </section>
}
