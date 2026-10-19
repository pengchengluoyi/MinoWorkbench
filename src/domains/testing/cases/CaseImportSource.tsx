import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listCaseImportSources, readCaseImportSource, type ImportSourceKind, type ImportSourceNode, type ImportSourceData } from '@/api/projectCases'
import { unwrapOne } from '@/lib/unwrap'
import { nexusOrigin } from '@/lib/config'
import { useSession } from '@/lib/session'
import { Button, Input, Select, errText } from '@/ui'

type Source = 'file' | ImportSourceKind
const sources: { value: Source; label: string }[] = [
  { value: 'file', label: '本地文件' }, { value: 'sheets', label: '飞书表格' }, { value: 'case_api', label: '用例接口' },
]
const messages: Record<string, string> = {
  source_sheets_url_invalid: '请粘贴飞书电子表格的 HTTPS 链接。',
  source_sheets_tab_required: '链接没有包含工作表。请在飞书中选中要导入的工作表，再复制带 sheet 参数的链接。',
  source_explicit_bounded_range_required: '请输入读取范围，例如 A1:Z1000。',
  source_node_unavailable: '读取节点已离线，请刷新节点后重试。',
  source_node_heartbeat_stale: '读取节点已离线，请刷新节点后重试。',
  source_api_not_configured: '用例服务地址未配置，请检查「管理 → 集成配置」。',
  source_api_credentials_missing: '当前读取节点缺少可用的登录邮箱或密码。请检查该节点当前环境的用例服务账号；无需重复填写服务地址。',
  source_api_url_invalid: '用例服务地址无效，请检查「管理 → 集成配置」。',
  source_api_auth_denied: '用例服务登录失败，请检查节点中保存的账号配置。',
  source_api_unavailable: '用例服务无法连接，请检查服务地址和网络。',
  source_api_service_mismatch: '用例服务地址已更新，请重新读取项目列表；旧版 Scout 需要更新后使用。',
  source_api_id_invalid: '项目或会话编号无效，请重新读取项目和会话列表。',
  source_api_case_id_invalid: '用例服务返回的用例缺少有效 ID，请检查源用例数据。',
  source_api_record_session_id_invalid: '源用例的会话编号格式无效，请检查用例服务返回的数据。',
  source_api_record_project_id_invalid: '源用例的项目编号格式无效，请检查用例服务返回的数据。',
  source_api_duplicate_id: '用例服务返回了重复的编号，请检查源数据后重试。',
  source_api_session_mismatch: '返回的用例不属于所选会话，请重新读取会话列表后重试。',
  source_api_project_mismatch: '返回的用例不属于所选项目，请重新读取项目列表后重试。',
  source_api_payload_invalid: '用例服务返回的数据格式不完整，无法读取。',
  source_api_field_invalid: '用例服务返回的字段格式不受支持，请检查源用例数据。',
  source_api_incomplete: '用例服务只返回了部分数据，请确认接口提供完整列表。',
  source_api_changed_during_read: '读取期间源用例发生变化，请稍后重新读取。',
  source_api_login_invalid: '用例服务未返回有效的登录结果，请检查服务接入配置。',
  source_api_http_failed: '用例服务请求失败，请确认所选项目、会话仍存在且有读取权限。',
  source_api_timeout: '读取用例服务超时，请检查网络后重试。',
  source_api_json_invalid: '用例服务未返回有效的数据，请检查服务地址和运行状态。',
  source_api_response_too_large: '用例数据量过大，请选择单个会话后读取。',
  source_api_redirect_rejected: '用例服务地址发生跳转，请在管理页面配置实际服务地址。',
  source_sheets_read_denied: '无法读取飞书表格，请检查节点的飞书接入配置和表格权限。',
  source_import_empty: '所选范围没有可导入的用例，请检查工作表、读取范围或会话。',
}

