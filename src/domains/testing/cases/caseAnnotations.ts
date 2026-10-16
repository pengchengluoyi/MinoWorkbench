import type { PreviewParameter, PreviewTask } from './caseUnderstanding'

/** Only unique, exact source matches are anchored. Repeated text has no reliable offset. */
export function sourceAnchor(text: string, source: string): number | null {
  if (!source) return null
  const start = text.indexOf(source)
  if (start < 0 || text.indexOf(source, start + 1) >= 0) return null
  return start + source.length
}

/** Presentation deduplication only; the saved plan and task count remain intact. */
export function displayParameters(task: PreviewTask): PreviewParameter[] {
  const seen = new Set<string>()
  return task.parameters.filter(parameter => {
    const label = parameter.label.replace(/^(元素|目标) · /, '目标 · ')
    const identity = `${label}\u0000${parameter.value}`
    if (seen.has(identity)) return false
    seen.add(identity)
    if (['任务内容', '校验要求', '条件原文'].includes(label.split(' · ').at(-1) || '') && parameter.value === task.source) return false
    if (['登录方式', '登录方式（原文）'].includes(label) && task.title.endsWith(` · ${parameter.value}`)) return false
    if (task.tone === 'check' && ['校验规则 · 文本', '校验规则 · 正文'].includes(label) && task.title.endsWith(` · ${parameter.value}`)) return false
    if (/^(目标|元素) · 名称$/.test(parameter.label) && task.title.endsWith(` · ${parameter.value}`)) return false
    if (task.tone === 'condition' && task.summaryOnly && task.source.replace(/\s/g, '') === `${parameter.label}：${parameter.value}`.replace(/\s/g, '')) return false
    return true
  })
}

export function parameterLabel(label: string): string {
  return ({ '元素 · 控件类型': '控件类型', '目标 · 控件类型': '控件类型', '元素 · 名称': '目标', '目标 · 名称': '目标', '校验规则 · 校验要求': '校验要求' } as Record<string, string>)[label] || label
}
