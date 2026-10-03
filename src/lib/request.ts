import axios, { type AxiosRequestConfig } from 'axios'
import { CLIENT_NAME, getBaseUrl } from './config'
import { clearTokens, getToken, hasToken } from './tokens'

/**
 * Nexus 统一返回信封：业务数据在 .data 里。
 * 拦截器已把 axios 的 response.data 脱掉一层，所以这里拿到的就是信封本体。
 */
export interface NexusEnvelope<T = unknown> {
  data?: T
  message?: string
  [key: string]: unknown
}

const service = axios.create({
  baseURL: getBaseUrl(),
  timeout: 60_000,
})

/**
 * 401 不一定是真掉线（可能是单个接口没权限），所以先问一次 /auth/status。
 * 并发的 401 共用同一次探测，避免打出一串请求。
 */
let sessionProbe: Promise<boolean> | null = null
const sessionReallyGone = async (): Promise<boolean> => {
  if (!hasToken()) return true
  if (sessionProbe) return sessionProbe
  sessionProbe = (async () => {
    try {
      const res = await service.get<any>('/auth/status')
      return !(res as any)?.data?.logged_in
    } catch {
      return false
    } finally {
      sessionProbe = null
    }
  })()
  return sessionProbe
}

/**
 * 掉线处理。原项目里 request.js 反向 import 了 studioNav / mWebSocket，
 * 形成循环依赖；这里改成派事件，由 App 层监听后做清理和跳转。
 */
const kickToLogin = () => {
  clearTokens()
  window.dispatchEvent(new CustomEvent('mino:unauthorized'))
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

service.interceptors.request.use((config) => {
  config.baseURL = getBaseUrl()
  config.headers.set('X-Mino-Client', CLIENT_NAME)
  const token = getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

service.interceptors.response.use(
  (response) => {
    /**
     * 兜底：拿到 HTML 说明这个路径没走到 Nexus
     * （dev 下漏配 vite proxy 前缀，或生产部署的 history fallback 吃掉了接口路径）。
     * 不拦的话调用方会拿到一个字符串当数据用，症状是"请求成功但字段全是 undefined"，极难查。
     */
    const ct = String(response.headers?.['content-type'] || '')
    if (ct.includes('text/html')) {
      throw new Error(
        `${response.config?.url} 返回了 HTML 而不是 JSON —— 这个路径没有转发到 Nexus。`
        + '检查 vite.config.ts 的 NEXUS_PREFIXES 是否包含该前缀。',
      )
    }
    return response.data
  },
  async (error) => {
    const status = error?.response?.status
    const url = String(error?.config?.url || '')
    const skipAuth = /\/auth\/(login|register|send-code|status)/.test(url)
    if (status === 401 && !skipAuth && (await sessionReallyGone())) {
      kickToLogin()
    }
    return Promise.reject(error)
  },
)

/** 业务层统一用这个，返回的是 Nexus 信封。 */
export const request = <T = unknown>(config: AxiosRequestConfig) =>
  service(config) as unknown as Promise<NexusEnvelope<T>>

/** 只要信封里的 data，省掉每处 `res?.data`。 */
export const requestData = async <T = unknown>(config: AxiosRequestConfig): Promise<T> => {
  const res = await request<T>(config)
  return res?.data as T
}

export default service
