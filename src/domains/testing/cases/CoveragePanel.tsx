import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { Alert, DataTable, StatusPill, type DataColumn } from '@/ui'

type Ratio = { total: number; covered: number; closure_rate: number | null }
type IntentCoverage = {
  schema: string
  scope: { cases: number }
  business_intent: Ratio & { uncovered: { point_id: string; cases: string[]; attribution_class?: string }[] }
  intent: Ratio & { uncovered: { intent_id: string; cases: string[] }[] }
  unidentified_cases: { unit_id: string; case_id: string; status: string }[]
}
type ReachRow = { event_id: string; channel: string; status: string; reason_code: string; attribution_class: string; case_count: number; intents: string[] }
type Reachability = {
  schema: string
  totals: { events: number; reachable: number; blocked: number; unknown: number }
  rows: ReachRow[]
}
type Coverage = { schema: string; intent: IntentCoverage; events: Reachability }

const pct = (ratio: Ratio) => ratio.closure_rate === null ? '暂无可计算样本' : `${(ratio.closure_rate * 100).toFixed(1)}%（${ratio.covered}/${ratio.total}）`
const classLabel: Record<string, string> = { A: 'A 平台缺口', B: 'B 程序缺口', C: 'C 守卫误拦' }

export function CoveragePanel({ owner, projectId, appId }: { owner: string; projectId: string; appId: string }) {
  const query = useQuery({
    queryKey: ['application-coverage', owner, projectId, appId],
    enabled: Boolean(owner),
    retry: false,
    queryFn: async () => unwrapOne<Coverage>(await request({
      url: `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/understanding/coverage`,
      method: 'get',
    })),
  })
  const data = query.data?.intent.scope.cases !== undefined ? query.data : undefined
  const unreachable: ReachRow[] = data?.events.rows.filter(row => row.status === 'blocked') || []
  const columns: DataColumn<ReachRow>[] = [
    { key: 'event', title: '事件', dataIndex: 'event_id' },
    { key: 'channel', title: '渠道', dataIndex: 'channel' },
    { key: 'status', title: '可达性', render: (_, row) => <StatusPill status={row.status === 'reachable' ? 'pass' : row.status === 'blocked' ? 'fail' : 'muted'}>{row.status === 'reachable' ? '可达' : row.status === 'blocked' ? '不可达' : '不适用'}</StatusPill> },
    { key: 'reason', title: '原因', render: (_, row) => row.reason_code || '—' },
    { key: 'class', title: '归因', render: (_, row) => row.attribution_class ? classLabel[row.attribution_class] || row.attribution_class : '—' },
    { key: 'cases', title: '引用用例', dataIndex: 'case_count' },
  ]
  return <section className="config-workspace-section" aria-label="覆盖度">
    <h3>覆盖度（业务意图闭合 + 事件×渠道可达性）</h3>
    <p className="config-secondary">主分母是需求点：至少一条用例最近一次跑批通过才算闭合。事件×渠道只回答「有没有实现」，不是覆盖率。</p>
    {query.error && <Alert type="error" showIcon message="覆盖度读取失败，请重试" />}
    {data && <>
      <div className="config-comparison-stats">
        <div className="config-comparison-stat"><span>业务意图闭合率</span><strong>{pct(data.intent.business_intent)}</strong><p className="config-secondary">未识别需求点用例：{data.intent.unidentified_cases.length} 条</p></div>
        <div className="config-comparison-stat"><span>意图闭合率</span><strong>{pct(data.intent.intent)}</strong><p className="config-secondary">覆盖 {data.intent.scope.cases} 条用例</p></div>
        <div className="config-comparison-stat"><span>事件可达</span><strong>{data.events.totals.reachable}</strong><p className="config-secondary">不可达 {data.events.totals.blocked} · 非 UI {data.events.totals.unknown}</p></div>
      </div>
      {!!data.intent.business_intent.uncovered.length && <details><summary>未闭合需求点 {data.intent.business_intent.uncovered.length} 个</summary>
        {data.intent.business_intent.uncovered.slice(0, 50).map(row => <p key={row.point_id} className="config-secondary">{row.point_id}{row.attribution_class ? ` · ${classLabel[row.attribution_class] || row.attribution_class}` : ''} · {row.cases.length} 条用例</p>)}
      </details>}
      <h4>不可达事件（静态）</h4>
      <DataTable viewId="testing.coverage.reachability" rowKey={row => `${row.event_id}:${row.channel}`} columns={columns} dataSource={unreachable.slice(0, 200)} emptyTitle="没有静态不可达事件" />
    </>}
  </section>
}
