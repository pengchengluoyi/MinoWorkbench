import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { request } from '@/lib/request'
import { Button, errText } from '@/ui'
import { projectHref } from '../workbench/projectNavigation'

type Task = { run_id: string; app_id: string; name: string; status: string; outcome: string; reason: string;
  total: number | null; completed: number | null; passed: number | null; failed: number | null; started_at: string; finished_at: string }
type Page = { items: Task[]; total: number; offset: number; limit: number }
const labels: Record<string, string> = { queued: '排队中', pending: '等待中', preparing: '准备中', running: '执行中',
  done: '已结束', completed: '已结束', finished: '已结束', passed: '已通过', failed: '失败', blocked: '阻塞', cancelled: '已取消', interrupted: '已中断', unknown: '记录不可用' }
const live = new Set(['queued', 'pending', 'preparing', 'running'])
export function WorkspaceTasks({ base, projectId }: { base: string; projectId: string }) {
  const [offset, setOffset] = useState(0)
  const query = useQuery({ queryKey: ['workspace-tasks', base, offset], queryFn: async () =>
    (await request<Page>({ url: base + '/runs', params: { offset, limit: 20 } })).data!, retry: false,
    refetchInterval: q => q.state.error ? false : q.state.data?.items.some(t => live.has(t.status)) ? 2000 : 15000 })
  if (query.isPending) return <p role="status">正在读取任务…</p>
  if (query.error) return <p role="alert">{errText(query.error)} <Button onClick={() => void query.refetch()}>重试</Button></p>
  return <section aria-label="工作区任务列表">
    <p>共 {query.data?.total || 0} 个任务 <Button size="small" onClick={() => void query.refetch()}>刷新</Button></p>
    {!query.data?.items.length && <p role="status">{offset ? '这一页没有任务，请返回上一页。' : '当前工作区还没有任务。在对话中发起测试后，任务会显示在这里。'}</p>}
    {query.data?.items.map(task => <article className="steward-run-card" key={task.run_id}>
      <strong>{task.name}</strong> <span>{task.outcome === 'not_executed' ? '未执行' : labels[task.status] || task.status}</span>
      {task.started_at && <p>开始：<time dateTime={task.started_at}>{new Date(task.started_at).toLocaleString()}</time></p>}
      <p>已完成 {task.completed ?? '—'} / {task.total ?? '—'} · 通过 {task.passed ?? '—'} · 失败 {task.failed ?? '—'}</p>
      {live.has(task.status) && task.total != null && task.total > 0 && task.completed != null && <progress aria-label="任务进度" max={task.total} value={task.completed} />}
      {task.reason && <p>{task.reason}</p>}
      {task.status !== 'unknown' && <Link to={projectHref(projectId, { tab: 'tasks', run: task.run_id, appId: task.app_id })}>查看任务详情</Link>}
    </article>)}
    {(offset > 0 || (query.data?.total || 0) > 20) && <nav aria-label="任务分页">
      <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>上一页</Button>
      <span> 第 {Math.floor(offset / 20) + 1} 页 </span>
      <Button disabled={offset + 20 >= (query.data?.total || 0)} onClick={() => setOffset(offset + 20)}>下一页</Button>
    </nav>}
  </section>
}
