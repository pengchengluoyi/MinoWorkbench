import { create } from 'zustand'
import { getAuthStatus, logoutAccount } from '@/api/auth'
import { clearTokens, persistAuthTokens } from '@/lib/tokens'
import { normalizeRole } from '@/lib/iam'
import type { AuthStatus } from '@/types/auth'

interface SessionState {
  user: AuthStatus | null
  role: string
  /** null = 还没查过；true/false = 查过了 */
  loggedIn: boolean | null
  loading: boolean
  refresh: () => Promise<boolean>
  logout: () => Promise<void>
  clear: () => void
}

export const useSession = create<SessionState>((set) => ({
  user: null,
  role: '',
  loggedIn: null,
  loading: false,

  refresh: async () => {
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
