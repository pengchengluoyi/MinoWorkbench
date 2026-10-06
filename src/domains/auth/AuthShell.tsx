import type { ReactNode } from 'react'
import { nexusOrigin } from '@/lib/config'

/** 登录和「正在确认」共用这一块，避免确认态缩成一个会把字拆开的转圈。 */
export function AuthShell({ children }: { children: ReactNode }) {
  const host = nexusOrigin().replace(/^https?:\/\//, '')

  return (
    <div className="flex h-full items-center justify-center" style={{ padding: 24, background: 'var(--w-bg)' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          padding: '28px 28px 20px',
          background: 'var(--w-surface)',
          border: '1px solid var(--w-border)',
          borderRadius: 'var(--w-radius-xl)',
          boxShadow: 'var(--w-shadow)',
        }}
      >
        <div className="flex items-center gap-3" style={{ marginBottom: 22 }}>
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: 'var(--w-text)',
              color: 'var(--w-text-inverse)',
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            MW
          </div>
          <div className="min-w-0">
            <strong style={{ display: 'block', fontSize: 'var(--w-font-title)', color: 'var(--w-text)', fontWeight: 700 }}>
              Mino Workbench
            </strong>
            <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
              测试工作台
            </span>
          </div>
        </div>
        {children}
        <p style={{ margin: '18px 0 0', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
          Nexus · {host}
        </p>
      </div>
    </div>
  )
}
