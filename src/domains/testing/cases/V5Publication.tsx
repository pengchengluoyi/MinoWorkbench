import { useEffect, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Checkbox, Drawer, Select, StatusPill, errText } from '@/ui'
import { compileV5Draft, configureV5Baseline, getV5Preview, publishV5Case, getV5Metrics, type V5Preview } from '@/api/v5'
import type { CaseRow } from '@/api/projectCases'
import { unwrapOne } from '@/lib/unwrap'
import { recordOf } from './caseUnderstanding'
import './V5Publication.css'

const reasons: Record<string, [string, string]> = {
  capability_unavailable: ['执行能力尚未就绪', '当前执行资源没有提供所需能力，请核对资源与平台。'],
  unsupported_resource_platform: ['执行资源不支持此平台', '请核对用例平台与所选执行资源的适用范围。'],
  expected_unmapped: ['预期未映射为可执行校验', '这些预期尚未得到明确的校验目标和判断规则。'],
  action_unmapped: ['操作未映射为可执行动作', '这些操作尚未得到当前发布版本支持的动作映射。'],
  control_not_published: ['引用控件尚未发布', '请在控件配置中核对定位规则并发布对应控件。'],
  required_check_missing: ['缺少必需校验项', '发布计划中至少需要一项必需的结果校验。'],
  unresolved_compile_warning: ['编译仍有待处理片段', '请检查原文中的待处理标注，再重新编译草稿。'],
  catalog_version_changed: ['编译目录版本已变化', '需要重新编译当前文字草稿并审阅。'],
  input_payload_unmapped: ['输入参数未映射', '请明确输入文本或测试资源中的字段来源。'],
  control_identity_conflict: ['控件标识存在冲突', '请先核对控件配置中的重复标识。'],
  invalid_operation_identity: ['操作标识无效', '操作标识缺失或重复，请检查编译结果。'],
  invalid_after_operation: ['校验与操作的关联无效', '校验没有关联到有效的前序操作。'],
  invalid_wait_policy: ['校验等待配置无效', '请检查等待超时与读取次数的配置。'],
}
const labels: Record<string, string> = {
  case_step: '原文步骤', operation_id: '操作标识', point_id: '校验标识', control_id: '控件标识', capability_id: '执行动作',
  payload: '输入参数', expected: '判断规则', after_operation_id: '前序操作', required: '必需校验', wait_policy: '等待配置',
  timeout_ms: '超时（ms）', max_reads: '最多读取次数', kind: '类型', text: '文本', value: '值', contains: '包含', equals: '等于',
  visible: '可见', present: '存在', absent: '不存在', mode: '方式', rules: '规则', target: '目标', name: '名称', role: '控件类型',
  resource_ref: '资源字段引用', field: '字段', resource_key: '资源键', source: '来源', compiler: '编译器', verifier_build: '校验器版本',
  plan_source: '计划来源', dispatch_log_refs: '编译日志引用', catalog_versions: '编译目录版本', do: '操作目录', check: '校验目录', compile_contract_revision: '编译契约版本',
  days: '统计天数', attempts: '执行尝试', by_reason: '按原因统计', by_verification: '按校验结果统计', flaky_passes: '重试后通过',
  effect_unknown: '执行效果未知', evidence_complete: '证据完整', count: '数量', denominator: '分母', sessions: '执行记录', session_id: '执行标识',
  verdict: '判定', finished_at: '完成时间', storage: '存储统计', positive_false_reject: '正样本误拒', secret_leaks: '敏感信息泄漏',
  available: '已测量', reason: '说明', name_source: '名称来源', input_target: '输入', tap_target: '点击',
  steps: '操作原文', steps_raw: '操作原文', expected_raw: '预期原文', precondition: '前置原文', platform: '平台', title: '用例名称',
}
const values: Record<string, string> = { input_target: '输入', tap_target: '点击', text: '文字', draft: '草稿', published: '已发布', stale: '待重新审阅', pass: '通过', fail: '失败', flaky: '重试后通过', effect_unknown: '执行效果未知', not_measured: '尚未测量' }

