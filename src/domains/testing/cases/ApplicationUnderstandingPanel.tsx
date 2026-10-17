import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

type Review = { review_id: string; status: string; stale: boolean; platform: string; build: string; reason: string; positive_terms: string[]; negative_terms: string[]; examples: { session_id: string; seq: number; polarity: string }[] }
type Page = { state_id: string; version: string; label: string; revision: number; reviews: Review[] }
type Pages = { owner_user_id: string; project_id: string; app_id: string; pages: Page[] }
type Impact = { impact_token: string; warning: string; cases: { case_id: string; name: string; basis: string }[] }
type Trends = { owner_user_id: string; reviewed_cases: number; ever_verified_resolved_cases: number; reopened_cases: number; note: string; days: { date: string; reviewed_cases: number; resolved_cases: number; reopened_cases: number }[] }
const terms = (s: string) => [...new Set(s.split('\n').map(t => t.trim()).filter(Boolean))]

export function ApplicationUnderstandingPanel({ projectId, appId }: { projectId: string; appId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  // Scope-keyed child prevents stale selections and pending responses crossing apps/accounts.
  return <KnowledgeEditor key={`${owner}:${projectId}:${appId}`} owner={owner} projectId={projectId} appId={appId} />
}

function KnowledgeEditor({ owner, projectId, appId }: { owner: string; projectId: string; appId: string }) {
  const base = `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/understanding`
  const get = async <T,>(path: string, params?: Record<string, string>) => unwrapOne<T>(await request({ url: base + path, method: 'get', params }))
  const post = async <T,>(path: string, data: unknown) => unwrapOne<T>(await request({ url: base + path, method: 'post', data }))
  const pages = useQuery({ queryKey: ['application-pages', owner, projectId, appId], enabled: Boolean(owner), queryFn: () => get<Pages>('/pages') })
  const trends = useQuery({ queryKey: ['application-trends', owner, projectId, appId], enabled: Boolean(owner), queryFn: () => get<Trends>('/trends') })
  const [selected, setSelected] = useState('')
  const [platform, setPlatform] = useState('android')
  const [build, setBuild] = useState('')
  const [aliases, setAliases] = useState('')
  const [positive, setPositive] = useState('')
  const [negative, setNegative] = useState('')
  const [positiveSession, setPositiveSession] = useState('')
  const [negativeSession, setNegativeSession] = useState('')
  const [positiveSeq, setPositiveSeq] = useState('')
  const [negativeSeq, setNegativeSeq] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [impact, setImpact] = useState<Impact>()
  const [caseIds, setCaseIds] = useState<string[]>([])
  const [results, setResults] = useState<{ case_id: string; status: string; reason?: string; job_id?: string }[]>([])
  const validPages = pages.data?.owner_user_id === owner && pages.data.app_id === appId && pages.data.project_id === projectId ? pages.data.pages : []
  const page = validPages.find(p => `${p.version}:${p.state_id}` === selected)
  const path = page ? `/pages/${encodeURIComponent(page.state_id)}` : ''
  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const propose = () => act(async () => {
    if (!page) return
    if (!positiveSeq.trim() || !negativeSeq.trim()) throw new Error('请填写正反例事件序号')
    await post(path + '/reviews', { request_id: crypto.randomUUID(), version: page.version, expected_revision: page.revision, platform, build, reason, aliases: terms(aliases), positive_terms: terms(positive), negative_terms: terms(negative), examples: [
      { session_id: positiveSession.trim(), seq: Number(positiveSeq), polarity: 'positive' },
      { session_id: negativeSession.trim(), seq: Number(negativeSeq), polarity: 'negative' },
    ] })
    setNotice('候选已记录，审批通过后才会用于对应平台与版本。'); setImpact(undefined); await pages.refetch()
  })
  const decide = (review: Review, approve: boolean) => act(async () => {
    if (!page) return
    await post(path + '/reviews/' + encodeURIComponent(review.review_id), { version: page.version, expected_revision: page.revision, approve, reason })
    setNotice(approve ? '已批准。仅当前账号、匹配平台与版本的后续运行采用。' : '已拒绝。'); setImpact(undefined); await pages.refetch()
  })
  const preview = () => act(async () => {
    if (!page) return
    setImpact(await get<Impact>(path + '/impact', { version: page.version })); setCaseIds([]); setResults([])
  })
  const revalidate = (action: 'recheck' | 'compile') => act(async () => {
    if (!page || !impact) return
    const receipt = await post<{ items: typeof results }>(path + '/revalidate', { request_id: crypto.randomUUID(), version: page.version, impact_token: impact.impact_token, case_ids: caseIds, action, reason })
    setResults(receipt.items); setNotice('已返回逐条结果；复检或编译不代表业务验证通过。'); await trends.refetch()
  })
  return <section aria-label="应用理解与诊断" style={{ borderTop: '1px solid var(--w-border)', marginTop: 24 }}>
    <h2>应用理解与诊断</h2>
    <p>知识绑定现有导航页面。正反例须引用当前账号、本应用已结束会话的观察事件；审批后仅匹配平台、构建版本和未变更页面生效。</p>
    <Button disabled={busy} onClick={() => { void pages.refetch(); void trends.refetch() }}>刷新知识与趋势</Button>
    {pages.isPending && <p role="status">正在读取页面</p>}
    {pages.error && <p role="alert">{errText(pages.error)}</p>}
    <label>导航页面 <select aria-label="导航页面" disabled={busy} value={selected} onChange={e => { setSelected(e.target.value); setImpact(undefined); setResults([]); setCaseIds([]) }}><option value="">选择页面</option>{validPages.map(p => <option key={`${p.version}:${p.state_id}`} value={`${p.version}:${p.state_id}`}>{p.label} · {p.version}</option>)}</select></label>
    {!pages.isPending && !pages.error && !validPages.length && <p>尚无导航页面，请先维护应用导航图。</p>}
    {page && <>
      <p>知识修订 {page.revision}</p>
      <label>操作原因 <input aria-label="知识操作原因" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <details><summary>添加页面知识候选</summary>
        <label>平台 <select value={platform} onChange={e => setPlatform(e.target.value)}>{['android', 'ios', 'web', 'pc'].map(p => <option key={p}>{p}</option>)}</select></label>{' '}
        <label>构建版本 <input value={build} maxLength={300} onChange={e => setBuild(e.target.value)} /></label>
        <p><label>页面别名（每行一个）<textarea value={aliases} onChange={e => setAliases(e.target.value)} /></label></p>
        <p><label>正向特征（每行一个，至少命中一个）<textarea value={positive} onChange={e => setPositive(e.target.value)} /></label></p>
        <p><label>排除特征（每行一个，命中即排除）<textarea value={negative} onChange={e => setNegative(e.target.value)} /></label></p>
        <p><label>正例会话 <input value={positiveSession} onChange={e => setPositiveSession(e.target.value)} /></label> <label>正例事件序号 <input type="number" min="0" step="1" value={positiveSeq} onChange={e => setPositiveSeq(e.target.value)} /></label></p>
        <p><label>反例会话 <input value={negativeSession} onChange={e => setNegativeSession(e.target.value)} /></label> <label>反例事件序号 <input type="number" min="0" step="1" value={negativeSeq} onChange={e => setNegativeSeq(e.target.value)} /></label></p>
        <Button disabled={busy || !reason.trim() || !build.trim() || !positive.trim() || !negative.trim()} onClick={() => void propose()}>提交知识候选</Button>
      </details>
      {page.reviews.map(r => <article key={r.review_id}>
        <p>{({ candidate: '待审批', approved: '已批准', rejected: '已拒绝' } as Record<string, string>)[r.status]} · {r.platform} / {r.build}{r.stale ? ' · 页面已变更，知识失效' : ''}</p>
        <p>{r.reason} · 正向：{r.positive_terms.join('、')} · 排除：{r.negative_terms.join('、')}</p>
        <details><summary>正反例证据</summary>{r.examples.map((e, i) => <p key={i}>{e.polarity === 'positive' ? '正例' : '反例'}：{e.session_id} / #{e.seq}</p>)}</details>
        {r.status === 'candidate' && <><Button disabled={busy || r.stale || !reason.trim()} onClick={() => void decide(r, true)}>批准候选</Button> <Button disabled={busy || !reason.trim()} onClick={() => void decide(r, false)}>拒绝候选</Button></>}
      </article>)}
      <Button disabled={busy} onClick={() => void preview()}>预览影响范围</Button>
      {impact && <div><p>{impact.warning}</p>{impact.cases.length ? impact.cases.map(c => <p key={c.case_id}><label><input type="checkbox" disabled={busy} checked={caseIds.includes(c.case_id)} onChange={e => setCaseIds(e.target.checked ? [...caseIds, c.case_id] : caseIds.filter(id => id !== c.case_id))} />{c.name} · {c.basis === 'explicit_reference' ? '显式引用' : '文字候选'}</label></p>) : <p>未找到引用候选。</p>}
        <Button disabled={busy || !caseIds.length || !reason.trim()} onClick={() => void revalidate('recheck')}>复检所选用例</Button>{' '}
        <Button disabled={busy || !caseIds.length || !reason.trim()} onClick={() => void revalidate('compile')}>提交所选编译任务</Button>
        <p>复检只检查依赖；编译进入既有任务队列，可能调用已配置的模型服务，不自动实跑或关闭问题。</p>
      </div>}
    </>}
    {error && <p role="alert">操作失败：{error}。冲突时请刷新后重试。</p>}
    {notice && <p role="status">{notice}</p>}
    {results.map(r => <p key={r.case_id}>{r.case_id}：{r.status} {r.reason || r.job_id || ''}</p>)}
    <h3>修复与复发趋势</h3>
    {trends.isPending ? <p>正在读取趋势</p> : trends.error ? <p role="alert">{errText(trends.error)}</p> : trends.data?.owner_user_id === owner && <>
      <p>复核用例 {trends.data.reviewed_cases} · 曾实跑验证解决 {trends.data.ever_verified_resolved_cases} · 复发 {trends.data.reopened_cases} · 改善率：暂无对照基线</p>
      <p>{trends.data.note}</p>
      <table><thead><tr><th>日期</th><th>复核</th><th>验证解决</th><th>复发</th></tr></thead><tbody>{trends.data.days.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.reviewed_cases}</td><td>{d.resolved_cases}</td><td>{d.reopened_cases}</td></tr>)}</tbody></table>
    </>}
  </section>
}
