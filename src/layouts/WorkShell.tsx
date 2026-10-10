import { useCallback, useState } from 'react'
import { NavLink, Outlet, useMatch, useSearchParams } from 'react-router-dom'
import { Bot, ChevronRight, Cpu, KeyRound, LayoutGrid, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button, ErrorBoundary, Tooltip, UserMenu } from '@/ui'
import { CommandPalette } from './CommandPalette'
import { APP_NAV, SUB_VIEW_DEFAULTS, resolveTab, type Tab } from '@/domains/testing/workbench/nav'
import { useAppDetail } from '@/domains/testing/workbench/queries'

const COLLAPSE_KEY = 'mino.workshell.rail'
const readCollapsed = () => {
  try { return localStorage.getItem(COLLAPSE_KEY) === 'collapsed' } catch { return false }
}

const GLOBAL_NAV = [
  { to: '/assistant', label: '我的助手', icon: Bot },
  { to: '/settings/runtime', label: 'Scout 节点', icon: Cpu },
  { to: '/settings/keys', label: '模型密钥', icon: KeyRound },
]

/**
 * 测试工作台外壳 —— **唯一的左侧导航**。
 *
 * 上一版的问题：外壳有一条左栏，进入应用后 AppWorkbench 又画了一条，
 * 屏幕上出现两条左导航。现在应用内导航嵌进这一条里，整条可折叠。
 */
