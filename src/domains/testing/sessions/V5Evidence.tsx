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
  if (!enabled) return null
  const verdict = meta.verdict || {}
  const status = String(verdict.verification_status || 'unverified')
  const reason = String(verdict.reason_code || '')
  const evidenceEvent = [...events].reverse().find(event => event.type === 'verification/evidence')
  const evidence = object(evidenceEvent?.payload)
  const checks = Array.isArray(evidence.checks) ? evidence.checks.map(object) : []
  const screenshotRef = object(context.screenshot_event_ref)
  const screenshot = events.find(event => event.seq === screenshotRef.seq)
  const screenshotRaw = object(object(screenshot?.payload).raw_response)
  const image = typeof screenshotRaw.image_base64 === 'string' ? screenshotRaw.image_base64 : ''
  return <section aria-label="V5 核验证据" style={{ border: '1px solid var(--w-border)', borderRadius: 8, padding: 12 }}>
    <strong>{status === 'verified_pass' ? '已核验通过' : status === 'verified_fail' ? '已核验失败' : '未核验'}</strong>
    {verdict.flaky ? <span> · flaky：整案重试后通过</span> : null}
    <p>{reason ? `${reasons[reason] || 'needs_mapping：未映射原因'} · ${reason}` : '结论来源：冻结 required 预期与定向原始事实'}{verdict.legacy_error_kind ? ` · 旧原因 ${String(verdict.legacy_error_kind)}` : ''}</p>
    {!meta.finalization_id && <p role="alert">尚无原子终结记录；任务结束不能证明核验通过。</p>}
    <p>模式 v5 · 节点 {String(context.node_id || '未记录')} · lane {String(context.lane_id ?? '未租用')} · attempt {String(context.attempt || 1)} · 冻结版本 {String(context.frozen_revision || '未记录')}</p>
    <p>实际准入：{JSON.stringify(context.runnable_now)} · timeout profile {JSON.stringify(context.timeout_profile)}</p>
    {checks.map(check => <details key={String(check.point_id)}>
      <summary>{String(check.point_id)} · {check.required ? 'required' : 'optional'} · {String(check.truth)} · wire {JSON.stringify(check.action_ref)}</summary>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(check, null, 2)}</pre>
    </details>)}
    {!checks.length && <p>{hasMore ? '证据可能位于后续事件页。' : '未找到 check 消费证据。'}</p>}
    <details><summary>当时配置与当前控件注册表</summary>
      <p>当时快照是此会话的解释依据；当前配置更新不会改写历史结论。</p>
      {current.error && <p role="alert">{errText(current.error, '当前注册表读取失败')}</p>}
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ historical: context.controls, current: current.data?.items, publication: context.publication }, null, 2)}</pre>
    </details>
    {image ? <img alt="动作后的脱敏截图" loading="lazy" src={`data:image/png;base64,${image}`} style={{ maxWidth: '100%' }} />
      : <p>{hasMore ? <button type="button" onClick={loadMore}>加载后续证据与截图</button> : '截图未采集或已过期（expired）；可导出当前事件诊断。'}</p>}
  </section>
}