export function CaseImportSource({ projectId, busy, onBusy, onFile, onTable, initialSourceUrl = '' }: { initialSourceUrl?: string;
  projectId: string; busy: boolean; onBusy: (busy: boolean) => void; onFile: () => void
  onTable: (table: string[][], filename: string) => void
}) {
  const owner = useSession(state => state.user?.user_id || '')
  const [source, setSource] = useState<Source>(initialSourceUrl ? 'sheets' : 'file')
  const [nodeId, setNodeId] = useState('')
  const [url, setUrl] = useState(initialSourceUrl)
  const [range, setRange] = useState('A1:Z1000')
  const [projectChoice, setProjectChoice] = useState({ parent: '', id: '' })
  const [sessionChoice, setSessionChoice] = useState({ parent: '', id: '' })
  const [scope, setScope] = useState('project')
  const [error, setError] = useState('')
  const alive = useRef(true)
  const reading = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const environment = nexusOrigin()
  const queryScope = ['case-import-sources', environment, owner, projectId]
  const nodes = useQuery({ queryKey: queryScope, enabled: source !== 'file', retry: false,
    refetchOnWindowFocus: false, queryFn: async () => unwrapOne<{ items: ImportSourceNode[] }>(await listCaseImportSources(projectId)).items })
  const options = (nodes.data || []).filter(node => node.kinds.includes(source as ImportSourceKind))
  // Do not silently replace an explicitly selected node when it disappears.
  const selectedNode = nodeId ? options.find(node => node.id === nodeId) : options[0]
  const selectedNodeId = selectedNode?.id || ''
  const nodeReady = !!selectedNodeId && !nodes.isError && !nodes.isPending
  const projectParent = JSON.stringify([...queryScope, selectedNodeId])
  const projectsQuery = useQuery({
    queryKey: [...queryScope, selectedNodeId, 'projects'],
    enabled: source === 'case_api' && nodeReady,
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const data = unwrapOne<ImportSourceData>(await readCaseImportSource(projectId, 'case_api', { node_id: selectedNodeId }, 'projects', signal))
      if (!Array.isArray(data.items) || !data.service_url) throw new Error('项目列表或服务地址返回不完整，请重试。')
      return data
    },
  })
  const projects = projectsQuery.isSuccess ? projectsQuery.data.items || [] : []
  const project = projectChoice.parent === projectParent && projects.some(item => item.id === projectChoice.id)
    ? projectChoice.id : projects.length === 1 ? projects[0].id : ''
  const serviceUrl = projectsQuery.isSuccess ? projectsQuery.data.service_url || '' : ''
  const sessionParent = JSON.stringify([projectParent, serviceUrl, project, projectsQuery.dataUpdatedAt])
  const sessionsQuery = useQuery({
    queryKey: [...queryScope, selectedNodeId, serviceUrl, project, projectsQuery.dataUpdatedAt, 'sessions'],
    enabled: source === 'case_api' && nodeReady && !!project && !!serviceUrl && scope === 'session' && !projectsQuery.isFetching,
    retry: false, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const data = unwrapOne<ImportSourceData>(await readCaseImportSource(projectId, 'case_api', {
        node_id: selectedNodeId, service_url: serviceUrl, remote_project_id: project,
      }, 'sessions', signal))
      if (!Array.isArray(data.items)) throw new Error('会话列表返回不完整，请重试。')
      return data.items
    },
  })
  const sessions = sessionsQuery.isSuccess ? sessionsQuery.data : []
  const session = sessionChoice.parent === sessionParent && sessions.some(item => item.id === sessionChoice.id)
    ? sessionChoice.id : sessions.length === 1 ? sessions[0].id : ''
  const listsLoading = projectsQuery.isFetching || (scope === 'session' && sessionsQuery.isFetching)
  const canRead = nodeReady && (source === 'sheets' ? !!url.trim() && !!range.trim()
    : !!project && !!serviceUrl && !listsLoading && !projectsQuery.isError
      && (scope !== 'session' || (!!session && !sessionsQuery.isError)))
  const clearRemote = () => {
    setProjectChoice({ parent: '', id: '' }); setSessionChoice({ parent: '', id: '' }); setError('')
  }
  const errorText = (exception: unknown) => {
    const code = (exception as { response?: { data?: { detail?: { reason_code?: string } } } })?.response?.data?.detail?.reason_code || ''
    return messages[code] || (code ? '读取失败，请检查来源数据和节点接入配置后重试。' : errText(exception, '读取失败，请检查节点接入配置后重试。'))
  }
  const read = async () => {
    if (source === 'file' || busy || reading.current || !canRead) return
    reading.current = true
    onBusy(true); setError('')
    try {
      const configuration = source === 'sheets' ? { node_id: selectedNodeId, spreadsheet_url: url, range }
        : { node_id: selectedNodeId, service_url: serviceUrl, remote_project_id: project, scope, ...(scope === 'session' ? { session_id: session } : {}) }
      const data = unwrapOne<ImportSourceData>(await readCaseImportSource(projectId, source, configuration))
      if (!alive.current) return
      if (!data.table?.length) throw new Error('没有收到表格内容，请重试。')
      onTable(data.table, data.filename || sources.find(item => item.value === source)!.label)
    } catch (exception) {
      if (alive.current) setError(errorText(exception))
    } finally { reading.current = false; onBusy(false) }
  }

  return <div className="flex flex-col items-start" style={{ gap: 12, width: '100%' }}>
    <div role="group" aria-label="导入方式" className="flex gap-2">
      {sources.map(item => <Button key={item.value} type={source === item.value ? 'primary' : 'default'} disabled={busy}
        aria-pressed={source === item.value} onClick={() => { setSource(item.value); clearRemote() }}>{item.label}</Button>)}
    </div>
    {source === 'file' ? <>
      <span style={{ color: 'var(--w-text-tertiary)' }}>支持 Excel、CSV，文件最大 20 MB。选择后核对字段，再确认导入。</span>
      <Button type="primary" disabled={busy} onClick={onFile}>选择表格</Button>
    </> : <>
      {nodes.isPending ? <span role="status">正在读取可用节点…</span> : nodes.isError ? <p role="alert">读取节点失败：{errText(nodes.error)} <Button onClick={() => void nodes.refetch()}>重试</Button></p>
        : options.length > 1 ? <Select aria-label="读取节点" style={{ width: '100%' }} value={selectedNodeId} options={options.map(node => ({ value: node.id, label: node.label }))}
          disabled={busy} onChange={value => { setNodeId(value); clearRemote() }} />
        : selectedNode ? <span>读取节点：{selectedNode.label}</span>
        : <p role="status">没有可用的在线读取节点。请在「设置 → 节点」连接自己的 Scout，并配置{source === 'sheets' ? '飞书' : '用例服务'}接入。 <Button disabled={busy} onClick={() => void nodes.refetch()}>刷新节点</Button></p>}
      {source === 'sheets' ? <>
        <Input aria-label="飞书表格链接" placeholder="粘贴飞书表格链接（含工作表 sheet 参数）" value={url} disabled={busy} onChange={event => setUrl(event.target.value)} />
        <label className="flex items-center gap-2">读取范围<Input aria-label="读取范围" style={{ width: 170 }} value={range} disabled={busy} onChange={event => setRange(event.target.value)} /></label>
      </> : <>
        {projectsQuery.isFetching ? <span role="status">正在加载项目列表…</span> : null}
        {nodeReady && projectsQuery.isError ? <p role="alert">{errorText(projectsQuery.error)} <Button disabled={busy} onClick={() => void projectsQuery.refetch()}>重试加载项目</Button></p> : null}
        {nodeReady && projectsQuery.isSuccess && !projects.length ? <p role="status">此账号没有可读取的项目。<Button disabled={busy} onClick={() => void projectsQuery.refetch()}>刷新项目</Button></p> : null}
        {projects.length ? <>
          <label style={{ width: '100%' }}>来源项目<Select aria-label="接口项目" placeholder="请选择来源项目" style={{ width: '100%' }} options={projects.map(item => ({ value: item.id, label: `${item.label} (${item.id})` }))}
            value={project || undefined} disabled={busy || projectsQuery.isFetching} onChange={value => { setProjectChoice({ parent: projectParent, id: value }); setSessionChoice({ parent: '', id: '' }); setError('') }} /></label>
          <Button size="small" disabled={busy || projectsQuery.isFetching} onClick={() => { clearRemote(); void projectsQuery.refetch() }}>刷新项目</Button>
        </> : null}
        {project ? <label style={{ width: '100%' }}>读取范围<Select aria-label="读取范围" style={{ width: '100%' }} value={scope} disabled={busy} onChange={value => { setScope(value); setError('') }}
          options={[{ value: 'project', label: '整个项目的用例' }, { value: 'session', label: '某个会话的用例' }]} /></label> : null}
        {project && scope === 'session' ? <>
          {sessionsQuery.isFetching ? <span role="status">正在加载会话列表…</span> : null}
          {sessionsQuery.isError ? <p role="alert">{errorText(sessionsQuery.error)} <Button disabled={busy} onClick={() => void sessionsQuery.refetch()}>重试加载会话</Button></p> : null}
          {sessionsQuery.isSuccess && !sessions.length ? <p role="status">此项目没有可读取的会话，可切换为整个项目或选择其他项目。<Button disabled={busy} onClick={() => void sessionsQuery.refetch()}>刷新会话</Button></p> : null}
          {sessions.length ? <label style={{ width: '100%' }}>来源会话<Select aria-label="接口会话" placeholder="请选择来源会话" style={{ width: '100%' }} value={session || undefined} disabled={busy || listsLoading}
            options={sessions.map(item => ({ value: item.id, label: `${item.label} (${item.id})` }))} onChange={value => { setSessionChoice({ parent: sessionParent, id: value }); setError('') }} /></label> : null}
        </> : null}
      </>}
      <span style={{ color: 'var(--w-text-tertiary)' }}>项目和会话列表自动加载。点击「读取用例」后核对内容，再确认导入；账号沿用当前节点接入配置。</span>
      <Button type="primary" loading={busy} disabled={busy || !canRead}
        onClick={() => void read()}>读取用例</Button>
    </>}
    {error ? <p role="alert" style={{ color: 'var(--w-fail)', margin: 0 }}>{error}</p> : null}
  </div>
}
