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
  /** null = 尚未核验；false + confirmationError = 核验暂时失败。 */
  loggedIn: boolean | null
  loading: boolean
  confirmationError: string | null
  refresh: () => Promise<boolean>
  logout: () => Promise<void>
  clear: () => void
  syncFromStorage: () => void
}

const clearAccountState = () => {
  resetAccountRequests()
  void queryClient.cancelQueries()
  queryClient.clear()
  disconnectRealtime()
}

let pendingRefresh: { epoch: number; promise: Promise<boolean> } | null = null

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  role: '',
  loggedIn: hasToken() ? null : false,
  loading: false,
  confirmationError: null,

  refresh: async () => {
    if (!hasToken()) {
      clearAccountState()
      set({ loading: false, loggedIn: false, user: null, role: '', confirmationError: null })
      return false
    }
    const startedEpoch = accountEpoch()
    if (pendingRefresh?.epoch === startedEpoch) return pendingRefresh.promise
    const promise = (async () => {
      set({ loading: true, confirmationError: null })
      try {
        const res = await getAuthStatus()
        if (startedEpoch !== accountEpoch()) return get().loggedIn === true
        const data = res?.data
        if (!data || typeof data.logged_in !== 'boolean' || (data.logged_in && (typeof data.user_id !== 'string' || !data.user_id.trim()))) {
          throw new Error('登录状态返回不完整，暂时无法确认身份。')
        }
        if (!data.logged_in) {
          clearAccountState()
          clearTokens()
          set({ user: null, role: '', loggedIn: false, loading: false, confirmationError: null })
          return false
        }
        if (get().user?.user_id !== data.user_id) clearAccountState()
        persistAuthTokens(data)
        set({ user: data, role: normalizeRole(data.role), loggedIn: true, loading: false, confirmationError: null })
        connectRealtime(data.ws_token)
        return true
      } catch (error) {
        if (startedEpoch !== accountEpoch()) return get().loggedIn === true
        const status = (error as { response?: { status?: number } })?.response?.status
        const expired = status === 401 || status === 403
        clearAccountState()
        if (expired) clearTokens()
        set({ loading: false, loggedIn: false, user: null, role: '', confirmationError: expired ? null : error instanceof Error ? error.message : '登录状态核验失败，请重试。' })
        return false
      }
    })()
    pendingRefresh = { epoch: startedEpoch, promise }
    try { return await promise } finally {
      if (pendingRefresh?.promise === promise) pendingRefresh = null
    }
  },

  logout: async () => {
    clearAccountState()
    const startedEpoch = accountEpoch()
    set({ user: null, role: '', loggedIn: false, loading: false, confirmationError: null })
    try { await logoutAccount() } catch { /* 本地也要退出 */ }
    if (startedEpoch !== accountEpoch()) return
    clearTokens()
    set({ user: null, role: '', loggedIn: false, loading: false, confirmationError: null })
  },

  clear: () => {
    clearAccountState()
    clearTokens()
    set({ user: null, role: '', loggedIn: false, loading: false, confirmationError: null })
  },

  syncFromStorage: () => {
    clearAccountState()
    set({ user: null, role: '', loggedIn: hasToken() ? null : false, loading: false, confirmationError: null })
  },
}))

export const displayName = (u: AuthStatus | null): string =>
  u?.name || u?.username || u?.email || '未登录'
