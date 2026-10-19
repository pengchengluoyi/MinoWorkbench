import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { Alert, Button, DataTable, Select, type DataColumn } from '@/ui'

type Distribution = { samples: number; missing_samples: number; mean_seconds: number | null; p95_seconds: number | null }
type Ratio = { numerator: number; denominator: number; rate: number | null; unknown?: number }
type Metrics = { owner_user_id: string; app_id: string; project_id: string; jobs: number; cases: number; statuses: Record<string, number>; failure: Ratio; reuse: Ratio; queue: Distribution; execution: Distribution; revision_to_success: Distribution; note: string }
const percent = (v: Ratio) => v.rate === null ? '暂无可计算样本' : `${(v.rate * 100).toFixed(1)}%（${v.numerator}/${v.denominator}）`
const seconds = (v: number | null) => v === null ? '未知' : `${v.toFixed(2)} 秒`
const labels: Record<string, string> = { queued: '排队', running: '运行中', succeeded: '成功', failed: '失败', cancelled: '取消', interrupted: '中断', waiting_review: '等待审阅', waiting_budget: '等待预算', blocked_config: '配置阻塞' }

export function CompileMetrics({ owner, projectId, appId }: { owner: string; projectId: string; appId: string }) {
  const [days, setDays] = useState(30)
  const [platform, setPlatform] = useState('')
  const metrics = useQuery({ queryKey: ['application-compile-metrics', owner, projectId, appId, days, platform], enabled: Boolean(owner), retry: false,
    queryFn: async () => unwrapOne<Metrics>(await request({ url: `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/understanding/compile-metrics`, method: 'get', params: { days, platform } })) })
  const data = metrics.data?.owner_user_id === owner && metrics.data.app_id === appId && metrics.data.project_id === projectId ? metrics.data : undefined
  const rows = data ? ([['排队至开始', data.queue], ['编译执行', data.execution], ['原文入库至编译成功', data.revision_to_success]] as [string, Distribution][]).map(([name, value]) => ({ name, ...value })) : []
  const columns: DataColumn<Distribution & { name: string }>[] = [
    { key: 'name', title: '指标', dataIndex: 'name' },
    { key: 'mean', title: '平均', render: (_, value) => seconds(value.mean_seconds) },
    { key: 'p95', title: 'P95', render: (_, value) => seconds(value.p95_seconds) },
    { key: 'samples', title: '有效样本', dataIndex: 'samples' },
    { key: 'missing', title: '缺失或异常时间', dataIndex: 'missing_samples' },
  ]
  return <section className="config-workspace-section" aria-label="编译时延与复用指标">
    <h3>编译时延与复用指标</h3>
    <div className="config-toolbar">
      <Select aria-label="编译统计范围" value={days} onChange={setDays} style={{ width: 140 }} options={[7, 30, 90].map(value => ({ value, label: `近 ${value} 天` }))} />
      <Select aria-label="编译统计平台" value={platform} onChange={setPlatform} style={{ width: 140 }} options={[['', '全部平台'], ['web', 'Web'], ['android', 'Android'], ['ios', 'iOS'], ['pc', 'PC']].map(([value, label]) => ({ value, label }))} />
      <Button loading={metrics.isFetching} onClick={() => void metrics.refetch()}>刷新编译指标</Button>
    </div>
    {metrics.error && <Alert type="error" showIcon message="编译指标读取失败，请重试" />}
    {data && <>
      <p>{data.jobs ? `${data.jobs} 个编译任务，涉及 ${data.cases} 条用例` : '所选范围暂无编译任务'}</p>
      <p>{Object.entries(data.statuses).map(([status, count]) => `${labels[status] || status} ${count}`).join(' · ')}</p>
      <div className="config-comparison-stats">
        <div className="config-comparison-stat"><span>明确失败率</span><strong>{percent(data.failure)}</strong></div>
        <div className="config-comparison-stat"><span>证据确认复用率</span><strong>{percent(data.reuse)}</strong><p className="config-secondary">复用证据未知：{data.reuse.unknown || 0} 个任务</p></div>
      </div>
      <p className="config-secondary">{data.note}</p>
    </>}
    <DataTable viewId="testing.compile-metrics" rowKey="name" columns={columns} dataSource={rows} loading={metrics.isPending} emptyTitle="所选范围暂无编译任务" />
  </section>
}
