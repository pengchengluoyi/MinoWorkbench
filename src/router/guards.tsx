import { useEffect, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Spin } from 'antd'
import { useSession } from '@/lib/session'
import { hasToken } from '@/lib/tokens'
import { isAdmin } from '@/lib/iam'

function FullPageSpin({ tip }: { tip?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ minHeight: '60vh' }}>
      <Spin tip={tip} size="large">
        <div style={{ padding: 24 }} />
      </Spin>
    </div>
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
  const { loggedIn, refresh } = useSession()
  const location = useLocation()

  useEffect(() => {
    if (loggedIn === null) void refresh()
  }, [loggedIn, refresh])

  if (loggedIn === null) return <FullPageSpin tip="正在确认登录状态" />

  if (!loggedIn) {
    // Nexus 不可达但本地有票据时放行，避免一断网就被踢出去
    if (hasToken()) return <>{children}</>
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

/** 管理后台要求 admin 角色。普通用户访问 /dashboard 这类路径时跳回测试工作台。 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loggedIn, role } = useSession()

  if (loggedIn === null) return <FullPageSpin tip="正在确认权限" />
  if (loggedIn && !isAdmin(role)) return <Navigate to="/testing" replace />

  return <>{children}</>
}

/** 登录页：已登录就不该再看到它。 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { loggedIn } = useSession()
  if (loggedIn) return <Navigate to="/testing" replace />
  return <>{children}</>
}
