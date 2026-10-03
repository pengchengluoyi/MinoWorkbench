import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button, Dropdown } from 'antd'
import { Cpu, KeyRound, LayoutGrid, LogOut, PhoneCall, Plug, Settings2, ShieldCheck } from 'lucide-react'
import { AppearanceMenu, ErrorBoundary } from '@/ui'
import { displayName, useSession } from '@/lib/session'
import { isAdmin, roleLabel } from '@/lib/iam'

/**
 * 测试工作台外壳。
 *
 * 信息架构按手册 §7.3 重做：左侧是细窄的功能导航，主区交给页面自己，
 * 不再像原 AppShell 那样"11 个 tab + 二级 board"两层平铺。
 * 应用内的 tab 由 /testing/:appId 自己管（阶段 4）。
 */
const NAV = [
  { to: '/testing', label: '应用', icon: LayoutGrid, end: true },
  { to: '/settings/runtime', label: 'Scout 节点', icon: Cpu },
  { to: '/settings/dispatch', label: '调用记录', icon: PhoneCall },
  { to: '/settings/plugins', label: '插件', icon: Plug },
  { to: '/settings/keys', label: '模型密钥', icon: KeyRound },
]

export function WorkShell() {
  const navigate = useNavigate()
  const { user, role, logout } = useSession()

  return (
    <div className="flex h-full" style={{ background: 'var(--w-bg)' }}>
      <aside
        className="flex flex-col shrink-0 items-stretch"
        style={{
          width: 'var(--w-sidebar-width)',
          background: 'var(--w-surface)',
          borderRight: '1px solid var(--w-border)',
        }}
      >
        <div
          className="flex items-center gap-3 shrink-0"
          style={{ height: 56, padding: '0 14px', borderBottom: '1px solid var(--w-border)' }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--w-text)', color: 'var(--w-surface)',
              fontSize: 11, fontWeight: 800,
            }}
          >
            MW
          </div>
          <div className="min-w-0">
            <strong style={{ display: 'block', fontSize: 'var(--w-font-base)', color: 'var(--w-text)' }}>
              测试工作台
            </strong>
            <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
              Mino Workbench
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 8px' }}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div
                  className="flex items-center gap-2.5"
                  style={{
                    padding: '7px 9px',
                    marginBottom: 1,
                    borderRadius: 'var(--w-radius-sm)',
                    fontSize: 'var(--w-font-base)',
                    fontWeight: isActive ? 650 : 600,
                    color: isActive ? 'var(--w-primary)' : 'var(--w-text-secondary)',
                    background: isActive ? 'var(--w-primary-soft)' : 'transparent',
                  }}
                >
                  <Icon size={15} strokeWidth={1.9} />
                  <span className="truncate">{label}</span>
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {isAdmin(role) && (
          <div style={{ padding: 8, borderTop: '1px solid var(--w-border)' }}>
            <Button
              block
              size="small"
              type="text"
              icon={<ShieldCheck size={14} />}
              onClick={() => navigate('/dashboard')}
              style={{ justifyContent: 'flex-start', fontWeight: 600 }}
            >
              去管理后台
            </Button>
          </div>
        )}
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="flex items-center justify-between gap-3 shrink-0"
          style={{
            height: 'var(--w-header-height)',
            padding: '0 16px',
            borderBottom: '1px solid var(--w-border)',
            background: 'var(--w-surface)',
          }}
        >
          <div className="min-w-0 flex items-center gap-2">
            <Settings2 size={14} style={{ color: 'var(--w-text-quaternary)' }} />
            <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)', fontWeight: 600 }}>
              测试
            </span>
          </div>
          <div className="flex items-center gap-1">
            <AppearanceMenu />
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              menu={{
                items: [
                  { key: 'who', type: 'group', label: `${displayName(user)} · ${roleLabel(role)}` },
                  { type: 'divider', key: 'd' },
                  {
                    key: 'logout',
                    danger: true,
                    label: <span className="flex items-center gap-2"><LogOut size={13} /> 退出登录</span>,
                  },
                ],
                onClick: async ({ key }) => {
                  if (key === 'logout') { await logout(); navigate('/login', { replace: true }) }
                },
              }}
            >
              <Button size="small" type="text" style={{ fontWeight: 650 }}>
                {displayName(user)}
              </Button>
            </Dropdown>
          </div>
        </header>

        <main className="flex-1 overflow-auto" style={{ padding: 'var(--w-space-5)', minHeight: 0 }}>
          <ErrorBoundary label="页面">
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
