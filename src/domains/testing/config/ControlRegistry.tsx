import './ConfigWorkspace.css'
import { projectHref } from '../workbench/projectNavigation'
import { recordAudit } from '@/domains/admin/audit/auditLog'
import { Link } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, EmptyState, Input, Select, Skeleton, errText } from '@/ui'
import { listV5Controls, probeV5Control, saveV5Control, type V5Control } from '@/api/v5'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { unwrapOne } from '@/lib/unwrap'

export function ControlRegistry({ projectId, appId }: { projectId: string; appId?: string }) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['v5-controls', projectId], queryFn: async () => {
    const data = unwrapOne<{ items: V5Control[]; identity_conflicts: { control_id: string; count: number }[] }>(await listV5Controls(projectId))
    if (!Array.isArray(data?.items) || !Array.isArray(data?.identity_conflicts)) throw new Error('控件注册表返回不完整，无法确认控件清单与身份冲突。请重新读取。')
    return data
  }, enabled: !!projectId })
  const [picked, setPicked] = useState('')
  const baseline = useRef<V5Control | undefined>(undefined)
  const [stale, setStale] = useState(false)
  const control = query.data?.items.find(row => row.control_id === picked)
  const [kind, setKind] = useState('test_id')
  const [value, setValue] = useState('')
  const [name, setName] = useState('')
  const [cardinality, setCardinality] = useState('one')
  const [sensitive, setSensitive] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [sn, setSn] = useState('')
  const [url, setUrl] = useState('')
  const [probe, setProbe] = useState<Record<string, unknown> | null>(null)
  const draftDirty = useRef(false)
  useEffect(() => {
    if (control && baseline.current?.control_id === control.control_id && draftDirty.current) { setStale(baseline.current.revision !== control.revision); return }
    baseline.current = control; setStale(false)
    const cfg = control?.locator_spec?.playwright
    setKind(cfg?.selector.kind || 'test_id'); setValue(cfg?.selector.value || '')
    setName(cfg?.selector.name || ''); setCardinality(cfg?.cardinality || 'one')
    setSensitive(!!control?.sensitive); setReviewed(false); setProbe(null)
  }, [control])
  useEffect(() => { setNotice('') }, [projectId, picked])
  useEffect(() => { setPicked('') }, [projectId])
  const spec: V5Control['locator_spec'] = { playwright: { contract: 'web.locator.v1', scope: { kind: 'page', page_id: 'main' },
    selector: { kind, value, ...(kind === 'role' ? { name, exact: true } : kind === 'label' ? { exact: true } : {}) }, cardinality } }
  const saved = baseline.current?.locator_spec?.playwright || control?.locator_spec?.playwright
  const dirty = !!control && (!saved || kind !== saved.selector.kind || value !== saved.selector.value ||
    name !== (saved.selector.name || '') || cardinality !== saved.cardinality || sensitive !== (baseline.current?.sensitive ?? control.sensitive))
  draftDirty.current = dirty
  useUnsavedChanges(dirty)
  useEffect(() => { setReviewed(false) }, [kind, value, name, cardinality, sensitive])
  const conflict = query.data?.identity_conflicts.some(row => row.control_id === picked)
  async function save(publish: boolean) {
    if (!control || stale) return
    setBusy(true); setNotice('')
    try {
      await saveV5Control(projectId, picked, { expected_revision: baseline.current?.revision ?? control.revision, locator_spec: spec, sensitive, publish })
      baseline.current = { ...control, locator_spec: spec, sensitive }
      draftDirty.current = false
      await qc.invalidateQueries({ queryKey: ['v5-controls', projectId] })
      recordAudit('控件保存或发布')
      setNotice(publish ? '控件已发布；受影响用例需要重新核对并发布。' : '草稿已保存。')
    } catch (error) { setNotice(errText(error, '保存失败，请刷新检查版本冲突。')) }
    finally { setBusy(false) }
  }
  async function observe() {
    if (!control || stale) return
    setBusy(true); setNotice('')
    try { setProbe(unwrapOne<Record<string, unknown>>(await probeV5Control(projectId, picked, { expected_revision: control.revision, sn, url })) ?? null) }
    catch (error) { setNotice(errText(error, '只读探测失败')) }
    finally { setBusy(false) }
  }
  if (!projectId) return <EmptyState title="缺少项目归属" hint="请从项目工作台进入控件配置。" />
  if (query.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (query.error) return <EmptyState title="控件读取失败" hint={errText(query.error)} action={<Button onClick={() => void query.refetch()}>重试</Button>} />
  return <section aria-label="控件注册表" className="config-workspace">
    <header className="config-workspace-heading"><div><h1>控件定位</h1><p>补充控件定位，核对后发布。</p></div></header>
    {!!query.data?.identity_conflicts.length && <p role="alert">发现重复控件身份，请先处理冲突：{query.data.identity_conflicts.map(row => row.control_id).join('、')}</p>}
    <Select aria-label="选择控件" value={picked || undefined} placeholder="选择控件" style={{ width: '100%' }} disabled={busy} onChange={value => { if (dirty && value !== picked) { setNotice('请先保存当前控件草稿，再切换控件。'); return } setPicked(value) }}
      options={query.data?.items.map(row => ({ value: row.control_id, label: `${row.target_desc || '未命名控件'} · ${row.publish_state === 'published' ? '已发布' : '草稿'}` }))} />
    {!query.data?.items.length && <EmptyState title="本项目尚无控件" hint="导入或编译用例后，需要补充定位的控件会显示在这里。" />}
    {stale && <p role="alert">此控件已有新版本，当前草稿保留。请重新读取并核对版本后再提交。</p>}
    {control && <>
      <details className="config-secondary"><summary>发布记录</summary><p>修订 {control.revision} · {control.publish_state === 'published' ? '已发布' : '草稿'} · {control.published_at || '尚未发布'}</p></details>
      {control.scope !== 'page' && <p role="alert">首期仅支持主页面 scope；此控件需要人工调整作用域，不能静默映射。</p>}
      <div className="w-form-grid config-control-fields"><label>定位类型<Select aria-label="定位类型" disabled={busy} value={kind} onChange={setKind} options={['test_id', 'role', 'label', 'css'].map(value => ({ value, label: value }))} /></label>
      <label>定位值<Input aria-label="定位值" disabled={busy} value={value} onChange={event => setValue(event.target.value)} /></label>
      {kind === 'role' && <label>准确名称<Input aria-label="准确名称" disabled={busy} value={name} onChange={event => setName(event.target.value)} /></label>}
      <label>目标数量<Select aria-label="目标数量" disabled={busy} value={cardinality} onChange={setCardinality} options={[{ value: 'one', label: '唯一目标' }, { value: 'set', label: '多个目标（仅读取）' }]} /></label>
      </div><Checkbox disabled={busy} checked={sensitive} onChange={event => setSensitive(event.target.checked)}>敏感控件（禁止明文事实与模型输出）</Checkbox>
      <Checkbox disabled={busy || stale} checked={reviewed} onChange={event => setReviewed(event.target.checked)}>已人工核对定位、作用域和敏感属性</Checkbox>
      <div className="flex flex-wrap gap-2"><Button disabled={busy || stale || conflict || !value.trim() || control.scope !== 'page'} onClick={() => void save(false)}>保存定位草稿</Button>
        <Button type="primary" disabled={busy || stale || conflict || !reviewed || !value.trim() || control.scope !== 'page'} onClick={() => void save(true)}>发布控件</Button>
        <Button disabled={busy} onClick={() => void query.refetch()}>检查新版本</Button><Button disabled={busy || !dirty} onClick={() => { draftDirty.current = false; baseline.current = undefined; setPicked(''); setNotice('已放弃本控件草稿，请重新选择控件。') }}>放弃草稿</Button></div>
      <details><summary>只读探测（独立无登录浏览器，不点击或输入）</summary>
        <label>Web 设备标识<Input aria-label="探测设备" placeholder="web节点ID" value={sn} onChange={event => setSn(event.target.value)} /></label>
        <label>受控页面 URL<Input aria-label="探测页面" placeholder="https://..." value={url} onChange={event => setUrl(event.target.value)} /></label>
        <Button disabled={busy || dirty || !sn || !url || conflict} onClick={() => void observe()}>探测已保存定位</Button>
        {dirty && <p>请先保存本次修改，再探测对应版本。</p>}
        {probe && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(probe, null, 2)}</pre>}
      </details>
    </>}
    {notice && <p role="status">{notice}</p>}
    {appId && <p><Link to={projectHref(projectId, { tab: 'cases', appId })}>返回用例，核对受影响的执行配置</Link></p>}
  </section>
}
