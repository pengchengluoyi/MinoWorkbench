import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, StatusPill, errText } from '@/ui'
import { getRetryEligibility, getTaskWriteSafety, retryFailedTestingTask, recheckTaskWriteSafety } from '@/api/caseRunner'

const reasons: Record<string, string> = {
  no_effect_evidence_missing: '缺少尚未开始写入的证据；未知效果不能重放',
  publication_retry_not_allowed: '原发布未允许此类复跑',
  retry_limit_exceeded: '已达到原发布的复跑次数上限',
  attempt_budget_unavailable: '缺少原执行预算', attempt_deadline_exceeded: '原执行预算已耗尽',
  execution_unit_already_retried: '已创建关联复跑，请查看该任务',
  execution_unit_identity_missing: '缺少执行单元身份',
  stop_evidence_required: '尚缺停止证据', resource_reset_verification_required: '尚缺资源复位核验',
}
type Pending = { id: string; units: string[] }

export function RunSafety({ runId, onStarted }: { runId: string; onStarted: (id: string) => void }) {
  const safety = useQuery({ queryKey: ['run-safety', runId], queryFn: async () => (await getTaskWriteSafety(runId)).data, retry: false })
  const retry = useQuery({ queryKey: ['run-retry', runId], queryFn: async () => (await getRetryEligibility(runId)).data, retry: false })
  const [selected, setSelected] = useState<string[]>([])
  const key = `mino.retry-request:${runId}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) || 'null')
      return value && typeof value.id === 'string' && Array.isArray(value.units) && value.units.every((u: unknown) => typeof u === 'string') ? value : null
    } catch { return null }
  })
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const [notice, setNotice] = useState('')
  const refresh = () => { void safety.refetch(); void retry.refetch() }
  const recheck = async () => {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true)
    try {
      const response = await recheckTaskWriteSafety(runId)
      const stopped = (response.data?.actions || []).filter(a => a.stop_confirmed).length
      setNotice(`已取得 ${stopped} 条停止证据。停止不等于复位，原业务结论不变；请核对刷新后的资源状态。`)
      refresh()
    } catch (error) { setNotice(errText(error, '停止复核未完成，资源不会因请求失败而释放')) }
    finally { inFlight.current = false; setBusy(false) }
  }
  const submit = async () => {
    if (inFlight.current) return
    const request = pending || { id: `retry-${crypto.randomUUID()}`, units: selected }
    if (!request.units.length) return
    inFlight.current = true; setBusy(true)
    try {
      // Persist before dispatch; reload/network loss must not create a new request.
      sessionStorage.setItem(key, JSON.stringify(request)); setPending(request)
      const response = await retryFailedTestingTask(runId, request.units, request.id)
      if (!response.data?.task_id) throw new Error('受理回执缺少任务编号')
      sessionStorage.removeItem(key); setPending(null)
      onStarted(response.data.task_id)
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status
      if (status && [400, 403, 404, 409, 422].includes(status)) {
        sessionStorage.removeItem(key); setPending(null); refresh()
        setNotice(errText(error, '复跑未获准，请检查最新阻塞原因'))
      } else setNotice('受理结果尚未确认。请使用“恢复本次请求”，会沿用原请求编号，避免重复创建。')
    } finally { inFlight.current = false; setBusy(false) }
  }
  const data = retry.data
  return <details className="task-safety" aria-label="执行安全与复跑">
    <summary>资源与复跑<span className="task-safety-summary"><StatusPill status={safety.isError || retry.isError || safety.data?.resource_isolated ? 'warn' : 'muted'}>{safety.isLoading || retry.isLoading ? '读取中' : safety.isError || retry.isError ? '状态待核对' : safety.data?.resource_isolated ? '资源已隔离' : '暂无隔离记录'}</StatusPill>{pending ? ' · 有待确认的复跑请求' : data?.eligible_unit_ids.length ? ` · 可复跑 ${data.eligible_unit_ids.length} 项` : ''}</span></summary>
    <div className="task-safety-body">
    <div className="flex items-center gap-3"><strong>执行安全与复跑</strong><Button size="small" onClick={refresh}>刷新安全状态</Button></div>
    {(safety.isLoading || retry.isLoading) && <p role="status">正在读取资源状态与复跑条件…</p>}
    {(safety.isError || retry.isError) && <p role="alert">{errText(safety.error || retry.error, '安全状态读取失败；旧服务可能尚未提供接口，请刷新重试。')}</p>}
    {safety.data && <>
      <p>{safety.data.resource_isolated ? '资源仍隔离：暂不允许继续使用受影响资源。' : '当前未发现隔离记录；是否可复跑仍需核对下方条件。'}</p>
      {safety.data.resource_isolated && <Button loading={busy} onClick={() => void recheck()}>核对停止证据</Button>}
      {safety.data.missing_evidence.map(reason => <p key={reason}>{reasons[reason] || reason}</p>)}
      {safety.data.actions.map((a, i) => <p key={i}>{a.sn || '目标未确认'}：{a.stop_confirmed ? '已取得停止证据' : '停止尚未确认'}；{a.resource_reset_verified ? '复位已核验' : '复位尚未核验'}</p>)}
      <p>迟到对账回执 {safety.data.reconciliation_count} 条；原业务结论保持不变。</p>
    </>}
    {data && <>
      <p>原批次剩余预算：{data.remaining_budget_seconds == null ? '无法确认' : `${Math.floor(data.remaining_budget_seconds)} 秒`}。复跑不重新计时。</p>
      {data.blockers.map(b => <p key={b.reason_code}>{b.message}</p>)}
      {!data.execution_units.length && <p>没有失败执行单元。</p>}
      {data.execution_units.map(u => <label key={u.execution_unit_id || `${u.case_id}:${u.sn}`} style={{ display: 'block' }}>
        <input type="checkbox" disabled={!u.eligible || !!pending || busy} checked={selected.includes(u.execution_unit_id)}
          onChange={e => setSelected(old => e.target.checked ? [...old, u.execution_unit_id] : old.filter(id => id !== u.execution_unit_id))} />
        {u.case_id} · {u.sn}：{u.eligible ? '可在原预算内复跑' : u.reason_codes.map(r => reasons[r] || r).join('；') || '受上述批次条件阻塞'}
      </label>)}
      <Button loading={busy} disabled={!pending && (!selected.length || selected.some(id => !data.eligible_unit_ids.includes(id)))} onClick={() => void submit()}>
        {pending ? '恢复本次请求' : '复跑所选执行单元'}
      </Button>
    </>}
    {notice && <p role="status">{notice}</p>}
    </div>
  </details>
}
