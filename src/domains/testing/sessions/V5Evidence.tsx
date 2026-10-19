import { screenshotSource } from '@/lib/screenshot'
import type { SessionEvent, SessionMeta } from '@/api/sessions'
import { Button, StatusPill } from '@/ui'

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
  if (!enabled) return <BindingEvidence meta={meta} />
  const verdict = meta.verdict || {}
  const status = meta.finalization_id ? String(verdict.verification_status || 'unverified') : 'unverified'
  const reason = String(verdict.reason_code || '')
  const evidenceEvent = [...events].reverse().find(event => event.type === 'verification/evidence')
  const evidence = object(evidenceEvent?.payload)
  const checks = Array.isArray(evidence.checks) ? evidence.checks.map(object) : []
  const screenshotRef = object(context.screenshot_event_ref)
  const screenshot = events.find(event => event.seq === screenshotRef.seq)
  const screenshotRaw = object(object(screenshot?.payload).raw_response)
  const image = screenshotSource(screenshotRaw.image_base64) || screenshotSource(object(screenshot?.payload).thumb)
  return <details className="session-verification">
    <summary><span>预期核验</span><StatusPill status={status === 'verified_pass' ? 'pass' : status === 'verified_fail' ? 'fail' : 'warn'}>{status === 'verified_pass' ? '已核验通过' : status === 'verified_fail' ? '已核验失败' : '未核验'}</StatusPill>
      <span className="session-verification-count">{checks.length ? `${checks.filter(check => (check.truth === true || check.truth === 'true')).length} / ${checks.length} 项满足` : '展开查看详情'}</span></summary>
    <div className="session-verification-body">
      {reason && <p>{reasons[reason] || reason}</p>}
      {verdict.flaky ? <p>整案重试后通过</p> : null}
      {!meta.finalization_id && <p role="alert">结果尚未完成归档。</p>}
      <ul className="session-checks">{checks.map(check => <li key={String(check.point_id)}>
        <span>{String(check.label || check.point_id)}{check.required === true ? '（必验）' : ''}</span>
        <StatusPill status={(check.truth === true || check.truth === 'true') ? 'pass' : (check.truth === false || check.truth === 'false') ? 'fail' : 'warn'}>{(check.truth === true || check.truth === 'true') ? '满足' : (check.truth === false || check.truth === 'false') ? '不满足' : '未确认'}</StatusPill>
      </li>)}</ul>
      {!checks.length && <p>{hasMore ? '后续事件中可能还有核验证据。' : '尚无可用核验证据。'}</p>}
      {hasMore && <Button onClick={loadMore}>加载更多证据</Button>}
      {image ? <details className="session-summary"><summary>查看执行截图</summary><img className="session-verification-image" alt="会话记录的动作后截图" loading="lazy" src={image} /></details>
        : <p>本次执行没有可用截图。</p>}
      <BindingEvidence meta={meta} />
    </div>
  </details>
}


function BindingEvidence({ meta }: { meta: SessionMeta }) {
  const binding = object(meta.runtime_context?.execution_binding)
  const state = meta.binding_record?.status || (!Object.keys(binding).length ? 'legacy' : binding.schema_version === 1 ? 'supported' : 'unsupported')
  if (state === 'legacy') return null
  if (state !== 'supported') return <p role="alert">{meta.binding_record?.message || '暂时无法读取执行配置详情'}</p>
  const target = object(binding.target)
  const operations = Array.isArray(binding.operations) ? binding.operations.map(object) : []
  const implementations = object(binding.implementations)
  return <details className="session-summary" aria-label="执行配置"><summary>执行配置 · {String(target.platform || '未记录平台')} · {operations.length} 项操作</summary>
    <p>执行设备：{String(target.sn || '未记录')} · 计划版本：{String(binding.source_revision || '未记录')}</p>
      <ul>{operations.map(row => {
        const impl = object(implementations[String(row.selected_ref)])
        return <li key={String(row.operation_ref)}>{String(row.phase)} · {String(row.event_id)} · {String(row.caller)} · {String(impl.executor)}（{String(impl.runs_on)}）</li>
      })}</ul>
  </details>
}
