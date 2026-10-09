import { useNavigate } from 'react-router-dom'
import { ChevronUp, FlaskConical, LogOut, Monitor, Moon, Rows3, Rows4, ShieldCheck, Sun } from 'lucide-react'
import { Dropdown } from 'antd'
import { displayName, useSession } from '@/lib/session'
import { isAdmin, roleLabel } from '@/lib/iam'
import { useAppearance } from '@/hooks/useAppearance'

/**
 * 左下角用户入口。点击上拉，含主题、密度、平台切换、退出登录。
 *
 * 人在测试工作台时，管理员看到「去管理后台」。
 * 人已经在管理后台时，同一位置变成「去测试工作台」，不再指向当前所在的后台。
 * 管理后台只对 admin 可见。路由层的 RequireAdmin 继续兜底。
 *
 * 外观设置并进这里之后，右上角那条只放一个图标的 header 就可以删掉，
 * 每页净赚 48px 垂直空间。
 */
export function UserMenu({ collapsed = false, place = 'testing' }: { collapsed?: boolean; place?: 'testing' | 'admin' }) {
  const navigate = useNavigate()
  const { user, role, logout } = useSession()
  const { theme, setTheme, density, setDensity } = useAppearance()
  const admin = isAdmin(role)
  const name = displayName(user)
  const initial = name.slice(0, 1).toUpperCase()
  const switchItem = place === 'admin'
    ? { key: 'testing', label: <Row icon={<FlaskConical size={13} />} text="去测试工作台" /> }
    : admin
      ? { key: 'admin', label: <Row icon={<ShieldCheck size={13} />} text="去管理后台" /> }
      : null

  const items = [
    { key: 'who', type: 'group' as const, label: `${name} · ${roleLabel(role)}` },

    { type: 'divider' as const, key: 'd0' },
    { key: 'g-theme', type: 'group' as const, label: '主题' },
    { key: 'theme:light', label: <Row icon={<Sun size={13} />} text="浅色" on={theme === 'light'} /> },
    { key: 'theme:dark', label: <Row icon={<Moon size={13} />} text="深色" on={theme === 'dark'} /> },
    { key: 'theme:system', label: <Row icon={<Monitor size={13} />} text="跟随系统" on={theme === 'system'} /> },

    { type: 'divider' as const, key: 'd1' },
    { key: 'g-density', type: 'group' as const, label: '密度' },
    { key: 'density:comfortable', label: <Row icon={<Rows3 size={13} />} text="舒适" on={density === 'comfortable'} /> },
    { key: 'density:compact', label: <Row icon={<Rows4 size={13} />} text="紧凑" on={density === 'compact'} /> },

    ...(switchItem
      ? [
          { type: 'divider' as const, key: 'd2' },
          switchItem,
        ]
      : []),

    { type: 'divider' as const, key: 'd3' },
    { key: 'logout', danger: true, label: <Row icon={<LogOut size={13} />} text="退出登录" /> },
  ]

  return (
    <Dropdown
      trigger={['click']}
      placement="topLeft"
      menu={{
        items,
        onClick: async ({ key }) => {
          if (key.startsWith('theme:')) return setTheme(key.slice(6) as any)
          if (key.startsWith('density:')) return setDensity(key.slice(8) as any)
          if (key === 'admin') return navigate('/dashboard')
          if (key === 'testing') return navigate('/testing')
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
        aria-label="账号与外观设置"
      >
        <span
          className="flex items-center justify-center shrink-0"
          style={{
            width: 24, height: 24, borderRadius: 'var(--w-radius-pill)',
            background: 'var(--w-primary)', color: '#fff', fontSize: 11, fontWeight: 700,
          }}
        >
          {initial}
        </span>
        {!collapsed && (
          <>
            <span className="truncate" style={{ flex: 1, textAlign: 'left', fontSize: 'var(--w-font-base)', fontWeight: 650 }}>
              {name}
            </span>
            <ChevronUp size={13} style={{ color: 'var(--w-text-quaternary)' }} />
          </>
        )}
      </button>
    </Dropdown>
  )
}

function Row({ icon, text, on }: { icon: React.ReactNode; text: string; on?: boolean }) {
  return (
    <span className="flex items-center gap-2" style={{ fontWeight: on ? 700 : 500 }}>
      {icon}
      <span>{text}</span>
      {on && <span style={{ marginLeft: 'auto', color: 'var(--w-primary)', fontWeight: 800 }}>·</span>}
    </span>
  )
}
