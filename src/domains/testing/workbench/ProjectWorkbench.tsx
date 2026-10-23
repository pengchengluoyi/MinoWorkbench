import { lazy, Suspense } from 'react'
import { useParams, useSearchParams, Link, Navigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Button, EmptyState, ErrorBoundary, Skeleton, Space, errText } from '@/ui'
import { useProjects } from '../apps/queries'
import { APP_NAV, SUB_VIEW_DEFAULTS, resolveTab } from './nav'
import { projectHref } from './projectNavigation'
import { botsHref } from '@/domains/bots/botsNavigation'
import { useAppRealtime } from './useAppRealtime'

const CasesPanel = lazy(() => import('../cases/CasesPanel').then(m => ({ default: m.CasesPanel })))
const TasksPanel = lazy(() => import('../tasks/TasksPanel').then(m => ({ default: m.TasksPanel })))
const AppIssuesPanel = lazy(() => import('../cases/AppIssuesPanel').then(m => ({ default: m.AppIssuesPanel })))
const AssetsPanel = lazy(() => import('../assets/AssetsPanel').then(m => ({ default: m.AssetsPanel })))
const EnvConfigPanel = lazy(() => import('../config/EnvConfigPanel').then(m => ({ default: m.EnvConfigPanel })))
const SessionLogPanel = lazy(() => import('../sessions/SessionLogPanel').then(m => ({ default: m.SessionLogPanel })))
const WorkspaceWork = lazy(() => import('../collab/WorkspaceWork').then(m => ({ default: m.WorkspaceWork })))
export function ProjectWorkbench() {
  const { projectId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const projects = useProjects()
  const project = projects.data?.find(row => row.id === projectId)
  const apps = project?.apps || []
  const requested = params.get('appId') || ''
  const app = requested ? apps.find(row => row.id === requested) : apps.length === 1 ? apps[0] : undefined
  const appId = app?.id || ''
  const rawTab = params.get('tab')
  const tab = resolveTab(rawTab)
  useAppRealtime(appId, projectId)
  if (rawTab === 'collab') {
    const q = new URLSearchParams(params)
    q.delete('tab')
    return <Navigate to={botsHref(projectId, q)} replace />
  }
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
  else if (tab === 'work') panel = <WorkspaceWork projectId={projectId} topicId="" />
  else if (scoped && !app) panel = <EmptyState
    title={requested ? '目标应用不属于当前项目或已不存在' : apps.length ? '选择要查看的应用' : '项目尚未配置应用'}
    hint={apps.length ? '选择应用后查看对应的用例、任务和执行结果。' : '在项目配置中添加应用后，即可执行测试。'}
    action={apps.length ? <Space wrap>{apps.map(row => <Button key={row.id} onClick={() => choose(row.id)}>{row.name || '未命名应用'}</Button>)}</Space>
      : <Link to={projectHref(projectId, { tab: 'config', configView: 'apps' })}>管理项目应用</Link>}
  />
  else if (tab === 'cases') panel = <CasesPanel appId={appId} projectId={projectId} platforms={app?.platforms} />
  else if (tab === 'tasks') panel = <TasksPanel appId={appId} projectId={projectId} platforms={app?.platforms} />
  else if (tab === 'issues') panel = <AppIssuesPanel appId={appId} projectId={projectId} />
  else if (tab === 'session-log') panel = <SessionLogPanel appId={appId} />
  else panel = <EmptyState title="此项目视图暂未提供" action={<Link to={projectHref(projectId)}>返回项目用例</Link>} />
  const nav = APP_NAV.find(item => item.id === tab || item.alsoActiveOn?.includes(tab))
  const defaultView = SUB_VIEW_DEFAULTS[tab]
  const subView = defaultView ? params.get(defaultView.key) || defaultView.value : ''
  const child = nav?.children?.find(item => item.tab === tab || item.param?.value === subView)
  const sectionLabel = child?.label || nav?.label || '项目'
  const listQuery = new URLSearchParams(params)
  for (const key of ['case', 'run', 'tcase', 'unit', 'session']) listQuery.delete(key)
  const levels: { label: string; to?: string }[] = [
    { label: '项目', to: '/testing' },
    { label: project.name || '未命名项目', to: projectHref(projectId, appId ? { appId } : {}) },
    { label: sectionLabel },
  ]
  if (tab === 'cases' && params.get('case')) {
    levels[2].to = projectHref(projectId, listQuery)
    levels.push({ label: '用例详情' })
  } else if (tab === 'tasks' && params.get('run')) {
    levels[2].to = projectHref(projectId, listQuery)
    levels.push({ label: '任务详情' })
    if (params.get('tcase')) {
      const taskQuery = new URLSearchParams(params); taskQuery.delete('tcase'); taskQuery.delete('unit')
      levels[3].to = projectHref(projectId, taskQuery)
      levels.push({ label: '用例结果' })
    }
  } else if (tab === 'session-log' && params.get('session')) {
    levels[2].to = projectHref(projectId, listQuery)
    levels.push({ label: '执行详情' })
  }
  return <div className="project-workbench">
    <div className="project-context-bar">
      <nav aria-label="面包屑" className="project-breadcrumb"><ol className="project-breadcrumb-list">{levels.map((level, index) => <li key={`${index}:${level.label}`}>{index > 0 && <ChevronRight size={14} aria-hidden />}{level.to ? <Link to={level.to}>{level.label}</Link> : <span aria-current={index === levels.length - 1 ? 'page' : undefined}>{level.label}</span>}</li>)}</ol></nav>
    </div>
    <div className="project-workbench-panel"><ErrorBoundary resetKey={`${projectId}:${appId}:${params.toString()}`} label="项目面板"><Suspense fallback={<Skeleton active />}><div key={`${projectId}:${appId}:${tab}`} className="project-panel-content">{panel}</div></Suspense></ErrorBoundary></div>
  </div>
}
