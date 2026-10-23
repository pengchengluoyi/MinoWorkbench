import { copyToClipboard } from '@/lib/clipboard'
import { createUUID } from '@/lib/uuid'
import { Bubble } from '@ant-design/x'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { request } from '@/lib/request'
import { Button, Modal, Drawer, Dropdown, Tooltip, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'
import { ImagePlus, Paperclip, FileText, Download, MoreHorizontal, PanelRightOpen, Users, ListTodo, Workflow, MessageSquare, Copy, X } from 'lucide-react'
import { useWorkspaceNavigation, removeWorkspaceFromCache, isMissingWorkspace } from '@/domains/bots/workspaceNavigation'
import { MemberAvatar, MemberEditor, MemberText, MentionInput } from './WorkspacePeople'
import type { WorkspaceMember as Member } from './WorkspacePeople'
import './CollabPanel.css'
import { WorkspaceTasks } from './WorkspaceTasks'
import { WorkspaceWork } from './WorkspaceWork'
import { useProjects } from '../apps/queries'
import { botsHref } from '@/domains/bots/botsNavigation'

const CaseImportDialog = lazy(() => import('../cases/CaseImportDialog').then(m => ({ default: m.CaseImportDialog })))
interface Workspace { topic_id: string; title: string; app_id: string; modules: string[]; requirement_id: string;
  archived: number; paused: number; workspace_kind: string; env_profile: string; env_surface: string }
interface Run { freshness?: string; run_id: string; app_id: string; outcome?: string; reason?: string; status: string; total: number | null; passed: number | null; failed: number | null;
  cases: { case_id: string; status: string; session_id?: string }[] }
interface Message { created_at?: string; sender_name: string; message_id: string; author_kind: string; body: string; message_kind: string; card_kind: string; ref_id: string; origin: string; role?: string; thread_id?: string; reply_status?: string; reply_error?: string }
interface Case { case_id: string; title: string; module: string; status: string; reasons: string[] }
interface Options { modules: string[]; requirements: { id: string; title: string }[];
  project?: { id: string; name: string };
  apps: { id: string; name: string }[]; environments: { key: string; label: string }[];
  channels: { id: string; label: string; app_id: string }[]; devices: { sn: string; model: string; platform: string }[];
  cases: { case_id: string; name: string; module: string }[]; nodes: { node_id: string }[] }
interface Detail { members: Member[]; topic: Workspace; messages: Message[]; runs: Record<string, Run>;
  snapshot: { total: number; executable: string[]; cases: Case[];
    resources: { online_devices: number; available_accounts: number | null; compile_ready: number; account_note: string } } }
const labels: Record<string, string> = { queued: '排队', preparing: '准备中', running: '执行中', done: '已完成',
  failed: '失败', blocked: '阻塞', cancelled: '已取消', ready: '可执行', passed: '已通过', pass: '已通过', fail: '失败',
  skipped: '跳过', pending: '等待', interrupted: '已中断', unknown: '记录不可用' }
const terminal = new Set(['done', 'failed', 'blocked', 'cancelled', 'passed', 'finished', 'unknown'])
const replyLabels: Record<string, string> = { queued: '等待回复', running: '管家处理中', succeeded: '已回复', failed: '管家处理失败', interrupted: '管家处理已中断' }

export function CollabPanel({ projectId, deepLinkCaseId = '' }: {
  projectId: string; appId?: string; mode?: 'bots'; deepLinkCaseId?: string; deepLinkAppId?: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const projects = useProjects()
  const attachmentInput = useRef<HTMLInputElement>(null)
  const screenshotInput = useRef<HTMLInputElement>(null)
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
  const composerScope = projectId + '/' + selectedId
  const currentScope = useRef(composerScope)
  currentScope.current = composerScope
  const pendingAttachments = attachments.filter(item => item.scope === composerScope)
  const removeAttachment = (id: string) => {
    const item = attachments.find(image => image.id === id)
    if (item) { URL.revokeObjectURL(item.url); imageUrls.current.delete(item.url) }
    setAttachments(current => current.filter(image => image.id !== id))
  }
  const addAttachments = (files: File[]) => {
    const accepted: typeof attachments = []
    const rejected: string[] = []
    for (const file of files) {
      const image = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || /\.(png|jpe?g|webp)$/i.test(file.name)
      if (file.size > (image ? 8 : 20) * 1024 * 1024) { rejected.push(image ? '单张截图不能超过 8MB' : '单个附件不能超过 20MB'); continue }
      if (!file.size) { rejected.push('不能发送空文件'); continue }
      const url = image ? URL.createObjectURL(file) : ''
      if (url) imageUrls.current.add(url)
      accepted.push({ id: createUUID(), scope: composerScope, file, url })
    }
    setAttachments(current => [...current, ...accepted])
    setError([...new Set(rejected)].join('；'))
  }
  const data = detail.data
  const topic = data?.topic
  const projectName = options.data?.project?.name || projects.data?.find(project => project.id === projectId)?.name || projectId
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
    submit(act('', { ...override })
      .then(r => { setSelected(String(r.data?.topic_id || ''), Boolean(r.data?.archived)); setShowDetails(false) }))
  }
  const send = () => {
    const value = draft.trim()
    if ((!value && !pendingAttachments.length) || sendLock.current || readOnly || !selectedId) return
    sendLock.current = true
    setSending(true)
    setError('')
    const scope = composerScope
    const messageDraft = draft
    void (async () => {
      try {
        for (const item of pendingAttachments) {
          const form = new FormData()
          form.append('file', item.file, item.file.name || '附件')
          await request({ url: base + prefix + '/attachments', method: 'post', data: form })
          removeAttachment(item.id)
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
    <strong>{run.outcome === 'not_executed' ? '未执行' : labels[run.status] || run.status}</strong>
    {run.reason && <p role="status">{run.reason}</p>}
    {run.freshness !== 'current' && <p role="status">{run.freshness === 'stale' ? '范围、用例或测试目标已变化；此结果已过期，不能代表当前范围。' : '此运行未记录范围版本，无法确认结果是否适用于当前范围。'}</p>}
    <p>共 {run.total ?? '—'} 条 · 通过 {run.passed ?? '—'} · 失败 {run.failed ?? '—'}</p>
    <Link to={projectHref(projectId, { tab: 'tasks', run: run.run_id, appId: run.app_id || '' })}>查看运行与证据</Link>
    <Button disabled={!terminal.has(run.status) || readOnly || mutation.isPending} onClick={() => submit(act(prefix + '/report', { run_id: run.run_id }))}>生成测试报告</Button>
    <Button disabled={!terminal.has(run.status)} onClick={() => submit(request<{ markdown: string }>({ url: base + prefix + '/report', params: { run_id: run.run_id } }).then(result => {
      const url = URL.createObjectURL(new Blob([result.data!.markdown], { type: 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a'); link.href = url; link.download = 'test-report-' + run.run_id + '.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }).catch(e => { setError(errText(e)); throw e }))}>下载事实报告</Button>
    <details><summary>逐条结果</summary>{run.cases.map((c, i) => <p key={c.case_id + ':' + i}>{c.case_id} · {labels[c.status] || c.status}
      {c.session_id && <Link to={projectHref(projectId, { tab: 'session-log', session: c.session_id, appId: run.app_id || '' })}> 查看 Session</Link>}</p>)}</details>
  </article>
  const loadError = topics.error || options.error || (isMissingWorkspace(detail.error) ? null : detail.error)
  const unavailable = (loadError as { response?: { status?: number } } | null)?.response?.status === 404
  const card = (m: Message) => {
    if (m.card_kind === 'project') return <Link to={botsHref(m.ref_id)}>切换到该项目的工作区</Link>
    if (m.card_kind === 'run') { const run = data?.runs[m.ref_id]; return run ? runCard(run) : <p>运行记录不可用</p> }
    if (m.card_kind === 'work') return <article className="steward-run-card">
      <strong>工作</strong><p>{m.body}</p>
      <Button onClick={() => { setTab('work'); setShowDetails(true) }}>打开工作</Button>
    </article>
    if (m.card_kind === 'workspace') return <Button onClick={() => {
      void request<Detail>({ url: base + '/' + encodeURIComponent(m.ref_id) }).then(r => setSelected(m.ref_id, Boolean(r.data?.topic.archived))).catch(e => setError(errText(e)))
    }}>打开已有工作区</Button>
    if (m.card_kind === 'resources') return null
    if (m.card_kind === 'case' || m.card_kind === 'case_candidate') {
      const c = options.data?.cases.find(c => c.case_id === m.ref_id)
      return <article className="steward-run-card"><strong>{c?.name || m.ref_id}</strong><p>{c?.module}</p>
        {!readOnly && (m.card_kind === 'case_candidate' ? <Button onClick={() => submit(act(prefix + '/cases', { case_id: m.ref_id }))}>加入本工作区</Button> : <span>已加入范围</span>)}</article>
    }
    if (m.card_kind === 'case_set') return <p>当前范围共 {data?.snapshot.total || 0} 条用例。</p>
    if (m.card_kind === 'import') return <article><p>{m.ref_id}</p><Button disabled={readOnly || !topic?.app_id} onClick={() => { setImportUrl(m.ref_id); setImportOpen(true) }}>打开用例导入</Button></article>
    if (m.card_kind === 'attachment') return <Attachment url={base + prefix + '/attachments/' + m.ref_id} name={m.body} />
    return null
  }
  return <div className="collab-page v7-workspaces workspace-im">
    {missingNotice && <div role="status">{missingNotice}<Button onClick={() => setMissingNotice('')}>关闭</Button></div>}
    {error && <div className="v7-error" role="alert">{error}<Button onClick={() => setError('')}>关闭</Button></div>}
    <div className="collab-panel"><section className="collab-main">
      {loadError && <div className="v7-empty v7-error-state" role="alert"><span className="v7-empty-icon">!</span><h2>{unavailable ? '工作区服务尚未就绪' : '暂时无法读取工作区'}</h2><p>{unavailable ? '当前连接的 Nexus 未提供工作区接口。服务更新后，点击重新连接。' : errText(loadError)}</p><p>已停止自动重试；现有数据不会被清空。</p><Button type="primary" onClick={() => void qc.invalidateQueries({ queryKey: key })}>重新连接</Button></div>}
      {!loadError && !topics.isPending && !selectedId && <div className="v7-empty"><span className="v7-empty-icon">◇</span><span className="v7-eyebrow">从一句话开始</span><h2>{archived ? '暂无归档工作区' : '今天想测什么？'}</h2><p>先聊目标，或发来用例。范围、应用和环境都可以边聊边补充。</p>{!archived && <Button type="primary" disabled={mutation.isPending} onClick={() => create()}>开始对话</Button>}</div>}
      {!loadError && topics.isPending && <div className="v7-empty" role="status"><div className="v7-skeleton"/><div className="v7-skeleton"/><p>正在连接工作区…</p></div>}
      {linkedCase && <section className="steward-run-card"><strong>加到工作区：{options.data?.cases.find(c => c.case_id === linkedCase)?.name || linkedCase}</strong>
        <select aria-label="目标工作区" value={pinTarget} onChange={e => setPinTarget(e.target.value)}><option value="">选择已有工作区</option>
          {(topics.data || []).filter(t => !t.archived && t.workspace_kind === 'scope').map(t => <option key={t.topic_id} value={t.topic_id}>{t.title}</option>)}</select>
        <Button disabled={!pinTarget || mutation.isPending} onClick={() => submit(act('/' + pinTarget + '/cases', { case_id: linkedCase }).then(() => { setParams(current => { const next = new URLSearchParams(current); next.set('topic', pinTarget); next.delete('collabCase'); return next }, { replace: true }) }))}>加入</Button>

      </section>}
      {detail.isPending && selectedId && <p role="status">正在读取工作区…</p>}
      {!loadError && topic && data && <>
        <header className="v7-chat-header workspace-im-header">
          <div className="workspace-im-heading"><div className="workspace-im-icon"><MessageSquare size={20} /></div>
            <div className="workspace-im-title"><h2>{topic.title}</h2><span>{data.members?.length || 0} 位成员{readOnly ? ' · 只读' : topic.paused ? ' · 已暂停' : ''}</span></div>
          </div>
          <div className="workspace-im-header-actions">
            <Tooltip title="成员"><Button type="text" aria-label="成员" icon={<Users size={18}/>} onClick={() => { setTab('members'); setShowDetails(true) }} /></Tooltip>
            <Tooltip title="任务"><Button type="text" aria-label="任务" icon={<ListTodo size={18}/>} onClick={() => { setTab('tasks'); setShowDetails(true) }} /></Tooltip>
            <Tooltip title="工作"><Button type="text" aria-label="工作" icon={<Workflow size={18}/>} onClick={() => { setTab('work'); setShowDetails(true) }} /></Tooltip>
            <Tooltip title="工作区详情"><Button type="text" aria-label="对话详情" icon={<PanelRightOpen size={18}/>} onClick={() => setShowDetails(true)} /></Tooltip>
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'import', label: '导入用例…', disabled: readOnly || !topic.app_id || sending, onClick: () => { setImportUrl(''); setImportOpen(true) } },
            { key: 'archive', label: topic.archived ? '恢复工作区' : '归档工作区', disabled: topic.workspace_kind.startsWith('legacy'), onClick: () => submit(patch({ archived: !topic.archived })) },
            { key: 'pause', label: topic.paused ? '恢复工作区' : '暂停工作区', disabled: readOnly, onClick: () => submit(patch({ paused: !topic.paused })) },
            { key: 'history', label: archived ? '返回当前对话' : '查看归档', onClick: () => setArchived(!archived) },
            { key: 'delete', label: '删除工作区', danger: true, onClick: () => { setDeleteOpen(true) } }
          ] }}><Button type="text" aria-label="对话菜单" icon={<MoreHorizontal size={18}/>} /></Dropdown>
        </div></header>
        {readOnly && <div className="workspace-im-notice" role="status">此工作区只读，历史消息与证据保留。</div>}
        {topic.paused ? <div className="workspace-im-notice" role="status">工作区已暂停，可继续查询。</div> : null}
        <Drawer title="对话详情" open={showDetails} onClose={() => setShowDetails(false)} width="min(620px, 100vw)" className="v7-details-drawer">
          <div className="v7-workspaces v7-drawer-content">
            <label className="workspace-project-select">所属项目<select aria-label="对话所属项目" value={projectId} disabled={!projects.data?.length} onChange={event => navigate(botsHref(event.target.value))}>
            {!projects.data?.some(project => project.id === projectId) && <option value={projectId}>{projectName}</option>}
            {projects.data?.map(project => <option key={project.id} value={project.id}>{project.name || project.id}</option>)}
            </select></label>
          {projects.isError && <p role="alert">项目列表读取失败：{errText(projects.error)}</p>}
          <nav className="v7-tabs" aria-label="工作区详情">
            {[['members', '成员'], ['scope', '测试目标'], ['tasks', '任务'], ['work', '工作']].map(([id, label]) => <Button key={id} type={tab === id ? 'primary' : 'default'} onClick={() => setTab(id)}>{label}</Button>)}
          </nav>
          {tab === 'members' && <MemberEditor key={selectedId} base={base + prefix} members={data.members || []} readOnly={readOnly || mutation.isPending}
            change={(member, remove) => submit(act(prefix + '/members' + (remove ? '/' + encodeURIComponent(member) : ''), remove ? undefined : { member }, remove ? 'delete' : 'post'))}
            restoreDefaults={() => submit(act(prefix + '/members/defaults'))}
            mention={member => { setDraft(current => current + (current && !/\s$/.test(current) ? ' ' : '') + '@' + member.sender_name + ' '); setShowDetails(false); setTimeout(() => { composerInput.current?.focus(); composerInput.current?.setSelectionRange(100000, 100000) }, 100) }} />}
          {tab === 'scope' && <ResourceEditor key={JSON.stringify([topic.topic_id, topic.requirement_id, topic.modules, topic.env_profile, topic.env_surface])}
            topic={topic} options={options.data} readOnly={readOnly} save={body => submit(patch(body))} />}
          {tab === 'tasks' && <WorkspaceTasks key={selectedId} base={base + prefix} projectId={projectId} />}
          {tab === 'work' && selectedId && <WorkspaceWork key={selectedId} projectId={projectId} topicId={selectedId} />}
          </div>
        </Drawer><section className="collab-card-chat">
          {!data.messages.length && <div className="workspace-im-empty"><MessageSquare size={32} strokeWidth={1.4}/><strong>开始聊天</strong><span>发送消息或附件，输入 @ 提及成员</span></div>}
          <Bubble.List key={selectedId} className="workspace-x-messages" autoScroll items={[
            ...data.messages.map(m => ({
              key: m.message_id,
              className: m.author_kind === 'user' ? 'workspace-im-message workspace-im-message--self' : 'workspace-im-message',
              shape: 'corner' as const,
              variant: 'filled' as const,
              placement: m.author_kind === 'user' ? 'end' as const : 'start' as const,
              avatar: <MemberAvatar id={m.role || m.author_kind} name={m.sender_name || ''} />,
              header: <span className="workspace-im-author">{m.sender_name || (m.author_kind === 'user' ? '我' : '助手')}</span>,
              footer: <div className="workspace-im-message-meta">
                {m.created_at && <time dateTime={m.created_at} title={new Date(m.created_at).toLocaleString('zh-CN')}>{new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>}
                {m.reply_status && <Tooltip title={m.reply_error ? '管家处理诊断：' + m.reply_error : undefined}><span>{replyLabels[m.reply_status] || m.reply_status}</span></Tooltip>}
                {m.origin === 'migrated' && <span>历史归并</span>}
                {!!m.body && <Button type="text" size="small" className="workspace-im-copy" aria-label="复制消息" title="复制消息" icon={<Copy size={12}/>} onClick={() => {
                  void copyToClipboard(m.body).catch(() => setError('复制失败，请手动选择消息文字复制。'))
                }} />}
              </div>,
              content: <div className="collab-message-body"><p><MemberText text={m.body} members={data.members || []} /></p>{card(m)}</div>,
            })),
            ...(replying ? [{ key: 'replying', loading: true, header: <span role="status">正在处理…</span> }] : []),
          ]} />
          {!readOnly && <div className="workspace-x-composer">
            <div className="workspace-im-compose-toolbar">
              <Tooltip title="发送截图"><Button type="text" aria-label="附加截图" icon={<ImagePlus size={18}/>} disabled={sending} onClick={() => screenshotInput.current?.click()} /></Tooltip>
              <Tooltip title="发送附件"><Button type="text" aria-label="附加文件" icon={<Paperclip size={18}/>} disabled={sending} onClick={() => attachmentInput.current?.click()} /></Tooltip>
            </div>
            <MentionInput inputRef={composerInput} members={data.members || []} disabled={sending || mutation.isPending} loading={sending} sendDisabled={(!draft.trim() && !pendingAttachments.length) || mutation.isPending || sending} onSend={() => { if (!mutation.isPending && !sending) send() }} onPaste={e => {
              const files = Array.from(e.clipboardData.items).filter(item => item.kind === 'file' && item.type.startsWith('image/')).map(item => item.getAsFile()).filter((file): file is File => !!file)
              if (!files.length) return
              e.preventDefault()
              addAttachments(files)
              const text = e.clipboardData.getData('text/plain')
              if (text) { const start = e.currentTarget.selectionStart; const end = e.currentTarget.selectionEnd; setDraft(current => current.slice(0, start) + text + current.slice(end)) }
            }} value={draft} onChange={setDraft}
              header={pendingAttachments.length ? <div className="v7-image-drafts" aria-label="待发送附件">{pendingAttachments.map(item => <div className={item.url ? 'v7-image-draft' : 'workspace-im-file-draft'} key={item.id}>
                {item.url ? <img src={item.url} alt={'待发送截图：' + item.file.name} /> : <><FileText size={22}/><span title={item.file.name}>{item.file.name}<small>{fileSize(item.file.size)}</small></span></>}
                <Button type="text" size="small" aria-label={'移除附件：' + item.file.name} icon={<X size={13}/>} disabled={sending} onClick={() => removeAttachment(item.id)} />
              </div>)}</div> : undefined}
              footer={<span className="workspace-im-send-hint">Enter 发送，Shift + Enter 换行</span>}
            />
            <input ref={screenshotInput} hidden multiple type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { addAttachments(Array.from(e.target.files || [])); e.target.value = '' }} />
            <input ref={attachmentInput} aria-label="选择聊天附件" hidden multiple type="file" onChange={e => { addAttachments(Array.from(e.target.files || [])); e.target.value = '' }} />
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
  const [modules, setModules] = useState(topic.modules)
  const [requirement, setRequirement] = useState(topic.requirement_id)
  const missingSurface = Boolean(surface && options && !options.channels.some(c => c.id === surface))
  return <fieldset disabled={readOnly}><legend>测试目标</legend>
    <label>需求范围<select value={requirement} onChange={e => setRequirement(e.target.value)}><option value="">未绑定需求</option>{options?.requirements.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
    {<label>模块范围<select multiple value={modules} onChange={e => setModules(Array.from(e.target.selectedOptions, o => o.value))}>{options?.modules.map(m => <option key={m}>{m}</option>)}</select></label>}
    <label>环境<select value={env} onChange={e => setEnv(e.target.value)}><option value="">尚未选择环境</option>{options?.environments.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}</select></label>
    <label>应用·渠道<select value={surface} onChange={e => setSurface(e.target.value)}><option value="">尚未选择测试目标</option>{surface && !options && <option value={surface}>正在读取测试目标…</option>}{missingSurface && <option value={surface} disabled>原渠道「{surface}」已失效，请重新选择</option>}{options?.channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
    {missingSurface && <p role="status">原测试渠道已不在项目配置中。请选择本次目标，或选择“尚未选择测试目标”后保存以清除旧值。</p>}
    <Button disabled={!options || missingSurface} onClick={() => save({ requirement_id: requirement, modules, env_profile: env, env_surface: surface })}>保存测试目标</Button>
  </fieldset>
}

function fileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function Attachment({ url, name }: { url: string; name: string }) {
  const [file, setFile] = useState<{ url: string; image: boolean; size: number } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true; let objectUrl = ''
    setError(''); setFile(null)
    void request<Blob>({ url, responseType: 'blob' }).then(result => {
      const blob = result as unknown as Blob
      if (active) { objectUrl = URL.createObjectURL(blob); setFile({ url: objectUrl, image: blob.type === 'image/png', size: blob.size }) }
    }).catch(e => { if (active) setError(errText(e)) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [url, attempt])
  if (error) return <div role="alert">附件读取失败：{error}<Button type="link" onClick={() => setAttempt(current => current + 1)}>重试</Button></div>
  if (!file) return <p role="status">正在读取附件：{name}…</p>
  return file.image ? <a href={file.url} download={name}><img src={file.url} alt={name} style={{ maxWidth: '100%', maxHeight: 300 }} /></a>
    : <a className="workspace-im-file" href={file.url} download={name}><FileText size={26}/><span>{name}<small>{fileSize(file.size)}</small></span><Download size={16}/></a>
}
