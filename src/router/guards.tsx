import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Button, Spin } from '@/ui'
import { useSession } from '@/lib/session'
import { hasToken } from '@/lib/tokens'
import { isAdmin } from '@/lib/iam'
import { AuthShell } from '@/domains/auth/AuthShell'

function Confirming({ onLeave }: { onLeave: () => void }) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <AuthShell>
      <div className="flex items-center gap-3">
        <Spin />
        <div>
          <h1 style={{ margin: 0, fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)' }}>
            正在确认登录状态
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)', lineHeight: 'var(--w-line-relaxed)' }}>
            {slow
              ? 'Nexus 还没有回应。可以停在这里再等几秒，或清掉本地票据去登录。'
              : '本地有票据，正在向 Nexus 核对是不是还有效。'}
          </p>
        </div>
      </div>
      {slow && (
        <Button type="default" style={{ marginTop: 16 }} onClick={onLeave}>
          去登录
        </Button>
      )}
    </AuthShell>
  )
}

function ConfirmationFailed({ message, loading, onRetry, onLeave }: { message: string; loading: boolean; onRetry: () => void; onLeave: () => void }) {
  return <AuthShell>
    <h1 style={{ margin: 0, fontSize: 'var(--w-font-h2)', color: 'var(--w-text)' }}>暂时无法确认登录状态</h1>
    <p role="alert" style={{ color: 'var(--w-text-secondary)', lineHeight: 'var(--w-line-relaxed)', overflowWrap: 'anywhere' }}>{message}</p>
    <p style={{ color: 'var(--w-text-tertiary)' }}>本地凭证已保留。连接恢复后可以重新核验。</p>
    <div className="flex gap-2"><Button type="primary" loading={loading} onClick={onRetry}>重新核验</Button><Button onClick={onLeave}>去登录</Button></div>
  </AuthShell>
}

/** 只有 Nexus 明确确认的身份可以进入受保护页面。 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loggedIn, loading, confirmationError, refresh, clear } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (loggedIn === null) void refresh()
  }, [loggedIn, refresh])

  if (loggedIn === null) return <Confirming onLeave={clear} />
  if (!loggedIn && hasToken() && (confirmationError || loading)) return <ConfirmationFailed message={confirmationError || '正在重新核验身份…'} loading={loading} onRetry={() => void refresh()} onLeave={clear} />
  if (!loggedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <>{children}</>
}

/** 管理页面必须有已确认的管理员身份，不能依据本地票据放行。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loggedIn, role, clear } = useSession()
  if (loggedIn === null) return <Confirming onLeave={clear} />
  if (loggedIn !== true) return <Navigate to="/login" replace />
  if (!isAdmin(role)) return <Navigate to="/testing" replace />
  return <>{children}</>
}

/** 登录页：已登录就不该再看到它。 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loggedIn } = useSession()
  if (loggedIn) return <Navigate to="/testing" replace />
  return <>{children}</>
}
