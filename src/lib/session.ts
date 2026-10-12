import { create } from 'zustand'
import { accountEpoch, resetAccountRequests } from './accountEpoch'
import { getAuthStatus, logoutAccount } from '@/api/auth'
import { clearTokens, hasToken, persistAuthTokens } from '@/lib/tokens'
import { normalizeRole } from '@/lib/iam'
import type { AuthStatus } from '@/types/auth'
import { queryClient } from '@/lib/queryClient'
import { connectRealtime, disconnectRealtime } from '@/lib/realtime'

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

const clearAccountState = () => {
  resetAccountRequests()
  void queryClient.cancelQueries()
  queryClient.clear()
  disconnectRealtime()
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  role: '',
  // 没有票据就不必打 /auth/status。Nexus 不可达时那次请求会挂很久，
  // 门禁会一直停在「正在确认登录状态」。
  loggedIn: hasToken() ? null : false,
  loading: false,

  refresh: async () => {
    if (!hasToken()) {
      clearAccountState()
      set({ loading: false, loggedIn: false, user: null, role: '' })
      return false
    }
    const startedEpoch = accountEpoch()
    set({ loading: true })
    try {
      const res = await getAuthStatus()
      if (startedEpoch !== accountEpoch()) return get().loggedIn === true
      const data = res?.data || {}
      // /auth/status 也会顺带下发票据，刷新一下
      persistAuthTokens(data)
      const ok = data.logged_in !== false
      if (get().user?.user_id !== (ok ? data.user_id : undefined)) clearAccountState()
      set({ user: ok ? data : null, role: normalizeRole(data.role), loggedIn: ok, loading: false })
      if (ok) connectRealtime(data.ws_token)
      return ok
    } catch {
      if (startedEpoch !== accountEpoch()) return get().loggedIn === true
      clearAccountState()
      set({ loading: false, loggedIn: false, user: null, role: '' })
      return false
    }
  },

  logout: async () => {
    clearAccountState()
    const startedEpoch = accountEpoch()
    set({ user: null, role: '', loggedIn: false })
    try { await logoutAccount() } catch { /* 本地也要清掉 */ }
    if (startedEpoch !== accountEpoch()) return
    clearTokens()
    set({ user: null, role: '', loggedIn: false })
  },

  clear: () => {
    clearAccountState()
    clearTokens()
    set({ user: null, role: '', loggedIn: false })
  },
}))

export const displayName = (u: AuthStatus | null): string =>
  u?.name || u?.username || u?.email || '未登录'
