import './DevelopmentPanel.css'
import { normalizePlatforms, type PlatformInput } from '@/constants/appPlatforms'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Input, Modal, Select, Space, Spin, Switch, Tag, Typography } from 'antd'
import { getDevelopment, saveDevelopment, listPreparations, prepareDevelopment, configureIDE, reviewPreparation, recoverPreparation, parseIDEImport, type DevelopmentConfig, type DevelopmentBinding, type Preparation } from '@/api/development'
import { listRuntimeNodes, nodeIsOnline, type ScoutNode } from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { errText, useFeedback } from '@/ui'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

export function DevelopmentPanel({ appId, platforms }: { appId: string; platforms: PlatformInput }) {
  return <DevelopmentEditor key={appId} appId={appId} android={normalizePlatforms(platforms).includes('android')} />
}

function DevelopmentEditor({ appId, android }: { appId: string; android: boolean }) {
  const launchStep = useRef<HTMLDetailsElement>(null)
  const permissionStep = useRef<HTMLDetailsElement>(null)
  const feedback = useFeedback()
  const qc = useQueryClient()
  const key = ['development', appId]
  const [draft, setDraft] = useState<DevelopmentConfig | null>(null)
  const [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState('')
  const [paste, setPaste] = useState('')
  const [serverName, setServerName] = useState<string>()
  const [connectionName, setConnectionName] = useState('pycharm')

  const [followLogs, setFollowLogs] = useState(false)
  const followStarted = useRef(0)
  const adopted = useRef(new Set<string>())
  const connectionSave = useRef<{ id: string; config: DevelopmentConfig; revision: number } | null>(null)
  const [savingBinding, setSavingBinding] = useState(false)
  const [saveError, setSaveError] = useState('')
  const config = useQuery({ queryKey: key, queryFn: async () => unwrapOne<DevelopmentBinding>(await getDevelopment(appId)) })
  const nodes = useQuery({ queryKey: ['runtime', 'nodes'], queryFn: async () => unwrapOne<{ nodes?: ScoutNode[] }>(await listRuntimeNodes()) })
  const ops = useQuery({ queryKey: [...key, 'operations'], queryFn: async () => unwrapOne<{ items: Preparation[] }>(await listPreparations(appId)),
    refetchInterval: query => query.state.data?.items.some(x => ['running', 'queued'].includes(x.state)) ? 1500 : false })
  useEffect(() => {
    if (config.data && (!draft || JSON.stringify(draft) === saved)) {
      setDraft(config.data.config); setRevision(config.data.revision); setSaved(JSON.stringify(config.data.config))
    }
  }, [config.data, draft, saved])
  const dirty = !!draft && JSON.stringify(draft) !== saved
  useUnsavedChanges(dirty || !!paste)
  const items = useMemo(() => ops.data?.items ?? [], [ops.data])
  const completed = useRef('')
  useEffect(() => {
    const ids = items.filter(x => !['queued', 'running'].includes(x.state)).map(x => x.operation_id).join(',')
    if (ids !== completed.current) {
      completed.current = ids
      void qc.invalidateQueries({ queryKey: ['development', appId], exact: true })
    }
  }, [items, qc, appId])
  useEffect(() => {
    const pending = connectionSave.current
    if (!pending) return
    const op = items.find(item => item.operation_id === pending.id)
    if (!op || ['queued', 'running'].includes(op.state) || adopted.current.has(op.operation_id)) return
    adopted.current.add(op.operation_id)
    connectionSave.current = null
    if (op.state !== 'ready' || !op.result.connection) {
      setSaveError(op.result.reason || 'IDE 连接未保存成功，本页配置尚未保存。请处理下方操作结果后重试。')
      return
    }
    const next = { ...pending.config, connection_id: op.result.connection.connection_id, connection_revision: op.result.connection.revision }
    setDraft(next)
    setPaste('')
    setSavingBinding(true)
    void saveDevelopment(appId, { revision: pending.revision, config: next }).then(response => {
      const binding = unwrapOne<DevelopmentBinding>(response)
      if (!binding) throw new Error('服务器未返回保存结果')
      qc.setQueryData(['development', appId], binding)
      setDraft(binding.config); setRevision(binding.revision); setSaved(JSON.stringify(binding.config))
      feedback.ok('IDE 连接与本页配置均已保存，刷新后会保留')
    }).catch(error => {
      setSaveError(`IDE 连接已保存，但本页配置保存失败：${errText(error)}。无需再次导入，修正后点击保存设置。`)
    }).finally(() => setSavingBinding(false))
  }, [items, appId, feedback, qc])
  const parsed = useMemo(() => {
    if (!paste.trim()) return { rows: [], error: '' }
    try { return { rows: parseIDEImport(paste), error: '' } } catch (error) { return { rows: [], error: errText(error) } }
  }, [paste])
  const selectedServer = parsed.rows.length === 1 ? parsed.rows[0] : parsed.rows.find(x => x.name === serverName)
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }) }
  const save = useMutation({ mutationFn: () => saveDevelopment(appId, { revision, config: draft! }),
    onSuccess: response => { const next = unwrapOne<DevelopmentBinding>(response); setRevision(next.revision); setDraft(next.config); setSaved(JSON.stringify(next.config)); qc.setQueryData(key, next); setSaveError(''); feedback.ok('配置已保存，刷新后会保留') },
    onError: error => { setSaveError(errText(error)); feedback.fail(errText(error)) } })
  const action = useMutation({ mutationFn: async (name: string) => {
    const id = crypto.randomUUID()
    return prepareDevelopment(appId, name, revision, id)
  }, onSuccess: refresh, onError: error => { feedback.fail(errText(error)); refresh() } })
  const connect = useMutation({ mutationFn: async (list: boolean) => {
    const id = crypto.randomUUID()
    if (!list) connectionSave.current = { id, config: { ...draft! }, revision }
    return configureIDE(appId, { operation_id: id, node_id: draft!.node_id,
      action: list ? 'list_connections' : 'save_connection', connection_id: connectionName,
      connection_revision: draft!.connection_id === connectionName ? draft!.connection_revision : 0,
      connection: list ? {} : { url: selectedServer!.url, transport: selectedServer!.transport, headers: selectedServer!.headers ?? {}, header_env: selectedServer!.header_env ?? {} } })
  }, onSuccess: refresh, onError: error => { connectionSave.current = null; setSaveError(errText(error)); feedback.fail(errText(error)); refresh() } })
  const recover = useMutation({ mutationFn: (id: string) => recoverPreparation(appId, id), onSuccess: refresh, onError: error => feedback.fail(errText(error)) })
  const patch = (update: Partial<DevelopmentConfig>) => setDraft(old => old ? { ...old, ...update } : old)
  const busy = savingBinding || save.isPending || action.isPending || connect.isPending || items.some(x => ['running', 'queued'].includes(x.state))
  const unknown = items.some(x => ['execute', 'restart', 'build', 'install'].includes(x.action) && x.state === 'unknown' && !x.result.manual_review?.confirmed_idle)
  const check = config.data?.check
  const checked = !dirty && !paste.trim() && config.data?.checked_revision === revision && !!check?.project_matched
  const allowed = checked && draft?.execution_allowed && draft?.test_parameters_confirmed && !unknown
  const connections = Array.from(new Map(items.flatMap(x => x.node_id === draft?.node_id ? [...(x.result.connections ?? []), ...(x.result.connection ? [x.result.connection] : [])] : []).sort((a, b) => a.revision - b.revision).map(c => [c.connection_id, c])).values())
  const saveAll = () => {
    setSaveError('')
    if (draft?.enabled) {
      if (!draft.node_id || !draft.project_path.trim() || !draft.source_dir.trim()) { setSaveError('请先选择开发电脑，并填写 IDE 项目路径和应用源码目录。'); return }
      if (paste.trim()) {
        if (!selectedServer) { setSaveError(parsed.error || '请选择要导入的 IDE 连接。'); return }
        connect.mutate(false); return
      }
      if (!draft.connection_id || !draft.connection_revision) { setSaveError('请粘贴 IDE 连接配置，或选择该电脑上已有的连接。'); return }
    }
    save.mutate()
  }
  useEffect(() => {
    if (!followLogs) return
    if (!draft?.enabled || dirty || !draft.service_log_path) { setFollowLogs(false); return }
    const timer = window.setInterval(() => {
      if (Date.now() - followStarted.current > 10 * 60_000) { setFollowLogs(false); return }
      if (!busy && document.visibilityState === 'visible') action.mutate('logs', { onError: () => setFollowLogs(false) })
    }, 3000)
    return () => window.clearInterval(timer)
  }, [followLogs, busy, dirty, draft?.enabled, draft?.service_log_path, action])
  useEffect(() => {
    if (followLogs && items.find(x => x.action === 'logs')?.state === 'failed') setFollowLogs(false)
  }, [items, followLogs])
  const stages: Record<string, string> = { connecting: '连接 IDE', locating_process: '核对旧进程身份', stopping: '协作停止旧进程', no_old_process: '无旧进程，准备启动', starting: 'IDE 启动配置', building: 'IDE 构建', probing: '就绪和版本探测', validating_apk: '核对 APK 与设备版本', installing: '安装 APK', reading_logs: '读取配置日志' }
  const node = nodes.data?.nodes?.find(n => n.node_id === draft?.node_id)
  const statuses: Record<string, string> = { queued: '请求已接受', running: '正在准备', ready: '操作完成', failed: '失败', awaiting_developer: '需要开发者处理', unknown: '结果尚未确认' }
  if (config.isPending) return <Spin tip="读取开发环境配置" />
  if (config.isError) return <Alert type="error" showIcon message={errText(config.error)} action={<Button onClick={() => void config.refetch()}>重试</Button>} />
  if (!draft) return null
  const online = !!node && nodeIsOnline(node)
  const needsSave = dirty || !!paste.trim() || !revision
  const latest = [...items].filter(op => op.revision === revision && ['check', 'execute', 'restart', 'probe', 'build', 'install'].includes(op.action)).sort((a, b) => b.created_at - a.created_at)[0]
  const ready = online && checked && !needsSave && latest?.state === 'ready' && latest.result.target_ready === true
  const openStep = (ref: typeof launchStep) => { if (ref.current) { ref.current.open = true; ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' }) } }
  const next = needsSave ? { label: '保存设置', hint: '保存当前填写内容。保存后还需要检查 IDE 连接和项目。', run: saveAll, disabled: false }
    : !draft.enabled ? { label: '已关闭 IDE 联动', hint: '普通测试无需配置此功能。需要从源码启动应用时再开启。', run: () => {}, disabled: true }
    : !online ? { label: '等待开发电脑上线', hint: '所选 Scout 当前离线或尚未读取，请检查连接。', run: () => {}, disabled: true }
    : !checked ? { label: '检查 IDE 连接', hint: '设置已保存。现在核对 IDE 项目，并读取可用启动配置。', run: () => action.mutate('check'), disabled: false }
    : !draft.run_configuration ? { label: '选择启动配置', hint: '连接已检查通过。请选择你平时在 PyCharm 点击 Run 使用的启动项。', run: () => openStep(launchStep), disabled: false }
    : !draft.execution_allowed || !draft.test_parameters_confirmed ? { label: '确认启动权限', hint: '启动前请核对测试参数，并确认允许执行。', run: () => openStep(permissionStep), disabled: false }
    : unknown ? { label: '先核对上次操作', hint: '上次操作结果尚未确认，请在操作记录中读取原回执。', run: () => {}, disabled: true }
    : check?.support?.execute === false ? { label: 'IDE 不支持启动', hint: '请在 PyCharm 手动启动；可在下方检查目标是否就绪。', run: () => {}, disabled: true }
    : latest?.state === 'ready' && ['execute', 'restart', 'probe'].includes(latest.action) ? { label: '检查服务是否就绪', hint: draft.target_url ? '使用已配置的健康检查地址确认服务可访问；这不代表业务测试通过。' : '启动操作已结束；填写健康检查地址后才能确认服务是否就绪。', run: () => action.mutate('probe'), disabled: !draft.target_url }
    : { label: '启动应用', hint: '设置与连接检查已完成。点击后执行选定的 IDE 启动配置。', run: () => action.mutate('execute'), disabled: false }
  return <div className="w-ide-guide">
    <header className="w-ide-header"><div><Typography.Title level={4}>IDE 联动</Typography.Title><p>通过开发电脑上的 PyCharm 启动源码项目。已运行的应用可直接测试，无需开启。</p></div><label className="w-ide-toggle"><Switch checked={draft.enabled} disabled={busy} onChange={enabled => patch({ enabled })} />启用 IDE 联动</label></header>
    <ol className="w-ide-progress" aria-label="配置步骤">
      <li data-done={checked}>1. 连接项目<span>{checked ? '已核对' : needsSave ? '待保存和检查' : '待检查'}</span></li>
      <li data-done={checked && !!draft.run_configuration}>2. 选择启动方式<span>{draft.run_configuration || '待选择'}</span></li>
      <li data-done={ready}>3. 启动与验证<span>{ready ? '目标可访问' : '尚未确认就绪'}</span></li>
    </ol>
    <section className="w-ide-next" aria-label="下一步"><div><strong>{busy ? '正在处理，请等待结果' : next.label}</strong><p role="status">{busy ? '本次操作未结束，请勿重复提交。' : next.hint}</p></div><Button type="primary" loading={busy} disabled={busy || next.disabled} onClick={next.run}>{next.label}</Button></section>
    {saveError && <Alert type="error" showIcon message="配置尚未保存" description={saveError} />}
    {config.data && config.data.revision !== revision && dirty && <Alert type="warning" message="服务器配置已有更新，请先保留本页修改，再重新加载核对；不会自动覆盖你的草稿。" /> }
    {!draft.enabled && <Alert type="info" message="未启用开发联动，可直接运行普通测试。" />}
    {draft.enabled && <>
      <details className="w-ide-step" open={!checked}><summary>1. 连接项目 <span>开发电脑、IDE 连接和源码目录</span></summary><div className="w-ide-step-content">
      <Alert type="info" showIcon message="请先在 PyCharm → 设置 → 工具 → MCP 服务器中启用并应用，再复制 HTTP 流配置。" description="127.0.0.1 指所选 Scout 所在电脑，不是浏览器或 Nexus 服务器。" />
      {nodes.isError && <Alert type="error" message={errText(nodes.error)} />}
      <label className="block">开发电脑（Scout 所在电脑）<Select className="w-full" value={draft.node_id || undefined} disabled={busy} onChange={node_id => patch({ node_id, connection_id: '', connection_revision: 0 })} options={(nodes.data?.nodes ?? []).map(n => ({ value: n.node_id, label: `${n.hostname || n.node_id} · ${nodeIsOnline(n) ? '在线' : '离线'}` }))} /></label>
      <Space><Button disabled={!draft.node_id || busy} onClick={() => connect.mutate(true)}>查找已保存的 IDE 连接</Button><span>保存在所选 Scout，其他电脑不会自动继承</span></Space>
      {!!connections.length && <Select className="w-full" placeholder="复用该节点已有连接" value={draft.connection_id || undefined} options={Array.from(new Map(connections.map(c => [c.connection_id, c])).values()).map(c => ({ value: c.connection_id, label: `${c.connection_id} · ${c.url} · r${c.revision}` }))} onChange={id => { const c = connections.find(c => c.connection_id === id)!; patch({ connection_id: id, connection_revision: c.revision }); setConnectionName(id) }} />}
      <details><summary>IDE 连接格式与认证说明（通常无需修改）</summary><Typography.Paragraph type="secondary">认证仅支持 header_env，例如 {JSON.stringify({ Authorization: 'MINO_IDE_AUTHORIZATION' })}；请在 Scout 本机设置该环境变量，不要在此粘贴密钥。SSE 必须显式填写 transport=sse。</Typography.Paragraph></details>
      <Input.TextArea rows={3} value={paste} disabled={busy} onChange={e => setPaste(e.target.value)} placeholder="粘贴 PyCharm 的 HTTP 流 JSON 配置；然后点击「保存设置」" />
      {parsed.error && <Alert type="error" message={parsed.error} />}
      {parsed.rows.length > 1 && <Select className="w-full" placeholder="请选择要导入的服务器" value={serverName} options={parsed.rows.map(x => ({ value: x.name, label: x.name }))} onChange={setServerName} />}
      {selectedServer && <div className="space-y-2"><Typography.Text>预览：{selectedServer.url} · {selectedServer.transport} · {selectedServer.header_env ? `本机环境变量：${Object.values(selectedServer.header_env).join(", ")}` : "无鉴权"}</Typography.Text><Input value={connectionName} onChange={e => setConnectionName(e.target.value)} addonBefore="连接名称" /><Typography.Text type="secondary">此连接将在点击「保存设置」后导入，无需单独保存。</Typography.Text></div>}
      <Typography.Text type="secondary">当前选择的 IDE 连接：{draft.connection_id || '尚未选择；可粘贴新连接或复用已有连接'}</Typography.Text>
      <Typography.Title level={5}>项目目录</Typography.Title>
      <label className="block">IDE 项目路径<Input placeholder="例如 /Users/你的用户名/code/MinoNexus；填写 IDE 打开的项目根目录" value={draft.project_path} disabled={busy} onChange={e => patch({ project_path: e.target.value })} /></label>
      <label className="block">应用源码目录<Input placeholder="该应用源码所在目录；单应用项目通常与上面相同" value={draft.source_dir} disabled={busy} onChange={e => patch({ source_dir: e.target.value })} /></label>
      <Typography.Paragraph type="secondary">多个应用可共享同一 PyCharm 项目；IDE 项目路径与应用源码目录可以不同。</Typography.Paragraph>
      </div></details>
      <details ref={launchStep} className="w-ide-step" open={checked}><summary>2. 选择启动方式 <span>启动项与可选健康检查</span></summary><div className="w-ide-step-content">
      <label className="block">IDE 启动配置<Select className="w-full" allowClear placeholder="先保存设置，再点击上方「检查 IDE 连接」" value={draft.run_configuration || undefined} disabled={busy || !check?.configurations} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ run_configuration: name || '' })} /></label>
      <label className="block">服务健康检查地址（需要启动后检查时填写）<Input value={draft.target_url} placeholder="http://127.0.0.1:测试端口/health" disabled={busy} onChange={e => patch({ target_url: e.target.value })} /></label>
      <Typography.Paragraph type="secondary">填写开发电脑上测试服务的健康检查接口；不确定时可留空，仍可保存并检查 IDE 连接。</Typography.Paragraph>
      <details><summary>高级设置：构建、版本核对与日志（可选）</summary><div className="space-y-3 mt-3">
      <label className="block">构建配置（可选）<Select className="w-full" allowClear value={draft.build_configuration || undefined} disabled={busy} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ build_configuration: name || '' })} /></label>
      <Space.Compact className="w-full"><Input addonBefore="预期 build（可选）" value={draft.expected_build} onChange={e => patch({ expected_build: e.target.value })} /><Input addonBefore="JSON 字段" value={draft.build_field} onChange={e => patch({ build_field: e.target.value })} /></Space.Compact>
      <label className="block">服务日志（可选，只读）<Input value={draft.service_log_path} placeholder="应用源码目录内的日志绝对路径" onChange={e => patch({ service_log_path: e.target.value })} /></label>
      <Space><Button disabled={dirty || busy || !draft.service_log_path} onClick={() => action.mutate('logs')}>读取日志末尾（最多 32 KiB）</Button><Switch checked={followLogs} disabled={!draft.service_log_path || dirty} onChange={value => { followStarted.current = Date.now(); setFollowLogs(value) }} /><span>定时刷新日志快照（3 秒，最多 10 分钟；隐藏页面暂停）</span></Space>
      </div></details>
      {android && <details><summary>Android APK 安装</summary><div className="space-y-2 mt-2">
        <Input addonBefore="APK 绝对路径" value={draft.apk_path} onChange={e => patch({ apk_path: e.target.value })} placeholder="必须在已授权源码目录内" />
        <Select className="w-full" placeholder="当前 Scout 的 Android 设备" value={draft.android_serial || undefined} options={(nodes.data?.nodes?.find(n => n.node_id === draft.node_id)?.devices ?? []).filter(d => d.platform === 'android').map(d => ({ value: d.sn, label: d.model ? `${d.model} · ${d.sn}` : d.sn }))} onChange={android_serial => patch({ android_serial })} />
        <Input addonBefore="预期包名" value={draft.apk_package} onChange={e => patch({ apk_package: e.target.value })} />
        <Input addonBefore="预期 versionCode" value={draft.apk_version_code} onChange={e => patch({ apk_version_code: e.target.value })} />
        <p>仅代码有改动时执行构建；安装前校验产物，拒绝降级，不卸载或清数据。节点需有 Android SDK aapt2。</p>
        <Button disabled={!allowed || busy || !draft.apk_path || !draft.android_serial} onClick={() => action.mutate('install')}>安装并核对 APK</Button>
      </div></details>}
      </div></details>
      <details ref={permissionStep} className="w-ide-step" open={checked && !!draft.run_configuration}><summary>3. 启动与验证 <span>授权、运行和结果</span></summary><div className="w-ide-step-content">
      <div><Checkbox checked={draft.test_parameters_confirmed} disabled={busy} onChange={e => patch({ test_parameters_confirmed: e.target.checked })}>已在 IDE 确认运行配置使用测试地址、独立数据目录与凭据</Checkbox></div>
      <div><Checkbox checked={draft.execution_allowed} disabled={busy} onChange={e => patch({ execution_allowed: e.target.checked })}>授权执行本应用已登记的运行/构建配置与受控重启</Checkbox></div>
      <Typography.Paragraph type="secondary">IDE 执行确认由 PyCharm 设置控制；Brave 状态未自动检测。保存和连接成功均不代表服务就绪或测试通过。</Typography.Paragraph>
      </div></details>
    </>}
    {draft.enabled && <details className="w-ide-step"><summary>更多操作 <span>重新检查、重启和构建</span></summary><div className="w-ide-step-content">
      <p className="w-form-hint">{needsSave ? '请先保存当前设置。' : !online ? '开发电脑尚未上线。' : !checked ? '请先完成 IDE 连接检查。' : unknown ? '请先核对上次未知操作的回执。' : '重启需要启动配置和健康检查地址；构建需要选择构建配置。'}</p>
      <Space wrap><Button disabled={needsSave || busy || !revision || !online} onClick={() => action.mutate('check')}>重新检查 IDE</Button><Button disabled={needsSave || busy || !revision || !online || !draft.target_url} onClick={() => action.mutate('probe')}>检查服务是否就绪</Button><Button disabled={!allowed || busy || !online || !draft.run_configuration || !draft.target_url || check?.support?.restart === false} onClick={() => action.mutate('restart')}>重启应用</Button><Button disabled={!allowed || busy || !online || !draft.build_configuration} onClick={() => action.mutate('build')}>构建</Button></Space>
    </div></details>}
    <section className="w-ide-result" aria-label="最近结果"><h3>最近结果</h3><p>{needsSave ? '当前设置尚未保存，旧结果不代表本次配置已就绪。' : latest ? `${statuses[latest.state]}${latest.result.reason ? '：' + latest.result.reason : ''}` : '尚未执行连接检查。保存后，按上方“下一步”继续。'}</p>
      {!needsSave && latest && <p>{latest.result.target_ready === true ? '目标可访问。业务功能仍需运行测试验证。' : latest.result.target_ready === false ? '目标尚未就绪，请核对健康检查地址及应用日志。' : '尚无目标就绪结果；连接成功或保存成功不等于服务已启动。'}</p>}
    </section>
    {ops.isError && <Alert type="error" message={errText(ops.error)} action={<Button onClick={() => void ops.refetch()}>读取操作记录</Button>} />}
    {!items.length && <Typography.Paragraph type="secondary">尚无开发准备记录。</Typography.Paragraph>}
    <details className="w-ide-step"><summary>操作记录与排查详情（{items.length} 条）</summary>
    {items.map(op => <section key={op.operation_id} className="rounded border p-3 space-y-2">
      <Space><Tag>{statuses[op.state]}</Tag><span>{op.action} · r{op.revision}</span><Typography.Text copyable>{op.operation_id}</Typography.Text></Space>
      {op.result.reason && <p>{op.result.reason}</p>}
      {op.result.reason_code === 'blocked_by_update' && <Alert type="warning" message="等待节点升级结束" description={`升级操作：${op.result.operation_id || '未知'}；等待截止：${new Date(op.deadline * 1000).toLocaleString()}`} />}
      {op.state === 'queued' && <p>排队截止：{new Date(op.deadline * 1000).toLocaleString()}；尚未执行</p>}
      {op.result.stages && <p>{op.result.stages.map(s => `${new Date(s.at * 1000).toLocaleTimeString()} ${stages[s.name] || s.name}`).join(' → ')}</p>}
      {op.result.target_ready !== undefined && <Tag color={op.result.target_ready ? 'green' : 'orange'}>目标：{op.result.target_ready ? '可访问' : '未就绪'}</Tag>}
      {op.result.build_verified !== undefined && <Tag color={op.result.build_verified ? 'green' : 'orange'}>版本：{op.result.build_verified ? '核验通过' : '未核验通过'}</Tag>}
      {(op.result.actual_build || op.result.build) && <p>实际 build：{op.result.actual_build || op.result.build}</p>}
      {op.result.expected_build && <p>预期 build：{op.result.expected_build}</p>}
      {op.result.package && <p>APK：{op.result.package} · versionCode {op.result.version_code} · 设备 {op.result.device} · SHA256 {op.result.apk_sha256}</p>}
      {op.result.recovery && <p>已读取节点原回执；没有重复执行。{op.result.receipt_lookup?.reason}</p>}
      {['unknown', 'running'].includes(op.state) && <Button loading={recover.isPending} onClick={() => recover.mutate(op.operation_id)}>读取原回执与阶段（不重试执行）</Button>}
      {op.state === 'awaiting_developer' && <Alert type="info" message="请核对上方原因；需人工重启时在 PyCharm 点击 Rerun，之后仅检查目标就绪与版本。" />}
      {['execute', 'restart', 'build', 'install', 'probe'].includes(op.action) && <p>本操作不代表业务用例测试通过；请到用例执行记录查看测试结果。</p>}
      {op.result.receipt && <><p>来源：{op.result.receipt.source} · exitCode：{op.result.receipt.exitCode ?? '未返回'} · timedOut：{String(op.result.receipt.timedOut ?? false)} · {op.result.receipt.truncated ? '输出已截断' : '单次输出，无实时续读'}</p><pre className="whitespace-pre-wrap overflow-auto" style={{ maxHeight: 260 }}>{op.result.receipt.output}</pre></>}
      {op.state === 'unknown' && !op.result.manual_review?.confirmed_idle && <Button disabled={Date.now() / 1000 < op.deadline} onClick={() => Modal.confirm({ title: '确认已在 IDE 核对应用停止且无在途执行', content: '只解除本操作的准备占用；历史未知结果保留，不标记成功。', onOk: async () => { await reviewPreparation(appId, op.operation_id); refresh() } })}>登记人工处置</Button>}
    </section>)}
    </details>
  </div>
}
