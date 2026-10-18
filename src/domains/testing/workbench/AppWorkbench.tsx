import { Navigate, useParams, useSearchParams, Link } from 'react-router-dom'
import { EmptyState, Skeleton, errText } from '@/ui'
import { useAppDetail } from './queries'
import { projectHref } from './projectNavigation'

export function AppWorkbench({ configuration = false }: { configuration?: boolean }) {
  const { appId = '' } = useParams()
  const [params] = useSearchParams()
  const detail = useAppDetail(appId)
  if (detail.isPending) return <Skeleton active />
  if (detail.isError || !detail.data?.project_id) return <EmptyState title="无法定位所属项目" hint={errText(detail.error, '原应用不存在或未关联项目。')} action={<Link to="/testing">返回项目列表</Link>} />
  const query = new URLSearchParams(params)
  query.set('appId', appId)
  if (configuration) query.set('tab', 'config')
  if (query.get('tab') === 'config' && !query.has('configView')) query.set('configView', 'environment')
  return <Navigate replace to={projectHref(detail.data.project_id, query)} />
}

export function ProjectConfigurationRedirect() {
  const { projectId = '' } = useParams()
  return <Navigate replace to={projectHref(projectId, { tab: 'config', configView: 'environment' })} />
}
