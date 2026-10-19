import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Alert, Button, DataTable, Drawer, Form, Input, InputNumber, Modal, Select, Space, StatusPill, Switch, errText, useFeedback, type DataColumn } from '@/ui'
import './ConfigWorkspace.css'

type Fact = { candidate_id: string; account_id: string; account_name?: string; env: string; source: string; session_id: string;
  evidence_context: { app_id?: string; platform?: string; build?: string }; before: Record<string, string>; proposed: Record<string, string>;
  status: string; stale: boolean; busy: boolean; expired: boolean; scope_complete: boolean; expected_digest: string;
  decision: { reason?: string; expires_at?: number; verification_kind?: string } }
type Rule = { rule_id: string; revision: number; name: string; app_id: string; env: string; platform: string; build: string; case_id: string; point_id: string; build_point_id: string; facet_key: string; facet_value: string; valid_for_seconds: number; enabled: boolean }
type RuleOptions = { items: Rule[]; apps: { id: string; name: string }[]; cases: { case_id: string; name: string; points: { point_id: string; label: string; predicate?: string; value?: string }[] }[]; fields: { key: string; label: string; options: { value: string; label: string }[] }[] }
type Decision = { reason: string; validHours: number; evidence_seq?: number }
export function AccountFactsPanel({ projectId }: { projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  return <Facts key={`${owner}:${projectId}`} projectId={projectId} owner={owner} />
}
function Facts({ projectId, owner }: { projectId: string; owner: string }) {
  const base = `/project/${encodeURIComponent(projectId)}/account-facts`
  const feedback = useFeedback()
  const [page, setPage] = useState(1)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [selected, setSelected] = useState<Fact>()
  const [editing, setEditing] = useState<Partial<Rule>>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [decisionForm] = Form.useForm<Decision>()
  const [ruleForm] = Form.useForm<Rule>()
  const caseId = Form.useWatch('case_id', ruleForm)
  const facetKey = Form.useWatch('facet_key', ruleForm)
  const build = Form.useWatch('build', ruleForm)
  const query = useQuery({ queryKey: ['account-facts', owner, projectId, page, status], enabled: !!owner,
    queryFn: async () => unwrapOne<{ project_id: string; owner_user_id: string; items: Fact[]; total: number }>(await request({ url: base, method: 'get', params: { limit: 50, offset: (page - 1) * 50, status } })) })
  const rules = useQuery({ queryKey: ['account-fact-rules', owner, projectId], enabled: !!owner,
    queryFn: async () => unwrapOne<RuleOptions>(await request({ url: `${base}/rules`, method: 'get' })) })
  const observations = useQuery({ queryKey: ['account-fact-observations', owner, projectId, selected?.candidate_id], enabled: !!selected,
    queryFn: async () => unwrapOne<{ items: { seq: number; type: string; at: string }[] }>(await request({ url: `${base}/${encodeURIComponent(selected!.candidate_id)}/observations`, method: 'get' })) })
  const rows = query.data?.owner_user_id === owner && query.data.project_id === projectId ? query.data.items : []
  const fieldLabel = (key: string) => rules.data?.fields.find(f => f.key === key)?.label || key
  const valueLabel = (key: string, value: string) => rules.data?.fields.find(f => f.key === key)?.options.find(o => o.value === value)?.label || value
  const openReview = (row: Fact) => { setSelected(row); setError(''); decisionForm.resetFields() }
  const decide = async (approve: boolean) => {
    if (!selected) return
    const values = await decisionForm.validateFields(approve ? ['reason', 'validHours', 'evidence_seq'] : ['reason']).catch(() => null)
    if (!values) return
    setBusy(true); setError('')
    try {
      await request({ url: `${base}/${encodeURIComponent(selected.candidate_id)}`, method: 'post', data: { approve, reason: values.reason.trim(), expected_digest: selected.expected_digest, valid_for_seconds: (values.validHours || 24) * 3600, evidence_seq: values.evidence_seq ?? null } })
      feedback.ok(approve ? '已人工确认账号事实' : '已拒绝候选'); setSelected(undefined); await query.refetch()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const editRule = (row?: Rule) => {
    setError(''); setEditing(row || {}); ruleForm.resetFields()
    ruleForm.setFieldsValue(row || { env: 'test', platform: 'web', valid_for_seconds: 86400, enabled: true })
  }
  const saveRule = async () => {
    const values = await ruleForm.validateFields().catch(() => null)
    if (!values || !editing) return
    setBusy(true); setError('')
    try {
      const body = { name: values.name.trim(), app_id: values.app_id, env: values.env.trim(), platform: values.platform, build: values.build.trim(), case_id: values.case_id, point_id: values.point_id, build_point_id: values.build_point_id, facet_key: values.facet_key, facet_value: values.facet_value, valid_for_seconds: values.valid_for_seconds, enabled: values.enabled }
      await request({ url: `${base}/rules/${encodeURIComponent(editing.rule_id || 'new')}`, method: 'put', data: { ...body, expected_revision: editing.revision || 0 } })
      feedback.ok('自动核验规则已保存'); setEditing(undefined); await rules.refetch()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const columns: DataColumn<Fact>[] = [
    { key: 'account', title: '账号', width: 170, render: (_, row) => <div className="config-stack"><span>{row.account_name || row.account_id}</span><span className="config-secondary">{row.env}</span></div> },
    { key: 'changes', title: '事实变化', render: (_, row) => <div className="config-stack">{Object.entries(row.proposed).map(([key, value]) => <div className="config-field-change" key={key}><span className="config-fact-label">{fieldLabel(key)}</span><span>{valueLabel(key, row.before[key] || 'unknown')} → {valueLabel(key, value)}</span></div>)}</div> },
    { key: 'scope', title: '适用范围', width: 220, render: (_, row) => <div className="config-stack"><span>{rules.data?.apps.find(a => a.id === row.evidence_context.app_id)?.name || '应用未记录'} · {row.evidence_context.platform || '平台未记录'}</span></div> },
    { key: 'status', title: '状态', width: 140, render: (_, row) => <StatusPill status={row.stale || row.expired ? 'warn' : row.status === 'confirmed' ? 'pass' : row.status === 'rejected' ? 'muted' : 'warn'}>{row.stale ? '事实已变化' : row.expired ? '已过期' : row.status === 'confirmed' ? row.decision.verification_kind === 'automatic' ? '自动核验通过' : '已人工确认' : row.status === 'rejected' ? '已拒绝' : '待复核'}</StatusPill> },
    { key: 'actions', title: '操作', width: 110, render: (_, row) => <Button type="link" onClick={() => openReview(row)}>{row.status === 'candidate' ? '查看与复核' : '查看详情'}</Button> },
  ]
  const ruleColumns: DataColumn<Rule>[] = [
    { key: 'name', title: '规则', dataIndex: 'name' },
    { key: 'scope', title: '范围', render: (_, r) => `${rules.data?.apps.find(a => a.id === r.app_id)?.name || '应用未记录'} · ${r.env}` },
    { key: 'fact', title: '核验后事实', render: (_, r) => `${fieldLabel(r.facet_key)}：${valueLabel(r.facet_key, r.facet_value)}` },
    { key: 'ttl', title: '有效期', render: (_, r) => `${r.valid_for_seconds / 3600} 小时` },
    { key: 'enabled', title: '状态', render: (_, r) => <StatusPill status={r.enabled ? 'pass' : 'muted'}>{r.enabled ? '启用' : '停用'}</StatusPill> },
    { key: 'action', title: '操作', render: (_, r) => <Button type="link" onClick={() => editRule(r)}>编辑</Button> },
  ]
  return <section className="config-workspace config-workspace--fill" aria-label="账号事实">
    <header className="config-workspace-heading"><div><h1>账号事实</h1><p>查看账号状态变化，复核需要确认的记录。</p></div><Space wrap><Button onClick={() => setRulesOpen(true)}>核验规则</Button><Button onClick={() => { void query.refetch(); void rules.refetch() }}>刷新</Button></Space></header>
    <DataTable fill viewId="testing.account-facts" columns={columns} dataSource={rows} rowKey="candidate_id" loading={query.isPending} error={query.error} emptyTitle="暂无账号事实记录" emptyHint="执行产生的账号状态候选会显示在这里。" pagination={{ page, pageSize: 50, total: query.data?.total || 0, onChange: next => setPage(next) }} toolbar={<Select aria-label="事实状态" value={status} onChange={value => { setStatus(value); setPage(1) }} style={{ width: 150 }} options={[{ value: '', label: '全部状态' }, { value: 'candidate', label: '待复核' }, { value: 'confirmed', label: '已确认' }, { value: 'rejected', label: '已拒绝' }]} />} />
    <Drawer title="自动核验规则" width="min(860px, 100vw)" open={rulesOpen} onClose={() => setRulesOpen(false)} styles={{ body: { display: 'flex', flexDirection: 'column', minHeight: 0 } }}><DataTable fill viewId="testing.account-fact-rules" columns={ruleColumns} dataSource={rules.data?.items} rowKey="rule_id" loading={rules.isPending} error={rules.error} emptyTitle="尚未配置自动核验规则" emptyHint="将已发布的必验断言关联到账号字段，核验通过后在有效期内使用。当前支持严格 Web 断言。" toolbar={<Button type="primary" onClick={() => editRule()}>添加规则</Button>} /></Drawer>
    <Drawer title="账号事实详情" width="min(560px, 100vw)" open={!!selected} onClose={() => !busy && setSelected(undefined)} footer={selected?.status === 'candidate' ? <Space><Button disabled={busy} onClick={() => setSelected(undefined)}>取消</Button><Button danger loading={busy} onClick={() => void decide(false)}>拒绝候选</Button><Button type="primary" loading={busy} disabled={selected.stale || selected.busy || !selected.scope_complete} onClick={() => void decide(true)}>人工确认</Button></Space> : null}>
      {error && <Alert type="error" showIcon message={error} />}
      {selected && <><p>{selected.account_name || selected.account_id}</p>{Object.entries(selected.proposed).map(([key, value]) => <p key={key}>{fieldLabel(key)}：{valueLabel(key, selected.before[key] || 'unknown')} → {valueLabel(key, value)}</p>)}<span className="config-evidence-reference">来源会话：{selected.session_id}</span>
        {selected.status === 'candidate' ? <><Alert type="info" showIcon message={selected.stale ? '账号事实已变化，请重新观察。' : selected.busy ? '账号正在使用，释放后可人工复核。' : !selected.scope_complete ? '来源缺少构建或平台信息，暂不能确认。' : '人工确认将记录复核依据，并按指定有效期使用。'} /><Form form={decisionForm} layout="vertical" initialValues={{ validHours: 24 }} className="config-drawer-section"><Form.Item name="evidence_seq" label="观察依据" rules={[{ required: true, message: '请选择来源会话中的观察' }]}><Select loading={observations.isPending} options={observations.data?.items.map(e => ({ value: e.seq, label: `#${e.seq} · ${e.type} · ${e.at}` }))} /></Form.Item>{observations.error && <Alert type="error" message={errText(observations.error)} />}<Form.Item name="validHours" label="有效期（小时）" rules={[{ required: true }]}><InputNumber min={1} max={720} /></Form.Item><Form.Item name="reason" label="复核说明" rules={[{ required: true, whitespace: true, message: '请填写复核说明' }]}><Input.TextArea rows={3} maxLength={300} /></Form.Item></Form></> : <p>{selected.decision.reason || '无补充说明'}{selected.decision.expires_at ? ` · 有效至 ${new Date(selected.decision.expires_at * 1000).toLocaleString()}` : ''}</p>}</>}
    </Drawer>
    <Modal cancelText="取消" okText="保存" title={editing?.rule_id ? '编辑自动核验规则' : '添加自动核验规则'} width={600} open={!!editing} confirmLoading={busy} onCancel={() => !busy && setEditing(undefined)} onOk={() => void saveRule()} destroyOnHidden>
      {error && <Alert type="error" showIcon message={error} />}<p className="config-secondary">规则只认可指定用例的冻结断言及其新鲜观察。修改发布计划后，需要重新保存对应规则。</p>
      <Form form={ruleForm} layout="vertical" className="config-drawer-section config-rule-form"><Form.Item name="name" label="规则名称" rules={[{ required: true, whitespace: true }]}><Input maxLength={100} /></Form.Item><Form.Item name="app_id" label="应用" rules={[{ required: true }]}><Select options={rules.data?.apps.map(a => ({ value: a.id, label: a.name }))} /></Form.Item><Space align="start"><Form.Item name="env" label="环境" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item><Form.Item name="platform" label="平台" rules={[{ required: true }]}><Select style={{ width: 140 }} options={[{ value: 'web', label: 'Web' }]} /></Form.Item></Space><Form.Item name="build" label="构建版本" rules={[{ required: true, whitespace: true }]}><Input placeholder="与执行证据中的应用构建一致" /></Form.Item><Form.Item name="case_id" label="核验用例" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={rules.data?.cases.map(c => ({ value: c.case_id, label: c.name }))} onChange={() => { ruleForm.setFieldValue('point_id', undefined); ruleForm.setFieldValue('build_point_id', undefined) }} /></Form.Item><Form.Item name="point_id" label="必验断言" rules={[{ required: true }]}><Select options={rules.data?.cases.find(c => c.case_id === caseId)?.points.map(p => ({ value: p.point_id, label: p.label }))} /></Form.Item><Form.Item name="build_point_id" label="构建版本断言" extra="选择精确核对上述构建版本的必验断言，避免旧版本证据被复用。" rules={[{ required: true }]}><Select options={rules.data?.cases.find(c => c.case_id === caseId)?.points.filter(p => ['text_equals', 'value_equals'].includes(p.predicate || '') && p.value === build).map(p => ({ value: p.point_id, label: p.label }))} /></Form.Item><Space align="start"><Form.Item name="facet_key" label="账号字段" rules={[{ required: true }]}><Select style={{ width: 190 }} options={rules.data?.fields.map(f => ({ value: f.key, label: f.label }))} onChange={() => ruleForm.setFieldValue('facet_value', undefined)} /></Form.Item><Form.Item name="facet_value" label="核验后的值" rules={[{ required: true }]}><Select style={{ width: 190 }} options={rules.data?.fields.find(f => f.key === facetKey)?.options} /></Form.Item></Space><Form.Item name="valid_for_seconds" label="有效期" rules={[{ required: true }]}><InputNumber min={60} max={2592000} step={3600} addonAfter="秒" /></Form.Item><Form.Item name="enabled" label="启用规则" valuePropName="checked"><Switch /></Form.Item></Form>
    </Modal>
  </section>
}
