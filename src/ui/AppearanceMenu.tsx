import { Dropdown, Button } from 'antd'
import { Monitor, Moon, Rows3, Rows4, Sun, SlidersHorizontal } from 'lucide-react'
import { useAppearance } from '@/hooks/useAppearance'

/** 外观：深浅色 + 密度两档（手册 §7.5）。 */
export function AppearanceMenu() {
  const { theme, setTheme, density, setDensity } = useAppearance()

  const items = [
    { key: 'g1', type: 'group' as const, label: '主题' },
    { key: 'light', label: <span className="flex items-center gap-2"><Sun size={13} /> 浅色</span> },
    { key: 'dark', label: <span className="flex items-center gap-2"><Moon size={13} /> 深色</span> },
    { key: 'system', label: <span className="flex items-center gap-2"><Monitor size={13} /> 跟随系统</span> },
    { type: 'divider' as const, key: 'd1' },
    { key: 'g2', type: 'group' as const, label: '密度' },
    { key: 'comfortable', label: <span className="flex items-center gap-2"><Rows3 size={13} /> 舒适</span> },
    { key: 'compact', label: <span className="flex items-center gap-2"><Rows4 size={13} /> 紧凑</span> },
  ]

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items,
        selectedKeys: [theme, density],
        onClick: ({ key }) => {
          if (key === 'light' || key === 'dark' || key === 'system') setTheme(key)
          if (key === 'comfortable' || key === 'compact') setDensity(key)
        },
      }}
    >
      <Button size="small" type="text" icon={<SlidersHorizontal size={15} />} aria-label="外观设置" />
    </Dropdown>
  )
}
