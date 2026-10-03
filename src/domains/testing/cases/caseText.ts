export interface NumberedLine {
  num: number
  text: string
}

const stripPrefix = (s: string) => s.replace(/^\s*\d+\s*[.、．)）]\s*/, '').trim()

/**
 * 把用例的步骤 / 预期拆成带编号的行。
 *
 * 可能的输入形态（都来自 Nexus，历史上变过）：
 *   - string[]                     ['打开应用', '点登录']
 *   - string「1. xxx\n2. yyy」      保留原文编号，允许跳号（1/3/4）
 *   - string 单行无编号
 *   - {num, text}[] 已结构化
 *
 * 保留原文编号是刻意的：和后端的 parse_numbered_items 对齐，
 * 用例里写 1/3/4 跳号时不能被前端重新编号，否则和预期对不上。
 */
export function splitNumbered(value: unknown): NumberedLine[] {
  if (!value) return []

  if (Array.isArray(value)) {
    if (!value.length) return []
    // 已结构化
    if (typeof value[0] === 'object' && value[0] !== null && 'text' in (value[0] as object)) {
      return (value as NumberedLine[])
        .map((r, i) => ({ num: Number(r.num) || i + 1, text: String(r.text || '').trim() }))
        .filter((r) => r.text)
    }
    return (value as unknown[])
      .map((t, i) => ({ num: i + 1, text: stripPrefix(String(t ?? '')) }))
      .filter((r) => r.text)
  }

  const raw = String(value).trim()
  if (!raw) return []

  const re = /(?:^|\n)\s*(\d+)\s*[.、．)）]\s*/g
  const marks = [...raw.matchAll(re)]

  if (!marks.length) {
    // 没有编号：按换行拆，自己编号
    const parts = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean)
    return parts.map((text, i) => ({ num: i + 1, text }))
  }

  const out: NumberedLine[] = []
  marks.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < marks.length ? marks[i + 1].index ?? raw.length : raw.length
    const text = raw.slice(start, end).trim()
    if (text) out.push({ num: Number(m[1]) || i + 1, text })
  })
  return out
}
