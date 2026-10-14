import { conditionPair, splitNumbered, type NumberedLine } from './caseText'

export type ScriptKind = 'pre' | 'op' | 'ex'
export type TaskTone = 'action' | 'logic' | 'check' | 'condition' | 'attention'
export type PreviewParameter = { label: string; value: string; source?: string }
export type PreviewTask = {
  id: string
  step: number
  title: string
  source: string
  tone: TaskTone
  parameters: PreviewParameter[]
  blocked?: boolean
  reason?: string
  summaryOnly?: boolean
}
export type AutomationDetail = { step: number; text: string; coverable: boolean; reason: string }
export const recordOf = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const textOf = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
const rowsOf = (value: unknown) => Array.isArray(value) ? value.map(recordOf) : []
const hasText = (value: unknown) => Array.isArray(value) ? value.length > 0 : !!textOf(value)
const firstSource = (...values: unknown[]) => values.find(hasText) ?? ''

export function originalLines(value: unknown): NumberedLine[] {
  if (!Array.isArray(value)) return splitNumbered(value)
  return value.flatMap((item, index) => {
    const row = recordOf(item)
    const text = typeof item === 'object' ? textOf(row.text) : textOf(item)
    if (!text) return []
    const match = text.match(/^(\d+)\s*[.、．)）]\s*([\s\S]*)$/)
    return [{ num: Number(row.num) || (match ? Number(match[1]) : index + 1), text: match ? match[2] : text }]
  })
}

export function fieldSource(row: Record<string, unknown>, kind: ScriptKind): unknown {
  const payload = recordOf(row.payload)
  if (kind === 'pre') return firstSource(row.precondition, payload.precondition, row.precondition_preview)
  const key = kind === 'op' ? 'steps' : 'expected'
  return firstSource(row[`${key}_raw`], payload[`${key}_raw`], row[key], payload[key], row[`${key}_preview`])
}

export function savedPrograms(row: Record<string, unknown>) {
  return recordOf(recordOf(row.meta).step_program_keys ?? recordOf(recordOf(row.payload).meta).step_program_keys)
}

export function hasSavedUnderstanding(row: Record<string, unknown>) {
  return !!Object.keys(savedPrograms(row)).length || row.steps_parsed != null || row.expected_parsed != null || row.automation_details != null
}

