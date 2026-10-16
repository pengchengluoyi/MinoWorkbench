import { screenshotSource } from '@/lib/screenshot'
import { redactedText } from '@/lib/redact'
import { useQuery } from '@tanstack/react-query'
import type { SessionEvent, SessionMeta } from '@/api/sessions'
import { getV5Controls } from '@/api/v5'
import { unwrapOne } from '@/lib/unwrap'
import { errText } from '@/ui'

const reasons: Record<string, string> = {
  assertion_mismatch: '固定预期未满足', observation_missing: '缺少可用事实', effect_unknown: '写入可能发生，已停止后续写入',
  store_error: '证据落库失败，不计通过', plan_invalid: '冻结计划无效', control_version_changed: '控件版本已变化',
  timeout_before_dispatch: '剩余窗口不足，未派发写动作', capability_unavailable: '节点不支持所需合同',
  lane_quarantined: '执行实例未确认停止，已隔离', resource_version_changed: '资源版本已变化',
  request_key_conflict: '同一请求键出现不同意图', request_inflight: '请求仍在执行', artifact_missing: '缺少新截图',
  resource_busy: '账号或数据资源被占用', execution_metadata_missing: '缺少执行边界回执', node_pin_mismatch: '节点固定不匹配',
}
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {}

export function V5Evidence({ meta, events, hasMore, loadMore }: { meta: SessionMeta; events: SessionEvent[]; hasMore: boolean; loadMore: () => void }) {
  const context = meta.runtime_context || {}
  const enabled = context.execution_mode === 'v5'
  const projectId = String(context.project_id || '')
  const current = useQuery({ queryKey: ['v5-controls', projectId], queryFn: async () => unwrapOne<{ items: Record<string, unknown>[] }>(await getV5Controls(projectId)), enabled: enabled && !!projectId })
  if (!enabled) return <BindingEvidence meta={meta} />
  const verdict = meta.verdict || {}
  const status = String(verdict.verification_status || 'unverified')
  const reason = String(verdict.reason_code || '')
  const evidenceEvent = [...events].reverse().find(event => event.type === 'verification/evidence')
  const evidence = object(evidenceEvent?.payload)
  const checks = Array.isArray(evidence.checks) ? evidence.checks.map(object) : []
  const screenshotRef = object(context.screenshot_event_ref)
  const screenshot = events.find(event => event.seq === screenshotRef.seq)
  const screenshotRaw = object(object(screenshot?.payload).raw_response)
  const image = screenshotSource(screenshotRaw.image_base64) || screenshotSource(object(screenshot?.payload).thumb)
  return <section aria-label="V5 核验证据" style={{ border: '1px solid var(--w-border)', borderRadius: 8, padding: 12 }}>
    <BindingEvidence meta={meta} />
    <strong>{status === 'verified_pass' ? '已核验通过' : status === 'verified_fail' ? '已核验失败' : '未核验'}</strong>
    {verdict.flaky ? <span> · flaky：整案重试后通过</span> : null}
    <p>{reason ? `${reasons[reason] || '尚未映射的原因'} · ${reason}` : '结论来源：冻结的必验预期与对应原始事实'}{verdict.legacy_error_kind ? ` · 旧原因 ${String(verdict.legacy_error_kind)}` : ''}</p>
    {!meta.finalization_id && <p role="alert">尚无原子终结记录；任务结束不能证明核验通过。</p>}
    <p>模式 v5 · 节点 {String(context.node_id || '未记录')} · 执行实例 {String(context.lane_id ?? '未记录')} · 尝试序号 {String(context.attempt ?? '未记录')} · 冻结版本 {String(context.frozen_revision || '未记录')}</p>
    <p>实际准入：{redactedText(context.runnable_now ?? '未记录')} · 超时配置：{redactedText(context.timeout_profile ?? '未记录')}</p>
    {checks.map(check => <details open key={String(check.point_id)}>
      <summary>{String(check.point_id)} · {check.required === true ? '必验' : check.required === false ? '可选' : '是否必验未记录'} · 事实：{redactedText(check.truth ?? '未记录')} · 动作引用：{redactedText(check.action_ref ?? '未记录')}</summary>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{redactedText(check)}</pre>
    </details>)}
    {!checks.length && <p>{hasMore ? '证据可能位于后续事件页。' : '未找到预期核验所使用的证据。'}</p>}
    <details open><summary>当时配置与当前控件注册表</summary>
      <p>当时快照是此会话的解释依据；当前配置更新不会改写历史结论。</p>
      {current.error && <p role="alert">{errText(current.error, '当前注册表读取失败')}</p>}
      <pre style={{ whiteSpace: 'pre-wrap' }}>{redactedText({ historical: context.controls, current: current.data?.items, publication: context.publication })}</pre>
    </details>
    {image ? <img alt="会话记录的动作后截图" loading="lazy" src={image} style={{ maxWidth: '100%' }} />
      : <p>{hasMore ? <button type="button" onClick={loadMore}>加载后续证据与截图</button> : '截图未采集或已过期（expired）；可导出当前事件诊断。'}</p>}
  </section>
}


function BindingEvidence({ meta }: { meta: SessionMeta }) {
  const binding = object(meta.runtime_context?.execution_binding)
  const state = meta.binding_record?.status || (!Object.keys(binding).length ? 'legacy' : binding.schema_version === 1 ? 'supported' : 'unsupported')
  if (state !== 'supported') return <section aria-label="执行绑定合同">
    <p role={state === 'legacy' ? undefined : 'alert'}>{meta.binding_record?.message || (state === 'legacy' ? '旧合同记录，未记录统一绑定' : '不支持该绑定详情版本')}</p>
    <p>历史证据仍可查看；不会使用当前能力目录补造当时的绑定。</p>
  </section>
  const target = object(binding.target)
  const operations = Array.isArray(binding.operations) ? binding.operations.map(object) : []
  const implementations = object(binding.implementations)
  return <section aria-label="执行绑定合同">
    <strong>统一执行绑定 v1</strong>
    <p>{String(binding.binding_id)} · {String(target.platform)} · {String(target.sn)}</p>
    <p>计划版本：{String(binding.source_revision)} · 策略：{String(binding.action_scheme)}</p>
    <p>{meta.finalization_id ? '已原子提交终结记录' : '尚未原子终结'}{binding.execution_mode !== 'v5' ? '；普通执行结果，不代表严格核验通过。' : ''}</p>
    <details><summary>当时的执行装配（{operations.length} 项）</summary>
      <ul>{operations.map(row => {
        const impl = object(implementations[String(row.selected_ref)])
        return <li key={String(row.operation_ref)}>{String(row.phase)} · {String(row.event_id)} · {String(row.caller)} · {String(impl.executor)}（{String(impl.runs_on)}）</li>
      })}</ul>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{redactedText({ requirement_checks: binding.requirement_checks, dependency_checks: binding.dependency_checks, lease_requirements: binding.lease_requirements })}</pre>
    </details>
  </section>
}
