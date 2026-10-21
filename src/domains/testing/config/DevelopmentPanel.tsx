import { createUUID } from '@/lib/uuid'
import './DevelopmentPanel.css'
import { normalizePlatforms, type PlatformInput } from '@/constants/appPlatforms'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, FolderCheck, Plug, Server } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Checkbox, Input, Modal, Select, Space, Spin, Switch, Tag, Typography, type InputRef } from 'antd'
import { getDevelopment, saveDevelopment, listPreparations, prepareDevelopment, configureIDE, reviewPreparation, recoverPreparation, parseIDEImport, type DevelopmentConfig, type DevelopmentBinding, type Preparation, type PreparationResult } from '@/api/development'
import { listRuntimeNodes, nodeIsOnline, type ScoutNode } from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
import { errText, useFeedback } from '@/ui'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

function connectionIssue(result?: PreparationResult) {
  const legacyRestriction = /样例项目|MINO 控制链|自身代码目录/.test(result?.reason || '')
  const titles: Record<string, string> = {
    ide_directory_invalid: '项目目录无法访问',
    ide_source_outside_project: '源码目录与项目不匹配',
    ide_connection_missing: '所选电脑尚未保存此连接',
    ide_connection_changed: 'IDE 连接版本已更新',
    ide_unreachable: '无法连接 PyCharm',
    ide_timeout: 'PyCharm 响应超时',
    ide_auth_failed: 'PyCharm 拒绝访问',
    ide_http_error: 'PyCharm 连接地址不可用',
    ide_project_rejected: 'PyCharm 未能核对项目',
    ide_plugin_incompatible: '运行控制插件与当前 PyCharm 不兼容',
  }
  return {
    title: legacyRestriction ? '上次检查被旧版项目规则拦截' : titles[result?.reason_code || ''] || '项目连接检查未完成',
    reason: legacyRestriction ? '上次检查在连接 PyCharm 前被样例项目规则拦截，尚未验证 IDE 和项目。' : result?.reason || '未收到完整的项目核对结果。',
    remediation: result?.remediation || (legacyRestriction ? '当前项目路径无需修改。让所选 Scout 加载更新后的代码，再重新检查；不再需要登记样例项目。' : '核对所选开发电脑、PyCharm 的 MCP 服务器连接与实际打开的项目路径，按上述原因修正后重新检查。'),
    field: result?.error_field,
  }
}

export function DevelopmentPanel({ appId, platforms }: { appId: string; platforms: PlatformInput }) {
  return <DevelopmentEditor key={appId} appId={appId} android={normalizePlatforms(platforms).includes('android')} />
}

