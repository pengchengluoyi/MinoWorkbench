import type { ReactNode } from 'react'
import { Activity, Boxes, FolderTree } from 'lucide-react'

/**
 * 落地页概览数字。
 *
 * 这是 stat tile 不是图表：数字用文本 token，不穿系列色；
 * 「执行中」这种状态语义必须同时给图标和文字，不能只靠颜色区分。
 */
export function StatRow({
  projects,
  apps,
  running,
}: {
  projects: number
  apps: number
  running: number
}) {
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--w-space-3)' }}
    >
      <Tile icon={<FolderTree size={14} strokeWidth={2} />} label="项目" value={projects} />
      <Tile icon={<Boxes size={14} strokeWidth={2} />} label="应用" value={apps} />
      <Tile
        icon={<Activity size={14} strokeWidth={2} />}
        label="执行中"
        value={running}
        /* 有执行中才上状态色，并且图标 + 文字都在，不靠颜色单独表意 */
        accent={running > 0 ? 'var(--w-running)' : undefined}
        note={running > 0 ? '批次正在跑' : '当前空闲'}
      />
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: ReactNode
  label: string
  value: number
  note?: string
  accent?: string
}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-xl)',
        minWidth: 0,
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{
          fontSize: 'var(--w-font-sm)',
          fontWeight: 650,
          color: accent || 'var(--w-text-tertiary)',
          marginBottom: 8,
        }}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div
        style={{
          fontSize: 'var(--w-font-stat)',
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.035em',
          /* 数字穿文本 token，不穿状态色 */
          color: 'var(--w-text)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 6, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
          {note}
        </div>
      )}
    </div>
  )
}
