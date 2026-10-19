import type { ImportPreviewRow } from '@/api/projectCases'
import type { ImportReceipt } from './caseImportReceipt'

export type ImportRecovery = {
  version: 1
  owner: string
  projectId: string
  updatedAt: number
  phase: 'preview' | 'committing' | 'result'
  token: string
  requestId?: string
  fileName: string
  sheetName: string
  requirementId: string
  platform: string
  decisions: { row_index: number; selected: boolean; on_conflict: string }[]
  receipt?: ImportReceipt
}

export const importRecoveryKey = (owner: string, projectId: string) => `mino.import-recovery.v1:${encodeURIComponent(owner)}:${encodeURIComponent(projectId)}`

export function decodeImportRecovery(raw: string | null, owner: string, projectId: string, now = Date.now()): ImportRecovery | null {
  if (!raw || raw.length > 2_000_000 || !owner || !projectId) return null
  try {
    const value = JSON.parse(raw) as ImportRecovery
    if (!value || value.version !== 1 || value.owner !== owner || value.projectId !== projectId) return null
    if (!Number.isFinite(value.updatedAt) || now - value.updatedAt > 86_400_000 || value.updatedAt > now + 60_000) return null
    if (!['preview', 'committing', 'result'].includes(value.phase) || typeof value.token !== 'string') return null
    if (value.requestId != null && (typeof value.requestId !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(value.requestId))) return null
    if (!['fileName', 'sheetName', 'requirementId', 'platform'].every(key => typeof value[key] === 'string')) return null
    if (!Array.isArray(value.decisions) || !value.decisions.every(item => Number.isSafeInteger(item?.row_index) && item.row_index >= 0 && typeof item.selected === 'boolean' && ['skip', 'overwrite'].includes(item.on_conflict))) return null
    if (value.phase === 'preview' && !value.token) return null
    if (value.receipt) {
      const receipt = value.receipt
      if (!['received', 'unknown'].includes(receipt.state) || typeof receipt.receivedAt !== 'string' || !receipt.source || !receipt.counts) return null
      if (!['fileName', 'sheetName', 'requirement', 'platform'].every(key => typeof receipt.source[key] === 'string')) return null
      if (!['created', 'updated', 'skipped', 'blocked', 'failed'].every(key => receipt.counts[key] == null || Number.isSafeInteger(receipt.counts[key]) && receipt.counts[key] >= 0)) return null
      if (receipt.error != null && typeof receipt.error !== 'string') return null
      if (!Array.isArray(receipt.lines) || !receipt.lines.every(line => line && typeof line.id === 'string' && typeof line.title === 'string' && typeof line.status === 'string' && typeof line.decision === 'string')) return null
      if (!receipt.lines.every(line => (line.rowIndex == null || Number.isSafeInteger(line.rowIndex) && line.rowIndex >= 0) && ['reason', 'inputCaseId', 'savedCaseId'].every(key => line[key] == null || typeof line[key] === 'string'))) return null
      if (!Array.isArray(receipt.warnings) || !receipt.warnings.every(item => typeof item === 'string')) return null
    }
    if (value.phase === 'result' && !value.receipt) return null
    return value
  } catch { return null }
}

export function restoreImportDecisions(rows: ImportPreviewRow[], record: ImportRecovery): ImportPreviewRow[] {
  const decisions = new Map(record.decisions.map(item => [item.row_index, item]))
  return rows.map(row => {
    const decision = decisions.get(row.row_index)
    return decision ? { ...row, selected: decision.selected, on_conflict: decision.on_conflict } : row
  })
}


export type StoredImportRecovery = { key: string; record: ImportRecovery }

/** Legacy single-record entries remain readable; new tasks have separate identities. */
export function readImportRecoveries(storage: Storage, owner: string, projectId: string): StoredImportRecovery[] {
  const base = importRecoveryKey(owner, projectId)
  const keys = [base]
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith(`${base}:task:`)) keys.push(key)
  }
  return keys.flatMap(key => {
    const record = decodeImportRecovery(storage.getItem(key), owner, projectId)
    return record ? [{ key, record }] : []
  }).sort((a, b) => b.record.updatedAt - a.record.updatedAt)
}

export function importRecoveryTaskKey(record: ImportRecovery): string {
  const identity = record.token || record.requestId
  if (!identity) throw new Error('导入恢复记录缺少任务标识')
  return `${importRecoveryKey(record.owner, record.projectId)}:task:${encodeURIComponent(identity)}`
}
