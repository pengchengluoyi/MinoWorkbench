import { CompileMetrics } from './CompileMetrics'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Alert, Button, Checkbox, DataTable, Drawer, EmptyState, Input, InputNumber, Modal, Select, Space, StatusPill, errText, type DataColumn } from '@/ui'
import { PageRecognitionComparisons } from './PageRecognitionComparisons'
import '../config/ConfigWorkspace.css'

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
  const [diagnostics, setDiagnostics] = useState<'recognition' | 'compile' | ''>('')
  const trends = useQuery({ queryKey: ['application-trends', owner, projectId, appId], enabled: Boolean(owner && diagnostics === 'compile'), queryFn: () => get<Trends>('/trends') })
  const [selected, setSelected] = useState('')
  const [proposing, setProposing] = useState(false)
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
    setProposing(false); setNotice('候选已记录，审批通过后才会用于对应平台与版本。'); setImpact(undefined); await pages.refetch()
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
  const columns: DataColumn<Review>[] = [
    { key: 'status', title: '状态', width: 130, render: (_, r) => <StatusPill status={r.stale ? 'warn' : r.status === 'approved' ? 'pass' : r.status === 'rejected' ? 'muted' : 'warn'}>{r.stale ? '页面变化，已失效' : r.status === 'approved' ? '已批准' : r.status === 'rejected' ? '已拒绝' : '待审批'}</StatusPill> },
    { key: 'scope', title: '适用范围', render: (_, r) => r.platform },
    { key: 'features', title: '页面特征', render: (_, r) => <div className="config-stack"><span>正向：{r.positive_terms.join('、')}</span><span className="config-secondary">排除：{r.negative_terms.join('、')}</span></div> },
    { key: 'reason', title: '说明', dataIndex: 'reason' },
    { key: 'action', title: '操作', render: (_, r) => r.status === 'candidate' ? <Space><Button type="link" disabled={busy || r.stale || !reason.trim()} onClick={() => void decide(r, true)}>批准</Button><Button type="link" danger disabled={busy || !reason.trim()} onClick={() => void decide(r, false)}>拒绝</Button></Space> : null },
  ]
  return <section className="config-workspace config-workspace--fill" aria-label="页面资料">
    <header className="config-workspace-heading"><div><h1>页面资料</h1><p>维护页面特征，帮助执行时识别正确页面。</p></div><Space wrap><Button onClick={() => setDiagnostics('recognition')}>识别效果</Button><Button onClick={() => setDiagnostics('compile')}>更多诊断</Button><Button disabled={busy} onClick={() => void pages.refetch()}>刷新</Button></Space></header>
    <div className="config-page-body">
    {pages.error && <Alert type="error" message={errText(pages.error)} />}
    <div className="config-toolbar"><Select aria-label="导航页面" loading={pages.isPending} disabled={busy} value={selected || undefined} placeholder="选择导航页面" style={{ width: 260, maxWidth: '100%' }} options={validPages.map(p => ({ value: `${p.version}:${p.state_id}`, label: p.label }))} onChange={value => { setSelected(value); setImpact(undefined); setResults([]); setCaseIds([]) }} /><Button type="primary" disabled={!page || busy} onClick={() => setProposing(true)}>添加页面资料</Button></div>
    {!pages.isPending && !pages.error && !validPages.length && <EmptyState title="还没有页面资料" hint="应用有可维护的导航页面后，可在这里添加和审批识别资料。" />}
    {error && <Alert type="error" showIcon message={error} />}{notice && <Alert type="success" showIcon message={notice} />}
    {page && <><div className="config-drawer-section"><Input aria-label="知识操作原因" placeholder="填写本次审批或复检的操作说明" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></div>
      <DataTable viewId="testing.application-knowledge" columns={columns} dataSource={page.reviews} rowKey="review_id" emptyTitle="当前页面还没有识别资料" />
      <div className="config-drawer-section"><Button disabled={busy} onClick={() => void preview()}>查看受影响用例</Button></div>
      {impact && <div><p className="config-secondary">{impact.warning}</p>{impact.cases.map(c => <p key={c.case_id}><Checkbox disabled={busy} checked={caseIds.includes(c.case_id)} onChange={e => setCaseIds(e.target.checked ? [...caseIds, c.case_id] : caseIds.filter(id => id !== c.case_id))}>{c.name} · {c.basis === 'explicit_reference' ? '直接引用' : '文字候选'}</Checkbox></p>)}{!impact.cases.length && <p>暂未发现引用候选。</p>}<Space><Button disabled={busy || !caseIds.length || !reason.trim()} onClick={() => void revalidate('recheck')}>复检所选用例</Button><Button disabled={busy || !caseIds.length || !reason.trim()} onClick={() => void revalidate('compile')}>重新编译所选用例</Button></Space></div>}
    </>}
    {results.map(result => <p key={result.case_id}>{impact?.cases.find(item => item.case_id === result.case_id)?.name || '用例'}：{result.reason || ({ queued: '已加入处理队列', enqueued: '已加入处理队列', skipped: '已跳过', failed: '处理失败' }[result.status] || '处理结果已返回')}</p>)}
    </div>
    <Drawer title={diagnostics === 'recognition' ? '页面识别效果' : '诊断详情'} width="min(1000px, 100vw)" open={!!diagnostics} onClose={() => setDiagnostics('')} destroyOnHidden>
      {diagnostics === 'recognition' && <PageRecognitionComparisons owner={owner} projectId={projectId} appId={appId} pages={validPages} />}
      {diagnostics === 'compile' && <><h3 className="config-subsection-title">修复与复发</h3>{trends.isPending ? <p>正在读取趋势…</p> : trends.error ? <Alert type="error" message={errText(trends.error)} /> : trends.data?.owner_user_id === owner && <p>复核 {trends.data.reviewed_cases} 个用例 · 曾验证解决 {trends.data.ever_verified_resolved_cases} 个 · 复发 {trends.data.reopened_cases} 个</p>}<CompileMetrics owner={owner} projectId={projectId} appId={appId} /></>}
    </Drawer>
    <Modal cancelText="取消" title="添加页面识别资料" width={620} open={proposing} confirmLoading={busy} okText="提交候选" onCancel={() => !busy && setProposing(false)} onOk={() => void propose()} okButtonProps={{ disabled: !reason.trim() || !build.trim() || !positive.trim() || !negative.trim() || !positiveSession.trim() || !negativeSession.trim() }} destroyOnHidden>
      {error && <Alert type="error" message={error} />}<p className="config-secondary">审批后用于匹配平台和构建的新执行。正反例应来自当前账号、本应用的已结束会话。</p>
      <div className="w-form-grid config-drawer-section"><label>平台<Select aria-label="资料平台" value={platform} onChange={setPlatform} options={['android', 'ios', 'web', 'pc'].map(value => ({ value, label: value }))} style={{ width: '100%' }} /></label><label>构建版本<Input value={build} maxLength={300} onChange={e => setBuild(e.target.value)} /></label><label>页面别名（每行一个）<Input.TextArea rows={2} value={aliases} onChange={e => setAliases(e.target.value)} /></label><label>正向特征（每行一个）<Input.TextArea rows={2} value={positive} onChange={e => setPositive(e.target.value)} /></label><label>排除特征（每行一个）<Input.TextArea rows={2} value={negative} onChange={e => setNegative(e.target.value)} /></label><label>操作说明<Input maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label><label>正例会话<Input value={positiveSession} onChange={e => setPositiveSession(e.target.value)} /></label><label>正例事件序号<InputNumber min={0} precision={0} value={positiveSeq ? Number(positiveSeq) : null} onChange={value => setPositiveSeq(value === null ? '' : String(value))} /></label><label>反例会话<Input value={negativeSession} onChange={e => setNegativeSession(e.target.value)} /></label><label>反例事件序号<InputNumber min={0} precision={0} value={negativeSeq ? Number(negativeSeq) : null} onChange={value => setNegativeSeq(value === null ? '' : String(value))} /></label></div>
    </Modal>
  </section>
}
