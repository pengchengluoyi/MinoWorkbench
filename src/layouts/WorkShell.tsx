import { useCallback, useState, useSyncExternalStore } from 'react'
import { NavLink, Outlet, useMatch, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Cpu, KeyRound, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react'
import { useSession } from '@/lib/session'
import { Button, Drawer, Dropdown, ErrorBoundary, Tooltip, UserMenu } from '@/ui'
import { CommandPalette } from './CommandPalette'
import { APP_NAV, SUB_VIEW_DEFAULTS, resolveTab, type SubItem, type Tab } from '@/domains/testing/workbench/nav'
import { useProjects } from '@/domains/testing/apps/queries'
import { preloadAppPanel } from '@/domains/testing/workbench/listPrefetch'
import { beginListNavigation } from '@/domains/testing/workbench/performance'
import { BotsNavBlock } from '@/domains/bots/BotsNavBlock'
import './WorkShell.css'

const COLLAPSE_KEY = 'mino.workshell.rail'
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === 'collapsed' } catch { return false }
}
const mobileQuery = '(max-width: 767px)'
const subscribeMobile = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery)
  media.addEventListener('change', notify)
  return () => media.removeEventListener('change', notify)
}
const SETTINGS_NAV = [
  { to: '/settings/runtime', label: 'Scout 节点', icon: Cpu },
  { to: '/settings/keys', label: '模型密钥', icon: KeyRound },
]

export function WorkShell() {
  const location = useLocation()
  const uid = useSession(state => state.user?.user_id || '')
  const projectId = useMatch('/testing/projects/:projectId')?.params.projectId || ''
  const projects = useProjects()
  const projectName = projects.data?.find(project => project.id === projectId)?.name || '当前项目'
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [menuOpen, setMenuOpen] = useState(false)
  const narrow = !mobile && collapsed
  const closeMenu = useCallback(() => setMenuOpen(false), [])
  const toggle = () => setCollapsed(previous => {
    const next = !previous
    try { localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'open') } catch { /* private browsing */ }
    return next
  })
  const navigation = <>
    <div className="work-shell-brand">
      {!narrow && <><span className="work-shell-mark" aria-hidden>MW</span><strong>测试工作台</strong></>}
      {!mobile && <Button size="small" type="text" icon={narrow ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />} onClick={toggle} aria-label={narrow ? '展开导航' : '折叠导航'} aria-expanded={!narrow} />}
    </div>
    <nav aria-label="工作台导航" className="work-shell-links">
      <div className="work-shell-primary-nav"><div className="work-shell-projects-section">
        <RailLink to="/testing" returnHint={projectId ? '返回项目列表' : undefined} end label={projectId ? projectName : '项目'} icon={LayoutGrid} collapsed={narrow} onNavigate={closeMenu} />
        {projectId ? <div className="work-shell-project-list"><ProjectNavBlock projectId={projectId} collapsed={narrow} onNavigate={closeMenu} /></div>
          : !narrow && <ProjectListBlock onNavigate={closeMenu} />}
      </div>
      <div className="work-shell-divider" />
      <BotsNavBlock collapsed={narrow} onExpand={toggle} onNavigate={closeMenu} /></div>
      <div className="work-shell-settings-nav">{SETTINGS_NAV.map(item => <RailLink key={item.to} {...item} collapsed={narrow} onNavigate={closeMenu} />)}</div>
    </nav>
    <div className="work-shell-user"><UserMenu collapsed={narrow} /></div>
  </>
  return <div className="work-shell">
    {mobile ? <Drawer className="work-shell-drawer" title="导航" placement="left" width="min(280px, 90vw)" open={menuOpen} onClose={closeMenu} styles={{ body: { display: 'flex', flexDirection: 'column', padding: 0 } }}>{navigation}</Drawer>
      : <aside className="work-shell-rail" data-collapsed={narrow}>{navigation}</aside>}
    <div className="work-shell-content">
      {mobile && <div className="work-shell-mobile-bar"><Button type="text" icon={<Menu size={20} />} aria-label="打开导航" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} /><strong>测试工作台</strong><UserMenu collapsed /></div>}
      <main id="workbench-content" className={`work-shell-main${location.pathname === '/bots' || location.pathname.startsWith('/bots/') ? ' work-shell-main--conversation' : ''}`}>
        <div className="work-shell-outlet"><ErrorBoundary key={uid} resetKey={location.pathname + location.search} label="工作台"><Outlet /></ErrorBoundary></div>
      </main>
    </div>
    <CommandPalette key={uid} />
  </div>
}

