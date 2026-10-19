import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, Drawer, Dropdown, EmptyState, Skeleton, Space, errText } from '@/ui'
import { useProjects } from '../apps/queries'
import { CreateDialog } from '../apps/CreateDialog'
import { formatPlatformTags } from '@/constants/appPlatforms'
import { EnvironmentSettings } from './EnvConfigPanel'
import { DevelopmentPanel } from './DevelopmentPanel'
import { LoginEvidencePolicyPanel } from './LoginEvidencePolicyPanel'
import './ConfigWorkspace.css'

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
    if (nextSection === 'runtime') query.delete('appConfig'); else query.set('appConfig', nextSection)
    setParams(query)
  }
  const manageEnvironment = () => { const query = new URLSearchParams(params); query.set('configView', 'environment'); setParams(query) }
  const environmentPanel = <Drawer title="项目环境" open={legacySection === 'environment'} width="min(960px, 100vw)" onClose={() => navigate(requested)} destroyOnHidden styles={{ body: { display: 'flex', flexDirection: 'column', minHeight: 0 } }}><EnvironmentSettings key={projectId} projectId={projectId} /></Drawer>
  if (projects.isPending) return <Skeleton active />
  if (projects.isError || !project) return <EmptyState title="无法读取项目应用" hint={errText(projects.error)} />
  if (requested && !app) return <EmptyState title="该应用不属于当前项目或已不存在" action={<Button onClick={() => navigate('')}>返回应用列表</Button>} />
  if (app) return <section className="config-workspace config-workspace--fill">
    <header className="config-workspace-heading"><div><h1>{app.name}</h1><p>{formatPlatformTags(app.platforms).join(' · ')} · 应用运行配置</p></div><Space wrap><Button onClick={() => navigate('')}>应用列表</Button><Button onClick={manageEnvironment}>项目环境</Button><Dropdown trigger={['click']} menu={{ items: [{ key: 'login', label: '登录校验设置' }, { key: 'development', label: '开发联动设置' }], onClick: ({ key }) => navigate(app.id, key) }}><Button>高级设置</Button></Dropdown></Space></header>
    <div className="project-panel-content"><EnvironmentSettings key={app.id} projectId={projectId} application={app} /></div>
    <Drawer title={section === 'development' ? '开发联动设置' : '登录校验设置'} width="min(960px, 100vw)" open={section === 'development' || section === 'login'} onClose={() => navigate(app.id)} destroyOnHidden>
      {section === 'development' ? <DevelopmentPanel key={app.id} appId={app.id} platforms={app.platforms} /> : section === 'login' ? <LoginEvidencePolicyPanel key={app.id} appId={app.id} /> : null}
    </Drawer>
    {environmentPanel}
  </section>
  return <section className="config-workspace config-workspace--fill">
    <header className="config-workspace-heading"><div><h1>应用与环境</h1><p>选择应用，维护运行参数和使用环境。</p></div><Space wrap><Button onClick={manageEnvironment}>项目环境</Button><Button type="primary" onClick={() => setCreating(true)}>新建应用</Button></Space></header>
    <div className="config-page-body">{!(project.apps || []).length ? <EmptyState title="项目中还没有应用" hint="添加应用后即可维护运行配置。" />
      : <div className="w-surface-card">{project.apps!.map(row => <div key={row.id} className="config-app-row"><div className="config-stack"><strong>{row.name || '未命名应用'}</strong><span className="config-secondary">{formatPlatformTags(row.platforms).join(' · ')}{row.description ? ` · ${row.description}` : ''}</span></div><Button onClick={() => navigate(row.id)}>配置</Button></div>)}</div>}</div>
    {environmentPanel}
    <CreateDialog target={creating ? { kind: 'app', projects: [{ id: project.id, name: project.name || '当前项目' }] } : null} onClose={() => setCreating(false)} />
  </section>
}
