/** 登录凭证的唯一存取口。别处不许直接碰 localStorage 的这两个 key。 */

const TOKEN = 'token'
const WS_TOKEN = 'ws_token'

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
