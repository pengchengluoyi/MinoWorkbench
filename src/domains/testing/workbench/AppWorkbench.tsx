import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Button, EmptyState, ErrorBoundary, Planned, Skeleton, errText } from '@/ui'
import { getPlatformIcon, type PlatformInput } from '@/constants/appPlatforms'
import { DEFAULT_TAB, isRetiredTab, resolveTab, type Tab } from './nav'
import { useAppDetail } from './queries'
import { loadCasesPanel, loadTasksPanel } from './listPrefetch'
import { ensureListNavigation, failListNavigation } from './performance'
import { useAppRealtime } from './useAppRealtime'

const AppIssuesPanel = lazy(() => import('@/domains/testing/cases/AppIssuesPanel').then(m => ({ default: m.AppIssuesPanel })))
const CasesPanel = lazy(() => loadCasesPanel().then((m) => ({ default: m.CasesPanel })))
const TasksPanel = lazy(() => loadTasksPanel().then((m) => ({ default: m.TasksPanel })))
const AssetsPanel = lazy(() => import('@/domains/testing/assets/AssetsPanel').then((m) => ({ default: m.AssetsPanel })))
const EnvConfigPanel = lazy(() => import('@/domains/testing/config/EnvConfigPanel').then((m) => ({ default: m.EnvConfigPanel })))
const SessionLogPanel = lazy(() => import('@/domains/testing/sessions/SessionLogPanel').then((m) => ({ default: m.SessionLogPanel })))

const lazyPanel = (node: React.ReactNode) => (
  <Suspense fallback={<Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />}>
    <div className="flex h-full min-h-0 flex-1 flex-col">{node}</div>
  </Suspense>
)

/**
 * 应用工作台外壳。
 *
 * 只负责：应用上下文条、已砍 tab 的重定向、主区面板分发。
 *
 * 应用内导航不在这里 —— 它嵌在 WorkShell 的那条左栏里，
 * 屏幕上只应该有一条左导航（见 contracts/testing-app-workbench.md）。
 */
export function AppWorkbench() {
  const { appId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const rawTab = params.get('tab')
  const tab = resolveTab(rawTab)
  const detail = useAppDetail(appId)
  const projectId = detail.data?.project_id || ''
  useAppRealtime(appId, projectId)
  if (tab === 'cases' || tab === 'tasks') ensureListNavigation(appId, tab)
  useEffect(() => {
    if (detail.isError && (tab === 'cases' || tab === 'tasks')) failListNavigation(appId, tab)
  }, [detail.isError, appId, tab])

  useEffect(() => {
    if (!projectId || params.get('projectId') === projectId) return
    const next = new URLSearchParams(params)
    next.set('projectId', projectId)
    setParams(next, { replace: true })
  }, [projectId, params, setParams])

  // 已砍功能的旧 tab 值（process / knowledge / docs / intel）→ 回落默认 tab
  useEffect(() => {
    if (isRetiredTab(rawTab) || (rawTab && rawTab !== tab)) {
      const next = new URLSearchParams(params)
      next.set('tab', DEFAULT_TAB)
      // 这些子视图参数属于已砍的 tab，一并清掉
      ;['board', 'kview'].forEach((k) => next.delete(k))
      setParams(next, { replace: true })
    }
  }, [rawTab, tab, params, setParams])

  // query 里的 appName 只作乐观初值，接口回来后以接口为准
  const app = useMemo(() => {
    const fromQuery = params.get('appName')
    if (detail.data) return detail.data
    return fromQuery ? { id: appId, name: fromQuery } : undefined
  }, [detail.data, params, appId])

  if (detail.isError) {
    return (
      <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
        <EmptyState
          icon={<TriangleAlert size={30} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="打不开这个应用"
          hint={errText(detail.error, `应用 ${appId} 不存在，或当前账号没有权限。`)}
          action={
            <Button size="small" icon={<ArrowLeft size={13} />} onClick={() => navigate('/testing')}>
              返回应用列表
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0, gap: 'var(--w-space-3)' }}>
      {/* 应用上下文条 */}
      <header className="flex items-center gap-3 shrink-0 min-w-0">
        <Button
          size="small"
          type="text"
          icon={<ArrowLeft size={15} />}
          onClick={() => navigate('/testing')}
          aria-label="返回应用列表"
        />
        {detail.isLoading && !app ? (
          <Skeleton active title={{ width: 180 }} paragraph={false} style={{ maxWidth: 240 }} />
        ) : (
          <>
            <span style={{ fontSize: 17, lineHeight: 1 }}>{getPlatformIcon(app?.platforms)}</span>
            <strong
              className="truncate"
              style={{ fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)', letterSpacing: '-0.01em' }}
              title={app?.name}
            >
              {app?.name || '未命名应用'}
            </strong>
            {params.get('projectName') && (
              <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>
                {params.get('projectName')}
              </span>
            )}
          </>
        )}
      </header>

      <div className="flex flex-1 min-h-0" style={{ gap: 'var(--w-space-4)' }}>
        {/* 主工作区 */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ErrorBoundary resetKey={`${appId}:${params.toString()}`} label="面板">
            <Panel key={appId} tab={tab} appId={appId} projectId={projectId} platforms={app?.platforms} contextLoading={detail.isPending} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}

/** 面板分发。各面板按阶段陆续替换掉占位。 */
function Panel({ tab, appId, projectId, platforms, contextLoading }: { tab: Tab; appId: string; projectId: string; platforms: PlatformInput; contextLoading: boolean }) {
  switch (tab) {
    case 'issues':
      return contextLoading ? <Skeleton active /> : lazyPanel(<AppIssuesPanel key={appId + projectId} appId={appId} projectId={projectId} />)
    case 'cases':
      if (!projectId) return contextLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : <EmptyState title="应用未关联项目" hint="请检查应用的项目信息。" />
      return lazyPanel(<CasesPanel appId={appId} projectId={projectId} platforms={platforms} />)
    case 'tasks':
      if (contextLoading) return <Skeleton active paragraph={{ rows: 8 }} />
      return lazyPanel(<TasksPanel appId={appId} projectId={projectId} platforms={platforms} />)
    case 'session-log':
      return lazyPanel(<SessionLogPanel appId={appId} />)
    case 'navigation':
      return <Planned title="导航架构" phase="阶段 6" note="换 @xyflow/react，交互重做。" source="Testing/NavWorkbench.vue + 7 个图组件 4,165 行" />
    case 'assets':
      return contextLoading ? <Skeleton active /> : lazyPanel(<AssetsPanel projectId={projectId} />)
    case 'config':
      return contextLoading ? <Skeleton active /> : lazyPanel(<EnvConfigPanel projectId={projectId} appId={appId} />)
    default:
      return null
  }
}
