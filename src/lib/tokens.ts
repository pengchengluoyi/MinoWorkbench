/** 登录凭证的唯一存取口。别处不许直接碰 localStorage 的这两个 key。 */

import { nexusOrigin } from './config'

const scope = encodeURIComponent(nexusOrigin())
const TOKEN = `mino:${scope}:token`
const WS_TOKEN = `mino:${scope}:ws_token`

const safeGet = (k: string): string | null => {
  try { return localStorage.getItem(k) } catch { return null }
}
const safeSet = (k: string, v: string) => {
  try { localStorage.setItem(k, v) } catch { /* 隐私模式下忽略 */ }
}
const safeDel = (k: string) => {
  try { localStorage.removeItem(k) } catch { /* ignore */ }
}

export const getToken = () => safeGet(TOKEN)
export const setToken = (v: string) => safeSet(TOKEN, v)
export const getWsToken = () => safeGet(WS_TOKEN)
export const setWsToken = (v: string) => safeSet(WS_TOKEN, v)
export const clearTokens = () => { safeDel(TOKEN); safeDel(WS_TOKEN) }
export const hasToken = () => !!getToken()
export const isAuthStorageKey = (key: string | null) => key === TOKEN || key === WS_TOKEN || key === null

/**
 * 从 /auth/login 或 /auth/status 的返回体里落票据。
 *
 * 登录接口本身就下发 token / ws_token，**必须在后续任何请求之前存下来**
 * —— 两个原项目都是 loginAccount() 之后立刻 persistSession(res.data)。
 * 漏掉这一步，紧接着的 /auth/status 就是匿名请求，Nexus 会回 logged_in: false。
 */
export const persistAuthTokens = (data: { token?: string; ws_token?: string } | undefined | null) => {
  if (!data) return
  if (data.token) setToken(data.token)
  if (data.ws_token) setWsToken(data.ws_token)
}

/** Target changes require a fresh login; legacy unscoped keys are never migrated. */
export const prepareAuthTarget = () => {
  const marker = 'mino:auth-target'
  if (safeGet(marker) !== nexusOrigin()) clearTokens()
  safeSet(marker, nexusOrigin())
}
