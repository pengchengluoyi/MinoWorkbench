import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, ErrorBoundary, Planned, Skeleton, errText } from '@/ui'
import { getPlatformIcon } from '@/constants/appPlatforms'
import { DEFAULT_TAB, isRetiredTab, resolveTab, type Tab } from './nav'
import { useAppDetail } from './queries'
import { ContextRail } from './ContextRail'

/**
 * 应用工作台外壳。
 *
 * 只负责：应用上下文条、已砍 tab 的重定向、主区面板分发、上下文侧栏。
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
        <main className="flex-1 min-w-0 overflow-auto">
          <ErrorBoundary label="面板">
            <Panel tab={tab} appId={appId} />
          </ErrorBoundary>
        </main>

        <ContextRail app={app} />
      </div>
    </div>
  )
}

/** 面板分发。各面板按阶段陆续替换掉占位。 */
function Panel({ tab, appId }: { tab: Tab; appId: string }) {
  switch (tab) {
    case 'cases':
      return <Planned title="用例库" phase="阶段 2b" source="Testing/CasesWorkbench.vue 1,130 行" />
    case 'tasks':
      return <Planned title="执行批次" phase="阶段 3" source="Testing/TaskDetailPane.vue 1,949 行" />
    case 'session-log':
      return <Planned title="Session Log" phase="阶段 3" source="Testing/SessionLogPanel.vue 663 行" />
    case 'navigation':
      return <Planned title="导航架构" phase="阶段 6" note="换 @xyflow/react，交互重做。" source="Testing/NavWorkbench.vue + 7 个图组件 4,165 行" />
    case 'assets':
      return <Planned title="测试资源" phase="阶段 5" source="Testing/AssetsPage.vue 1,664 行" />
    case 'config':
      return <Planned title="环境配置" phase="阶段 5" note={`应用 ${appId}`} source="Settings/AppConfigPage.vue（仅 env）+ ProjectEnvEditor 981 行" />
    default:
      return null
  }
}
