import { create } from 'zustand'
import { getAuthStatus, logoutAccount } from '@/api/auth'
import { clearTokens, hasToken, persistAuthTokens } from '@/lib/tokens'
import { normalizeRole } from '@/lib/iam'
import type { AuthStatus } from '@/types/auth'

interface SessionState {
  user: AuthStatus | null
  role: string
  /** null = 本地有票据、还没向 Nexus 核对；true/false = 已有结论 */
  loggedIn: boolean | null
  loading: boolean
  refresh: () => Promise<boolean>
  logout: () => Promise<void>
  clear: () => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  role: '',
  // 没有票据就不必打 /auth/status。Nexus 不可达时那次请求会挂很久，
  // 门禁会一直停在「正在确认登录状态」。
  loggedIn: hasToken() ? null : false,
  loading: false,

  refresh: async () => {
    if (!hasToken()) {
      set({ loading: false, loggedIn: false, user: null, role: '' })
      return false
    }
    set({ loading: true })
    try {
      const res = await getAuthStatus()
      const data = res?.data || {}
      // /auth/status 也会顺带下发票据，刷新一下
      persistAuthTokens(data)
      const ok = data.logged_in !== false
      set({ user: ok ? data : null, role: normalizeRole(data.role), loggedIn: ok, loading: false })
      return ok
    } catch {
      set({ loading: false, loggedIn: false, user: null, role: '' })
      return false
    }
  },

  logout: async () => {
    try { await logoutAccount() } catch { /* 本地也要清掉 */ }
    clearTokens()
    set({ user: null, role: '', loggedIn: false })
  },

  clear: () => {
    clearTokens()
    set({ user: null, role: '', loggedIn: false })
  },
}))

export const displayName = (u: AuthStatus | null): string =>
  u?.name || u?.username || u?.email || '未登录'
