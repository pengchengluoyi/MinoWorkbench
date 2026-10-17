import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Input, Modal, Select, Space, Spin, Switch, Tag, Typography } from 'antd'
import { getDevelopment, saveDevelopment, listPreparations, prepareDevelopment, configureIDE, reviewPreparation, recoverPreparation, parseIDEImport, type DevelopmentConfig, type DevelopmentBinding, type Preparation } from '@/api/development'
import { listRuntimeNodes, nodeIsOnline, type ScoutNode } from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { errText, useFeedback } from '@/ui'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

export function DevelopmentPanel({ appId }: { appId: string }) {
  const feedback = useFeedback()
  const qc = useQueryClient()
  const key = ['development', appId]
  const [draft, setDraft] = useState<DevelopmentConfig | null>(null)
  const [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState('')
  const [paste, setPaste] = useState('')
  const [serverName, setServerName] = useState<string>()
  const [connectionName, setConnectionName] = useState('pycharm')
  const [pendingId, setPendingId] = useState('')
  const [followLogs, setFollowLogs] = useState(false)
  const followStarted = useRef(0)
  const adopted = useRef(new Set<string>())
  const config = useQuery({ queryKey: key, queryFn: async () => unwrapOne<DevelopmentBinding>(await getDevelopment(appId)) })
  const nodes = useQuery({ queryKey: ['runtime', 'nodes'], queryFn: async () => unwrapOne<{ nodes?: ScoutNode[] }>(await listRuntimeNodes()) })
  const ops = useQuery({ queryKey: [...key, 'operations'], queryFn: async () => unwrapOne<{ items: Preparation[] }>(await listPreparations(appId)),
    refetchInterval: query => query.state.data?.items.some(x => ['running', 'queued'].includes(x.state)) ? 1500 : false })
  useEffect(() => {
    if (!draft && config.data) {
      setDraft(config.data.config); setRevision(config.data.revision); setSaved(JSON.stringify(config.data.config))
    }
  }, [config.data, draft])
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
    for (const op of items) {
      if (op.operation_id !== pendingId || op.state !== 'ready' || !op.result.connection || adopted.current.has(op.operation_id)) continue
      adopted.current.add(op.operation_id)
      const connection = op.result.connection
      setDraft(old => old ? { ...old, connection_id: connection.connection_id, connection_revision: connection.revision } : old)
      setPaste('')
      feedback.ok('连接已保存到 Scout；请保存应用配置后检查连接')
    }
  }, [items, pendingId, feedback])
  const parsed = useMemo(() => {
    if (!paste.trim()) return { rows: [], error: '' }
    try { return { rows: parseIDEImport(paste), error: '' } } catch (error) { return { rows: [], error: errText(error) } }
  }, [paste])
  const selectedServer = parsed.rows.length === 1 ? parsed.rows[0] : parsed.rows.find(x => x.name === serverName)
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }) }
  const save = useMutation({ mutationFn: () => saveDevelopment(appId, { revision, config: draft! }),
    onSuccess: response => { const next = unwrapOne<DevelopmentBinding>(response); setRevision(next.revision); setDraft(next.config); setSaved(JSON.stringify(next.config)); refresh(); feedback.ok('应用配置已保存，需重新检查连接') },
    onError: error => feedback.fail(errText(error)) })
  const action = useMutation({ mutationFn: async (name: string) => {
    const id = crypto.randomUUID(); setPendingId(id)
    return prepareDevelopment(appId, name, revision, id)
  }, onSuccess: refresh, onError: error => { feedback.fail(errText(error)); refresh() } })
  const connect = useMutation({ mutationFn: async (list: boolean) => {
    const id = crypto.randomUUID(); setPendingId(id)
    return configureIDE(appId, { operation_id: id, node_id: draft!.node_id,
      action: list ? 'list_connections' : 'save_connection', connection_id: connectionName,
      connection_revision: draft!.connection_id === connectionName ? draft!.connection_revision : 0,
      connection: list ? {} : { url: selectedServer!.url, transport: selectedServer!.transport, headers: selectedServer!.headers ?? {}, header_env: selectedServer!.header_env ?? {} } })
  }, onSuccess: refresh, onError: error => { feedback.fail(errText(error)); refresh() } })
  const recover = useMutation({ mutationFn: (id: string) => recoverPreparation(appId, id), onSuccess: refresh, onError: error => feedback.fail(errText(error)) })
  const patch = (update: Partial<DevelopmentConfig>) => setDraft(old => old ? { ...old, ...update } : old)
  const busy = save.isPending || action.isPending || connect.isPending || items.some(x => ['running', 'queued'].includes(x.state))
  const unknown = items.some(x => ['execute', 'restart', 'build', 'install'].includes(x.action) && x.state === 'unknown' && !x.result.manual_review?.confirmed_idle)
  const check = config.data?.check
  const checked = !dirty && config.data?.checked_revision === revision && !!check?.project_matched
  const allowed = checked && draft?.execution_allowed && draft?.test_parameters_confirmed && !unknown
  const connections = items.flatMap(x => x.node_id === draft?.node_id ? x.result.connections ?? [] : [])
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
  return <div className="space-y-4 overflow-auto p-4" style={{ maxWidth: 960 }}>
    <Typography.Title level={4}>应用开发环境</Typography.Title>
    <Space><Switch checked={draft.enabled} disabled={busy} onChange={enabled => patch({ enabled })} /><span>开发联动</span></Space>
    {!draft.enabled && <Alert type="info" message="未启用开发联动，可直接运行普通测试。" />}
    {draft.enabled && <>
      <Alert type="info" showIcon message="请先在 PyCharm → 设置 → 工具 → MCP 服务器中启用并应用，再复制 HTTP 流配置。" description="127.0.0.1 指所选 Scout 所在电脑，不是浏览器或 Nexus 服务器。" />
      {nodes.isError && <Alert type="error" message={errText(nodes.error)} />}
      <label className="block">开发节点<Select className="w-full" value={draft.node_id || undefined} disabled={busy} onChange={node_id => patch({ node_id, connection_id: '', connection_revision: 0 })} options={(nodes.data?.nodes ?? []).map(n => ({ value: n.node_id, label: `${n.hostname || n.node_id} · ${nodeIsOnline(n) ? '在线' : '离线'}` }))} /></label>
      <Space><Button disabled={!draft.node_id || busy} onClick={() => connect.mutate(true)}>读取已有 IDE 连接</Button><span>保存在所选 Scout，其他电脑不会自动继承</span></Space>
      {!!connections.length && <Select className="w-full" placeholder="复用该节点已有连接" value={draft.connection_id || undefined} options={Array.from(new Map(connections.map(c => [c.connection_id, c])).values()).map(c => ({ value: c.connection_id, label: `${c.connection_id} · ${c.url} · r${c.revision}` }))} onChange={id => { const c = connections.find(c => c.connection_id === id)!; patch({ connection_id: id, connection_revision: c.revision }); setConnectionName(id) }} />}
      <Typography.Paragraph type="secondary">认证仅支持 header_env，例如 {JSON.stringify({ Authorization: 'MINO_IDE_AUTHORIZATION' })}；请在 Scout 本机设置该环境变量，不要在此粘贴密钥。SSE 必须显式填写 transport=sse。</Typography.Paragraph>
      <Input.TextArea rows={3} value={paste} disabled={busy} onChange={e => setPaste(e.target.value)} placeholder="粘贴 PyCharm 的 HTTP 流 JSON 配置；草稿不保存到浏览器" />
      {parsed.error && <Alert type="error" message={parsed.error} />}
      {parsed.rows.length > 1 && <Select className="w-full" placeholder="请选择要导入的服务器" value={serverName} options={parsed.rows.map(x => ({ value: x.name, label: x.name }))} onChange={setServerName} />}
      {selectedServer && <div className="space-y-2"><Typography.Text>预览：{selectedServer.url} · {selectedServer.transport} · {selectedServer.header_env ? `本机环境变量：${Object.values(selectedServer.header_env).join(", ")}` : "无鉴权"}</Typography.Text><Input value={connectionName} onChange={e => setConnectionName(e.target.value)} addonBefore="连接名称" /><Button disabled={!draft.node_id || busy} onClick={() => connect.mutate(false)}>保存连接到 Scout</Button></div>}
      <Typography.Text type="secondary">已绑定：{draft.connection_id || '无'} · 连接 revision {draft.connection_revision} · 应用 revision {revision}</Typography.Text>
      <label className="block">IDE 项目路径<Input value={draft.project_path} disabled={busy} onChange={e => patch({ project_path: e.target.value })} /></label>
      <label className="block">应用源码目录<Input value={draft.source_dir} disabled={busy} onChange={e => patch({ source_dir: e.target.value })} /></label>
      <Typography.Paragraph type="secondary">多个应用可共享同一 PyCharm 项目；IDE 项目路径与应用源码目录可以不同。</Typography.Paragraph>
      <label className="block">运行配置<Select className="w-full" allowClear value={draft.run_configuration || undefined} disabled={busy || !check?.configurations} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ run_configuration: name || '' })} /></label>
      <label className="block">构建配置（可选）<Select className="w-full" allowClear value={draft.build_configuration || undefined} disabled={busy} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ build_configuration: name || '' })} /></label>
      <label className="block">测试服务就绪地址<Input value={draft.target_url} placeholder="http://127.0.0.1:测试端口/health" disabled={busy} onChange={e => patch({ target_url: e.target.value })} /></label>
      <Space.Compact className="w-full"><Input addonBefore="预期 build（可选）" value={draft.expected_build} onChange={e => patch({ expected_build: e.target.value })} /><Input addonBefore="JSON 字段" value={draft.build_field} onChange={e => patch({ build_field: e.target.value })} /></Space.Compact>
      <label className="block">服务日志（可选，只读）<Input value={draft.service_log_path} placeholder="应用源码目录内的日志绝对路径" onChange={e => patch({ service_log_path: e.target.value })} /></label>
      <Space><Button disabled={dirty || busy || !draft.service_log_path} onClick={() => action.mutate('logs')}>读取日志末尾（最多 32 KiB）</Button><Switch checked={followLogs} disabled={!draft.service_log_path || dirty} onChange={value => { followStarted.current = Date.now(); setFollowLogs(value) }} /><span>定时刷新日志快照（3 秒，最多 10 分钟；隐藏页面暂停）</span></Space>
      <details><summary>同节点 APK 安装（可选）</summary><div className="space-y-2 mt-2">
        <Input addonBefore="APK 绝对路径" value={draft.apk_path} onChange={e => patch({ apk_path: e.target.value })} placeholder="必须在已授权源码目录内" />
        <Select className="w-full" placeholder="当前 Scout 的 Android 设备" value={draft.android_serial || undefined} options={(nodes.data?.nodes?.find(n => n.node_id === draft.node_id)?.devices ?? []).filter(d => d.platform === 'android').map(d => ({ value: d.sn, label: d.model ? `${d.model} · ${d.sn}` : d.sn }))} onChange={android_serial => patch({ android_serial })} />
        <Input addonBefore="预期包名" value={draft.apk_package} onChange={e => patch({ apk_package: e.target.value })} />
        <Input addonBefore="预期 versionCode" value={draft.apk_version_code} onChange={e => patch({ apk_version_code: e.target.value })} />
        <p>仅代码有改动时执行构建；安装前校验产物，拒绝降级，不卸载或清数据。节点需有 Android SDK aapt2。</p>
        <Button disabled={!allowed || busy || !draft.apk_path || !draft.android_serial} onClick={() => action.mutate('install')}>安装并核对 APK</Button>
      </div></details>
      <div><Checkbox checked={draft.test_parameters_confirmed} disabled={busy} onChange={e => patch({ test_parameters_confirmed: e.target.checked })}>已在 IDE 确认运行配置使用测试地址、独立数据目录与凭据</Checkbox></div>
      <div><Checkbox checked={draft.execution_allowed} disabled={busy} onChange={e => patch({ execution_allowed: e.target.checked })}>授权执行本应用已登记的运行/构建配置与受控重启</Checkbox></div>
      <Typography.Paragraph type="secondary">IDE 执行确认由 PyCharm 设置控制；Brave 状态未自动检测。保存和连接成功均不代表服务就绪或测试通过。</Typography.Paragraph>
    </>}
    <Space wrap><Button type="primary" loading={save.isPending} disabled={busy && !save.isPending} onClick={() => save.mutate()}>保存应用配置</Button>
      {draft.enabled && <><Button disabled={dirty || busy || !revision} onClick={() => action.mutate('check')}>检查连接并读取配置</Button><Button disabled={dirty || busy || !revision} onClick={() => action.mutate('probe')}>仅检查目标就绪</Button><Button disabled={!allowed || busy || !draft.run_configuration || check?.support?.execute === false} onClick={() => action.mutate('execute')}>执行配置</Button><Button disabled={!allowed || busy || !draft.run_configuration || !draft.target_url} onClick={() => action.mutate('restart')}>重启测试应用</Button><Button disabled={!allowed || busy || !draft.build_configuration} onClick={() => action.mutate('build')}>构建</Button></>}
    </Space>
    <div><Tag color={checked ? 'green' : 'default'}>连接/项目：{checked ? '检查通过' : '未检查或配置已变化'}</Tag><Tag>IDE：{check?.server?.version || '未读取'}</Tag><Tag>目标就绪与测试结果分别核对</Tag></div>
    {draft.enabled && <Space wrap><Tag color={node && nodeIsOnline(node) ? 'green' : 'orange'}>节点：{node && nodeIsOnline(node) ? '在线' : '离线或未选择'}</Tag><Tag>最后检查：{check?.checked_at ? new Date(check.checked_at * 1000).toLocaleString() : '未检查'}</Tag><Tag>测试参数：{draft.test_parameters_confirmed ? '人工确认' : '未确认'}</Tag><Tag>执行授权：{draft.execution_allowed ? '已授权' : '未授权'}</Tag></Space>}
    {checked && check?.support && <Alert type={check.support.execute && check.support.restart ? 'success' : 'warning'} message={check.support.execute && check.support.restart ? 'IDE 具备执行和受控重启能力；仍需逐次核对进程及目标' : '能力部分可用'} description={`执行配置：${check.support.execute ? '支持' : '不支持'}；停止方式：${check.support.restart_mode === 'window_close_only' ? 'Windows 仅协作关闭应用窗口，无窗口服务需人工 Rerun' : check.support.restart ? '核对身份后 SIGTERM' : '需人工处理'}。IDE 未提供的运行参数详情仍需人工确认。`} />}
    {pendingId && <Typography.Text copyable>本次操作：{pendingId}</Typography.Text>}
    {ops.isError && <Alert type="error" message={errText(ops.error)} action={<Button onClick={() => void ops.refetch()}>读取操作记录</Button>} />}
    {!items.length && <Typography.Paragraph type="secondary">尚无开发准备记录。</Typography.Paragraph>}
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
  </div>
}
