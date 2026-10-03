export interface AuthStatus {
  logged_in?: boolean
  user_id?: string
  username?: string
  name?: string
  email?: string
  role?: string
  token?: string
  ws_token?: string
  capabilities?: Record<string, unknown>
}

export interface ServerInfo {
  version?: string
  service?: string
  nexus_version?: string
}

export interface HealthInfo {
  nodes?: number
  nodes_alive?: number
  nexus_version?: string
  status?: string
  [key: string]: unknown
}

/** 字段按 Nexus 0.1.22 的 /sys/runtime 实测返回体定义，不靠猜。 */
export interface RuntimeEndpoint {
  name?: string
  url?: string
  /** 实测返回的是 online 布尔，不是 status 字符串 */
  online?: boolean
  status?: string
}

export interface RuntimeNodeSummary {
  role?: string
  connected?: boolean
  is_master?: boolean
  node_count?: number
  nodes_alive?: number
}

export interface RuntimeStatus {
  endpoints?: RuntimeEndpoint[]
  /** 顶层也有一份 node_count；nodes_alive 只在 node 里 */
  node_count?: number
  nodes_alive?: number
  node?: RuntimeNodeSummary
  nexus_version?: string
  lan_host?: string
  http_url?: string
  [key: string]: unknown
}
