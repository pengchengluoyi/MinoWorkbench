/**
 * Nexus 接入配置。
 *
 * 铁律（开发手册 §4）：origin 只来自 VITE_NEXUS_URL，默认 mino.local:10104。
 * Nexus 启动时自己注册这个域名。不做 IP 选择器，不写死 IP，不做地址探测。
 */

const DEFAULT_NEXUS = 'http://mino.local:10104'

export const nexusOrigin = (): string => {
  const baked = String(import.meta.env.VITE_NEXUS_URL || '').trim().replace(/\/$/, '')
  return baked || DEFAULT_NEXUS
}

/** dev 下未显式指定 origin 时走 vite proxy（同源，免 CORS）。 */
export const usesDevProxy = (): boolean => {
  if (import.meta.env.VITE_NEXUS_URL) return false
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
