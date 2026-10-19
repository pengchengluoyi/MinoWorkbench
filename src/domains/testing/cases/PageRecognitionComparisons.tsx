import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { Alert, Button, DataTable, Form, Input, Modal, Select, Space, StatusPill, errText, useFeedback, type DataColumn } from '@/ui'
import '../config/ConfigWorkspace.css'

type Prediction = { chosen: string; ambiguous: boolean; confidence: number }
type Sample = { sample_id: string; session_id: string; case_id: string; seq: number; at: string; platform: string; build: string; graph_digest: string; baseline: Prediction; reviewed: Prediction; expected_state_id: string | null; revision: number; eligible: boolean; excluded_reason: string; state_ids: string[] }
type Summary = { platform: string; build: string; graph_digest: string; samples: number; cases: number; baseline_errors: number; reviewed_errors: number; error_rate_delta: number }
type Comparison = { owner_user_id: string; project_id: string; app_id: string; items: Sample[]; total: number; summaries: Summary[]; statistics_window: number; truncated: boolean; unlabeled: number; excluded: number }
export function PageRecognitionComparisons({ owner, projectId, appId, pages }: { owner: string; projectId: string; appId: string; pages: { state_id: string; label: string }[] }) {
  const base = `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/understanding/comparisons`
  const feedback = useFeedback()
  const [page, setPage] = useState(1)
  const [platform, setPlatform] = useState('')
  const [build, setBuild] = useState('')
  const [selected, setSelected] = useState<Sample>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form] = Form.useForm<{ expected_state_id: string; reason: string }>()
  const query = useQuery({ queryKey: ['page-recognition-comparisons', owner, projectId, appId, page, platform, build], enabled: !!owner,
    queryFn: async () => unwrapOne<Comparison>(await request({ url: base, method: 'get', params: { platform, build, limit: 50, offset: (page - 1) * 50 } })) })
  const data = query.data?.owner_user_id === owner && query.data.project_id === projectId && query.data.app_id === appId ? query.data : undefined
  const label = (id: string) => pages.find(p => p.state_id === id)?.label || id || '未识别到页面'
  const prediction = (value: Prediction) => value.ambiguous ? '多个页面相近，未确定' : label(value.chosen)
  const edit = (sample: Sample) => { setSelected(sample); setError(''); form.resetFields(); form.setFieldValue('expected_state_id', sample.expected_state_id ?? undefined) }
  const save = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values || !selected) return
    setBusy(true); setError('')
    try {
      await request({ url: `${base}/${encodeURIComponent(selected.session_id)}/events/${selected.seq}`, method: 'post', data: { ...values, reason: values.reason.trim(), request_id: crypto.randomUUID(), expected_revision: selected.revision } })
      feedback.ok('样本复核已记录'); setSelected(undefined); await query.refetch()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const columns: DataColumn<Sample>[] = [
    { key: 'time', title: '观察时间', width: 180, dataIndex: 'at' },
    { key: 'scope', title: '平台 / 构建', width: 160, render: (_, r) => <div className="config-stack"><span>{r.platform}</span><span className="config-secondary">{r.build}</span></div> },
    { key: 'baseline', title: '不使用页面资料', render: (_, r) => prediction(r.baseline) },
    { key: 'reviewed', title: '使用页面资料', render: (_, r) => prediction(r.reviewed) },
    { key: 'expected', title: '人工复核', render: (_, r) => !r.eligible ? <StatusPill status="muted">{r.excluded_reason === 'knowledge_example' ? '知识示例，排除统计' : '证据不完整'}</StatusPill> : r.expected_state_id === null ? <StatusPill status="warn">待复核</StatusPill> : label(r.expected_state_id) },
    { key: 'actions', title: '操作', width: 150, render: (_, r) => <Space><Link to={`/testing/projects/${encodeURIComponent(projectId)}?tab=session-log&appId=${encodeURIComponent(appId)}&session=${encodeURIComponent(r.session_id)}`}>查看会话</Link>{r.eligible && <Button type="link" onClick={() => edit(r)}>复核</Button>}</Space> },
  ]
  return <section className="config-workspace-section" aria-label="页面识别对照">
    <h3>页面识别对照</h3><p className="config-secondary">同一观察分别运行有、无页面资料的定位规则。仅统计人工复核的独立样本，按平台、构建和资料版本分别计算。</p>
    {!!data?.summaries.length && <div className="config-comparison-stats">{data.summaries.map(s => <div className="config-comparison-stat" key={`${s.platform}:${s.build}:${s.graph_digest}`}><span>{s.platform} · {s.build}</span><strong>{s.baseline_errors} / {s.samples} → {s.reviewed_errors} / {s.samples}</strong><p className="config-secondary">资料使用前后误判数 · {s.cases} 个用例</p><p className="config-secondary">误判率下降 {(s.error_rate_delta * 100).toFixed(1)} 个百分点</p></div>)}</div>}
    {data && <p className="config-secondary">最近 {data.statistics_window} 条观察，待复核 {data.unlabeled} 条，排除 {data.excluded} 条。{data.truncated ? '仅统计最近 2000 条，请按平台和构建筛选。' : ''}</p>}
    <DataTable viewId="testing.page-recognition-comparison" columns={columns} dataSource={data?.items} rowKey="sample_id" loading={query.isPending} error={query.error} emptyTitle="暂无页面识别对照样本" emptyHint="使用已批准页面资料的新执行会记录对照。历史会话不会补造对照结果。" pagination={{ page, pageSize: 50, total: Math.min(data?.total || 0, 2000), onChange: next => setPage(next) }} toolbar={<div className="config-toolbar"><Select aria-label="对照平台" value={platform} style={{ width: 135 }} onChange={value => { setPlatform(value); setPage(1) }} options={[{ value: '', label: '全部平台' }, ...['web', 'android', 'ios', 'pc'].map(value => ({ value, label: value }))]} /><Input.Search aria-label="对照构建版本" placeholder="按完整构建版本筛选" allowClear style={{ width: 230 }} onSearch={value => { setBuild(value.trim()); setPage(1) }} /><Button onClick={() => void query.refetch()}>刷新对照</Button></div>} />
    <Modal cancelText="取消" okText="保存" title="复核页面识别样本" open={!!selected} confirmLoading={busy} onCancel={() => !busy && setSelected(undefined)} onOk={() => void save()} destroyOnHidden>{error && <Alert type="error" showIcon message={error} />}<Form form={form} layout="vertical"><Form.Item name="expected_state_id" label="观察中的真实页面" rules={[{ validator: (_, value) => typeof value === 'string' ? Promise.resolve() : Promise.reject(new Error('请选择实际页面或非本应用页面')) }]}><Select options={selected ? [{ value: '', label: '非本应用页面 / 不应识别为已有页面' }, ...selected.state_ids.map(id => ({ value: id, label: label(id) }))] : []} /></Form.Item><Form.Item name="reason" label="复核依据" rules={[{ required: true, whitespace: true }]}><Input.TextArea rows={3} maxLength={300} /></Form.Item></Form></Modal>
  </section>
}