export function V5Publication({ projectId, row }: { projectId: string; row: CaseRow }) {
  const qc = useQueryClient()
  const [reviewed, setReviewed] = useState(false)
  const [retry, setRetry] = useState(false)
  const [showMetrics, setShowMetrics] = useState(false)
  const [baselineId, setBaselineId] = useState('')
  const metrics = useQuery({ queryKey: ['v5-metrics', projectId], queryFn: async () => unwrapOne(await getV5Metrics(projectId)), enabled: showMetrics })
  const key = ['v5-preview', projectId, row.case_id]
  const preview = useQuery({ queryKey: key, queryFn: async () => unwrapOne<V5Preview>(await getV5Preview(projectId, row.case_id)), enabled: !!projectId })
  const compile = useMutation({ mutationFn: () => compileV5Draft(projectId, row.case_id), onSuccess: async () => {
    setReviewed(false)
    await qc.invalidateQueries({ queryKey: key })
  } })
  const publish = useMutation({ mutationFn: async () => {
    if (!reviewed || !preview.data?.eligible) throw new Error('请先核对预期强度和资格检查')
    return publishV5Case(projectId, row.case_id, preview.data.draft_revision, retry)
  }, onSuccess: async () => {
    setReviewed(false)
    await qc.invalidateQueries()
  } })
  const baseline = useMutation({ mutationFn: () => configureV5Baseline(projectId, row.case_id, preview.data!.draft_revision, baselineId), onSuccess: async () => {
    setReviewed(false)
    await qc.invalidateQueries({ queryKey: key })
  } })
  useEffect(() => { setReviewed(false) }, [projectId, row.case_id, preview.data])
  useEffect(() => { setBaselineId(''); setRetry(false) }, [projectId, row.case_id])
  const changing = compile.isPending || baseline.isPending || preview.isFetching
  const error = preview.error || compile.error || publish.error || baseline.error
  const frozen = row.v5_publication as { frozen_revision?: number; source?: Record<string, unknown> } | undefined
  const data = preview.data
  const controls = recordOf(recordOf(data).controls)
  const controlName = (id: unknown) => {
    if (!id) return '目标尚未返回'
    return String(recordOf(controls[String(id)]).target_desc || data?.baseline_controls?.find(control => control.control_id === id)?.target_desc || `控件 ${id}`)
  }
  const grouped = new Map<string, V5Preview['errors']>()
  for (const item of data?.errors || []) grouped.set(item.reason_code, [...(grouped.get(item.reason_code) || []), item])
  const checks = Array.isArray(data?.check_program_plan?.checkpoints) ? data.check_program_plan.checkpoints.map(recordOf) : []
  return <section className="case-publication" aria-label="草稿发布审阅">
    <div className="case-publication-header"><div><h2>草稿发布审阅</h2><p>运行使用已发布版本；修改文字或配置后，需要重新审阅并发布。</p></div><div className="case-publication-actions">
      <Button size="small" onClick={() => setShowMetrics(true)}>最近七天统计</Button>
      <Button size="small" loading={compile.isPending} onClick={() => compile.mutate()}>编译当前文字草稿</Button>
      <Button size="small" loading={preview.isFetching} onClick={() => void preview.refetch()}>刷新资格检查</Button>
    </div></div>
    <div className="case-publication-status"><StatusPill status={data?.eligible ? 'pass' : 'muted'}>{preview.isPending ? '检查中' : preview.isError ? '检查读取失败' : data?.eligible ? '结构检查通过' : '暂不可发布'}</StatusPill><span>状态：{values[String(row.v5_plan_state || 'draft')] || String(row.v5_plan_state)}</span><span>已发布版本：{frozen?.frozen_revision ?? '无'}</span>{data ? <span>当前草稿：v{data.draft_revision}</span> : null}{row.v5_has_unpublished_changes ? <span>有未发布的文字修改</span> : null}</div>
    {error ? <p role="alert" className="case-publication-error">{errText(error, '发布配置读取失败')}</p> : null}
    {data ? <>
      {grouped.size ? <div className="case-publication-issues" aria-label="发布检查说明">{[...grouped].map(([code, items]) => {
        const [title, detail] = reasons[code] || ['其他发布检查问题', `服务端返回：${code}`]
        const refs = [...new Set(items.map(item => item.control_id ? controlName(item.control_id) : item.point_id ? `校验 ${item.point_id}` : recordOf(item).operation_id ? `操作 ${recordOf(item).operation_id}` : recordOf(item).step ? `步骤 ${recordOf(item).step}` : '').filter(Boolean))]
        return <div className="case-publication-issue" key={code}><strong>{title}<span> {items.length} 项</span></strong><span>{detail}</span>{refs.length ? <small>涉及：{refs.join('、')}</small> : null}</div>
      })}</div> : <p className="case-publication-hint">{data.eligible ? '结构资格检查通过，请继续核对业务预期强度。' : '服务端尚未提供具体的拒绝原因，请刷新资格检查。'}</p>}
      <div className="case-publication-baseline"><div><strong>未登录基线</strong><p>每案启动新浏览器，确认登录标记不可见；无法读取时停止执行。</p></div><Select aria-label="未登录基线控件" placeholder="选择业务认可的登录标记" value={baselineId || data.baseline?.control_id || undefined}
        onChange={setBaselineId} options={data.baseline_controls?.map(item => ({ value: item.control_id, label: item.target_desc || item.control_id }))} /><Button size="small" disabled={!baselineId} loading={baseline.isPending} onClick={() => baseline.mutate()}>保存基线配置</Button></div>
      <div className="case-publication-mapping"><div><h3>操作映射 <span>{data.actions.length} 项</span></h3>{data.actions.length ? <ol>{data.actions.map((action, index) => <li key={index}><strong>步骤 {String(action.case_step ?? '未关联')} · {values[String(action.capability_id)] || String(action.capability_id || '未返回动作')} · {controlName(action.control_id)}</strong><HumanValue value={action} omit={['case_step', 'capability_id', 'control_id']} /></li>)}</ol> : <p>尚无可执行的操作映射</p>}</div>
        <div><h3>原子校验 <span>{checks.length} 项</span></h3>{checks.length ? <ol>{checks.map((check, index) => <li key={index}><strong>步骤 {String(check.case_step ?? '未关联')} · {controlName(check.control_id)} · {check.required ? '必需' : '可选'}</strong><HumanValue value={check} omit={['case_step', 'control_id', 'required']} /></li>)}</ol> : <p>尚无可执行的原子校验</p>}</div></div>
      {Object.keys(data.provenance || {}).length ? <div className="case-publication-provenance"><h3>编译来源</h3><HumanValue value={data.provenance} /></div> : null}
      {frozen?.source ? <div className="case-publication-mapping"><SourceView title="发布时的原文" source={frozen.source} /><SourceView title="当前草稿原文" source={data.source} /></div> : null}
      <div className="case-publication-review"><Checkbox disabled={changing} checked={reviewed} onChange={event => setReviewed(event.target.checked)}>已核对业务预期强度、目标与必需校验项</Checkbox>
        <Checkbox checked={retry} onChange={event => setRetry(event.target.checked)}>确认用例可复位，允许执行效果未知时整案重试一次（重试后通过会单独标记）</Checkbox>
        <div><Button type="primary" disabled={changing || !reviewed || !data.eligible} loading={publish.isPending} onClick={() => publish.mutate()}>冻结发布此草稿</Button>{publish.isSuccess ? <span role="status"> 已发布</span> : null}</div>
      </div>
    </> : null}
    <Drawer title="最近七天执行统计" open={showMetrics} onClose={() => setShowMetrics(false)} width={560}><div className="case-publication-metrics">{metrics.isPending ? <p role="status">正在读取统计</p> : metrics.error ? <p role="alert">{errText(metrics.error)}</p> : <HumanValue value={metrics.data} />}<p className="case-publication-hint">“尚未测量”表示服务端没有提供测量值，不按零计算。</p></div></Drawer>
  </section>
}

function HumanValue({ value, omit = [], field = '' }: { value: unknown; omit?: string[]; field?: string }): ReactNode {
  if (/password|secret|token/i.test(field) && typeof value === 'string') return <span>敏感值已隐藏</span>
  if (value == null) return <span>尚未测量 / 未返回</span>
  if (typeof value === 'boolean') return <span>{value ? '是' : '否'}</span>
  if (Array.isArray(value)) return value.length ? <div className="case-publication-values">{value.map((item, index) => <div key={index}><HumanValue value={item} /></div>)}</div> : <span>无</span>
  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([key]) => !omit.includes(key))
    return entries.length ? <dl className="case-publication-fields">{entries.map(([key, item]) => <div key={key}><dt>{labels[key] || reasons[key]?.[0] || key}</dt><dd><HumanValue value={item} field={key} /></dd></div>)}</dl> : <span>无额外参数</span>
  }
  return <span>{values[String(value)] || String(value)}</span>
}

function SourceView({ title, source }: { title: string; source: Record<string, unknown> }) {
  return <div><h3>{title}</h3><HumanValue value={Object.fromEntries(Object.entries(source).filter(([key]) => !(key === 'steps' && source.steps_raw) && !(key === 'expected' && source.expected_raw)))} /></div>
}