function DevelopmentEditor({ appId, android }: { appId: string; android: boolean }) {
  const [selectedStep, setActiveStep] = useState<number | null>(null)
  const [editingSetup, setEditingSetup] = useState(false)
  const [editingConnection, setEditingConnection] = useState(false)
  const listedNodes = useRef(new Set<string>())
  const advanceAfterCheck = useRef<{ revision: number; step: number } | null>(null)
  const [checkingSaved, setCheckingSaved] = useState(false)
  const [requestedOperation, setRequestedOperation] = useState<{ id: string; action: string } | null>(null)
  const [checkingRestart, setCheckingRestart] = useState(false)
  const [runtimeSetupOpen, setRuntimeSetupOpen] = useState(false)
  const restartAfterCheck = useRef(false)
  const inspectedRevisions = useRef(new Set<string>())
  const feedback = useFeedback()
  const qc = useQueryClient()
  const key = ['development', appId]
  const [draft, setDraft] = useState<DevelopmentConfig | null>(null)
  const [revision, setRevision] = useState(0)
  const [saved, setSaved] = useState('')
  const [paste, setPaste] = useState('')
  const [serverName, setServerName] = useState<string>()
  const [connectionName, setConnectionName] = useState('pycharm')
  const projectInput = useRef<InputRef>(null)
  const sourceInput = useRef<InputRef>(null)

  const [followLogs, setFollowLogs] = useState(false)
  const followStarted = useRef(0)
  const adopted = useRef(new Set<string>())
  const connectionSave = useRef<{ id: string; config: DevelopmentConfig; revision: number; step: number } | null>(null)
  const [savingBinding, setSavingBinding] = useState(false)
  const [saveError, setSaveError] = useState('')
  const config = useQuery({ queryKey: key, queryFn: async () => unwrapOne<DevelopmentBinding>(await getDevelopment(appId)) })
  const nodes = useQuery({ queryKey: ['runtime', 'nodes'], queryFn: async () => unwrapOne<{ nodes?: ScoutNode[] }>(await listRuntimeNodes()) })
  const ops = useQuery({ queryKey: [...key, 'operations'], queryFn: async () => unwrapOne<{ items: Preparation[] }>(await listPreparations(appId)),
    refetchInterval: query => query.state.data?.items.some(x => ['running', 'queued'].includes(x.state)) ? 1500 : false })
  const verifySaved = useCallback(async (binding: DevelopmentBinding, step: number) => {
    if (!binding.config.enabled) return
    advanceAfterCheck.current = { revision: binding.revision, step }
    setCheckingSaved(true)
    try {
      await prepareDevelopment(appId, 'check', binding.revision, createUUID())
      void qc.invalidateQueries({ queryKey: ['development', appId] })
    } catch (error) { feedback.fail(errText(error)); advanceAfterCheck.current = null }
    finally { setCheckingSaved(false) }
  }, [appId, qc, feedback])
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
    setPaste(''); setEditingConnection(false)
    setSavingBinding(true)
    void saveDevelopment(appId, { revision: pending.revision, config: next }).then(response => {
      const binding = unwrapOne<DevelopmentBinding>(response)
      if (!binding) throw new Error('服务器未返回保存结果')
      qc.setQueryData(['development', appId], binding)
      setDraft(binding.config); setRevision(binding.revision); setSaved(JSON.stringify(binding.config))
      feedback.ok('IDE 连接与本页配置均已保存，正在检查连接')
      void verifySaved(binding, pending.step)
    }).catch(error => {
      setSaveError(`IDE 连接已保存，但本页配置保存失败：${errText(error)}。无需再次导入，修正后点击保存并检查。`)
    }).finally(() => setSavingBinding(false))
  }, [items, appId, feedback, qc, verifySaved])
  const parsed = useMemo(() => {
    if (!paste.trim()) return { rows: [], error: '' }
    try { return { rows: parseIDEImport(paste), error: '' } } catch (error) { return { rows: [], error: errText(error) } }
  }, [paste])
  const selectedServer = parsed.rows.length === 1 ? parsed.rows[0] : parsed.rows.find(x => x.name === serverName)
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }) }
  const save = useMutation({ mutationFn: () => saveDevelopment(appId, { revision, config: draft! }),
    onSuccess: response => { const next = unwrapOne<DevelopmentBinding>(response); setRevision(next.revision); setDraft(next.config); setSaved(JSON.stringify(next.config)); qc.setQueryData(key, next); setSaveError(''); setEditingConnection(false); feedback.ok('配置已保存，正在核对 IDE'); void verifySaved(next, Math.min(activeStep + 1, 2)) },
    onError: error => { setSaveError(errText(error)); feedback.fail(errText(error)) } })
  const action = useMutation({ mutationFn: async (name: string) => {
    const id = createUUID()
    setRequestedOperation({ id, action: name })
    return prepareDevelopment(appId, name, revision, id)
  }, onSuccess: refresh, onError: error => { setRequestedOperation(null); setCheckingRestart(false); restartAfterCheck.current = false; feedback.fail(errText(error)); refresh() } })
  useEffect(() => {
    if (!requestedOperation) return
    const operation = items.find(item => item.operation_id === requestedOperation.id)
    if (!operation || ['queued', 'running'].includes(operation.state)) return
    setRequestedOperation(null)
    if (operation.action === 'check' && restartAfterCheck.current) {
      restartAfterCheck.current = false
      setCheckingRestart(false)
      if (operation.state === 'ready' && operation.result.support?.restart === true && ['debugger_mcp', 'run_control_mcp'].includes(operation.result.support.restart_mode || '')) {
        action.mutate('restart')

      } else if (operation.state === 'ready') {
        setRuntimeSetupOpen(true)
      } else {
        feedback.warn(operation.result.reason || '无法读取 IDE 重启能力')
      }
      return
    }
    if (!['probe', 'execute', 'stop', 'restart', 'build'].includes(operation.action)) return
    if (operation.state !== 'ready') {
      feedback.warn(operation.result.reason || '操作未完成，请查看检测详情')
    } else if (operation.result.stopped === true) {
      feedback.ok('当前配置已停止')
    } else if (operation.result.restarted === true) {
      feedback.ok('当前配置已重启，新实例运行正常')
    } else if (operation.result.target_ready === true) {
      feedback.ok('服务可访问，正在使用现有服务')
    } else if (operation.result.runtime?.state === 'running') {
      feedback.ok('已使用现有实例，进程运行正常')
    } else {
      feedback.ok(operation.result.reason || '检查已完成')
    }
  }, [items, requestedOperation, feedback, action])
  const connect = useMutation({ mutationFn: async (list: boolean) => {
    const id = createUUID()
    if (!list) connectionSave.current = { id, config: { ...draft! }, revision, step: Math.min(activeStep + 1, 2) }
    return configureIDE(appId, { operation_id: id, node_id: draft!.node_id,
      action: list ? 'list_connections' : 'save_connection', connection_id: connectionName,
      connection_revision: draft!.connection_id === connectionName ? draft!.connection_revision : 0,
      connection: list ? {} : { url: selectedServer!.url, transport: selectedServer!.transport, headers: selectedServer!.headers ?? {}, header_env: selectedServer!.header_env ?? {} } })
  }, onSuccess: refresh, onError: error => { connectionSave.current = null; setSaveError(errText(error)); feedback.fail(errText(error)); refresh() } })
  const recover = useMutation({ mutationFn: (id: string) => recoverPreparation(appId, id), onSuccess: refresh, onError: error => feedback.fail(errText(error)) })
  const patch = (update: Partial<DevelopmentConfig>) => setDraft(old => old ? { ...old, ...update } : old)
  const busy = checkingSaved || savingBinding || !!requestedOperation || save.isPending || action.isPending || connect.isPending || items.some(x => ['running', 'queued'].includes(x.state))
  useEffect(() => {
    if (!draft?.enabled || !draft.node_id || busy || listedNodes.current.has(draft.node_id)) return
    const selectedNode = nodes.data?.nodes?.find(n => n.node_id === draft.node_id)
    if (!selectedNode || !nodeIsOnline(selectedNode)) return
    listedNodes.current.add(draft.node_id)
    connect.mutate(true)
  }, [draft?.enabled, draft?.node_id, nodes.data, busy, connect])
  const unknown = items.some(x => ['execute', 'stop', 'restart', 'build', 'install'].includes(x.action) && x.state === 'unknown' && !x.result.manual_review?.confirmed_idle)
  const check = config.data?.check
  const node = nodes.data?.nodes?.find(n => n.node_id === draft?.node_id)
  const online = !!node && nodeIsOnline(node)
  const savedChecked = !!draft?.enabled && revision > 0 && !dirty && !paste.trim() && config.data?.checked_revision === revision && !!check?.project_matched
  const checked = savedChecked && online
  const runConfigured = !!draft?.run_configuration && !!check?.configurations?.includes(draft.run_configuration)
  const setupComplete = savedChecked && runConfigured && !!draft?.execution_allowed && !!draft?.test_parameters_confirmed
  const restoredStep = config.data?.config.enabled && config.data.revision > 0 && config.data.checked_revision === config.data.revision && check?.project_matched
    ? check.configurations?.includes(config.data.config.run_configuration) ? 2 : 1 : 0
  const activeStep = selectedStep ?? restoredStep
  const showDetails = setupComplete && !editingSetup
  const editStep = (step: number) => { setEditingSetup(true); setActiveStep(step) }
  useEffect(() => {
    const pending = advanceAfterCheck.current
    if (!pending || !checked || revision !== pending.revision) return
    advanceAfterCheck.current = null
    const step = pending.step === 2 && !runConfigured ? 1 : pending.step
    setActiveStep(step)
    if (setupComplete) setEditingSetup(false)
    feedback.ok(setupComplete ? '配置已完成，已进入联动详情' : step === 1 ? '项目连接已通过，已进入启动配置' : '启动配置已通过，已进入启动与验证')
  }, [checked, revision, runConfigured, setupComplete, feedback])
  const checkAndAdvance = () => {
    advanceAfterCheck.current = { revision, step: activeStep === 0 ? 1 : activeStep === 1 && draft?.run_configuration ? 2 : activeStep }
    action.mutate('check')
  }
  const allowed = checked && draft?.execution_allowed && draft?.test_parameters_confirmed && !unknown
  useEffect(() => {
    if (activeStep !== 2 || !checked || busy || !ops.isSuccess || !check?.support?.inspect_running) return
    const inspectionKey = `mino-ide-inspected:${appId}:${revision}:${draft?.node_id}:${draft?.run_configuration}`
    if (inspectedRevisions.current.has(inspectionKey) || window.sessionStorage.getItem(inspectionKey)) return
    if (items.some(item => item.revision === revision && item.result.runtime)) return
    inspectedRevisions.current.add(inspectionKey)
    window.sessionStorage.setItem(inspectionKey, '1')
    action.mutate('probe')
  }, [activeStep, checked, busy, ops.isSuccess, check?.support?.inspect_running, appId, revision, draft?.node_id, draft?.run_configuration, items, action])
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
  const stages: Record<string, string> = { connecting: '连接 IDE', matching_project: '核对 IDE 项目', inspecting_runtime: '检查已有运行实例', locating_process: '核对旧进程身份', stopping: '协作停止旧进程', no_old_process: '无旧进程，准备启动', starting: 'IDE 启动配置', building: 'IDE 构建', probing: '运行状态和就绪探测', validating_apk: '核对 APK 与设备版本', installing: '安装 APK', reading_logs: '读取配置日志' }
  const statuses: Record<string, string> = { queued: '请求已接受', running: '正在准备', ready: '操作完成', failed: '失败', awaiting_developer: '需要开发者处理', unknown: '结果尚未确认' }
  if (config.isPending) return <Spin tip="读取开发环境配置" />
  if (config.isError) return <Alert type="error" showIcon message={errText(config.error)} action={<Button onClick={() => void config.refetch()}>重试</Button>} />
  if (!draft) return null
  const needsSave = dirty || !!paste.trim() || !revision
  const latest = [...items].filter(op => op.revision === revision && ['check', 'execute', 'stop', 'restart', 'probe', 'build', 'install'].includes(op.action)).sort((a, b) => b.created_at - a.created_at)[0]
  const runtimeResult = [...items].filter(op => op.revision === revision && op.result.runtime).sort((a, b) => b.created_at - a.created_at)[0]
  const runtime = needsSave ? undefined : runtimeResult?.result.runtime ?? (savedChecked ? check?.runtime : undefined)
  const running = runtime?.state === 'running'
  const reachable = !needsSave && runtimeResult?.state === 'ready' && runtimeResult.result.target_ready === true
  const usingExisting = online && (running || reachable)
  const inspecting = requestedOperation?.action === 'probe'
  const runtimeIssue = runtimeResult && ['failed', 'awaiting_developer', 'unknown'].includes(runtimeResult.state) ? runtimeResult.result.reason : ''
  const canInspect = !needsSave && !busy && online && !!revision
  const ready = online && checked && !needsSave && latest?.state === 'ready' && latest.result.target_ready === true
  const next = needsSave ? { label: '保存并检查', hint: '保存设置后自动检查 IDE；检查通过后进入下一步。', run: saveAll, disabled: false }
    : !draft.enabled ? { label: '已关闭 IDE 联动', hint: '普通测试无需配置此功能。需要从源码启动应用时再开启。', run: () => {}, disabled: true }
    : !online ? { label: '等待开发电脑上线', hint: '所选 Scout 当前离线或尚未读取，请检查连接。', run: () => {}, disabled: true }
    : !checked ? { label: '检查 IDE 连接', hint: '设置已保存。现在核对 IDE 项目，并读取可用启动配置。', run: checkAndAdvance, disabled: false }
    : !runConfigured ? { label: '选择启动配置', hint: '尚未选择有效的 IDE 启动配置。', run: () => setActiveStep(1), disabled: false }
    : !draft.execution_allowed || !draft.test_parameters_confirmed ? { label: '确认启动权限', hint: '启动前请核对测试参数，并确认允许执行。', run: () => setActiveStep(2), disabled: false }
    : unknown ? { label: '先核对上次操作', hint: '上次操作结果尚未确认，请在操作记录中读取原回执。', run: () => {}, disabled: true }
    : check?.support?.execute === false ? { label: 'IDE 不支持启动', hint: '请在 PyCharm 手动启动；可在下方检查目标是否就绪。', run: () => {}, disabled: true }
    : usingExisting ? { label: '刷新运行状态', hint: '已自动使用现有实例，无需再次启动。', run: () => action.mutate('probe'), disabled: false }
    : latest?.state === 'ready' && ['execute', 'restart', 'probe'].includes(latest.action) ? { label: '验证当前服务', hint: '检查项目进程；已配置健康地址时同时验证服务可访问性。', run: () => action.mutate('probe'), disabled: false }
    : { label: '启动应用', hint: '设置与连接检查已完成。点击后执行选定的 IDE 启动配置。', run: () => action.mutate('execute'), disabled: false }
  const stepNext = !draft.enabled || needsSave ? next
    : activeStep === 0 && checked ? { label: '下一步：选择启动方式', hint: '连接已核对，接下来选择 IDE 中的运行配置。', run: () => setActiveStep(1), disabled: false }
    : activeStep === 1 && checked && runConfigured ? { label: '下一步：启动与验证', hint: '启动配置已保存并核对。', run: () => setActiveStep(2), disabled: false }
    : next
  const permissionReason = needsSave ? '请先保存设置，再检查 IDE 连接。' : !online ? '开发电脑离线。' : !checked ? '请先检查 IDE 连接。' : unknown ? '上次执行结果未知，需先核对原回执。' : !draft.test_parameters_confirmed ? '尚未确认测试环境。' : !draft.execution_allowed ? '尚未允许执行。' : ''
  const currentActions = showDetails || activeStep === 2 ? ['check', 'execute', 'stop', 'restart', 'probe', 'build', 'install', 'logs'] : activeStep === 0 ? ['check', 'save_connection', 'list_connections'] : ['check', 'logs']
  const stepItems = items.filter(op => currentActions.includes(op.action))
  const stepResult = [...stepItems].filter(op => op.revision === revision).sort((a, b) => b.created_at - a.created_at)[0]
  const connectionCheck = [...items].filter(op => op.revision === revision && op.action === 'check').sort((a, b) => b.created_at - a.created_at)[0]
  const checkingConnection = checkingSaved || (action.isPending && action.variables === 'check') || !!connectionCheck && ['queued', 'running'].includes(connectionCheck.state)
  const checkFailed = !needsSave && !!connectionCheck && ['failed', 'awaiting_developer', 'unknown'].includes(connectionCheck.state)
  const issue = connectionIssue(connectionCheck?.result)
  const ideConnected = checked || !needsSave && !!connectionCheck?.result.stages?.some(stage => stage.name === 'matching_project')
  const connectionAttempted = !!connectionCheck?.result.stages?.some(stage => stage.name === 'connecting')
  const fixIssue = () => {
    if (issue.field === 'connection_id') { setEditingConnection(true); return }
    const input = issue.field === 'source_dir' ? sourceInput.current : projectInput.current
    input?.focus({ cursor: 'end' })
    input?.input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const selectedConnection = connections.find(connection => connection.connection_id === draft.connection_id)
  const connectionStatus = !draft.enabled ? '未启用' : needsSave ? '待保存' : checked ? '已通过' : checkingConnection ? '检查中' : checkFailed ? '检查未通过' : '待检查'
  const stepTitles = ['连接项目', '选择启动方式', '启动与验证']
  const stepDone = [savedChecked, savedChecked && runConfigured, setupComplete]
  const stepStates = [savedChecked ? '项目已核对' : connectionStatus, savedChecked && runConfigured ? draft.run_configuration : draft.run_configuration ? '待核对' : '待选择', setupComplete ? '配置已完成' : '待确认执行权限']
  const footerStatus = busy ? '正在处理…' : activeStep === 0 ? needsSave ? '连接设置有未保存的修改' : checked ? 'IDE 已连通，项目匹配通过' : checkFailed ? '修正上述问题后，可重新检查' : '连接已保存，IDE 连通性与项目匹配尚未验证' : activeStep === 1 ? needsSave ? '启动配置有未保存的修改' : checked && runConfigured ? `当前配置：${draft.run_configuration}` : '尚未核对启动配置' : ready ? '服务健康检查已通过' : permissionReason || '当前配置已可执行'
  const restarting = requestedOperation?.action === 'restart'
  const stopping = requestedOperation?.action === 'stop'
  const runtimeLabel = stopping ? '停止中' : restarting ? '重启中' : !online ? '开发电脑离线' : reachable ? '服务可访问' : running ? '运行中 · 已复用' : runtime?.state === 'stopped' ? '未运行' : runtime?.state === 'ambiguous' ? '多个实例' : '待检查'
  const supportsRestart = check?.support?.restart === true && ['debugger_mcp', 'run_control_mcp'].includes(check.support.restart_mode || '')
  const runtimeMessage = stopping ? '正在由 IDE 停止当前配置并确认进程退出…' : restarting ? '正在由 IDE 停止旧实例、启动并验证当前配置…' : inspecting ? '正在检查运行状态…' : !online ? '开发电脑离线，上次运行状态仅供参考。' : runtimeResult?.result.restarted ? '当前配置已重启，新实例运行正常。' : reachable ? '已使用现有服务，服务访问正常。' : running ? '已使用现有实例，进程运行正常。' : runtime?.reason || '点击检查运行状态，可发现并使用已经启动的服务。'
  const requestRestart = () => {
    if (supportsRestart) { action.mutate('restart'); return }
    restartAfterCheck.current = true
    setCheckingRestart(true)
    action.mutate('check')
  }
  const configureRuntime = () => {
    setRuntimeSetupOpen(false)
    setEditingSetup(true)
    setActiveStep(0)
    setEditingConnection(true)
    setConnectionName('pycharm')
    setPaste('')
  }
  const observedAt = runtime?.observed_at || runtimeResult?.created_at
  const debugPanel = <div className="w-ide-debug" aria-label="当前配置调试">
    <div className="w-ide-debug-heading"><h3>运行与调试</h3><Tag color={usingExisting ? 'success' : 'default'}>{runtimeLabel}</Tag></div>
    <p>启动配置：<strong>{draft.run_configuration || '尚未选择'}</strong> · 开发电脑：{node?.hostname || draft.node_id || '尚未选择'}</p>
    <Button disabled={busy} onClick={() => editStep(1)}>切换启动配置</Button>
    <div className="w-ide-runtime-status" data-running={usingExisting} role="status" aria-live="polite"><strong>{runtimeMessage}</strong>{observedAt && <span>上次检查：{new Date(observedAt * 1000).toLocaleTimeString()}{runtime?.instances.some(instance => instance.pid > 0) ? ` · PID ${runtime.instances.filter(instance => instance.pid > 0).map(instance => instance.pid).join('、')}` : ''}{runtime?.instances.some(instance => instance.session_id) ? ` · 运行会话 ${runtime.instances.filter(instance => instance.session_id).map(instance => instance.session_id).join('、')}` : ''}</span>}</div>
    {runtimeIssue && <Alert type="warning" showIcon message={runtimeIssue} />}
    {!usingExisting && permissionReason && <p role="status">{permissionReason}</p>}
    <Space wrap style={{ marginTop: 12 }}>{!usingExisting && <Button type="primary" aria-label="启动当前配置" loading={requestedOperation?.action === 'execute'} disabled={!allowed || busy || !online || !runConfigured || check?.support?.execute === false} onClick={() => action.mutate('execute')}>启动当前配置</Button>}<Button type={usingExisting ? 'primary' : 'default'} aria-label="重启当前配置" loading={restarting || checkingRestart} disabled={!allowed || busy || !online || !runConfigured} onClick={requestRestart}>重启当前配置</Button>{supportsRestart && <Button aria-label="停止当前配置" loading={stopping} disabled={!allowed || busy || !online || !runConfigured} onClick={() => action.mutate('stop')}>停止当前配置</Button>}<Button aria-label={draft.target_url ? '验证当前服务' : '刷新运行状态'} aria-busy={inspecting} loading={inspecting} disabled={!canInspect} onClick={() => action.mutate('probe')}>{draft.target_url ? '验证当前服务' : '刷新运行状态'}</Button></Space>
    <p className="w-ide-action-caption">停止与重启针对当前保存的项目和运行配置；刷新只读取状态。</p>
    <details className="w-ide-runtime-details"><summary>检测详情与可选配置</summary>
      {runtime && <p>实例来源：{runtime.reason}</p>}
      <p>HTTP 检查：{draft.target_url || '未配置，当前按项目进程检查。健康检查为可选项。'}<Button type="link" size="small" disabled={busy} onClick={() => editStep(1)}>调整检查配置</Button></p>
      {!supportsRestart && <p>{check?.support?.restart_reason || '当前连接尚未提供普通 Run 的配置级停止工具。'}<Button type="link" size="small" disabled={busy} onClick={() => setRuntimeSetupOpen(true)}>连接 IDE 运行控制</Button></p>}
    </details>
  </div>
  return <div className="w-ide-guide">
    <Modal title="连接 IDE 运行控制" open={runtimeSetupOpen} onCancel={() => setRuntimeSetupOpen(false)} footer={<Space><Button disabled={busy} onClick={() => configureRuntime()}>选择已有 IDE 连接</Button><Button type="primary" disabled={busy} onClick={() => { setRuntimeSetupOpen(false); requestRestart() }}>检查连接并重启</Button></Space>}>
      <p>普通 Run 的接管由社区开源 MCP Run Control（Lewik/mcp-run-control）提供，安装在 PyCharm，使用 PyCharm 原生 MCP 地址。已有 Debugger MCP 保留用于调试会话。</p>
      <ol><li>在 PyCharm 安装 MCP Run Control；也可从开源项目 Releases 下载原版安装包，再通过插件设置从磁盘安装。</li><li>保持 PyCharm 原生 MCP Server 开启。已保存的同一 PyCharm 原生连接会自动复用，无需重复导入。</li><li>加载插件后点击“检查连接并重启”。Mino 会停止当前配置的旧实例，确认退出后启动同一配置。</li></ol>
      <p><a href="/ide/mcp-run-control-0.1.2-local261.1.zip" download>PyCharm 261 兼容包（本地适配）</a>：基于社区 0.1.2 修复当前 IDE 的接口兼容问题，安装后按 IDE 提示重新加载。</p>
      <p><a href="https://plugins.jetbrains.com/plugin/31901-mcp-run-control" target="_blank" rel="noopener noreferrer">打开插件市场</a> · <a href="https://github.com/Lewik/mcp-run-control/releases/download/v0.1.2/mcp-run-control-0.1.2.zip" target="_blank" rel="noopener noreferrer">原版安装包</a> · <a href="https://github.com/Lewik/mcp-run-control" target="_blank" rel="noopener noreferrer">查看开源项目</a></p>
      <p>如尚未保存原生连接：在 PyCharm「设置 → 工具 → MCP Server」复制 HTTP 配置，再选择已有连接或导入。使用 PyCharm 显示的实际地址。</p>
      <Alert type="info" showIcon message="Mino 会检查插件是否实际可用。已有普通 Run 实例可直接接管，不需要先改为 Debug，也不会因“连接成功”就误报重启可用。" />
    </Modal>
    <header className="w-ide-header"><div><Typography.Title level={4}>{showDetails ? 'IDE 联动详情' : 'IDE 联动'}</Typography.Title>{showDetails && <p className="w-ide-subtitle">配置已保存，可直接运行、验证或调整当前配置。</p>}</div>{showDetails ? <Space><Tag color="success">配置已完成</Tag><Button disabled={busy} onClick={() => editStep(1)}>编辑配置</Button></Space> : <Space>{setupComplete && <Button disabled={busy} onClick={() => { setEditingSetup(false); setActiveStep(null) }}>返回详情</Button>}<label className="w-ide-toggle"><Switch checked={draft.enabled} disabled={busy} onChange={enabled => patch({ enabled })} />{draft.enabled ? '已启用' : '未启用'}</label></Space>}</header>
    <ol className="w-ide-progress" aria-label="配置步骤">
      {stepTitles.map((title, index) => <li key={title} data-active={!showDetails && activeStep === index} data-done={stepDone[index]}><button type="button" aria-label={`${index + 1}. ${title}`} aria-current={!showDetails && activeStep === index ? 'step' : undefined} disabled={busy} onClick={() => editStep(index)}><span className="w-ide-step-number" aria-hidden="true">{stepDone[index] ? <Check size={16} /> : index + 1}</span><span className="w-ide-step-label"><b>{title}</b><small>{stepStates[index]}</small></span><ArrowRight className="w-ide-step-arrow" size={16} aria-hidden="true" /></button></li>)}
    </ol>
    {saveError && <Alert type="error" showIcon message="配置尚未保存" description={saveError} />}
    {config.data && config.data.revision !== revision && dirty && <Alert type="warning" message="服务器配置已有更新，请先保留本页修改，再重新加载核对；不会自动覆盖你的草稿。" /> }
    {!draft.enabled && <Alert type="info" message="未启用开发联动，可直接运行普通测试。" />}
    {showDetails && <section className="w-ide-step w-ide-details" aria-label="联动配置详情"><div className="w-ide-step-heading"><h3>当前配置</h3><Tag>r{revision}</Tag></div><dl className="w-ide-detail-grid">
      <div><dt>开发电脑</dt><dd>{node?.hostname || draft.node_id}<Tag color={online ? 'success' : 'default'}>{online ? '在线' : '离线'}</Tag></dd></div>
      <div><dt>IDE 连接</dt><dd>{draft.connection_id}<span>连接版本 r{draft.connection_revision}</span></dd></div>
      <div><dt>IDE 项目路径</dt><dd>{draft.project_path}</dd></div><div><dt>应用源码目录</dt><dd>{draft.source_dir}</dd></div>
      <div><dt>启动配置</dt><dd>{draft.run_configuration}</dd></div><div><dt>执行权限</dt><dd>测试环境已确认 · 开发操作已允许</dd></div>
      <div><dt>健康检查（可选）</dt><dd>{draft.target_url || '使用项目进程状态'}</dd></div>{draft.build_configuration && <div><dt>构建配置</dt><dd>{draft.build_configuration}</dd></div>}
    </dl>{debugPanel}</section>}
    {draft.enabled && !showDetails && <>
      {activeStep === 0 && <section className="w-ide-step" aria-label="连接项目">
      <div className="w-ide-step-heading"><h3>连接项目</h3><Tag color={checked ? 'success' : checkFailed ? 'error' : 'default'}>{connectionStatus}</Tag></div>
      <ul className="w-ide-checks" aria-label="项目连接状态">
        <li data-pass={online}><Server size={17} /><span>开发电脑<strong>{online ? '在线' : draft.node_id ? '离线' : '未选择'}</strong></span>{online && <Check size={15} />}</li>
        <li data-pass={ideConnected}><Plug size={17} /><span>IDE 连通<strong>{ideConnected ? '已通过' : checkingConnection ? '检查中' : checkFailed ? connectionAttempted ? '连接失败' : '尚未检查' : '未验证'}</strong></span>{ideConnected && <Check size={15} />}</li>
        <li data-pass={checked}><FolderCheck size={17} /><span>项目匹配<strong>{checked ? '已通过' : checkingConnection ? '核对中' : checkFailed ? ideConnected || issue.field === 'project_path' || issue.field === 'source_dir' ? '未通过' : '尚未检查' : '未验证'}</strong></span>{checked && <Check size={15} />}</li>
      </ul>
      <div className="w-ide-step-content">
      {checkFailed && <Alert className="w-ide-check-error" type="error" showIcon message={issue.title} description={<><p>{issue.reason}</p><p><strong>处理办法：</strong>{issue.remediation}</p></>} action={issue.field && <Button disabled={busy} onClick={fixIssue}>{issue.field === 'connection_id' ? '检查连接配置' : issue.field === 'source_dir' ? '修改源码目录' : '修改项目路径'}</Button>} />}
      {nodes.isError && <Alert type="error" message={errText(nodes.error)} />}
      <div className="w-ide-form-grid">
      <label>开发电脑<Select className="w-full" aria-label="开发电脑" placeholder="选择开发电脑" value={draft.node_id || undefined} disabled={busy} onChange={node_id => { patch({ node_id, connection_id: '', connection_revision: 0 }); setPaste(''); setEditingConnection(false) }} options={(nodes.data?.nodes ?? []).map(n => ({ value: n.node_id, label: `${n.hostname || n.node_id} · ${nodeIsOnline(n) ? '在线' : '离线'}` }))} /></label>
      <div className="w-ide-connection-field"><div className="w-ide-field-label"><span>IDE 连接</span>{draft.connection_id && <Button type="link" size="small" disabled={busy} onClick={() => setEditingConnection(value => !value)}>{editingConnection ? '取消更换' : '更换 IDE 连接'}</Button>}</div>
      {draft.connection_id && !editingConnection && <div className="w-ide-connection"><Plug size={18} /><div><strong>{draft.connection_id}</strong><span title={selectedConnection?.url}>{selectedConnection?.url || `连接版本 r${draft.connection_revision}`}</span></div><Tag>{draft.connection_id === config.data?.config.connection_id && draft.connection_revision === config.data?.config.connection_revision ? '已保存连接' : '待保存'}</Tag></div>}
      {(!draft.connection_id || editingConnection) && <div className="w-ide-import">
      <Button size="small" disabled={!draft.node_id || busy} onClick={() => connect.mutate(true)}>刷新已保存连接</Button>
      {!!connections.length && <Select className="w-full" aria-label="已保存的 IDE 连接" placeholder="选择已有连接" value={draft.connection_id || undefined} disabled={busy} options={connections.map(connection => ({ value: connection.connection_id, label: `${connection.connection_id} · ${connection.url} · r${connection.revision}` }))} onChange={id => { const connection = connections.find(connection => connection.connection_id === id)!; patch({ connection_id: id, connection_revision: connection.revision }); setConnectionName(id); setPaste(''); setEditingConnection(false) }} />}
      <Input.TextArea rows={3} aria-label="导入 IDE 连接" value={paste} disabled={busy} onChange={e => setPaste(e.target.value)} placeholder="粘贴 PyCharm MCP Server 的 HTTP JSON 配置" />
      {parsed.error && <Alert type="error" message={parsed.error} />}
      {parsed.rows.length > 1 && <Select className="w-full" placeholder="请选择要导入的服务器" value={serverName} options={parsed.rows.map(x => ({ value: x.name, label: x.name }))} onChange={setServerName} />}
      {selectedServer && <div className="space-y-2"><Typography.Text>预览：{selectedServer.url} · {selectedServer.transport}</Typography.Text><Input value={connectionName} disabled={busy} onChange={e => setConnectionName(e.target.value)} addonBefore="连接名称" /></div>}
      <details className="w-ide-help"><summary>如何获取连接配置</summary><p>PyCharm → 设置 → 工具 → MCP Server → 复制 HTTP 配置。普通 Run 控制使用原生 MCP 与社区 MCP Run Control；已有 Debugger MCP 连接仍可用于调试会话。已保存连接可直接选择，无需重新粘贴。地址相对于所选开发电脑。</p><p>认证使用 header_env 引用 Scout 本机环境变量，例如 {JSON.stringify({ Authorization: 'MINO_IDE_AUTHORIZATION' })}，不要粘贴密钥。SSE 需显式填写 transport=sse。</p></details>
      </div>}
      </div>
      <label>IDE 项目路径<Input ref={projectInput} status={checkFailed && issue.field === 'project_path' ? 'error' : undefined} aria-invalid={checkFailed && issue.field === 'project_path'} placeholder="PyCharm 当前打开的项目根目录" value={draft.project_path} disabled={busy} onChange={e => patch({ project_path: e.target.value })} /></label>
      <label>应用源码目录<Input ref={sourceInput} status={checkFailed && issue.field === 'source_dir' ? 'error' : undefined} aria-invalid={checkFailed && issue.field === 'source_dir'} placeholder="该应用源码所在目录；单应用项目通常与上面相同" value={draft.source_dir} disabled={busy} onChange={e => patch({ source_dir: e.target.value })} /></label>
      </div>
      </div></section>}
      {activeStep === 1 && <section className="w-ide-step" aria-label="选择启动方式"><h3>2. 选择启动方式</h3><div className="w-ide-step-content">
      <label className="block">IDE 启动配置<Select className="w-full" allowClear placeholder="选择 PyCharm 启动配置" value={draft.run_configuration || undefined} disabled={busy || !check?.configurations} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ run_configuration: name || '' })} /></label>
      <label className="block">服务健康检查地址（需要启动后检查时填写）<Input value={draft.target_url} placeholder="http://127.0.0.1:测试端口/health" disabled={busy} onChange={e => patch({ target_url: e.target.value })} /></label>
      <Typography.Paragraph type="secondary">填写开发电脑上测试服务的健康检查接口；不确定时可留空，仍可保存并检查 IDE 连接。</Typography.Paragraph>
      <details><summary>高级设置：构建、版本核对与日志（可选）</summary><div className="space-y-3 mt-3">
      <label className="block">构建配置（可选）<Select className="w-full" allowClear value={draft.build_configuration || undefined} disabled={busy} options={(check?.configurations ?? []).map(name => ({ value: name, label: name }))} onChange={name => patch({ build_configuration: name || '' })} /></label>
      <Space.Compact className="w-full"><Input addonBefore="预期 build（可选）" value={draft.expected_build} onChange={e => patch({ expected_build: e.target.value })} /><Input addonBefore="JSON 字段" value={draft.build_field} onChange={e => patch({ build_field: e.target.value })} /></Space.Compact>
      <label className="block">预期测试实例 ID（可选）<Input value={draft.expected_instance_id || ''} onChange={e => patch({ expected_instance_id: e.target.value })} placeholder="MINO 服务使用 /sys/server_info 的 instance_id；核对测试环境后填写" /></label>
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
      </div></section>}
      {activeStep === 2 && <section className="w-ide-step" aria-label="启动与验证"><h3>3. 启动与验证</h3><div className="w-ide-step-content">
      <div className="w-ide-permission"><Checkbox checked={draft.test_parameters_confirmed} disabled={busy} onChange={e => patch({ test_parameters_confirmed: e.target.checked })}>我已核对这是测试环境</Checkbox><p>请在 PyCharm 核对所选启动配置的地址、数据目录和凭据。勾选只记录你的确认，不会自动修改这些参数；未确认时不能启动、重启、构建或安装。</p></div>
      <div className="w-ide-permission"><Checkbox checked={draft.execution_allowed} disabled={busy} onChange={e => patch({ execution_allowed: e.target.checked })}>允许 Mino 执行此应用的开发操作</Checkbox><p>保存后允许执行已登记的启动、构建和受控重启；Android 还包括已配置 APK 的安装。勾选本身不会启动应用。关闭后仍可检查 IDE 连接和服务是否就绪。</p></div>
      {debugPanel}
      </div></section>}
    </>}
    {draft.enabled && !showDetails && <footer className="w-ide-footer" aria-label="步骤操作"><span role="status">{footerStatus}</span><Space>{activeStep > 0 && <Button disabled={busy} onClick={() => setActiveStep(activeStep - 1)}>上一步</Button>}{(activeStep !== 2 || needsSave || !checked) && <Button type="primary" aria-label={stepNext.label} loading={busy} disabled={busy || stepNext.disabled} onClick={stepNext.run}>{stepNext.label}<ArrowRight size={15} /></Button>}{activeStep === 2 && setupComplete && <Button type="primary" disabled={busy} onClick={() => { setEditingSetup(false); setActiveStep(null) }}>完成配置</Button>}</Space></footer>}
    {draft.enabled && (showDetails || activeStep === 2) && <details className="w-ide-step"><summary>更多操作 <span>重新检查和构建</span></summary><div className="w-ide-step-content">
      <p className="w-form-hint">{needsSave ? '请先保存当前设置。' : !online ? '开发电脑尚未上线。' : !checked ? '请先完成 IDE 连接检查。' : unknown ? '请先核对上次未知操作的回执。' : '验证会检查项目运行状态；构建需要选择构建配置。'}</p>
      <div className="w-ide-action-help">
        <p><strong>重新检查 IDE</strong>：核对项目并读取启动项，不运行应用。{needsSave ? '需先保存设置。' : !online ? '需开发电脑在线。' : ''}</p>
        <p><strong>验证当前服务</strong>：读取已有进程状态，配置健康地址后再验证 HTTP 服务。</p>
        <p><strong>重启应用</strong>：由 IDE 自动停止并重新启动当前选中的配置，随后验证新实例；不会另开工具托管服务。</p>
        <p><strong>构建</strong>：执行第二步高级设置中选定的构建配置，不等于启动或发布。{permissionReason || (!draft.build_configuration ? '不可用：未选择构建配置。' : '')}</p>
      </div>
      <Space wrap><Button disabled={needsSave || busy || !revision || !online} onClick={() => action.mutate('check')}>重新检查 IDE</Button><Button disabled={!canInspect} onClick={() => action.mutate('probe')}>检查服务是否就绪</Button><Button disabled={!allowed || busy || !online || !draft.build_configuration} onClick={() => action.mutate('build')}>构建</Button></Space>
    </div></details>}
    {(showDetails || activeStep === 2) && stepResult && <section className="w-ide-result" aria-label="最近结果"><h3>最近结果</h3><p>{needsSave ? '当前设置尚未保存，旧结果不代表本次配置已就绪。' : stepResult.state === 'ready' && ['probe', 'execute'].includes(stepResult.action) && usingExisting ? reachable ? '服务检查通过，已使用现有服务。' : '运行状态检查完成，已使用现有实例。' : `${statuses[stepResult.state]}${stepResult.result.reason ? '：' + stepResult.result.reason : ''}`}</p>
    </section>}
    {activeStep !== 2 && !(activeStep === 0 && stepResult?.action === 'check') && stepResult && ['failed', 'awaiting_developer', 'unknown'].includes(stepResult.state) && <Alert type="warning" showIcon message={stepResult.result.reason || statuses[stepResult.state]} />}
    {ops.isError && <Alert type="error" message={errText(ops.error)} action={<Button onClick={() => void ops.refetch()}>读取操作记录</Button>} />}
    {(showDetails || activeStep === 2) && items.length > 0 && <details className="w-ide-step"><summary>操作记录（{items.length} 条）</summary>
    {items.map(op => <section key={op.operation_id} className="rounded border p-3 space-y-2">
      <Space><Tag>{statuses[op.state]}</Tag><span>{op.action} · r{op.revision}</span><Typography.Text copyable>{op.operation_id}</Typography.Text></Space>
      {op.result.reason && <p>{op.result.reason}</p>}
      {op.result.reason_code === 'blocked_by_update' && <Alert type="warning" message="等待节点升级结束" description={`升级操作：${op.result.operation_id || '未知'}；等待截止：${new Date(op.deadline * 1000).toLocaleString()}`} />}
      {op.state === 'queued' && <p>排队截止：{new Date(op.deadline * 1000).toLocaleString()}；尚未执行</p>}
      {op.result.stages && <p>{op.result.stages.map(s => `${new Date(s.at * 1000).toLocaleTimeString()} ${stages[s.name] || s.name}`).join(' → ')}</p>}
      {op.result.target_ready !== undefined && <Tag color={op.result.target_ready ? 'green' : 'orange'}>目标：{op.result.target_ready ? '可访问' : '未就绪'}</Tag>}
      {op.result.build_verified !== undefined && <Tag color={op.result.build_verified ? 'green' : 'orange'}>版本：{op.result.build_verified ? '核验通过' : '未核验通过'}</Tag>}
      {op.result.actual_instance_id && <p>实际实例：{op.result.actual_instance_id}（{op.result.instance_verified ? '与预期一致' : '未核对预期'}）</p>}
      {(op.result.actual_build || op.result.build) && <p>实际 build：{op.result.actual_build || op.result.build}</p>}
      {op.result.expected_build && <p>预期 build：{op.result.expected_build}</p>}
      {op.result.package && <p>APK：{op.result.package} · versionCode {op.result.version_code} · 设备 {op.result.device} · SHA256 {op.result.apk_sha256}</p>}
      {op.result.recovery && <p>已读取节点原回执；没有重复执行。{op.result.receipt_lookup?.reason}</p>}
      {['unknown', 'running'].includes(op.state) && <Button loading={recover.isPending} onClick={() => recover.mutate(op.operation_id)}>读取原回执与阶段（不重试执行）</Button>}
      {op.state === 'awaiting_developer' && <Alert type="info" message="请查看本次检测的具体原因。普通 Run 使用 IDE 配置级工具自动停止与重启；仅连接 Debugger MCP 不代表已有 Run 实例可被控制。" />}
      {['execute', 'stop', 'restart', 'build', 'install', 'probe'].includes(op.action) && <p>本操作不代表业务用例测试通过；请到用例执行记录查看测试结果。</p>}
      {op.result.receipt && <><p>来源：{op.result.receipt.source} · exitCode：{op.result.receipt.exitCode ?? '未返回'} · timedOut：{String(op.result.receipt.timedOut ?? false)} · {op.result.receipt.truncated ? '输出已截断' : '单次输出，无实时续读'}</p><pre className="whitespace-pre-wrap overflow-auto" style={{ maxHeight: 260 }}>{op.result.receipt.output}</pre></>}
      {op.state === 'unknown' && !op.result.manual_review?.confirmed_idle && <Button disabled={Date.now() / 1000 < op.deadline} onClick={() => Modal.confirm({ title: '确认已在 IDE 核对应用停止且无在途执行', content: '只解除本操作的准备占用；历史未知结果保留，不标记成功。', onOk: async () => { await reviewPreparation(appId, op.operation_id); refresh() } })}>登记人工处置</Button>}
    </section>)}
    </details>}
  </div>
}