function RailLink({ to, label, icon: Icon, collapsed, end, onNavigate, returnHint }: { returnHint?: string; to: string; label: string; icon: LucideIcon; collapsed: boolean; end?: boolean; onNavigate: () => void }) {
  const link = <NavLink to={to} end={end} onClick={onNavigate} className={({ isActive }) => `work-shell-link w-hit${isActive ? ' is-active' : ''}`} aria-label={label} title={returnHint}><Icon size={17} aria-hidden />{!collapsed && <span>{label}</span>}{returnHint && !collapsed && <span className="work-shell-project-return" aria-hidden="true"><ArrowLeft size={15} /></span>}</NavLink>
  return collapsed ? <Tooltip title={label} placement="right">{link}</Tooltip> : link
}

function ProjectListBlock({ onNavigate }: { onNavigate: () => void }) {
  const projects = useProjects()
  return <div className="work-shell-project-list" role="region" aria-label="项目列表" tabIndex={0}>
    {projects.isPending && <p className="work-shell-nav-hint">正在加载项目…</p>}
    {projects.isError && <div className="work-shell-nav-hint" role="alert">项目加载失败<Button type="text" size="small" onClick={() => void projects.refetch()}>重试</Button></div>}
    {!projects.isPending && !projects.isError && !projects.data?.length && <p className="work-shell-nav-hint">暂无项目</p>}
    {(projects.data || []).map(project => <div key={project.id}>
      <NavLink to={`/testing/projects/${encodeURIComponent(project.id)}`} onClick={onNavigate} className="work-shell-sublink w-hit" title={project.name}>{project.name}</NavLink>
    </div>)}
  </div>
}

function ProjectNavBlock({ projectId, collapsed, onNavigate }: { projectId: string; collapsed: boolean; onNavigate: () => void }) {
  const [params, setParams] = useSearchParams()
  const projects = useProjects()
  const project = projects.data?.find(row => row.id === projectId)
  const selected = params.get('appId')
  const appId = (selected ? project?.apps?.find(app => app.id === selected)?.id : project?.apps?.length === 1 ? project.apps[0].id : '') || ''
  const tab = resolveTab(params.get('tab'))
  const warm = (next: Tab) => {
    const result = params.get('caseResult')
    void preloadAppPanel(appId, next, Number(params.get('taskPage')) || 1, { appId, page: Number(params.get('casePage')) || 1, size: Number(params.get('caseSize')) || 50, search: params.get('caseSearch') || '', module: params.get('caseModule') || '', result: result === 'failed' || result === 'never' ? result : 'all' }, Number(params.get('taskSize')) || 50).catch(() => {})
  }
  const go = (next: Tab, child?: SubItem) => {
    const target = child?.tab || next
    if (target !== tab && (target === 'cases' || target === 'tasks')) beginListNavigation(appId, target)
    const query = new URLSearchParams(params)
    query.set('tab', target)
    if (target !== tab) for (const key of ['case', 'run', 'session', 'tcase', 'unit']) query.delete(key)
    if (child?.param) query.set(child.param.key, child.param.value)
    setParams(query)
    onNavigate()
  }
  const defaults = SUB_VIEW_DEFAULTS[tab]
  let sub = defaults ? params.get(defaults.key) || defaults.value : ''
  if (tab === 'config' && ['environment', 'development', 'login-evidence'].includes(sub)) sub = 'apps'
  return <div className="work-shell-project-nav">
    {APP_NAV.map(item => {
      const active = tab === item.id || !!item.alsoActiveOn?.includes(tab)
      const Icon = item.icon
      const button = <button type="button" className={`work-shell-link w-hit${active ? ' is-active' : ''}`} aria-label={item.label} aria-current={active && !item.children?.length ? 'page' : undefined} onClick={() => go(item.id)} onMouseEnter={() => warm(item.id)} onFocus={() => warm(item.id)}><Icon size={17} aria-hidden />{!collapsed && <span>{item.label}</span>}</button>
      return <div key={item.id}>
        {collapsed && item.children?.length ? <Dropdown trigger={['click']} placement="bottomLeft" menu={{ items: item.children.map((child, index) => ({ key: String(index), label: child.label })), onClick: ({ key }) => go(item.id, item.children?.[Number(key)]) }}><button type="button" className={`work-shell-link w-hit${active ? ' is-active' : ''}`} aria-label={item.label}><Icon size={17} aria-hidden /></button></Dropdown>
          : collapsed ? <Tooltip title={item.label} placement="right">{button}</Tooltip> : button}
        {!collapsed && active && item.children?.length ? <div className="work-shell-subnav" role="group" aria-label={`${item.label}分类`}>
          {item.children.map(child => {
            const current = child.tab ? tab === child.tab : child.param?.value === sub
            return <button type="button" key={child.label} className={`work-shell-sublink w-hit${current ? ' is-active' : ''}`} aria-current={current ? 'page' : undefined} onClick={() => go(item.id, child)}>{child.label}</button>
          })}
        </div> : null}
      </div>
    })}
  </div>
}
