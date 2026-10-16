import * as XLSX from 'xlsx'
import { suggestSkipRows } from './caseImportTable'

export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024
export const MAX_IMPORT_CELLS = 200_000
export const MAPPING_PAGE_SIZE = 100
export interface ImportSheet { name: string; rows: number; columns: number; empty: boolean; merges: number; uncachedFormulas: number }

export function cellText(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value).replace(/_x([0-9A-Fa-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

export function workbookSheets(book: XLSX.WorkBook): ImportSheet[] {
  return book.SheetNames.map((name) => {
    const sheet = book.Sheets[name]
    const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
    const cells = Object.entries(sheet || {}).filter(([key]) => !key.startsWith('!')).map(([, value]) => value as XLSX.CellObject)
    return { name, rows: range ? range.e.r + 1 : 0, columns: range ? range.e.c + 1 : 0, empty: !cells.some(cell => !!cell.f || (cell.v != null && String(cell.v).trim())), merges: sheet?.['!merges']?.length || 0, uncachedFormulas: cells.filter(cell => !!cell.f && cell.v == null).length }
  })
}

export function importSheetGrid(book: XLSX.WorkBook, name: string): string[][] {
  const sheet = book.Sheets[name]
  if (!sheet || !sheet['!ref']) throw new Error('此工作表没有可读取的内容，请选择其他工作表。')
  const end = XLSX.utils.decode_range(sheet['!ref']).e
  if ((end.r + 1) * (end.c + 1) > MAX_IMPORT_CELLS) throw new Error('此工作表范围超过 200,000 个单元格，请拆分工作表或清除远处的无用格式后再导入。当前内容未被截断。')
  // 从A1开始保留空白行，row_index继续使用现有接口的0起编号；UI显示Excel实际行号。
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, blankrows: true, range: { s: { r: 0, c: 0 }, e: end } })
  const grid = raw.map(line => (Array.isArray(line) ? line : []).map(cellText))
  if (!grid.some(line => line.some(cell => cell.trim()))) throw new Error(Object.values(sheet).some(cell => cell && typeof cell === 'object' && 'f' in cell) ? '工作表中没有可读取的公式结果，请在表格软件中重新计算并保存后再导入。' : '工作表是空的，请选择其他工作表。')
  return grid
}

export function resolveSkipRows(table: string[][], headerRow: number, overrides: Record<number, boolean>): number[] {
  const suggested = suggestSkipRows(table, headerRow)
  return table.flatMap((_, index) => index !== headerRow && (overrides[index] ?? suggested.has(index)) ? [index] : [])
}
