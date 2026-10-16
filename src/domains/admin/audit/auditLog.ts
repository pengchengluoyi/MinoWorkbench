/**
 * 操作记录。沿用 MinoConsole 的设计：只记本浏览器本次会话里真实发生的管理操作，
 * 不编造历史，也不上报 Nexus（Nexus 侧没有这个接口）。
 */
import { useSession } from '@/lib/session'
const key = () => `mino.workbench.audit.${useSession.getState().user?.user_id || 'unknown'}`
const MAX = 200

export interface AuditRow {
  t: number
  action: string
  detail: string
}

const read = (): AuditRow[] => {
  try {
    const raw = sessionStorage.getItem(key())
    const rows = raw ? JSON.parse(raw) : []
    return Array.isArray(rows) ? rows : []
  } catch { return [] }
}

const write = (rows: AuditRow[]) => {
  try { sessionStorage.setItem(key(), JSON.stringify(rows.slice(0, MAX))) } catch { /* quota */ }
}

export const recordAudit = (action: string, detail = ''): AuditRow => {
  const row: AuditRow = {
    t: Date.now(),
    action: String(action || '').trim() || '操作',
    detail: String(detail || '').trim(),
  }
  write([row, ...read()])
  window.dispatchEvent(new Event('mino:audit'))
  return row
}

export const listAudit = read
export const clearAudit = () => write([])
