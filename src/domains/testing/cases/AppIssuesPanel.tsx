import { useState } from 'react'
import { ApplicationUnderstandingPanel } from './ApplicationUnderstandingPanel'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { Button, errText } from '@/ui'

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
  const query = useQuery({ queryKey: ['app-issues', owner, projectId, appId, platform, category, status, page], enabled: Boolean(owner && projectId && appId),
    queryFn: async () => unwrapOne<Rollup>(await request({ url: `/project/${encodeURIComponent(projectId)}/apps/${encodeURIComponent(appId)}/issues`, method: 'get', params: { platform, category, status, page, size: 50 } })) })
  const data = query.data?.owner_user_id === owner && query.data.app_id === appId && query.data.project_id === projectId ? query.data : undefined
  const openCase = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', 'cases'); next.set('case', id)
    setParams(next)
  }
  return <section aria-label="应用级问题清单" style={{ overflow: 'auto', padding: 16 }}>
    <h2>应用级问题清单</h2>
    <p>范围：项目共享用例及本应用专属用例；目标诊断仅汇总本应用、当前账号可见记录。同类诊断合并不代表已确认同一根因，也不代表产品缺陷。</p>
    <label>平台 <input aria-label="平台" value={platform} placeholder="全部；如 web、android" onChange={e => { setPlatform(e.target.value.trim().toLowerCase()); setPage(1) }} /></label>{' '}
    <label>分类 <select aria-label="分类" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}><option value="">全部</option>{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{' '}
    <label>复核状态 <select aria-label="复核状态" value={status} onChange={e => { setStatus(e.target.value); setPage(1) }}><option value="">全部未解决诊断</option>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>{' '}
    <Button disabled={query.isFetching} onClick={() => void query.refetch()}>刷新清单</Button>
    {query.isPending ? <p role="status">正在汇总问题</p> : query.error ? <p role="alert">读取失败：{errText(query.error)}。请重试刷新。</p> : data ? <>
      <p>去重问题 {data.summary.unique_issues} · 诊断出现 {data.summary.occurrences} 次 · 受影响用例 {data.summary.affected_cases}</p>
      <p>已评估 {data.summary.evaluated_cases} / {data.summary.total_cases} · 未评估 {data.summary.unevaluated_cases} · 已评估中有诊断 {data.summary.evaluated_affected_cases} / {data.summary.evaluated_cases || '—'}</p>
      <p>已评估指当前原文版本完成编译评估（成功或失败）；未评估不算无问题，以上不是业务通过率。分类和状态筛选只改变问题计数，不缩小评估分母。</p>
      <p>汇总时间：{data.as_of}</p>
      <table><thead><tr><th>平台</th><th>已评估 / 总用例</th><th>受影响用例</th></tr></thead><tbody>{data.platforms.map(row => <tr key={row.platform}><td>{row.platform}</td><td>{row.evaluated_cases} / {row.total_cases}</td><td>{row.affected_cases}</td></tr>)}</tbody></table>
      {!data.items.length ? <p>当前筛选没有诊断；不表示全部用例已评估或业务已通过。</p> : data.items.map(item => <article key={item.id} style={{ borderTop: '1px solid var(--w-border)', paddingBlock: 12 }}>
        <strong>{categories[item.category || 'unconfirmed'] || item.category} · {item.platform} · {item.reason_code}</strong>
        <p>{item.message}</p><p>来源 {item.origin} · {item.occurrences} 次 · {item.affected_cases} 个用例{item.stale_occurrences ? ` · ${item.stale_occurrences} 条目标诊断已过期，需复检` : ''}</p>
        <p>{Object.entries(item.statuses).map(([s, count]) => `${statuses[s] || s} ${count}`).join(' · ')}</p>
        <details><summary>查看受影响用例（{item.cases.length}）</summary><ul>{item.cases.map(c => <li key={c.case_id}><Button onClick={() => openCase(c.case_id)}>{c.name}</Button> · {c.item_ids.length} 条诊断{!c.evaluated ? ' · 当前版本未完成评估' : ''}</li>)}</ul></details>
      </article>)}
      <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button> <span>第 {page} 页 / 共 {Math.max(1, Math.ceil(data.total / data.size))} 页</span> <Button disabled={page * data.size >= data.total} onClick={() => setPage(page + 1)}>下一页</Button>
    </> : null}
    <ApplicationUnderstandingPanel projectId={projectId} appId={appId} />
  </section>
}
