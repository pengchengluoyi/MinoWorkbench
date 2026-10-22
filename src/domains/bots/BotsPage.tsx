import { useEffect, useMemo } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { Skeleton, EmptyState, Button, errText } from '@/ui'
import { useProjects } from '@/domains/testing/apps/queries'
import { CollabPanel } from '@/domains/testing/collab/CollabPanel'
import { botsHref, readBotsProject, rememberBotsProject } from './botsNavigation'
import './BotsPage.css'

export function BotsPage() {
  const { projectId: routeProjectId } = useParams()
  const [params] = useSearchParams()
  const projects = useProjects()
  const list = useMemo(() => projects.data || [], [projects.data])
  const ids = useMemo(() => new Set(list.map(row => row.id)), [list])

  const projectId = useMemo(() => {
    if (routeProjectId) return ids.has(routeProjectId) ? routeProjectId : ''
    const stored = readBotsProject()
    if (stored && ids.has(stored)) return stored
    return list[0]?.id || ''
  }, [routeProjectId, ids, list])

  useEffect(() => {
    if (projectId) rememberBotsProject(projectId)
  }, [projectId])

  if (projects.isPending) return <Skeleton active paragraph={{ rows: 10 }} />
  if (projects.isError) {
    return (
      <EmptyState
        title="无法加载"
        hint={errText(projects.error)}
        action={<Button onClick={() => void projects.refetch()}>重试</Button>}
      />
    )
  }
  if (!list.length) {
    return (
      <EmptyState
        title="还没有项目"
        hint="先在项目里创建或加入一个项目。"
        action={<Link to="/testing">去项目</Link>}
      />
    )
  }
  if (!routeProjectId && projectId) return <Navigate to={botsHref(projectId, params)} replace />
  if (routeProjectId && !ids.has(routeProjectId)) return <EmptyState title="项目不存在或不可访问" hint="不会自动切换到其他项目。请重新选择项目。" action={<Link to="/bots">选择可用项目</Link>} />
  if (!projectId) return <EmptyState title="无可用项目" action={<Link to="/testing">去项目</Link>} />

  const appId = params.get('appId') || ''
  const collabCase = params.get('collabCase') || ''

  return (
    <div className="bots-page bots-page--full">
      <CollabPanel
        projectId={projectId}
        appId={appId || undefined}
        mode="bots"
        deepLinkCaseId={collabCase}
        deepLinkAppId={appId}
      />
    </div>
  )
}