const labels: Record<string, string> = {
  target: '目标', name: '名称', role: '控件类型', text: '文本', value: '值', input: '输入内容', input_text: '输入内容',
  target_desc: '目标描述', element: '元素', placeholder: '占位提示', label: '标签', selector: '定位表达式',
  nav_target: '目标页面', block_id: '逻辑块', direction: '方向', distance: '距离', duration: '持续时间', duration_ms: '持续时间（ms）', wait_ms: '等待时间（ms）', timeout_ms: '超时（ms）',
  start: '起点', end: '终点', x: '横坐标', y: '纵坐标', spatial_hint: '位置提示',
  present: '需要出现', visible: '需要可见', exclusive: '排除其他弹窗', which: '校验对象', body: '正文', title: '标题', expected: '期望值', expectation: '校验要求',
  mode: '校验方式', rules: '校验规则', match: '匹配方式', exact: '精确匹配', contains: '包含内容', equals: '等于',
  method: '登录方式', login_type: '登录方式', login_kind: '登录方式', auth_type: '登录方式', username: '账号', phone: '手机号', email: '邮箱', password: '密码',
  credential: '凭证', submit: '提交', entry: '入口', required_session: '登录态', prep: '环境准备', requirements: '账号筛选', all: '必须满足', prefer: '优先满足', env: '账号环境',
}
const values: Record<string, string> = {
  button: '按钮', input: '输入框', element: '元素', page: '页面', dialog: '弹窗', checkbox: '复选框', switch: '开关', image: '图片',
  phone: '手机号', mobile: '手机号', email: '邮箱', sms: '短信验证码', password: '密码', phone_password: '手机号＋密码', email_password: '邮箱＋密码',
  logged_in: '已登录', logged_out: '未登录', guest: '游客', any: '不限', logout: '退出登录', clear_cache: '清除缓存', clear_app_data: '清除应用数据',
  left: '向左', right: '向右', up: '向上', down: '向下', vlm: '视觉校验', session: '登录态校验', program: '程序校验',
}
function valueLabel(value: unknown): string {
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (Array.isArray(value)) return value.map(valueLabel).filter(Boolean).join(' / ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  const text = textOf(value)
  return values[text] || text
}
function parametersOf(value: unknown, prefix = ''): PreviewParameter[] {
  return Object.entries(recordOf(value)).flatMap(([key, item]) => {
    if (item == null || item === '') return []
    const label = prefix ? `${prefix} · ${labels[key] || key}` : labels[key] || key
    if (/password|secret|token/i.test(key)) return [{ label, value: '敏感值已隐藏' }]
    if (item && typeof item === 'object' && !Array.isArray(item)) return parametersOf(item, label)
    return [{ label, value: valueLabel(item) }]
  })
}
const capLabels: Record<string, string> = {
  tap_element: '点击', tap: '点击', click: '点击', input_text: '输入', type_text: '输入', input: '输入',
  swipe: '滑动', scroll: '滚动', drag: '拖拽', long_press: '长按', long_press_element: '长按',
  wait_ms: '等待', wait_screen_ready: '等待页面就绪', assert_text: '文案校验', assert_element: '元素校验',
  confirm_login_state: '登录态校验', lease_account: '获取测试账号', press_key: '按键', navigate: '导航',
}
const loginMethods = (texts: string[]) => {
  const source = texts.join(' ')
  return [...new Set([/手机号|手机号码|\bphone\b|\bmobile\b/i.test(source) ? '手机号' : '', /邮箱|电子邮件|\bemail\b/i.test(source) ? '邮箱' : '', /验证码/.test(source) ? '验证码' : '', /密码/.test(source) ? '密码' : ''].filter(Boolean))]
}
function planTask(item: Record<string, unknown>, step: number, index: number, kind: ScriptKind): PreviewTask {
  const key = textOf(item.key_ref)
  const source = textOf(item.source_clause) || textOf(item.source_line)
  const cap = textOf(item.hook_cap || item.event_name || item.event_id)
  const params = recordOf(item.params)
  const target = recordOf(params.target || params.element)
  const assertion = recordOf(item.assert)
  const slots = rowsOf(item.slots)
  const login = key === 'operation.login_flow' || /login/.test(textOf(item.block_id))
  const methods = loginMethods([source, ...slots.map((slot) => textOf(slot.text)), textOf(params.method || params.login_type || params.login_kind || params.auth_type)])
  const rules = recordOf(assertion.rules || params.rules)
  const name = textOf(target.name || target.target_desc) || textOf(item.nav_target) || (kind === 'ex' ? textOf(rules.name || rules.which || rules.text || rules.body) : '')
  const checkLabel = assertion.mode === 'session' ? '登录态校验' : rules.text || rules.body ? '文案校验' : /dialog|弹窗/.test(`${key} ${rules.name || ''} ${target.role || ''}`) ? '弹窗校验' : rules.present != null || target.role ? '元素校验' : '校验'
  const event = capLabels[cap] || (item.kind === 'nav' ? '导航' : item.kind === 'flow_block' ? '逻辑流程' : kind === 'ex' ? checkLabel : textOf(item.event_name) || textOf(item.title) || key || '执行任务')
  const title = login ? `登录逻辑${methods.length ? ` · ${methods.join(' / ')}` : ''}` : `${event}${name && !event.includes(name) ? ` · ${name}` : ''}`
  const parameters = [...parametersOf(params), ...parametersOf(assertion)]
  if (item.nav_target && !parameters.some((p) => p.value === textOf(item.nav_target))) parameters.unshift({ label: '目标页面', value: textOf(item.nav_target) })
  for (const slot of slots) {
    const text = textOf(slot.text)
    if (text) parameters.push({ label: labels[textOf(slot.id)] || textOf(slot.id) || '流程环节', value: text, source: text })
    parameters.push(...parametersOf(slot.target, labels[textOf(slot.id)] || '流程目标'))
  }
  if (login && methods.length && !parameters.some((p) => p.label === '登录方式')) parameters.unshift({ label: '登录方式（原文）', value: methods.join(' / '), source })
  if (!parameters.length && source) parameters.push({ label: kind === 'ex' ? '校验要求' : '任务内容', value: source })
  return { id: textOf(item.id) || `${kind}-${step}-${index}`, step, title, source, tone: kind === 'ex' ? 'check' : login || item.kind === 'flow_block' ? 'logic' : 'action', parameters }
}
function blockedTask(item: Record<string, unknown>, step: number, index: number, kind: ScriptKind): PreviewTask {
  return { id: `${kind}-${step}-blocked-${index}`, step, title: textOf(item.event_name) || '待处理片段', source: textOf(item.source_clause || item.line || item.raw_text), tone: 'attention', parameters: [], blocked: true, reason: textOf(item.user_message || item.detail || item.reason) || '此片段没有返回可执行任务' }
}

export function summaryTasks(compiled: unknown, automation: AutomationDetail[] | undefined, kind: ScriptKind, lines: NumberedLine[]): PreviewTask[] {
  if (automation?.length) return automation.map((item, index) => ({
    id: `summary-${kind}-${item.step}-${index}`, step: item.step, source: item.text || '',
    title: item.coverable ? item.reason || (kind === 'pre' ? '准备条件' : kind === 'ex' ? '校验' : '执行任务') : '需处理',
    tone: !item.coverable ? 'attention' : kind === 'pre' ? 'condition' : kind === 'ex' ? 'check' : 'action',
    parameters: [], blocked: !item.coverable, reason: !item.coverable ? item.reason : undefined, summaryOnly: true,
  }))
  const rows = Array.isArray(compiled) ? compiled : typeof compiled === 'string' ? compiled.split('\n') : []
  return rows.flatMap((item, index) => {
    const row = recordOf(item)
    const text = textOf(row.text || row.title) || textOf(item)
    if (!text) return []
    const matched = text.match(/^(\d+)\s*[.、．)）]\s*([\s\S]*)$/)
    const step = Number(row.step || row.num) || (matched ? Number(matched[1]) : lines.length === 1 ? lines[0].num : 0)
    const body = matched ? matched[2] : text
    const source = textOf(row.source_clause || row.source_line)
    const blocked = /^×|未执行[：:]|无法自动|无法执行/.test(body)
    return [{ id: `summary-${kind}-${step}-${index}`, step, title: body, source, tone: blocked ? 'attention' : kind === 'ex' ? 'check' : 'action', parameters: [], blocked, reason: blocked ? body : undefined, summaryOnly: true } satisfies PreviewTask]
  })
}

