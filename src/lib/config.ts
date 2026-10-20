/**
 * Nexus 接入配置。
 *
 * 铁律（开发手册 §4）：生产使用 location.origin；开发使用 Vite proxy 或 VITE_NEXUS_URL。
 * Nexus 启动时自己注册这个域名。不做 IP 选择器，不写死 IP，不做地址探测。
 */

const DEFAULT_NEXUS = import.meta.env.DEV ? 'http://127.0.0.1:50101' : 'http://mino.local:50104'
declare global {
  interface Window { __MINO_CONFIG__?: { nexusUrl: string; buildId: string } }
}
const runtimeOrigin = (): string | undefined => {
  const value = window.__MINO_CONFIG__?.nexusUrl
  if (value === undefined) return undefined
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Workbench 运行地址配置无效')
  }
  if (import.meta.env.DEV) {
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '50101') {
      throw new Error('开发 Workbench 只能连接本机 Nexus :50101')
    }
    return url.origin
  }
  // A loopback deployment target means Nexus runs on the Workbench host.
  if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    url.hostname = window.location.hostname
  }
  return url.origin
}



export const nexusOrigin = (): string => {
  if (!import.meta.env.DEV) return window.location.origin
  const runtime = runtimeOrigin()
  if (runtime !== undefined) return runtime
  const baked = String(import.meta.env.VITE_NEXUS_URL || '').trim().replace(/\/$/, '')
  const target = baked || DEFAULT_NEXUS
  if (import.meta.env.DEV) {
    const url = new URL(target)
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.port !== '50101') {
      throw new Error('开发 Workbench 只能连接本机 Nexus :50101')
    }
  }
  return target
}

/** dev 下未显式指定 origin 时走 vite proxy（同源，免 CORS）。 */
export const usesDevProxy = (): boolean => {
  if (runtimeOrigin() !== undefined || import.meta.env.VITE_NEXUS_URL) return false
  return import.meta.env.DEV
}

export const getBaseUrl = (): string => (usesDevProxy() ? '' : nexusOrigin())

export const getWsUrl = (): string => {
  if (usesDevProxy()) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws`
  }
  const origin = nexusOrigin()
  if (origin.startsWith('https://')) return `wss://${origin.slice(8)}/ws`
  if (origin.startsWith('http://')) return `ws://${origin.slice(7)}/ws`
  return `ws://${origin}/ws`
}

export const CLIENT_NAME = import.meta.env.VITE_MINO_CLIENT || 'workbench'
