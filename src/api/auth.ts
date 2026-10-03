import { request } from '@/lib/request'
import type { AuthStatus } from '@/types/auth'

export const getAuthStatus = () => request<AuthStatus>({ url: '/auth/status', method: 'get' })

/** Nexus 同时接受 email 和 username 两个字段，两边原项目都是这么传的。 */
export const loginAccount = (account: string, password: string) => {
  const ident = String(account || '').trim()
  return request<AuthStatus>({
    url: '/auth/login',
    method: 'post',
    data: { email: ident, username: ident, password },
  })
}

export const logoutAccount = () => request({ url: '/auth/logout', method: 'post' })
