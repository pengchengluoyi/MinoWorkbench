export interface ImChannelStatus {
  channel: string
  installed: boolean | null
  running: boolean | null
  process_state: string
  enabled?: boolean | null
  connected: boolean | null
  holding: boolean | null
  connection_state: 'connected' | 'disconnected' | 'pending' | 'unreported' | 'not_installed' | 'disabled' | 'yielded' | 'error'
  connection_verified: boolean
  connection_source?: string
  error: string
  last_message_at: number
  bound?: boolean
}
