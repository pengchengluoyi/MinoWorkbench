import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listCaseImportSources, readCaseImportSource, type ImportSourceKind, type ImportSourceOption, type ImportSourceNode, type ImportSourceData } from '@/api/projectCases'
import { unwrapOne } from '@/lib/unwrap'
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
  source_api_not_configured: '请先在此节点的接入配置中连接用例服务。',
  source_api_credentials_missing: '请先在此节点的接入配置中连接用例服务。',
  source_api_auth_denied: '用例服务登录失败，请检查节点中保存的账号配置。',
  source_api_unavailable: '用例服务无法连接，请检查服务地址和网络。',
  source_api_service_mismatch: '节点连接的服务已改变，请重新读取项目列表。',
  source_sheets_read_denied: '无法读取飞书表格，请检查节点的飞书接入配置和表格权限。',
  source_import_empty: '所选范围没有可导入的用例，请检查工作表、读取范围或会话。',
}

export function CaseImportSource({ projectId, busy, onBusy, onFile, onTable }: {
  projectId: string; busy: boolean; onBusy: (busy: boolean) => void; onFile: () => void
  onTable: (table: string[][], filename: string) => void
}) {
  const owner = useSession(state => state.user?.user_id || '')
  const [source, setSource] = useState<Source>('file')
  const [nodeId, setNodeId] = useState('')
  const [url, setUrl] = useState('')
  const [range, setRange] = useState('A1:Z1000')
  const [projects, setProjects] = useState<ImportSourceOption[]>([])
  const [project, setProject] = useState('')
  const [serviceUrl, setServiceUrl] = useState('')
  const [sessions, setSessions] = useState<ImportSourceOption[]>([])
  const [session, setSession] = useState('')
  const [scope, setScope] = useState('project')
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const nodes = useQuery({ queryKey: ['case-import-sources', owner, projectId], enabled: source !== 'file', retry: false,
    refetchOnWindowFocus: false, queryFn: async () => unwrapOne<{ items: ImportSourceNode[] }>(await listCaseImportSources(projectId)).items })
  const options = (nodes.data || []).filter(node => node.kinds.includes(source as ImportSourceKind))
  const selectedNode = options.find(node => node.id === nodeId) || options[0]
  const selectedNodeId = selectedNode?.id || ''
  const config = { node_id: selectedNodeId, service_url: serviceUrl, remote_project_id: project }

  const clearRemote = () => { setProjects([]); setProject(''); setServiceUrl(''); setSessions([]); setSession(''); setError('') }
  const perform = async (action: () => Promise<void>) => {
    onBusy(true); setError('')
    try { await action() }
    catch (exception) {
      if (alive.current) {
        const code = (exception as { response?: { data?: { detail?: { reason_code?: string } } } })?.response?.data?.detail?.reason_code || ''
        setError(messages[code] || errText(exception, '读取失败，请检查节点接入配置后重试。'))
      }
    } finally { onBusy(false) }
  }
  const discover = (operation: 'projects' | 'sessions') => perform(async () => {
    const data = unwrapOne<ImportSourceData>(await readCaseImportSource(projectId, 'case_api', operation === 'projects' ? { node_id: selectedNodeId } : config, operation))
    if (!alive.current) return
    if (operation === 'projects') {
      setProjects(data.items || []); setProject(data.items?.[0]?.id || ''); setServiceUrl(data.service_url || '')
      setSessions([]); setSession('')
    } else { setSessions(data.items || []); setSession(data.items?.[0]?.id || '') }
    if (!data.items?.length) setError(operation === 'projects' ? '此账号没有可读取的项目。' : '此项目没有会话。')
  })
  const read = () => perform(async () => {
    if (source === 'file') return
    const configuration = source === 'sheets' ? { node_id: selectedNodeId, spreadsheet_url: url, range }
      : { ...config, scope, ...(scope === 'session' ? { session_id: session } : {}) }
    const data = unwrapOne<ImportSourceData>(await readCaseImportSource(projectId, source, configuration))
    if (!alive.current) return
    if (!data.table?.length) throw new Error('没有收到表格内容，请重试。')
    onTable(data.table, data.filename || sources.find(item => item.value === source)!.label)
  })

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
        <Button disabled={busy || !selectedNodeId} onClick={() => void discover('projects')}>读取项目列表</Button>
        {projects.length ? <Select aria-label="接口项目" style={{ width: '100%' }} options={projects.map(item => ({ value: item.id, label: `${item.label} (${item.id})` }))}
          value={project} disabled={busy} onChange={value => { setProject(value); setSessions([]); setSession('') }} /> : null}
        {project ? <Select aria-label="读取范围" style={{ width: '100%' }} value={scope} disabled={busy} onChange={setScope}
          options={[{ value: 'project', label: '整个项目的用例' }, { value: 'session', label: '某个会话的用例' }]} /> : null}
        {project && scope === 'session' ? <>
          <Button disabled={busy} onClick={() => void discover('sessions')}>读取会话列表</Button>
          {sessions.length ? <Select aria-label="接口会话" style={{ width: '100%' }} value={session} disabled={busy}
            options={sessions.map(item => ({ value: item.id, label: `${item.label} (${item.id})` }))} onChange={setSession} /> : null}
        </> : null}
      </>}
      <span style={{ color: 'var(--w-text-tertiary)' }}>点击时读取，核对内容后再确认导入。账号沿用节点接入配置。</span>
      <Button type="primary" loading={busy} disabled={!selectedNodeId || (source === 'sheets' ? !url.trim() || !range.trim() : !project || !serviceUrl || (scope === 'session' && !session))}
        onClick={() => void read()}>读取用例</Button>
    </>}
    {error ? <p role="alert" style={{ color: 'var(--w-fail)', margin: 0 }}>{error}</p> : null}
  </div>
}
