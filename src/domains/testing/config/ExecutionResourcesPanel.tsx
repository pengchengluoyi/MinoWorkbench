import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Alert, Button, Checkbox, DataTable, Drawer, Form, Input, Select, Space, StatusPill, Switch, errText, useFeedback, type DataColumn } from '@/ui'
import './ConfigWorkspace.css'

type Domain = { domain_id: string; name: string; env: string; app_id: string; account_ids: string[]; enabled: boolean }
type Lease = { resource_key: string; run_id: string; attempt_id: string; epoch: number; expires_at: number; state: string }
type Resources = { domains: Domain[]; leases: Lease[]; apps: { id: string; name: string }[]; accounts: { id: string; name: string; env: string }[] }
type Recovery = { expected_digest: string; resources: { resource_key: string; epoch: number; observations: { session_id: string; seq: number; type: string; observed_at: string }[] }[] }
const reasons: Record<string, string> = {
  recovery_screenshot_unavailable: '当前执行节点未取得可用截图，请确认设备连接和业务页面已准备好。',
  recovery_stop_evidence_required: '请先核对原任务的停止证据。停止确认后，还需要核对各项资源的业务状态。',
  recovery_resources_missing: '该任务没有可恢复的组合租约。', recovery_task_running: '任务仍在运行，请先停止任务。',
  recovery_resource_scope_incomplete: '资源记录不完整，暂不能解除隔离。', recovery_snapshot_changed: '资源状态已变化，请重新读取后核对。',
  recovery_evidence_not_fresh: '观察早于停止确认，需要重新观察资源状态。', recovery_evidence_expired: '观察证据已过期，请重新观察。',
}
const reasonText = (error: unknown) => { const text = errText(error); return reasons[text] || text }
export function ExecutionResourcesPanel({ projectId }: { projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  return <ResourcesView key={`${owner}:${projectId}`} projectId={projectId} owner={owner} />
}
function ResourcesView({ projectId, owner }: { projectId: string; owner: string }) {
  const base = `/project/${encodeURIComponent(projectId)}/execution-resources`
  const feedback = useFeedback()
  const navigate = useNavigate()
  const openTask = async (id: string) => {
    try {
      const task = unwrapOne<{ app_id: string }>(await request({ url: `/case-runner/run/${encodeURIComponent(id)}`, method: 'get' }))
      navigate(`/testing/projects/${encodeURIComponent(projectId)}?tab=tasks&appId=${encodeURIComponent(task.app_id)}&run=${encodeURIComponent(id)}`)
    } catch (error) { feedback.fail(errText(error, '无法读取所属任务')) }
  }
  const query = useQuery({ queryKey: ['execution-resources', owner, projectId], enabled: !!owner,
    queryFn: async () => unwrapOne<Resources>(await request({ url: base, method: 'get' })) })
  const [editing, setEditing] = useState<Partial<Domain>>()
  const [domainsOpen, setDomainsOpen] = useState(false)
  const [runId, setRunId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [preview, setPreview] = useState<{ session_id: string; seq: number }>()
  const [form] = Form.useForm<Domain>()
  const [recoveryForm] = Form.useForm<{ reason: string; evidence: Record<string, string> }>()
  const env = Form.useWatch('env', form)
  const recovery = useQuery({ queryKey: ['resource-recovery', owner, projectId, runId], enabled: !!runId,
    queryFn: async () => unwrapOne<Recovery>(await request({ url: `${base}/runs/${encodeURIComponent(runId)}/recovery`, method: 'get' })), retry: false })
  const image = useQuery({ queryKey: ['recovery-image', owner, preview?.session_id, preview?.seq], enabled: !!preview,
    queryFn: async () => unwrapOne<{ mimeType: string; image_base64: string }>(await request({ url: `/case-runner/sessions/${encodeURIComponent(preview!.session_id)}/screenshot`, method: 'get', params: { seq: preview!.seq } })) })
  const observe = async () => {
    setBusy(true); setError(''); setAcknowledged(false)
    try {
      const result = unwrapOne<{ observations: { session_id: string; seq: number }[] }>(await request({ url: `${base}/runs/${encodeURIComponent(runId)}/recovery/observe`, method: 'post' }))
      await recovery.refetch()
      if (result.observations.length) setPreview(result.observations[0])
      feedback.ok('已采集当前状态，请核对截图中的业务状态与账号身份')
    } catch (e) { setError(reasonText(e)) } finally { setBusy(false) }
  }
  const edit = (row?: Domain) => { setError(''); setEditing(row || {}); form.resetFields(); form.setFieldsValue(row || { env: 'test', app_id: '', account_ids: [], enabled: true }) }
  const save = async () => {
    const values = await form.validateFields().catch(() => null)
    if (!values || !editing) return
    setBusy(true); setError('')
    try {
      await request({ url: `${base}/domains/${encodeURIComponent(editing.domain_id || 'new')}`, method: 'put', data: { name: values.name.trim(), env: values.env.trim(), app_id: values.app_id || '', account_ids: values.account_ids || [], enabled: values.enabled } })
      feedback.ok('共享数据域已保存'); setEditing(undefined); await query.refetch()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  const recheckStop = async () => {
    setBusy(true); setError('')
    try { await request({ url: `/case-runner/tasks/${encodeURIComponent(runId)}/write-safety/recheck`, method: 'post' }); await recovery.refetch() }
    catch (e) { setError(reasonText(e)) } finally { setBusy(false) }
  }
  const recover = async () => {
    const values = await recoveryForm.validateFields().catch(() => null)
    if (!values || !recovery.data || !acknowledged) return
    setBusy(true); setError('')
    try {
      const proofs = recovery.data.resources.map(resource => {
        const selected = resource.observations.find(o => `${o.session_id}:${o.seq}` === values.evidence[resource.resource_key])!
        return { resource_key: resource.resource_key, session_id: selected.session_id, seq: selected.seq, statement: values.reason.trim() }
      })
      await request({ url: `${base}/runs/${encodeURIComponent(runId)}/recovery`, method: 'post', data: { request_id: crypto.randomUUID(), expected_digest: recovery.data.expected_digest, reason: values.reason.trim(), proofs } })
      feedback.ok('资源已恢复，后续执行将领取新租约'); setRunId(''); await query.refetch()
    } catch (e) { setError(reasonText(e)) } finally { setBusy(false) }
  }
  const openRecovery = (id: string) => { setRunId(id); setError(''); setPreview(undefined); setAcknowledged(false); recoveryForm.resetFields() }
  const resourceName = (key: string) => {
    const domain = query.data?.domains.find(d => key === `domain:${d.domain_id}`)
    const account = query.data?.accounts.find(a => key === `account:${projectId}:${a.id}`)
    return domain ? `共享数据 · ${domain.name}` : account ? `账号 · ${account.name}` : key.startsWith('device:') ? `设备 · ${key.slice(7)}` : key
  }
  const leases: DataColumn<Lease>[] = [
    { key: 'resource', title: '资源', render: (_, row) => <span>{resourceName(row.resource_key)}</span> },
    { key: 'state', title: '状态', width: 130, render: (_, row) => <StatusPill status={row.state === 'isolated' || row.expires_at * 1000 <= Date.now() ? 'warn' : 'running'}>{row.state === 'isolated' ? '已隔离' : row.expires_at * 1000 <= Date.now() ? '需核验' : '使用中'}</StatusPill> },
    { key: 'run', title: '所属任务', width: 120, render: (_, row) => <Button type="link" onClick={() => void openTask(row.run_id)}>查看任务</Button> },
    { key: 'action', title: '操作', width: 130, render: (_, row) => row.state === 'isolated' || row.expires_at * 1000 <= Date.now() ? <Button type="link" onClick={() => openRecovery(row.run_id)}>恢复资源</Button> : null },
  ]
  const domains: DataColumn<Domain>[] = [
    { key: 'name', title: '数据域', dataIndex: 'name' },
    { key: 'env', title: '环境', dataIndex: 'env', width: 100 },
    { key: 'app', title: '应用', render: (_, row) => row.app_id ? query.data?.apps.find(a => a.id === row.app_id)?.name || row.app_id : '全部应用' },
    { key: 'accounts', title: '账号范围', render: (_, row) => row.account_ids.length ? `${row.account_ids.length} 个账号` : '环境内全部账号' },
    { key: 'state', title: '状态', width: 90, render: (_, row) => <StatusPill status={row.enabled ? 'pass' : 'muted'}>{row.enabled ? '启用' : '停用'}</StatusPill> },
    { key: 'action', title: '操作', width: 90, render: (_, row) => <Button type="link" onClick={() => edit(row)}>编辑</Button> },
  ]
  return <section className="config-workspace config-workspace--fill" aria-label="执行资源">
    <header className="config-workspace-heading"><div><h1>执行资源</h1><p>查看占用情况，处理需要恢复的隔离资源。</p></div><Space wrap><Button onClick={() => setDomainsOpen(true)}>共享数据域</Button><Button onClick={() => void query.refetch()}>刷新</Button></Space></header>
    <DataTable fill viewId="testing.execution-resources" columns={leases} dataSource={query.data?.leases} rowKey="resource_key" loading={query.isPending} error={query.error} emptyTitle="当前没有占用或隔离的资源" />
    <Drawer title="共享数据域" width="min(860px, 100vw)" open={domainsOpen} onClose={() => setDomainsOpen(false)} styles={{ body: { display: 'flex', flexDirection: 'column', minHeight: 0 } }}><DataTable fill viewId="testing.resource-domains" columns={domains} dataSource={query.data?.domains} rowKey="domain_id" loading={query.isPending} emptyTitle="尚未添加共享数据域" emptyHint="同一业务数据需要避免并发修改时，添加一个共享数据域。" toolbar={<><Button type="primary" onClick={() => edit()}>添加数据域</Button></>} /></Drawer>
    <Drawer title={editing?.domain_id ? '编辑共享数据域' : '添加共享数据域'} width="min(500px, 100vw)" open={!!editing} onClose={() => !busy && setEditing(undefined)} footer={<Space wrap><Button disabled={busy} onClick={() => setEditing(undefined)}>取消</Button><Button type="primary" loading={busy} onClick={() => void save()}>保存</Button></Space>}>
      {error && <Alert type="error" showIcon message={error} />}<Form form={form} layout="vertical"><Form.Item name="name" label="名称" rules={[{ required: true, whitespace: true, message: '请填写数据域名称' }]}><Input maxLength={100} /></Form.Item><Form.Item name="env" label="环境" rules={[{ required: true, whitespace: true }]}><Input maxLength={32} onChange={() => form.setFieldValue('account_ids', [])} /></Form.Item><Form.Item name="app_id" label="应用"><Select allowClear placeholder="全部应用" options={query.data?.apps.map(a => ({ value: a.id, label: a.name }))} /></Form.Item><Form.Item name="account_ids" label="账号" extra="留空表示该环境的全部账号"><Select mode="multiple" allowClear placeholder="选择账号" options={query.data?.accounts.filter(a => a.env === env).map(a => ({ value: a.id, label: a.name }))} /></Form.Item><Form.Item name="enabled" label="启用互斥" valuePropName="checked"><Switch /></Form.Item></Form>
    </Drawer>
    <Drawer title="恢复隔离资源" width="min(620px, 100vw)" open={!!runId} onClose={() => !busy && setRunId('')} footer={<Space wrap><Button disabled={busy} onClick={() => setRunId('')}>取消</Button><Button type="primary" loading={busy} disabled={!recovery.data || !acknowledged} onClick={() => void recover()}>确认复位并恢复资源</Button></Space>}>
      <p className="config-secondary">先在业务侧完成复位，再逐项选择停止确认之后的观察作为依据。恢复只解除资源隔离，原用例结论和未知写入记录会保留。</p>
      <div className="config-drawer-section"><Space wrap><Button loading={busy} onClick={() => void recheckStop()}>核对停止证据</Button><Button disabled={!recovery.data || busy} onClick={() => void observe()}>采集复位后状态</Button></Space></div>
      {recovery.isPending && <p role="status">正在读取资源与可用观察…</p>}{(error || recovery.error) && <Alert type="error" showIcon message={error || reasonText(recovery.error)} />}
      {preview && <div className="config-drawer-section"><h4>复位后的观察</h4>{image.isPending ? <p role="status">正在读取截图…</p> : image.error ? <Alert type="error" message={errText(image.error)} /> : image.data && <img alt="复位后业务状态，须人工核对" src={`data:${image.data.mimeType};base64,${image.data.image_base64}`} style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain' }} />}</div>}
      {recovery.data && <Form form={recoveryForm} layout="vertical" className="config-drawer-section">{recovery.data.resources.map(resource => <Form.Item key={resource.resource_key} name={['evidence', resource.resource_key]} label={resourceName(resource.resource_key)} rules={[{ required: true, message: '请选择复位后的观察依据' }]} extra={!resource.observations.length ? '暂无停止确认后 30 分钟内的可用观察，请重新观察业务状态。' : undefined}><Select placeholder="选择复位后的观察" onChange={value => { const selected = resource.observations.find(o => `${o.session_id}:${o.seq}` === value); setPreview(selected); setAcknowledged(false) }} options={resource.observations.map(o => ({ value: `${o.session_id}:${o.seq}`, label: `${o.observed_at} · #${o.seq} · ${o.type}` }))} /></Form.Item>)}<Form.Item name="reason" label="复位核对说明" rules={[{ required: true, min: 5, whitespace: true, message: '请说明如何确认业务和资源已复位' }]}><Input.TextArea rows={3} maxLength={500} /></Form.Item><Checkbox checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}>我已根据所选观察核对全部受影响的业务状态</Checkbox></Form>}
    </Drawer>
  </section>
}
