import { lazy, Suspense } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { Folder } from 'lucide-react'
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
    const query = new URLSearchParams({ tab, appId: id })
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
  return <div className="flex flex-col h-full min-h-0" style={{ gap: 'var(--w-space-3)' }}>
    <header className="flex items-center gap-3"><Link to="/testing" aria-label="返回项目列表">←</Link><Folder size={20} /><h1 className="truncate" style={{ margin: 0, fontSize: 22 }}>{project.name || '未命名项目'}</h1></header>
    {scoped && apps.length > 0 && <div className="flex items-center gap-3"><span>目标应用</span><Select aria-label="目标应用" placeholder="选择项目内的应用" value={appId || undefined} style={{ minWidth: 240 }} options={apps.map(row => ({ value: row.id, label: row.name || row.id }))} onChange={choose} /><Link to={projectHref(projectId, { tab: 'config', configView: 'apps' })}>管理应用</Link></div>}
    <main className="flex flex-col flex-1 min-h-0 overflow-hidden"><ErrorBoundary resetKey={`${projectId}:${appId}:${params.toString()}`} label="项目面板"><Suspense fallback={<Skeleton active />}><div key={`${projectId}:${appId}:${tab}`} className="flex flex-col flex-1 min-h-0">{panel}</div></Suspense></ErrorBoundary></main>
  </div>
}
