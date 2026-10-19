import { lazy, Suspense } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Button, EmptyState, ErrorBoundary, Select, Skeleton, errText } from '@/ui'
import { useProjects } from '../apps/queries'
import { resolveTab } from './nav'
import { projectHref } from './projectNavigation'
import { useAppRealtime } from './useAppRealtime'

const CasesPanel = lazy(() => import('../cases/CasesPanel').then(m => ({ default: m.CasesPanel })))
const TasksPanel = lazy(() => import('../tasks/TasksPanel').then(m => ({ default: m.TasksPanel })))
const AppIssuesPanel = lazy(() => import('../cases/AppIssuesPanel').then(m => ({ default: m.AppIssuesPanel })))
const AssetsPanel = lazy(() => import('../assets/AssetsPanel').then(m => ({ default: m.AssetsPanel })))
const EnvConfigPanel = lazy(() => import('../config/EnvConfigPanel').then(m => ({ default: m.EnvConfigPanel })))
const SessionLogPanel = lazy(() => import('../sessions/SessionLogPanel').then(m => ({ default: m.SessionLogPanel })))

export function ProjectWorkbench() {
  const { projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const projects = useProjects()
  const project = projects.data?.find(row => row.id === projectId)
  const apps = project?.apps || []
  const requested = params.get('appId') || ''
  const app = requested ? apps.find(row => row.id === requested) : apps.length === 1 ? apps[0] : undefined
  const appId = app?.id || ''
  const tab = resolveTab(params.get('tab'))
  useAppRealtime(appId, projectId)
  const choose = (id: string) => {
    // A different target must never inherit another application's run/session.
    const query = new URLSearchParams(params)
    for (const key of ['case', 'run', 'session', 'tcase', 'unit']) query.delete(key)
    query.set('appId', id)
    setParams(query)
  }
  if (projects.isPending) return <Skeleton active />
  if (projects.isError) return <EmptyState title="项目读取失败" hint={errText(projects.error)} action={<Button onClick={() => void projects.refetch()}>重试</Button>} />
  if (!project) return <EmptyState title="项目不存在或不可访问" action={<Link to="/testing">返回项目列表</Link>} />
  const scoped = ['cases', 'tasks', 'issues', 'session-log'].includes(tab)
  let panel: React.ReactNode
  if (tab === 'config') panel = <EnvConfigPanel projectId={projectId} appId={appId} />
  else if (tab === 'assets') panel = <AssetsPanel projectId={projectId} />
  else if (scoped && !app) panel = <EmptyState title={requested ? '目标应用不属于当前项目或已不存在' : apps.length ? '请选择本次查看的应用' : '项目尚未配置应用'} hint={apps.length ? '用例执行结果与任务按目标应用区分，请在上方选择。' : '在项目配置中添加应用后，即可执行测试。'} action={<Link to={projectHref(projectId, { tab: 'config', configView: 'apps' })}>管理项目应用</Link>} />
  else if (tab === 'cases') panel = <CasesPanel appId={appId} projectId={projectId} platforms={app?.platforms} />
  else if (tab === 'tasks') panel = <TasksPanel appId={appId} projectId={projectId} platforms={app?.platforms} />
  else if (tab === 'issues') panel = <AppIssuesPanel appId={appId} projectId={projectId} />
  else if (tab === 'session-log') panel = <SessionLogPanel appId={appId} />
  else panel = <EmptyState title="此项目视图暂未提供" action={<Link to={projectHref(projectId)}>返回项目用例</Link>} />
  return <div className="project-workbench">
    <div className="project-context-bar">
      <nav aria-label="面包屑" className="project-breadcrumb"><Link to="/testing">项目</Link><ChevronRight size={14} aria-hidden /><span aria-current="page" title={project.name}>{project.name || '未命名项目'}</span></nav>
      {scoped && apps.length > 0 && <div className="project-target"><Select aria-label="目标应用" placeholder="选择应用" value={appId || undefined} options={apps.map(row => ({ value: row.id, label: row.name || '未命名应用' }))} onChange={choose} /></div>}
    </div>
    <div className="project-workbench-panel"><ErrorBoundary resetKey={`${projectId}:${appId}:${params.toString()}`} label="项目面板"><Suspense fallback={<Skeleton active />}><div key={`${projectId}:${appId}:${tab}`} className="project-panel-content">{panel}</div></Suspense></ErrorBoundary></div>
  </div>
}
