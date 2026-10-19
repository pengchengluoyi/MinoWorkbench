import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NavLink, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, MessageSquare, MoreHorizontal, SquarePen, Users } from 'lucide-react'
import { useProjects } from '@/domains/testing/apps/queries'
import { request } from '@/lib/request'
import { Button, Dropdown, Tooltip, errText } from '@/ui'
import { botsHref, readBotsProject } from './botsNavigation'
import { useWorkspaceNavigation, workspaceBase, workspaceKey } from './workspaceNavigation'

export function BotsNavBlock({ collapsed, onExpand, onNavigate }: { collapsed: boolean; onExpand: () => void; onNavigate: () => void }) {
  const location = useLocation()
  const match = useMatch('/bots/projects/:projectId')
  const active = location.pathname === '/bots' || !!match
  const [open, setOpen] = useState(true)
  const projects = useProjects()
  const remembered = readBotsProject()
  const projectId = match?.params.projectId || projects.data?.find(project => project.id === remembered)?.id || projects.data?.[0]?.id || ''
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { topics, selectedId, archived, setArchived } = useWorkspaceNavigation(projectId, { enabled: active && open && !collapsed, poll: false })
  const createTopic = useMutation({
    mutationFn: async () => {
      return (await request<{ topic_id: string }>({ url: workspaceBase(projectId), method: 'post', data: { app_id: params.get('appId') || '' } })).data!
    },
    onSuccess: topic => {
      void qc.invalidateQueries({ queryKey: workspaceKey(projectId) })
      const next = new URLSearchParams(params)
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
  const heading = <button type="button" className={`work-shell-link w-hit${active ? ' is-active' : ''}`} aria-label="测试工作区" aria-expanded={!collapsed && active && open} aria-controls="work-shell-conversations" onClick={toggle}>
    <Users size={17} aria-hidden />{!collapsed && <><span>测试工作区</span><ChevronDown size={14} className={`work-shell-chevron${active && open ? ' is-open' : ''}`} aria-hidden /></>}
  </button>
  return <div className="work-shell-bots-nav">
    {collapsed ? <Tooltip title="测试工作区" placement="right">{heading}</Tooltip> : heading}
    {!collapsed && active && open && <div id="work-shell-conversations" className="work-shell-conversations" role="group" aria-label="对话记录">
      <div className="work-shell-conversation-tools">
        <Button type="text" size="small" icon={<SquarePen size={14} />} disabled={!projectId || createTopic.isPending || topics.isError} loading={createTopic.isPending} onClick={() => createTopic.mutate()}>新建对话</Button>
        <Dropdown trigger={['click']} menu={{ items: [{ key: 'archived', label: archived ? '返回当前对话' : '查看归档', onClick: () => setArchived(!archived) }] }}><Button type="text" size="small" icon={<MoreHorizontal size={15} />} aria-label="对话记录菜单" /></Dropdown>
      </div>
      {archived && <div className="work-shell-archive-hint"><span>已归档对话</span><button type="button" onClick={() => setArchived(false)}>返回</button></div>}
      {topics.isPending && <p className="work-shell-nav-hint" role="status">正在加载对话…</p>}
      {topics.isError && <div className="work-shell-nav-hint" role="alert">对话加载失败<Button type="text" size="small" onClick={() => void topics.refetch()}>重试</Button></div>}
      {createTopic.isError && <p className="work-shell-nav-hint" role="alert">{errText(createTopic.error)}</p>}
      {!topics.isPending && !topics.isError && !topics.data?.length && <p className="work-shell-nav-hint">{archived ? '暂无归档对话' : '还没有对话'}</p>}
      {(topics.data || []).map(topic => {
        const query = new URLSearchParams(params)
        query.set('topic', topic.topic_id)
        query.delete('collabCase')
        const selected = topic.topic_id === selectedId
        return <NavLink key={topic.topic_id} to={botsHref(projectId, query)} onClick={onNavigate} title={topic.title} className={`work-shell-conversation${selected ? ' is-active' : ''}`} aria-current={selected ? 'page' : false}>
          <MessageSquare size={14} aria-hidden /><span className="work-shell-conversation-label"><span>{topic.title}</span>{topic.progress && <small>{topic.progress}</small>}</span>
          {!!topic.unread && <span className="work-shell-unread" aria-label={`${topic.unread} 条未读`}>{topic.unread > 99 ? '99+' : topic.unread}</span>}
        </NavLink>
      })}
    </div>}
  </div>
}
