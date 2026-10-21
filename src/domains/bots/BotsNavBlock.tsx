import { Conversations } from '@ant-design/x'
import { useEffect, useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronDown, MoreHorizontal, SquarePen, Users } from 'lucide-react'
import { useProjects } from '@/domains/testing/apps/queries'
import { request } from '@/lib/request'
import { Button, Dropdown, Input, Modal, Tooltip, errText } from '@/ui'
import { botsHref, readBotsProject } from './botsNavigation'
import { workspaceBase, workspaceKey, removeWorkspaceFromCache, type WorkspaceSummary } from './workspaceNavigation'

type WorkspaceTarget = { projectId: string; topic: WorkspaceSummary }

export function BotsNavBlock({ collapsed, onExpand, onNavigate }: { collapsed: boolean; onExpand: () => void; onNavigate: () => void }) {
  const location = useLocation()
  const match = useMatch('/bots/projects/:projectId')
  const active = location.pathname === '/bots' || !!match
  const [open, setOpen] = useState(true)
  const projects = useProjects()
  const remembered = readBotsProject()
  const projectId = match?.params.projectId || projects.data?.find(project => project.id === remembered)?.id || projects.data?.[0]?.id || ''
  const [params] = useSearchParams()
  const [archived, setArchived] = useState(() => params.get('archived') === '1')
  const navigate = useNavigate()
  const qc = useQueryClient()
  const topicQueries = useQueries({ queries: (projects.data || []).map(project => ({
    queryKey: [...workspaceKey(project.id), 'list', archived],
    enabled: open && !collapsed,
    retry: false,
    refetchOnWindowFocus: false,
    queryFn: async () => (await request<WorkspaceSummary[]>({ url: workspaceBase(project.id), params: { archived } })).data!,
  })) })
  const selectedId = active ? params.get('topic') || '' : ''
  const topicGroups = (projects.data || []).map((project, index) => ({ project, query: topicQueries[index] }))
  const entries = topicGroups.flatMap(({ project, query }) => (query.data || []).map(topic => ({ projectId: project.id, topic })))
  const [workspaceMenu, setWorkspaceMenu] = useState<{ target: WorkspaceTarget; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!workspaceMenu) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setWorkspaceMenu(null) }
    const closeOutside = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('[data-workspace-key], .work-shell-workspace-menu')) return
      setWorkspaceMenu(null)
    }
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOutside, true)
    document.addEventListener('contextmenu', closeOutside, true)
    return () => {
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOutside, true)
      document.removeEventListener('contextmenu', closeOutside, true)
    }
  }, [workspaceMenu])
  const [dialog, setDialog] = useState<{ action: 'rename' | 'delete'; target: WorkspaceTarget } | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const changeWorkspace = useMutation({
    mutationFn: async ({ target, action, title }: { target: WorkspaceTarget; action: 'rename' | 'archive' | 'delete'; title?: string }) =>
      request({ url: workspaceBase(target.projectId) + '/' + encodeURIComponent(target.topic.topic_id),
        method: action === 'delete' ? 'delete' : 'patch',
        data: action === 'delete' ? undefined : action === 'rename' ? { title } : { archived: !target.topic.archived } }),
    onSuccess: async (_, { target, action }) => {
      if (action === 'delete') removeWorkspaceFromCache(qc, target.projectId, target.topic.topic_id)
      if (action !== 'rename' && active && projectId === target.projectId && selectedId === target.topic.topic_id) {
        const next = new URLSearchParams()
        if (archived) next.set('archived', '1')
        navigate(botsHref(target.projectId, next), { replace: true })
      }
      setDialog(null)
      await qc.invalidateQueries({ queryKey: workspaceKey(target.projectId) })
    },
  })
  const menuFor = (target: WorkspaceTarget) => ({
    onClick: () => setWorkspaceMenu(null),
    items: [
      { key: 'rename', label: '重命名', disabled: changeWorkspace.isPending || !!target.topic.archived || target.topic.workspace_kind.startsWith('legacy'), onClick: () => {
        changeWorkspace.reset(); setNewTitle(target.topic.title); setDialog({ action: 'rename', target })
      } },
      { key: 'delete', label: '删除', danger: true, disabled: changeWorkspace.isPending, onClick: () => {
        changeWorkspace.reset(); setDialog({ action: 'delete', target })
      } },
    ],
  })
  const confirmDialog = () => {
    if (!dialog || changeWorkspace.isPending || (dialog.action === 'rename' && !newTitle.trim())) return
    changeWorkspace.mutate({ target: dialog.target, action: dialog.action, title: newTitle.trim() })
  }
  const createTopic = useMutation({
    mutationFn: async () => {
      return (await request<{ topic_id: string }>({ url: workspaceBase(projectId), method: 'post', data: { app_id: active ? params.get('appId') || '' : '' } })).data!
    },
    onSuccess: topic => {
      setArchived(false)
      void qc.invalidateQueries({ queryKey: workspaceKey(projectId) })
      const next = new URLSearchParams(active ? params : undefined)
      next.set('topic', topic.topic_id)
      next.delete('archived')
      next.delete('collabCase')
      navigate(botsHref(projectId, next))
      onNavigate()
    },
  })
  const toggle = () => {
    if (collapsed) { onExpand(); setOpen(true) }
    else setOpen(active ? !open : true)
    if (!active) navigate(projectId ? botsHref(projectId) : '/bots')
  }
  const heading = <button type="button" className={`work-shell-link w-hit${active ? ' is-active' : ''}`} aria-label="工作区" aria-expanded={!collapsed && open} aria-controls="work-shell-conversations" onClick={toggle}>
    <Users size={17} aria-hidden />{!collapsed && <><span>工作区</span><ChevronDown size={14} className={`work-shell-chevron${open ? ' is-open' : ''}`} aria-hidden /></>}
  </button>
  return <div className="work-shell-bots-nav">
    {collapsed ? <Tooltip title="工作区" placement="right">{heading}</Tooltip> : heading}
    {!collapsed && open && <div id="work-shell-conversations" className="work-shell-conversations" role="group" aria-label="对话记录" onScrollCapture={() => setWorkspaceMenu(null)}>
      <div className="work-shell-conversation-tools">
        <Button type="text" size="small" icon={<SquarePen size={14} />} disabled={!projectId || createTopic.isPending } loading={createTopic.isPending} onClick={() => createTopic.mutate()}>新建工作区</Button>
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'archived', label: archived ? '返回当前对话' : '查看归档', onClick: () => setArchived(!archived) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={15} />} aria-label="对话记录菜单" /></Dropdown>
      </div>
      {archived && <div className="work-shell-archive-hint"><span>已归档对话</span><button type="button" onClick={() => setArchived(false)}>返回</button></div>}
      {projects.isPending && <p className="work-shell-nav-hint" role="status">正在加载工作区…</p>}
      {projects.isError && <div className="work-shell-nav-hint" role="alert">工作区加载失败<Button type="text" size="small" onClick={() => void projects.refetch()}>重试</Button></div>}
      {createTopic.isError && <p className="work-shell-nav-hint" role="alert">{errText(createTopic.error)}</p>}
      {!projects.isPending && !projects.isError && !topicGroups.length && <p className="work-shell-nav-hint">创建项目后即可新建工作区</p>}
      {topicGroups.some(({ query }) => query.isPending) && <p className="work-shell-nav-hint" role="status">正在加载对话…</p>}
      {topicGroups.some(({ query }) => query.isError) && <div className="work-shell-nav-hint" role="alert">部分对话加载失败<Button type="text" size="small" onClick={() => { topicGroups.filter(({ query }) => query.isError).forEach(({ query }) => void query.refetch()) }}>重试</Button></div>}
      {changeWorkspace.isError && !dialog && <p role="alert" className="work-shell-nav-hint">{errText(changeWorkspace.error)}</p>}
      <div onContextMenuCapture={event => {
        const key = (event.target as HTMLElement).closest('[data-workspace-key]')?.getAttribute('data-workspace-key')
        const target = entries.find(entry => JSON.stringify([entry.projectId, entry.topic.topic_id]) === key)
        if (!target) { event.stopPropagation(); return }
        event.preventDefault()
        event.stopPropagation()
        setWorkspaceMenu({ target, x: event.clientX, y: event.clientY })
      }}>
      <Conversations
        activeKey={active && selectedId ? JSON.stringify([projectId, selectedId]) : undefined}
        onActiveChange={key => {
          setWorkspaceMenu(null)
          const [targetProject, topicId] = JSON.parse(key) as [string, string]
          const query = new URLSearchParams({ topic: topicId })
          if (archived) query.set('archived', '1')
          navigate(botsHref(targetProject, query))
          onNavigate()
        }}
        items={topicGroups.flatMap(({ project, query }) => (query.data || []).map(topic => ({
          key: JSON.stringify([project.id, topic.topic_id]),
          'data-workspace-key': JSON.stringify([project.id, topic.topic_id]),
          label: <span className="work-shell-conversation-title">
            <span className="work-shell-conversation-label" title={topic.title}>{topic.title}</span>
            {!!topic.unread && <span className="work-shell-unread" aria-label={`${topic.unread} 条未读`}>{topic.unread > 99 ? '99+' : topic.unread}</span>}
            <span className="work-shell-conversation-actions" onClick={event => event.stopPropagation()}>
              <Tooltip title={topic.archived ? '取消归档' : '归档'}><Button type="text" size="small"
                aria-label={`${topic.archived ? '取消归档' : '归档'}工作区：${topic.title}`}
                icon={topic.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                disabled={changeWorkspace.isPending || topic.workspace_kind.startsWith('legacy')}
                onClick={() => { setWorkspaceMenu(null); changeWorkspace.mutate({ target: { projectId: project.id, topic }, action: 'archive' }) }} /></Tooltip>
              <Button type="text" size="small" aria-label={topic.title + '工作区操作'} aria-haspopup="menu"
                aria-expanded={workspaceMenu?.target.projectId === project.id && workspaceMenu.target.topic.topic_id === topic.topic_id}
                icon={<MoreHorizontal size={14} />} onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect()
                  setWorkspaceMenu(current => current?.target.projectId === project.id && current.target.topic.topic_id === topic.topic_id
                    ? null : { target: { projectId: project.id, topic }, x: rect.right - 168, y: rect.bottom })
                }} />
            </span>
          </span>,
        })))}
      />
      </div>
      <Dropdown open={!!workspaceMenu} trigger={[]} placement="bottomLeft"
        overlayClassName="work-shell-workspace-menu" menu={workspaceMenu ? menuFor(workspaceMenu.target) : { items: [] }}>
        <span aria-hidden="true" style={{ position: 'fixed', left: workspaceMenu?.x ?? 0, top: workspaceMenu?.y ?? 0, width: 1, height: 1, pointerEvents: 'none' }} />
      </Dropdown>
    </div>}
    <Modal title={dialog?.action === 'rename' ? '重命名工作区' : '删除工作区'} open={!!dialog}
      onCancel={() => { if (!changeWorkspace.isPending) setDialog(null) }}
      onOk={confirmDialog} confirmLoading={changeWorkspace.isPending}
      okText={dialog?.action === 'rename' ? '保存' : '删除'} cancelText="取消"
      okButtonProps={{ danger: dialog?.action === 'delete', disabled: dialog?.action === 'rename' && !newTitle.trim() }}>
      {dialog?.action === 'rename' ? <Input autoFocus aria-label="工作区名称" maxLength={200} value={newTitle}
        disabled={changeWorkspace.isPending} onChange={event => setNewTitle(event.target.value)} onPressEnter={confirmDialog} />
        : <p>删除“{dialog?.target.topic.title}”的聊天与范围；项目用例、运行记录和证据保留，已提交的运行继续。</p>}
      {changeWorkspace.isError && <p role="alert">{errText(changeWorkspace.error)}</p>}
    </Modal>
  </div>
}
