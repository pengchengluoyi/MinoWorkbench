export interface NumberedLine {
  num: number
  text: string
}

export interface Clause {
  verb: string
  param: string
  skip: boolean
}

const VERBS = ['文案检查', '样式检查', '弹窗检查', '点击', '输入', '滑动', '拖拽', '长按']

/** 一句里按逗号拆成先后执行的点。动词是事件，后面的词是参数。 */
export function markClauses(text: string): Clause[] {
  const parts = text.split(/[，,；;]/).map((part) => part.trim()).filter(Boolean)
  const source = parts.length ? parts : [text.trim()].filter(Boolean)
  return source.map((part) => {
    const skip = /无法执行|无法自动/.test(part)
    const clean = part.replace(/无法执行|无法自动/g, '').trim()
    const verb = VERBS.find((item) => clean.startsWith(item)) || ''
    const param = (verb ? clean.slice(verb.length) : clean).trim()
    return { verb, param: param || clean, skip }
  })
}

/**
 * 导入结果有时把同一步拆成多行，行首都是同一个编号。
 * 先按编号收回一句，预览才能在这句话里面标 1、2、3，而不是变成两个「1」。
 */
export function scriptSource(value: unknown): unknown {
  if (!Array.isArray(value) || !value.length || typeof value[0] === 'object') return value
  const groups = new Map<number, string[]>()
  let implicit = 1
  for (const item of value) {
    const text = String(item ?? '').trim()
    if (!text) continue
    const mark = text.match(/^\s*(\d+)\s*[.、．)）]?\s*/)
    const num = mark ? Number(mark[1]) : implicit++
    const body = (mark ? text.slice(mark[0].length) : text).trim()
    if (!body) continue
    const list = groups.get(num) || []
    list.push(body)
    groups.set(num, list)
  }
  if (!groups.size) return value
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, parts]) => `${num}. ${parts.join('，')}`)
}

/** 前置条件常写成「登录态：未登录」。冒号前是名，后面是值。 */
export function conditionPair(text: string): { label: string; value: string } {
  const matched = text.match(/^(.+?)[：:]\s*(.+)$/)
  if (!matched) return { label: '', value: text }
  return { label: matched[1].trim(), value: matched[2].trim() }
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
