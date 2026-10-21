import { appRuntimeChannels } from '../config/appRuntimeChannels'
import { useProjects } from '../apps/queries'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useEffect, useMemo, useState, useRef, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Input, Modal, errText, useFeedback } from '@/ui'
import { previewExecution, type ExecutionPreview } from '@/api/v5'
import { getProjectEnv } from '@/api/projectEnv'
import { preflightProjectCases, type CasePreflightResult, type CaseRow } from '@/api/projectCases'
import { CaseAutomationBadge } from '../cases/CaseAutomationBadge'
import { runCaseRunner, getRunRequest, isExecutable, deviceFamilyLabel, type RunPayload } from '@/api/run'
import { unwrapOne } from '@/lib/unwrap'
import { useRunDevices, casePageOptions } from '../cases/queries'
import { channelKindText, channelTitle, type EnvChannel, type EnvDocument } from '../config/envModel'
import { taskKeys } from './queries'
import { useSession } from '@/lib/session'

/**
 * 从任务页直接开跑。
 * 网址跟运行环境走，不写在应用卡片上。设备保留不可用目标并展示原因，由用户明确选择执行目标。
 */
export function CreateTaskDialog({
  open, appId, projectId, onClose, onStarted, initialCaseIds,
}: {
  initialCaseIds?: string[]
  open: boolean
  appId: string
  projectId: string
  onClose: () => void
  onStarted: (runId: string) => void
}) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [uncertain, setUncertain] = useState(false)
  const ownerId = useSession(state => state.user?.user_id || '')
  const pendingKey = `mino:run-request:${ownerId}:${projectId}:${appId}`
  const pending = useRef<RunPayload | null>(null)
  const [caseCache, setCaseCache] = useState<Record<string, CaseRow>>({})
  const env = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: open && !!projectId,
    queryFn: () => getProjectEnv(projectId),
  })

  const projects = useProjects()
  const runtime = useMemo(() => {
    const apps = projects.data?.find(p => p.id === projectId)?.apps || []
    return appRuntimeChannels(env.data, apps.find(a => a.id === appId), apps)
  }, [env.data, projects.data, projectId, appId])
  const doc = useMemo(() => env.data ? { ...env.data, channels: runtime.channels } : undefined, [env.data, runtime])
  const [surface, setSurface] = useState('')
  const [profile, setProfile] = useState('')
  const [sn, setSn] = useState('')
  const [scheme, setScheme] = useState<'visual' | 'dom_preferred'>('dom_preferred')
  const [picked, setPicked] = useState<string[]>([])
  const [kw, setKw] = useState('')
  const settledSearch = useDebouncedValue(kw)
  const cases = useQuery({ ...casePageOptions(projectId, { appId, page, size: 50, search: settledSearch, module: '', result: 'all' }), enabled: open && !!projectId && !!appId })
  useEffect(() => { if (cases.data) setCaseCache(prev => ({ ...prev, ...Object.fromEntries(cases.data.items.map(row => [row.case_id, row])) })) }, [cases.data])
  const devices = useRunDevices(open && !!doc && !!surface && !!profile, { app_id: appId, env_surface: surface, env_profile: profile, action_scheme: scheme, playwright_headless: true })

  const initialSelection = useRef(initialCaseIds)
  initialSelection.current = initialCaseIds
  useEffect(() => {
    if (!open) return
    setScheme('dom_preferred')
    setPicked(initialSelection.current || [])
    setCaseCache({})
    setPage(1)
    try { pending.current = JSON.parse(sessionStorage.getItem(pendingKey) || 'null') as RunPayload | null } catch { pending.current = null }
    setUncertain(!!pending.current)
    setKw('')
  }, [open, pendingKey])
  useEffect(() => {
    if (!open || !doc) return
    setSurface((cur) => doc.channels.some(row => row.id === cur) ? cur : runtime.needsSelection ? '' : doc.channels[0]?.id || '')
    setProfile((cur) => doc.environments.some(row => row.key === cur) ? cur : doc.default_profile || '')
  }, [open, doc, runtime.needsSelection])

  const groups = useMemo(() => {
    const q = kw.trim().toLowerCase()
    const matched = (cases.data?.items || []).filter((row) => {
      if (!q) return true
      return `${row.case_id} ${row.title || ''} ${row.module || ''}`.toLowerCase().includes(q)
    })
    const buckets = new Map<string, CaseRow[]>()
    for (const row of matched) {
      const name = String(row.module || '').trim() || '未分组'
      const list = buckets.get(name) || []
      list.push(row)
      buckets.set(name, list)
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'zh'))
      .map(([name, items]) => ({
        name,
        items: items.sort((a, b) => String(a.title || a.case_id).localeCompare(String(b.title || b.case_id), 'zh')),
      }))
  }, [cases.data, kw])

  const device = (devices.data || []).find((item) => item.sn === sn)
  const webDevice = device?.platform === 'web'
  const block = uncertain ? '受理状态待确认，请先到任务列表核对，避免重复执行'
    : env.isError ? '环境配置读取失败，请重试'
    : env.isLoading ? '正在读取环境配置'
    : !surface || !doc?.channels.some(row => row.id === surface) ? '请选择当前有效的应用渠道'
    : !profile || !doc?.environments.some(row => row.key === profile) ? '请选择当前有效的环境'
    : cases.isError ? '用例读取失败，请重试'
    : devices.isLoading ? '正在查询设备'
    : devices.isError ? errText(devices.error, '设备信息读取失败')
      : !device || !isExecutable(device) ? device?.blocked_reason || '请选择兼容且就绪的执行设备'
            : !picked.length ? '先勾选用例' : ''

  const previewKey = JSON.stringify([projectId, appId, picked, sn, profile, surface, scheme])
  const executionPreview = useMutation({ mutationFn: async () => {
    const key = previewKey
    const rows: { caseId: string; result: ExecutionPreview }[] = []
    for (const caseId of [...picked]) {
      const result = unwrapOne<ExecutionPreview>(await previewExecution(projectId, caseId, {
        app_id: appId, sn, env_profile: profile, env_surface: surface, action_scheme: scheme, execution_mode: 'agent',
      }))
      rows.push({ caseId, result })
    }
    return { key, rows }
  } })
  const previewRows = executionPreview.data?.key === previewKey ? executionPreview.data.rows : []
  const previewStatus = { ready: '当前绑定条件满足', needs_input: '需要补充配置或资源', blocked: '当前不可执行', not_applicable: '不适用' }

  const start = useMutation({
    mutationFn: async () => {
      if (block) throw new Error(block)
      const preflight = unwrapOne<CasePreflightResult>(await preflightProjectCases(projectId, appId, picked))
      const blocked = Array.isArray(preflight.blocked) ? preflight.blocked : []
      const runnable = Array.isArray(preflight.runnable) ? preflight.runnable : []
      if (!runnable.length) {
        const lines = blocked.flatMap((item) => [
          `${item.name || item.case_id || '用例'}：`,
          ...(item.reasons || []).map((reason) => `  · ${reason}`),
        ])
        throw new Error(`所选 ${picked.length} 条用例当前均未通过预检，本次未创建任务：\n${lines.join('\n')}`)
      }
      const payload: RunPayload = {
        client_request_id: crypto.randomUUID(),
        app_id: appId,
        case_ids: picked,
        sn,
        sns: sn ? [sn] : [],
        platform: device?.platform || device?.type,
        env_profile: profile || undefined,
        env_surface: surface || undefined,
        action_scheme: scheme,
        run_type: 'manual',
        execution_mode: 'agent',
        playwright_headless: true,
      }
      pending.current = payload
      sessionStorage.setItem(pendingKey, JSON.stringify(payload))
      const res = await runCaseRunner(payload)
      const runId = res?.data?.run_id || res?.data?.task_id
      if (!runId) throw new Error('没有返回任务编号，无法跟踪这次执行')
      return { runId, total: res.data?.total ?? runnable.length, skipped: res.data?.skipped_cases ?? blocked }
    },
    onSuccess: ({ runId, total, skipped }) => {
      sessionStorage.removeItem(pendingKey)
      pending.current = null
      setUncertain(false)
      void qc.invalidateQueries({ queryKey: taskKeys.list(appId) })
      if (skipped.length) fb.warn(`已创建任务，计划执行 ${total} 条；${skipped.length} 条未纳入执行，原因见任务详情`)
      else fb.ok(`已创建任务，计划执行 ${total} 条用例`)
      onStarted(runId)
    },
    onError: (error) => {
      const submitted = !!pending.current
      setUncertain(submitted)
      if (submitted) void qc.invalidateQueries({ queryKey: taskKeys.list(appId) })
      fb.fail(errText(error, submitted ? '请求未得到受理结果，请核对任务列表' : '预检未通过，本次未创建任务'))
    },
  })

  const recover = useMutation({ mutationFn: async () => {
    const payload = pending.current
    if (!payload?.client_request_id) throw new Error('缺少原请求编号')
    try { return unwrapOne<{ run_id: string }>(await getRunRequest(payload.client_request_id)).run_id }
    catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404) throw error
      // 原请求可能仍在受理中。使用相同编号、相同选择，服务端原子去重。
      const res = await runCaseRunner(payload)
      const runId = res.data?.run_id || res.data?.task_id
      if (!runId) throw new Error('仍未获得受理回执，请稍后恢复')
      return runId
    }
  }, onSuccess: runId => {
    sessionStorage.removeItem(pendingKey); pending.current = null; setUncertain(false)
    void qc.invalidateQueries({ queryKey: taskKeys.list(appId) }); onStarted(runId)
  }, onError: error => fb.fail(errText(error)) })

  return (
    <Modal
      open={open}
      title="新建任务"
      onCancel={() => { if (!start.isPending) onClose() }}
      closable={!start.isPending}
      keyboard={!start.isPending}
      maskClosable={!start.isPending}
      destroyOnHidden
      width={880}
      footer={[
        <span key="count" style={{ float: 'left', lineHeight: '32px', fontWeight: 700 }}>已选 {picked.length} 条用例</span>,
        <Button key="cancel" disabled={start.isPending} onClick={onClose}>取消</Button>,
        <Button key="ok" type="primary" loading={start.isPending} disabled={!!block} onClick={() => start.mutate()}>
          启动
        </Button>,
      ]}
    >
      <div inert={start.isPending} className="flex flex-col" style={{ pointerEvents: start.isPending ? 'none' : undefined, opacity: start.isPending ? 0.7 : 1, gap: 14, maxHeight: '62vh', overflow: 'auto', paddingRight: 4 }}>
        <Section n="1" title="被测应用">
          {doc?.channels.length ? (
            <div className="task-choice-grid" style={grid(2)}>
              {doc.channels.map((channel) => (
                <Choice key={channel.id} pressed={surface === channel.id} onClick={() => setSurface(channel.id)} title={channelTitle(channel)} hint={channel.app_identifier || channel.id} />
              ))}
            </div>
          ) : (
            <p style={hint}>请先配置被测应用渠道；Desktop 任务需要明确目标系统与启动标识。</p>
          )}
        </Section>

        <Section n="2" title="运行环境">
          <div className="task-choice-grid" style={grid(Math.min(3, doc?.environments.length || 3))}>
            {(doc?.environments || [{ key: 'test', label: '测试' }, { key: 'pre', label: '预发' }, { key: 'prod', label: '正式' }]).map((item) => {
              const channel = doc?.channels.find((row) => row.id === surface)
              const url = channel && doc ? launchUrl(doc, item.key, channel) : ''
              return (
                <Choice
                  key={item.key}
                  pressed={profile === item.key}
                  onClick={() => setProfile(item.key)}
                  title={`${item.label} ${item.key}`}
                  hint={`标识 ${item.key}`}
                  extra={url ? `${channel ? channelKindText(channel) : '地址'} · ${url}` : ''}
                />
              )
            })}
          </div>
        </Section>

        <Section n="3" title="执行设备">
          {devices.isLoading ? <p role="status" style={hint}>正在查询设备…</p> : devices.data?.length ? <div className="task-choice-grid" style={grid(2)} role="group" aria-label="执行设备">
            {[...devices.data].sort((a, b) => Number(isExecutable(b)) - Number(isExecutable(a))).map(item => <Choice
              key={item.sn} pressed={sn === item.sn} disabled={!isExecutable(item)} onClick={() => setSn(item.sn)}
              title={deviceFamilyLabel(item)} hint={item.node_name || item.node_id || 'Scout 节点'}
              extra={[item.model, item.sn].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')}
              note={!isExecutable(item) ? item.blocked_reason || '设备未就绪' : undefined}
            />)}
          </div> : !devices.isError ? <p role="status" style={hint}>{!surface || !profile ? '选择应用与运行环境后查看可用设备。' : '当前账号下暂无符合应用和环境的设备，请检查节点连接与设备状态。'}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginTop: 4 }}>
            <span style={hint}>{(devices.data || []).filter(isExecutable).length} 台可执行设备 · {new Set((devices.data || []).map(item => item.node_id || item.current_scout_id || `unknown:${item.sn}`)).size} 个 Scout 节点</span>
            <span className="flex items-center gap-2"><Button type="text" size="small" loading={devices.isFetching} onClick={() => void devices.refetch()}>刷新设备</Button><Button type="link" size="small" href="/settings/runtime" target="_blank" rel="noopener noreferrer">节点管理</Button></span>
          </div>
          {devices.isError ? <p role="alert" style={hint}>{errText(devices.error, '设备读取失败')} <Button size="small" onClick={() => void devices.refetch()}>重试</Button></p> : null}
        </Section>

        <Section n="4" title="执行方案">
          <div className="task-choice-grid" style={grid(2)}>
            <Choice pressed={scheme === 'dom_preferred'} onClick={() => setScheme('dom_preferred')} title="DOM 优先" hint="有有效结构用结构，无法定位时用当前截图兜底" />
            <Choice pressed={scheme === 'visual'} onClick={() => { setScheme('visual') }} title="看图 visual" hint="纯视觉：按模型坐标、输入、滑动" />
          </div>
          {webDevice ? <div style={{ marginTop: 8 }}>
            <p style={{ ...hint, marginTop: 4 }}>仅用于 DOM 优先的 Web 测试；按已审阅发布的步骤和校验执行，运行中不临时改写计划。</p>
          </div> : null}
        </Section>

        <section aria-label="执行条件预检">
          <Button size="small" disabled={!!block || executionPreview.isPending} loading={executionPreview.isPending} onClick={() => executionPreview.mutate()}>预检所选用例</Button>
          <p style={hint}>只检查当前设备、配置与计划，不创建任务或占用资源。启动时会重新核对；预检通过不代表执行通过。</p>
          {executionPreview.error && <p role="alert">{errText(executionPreview.error, '预检失败，可重试')}</p>}
          {executionPreview.data && executionPreview.data.key !== previewKey && <p>选择已变化，请重新预检。</p>}
          {previewRows.map(({ caseId, result }) => <details key={caseId} open={result.status !== 'ready'}>
            <summary>{caseCache[caseId]?.title || caseId} · {previewStatus[result.status] || '未知预检状态'}</summary>
            <ul>{result.diagnostics.map((item, index) => <li key={index}>
              {item.requirement_status === 'conditional_pending_observation' ? '条件必需：运行时观察，若适用仍须处理此缺口：' : item.blocking === false ? '可选分支未纳入本次执行（不计通过）：' : ''}{item.reason_code}
              {item.step_ref ? ` · 步骤 ${item.step_ref}` : ''}{item.clause_ref ? ` · ${item.clause_ref}` : ''}
              {item.missing_fields?.length ? ` · 待补充 ${item.missing_fields.join('、')}` : ''}
            </li>)}</ul>
          </details>)}
        </section>

        <Section n="5" title="勾选用例">
          <p style={hint}>当前应用范围 · 已选 {picked.length} 条（跨页保留）。启动时执行通过预检的用例，未纳入项及原因保留在任务详情。</p>
          {!!picked.length && <section aria-label="完整所选清单" style={{ padding: '8px 10px', border: '1px solid var(--w-border)', borderRadius: 8 }}>
            <strong>全部所选（包含其他页面和筛选范围）</strong>
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none', maxHeight: 160, overflow: 'auto' }}>{picked.map(id => <li key={id} className="flex items-start justify-between gap-3" style={{ padding: '4px 0' }}>
              <span style={{ overflowWrap: 'anywhere' }}>{caseCache[id]?.title || '名称待核对'} · <span className="w-mono">{id}</span>{!cases.data?.items.some(row => row.case_id === id) ? ' · 不在当前页' : ''}</span>
              <Button size="small" aria-label={`移除所选 ${id}`} onClick={() => setPicked(prev => prev.filter(key => key !== id))}>移除</Button>
            </li>)}</ul>
          </section>}
          {env.isError && <p role="alert">{errText(env.error)} <Button onClick={() => void env.refetch()}>重试环境</Button></p>}
          {cases.isError && <p role="alert">{errText(cases.error)} <Button onClick={() => void cases.refetch()}>重试用例</Button></p>}
          {uncertain && <p role="alert">原请求受理状态待确认，选择与请求编号已保留。<Button loading={recover.isPending} onClick={() => recover.mutate()}>恢复原请求</Button></p>}
          <Input size="small" value={kw} placeholder="按名称或编号筛选" onChange={(event) => { setKw(event.target.value); setPage(1) }} style={{ marginBottom: 8 }} />
          <div className="flex flex-col" style={{ gap: 4, maxHeight: 220, overflow: 'auto' }}>
            {cases.isLoading ? <p style={hint}>正在读取用例…</p> : null}
            {!cases.isLoading && !groups.length ? <p style={hint}>{projectId ? '没有可选用例' : '链接里没有项目，从项目列表重新进入后才能勾选用例。'}</p> : null}
            {groups.map((group) => (
              <div key={group.name}>
                <div style={{ margin: '8px 0 4px', fontSize: 12, fontWeight: 750, color: 'var(--w-text-tertiary)' }}>{group.name}</div>
                {group.items.map((row) => (
                  <label key={row.case_id} className="flex items-start gap-2" style={{ padding: '4px 2px', cursor: 'pointer' }}>
                    <Checkbox checked={picked.includes(row.case_id)} onChange={(event) => toggleCase(row, event.target.checked, setPicked)} />
                    <span className="min-w-0">
                      <span className="block truncate" style={{ fontWeight: 650 }}>{row.title || '无标题'}</span>
                      <span className="w-mono block truncate" style={{ fontSize: 11, color: 'var(--w-text-quaternary)' }}>{row.case_id}</span>
                      <CaseAutomationBadge row={row} />
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="flex gap-2"><Button disabled={page <= 1 || cases.isFetching} onClick={() => setPage(prev => prev - 1)}>上一页</Button><span>第 {page} 页 · 共 {cases.data?.total ?? '—'} 条</span><Button disabled={cases.isFetching || page * 50 >= (cases.data?.total || 0)} onClick={() => setPage(prev => prev + 1)}>下一页</Button></div>
          {block && picked.length === 0 ? null : block ? <p style={{ ...hint, marginTop: 8 }}>{block}</p> : null}
        </Section>
      </div>
    </Modal>
  )
}

function toggleCase(row: CaseRow, on: boolean, setPicked: Dispatch<SetStateAction<string[]>>) {
  setPicked((prev) => on ? [...new Set([...prev, row.case_id])] : prev.filter((id) => id !== row.case_id))
}

function launchUrl(doc: EnvDocument, envKey: string, channel: EnvChannel) {
  return String(doc.profiles[envKey]?.[channel.id]?.[channel.field] || '').trim()
}

function Section({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section>
      <p style={{ margin: '0 0 6px', fontWeight: 750 }}>
        <span style={index}>{n}</span>
        {title}
      </p>
      {children}
    </section>
  )
}

function Choice({ pressed, onClick, title, hint, extra, disabled = false, note }: { pressed: boolean; onClick: () => void; title: string; hint?: string; extra?: string; disabled?: boolean; note?: string }) {
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onClick} style={{ ...choice, ...(pressed ? choiceOn : {}), ...(disabled ? { cursor: 'not-allowed', background: 'var(--w-fill)' } : {}) }}>
      <b style={{ display: 'block' }}>{title}</b>
      {hint ? <small style={sub}>{hint}</small> : null}
      {extra ? <small style={{ ...sub, fontFamily: 'var(--w-font-mono)', wordBreak: 'break-all' }}>{extra}</small> : null}
      {note ? <small style={{ ...sub, color: 'var(--w-warn)' }}>{note}</small> : null}
    </button>
  )
}

const grid = (columns: number): CSSProperties & { '--task-choice-columns': number } => ({ '--task-choice-columns': Math.max(1, columns) })
const choice: CSSProperties = {
  textAlign: 'left', minWidth: 0, overflowWrap: 'anywhere', minHeight: 72, border: '1px solid var(--w-border-strong)', background: 'var(--w-surface)',
  borderRadius: 12, padding: '10px 12px', cursor: 'pointer',
}
const choiceOn: CSSProperties = { borderColor: 'var(--w-primary)', background: 'var(--w-primary-soft)', boxShadow: 'inset 0 0 0 1px var(--w-primary)' }
const sub: CSSProperties = { display: 'block', marginTop: 3, color: 'var(--w-text-tertiary)', fontWeight: 550, lineHeight: 1.4 }
const hint: CSSProperties = { margin: 0, color: 'var(--w-text-tertiary)', fontSize: 12 }
const index: CSSProperties = {
  display: 'inline-grid', placeItems: 'center', width: 18, height: 18, marginRight: 6,
  borderRadius: 99, background: 'var(--w-fill)', fontSize: 11,
}
