import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'
import { Button, EmptyState, Input, Tooltip, errText } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import { useAppTaskStats, useProjects } from './queries'
import { CreateDialog } from './CreateDialog'
import { ProjectRow } from './AppRow'
import { markProjectOpened, recentProjectIds } from './recent'
import { projectHref } from '../workbench/projectNavigation'
import type { ProjectRow as Project } from '@/types/project'

/** Global landing page: projects, including projects with no applications. */
export function ProjectListPage() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [q, setQ] = useUrlState('q', '')
  const [creating, setCreating] = useState(false)
  const [cursor, setCursor] = useState(0)
  const searchRef = useRef<any>(null)
  const projectList = useMemo(() => projects.data || [], [projects.data])
  const appIds = useMemo(() => projectList.flatMap(p => (p.apps || []).map(a => a.id)), [projectList])
  const stats = useAppTaskStats(appIds)
  const rows = useMemo(() => {
    const recent = recentProjectIds()
    return projectList.map(project => ({ project,
      running: stats.data?.degraded ? 0 : (project.apps || []).reduce((sum, app) => sum + (stats.data?.byId[app.id]?.runningCount || 0), 0),
      rank: recent.indexOf(project.id),
    })).sort((a, b) => Number(b.running > 0) - Number(a.running > 0)
      || (a.rank < 0 ? 9999 : a.rank) - (b.rank < 0 ? 9999 : b.rank)
      || String(a.project.name || '').localeCompare(String(b.project.name || ''), 'zh-Hans-CN'))
  }, [projectList, stats.data])
  const kw = q.trim().toLowerCase()
  const visible = rows.filter(({ project }) => !kw || `${project.name || ''} ${project.description || ''}`.toLowerCase().includes(kw))
  const href = (project: Project) => projectHref(project.id, (project.apps || []).length ? {} : { tab: 'config', configView: 'apps' })
  const open = useCallback((project: Project) => {
    markProjectOpened(project.id)
    navigate(projectHref(project.id, (project.apps || []).length ? {} : { tab: 'config', configView: 'apps' }))
  }, [navigate])
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (creating) return
      const target = event.target as HTMLElement
      const editing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable
      if (event.key === '/' && !editing) { event.preventDefault(); searchRef.current?.focus(); return }
      if (editing || target.closest('button,a,[role="dialog"],[role="menu"]')) return
      if (!visible.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(value => Math.min(value + 1, visible.length - 1)) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(value => Math.max(0, value - 1)) }
      if (event.key === 'Enter') { event.preventDefault(); open((visible[cursor] || visible[0]).project) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [creating, visible, cursor, open])
  useEffect(() => { setCursor(0) }, [kw])
  useEffect(() => { document.querySelector('[data-focus="true"]')?.scrollIntoView({ block: 'nearest' }) }, [cursor])
  return <div className="min-h-0 overflow-auto">
    <header className="flex flex-wrap items-center gap-3" style={{ marginBottom: 'var(--w-space-3)' }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>项目</h1>
      {!projects.isPending && !projects.isError && <span style={{ color: 'var(--w-text-tertiary)' }}>{projectList.length} 个项目</span>}
      <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
        <Input ref={searchRef} allowClear size="small" prefix={<Search size={13} />} placeholder="搜索项目…" aria-label="搜索项目" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} />
        <Tooltip title="刷新"><Button size="small" icon={<RefreshCw size={13} />} loading={projects.isFetching} onClick={() => void projects.refetch()} aria-label="刷新项目" /></Tooltip>
        <Button size="small" type="primary" onClick={() => setCreating(true)}>新建项目</Button>
      </div>
    </header>
    {stats.data?.degraded && <p role="status">执行计数暂时不可用，仍可进入项目。</p>}
    {projects.isPending ? <div aria-busy="true">正在读取项目…</div>
      : projects.isError ? <EmptyState title="读取项目列表失败" hint={errText(projects.error)} action={<Button onClick={() => void projects.refetch()}>重试</Button>} />
      : !projectList.length ? <EmptyState title="还没有项目" hint="创建项目后，在项目的配置页管理应用和环境。" action={<Button type="primary" onClick={() => setCreating(true)}>新建项目</Button>} />
      : !visible.length ? <EmptyState title="没有匹配的项目" hint="请更换搜索关键词。" />
      : <><div className="w-surface-card" role="list">{visible.map((row, index) => <ProjectRow key={row.project.id} project={row.project} running={row.running} recent={row.rank >= 0} focused={index === cursor} href={href(row.project)} onHover={() => setCursor(index)} onOpen={() => markProjectOpened(row.project.id)} />)}</div>
        <p style={{ color: 'var(--w-text-tertiary)', marginTop: 12 }}><kbd className="w-kbd">/</kbd> 搜索 <kbd className="w-kbd">↑ ↓</kbd> 选择 <kbd className="w-kbd">Enter</kbd> 进入 {visible.length} 个项目</p></>}
    <CreateDialog target={creating ? { kind: 'project' } : null} onClose={() => setCreating(false)} onCreated={row => { setCreating(false); navigate(projectHref(row.id, { tab: 'config', configView: 'apps' })) }} />
  </div>
}