export function WorkShell() {
  const appMatch = useMatch('/testing/:appId')
  const appId = appMatch?.params.appId || ''
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? 'collapsed' : 'open') } catch { /* 隐私模式 */ }
      return next
    })
  }, [])

  return (
    <div className="flex h-full" style={{ background: 'var(--w-bg)' }}>
      <aside
        className="w-rail flex flex-col shrink-0"
        style={{
          width: collapsed ? 'var(--w-sidebar-collapsed)' : 'var(--w-sidebar-width)',
          background: 'var(--w-surface)',
          borderRight: '1px solid var(--w-border)',
        }}
      >
        <div
          className="flex items-center shrink-0"
          style={{
            height: 52,
            padding: collapsed ? '0' : '0 8px 0 14px',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid var(--w-border)',
          }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 26, height: 26, borderRadius: 7,
                  background: 'var(--w-text)', color: 'var(--w-surface)',
                  fontSize: 10, fontWeight: 800,
                }}
              >
                MW
              </div>
              <strong className="truncate" style={{ fontSize: 'var(--w-font-base)', color: 'var(--w-text)' }}>
                测试工作台
              </strong>
            </div>
          )}
          <Tooltip title={collapsed ? '展开导航' : '折叠导航'} placement="right">
            <Button
              size="small"
              type="text"
              icon={collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
              onClick={toggle}
              aria-label={collapsed ? '展开导航' : '折叠导航'}
              aria-expanded={!collapsed}
            />
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '8px 8px 4px' }}>
          <RailLink to="/testing" end label="应用" icon={LayoutGrid} collapsed={collapsed} />

          {/* 进入某个应用后，应用内导航嵌在「应用」下面——不再另开一条左栏 */}
          {appId && <AppNavBlock appId={appId} collapsed={collapsed} />}

          <div
            style={{
              height: 1,
              background: 'var(--w-border)',
              margin: collapsed ? '8px 4px' : '8px 2px',
            }}
          />

          {GLOBAL_NAV.map((item) => (
            <RailLink key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={collapsed} />
          ))}
        </nav>

        <div
          className="shrink-0"
          style={{ padding: collapsed ? '6px 4px' : '6px 8px', borderTop: '1px solid var(--w-border)' }}
        >
          <UserMenu collapsed={collapsed} />
        </div>
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        {/* 外观入口已并入左下角 UserMenu，顶部那条 48px 的 header 就没必要留了 */}
        <main className="flex flex-1 min-h-0 overflow-hidden" style={{ padding: 'var(--w-space-4)' }}>
          <div className="flex min-h-0 flex-1 flex-col">
            <ErrorBoundary label="页面">
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )

  function AppNavBlock({ appId: id, collapsed: narrow }: { appId: string; collapsed: boolean }) {
    const [params, setParams] = useSearchParams()
    const detail = useAppDetail(id)
    const tab = resolveTab(params.get('tab'))
    const appName = detail.data?.name || params.get('appName') || '应用'

    const go = (next: Tab, sub?: { key: string; value: string }) => {
      const p = new URLSearchParams(params)
      p.set('tab', next)
      if (sub) p.set(sub.key, sub.value)
      setParams(p)
    }
    const goSub = (key: string, value: string) => {
      const p = new URLSearchParams(params)
      p.set(key, value)
      setParams(p, { replace: true })
    }

    const subDefault = SUB_VIEW_DEFAULTS[tab]
    const currentSub = subDefault ? params.get(subDefault.key) || subDefault.value : ''

    return (
      <div style={{ marginTop: 2, paddingLeft: narrow ? 0 : 10 }}>
        {!narrow && (
          <div
            className="truncate"
            style={{
              padding: '4px 9px 6px',
              fontSize: 'var(--w-font-meta)',
              fontWeight: 700,
              color: 'var(--w-text-quaternary)',
              letterSpacing: '0.03em',
            }}
            title={appName}
          >
            {appName}
          </div>
        )}
        {APP_NAV.map((item) => {
          const active = tab === item.id || (item.alsoActiveOn || []).includes(tab)
          const Icon = item.icon
          const btn = (
            <button
              type="button"
              onClick={() => go(item.id)}
              aria-label={item.label}
              data-active={active ? 'true' : 'false'}
              aria-expanded={item.children?.length ? active : undefined}
              className="w-hit flex w-full items-center gap-2"
              style={{
                padding: narrow ? '7px 0' : '6px 9px',
                justifyContent: narrow ? 'center' : 'flex-start',
                marginBottom: 1,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: 'var(--w-radius-sm)',
                fontSize: 'var(--w-font-base)',
                fontWeight: active ? 650 : 600,
                color: active ? 'var(--w-primary)' : 'var(--w-text-secondary)',
              }}
            >
              <Icon size={15} strokeWidth={1.9} />
              {!narrow && <span className="truncate">{item.label}</span>}
              {!narrow && item.children?.length ? (
                <ChevronRight
                  size={13}
                  aria-hidden
                  className="w-fold-chevron"
                  data-open={active ? 'true' : 'false'}
                  style={{ marginLeft: 'auto', color: 'var(--w-text-quaternary)', flexShrink: 0 }}
                />
              ) : null}
            </button>
          )

          return (
            <div key={item.id}>
              {narrow ? <Tooltip title={item.label} placement="right">{btn}</Tooltip> : btn}
              {!narrow && active && item.children?.length ? (
                <div style={{ paddingLeft: 10, marginBottom: 2 }}>
                  {item.children.map((child) => {
                    const on = child.tab ? tab === child.tab : child.param ? currentSub === child.param.value : false
                    return (
                      <button
                        key={child.label}
                        type="button"
                        data-active={on ? 'true' : 'false'}
                        onClick={() => {
                          if (child.tab) go(child.tab, child.param)
                          else if (child.param) goSub(child.param.key, child.param.value)
                        }}
                        className="w-hit flex w-full items-center"
                        style={{
                          padding: '4px 9px',
                          border: 'none',
                          cursor: 'pointer',
                          textAlign: 'left',
                          borderRadius: 'var(--w-radius-sm)',
                          fontSize: 'var(--w-font-sm)',
                          fontWeight: on ? 650 : 600,
                          color: on ? 'var(--w-text)' : 'var(--w-text-tertiary)',
                        }}
                      >
                        <span className="truncate">{child.label}</span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    )
  }
}

function RailLink({
  to,
  label,
  icon: Icon,
  collapsed,
  end,
}: {
  to: string
  label: string
  icon: typeof Cpu
  collapsed: boolean
  end?: boolean
}) {
  const link = (
    <NavLink to={to} end={end} aria-label={label} style={{ textDecoration: 'none' }}>
      {({ isActive }) => (
        <div
          data-active={isActive ? 'true' : 'false'}
          className="w-hit flex items-center gap-2"
          style={{
            padding: collapsed ? '7px 0' : '7px 9px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            marginBottom: 1,
            borderRadius: 'var(--w-radius-sm)',
            fontSize: 'var(--w-font-base)',
            fontWeight: isActive ? 650 : 600,
            color: isActive ? 'var(--w-primary)' : 'var(--w-text-secondary)',
          }}
        >
          <Icon size={15} strokeWidth={1.9} />
          {!collapsed && <span className="truncate">{label}</span>}
        </div>
      )}
    </NavLink>
  )
  return collapsed ? <Tooltip title={label} placement="right">{link}</Tooltip> : link
}
