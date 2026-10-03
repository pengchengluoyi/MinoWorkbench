import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from 'antd'
import {
  LayoutDashboard, Activity, FolderTree, Cpu, NotebookTabs, KeyRound, Share2,
  Lock, FileClock, Sparkles, ListChecks, Users, Layers, Package, GitBranch,
  BookCheck, Link2, FlaskConical,
} from 'lucide-react'
import { AppearanceMenu, ErrorBoundary, UserMenu } from '@/ui'
import { getServerInfo } from '@/api/me'

/** 导航分组沿用 MinoConsole 的 5 组 16 项，顺序和文案不动。 */
const GROUPS = [
  {
    id: 'overview', label: '概览', items: [
      { to: '/dashboard', label: '工作台', icon: LayoutDashboard },
      { to: '/health', label: '运行状态', icon: Activity },
    ],
  },
  {
    id: 'inventory', label: '库存', items: [
      { to: '/catalog', label: '项目与应用', icon: FolderTree },
      { to: '/nodes', label: '节点与设备', icon: Cpu },
      { to: '/account-pool-templates', label: '号池模板', icon: NotebookTabs },
      { to: '/case-resource-key', label: '用例密钥', icon: KeyRound },
      { to: '/resource-transition-rules', label: '转移规则', icon: Share2 },
    ],
  },
  {
    id: 'perms', label: '权限', items: [
      { to: '/permissions', label: '权限配置', icon: Lock },
      { to: '/audit', label: '操作记录', icon: FileClock },
    ],
  },
  {
    id: 'caps', label: '能力', items: [
      { to: '/skills', label: '技能', icon: Sparkles },
      { to: '/jobs', label: 'Jobs', icon: ListChecks },
      { to: '/roles', label: '角色', icon: Users },
      { to: '/stack', label: '编排', icon: Layers },
      { to: '/packs', label: '扩展包', icon: Package },
      { to: '/flow-blocks', label: 'FSM 逻辑块', icon: GitBranch },
      { to: '/knowledge', label: '知识审核', icon: BookCheck },
    ],
  },
  {
    id: 'system', label: '系统', items: [
      { to: '/network', label: '网络 / 内网域名', icon: Link2 },
    ],
  },
]

export function AdminLayout() {
  const navigate = useNavigate()

  // 30 秒一次的 Nexus 连通性，用 Query 的 refetchInterval，不自己写 setInterval
  const { data: info, isError } = useQuery({
    queryKey: ['sys', 'server_info'],
    queryFn: getServerInfo,
    refetchInterval: 30_000,
    retry: false,
  })

  const nexusText = isError
    ? '无法连接'
    : info?.data?.version
      ? `Nexus ${info.data.version}`
      : 'Nexus 已连接'

  return (
    <div className="flex h-full" style={{ background: 'var(--w-bg)' }}>
      <aside
        className="flex flex-col shrink-0"
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
              background: 'var(--w-primary)', color: '#fff',
              fontSize: 11, fontWeight: 800,
            }}
          >
            MW
          </div>
          <div className="min-w-0">
            <strong style={{ display: 'block', fontSize: 'var(--w-font-base)', color: 'var(--w-text)' }}>
              管理后台
            </strong>
            <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
              Mino Workbench
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto" style={{ padding: '10px 8px' }}>
          {GROUPS.map((group) => (
            <div key={group.id} style={{ marginBottom: 14 }}>
              <div
                style={{
                  padding: '0 8px 6px',
                  fontSize: 'var(--w-font-meta)',
                  fontWeight: 700,
                  color: 'var(--w-text-quaternary)',
                  letterSpacing: '0.04em',
                }}
              >
                {group.label}
              </div>
              {group.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} style={{ textDecoration: 'none' }}>
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
            </div>
          ))}
        </nav>

        <div style={{ padding: 8, borderTop: '1px solid var(--w-border)' }}>
          <Button
            block
            size="small"
            type="text"
            icon={<FlaskConical size={14} />}
            onClick={() => navigate('/testing')}
            style={{ justifyContent: 'flex-start', fontWeight: 600, marginBottom: 4 }}
          >
            去测试工作台
          </Button>
          <UserMenu />
        </div>
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
          <span
            className="w-pill"
            data-status={isError ? 'fail' : 'pass'}
          >
            {nexusText}
          </span>

          <div className="flex items-center gap-1">
            <AppearanceMenu />
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