export function fieldPresentation(row: Record<string, unknown>, kind: ScriptKind) {
  const value = fieldSource(row, kind)
  const lines = originalLines(value)
  const payload = recordOf(row.payload)
  const programs = savedPrograms(row)
  const details = recordOf(row.automation_details || recordOf(row.step_key_validation).automation_details)
  const automation = Array.isArray(details[kind]) ? details[kind] as AutomationDetail[] : undefined
  const tasks: PreviewTask[] = []
  let structured = false
  if (kind !== 'pre') {
    for (const [key, bundle] of Object.entries(programs)) {
      const step = Number(key)
      if (!Number.isInteger(step) || step <= 0) continue
      const plan = recordOf(recordOf(bundle)[kind === 'op' ? 'do_program_plan' : 'check_program_plan'])
      if (!Object.keys(plan).length) continue
      structured = true
      rowsOf(plan[kind === 'op' ? 'steps' : 'checkpoints']).forEach((item, index) => tasks.push(planTask(item, step, index, kind)))
      rowsOf(plan.compile_warnings).forEach((warning, index) => {
        const blocked = recordOf(warning.blocked)
        if (Object.keys(blocked).length) tasks.push(blockedTask(blocked, step, index, kind))
      })
    }
  }
  const compiled = kind === 'pre' ? undefined : row[kind === 'op' ? 'steps_parsed' : 'expected_parsed'] ?? recordOf(row.step_key_validation)[kind === 'op' ? 'steps_parsed' : 'expected_parsed']
  if (!structured) tasks.push(...summaryTasks(compiled, automation, kind, lines))
  if (kind === 'pre' && !tasks.length) {
    for (const line of lines) {
      const pair = conditionPair(line.text)
      tasks.push({ id: `condition-${line.num}`, step: line.num, title: pair.label || '准备条件', source: line.text, tone: 'condition', parameters: [{ label: pair.label || '条件原文', value: pair.value }], summaryOnly: true })
    }
  }
  const resource = recordOf(row.resource_key || recordOf(row.meta).resource_key || payload.resource_key || recordOf(payload.meta).resource_key)
  const resourceParameters = kind === 'pre' ? [
    ...parametersOf(recordOf(resource.device_app).required_session ? { required_session: recordOf(resource.device_app).required_session } : {}),
    ...parametersOf(recordOf(resource.device_app).prep ? { prep: recordOf(resource.device_app).prep } : {}),
    ...parametersOf(recordOf(resource.account).requirements ? { requirements: recordOf(resource.account).requirements } : {}),
  ] : []
  return { value, tasks, resourceParameters, resolved: structured || tasks.some((task) => !task.summaryOnly) || hasText(compiled) || !!automation?.length }
}

export function rowAttention(row: Record<string, unknown>) {
  if (['incomplete', 'error', 'cancelled'].includes(textOf(row.parse_status))) return true
  if (row.conflict) return true
  if (row.parse_status === 'pending') return false
  return !!textOf(row.remark) || recordOf(row.ui_automation).coverable === false || ['pre', 'op', 'ex'].some((kind) => fieldPresentation(row, kind as ScriptKind).tasks.some((task) => task.blocked))
}

export function importDecision(row: Record<string, unknown>) {
  if (row.parse_status !== 'done' || row.selected === false) return 'excluded'
  return row.conflict && row.on_conflict !== 'overwrite' ? 'skip' : row.conflict ? 'overwrite' : 'create'
}

export function mergePreviewRows<T extends Record<string, unknown>>(previous: T[], incoming: T[]): T[] {
  const oldRows = new Map(previous.map((row) => [row.row_index, row]))
  return incoming.map((row) => {
    const old = oldRows.get(row.row_index)
    return { ...old, ...row, selected: old?.selected ?? row.selected_by_default !== false, on_conflict: old?.on_conflict || (row.conflict ? 'skip' : 'skip') }
  })
}
