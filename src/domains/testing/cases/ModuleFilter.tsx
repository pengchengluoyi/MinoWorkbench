import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Button, Tooltip } from '@/ui'

/**
 * 模块筛选。
 *
 * 原实现把模块树当导航层级用；这里**降级为筛选器** ——
 * 用户的目标是"挑一批用例跑"，模块只是缩小范围的手段，不是目的地。
 */
export function ModuleFilter({
  modules,
  total,
  value,
  onChange,
  collapsed,
  onToggle,
}: {
  modules: { name: string; count: number }[]
  total: number
  value: string
  onChange: (next: string) => void
  collapsed: boolean
  onToggle: () => void
}) {
  if (collapsed) {
    return (
      <aside
        className="shrink-0 flex flex-col items-center"
        style={{ width: 40, borderRight: '1px solid var(--w-border)' }}
      >
        <Tooltip title="展开模块筛选" placement="right">
          <Button
            size="small"
            type="text"
            icon={<PanelLeftOpen size={15} />}
            onClick={onToggle}
            aria-label="展开模块筛选"
            aria-expanded={false}
          />
        </Tooltip>
      </aside>
    )
  }

  return (
    <aside
      className="shrink-0 flex flex-col overflow-y-auto"
      style={{ width: 'clamp(140px, 16%, 220px)', paddingRight: 'var(--w-space-2)', borderRight: '1px solid var(--w-border)' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-text-quaternary)', letterSpacing: '.04em' }}>
          模块
        </span>
        <Tooltip title="折叠模块筛选" placement="right">
          <Button
            size="small"
            type="text"
            icon={<PanelLeftClose size={14} />}
            onClick={onToggle}
            aria-label="折叠模块筛选"
            aria-expanded
          />
        </Tooltip>
      </div>

      <FilterRow label="全部" count={total} active={!value} onClick={() => onChange('')} />
      {[...modules].sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN')).map(({ name, count }) => (
        <FilterRow
          key={name}
          label={name}
          count={count}
          active={value === name}
          onClick={() => onChange(value === name ? '' : name)}
        />
      ))}
    </aside>
  )
}

function FilterRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2"
      style={{
        padding: '5px 8px',
        marginBottom: 1,
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        borderRadius: 'var(--w-radius-sm)',
        background: active ? 'var(--w-primary-soft)' : 'transparent',
        color: active ? 'var(--w-primary)' : 'var(--w-text-secondary)',
        fontSize: 'var(--w-font-sm)',
        fontWeight: active ? 650 : 600,
      }}
    >
      <span className="truncate" title={label}>{label}</span>
      <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', flexShrink: 0 }}>
        {count}
      </span>
    </button>
  )
}
