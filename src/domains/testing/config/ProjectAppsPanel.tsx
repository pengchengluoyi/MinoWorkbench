import { Drawer } from 'antd'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, EmptyState, Segmented, Skeleton, errText } from '@/ui'
import { useProjects } from '../apps/queries'
import { CreateDialog } from '../apps/CreateDialog'
import { formatPlatformTags } from '@/constants/appPlatforms'
import { EnvironmentSettings } from './EnvConfigPanel'
import { DevelopmentPanel } from './DevelopmentPanel'
import { LoginEvidencePolicyPanel } from './LoginEvidencePolicyPanel'

export function ProjectAppsPanel({ projectId, legacySection }: { projectId: string; legacySection?: string }) {
  const projects = useProjects()
  const project = projects.data?.find(row => row.id === projectId)
  const [creating, setCreating] = useState(false)
  const [params, setParams] = useSearchParams()
  const requested = params.get('appId') || ''
  const app = project?.apps?.find(row => row.id === requested)
  const section = (legacySection === 'environment' ? undefined : legacySection) || params.get('appConfig') || 'runtime'
  const navigate = (appId: string, nextSection = 'runtime') => {
    const query = new URLSearchParams(params)
    query.set('configView', 'apps')
    if (appId) query.set('appId', appId); else query.delete('appId')
    query.set('appConfig', nextSection)
    setParams(query)
  }
  const environmentOpen = legacySection === 'environment'
  const manageEnvironment = () => { const query = new URLSearchParams(params); query.set('configView', 'environment'); setParams(query) }
  const environmentPanel = <Drawer title="管理项目环境" open={environmentOpen} width="min(960px, 100vw)" onClose={() => navigate(requested, section)} destroyOnClose><p>在这里维护环境名称、顺序和默认项，所有应用共同使用。</p><div style={{ height: 'calc(100% - 48px)', minHeight: 360 }}><EnvironmentSettings key={projectId} projectId={projectId} /></div></Drawer>
  if (projects.isPending) return <Skeleton active />
  if (projects.isError || !project) return <EmptyState title="无法读取项目应用" hint={errText(projects.error)} />
  if (requested && !app) return <EmptyState title="该应用不属于当前项目或已不存在" action={<Button onClick={() => navigate('')}>返回应用列表</Button>} />
  if (app) return <section className="flex flex-col h-full min-h-0 gap-3">
    <div className="flex flex-wrap items-center gap-3"><Button onClick={() => navigate('')}>返回应用列表</Button><h2 style={{ margin: 0 }}>{app.name}</h2><span className="flex-1" /><Button onClick={manageEnvironment}>管理环境</Button><span>{formatPlatformTags(app.platforms).join(' · ')}</span></div>
    <Segmented aria-label="应用配置分类" value={section} onChange={value => navigate(app.id, String(value))} options={[{ value: 'runtime', label: '运行参数' }, { value: 'development', label: 'IDE 联动（可选）' }, { value: 'login', label: '登录校验' }]} />
    <div className="flex flex-col min-h-0 flex-1 overflow-auto">
      {section === 'development' ? <DevelopmentPanel key={app.id} appId={app.id} platforms={app.platforms} /> : section === 'login' ? <LoginEvidencePolicyPanel key={app.id} appId={app.id} /> : <EnvironmentSettings key={app.id} projectId={projectId} application={app} />}
    </div>
    {environmentPanel}
  </section>
  return <section className="space-y-4 overflow-auto p-4">
    <div className="flex flex-wrap gap-3 items-center justify-between"><div><h2>应用与环境</h2><p>选择应用设置运行参数；环境只需统一维护一次。</p></div><div className="flex flex-wrap gap-2"><Button onClick={manageEnvironment}>管理环境</Button><Button type="primary" onClick={() => setCreating(true)}>新建应用</Button></div></div>
    {!(project.apps || []).length ? <EmptyState title="项目中还没有应用" hint="创建应用后，平台与环境配置都从该应用进入。" />
      : <div className="w-surface-card">{project.apps!.map(row => <div key={row.id} className="flex flex-wrap items-center gap-3 p-4" style={{ borderBottom: '1px solid var(--w-border)' }}><strong>{row.name || '未命名应用'}</strong><span>{formatPlatformTags(row.platforms).join(' · ')}</span><span className="flex-1 truncate">{row.description}</span><Button onClick={() => navigate(row.id)}>配置应用</Button></div>)}</div>}
    {environmentPanel}
    <CreateDialog target={creating ? { kind: 'app', projects: [{ id: project.id, name: project.name || '当前项目' }] } : null} onClose={() => setCreating(false)} />
  </section>
}
