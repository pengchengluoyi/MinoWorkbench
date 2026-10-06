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

/**
 * 登录门禁。
 *
 * 原两个项目各写了一份 router.beforeEach，逻辑还不一致
 * （Studio 401 时若本地有 token 就放行，Console 同样条件下也放行但多一层角色校验）。
 * 这里只留一份：状态未知先探测，探测失败但本地有票据则放行（容忍 Nexus 短暂不可达）。
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { loggedIn, refresh, clear } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (loggedIn === null) void refresh()
  }, [loggedIn, refresh])

  if (loggedIn === null) return <Confirming onLeave={clear} />

  if (!loggedIn) {
    // Nexus 不可达但本地有票据时放行，避免一断网就被踢出去
    if (hasToken()) return <>{children}</>
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/** 管理后台要求 admin 角色。普通用户访问 /dashboard 这类路径时跳回测试工作台。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loggedIn, role, clear } = useSession()

  if (loggedIn === null) return <Confirming onLeave={clear} />
  if (loggedIn && !isAdmin(role)) return <Navigate to="/testing" replace />

  return <>{children}</>
}

/** 登录页：已登录就不该再看到它。 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loggedIn } = useSession()
  if (loggedIn) return <Navigate to="/testing" replace />
  return <>{children}</>
}
