import { useNavigate } from 'react-router-dom'
import { ChevronUp, LogOut, ShieldCheck } from 'lucide-react'
import { Dropdown } from 'antd'
import { displayName, useSession } from '@/lib/session'
import { isAdmin, roleLabel } from '@/lib/iam'

/**
 * 左下角用户入口。点击上拉。
 *
 * 管理后台入口只对 admin 可见 —— 普通账号不该看到自己进不去的地方。
 * 路由层还有 RequireAdmin 兜底，这里只负责"看不见"。
 */
export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate()
  const { user, role, logout } = useSession()
  const admin = isAdmin(role)
  const name = displayName(user)
  const initial = name.slice(0, 1).toUpperCase()

  const items = [
    { key: 'who', type: 'group' as const, label: `${name} · ${roleLabel(role)}` },
    ...(admin
      ? [
          { type: 'divider' as const, key: 'd1' },
          {
            key: 'admin',
            label: <span className="flex items-center gap-2"><ShieldCheck size={13} /> 管理后台</span>,
          },
        ]
      : []),
    { type: 'divider' as const, key: 'd2' },
    {
      key: 'logout',
      danger: true,
      label: <span className="flex items-center gap-2"><LogOut size={13} /> 退出登录</span>,
    },
  ]

  return (
    <Dropdown
      trigger={['click']}
      placement="topLeft"
      menu={{
        items,
        onClick: async ({ key }) => {
          if (key === 'admin') navigate('/dashboard')
          if (key === 'logout') { await logout(); navigate('/login', { replace: true }) }
        },
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2.5"
        style={{
          padding: collapsed ? '7px 0' : '7px 8px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          border: 'none',
          background: 'transparent',
          borderRadius: 'var(--w-radius-sm)',
          cursor: 'pointer',
          color: 'var(--w-text-secondary)',
        }}
        aria-label="账号菜单"
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 24, height: 24, borderRadius: 'var(--w-radius-pill)',
            background: 'var(--w-primary)', color: '#fff',
            fontSize: 11, fontWeight: 700,
          }}
        >
          {initial}
        </span>
        {!collapsed && (
          <>
            <span
              className="truncate"
              style={{ flex: 1, textAlign: 'left', fontSize: 'var(--w-font-base)', fontWeight: 650 }}
            >
              {name}
            </span>
            <ChevronUp size={13} style={{ color: 'var(--w-text-quaternary)' }} />
          </>
        )}
      </button>
    </Dropdown>
  )
}
