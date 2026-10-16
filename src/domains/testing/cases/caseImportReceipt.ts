import type { ImportCommitData, ImportPreviewRow } from '@/api/projectCases'
import { importDecision } from './caseUnderstanding'

export type ImportReceiptLine = {
  id: string; rowIndex?: number; title: string; inputCaseId?: string; savedCaseId?: string
  status: string; reason?: string; decision: string
}
export type ImportReceipt = {
  state: 'received' | 'unknown'; receivedAt: string
  receiptId?: string; requestId?: string; pending?: number; durable?: boolean
  source: { fileName: string; sheetName: string; requirement: string; platform: string }
  counts: { created?: number; updated?: number; skipped?: number; blocked?: number; failed?: number }
  lines: ImportReceiptLine[]; error?: string; warnings: string[]
}
const safeCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
export const isWritten = (status: string) => status === 'created' || status === 'updated'
export const needsReceiptAttention = (line: ImportReceiptLine) => !isWritten(line.status) && line.status !== 'excluded' && !(line.status === 'skipped' && line.decision === 'skip' && !line.reason)
export const receiptStatusLabel = (status: string) => ({ created: '已新增', updated: '已更新', skipped: '服务端跳过', blocked: '未写入', failed: '准备失败，未写入', pending: '待提交', preparing: '提交准备中', excluded: '本次未选中', unreported: '逐行结果未报告', unknown: '写入结果未知' } as Record<string, string>)[status] || `未识别状态：${status}`
export const receiptReasonLabel = (reason?: string) => ({ missing_platform: '缺少用例平台', step_key_issues: '步骤解析仍有待处理项', import_target_changed: '目标版本已变化，请重新预览后决定覆盖', preparation_interrupted: '准备过程已中断，请新建预览；没有自动重复解析', import_row_invalid: '提交行无法处理，请核对原文后新建预览' } as Record<string, string>)[reason || ''] || reason || ''

export function buildImportReceipt(rows: ImportPreviewRow[], source: ImportReceipt['source'], data?: ImportCommitData, error?: string): ImportReceipt {
  const responses = (Array.isArray(data?.results) ? data.results : []).map(item => {
    const result = item && typeof item === 'object' ? item : {}
    return { ...result, row_index: safeCount(result.row_index), case_id: typeof result.case_id === 'string' ? result.case_id : undefined, reason: typeof result.reason === 'string' ? result.reason : undefined }
  })
  const inputs = new Map(rows.map(row => [row.row_index, row]))
  const lines: ImportReceiptLine[] = responses.map((result, index) => {
    const input = inputs.get(result.row_index)
    return {
      id: `result-${index}`, rowIndex: result.row_index,
      title: String(input?.title || input?.name || (result.row_index != null ? `Excel 第 ${result.row_index + 1} 行` : '服务端未返回来源行')),
      inputCaseId: input?.case_id, savedCaseId: result.case_id,
      status: typeof result.status === 'string' && result.status ? result.status : 'unreported', reason: result.reason,
      decision: input ? importDecision(input) : 'unreported',
    }
  })
  for (const row of rows) {
    if (responses.some(result => result.row_index === row.row_index)) continue
    const decision = importDecision(row)
    lines.push({ id: `input-${row.row_index}`, rowIndex: row.row_index, title: String(row.title || row.name || row.case_id || `Excel 第 ${row.row_index + 1} 行`), inputCaseId: row.case_id, decision,
      status: decision === 'excluded' ? 'excluded' : data ? 'unreported' : 'unknown' })
  }
  lines.sort((a, b) => (a.rowIndex ?? Infinity) - (b.rowIndex ?? Infinity))
  const counts = { created: safeCount(data?.created), updated: safeCount(data?.updated), skipped: safeCount(data?.skipped), blocked: safeCount(data?.blocked), failed: safeCount(data?.failed) }
  const warnings: string[] = []
  if (data && lines.some(line => line.status === 'unreported')) warnings.push('服务端未返回部分行的结果。汇总数量不能用于推测这些行是否写入，请核对用例列表。')
  if (responses.length && ['created', 'updated', 'blocked', 'failed'].some(key => counts[key] != null && counts[key] !== responses.filter(row => row.status === key).length)) warnings.push('服务端汇总与逐行结果数量不一致，已保留实际返回，需核对列表。')
  if (new Set(responses.map(row => row.row_index)).size < responses.length) warnings.push('服务端对同一来源行返回了多条结果，请核对实际用例；结果未被静默合并。')
  return { state: data ? 'received' : 'unknown', receivedAt: new Date().toISOString(), source, counts, lines, error, warnings,
    receiptId: data?.receipt_id, requestId: data?.client_request_id, pending: safeCount(data?.pending), durable: !!data?.receipt_id }
}

export function downloadImportReceipt(receipt: ImportReceipt) {
  const document = { ...receipt, note: receipt.durable ? '这是服务端持久导入收据的投影。可凭提交身份重新查询；未知项不自动重复提交。' : '这是本次浏览器收到的结果；尚未确认服务端持久收据，需查询提交身份。' }
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json;charset=utf-8' }))
  const link = window.document.createElement('a')
  link.href = url; link.download = `mino-import-result-${receipt.receivedAt.replace(/[:.]/g, '-')}.json`
  link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
