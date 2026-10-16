/** 用例导入：认出列名行、建议跳过的表头、把列对上字段。只给初始建议，用户还能改。 */

export const HEADER_ALIASES: Record<string, string[]> = {
  case_id: ['用例编号', '编号', 'id', 'case_id'],
  name: ['用例名称', '用例名', '名称', '标题', 'name', 'title'],
  module: ['模块', '路径', 'module'],
  platform: ['端', '平台', 'platform'],
  precondition: ['前置', '前置条件', 'precondition'],
  steps: ['步骤', '测试步骤', '操作步骤', '执行步骤', 'steps', 'steps_raw'],
  expected: ['预期', '预期效果', '预期结果', '期望结果', 'expected', 'expected_raw'],
}

export const FIELD_OPTS = [
  { key: 'case_id', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'module', label: '模块' },
  { key: 'platform', label: '端' },
  { key: 'precondition', label: '前置条件' },
  { key: 'steps', label: '测试步骤' },
  { key: 'expected', label: '预期效果' },
]

export const FLAG_LABELS: Record<string, string> = {
  likely_header: '疑似表头行',
  empty_steps: '步骤为空',
  empty_expected: '预期为空',
  likely_duplicate: '与库中已有用例同名',
  ui_not_coverable: '无法 UI 自动化',
  step_key_issues: '步骤密钥待补',
}

const normHeader = (value: unknown) => String(value || '').replace(/\s+/g, '').toLowerCase()

function scoreHeaderRow(row: string[] = []) {
  let score = 0
  for (const cell of row) {
    const key = normHeader(cell)
    if (!key) continue
    for (const aliases of Object.values(HEADER_ALIASES)) {
      if (aliases.some((alias) => normHeader(alias) === key)) score += 1
    }
  }
  return score
}

export function detectHeaderRow(table: string[][], scan = 6) {
  let best = 0
  let bestScore = 0
  const limit = Math.min(scan, table.length)
  for (let i = 0; i < limit; i += 1) {
    const score = scoreHeaderRow(table[i])
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return bestScore >= 2 ? best : 0
}

const SUB_HEADER_RE = /^(ios|android|鸿蒙|web|双端|iphone|ipad)$/i
const REGRESSION_RE = /^(?:第\s*\d+\s*[轮次]\s*)?(?:回归(?:测试)?|测试轮(?:次)?|(?:测试|执行|回归)?结果)(?:\s*[:：#-]?\s*(?:第?\s*\d+\s*[轮次]?|通过|失败|待测|未执行))?$/

export function suggestSkipRows(table: string[][], headerRow = 0) {
  const skip = new Set<number>()
  table.forEach((row, index) => {
    if (index === headerRow) return
    const cells = row.map((cell) => cell.trim()).filter(Boolean)
    if (!cells.length || scoreHeaderRow(row) >= 2) {
      skip.add(index)
      return
    }
    // 只跳过整行都是说明标签的行；真实用例中的‘查看结果’等正文不能触发。
    if (cells.length <= 4 && cells.every(cell => REGRESSION_RE.test(cell) || SUB_HEADER_RE.test(cell))) skip.add(index)
    else if (cells.length <= 3 && cells.every((cell) => SUB_HEADER_RE.test(cell))) skip.add(index)
  })
  return skip
}

export function suggestColumnMap(labels: string[]) {
  const map: Record<string, number> = {}
  labels.forEach((label, index) => {
    const key = normHeader(label)
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] != null) continue
      if (aliases.some((alias) => normHeader(alias) === key)) map[field] = index
    }
  })
  return map
}

export function headerRowLooksValid(labels: string[]) {
  const normalized = labels.map(normHeader)
  let hits = 0
  for (const aliases of Object.values(HEADER_ALIASES)) {
    if (aliases.some((alias) => normalized.includes(normHeader(alias)))) hits += 1
  }
  return hits >= 2
}
