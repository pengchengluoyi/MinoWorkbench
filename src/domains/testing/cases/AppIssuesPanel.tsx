import { useState } from 'react'
import { ApplicationUnderstandingPanel } from './ApplicationUnderstandingPanel'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, DataTable, Drawer, Select, Space, StatusPill, type DataColumn } from '@/ui'
import '../config/ConfigWorkspace.css'

type Counts = { total_cases: number; evaluated_cases: number; unevaluated_cases: number; affected_cases: number; evaluated_affected_cases: number }
type Issue = { id: string; platform: string; category: string | null; reason_code: string; message: string; origin: string; occurrences: number; affected_cases: number; stale_occurrences: number; statuses: Record<string, number>; cases: { case_id: string; name: string; item_ids: string[]; evaluated: boolean }[] }
type Rollup = { app_id: string; project_id: string; owner_user_id: string; as_of: string; summary: Counts & { unique_issues: number; occurrences: number }; platforms: (Counts & { platform: string })[]; items: Issue[]; total: number; page: number; size: number }
const categories: Record<string, string> = { unconfirmed: '根因待确认', case_definition: '用例定义', semantic_parsing: '语义解析 / 应用识别', capability_gap: '动作 / 核验能力', configuration: '配置 / 环境 / 资源', execution_toolchain: '执行工具链', external_evidence: '外部证据 / 人工前置' }
const statuses: Record<string, string> = { pending_review: '待复核', needs_input: '待补充信息', needs_configuration: '待完善配置', confirmed: '已确认', fixed_pending_run: '缺口已清除，待实跑' }

export function AppIssuesPanel({ appId, projectId }: { appId: string; projectId: string }) {
  const owner = useSession(s => s.user?.user_id || '')
  const [params, setParams] = useSearchParams()
  const [platform, setPlatform] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Issue>()
  const query = useQuery({ queryKey: ['app-issues', owner, projectId, appId, platform, category, status, page], enabled: Boolean(owner && projectId && appId),
    queryFn: async () => unwrapOne<Rollup>(await request({ url: `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/issues`, method: 'get', params: { platform, category, status, page, size: 50 } })) })
  const data = query.data?.owner_user_id === owner && query.data.app_id === appId && query.data.project_id === projectId ? query.data : undefined
  const openCase = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', 'cases'); next.set('case', id)
    setParams(next)
  }
  const columns: DataColumn<Issue>[] = [
    { key: 'issue', title: '问题', render: (_, item) => <div className="config-stack"><strong>{item.message || item.reason_code}</strong><span className="config-secondary">{categories[item.category || 'unconfirmed'] || item.category}</span></div> },
    { key: 'platform', title: '平台', dataIndex: 'platform', width: 100 },
    { key: 'cases', title: '受影响用例', dataIndex: 'affected_cases', width: 120 },
    { key: 'occurrences', title: '出现次数', dataIndex: 'occurrences', width: 100 },
    { key: 'state', title: '复核状态', width: 190, render: (_, item) => <Space wrap>{Object.entries(item.statuses).map(([key, count]) => <StatusPill key={key} status={key === 'confirmed' ? 'muted' : 'warn'}>{statuses[key] || key} {count}</StatusPill>)}</Space> },
    { key: 'action', title: '操作', width: 100, render: (_, item) => <Button type="link" onClick={() => setSelected(item)}>查看详情</Button> },
  ]
  if (params.get('issueView') === 'pages') return <ApplicationUnderstandingPanel projectId={projectId} appId={appId} />
  return <section className="config-workspace config-workspace--fill" aria-label="应用级问题清单">
    <header className="config-workspace-heading"><div><h1>待处理问题</h1><p>先处理影响用例执行的问题。</p></div><Button loading={query.isFetching} onClick={() => void query.refetch()}>刷新</Button></header>
      {data && <div className="config-comparison-stats"><div className="config-comparison-stat"><span>待处理问题</span><strong>{data.summary.unique_issues}</strong></div><div className="config-comparison-stat"><span>受影响用例</span><strong>{data.summary.affected_cases}</strong></div><div className="config-comparison-stat"><span>当前版本已评估</span><strong>{data.summary.evaluated_cases} / {data.summary.total_cases}</strong></div></div>}
      <DataTable fill viewId="testing.application-issues" columns={columns} dataSource={data?.items} rowKey="id" loading={query.isPending} error={query.error} emptyTitle="当前筛选没有待处理问题" emptyHint="尚未评估的用例不计作无问题。" pagination={{ page, pageSize: 50, total: data?.total || 0, onChange: next => setPage(next) }} toolbar={<div className="config-toolbar"><Select aria-label="问题平台" value={platform} style={{ width: 140 }} onChange={value => { setPlatform(value); setPage(1) }} options={[{ value: '', label: '全部平台' }, ...['android', 'ios', 'web', 'pc'].map(value => ({ value, label: value }))]} /><Select aria-label="问题分类" value={category} style={{ width: 210 }} onChange={value => { setCategory(value); setPage(1) }} options={[{ value: '', label: '全部分类' }, ...Object.entries(categories).map(([value, label]) => ({ value, label }))]} /><Select aria-label="问题复核状态" value={status} style={{ width: 190 }} onChange={value => { setStatus(value); setPage(1) }} options={[{ value: '', label: '全部未解决问题' }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} /></div>} />
    <Drawer title="问题详情" width="min(560px, 100vw)" open={!!selected} onClose={() => setSelected(undefined)}>{selected && <><p>{selected.message}</p><p className="config-secondary">{categories[selected.category || 'unconfirmed']} · {selected.platform} · 出现 {selected.occurrences} 次</p>{selected.stale_occurrences > 0 && <p>有 {selected.stale_occurrences} 条记录已过期，需要重新复检。</p>}<h4>受影响用例</h4>{selected.cases.map(c => <div className="config-drawer-section" key={c.case_id}><Button type="link" onClick={() => { setSelected(undefined); openCase(c.case_id) }}>{c.name}</Button><span className="config-secondary">{c.item_ids.length} 条诊断{c.evaluated ? '' : ' · 当前版本尚未评估'}</span></div>)}<details><summary>诊断来源</summary><p className="config-secondary">{selected.origin} · {selected.reason_code}</p></details></>}</Drawer>
  </section>
}
