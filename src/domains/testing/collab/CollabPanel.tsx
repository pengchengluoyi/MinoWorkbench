import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, Link } from 'react-router-dom'
import { request } from '@/lib/request'
import { Button, Modal, Drawer, Dropdown, Tooltip, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'
import { Plus, ArrowUp, MoreHorizontal, PanelRightOpen, X } from 'lucide-react'
import { useWorkspaceNavigation, removeWorkspaceFromCache, isMissingWorkspace } from '@/domains/bots/workspaceNavigation'
import { MemberAvatar, MemberEditor, MemberText, MentionInput } from './WorkspacePeople'
import type { WorkspaceMember as Member } from './WorkspacePeople'
import './CollabPanel.css'

const CaseImportDialog = lazy(() => import('../cases/CaseImportDialog').then(m => ({ default: m.CaseImportDialog })))
interface Workspace { topic_id: string; title: string; app_id: string; modules: string[]; requirement_id: string;
  archived: number; paused: number; workspace_kind: string; env_profile: string; env_surface: string; expected_build: string }
interface Run { run_id: string; status: string; total: number | null; passed: number | null; failed: number | null;
  cases: { case_id: string; status: string; session_id?: string }[] }
interface Message { created_at?: string; sender_name: string; message_id: string; author_kind: string; body: string; message_kind: string; card_kind: string; ref_id: string; origin: string; role?: string; thread_id?: string; reply_status?: string; reply_error?: string }
interface Case { case_id: string; title: string; module: string; status: string; reasons: string[] }
interface Options { modules: string[]; requirements: { id: string; title: string }[];
  apps: { id: string; name: string }[]; environments: { key: string; label: string }[];
  channels: { id: string; label: string; app_id: string }[]; devices: { sn: string; model: string; platform: string }[];
  cases: { case_id: string; name: string; module: string }[]; nodes: { node_id: string }[] }
interface Detail { members: Member[]; topic: Workspace; messages: Message[]; runs: Record<string, Run>;
  snapshot: { total: number; executable: string[]; cases: Case[];
    resources: { online_devices: number; available_accounts: number; compile_ready: number; account_note: string } } }
const labels: Record<string, string> = { queued: '排队', preparing: '准备中', running: '执行中', done: '已完成',
  failed: '失败', blocked: '阻塞', cancelled: '已取消', ready: '可执行', passed: '已通过', pass: '已通过', fail: '失败',
  skipped: '跳过', pending: '等待', interrupted: '已中断', unknown: '记录不可用' }
const terminal = new Set(['done', 'failed', 'blocked', 'cancelled', 'passed', 'finished', 'unknown'])

export function CollabPanel({ projectId, appId = '', deepLinkCaseId = '', deepLinkAppId = '' }: {
  projectId: string; appId?: string; mode?: 'bots'; deepLinkCaseId?: string; deepLinkAppId?: string
}) {
  const qc = useQueryClient()
  const attachmentInput = useRef<HTMLInputElement>(null)
  const messageEnd = useRef<HTMLDivElement>(null)
  const composerInput = useRef<HTMLTextAreaElement>(null)
  const imageUrls = useRef(new Set<string>())
  const sendLock = useRef(false)
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<{ id: string; scope: string; file: File; url: string }[]>([])
  useEffect(() => () => { imageUrls.current.forEach(url => URL.revokeObjectURL(url)); imageUrls.current.clear() }, [])
  const [params, setParams] = useSearchParams()
  const base = `/project/${encodeURIComponent(projectId)}/collab/workspaces`
  const { topics, selectedId, selectTopic: setSelected, archived, setArchived } = useWorkspaceNavigation(projectId)
  const [tab, setTab] = useState('members')
  const [showDetails, setShowDetails] = useState(false)
  const [filter, setFilter] = useState('all')
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [missingNotice, setMissingNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pinTarget, setPinTarget] = useState('')
  const linkedCase = deepLinkCaseId || params.get('collabCase') || ''
  const key = useMemo(() => ['workspaces-v7', projectId], [projectId])
  const queryPolicy = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false } as const
  const options = useQuery({ ...queryPolicy, queryKey: [...key, 'options'], queryFn: async () => (await request<Options>({ url: base + '/options' })).data! })
  const detail = useQuery({ ...queryPolicy, queryKey: [...key, selectedId], enabled: !!selectedId && !topics.isError,
    queryFn: async () => (await request<Detail>({ url: base + '/' + selectedId })).data!,
    refetchInterval: q => q.state.error ? false : (Object.values(q.state.data?.runs || {}).some(r => !terminal.has(r.status)) || q.state.data?.messages.some(m => ['queued','running'].includes(m.reply_status || ''))) ? 1500 : 15000 })
  useEffect(() => { setMissingNotice('') }, [projectId])
  useEffect(() => {
    if (!selectedId || !isMissingWorkspace(detail.error)) return
    setMissingNotice('原工作区已不存在，已刷新对话列表。请选择现有对话或新建对话。')
    removeWorkspaceFromCache(qc, projectId, selectedId)
    void qc.invalidateQueries({ queryKey: [...key, 'list'] })
  }, [detail.error, selectedId, projectId, qc, key])
  const lastMessage = detail.data?.messages.at(-1)?.message_id
  useEffect(() => {
    if (!selectedId || !lastMessage) return
    void request({ url: base + '/' + selectedId + '/read', method: 'post' })
      .then(() => qc.invalidateQueries({ queryKey: [...key, 'list'] })).catch(() => undefined)
  }, [base, selectedId, lastMessage, qc, key])
  useEffect(() => { messageEnd.current?.scrollIntoView({ block: 'end' }) }, [lastMessage, selectedId])
  const composerScope = projectId + '/' + selectedId
  const currentScope = useRef(composerScope)
  currentScope.current = composerScope
  const pendingImages = attachments.filter(item => item.scope === composerScope)
  const removeImage = (id: string) => {
    const item = attachments.find(image => image.id === id)
    if (item) { URL.revokeObjectURL(item.url); imageUrls.current.delete(item.url) }
    setAttachments(current => current.filter(image => image.id !== id))
  }
  const addImages = (files: File[]) => {
    const accepted: typeof attachments = []
    const rejected: string[] = []
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { rejected.push('支持 PNG、JPEG 或 WebP 截图'); continue }
      if (file.size > 8 * 1024 * 1024) { rejected.push('单张截图不能超过 8MB'); continue }
      const url = URL.createObjectURL(file)
      imageUrls.current.add(url)
      accepted.push({ id: crypto.randomUUID(), scope: composerScope, file, url })
    }
    setAttachments(current => [...current, ...accepted])
    setError([...new Set(rejected)].join('；'))
  }
  const data = detail.data
  const topic = data?.topic
  const replying = data?.messages.some(m => ['queued','running'].includes(m.reply_status || ''))
  const readOnly = !!topic && (!!topic.archived || topic.workspace_kind.startsWith('legacy'))
  const mutation = useMutation({ mutationFn: async ({ path, method = 'post', body }: { path: string; method?: string; body?: unknown }) => {
    return await request<Record<string, unknown>>({ url: base + path, method, data: body })
  }, onSuccess: async (_result, variables) => {
    setError('')
    if (variables.method === 'delete' && variables.path === '/' + selectedId) removeWorkspaceFromCache(qc, projectId, variables.path.slice(1).split('?')[0])
    await qc.invalidateQueries({ queryKey: [...key, 'list'] })
    if ((variables.method !== 'delete' || variables.path !== '/' + selectedId) && selectedId) await qc.invalidateQueries({ queryKey: [...key, selectedId], exact: true })
  }, onError: e => setError(errText(e)) })
  const act = (path: string, body?: unknown, method = 'post') => mutation.mutateAsync({ path, body, method })
  const prefix = '/' + selectedId
  const patch = (body: unknown) => act(prefix, body, 'patch').then(r => {
    if (r.data?.topic_id && r.data.topic_id !== selectedId) setSelected(String(r.data.topic_id), Boolean(r.data.archived))
    return r
  })
  const submit = (promise: Promise<unknown>) => { void promise.catch(() => undefined) }
  useEffect(() => { setDraft(''); setError(''); setPinTarget(''); setShowDetails(false) }, [projectId, selectedId])
  const create = (override?: { modules?: string[]; requirement_id?: string }) => {
    const channels = options.data?.channels.filter(c => c.app_id === (appId || deepLinkAppId)) || []
    submit(act('', { ...(channels.length === 1 ? { env_surface: channels[0].id } : {}), ...override })
      .then(r => { setSelected(String(r.data?.topic_id || ''), Boolean(r.data?.archived)); setShowDetails(false) }))
  }
  const send = () => {
    const value = draft.trim()
    if ((!value && !pendingImages.length) || sendLock.current || readOnly || !selectedId) return
    sendLock.current = true
    setSending(true)
    setError('')
    const scope = composerScope
    const messageDraft = draft
    void (async () => {
      try {
        for (const item of pendingImages) {
          const form = new FormData()
          form.append('file', item.file, item.file.name || '截图.png')
          await request({ url: base + prefix + '/attachments', method: 'post', data: form })
          removeImage(item.id)
          void qc.invalidateQueries({ queryKey: key })
        }
        if (value) {
          await request({ url: base + prefix + '/messages', method: 'post', data: { body: value } })
          if (currentScope.current === scope) setDraft(current => current === messageDraft ? '' : current)
        }
        void qc.invalidateQueries({ queryKey: key })
      } catch (e) {
        if (currentScope.current === scope) setError('发送失败，未发送的内容已保留：' + errText(e))
      } finally { sendLock.current = false; setSending(false) }
    })()
  }
  const runCard = (run: Run) => <article className="steward-run-card">
    <strong>{labels[run.status] || run.status}</strong>
    <p>共 {run.total ?? '—'} 条 · 通过 {run.passed ?? '—'} · 失败 {run.failed ?? '—'}</p>
    <Link to={projectHref(projectId, { tab: 'tasks', run: run.run_id, appId: topic?.app_id || '' })}>查看运行与证据</Link>
    <details><summary>逐条结果</summary>{run.cases.map((c, i) => <p key={c.case_id + ':' + i}>{c.case_id} · {labels[c.status] || c.status}
      {c.session_id && <Link to={projectHref(projectId, { tab: 'session-log', session: c.session_id, appId: topic?.app_id || '' })}> 查看 Session</Link>}</p>)}</details>
  </article>
  const loadError = topics.error || options.error || (isMissingWorkspace(detail.error) ? null : detail.error)
  const unavailable = (loadError as { response?: { status?: number } } | null)?.response?.status === 404
  const resources = data?.snapshot.resources
  const resourceCard = <article className="steward-run-card"><strong>当前资源事实</strong>
    <p>在线设备 {resources?.online_devices ?? 0} · 可用账号 {resources?.available_accounts ?? 0} · 编译就绪 {resources?.compile_ready ?? 0} · 运行绑定将在执行前检查</p>
    <p>{resources?.account_note}</p><Button onClick={() => void detail.refetch()}>重新检查</Button> <Button onClick={() => { setShowDetails(true); setTab('scope') }}>编辑资源</Button></article>
  const card = (m: Message) => {
    if (m.card_kind === 'run') { const run = data?.runs[m.ref_id]; return run ? runCard(run) : <p>运行记录不可用</p> }
    if (m.card_kind === 'workspace') return <Button onClick={() => {
      void request<Detail>({ url: base + '/' + encodeURIComponent(m.ref_id) }).then(r => setSelected(m.ref_id, Boolean(r.data?.topic.archived))).catch(e => setError(errText(e)))
    }}>打开已有工作区</Button>
    if (m.card_kind === 'resources') return resourceCard
    if (m.card_kind === 'case' || m.card_kind === 'case_candidate') {
      const c = options.data?.cases.find(c => c.case_id === m.ref_id)
      return <article className="steward-run-card"><strong>{c?.name || m.ref_id}</strong><p>{c?.module}</p>
        {!readOnly && (m.card_kind === 'case_candidate' ? <Button onClick={() => submit(act(prefix + '/cases', { case_id: m.ref_id }))}>加入本工作区</Button> : <span>已加入范围</span>)}</article>
    }
    if (m.card_kind === 'case_set') return <Button onClick={() => { setTab('cases'); setShowDetails(true) }}>查看当前 {data?.snapshot.total || 0} 条用例</Button>
    if (m.card_kind === 'import') return <article><p>{m.ref_id}</p><Button disabled={readOnly || !topic?.app_id} onClick={() => { setImportUrl(m.ref_id); setImportOpen(true) }}>打开用例导入</Button></article>
    if (m.card_kind === 'attachment') return <Attachment url={base + prefix + '/attachments/' + m.ref_id} name={m.body} />
    return null
  }
  return <div className="collab-page v7-workspaces">
    {missingNotice && <div role="status">{missingNotice}<Button onClick={() => setMissingNotice('')}>关闭</Button></div>}
    {error && <div className="v7-error" role="alert">{error}<Button onClick={() => setError('')}>关闭</Button></div>}
    <div className="collab-panel"><section className="collab-main">
      {loadError && <div className="v7-empty v7-error-state" role="alert"><span className="v7-empty-icon">!</span><h2>{unavailable ? '工作区服务尚未就绪' : '暂时无法读取工作区'}</h2><p>{unavailable ? '当前连接的 Nexus 未提供工作区接口。服务更新后，点击重新连接。' : errText(loadError)}</p><p>已停止自动重试；现有数据不会被清空。</p><Button type="primary" onClick={() => void qc.invalidateQueries({ queryKey: key })}>重新连接</Button></div>}
      {!loadError && !topics.isPending && !selectedId && <div className="v7-empty"><span className="v7-empty-icon">◇</span><span className="v7-eyebrow">从一句话开始</span><h2>{archived ? '暂无归档工作区' : '今天想测什么？'}</h2><p>先聊目标，或发来用例。范围、应用和环境都可以边聊边补充。</p>{!archived && <Button type="primary" disabled={mutation.isPending} onClick={() => create()}>开始对话</Button>}</div>}
      {!loadError && topics.isPending && <div className="v7-empty" role="status"><div className="v7-skeleton"/><div className="v7-skeleton"/><p>正在连接测试工作区…</p></div>}
      {linkedCase && <section className="steward-run-card"><strong>加到工作区：{options.data?.cases.find(c => c.case_id === linkedCase)?.name || linkedCase}</strong>
        <select aria-label="目标工作区" value={pinTarget} onChange={e => setPinTarget(e.target.value)}><option value="">选择已有工作区</option>
          {(topics.data || []).filter(t => !t.archived && t.workspace_kind === 'scope').map(t => <option key={t.topic_id} value={t.topic_id}>{t.title}</option>)}</select>
        <Button disabled={!pinTarget || mutation.isPending} onClick={() => submit(act('/' + pinTarget + '/cases', { case_id: linkedCase }).then(() => { setParams(current => { const next = new URLSearchParams(current); next.set('topic', pinTarget); next.delete('collabCase'); return next }, { replace: true }) }))}>加入</Button>

      </section>}
      {detail.isPending && selectedId && <p role="status">正在读取工作区…</p>}
      {!loadError && topic && data && <>
        <header className="v7-chat-header"><div className="workspace-chat-heading"><h2>{topic.title}</h2><button className="workspace-member-summary" onClick={() => { setTab('members'); setShowDetails(true) }}><span className="workspace-avatar-stack">{(data.members || []).slice(0, 5).map(m => <MemberAvatar key={m.id} id={m.id} name={m.sender_name} />)}</span>{data.members?.length || 0} 位成员<span>· @ 指定回复</span></button></div><div>
          <Tooltip title="查看成员、测试目标与用例"><Button type="text" aria-label="对话详情" icon={<PanelRightOpen size={17}/>} onClick={() => setShowDetails(true)} /></Tooltip>
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'archive', label: topic.archived ? '恢复对话' : '归档对话', disabled: topic.workspace_kind.startsWith('legacy'), onClick: () => submit(patch({ archived: !topic.archived })) },
            { key: 'pause', label: topic.paused ? '恢复工作区' : '暂停工作区', disabled: readOnly, onClick: () => submit(patch({ paused: !topic.paused })) },
            { key: 'history', label: archived ? '返回当前对话' : '查看归档', onClick: () => setArchived(!archived) },
            { key: 'delete', label: '删除对话', danger: true, onClick: () => { setDeleteOpen(true) } }
          ] }}><Button type="text" aria-label="对话菜单" icon={<MoreHorizontal size={18}/>} /></Dropdown>
        </div></header>
        {readOnly && <p>已归档工作区只读，历史消息与证据保留。</p>}
        {topic.paused ? <p>工作区已暂停，可继续查询；恢复后可提交写操作。</p> : null}
        <Drawer title="对话详情" open={showDetails} onClose={() => setShowDetails(false)} width={Math.min(620, window.innerWidth)} className="v7-details-drawer">
          <div className="v7-workspaces v7-drawer-content"><nav className="v7-tabs" aria-label="工作区详情">
            {[['members', '成员'], ['scope', '测试目标'], ['cases', '用例']].map(([id, label]) => <Button key={id} type={tab === id ? 'primary' : 'default'} onClick={() => setTab(id)}>{label}</Button>)}
          </nav>
          {tab === 'members' && <MemberEditor key={selectedId} base={base + prefix} members={data.members || []} readOnly={readOnly || mutation.isPending}
            change={(member, remove) => submit(act(prefix + '/members' + (remove ? '/' + encodeURIComponent(member) : ''), remove ? undefined : { member }, remove ? 'delete' : 'post'))}
            restoreDefaults={() => submit(act(prefix + '/members/defaults'))}
            mention={member => { setDraft(current => current + (current && !/\s$/.test(current) ? ' ' : '') + '@' + member.sender_name + ' '); setShowDetails(false); setTimeout(() => { composerInput.current?.focus(); composerInput.current?.setSelectionRange(100000, 100000) }, 100) }} />}
          {tab === 'scope' && <ResourceEditor key={JSON.stringify(topic)} topic={topic} options={options.data} readOnly={readOnly} save={body => submit(patch(body))} />}
          {tab === 'cases' && <><p>当前范围 {data.snapshot.total} 条；可执行 {data.snapshot.executable.length} 条。</p>
            <select aria-label="用例状态筛选" value={filter} onChange={e => setFilter(e.target.value)}>{['all', 'ready', 'blocked'].map(f => <option key={f} value={f}>{labels[f] || '全部'}</option>)}</select>
            {data.snapshot.cases.filter(c => filter === 'all' || c.status === filter).map(c => <article className="steward-run-card" key={c.case_id}><strong>{c.title}</strong> · {c.module} · {labels[c.status] || c.status}<p>{c.reasons?.join('；')}</p></article>)}
          </>}</div>
        </Drawer><section className="collab-card-chat"><div className="collab-messages">
          {!data.messages.length && <p className="v7-chat-hint">可以让管家检查资源、执行用例，或汇总最近的问题。结论会附上可追溯的运行证据。</p>}{data.messages.map(m => <article key={m.message_id} className={'collab-message ' + (m.author_kind === 'user' ? 'is-user' : 'is-assistant')}><MemberAvatar id={m.role || m.author_kind} name={m.sender_name || ''} /><div className="collab-message-content"><small>{m.sender_name}{m.created_at && <time dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>}{m.reply_status && <span className="workspace-message-status">{labels[m.reply_status] || (m.reply_status === 'succeeded' ? '已回复' : m.reply_status)}</span>}{m.origin === 'migrated' ? ' · 历史归并' : ''}</small><div className="collab-message-body"><p><MemberText text={m.body} members={data.members || []} /></p>{card(m)}{m.reply_error && <p role="alert">{labels[m.reply_status || ''] || '处理未完成'}：{m.reply_error}</p>}</div></div></article>)}{replying && <p role="status" className="v7-planning-status">正在处理…</p>}<div ref={messageEnd}/></div>
          {!readOnly && <div className="v7-composer">
            {!!pendingImages.length && <div className="v7-image-drafts" aria-label="待发送截图">{pendingImages.map(item => <div className="v7-image-draft" key={item.id}><img src={item.url} alt={'待发送截图：' + item.file.name} /><Button type="text" size="small" aria-label={'移除截图：' + item.file.name} icon={<X size={13}/>} disabled={sending} onClick={() => removeImage(item.id)} /></div>)}</div>}
            <MentionInput inputRef={composerInput} members={data.members || []} disabled={sending} onSend={() => { if (!mutation.isPending && !sending) send() }} onPaste={e => {
              const files = Array.from(e.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
              if (!files.length) return
              e.preventDefault()
              addImages(files)
              const text = e.clipboardData.getData('text/plain')
              if (text) { const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; setDraft(current => current.slice(0, start) + text + current.slice(end)) }
            }} value={draft} onChange={setDraft} />
            <div className="v7-composer-tools"><div><Dropdown trigger={['click']} menu={{ items: [
              { key: 'file', label: '导入用例文件 / 飞书表格', disabled: !topic.app_id, onClick: () => { setImportUrl(''); setImportOpen(true) } },
              { key: 'image', label: '附加截图', disabled: sending, onClick: () => attachmentInput.current?.click() }
            ] }}><Button type="text" aria-label="添加附件" icon={<Plus size={18}/>} /></Dropdown><span>Enter 发送 · Shift + Enter 换行</span></div>
              <div>
              <Button type="primary" shape="circle" aria-label="发送" icon={<ArrowUp size={17}/>} disabled={(!draft.trim() && !pendingImages.length) || mutation.isPending || sending} loading={sending} onClick={send} /></div>
            </div><input ref={attachmentInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { addImages(Array.from(e.target.files || [])); e.target.value = '' }} />
          </div>}
        </section>
      </>}
    </section></div>
    <Modal className="v7-form-modal" title="删除工作区" open={deleteOpen} onCancel={() => setDeleteOpen(false)} footer={null}>
      <p>删除此工作区的聊天与范围；项目用例、运行记录和 Session 证据保留，已提交的运行继续。</p>
      <Button danger disabled={mutation.isPending} onClick={() => submit(act(prefix, undefined, 'delete').then(() => { setDeleteOpen(false); setSelected('') }))}>确认删除</Button>
    </Modal>
    {importOpen && topic?.app_id && <Suspense fallback={<p role="status">正在打开用例导入…</p>}><CaseImportDialog initialSourceUrl={importUrl} projectId={projectId} appId={topic.app_id} open onClose={() => { setImportOpen(false); void qc.invalidateQueries({ queryKey: key }) }} /></Suspense>}
  </div>
}
function ResourceEditor({ topic, options, readOnly, save }: { topic: Workspace; options?: Options; readOnly: boolean; save: (body: unknown) => void }) {
  const [env, setEnv] = useState(topic.env_profile)
  const [surface, setSurface] = useState(topic.env_surface)
  const [build, setBuild] = useState(topic.expected_build)
  const [modules, setModules] = useState(topic.modules)
  const [requirement, setRequirement] = useState(topic.requirement_id)
  return <fieldset disabled={readOnly}><legend>测试目标</legend>
    <label>需求范围<select value={requirement} onChange={e => setRequirement(e.target.value)}><option value="">未绑定需求</option>{options?.requirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
    {<label>模块范围<select multiple value={modules} onChange={e => setModules(Array.from(e.target.selectedOptions, o => o.value))}>{options?.modules.map(m => <option key={m}>{m}</option>)}</select></label>}
    <label>环境<select value={env} onChange={e => setEnv(e.target.value)}><option value="">尚未选择环境</option>{options?.environments.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select></label>
    <label>应用·渠道<select value={surface} onChange={e => setSurface(e.target.value)}><option value="">尚未选择测试目标</option>{options?.channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    <label>目标 build（可选）<input value={build} onChange={e => setBuild(e.target.value)} /></label>
    <Button onClick={() => save({ requirement_id: requirement, modules, env_profile: env, env_surface: surface, expected_build: build })}>保存测试目标</Button>
  </fieldset>
}

function Attachment({ url, name }: { url: string; name: string }) {
  const [image, setImage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { let active = true; let objectUrl = ''; void request<Blob>({ url, responseType: 'blob' }).then(result => {
    if (active) { objectUrl = URL.createObjectURL(result as unknown as Blob); setImage(objectUrl) }
  }).catch(e => { if (active) setError(errText(e)) }); return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) } }, [url])
  return error ? <p role="alert">截图读取失败：{error}</p> : image ? <a href={image} download={name}><img src={image} alt={name} style={{ maxWidth: '100%', maxHeight: 300 }} /></a> : <p>正在读取截图…</p>
}
