import { useSearchParams } from 'react-router-dom'
import { EmptyState, Select } from '@/ui'
import { useProjects } from '../apps/queries'
import { DevelopmentPanel } from './DevelopmentPanel'
import { LoginEvidencePolicyPanel } from './LoginEvidencePolicyPanel'

export function ProjectDevelopmentPanel({ projectId, section = 'development' }: { projectId: string; section?: 'development' | 'login' }) {
  const projects = useProjects()
  const apps = projects.data?.find(row => row.id === projectId)?.apps || []
  const [params, setParams] = useSearchParams()
  const requested = params.get('appId') || ''
  const app = requested ? apps.find(row => row.id === requested) : apps.length === 1 ? apps[0] : undefined
  return <div className="flex flex-col h-full min-h-0"><div className="flex items-center gap-3 p-4"><span>{section === 'login' ? '登录校验应用' : '开发应用'}</span><Select aria-label={section === 'login' ? '登录校验应用' : '开发应用'} placeholder="选择要配置的应用" style={{ minWidth: 240 }} value={app?.id} options={apps.map(row => ({ value: row.id, label: row.name || row.id }))} onChange={id => { const next = new URLSearchParams(params); next.set('appId', id); setParams(next) }} /></div>
    {app ? section === 'login' ? <LoginEvidencePolicyPanel key={app.id} appId={app.id} /> : <DevelopmentPanel key={app.id} appId={app.id} platforms={app.platforms} /> : <EmptyState title={apps.length ? '请选择要配置的应用' : '请先在应用管理中创建应用'} hint="应用配置分别保存，切换前请保存当前修改。" />}
  </div>
}
