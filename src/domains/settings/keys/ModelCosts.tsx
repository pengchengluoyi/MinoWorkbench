import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { getTestingTask } from '@/api/caseRunner'
import { unwrapOne } from '@/lib/unwrap'
import { useQuery } from '@tanstack/react-query'
import { Button, Input, InputNumber, Select, Skeleton, Alert, errText } from '@/ui'
import { getModelCosts, type CostFilters, type CostRow } from '@/api/ai'
import { useSession } from '@/lib/session'

const money = (row: CostRow) => `${row.known_estimated_cost_usd == null ? '未知' : `约 $${row.known_estimated_cost_usd.toFixed(6)}`}${row.unknown_cost_attempts ? `（另有 ${row.unknown_cost_attempts} 次费用未知）` : ''}`
const tokens = (value: number | null) => value == null ? '未知' : value.toLocaleString()

export function ModelCosts() {
  const owner = useSession((s) => s.user?.user_id || '')
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const readFilters = () => parseCostFilters(params)
  const [draft, setDraft] = useState<CostFilters>(readFilters)
  const [navigationError, setNavigationError] = useState('')
  const [filters, setFilters] = useState<CostFilters>(readFilters)
  const query = useQuery({ queryKey: ['account', owner, 'ai', 'costs', filters], queryFn: async () => (await getModelCosts(filters)).data })
  const patch = (values: Partial<CostFilters>) => setDraft((old) => ({ ...old, ...values }))
  const apply = (values = draft) => { setDraft(values); setFilters({ ...values, offset: 0, limit: 100 }); const next = new URLSearchParams(params); next.set('costGroup', values.group_by || 'task'); for (const key of ['task_id','case_id','session_id','start','end'] as const) { if (values[key]) next.set(`cost_${key}`, values[key]!); else next.delete(`cost_${key}`) } if (values.step_index != null) next.set('costStep', String(values.step_index)); else next.delete('costStep'); setParams(next, { replace: false }) }
  const costRangeKey = new URLSearchParams([...params.entries()].filter(([key]) => key.startsWith('cost'))).toString()
  useEffect(() => { const incoming = parseCostFilters(new URLSearchParams(costRangeKey)); setDraft(incoming); setFilters(incoming) }, [costRangeKey])
  const openEvidence = async (row: CostRow) => { setNavigationError(''); try { if (!row.task_id) throw new Error('此记录缺少任务归属，无法定位执行页面'); const task = unwrapOne<{ app_id?: string }>(await getTestingTask(row.task_id)); if (!task?.app_id) throw new Error('任务未返回应用归属'); const query = new URLSearchParams(row.session_id ? { tab: 'session-log', session: row.session_id, logView: 'llm' } : { tab: 'tasks', run: row.task_id }); navigate(`/testing/${encodeURIComponent(task.app_id)}?${query}`) } catch(error) { setNavigationError(errText(error, '读取执行归属失败')) } }
  const data = query.data
  return <section style={{ padding: 20, overflow: 'auto' }}>
    <h2>模型用量与费用</h2>
    <p>仅查询当前账号。每次请求及重试单独记账；价格和 token 未返回时显示未知。金额以美元估算，与服务商实际账单可能不同。</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      <Input aria-label="任务 ID" placeholder="任务 ID（可选）" value={draft.task_id || ''} onChange={(e) => patch({ task_id: e.target.value })} style={{ width: 220 }} />
      <Input aria-label="用例 ID" placeholder="用例 ID（可选）" value={draft.case_id || ''} onChange={(e) => patch({ case_id: e.target.value })} style={{ width: 220 }} />
      <InputNumber aria-label="步骤序号" placeholder="步骤，0 为前置" min={0} precision={0} value={draft.step_index} onChange={(v) => patch({ step_index: v ?? undefined })} style={{ width: 160 }} />
      <Select aria-label="汇总维度" value={draft.group_by} options={[
        { value: 'user', label: '当前用户总计' }, { value: 'task', label: '按任务' }, { value: 'case', label: '按用例' },
        { value: 'step', label: '按步骤' }, { value: 'model', label: '按模型' },
      ]} onChange={(v) => patch({ group_by: v })} style={{ width: 160 }} />
      <Input aria-label="开始时间" type="datetime-local" value={localDate(draft.start)} onChange={(e) => patch({ start: isoDate(e.target.value) })} style={{ width: 240 }} />
      <Input aria-label="结束时间" type="datetime-local" value={localDate(draft.end)} onChange={(e) => patch({ end: isoDate(e.target.value) })} style={{ width: 240 }} />
      <span>时间采用浏览器时区：{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
      <Button type="primary" onClick={() => apply()}>查询费用</Button>
      <Button onClick={() => apply({ group_by: 'task' })}>重置筛选</Button>
    </div>
    {navigationError && <p role="alert">{navigationError}</p>}
    {query.isError && <Alert type="error" message={errText(query.error, '用量查询失败')} action={<Button onClick={() => void query.refetch()}>重试</Button>} />}
    {query.isFetching && <Skeleton active paragraph={{ rows: 4 }} />}
    {data && !query.isFetching && <>
      <p data-testid="model-cost-summary">共 {data.summary.attempts} 次请求；输入 {tokens(data.summary.prompt_tokens)} / 输出 {tokens(data.summary.completion_tokens)} / 总计 {tokens(data.summary.total_tokens)} token；{money(data.summary)}。</p>
      {data.summary.unknown_usage_attempts > 0 && <p>其中 {data.summary.unknown_usage_attempts} 次未返回用量，以上 token 只是已知部分。</p>}
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead><tr>{['范围', '请求次数', '输入 token', '输出 token', '总 token', '估算 USD', '下钻'].map((h) => <th key={h} style={{ padding: 10 }}>{h}</th>)}</tr></thead>
        <tbody>{data.items.map((row, index) => <tr key={`${row.task_id}/${row.case_id}/${row.session_id}/${row.step_index}/${row.model}/${index}`}>
          <td style={{ padding: 10, maxWidth: 450, overflowWrap: 'anywhere' }}>{[row.task_id || (filters.group_by === 'user' ? '当前用户' : filters.group_by === 'model' ? row.provider_id : '未关联任务'), row.case_id, row.session_id, row.step_index != null ? `步骤 ${row.step_index}` : '', row.model].filter(Boolean).join(' / ')}</td>
          <td>{row.attempts}</td><td>{tokens(row.prompt_tokens)}</td><td>{tokens(row.completion_tokens)}</td><td>{tokens(row.total_tokens)}{row.unknown_usage_attempts > 0 ? '（部分）' : ''}</td><td>{money(row)}</td>
          <td>{row.task_id && filters.group_by === 'task' && <Button size="small" onClick={() => apply({ ...filters, task_id: row.task_id, group_by: 'case' })}>查看用例</Button>}
            {row.case_id && filters.group_by === 'case' && <Button size="small" onClick={() => apply({ ...filters, task_id: row.task_id, case_id: row.case_id, group_by: 'step' })}>查看步骤</Button>}{row.task_id && <Button size="small" onClick={() => void openEvidence(row)}>查看执行证据</Button>}</td>
        </tr>)}</tbody>
      </table></div>
      {!data.items.length && <p>该范围暂无已记录调用。历史没有用量账本的请求不自动补估。</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <Button disabled={!filters.offset} onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - 100) })}>上一页</Button>
        <Button disabled={!data.has_more} onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + 100 })}>下一页</Button>
        <span>共 {data.group_count} 组</span>
      </div>
    </>}
  </section>
}

function localDate(value?: string) { if (!value) return ''; const date = new Date(value); if (!Number.isFinite(date.getTime())) return ''; return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16) }
function isoDate(value: string) { const date = new Date(value); return value && Number.isFinite(date.getTime()) ? date.toISOString() : undefined }

function parseCostFilters(params: URLSearchParams): CostFilters { const result: CostFilters = { group_by: ['user','task','case','step','model'].includes(params.get('costGroup') || '') ? params.get('costGroup')! : 'task', limit: 100, offset: 0 }; for (const key of ['task_id','case_id','session_id','start','end'] as const) if (params.get(`cost_${key}`)) result[key] = params.get(`cost_${key}`)!; const step = Number(params.get('costStep')); if (params.has('costStep') && Number.isSafeInteger(step) && step >= 0) result.step_index = step; return result }
