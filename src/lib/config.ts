/**
 * Nexus 接入配置。
 *
 * D3：生产 origin 来自启动器注入的运行配置；开发地址必须显式提供。
 * Nexus 启动时自己注册这个域名。不做 IP 选择器，不写死 IP，不做地址探测。
 */

declare global { interface Window { __MINO_DEV_TARGET__?: string } }
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
  return url.origin
}



export const nexusOrigin = (): string => {
  const runtime = runtimeOrigin()
  if (runtime !== undefined) return runtime
  if (import.meta.env.DEV) {
    const target = window.__MINO_DEV_TARGET__ || import.meta.env.VITE_NEXUS_URL
    if (!target) throw new Error('开发环境缺少显式 Nexus 地址，请重新启动开发服务')
    return new URL(target).origin
  }
  throw new Error('缺少 Workbench 运行配置，请使用独立启动器提供的地址。')
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
