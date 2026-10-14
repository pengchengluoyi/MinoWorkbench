import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, EmptyState, Input, Select, Skeleton, errText } from '@/ui'
import { listV5Controls, probeV5Control, saveV5Control, type V5Control } from '@/api/v5'
import { unwrapOne } from '@/lib/unwrap'

export function ControlRegistry({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['v5-controls', projectId], queryFn: async () => unwrapOne<{ items: V5Control[]; identity_conflicts: { control_id: string; count: number }[] }>(await listV5Controls(projectId)), enabled: !!projectId })
  const [picked, setPicked] = useState('')
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
  useEffect(() => {
    const cfg = control?.locator_spec.playwright
    setKind(cfg?.selector.kind || 'test_id'); setValue(cfg?.selector.value || '')
    setName(cfg?.selector.name || ''); setCardinality(cfg?.cardinality || 'one')
    setSensitive(!!control?.sensitive); setReviewed(false); setProbe(null)
  }, [control])
  useEffect(() => { setNotice('') }, [projectId, picked])
  useEffect(() => { setPicked('') }, [projectId])
  const spec: V5Control['locator_spec'] = { playwright: { contract: 'web.locator.v1', scope: { kind: 'page', page_id: 'main' },
    selector: { kind, value, ...(kind === 'role' ? { name, exact: true } : kind === 'label' ? { exact: true } : {}) }, cardinality } }
  const saved = control?.locator_spec.playwright
  const dirty = !!control && (!saved || kind !== saved.selector.kind || value !== saved.selector.value ||
    name !== (saved.selector.name || '') || cardinality !== saved.cardinality || sensitive !== control.sensitive)
  const conflict = query.data?.identity_conflicts.some(row => row.control_id === picked)
  async function save(publish: boolean) {
    if (!control) return
    setBusy(true); setNotice('')
    try {
      await saveV5Control(projectId, picked, { expected_revision: control.revision, locator_spec: spec, sensitive, publish })
      await qc.invalidateQueries({ queryKey: ['v5-controls', projectId] })
      setNotice(publish ? '控件已发布；受影响用例需要重新核对并发布。' : '草稿已保存。')
    } catch (error) { setNotice(errText(error, '保存失败，请刷新检查版本冲突。')) }
    finally { setBusy(false) }
  }
  async function observe() {
    if (!control) return
    setBusy(true); setNotice('')
    try { setProbe(unwrapOne<Record<string, unknown>>(await probeV5Control(projectId, picked, { expected_revision: control.revision, sn, url })) ?? null) }
    catch (error) { setNotice(errText(error, '只读探测失败')) }
    finally { setBusy(false) }
  }
  if (!projectId) return <EmptyState title="缺少项目归属" hint="请从应用工作台进入控件配置。" />
  if (query.isLoading) return <Skeleton active paragraph={{ rows: 6 }} />
  if (query.error) return <EmptyState title="控件读取失败" hint={errText(query.error)} action={<Button onClick={() => void query.refetch()}>重试</Button>} />
  return <section aria-label="控件注册表" className="flex min-h-0 flex-1 flex-col overflow-auto" style={{ gap: 12 }}>
    <strong>控件注册表</strong>
    <p>文字用例编译后会生成本项目的草稿控件。先补充当前 Web 渠道定位，再人工核对并发布。运行时配置只读。</p>
    {!!query.data?.identity_conflicts.length && <p role="alert">发现重复控件身份，请先处理冲突：{query.data.identity_conflicts.map(row => row.control_id).join('、')}</p>}
    <Select aria-label="选择控件" value={picked || undefined} placeholder="选择控件" style={{ width: '100%' }} onChange={setPicked}
      options={query.data?.items.map(row => ({ value: row.control_id, label: `${row.target_desc || row.control_id} · ${row.publish_state} · r${row.revision}` }))} />
    {!query.data?.items.length && <EmptyState title="本项目尚无控件" hint="请在本项目内导入或重新编译用例；历史 _project 控件不能直接发布为本项目的 V5 配置。" />}
    {control && <>
      <p>{control.control_id} · 项目 {control.project_id} · 当前版本 {control.revision} · {control.publish_state} · {control.published_by} {control.published_at}</p>
      {control.scope !== 'page' && <p role="alert">首期仅支持主页面 scope；此控件需要人工调整作用域，不能静默映射。</p>}
      <label>定位类型<Select aria-label="定位类型" value={kind} onChange={setKind} options={['test_id', 'role', 'label', 'css'].map(value => ({ value, label: value }))} /></label>
      <label>定位值<Input aria-label="定位值" value={value} onChange={event => setValue(event.target.value)} /></label>
      {kind === 'role' && <label>准确名称<Input aria-label="准确名称" value={name} onChange={event => setName(event.target.value)} /></label>}
      <label>目标数量<Select aria-label="目标数量" value={cardinality} onChange={setCardinality} options={[{ value: 'one', label: '唯一目标 one' }, { value: 'set', label: '目标集合 set（只用于事实读取）' }]} /></label>
      <Checkbox checked={sensitive} onChange={event => setSensitive(event.target.checked)}>敏感控件（禁止明文事实与模型输出）</Checkbox>
      <Checkbox checked={reviewed} onChange={event => setReviewed(event.target.checked)}>已人工核对定位、作用域和敏感属性</Checkbox>
      <div className="flex gap-2"><Button disabled={busy || conflict || !value.trim() || control.scope !== 'page'} onClick={() => void save(false)}>保存定位草稿</Button>
        <Button type="primary" disabled={busy || conflict || !reviewed || !value.trim() || control.scope !== 'page'} onClick={() => void save(true)}>发布控件</Button>
        <Button disabled={busy} onClick={() => void query.refetch()}>刷新</Button></div>
      <details><summary>只读探测（独立无登录浏览器，不点击或输入）</summary>
        <label>Web 设备标识<Input aria-label="探测设备" placeholder="web节点ID" value={sn} onChange={event => setSn(event.target.value)} /></label>
        <label>受控页面 URL<Input aria-label="探测页面" placeholder="https://..." value={url} onChange={event => setUrl(event.target.value)} /></label>
        <Button disabled={busy || dirty || !sn || !url || conflict} onClick={() => void observe()}>探测已保存定位</Button>
        {dirty && <p>请先保存本次修改，再探测对应版本。</p>}
        {probe && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(probe, null, 2)}</pre>}
      </details>
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>
}
