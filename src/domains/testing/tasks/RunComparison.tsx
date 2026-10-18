import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

type Facts = { status: string; verification: string; tested_build: string }
type Comparison = { compared_to: string; original_total: number; current_total: number; inconsistent_units: number;
  items: { case_id: string; sn: string; comparable: boolean; inconsistent: boolean; observed_change: boolean; reason_codes: string[]; previous: Facts[]; current: Facts[] }[] }
const reasons: Record<string, string> = { execution_unit_missing_or_ambiguous: '执行单元缺失或重复', tested_build_unknown: '被测构建未知',
  tested_build_changed: '被测构建不同', environment_baseline_digest_unknown: '环境基线未知', environment_baseline_digest_changed: '环境基线不同',
  platform_unknown: '平台未知', platform_changed: '平台不同', execution_mode_unknown: '执行模式未知', execution_mode_changed: '执行模式不同',
  case_identity_unknown: '用例版本未知', case_or_plan_changed: '用例或计划已变化' }

export function RunComparison({ runId, derivedFrom }: { runId: string; derivedFrom: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  const [input, setInput] = useState(derivedFrom)
  const [other, setOther] = useState('')
  const query = useQuery({ queryKey: ['run-comparison', owner, runId, other], enabled: !!other,
    queryFn: async () => unwrapOne<Comparison>(await request({ url: `/case-runner/tasks/${encodeURIComponent(runId)}/comparison`, method: 'get', params: { other_run_id: other } })) })
  return <details><summary>历史报告对比</summary>
    <p>按用例与设备逐项比较；两次运行的分母和结论分别保留。构建、版本或环境无法证明相同时标为不可比。</p>
    {derivedFrom && <p>派生自：{derivedFrom}</p>}
    <label>对照任务编号 <input aria-label="对照任务编号" value={input} onChange={e => setInput(e.target.value)} /></label>{' '}
    <Button disabled={!input.trim() || input.trim() === runId} onClick={() => { if (other === input.trim()) void query.refetch(); else setOther(input.trim()) }}>比较报告</Button>
    {query.isFetching && <p role="status">正在读取报告</p>}{query.error && <p role="alert">{errText(query.error)}</p>}
    {query.data && <><p>原报告 {query.data.original_total} 项，本报告 {query.data.current_total} 项；可比范围内结论不一致 {query.data.inconsistent_units} 项。</p>
      <table><thead><tr><th>用例 / 设备</th><th>原报告</th><th>本报告</th><th>比较结果</th></tr></thead><tbody>{query.data.items.map(row => <tr key={`${row.case_id}:${row.sn}`}>
        <td>{row.case_id} / {row.sn || '目标未知'}</td><td>{row.previous.map(f => `${f.status} · ${f.verification}`).join('；') || '缺失'}</td>
        <td>{row.current.map(f => `${f.status} · ${f.verification}`).join('；') || '缺失'}</td>
        <td>{!row.comparable ? `不可比：${row.reason_codes.map(code => reasons[code] || code).join('、')}` : row.inconsistent ? '不一致（保留两次结果）' : '一致'}</td>
      </tr>)}</tbody></table></>}
  </details>
}
