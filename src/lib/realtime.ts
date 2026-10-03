import { getWsUrl } from './config'
import { getToken, getWsToken, setWsToken } from './tokens'

/**
 * Nexus 实时通道（原 MinoStudio `api/mWebSocket.js`）。
 *
 * 搬过来时修掉了原实现的三个问题：
 * 1. 原版 `console.log('Connecting WS:', url)` 把带 token 的完整 URL 打进控制台
 *    —— 凭证泄漏到日志。这里只打脱敏后的地址。
 * 2. 原版连上后会向 Electron 宿主派一个 renderer-ws-connected 事件 —— 残留，删掉。
 * 3. 原版断线后 `setInterval(..., 3000)` 定频重连，Nexus 挂着时会一直打。
 *    这里改成指数退避（1s 起，上限 30s），且页面隐藏时不重连。
 */

type Listener = (msg: RealtimeMessage) => void

export interface RealtimeMessage {
  req_id?: string
  action?: string
  code?: number
  [key: string]: unknown
}

export type RealtimeState = 'closed' | 'connecting' | 'open'

let ws: WebSocket | null = null
let listeners: Listener[] = []
let stateListeners: ((s: RealtimeState) => void)[] = []
const pending = new Map<string, { resolve: (v: RealtimeMessage) => void; reject: (e: unknown) => void }>()

let reconnectTimer: number | null = null
let reconnectAttempt = 0
let currentToken = ''
let state: RealtimeState = 'closed'
let openWaiters: (() => void)[] = []

const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000

const setState = (next: RealtimeState) => {
  if (state === next) return
  state = next
  stateListeners.forEach((fn) => { try { fn(next) } catch { /* 单个订阅者出错不影响其他 */ } })
}

export const realtimeState = () => state

export const onRealtimeState = (fn: (s: RealtimeState) => void) => {
  stateListeners.push(fn)
  return () => { stateListeners = stateListeners.filter((f) => f !== fn) }
}

/** 日志里不带 token。排查连接问题只需要知道连的是哪个地址。 */
const safeUrl = (url: string) => url.replace(/([?&]token=)[^&]*/i, '$1<redacted>')

const scheduleReconnect = () => {
  if (reconnectTimer != null) return
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS)
  reconnectAttempt += 1
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    // 页面在后台时不重连，等用户切回来
    if (document.visibilityState === 'hidden') {
      scheduleReconnect()
      return
    }
    connectRealtime()
  }, delay)
}

export const connectRealtime = (token?: string) => {
  if (token) {
    currentToken = token
    setWsToken(token)
  } else if (!currentToken) {
    currentToken = getWsToken() || getToken() || ''
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

  const base = getWsUrl()
  const url = currentToken ? `${base}?token=${encodeURIComponent(currentToken)}` : base

  setState('connecting')
  ws = new WebSocket(url)

  ws.onopen = () => {
    reconnectAttempt = 0
    setState('open')
    const waiters = openWaiters
    openWaiters = []
    waiters.forEach((fn) => { try { fn() } catch { /* noop */ } })
  }

  ws.onmessage = (event) => {
    let msg: RealtimeMessage
    try {
      msg = JSON.parse(event.data)
    } catch {
      console.warn('[realtime] 收到非 JSON 消息，已忽略')
      return
    }

    // 请求-响应配对
    if (msg.req_id && pending.has(msg.req_id)) {
      const entry = pending.get(msg.req_id)!
      pending.delete(msg.req_id)
      if (msg.code === 200) entry.resolve(msg)
      else entry.reject(msg)
    }

    listeners.forEach((fn) => { try { fn(msg) } catch (e) { console.error('[realtime] 订阅者出错', e) } })
  }

  ws.onclose = () => {
    setState('closed')
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    console.warn('[realtime] 连接出错：', safeUrl(url))
    ws?.close()
  }
}

export const disconnectRealtime = () => {
  if (reconnectTimer != null) { clearTimeout(reconnectTimer); reconnectTimer = null }
  reconnectAttempt = 0
  currentToken = ''
  const socket = ws
  ws = null
  setState('closed')
  if (!socket) return
  try { socket.onclose = null; socket.close() } catch { /* noop */ }
}

export const reconnectRealtime = (token?: string) => { disconnectRealtime(); connectRealtime(token) }

/** 订阅所有消息。返回退订函数——务必在 effect cleanup 里调用。 */
export const onRealtimeMessage = (fn: Listener) => {
  if (!listeners.includes(fn)) listeners.push(fn)
  return () => { listeners = listeners.filter((l) => l !== fn) }
}

export const whenRealtimeReady = (timeout = 4_000) =>
  new Promise<void>((resolve, reject) => {
    if (ws && ws.readyState === WebSocket.OPEN) return resolve()
    const timer = window.setTimeout(() => reject(new Error('实时通道未连接')), timeout)
    openWaiters.push(() => { clearTimeout(timer); resolve() })
    connectRealtime()
  })

/** 走 WebSocket 的请求-响应。爬图这类长任务单独给超时。 */
export const sendRealtime = (
  action: string,
  data: Record<string, unknown> = {},
  options: { timeout?: number } = {},
) =>
  new Promise<RealtimeMessage>((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('实时通道未连接'))
      return
    }

    const reqId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
    const timeoutMs = options.timeout ?? (action === 'app_graph/crawl' ? 3_600_000 : 10_000)

    const timer = window.setTimeout(() => {
      if (pending.has(reqId)) {
        pending.delete(reqId)
        reject(new Error(`${action} 超时`))
      }
    }, timeoutMs)

    pending.set(reqId, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })

    ws.send(JSON.stringify({ req_id: reqId, action, ...data }))
  })
