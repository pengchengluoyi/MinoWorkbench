import { createUUID } from '@/lib/uuid'
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, CircleCheck, CircleX, Info, LoaderCircle, Play, RefreshCw, Trash2, TriangleAlert, X } from 'lucide-react'
import { Button, Drawer, Segmented, StatusPill, errText } from '@/ui'
import { request } from '@/lib/request'
import { unwrapOne } from '@/lib/unwrap'
import { useSession } from '@/lib/session'
import { accountEpoch } from '@/lib/accountEpoch'
import { caseBase, compileStatus } from './CaseCompileJobs'
import { CreateTaskDialog } from '../tasks/CreateTaskDialog'
import styles from './RunBar.module.css'
export interface DispatchedRun { runId: string; caseCount: number }
interface RunBarProps {
 appId: string; projectId: string; selected: string[]; labels: Record<string, string>; currentPageIds: string[]
 onClear: () => void; onDispatched: (run: DispatchedRun) => void
 onDelete?: () => void; deleting?: boolean
}
type CompileResult = { id: string; jobId?: string; status?: string; error?: string }
export function RunBar(props: RunBarProps) {
 const owner = useSession(state => state.user?.user_id || '')
 return <ScopedRunBar key={`${owner}:${props.projectId}:${props.appId}`} {...props} owner={owner} />
}
function ScopedRunBar({ appId, projectId, selected, labels, currentPageIds, onClear, onDispatched, onDelete, deleting, owner }: RunBarProps & { owner: string }) {
 const [open, setOpen] = useState(false)
 const [busy, setBusy] = useState(false)
 const [results, setResults] = useState<CompileResult[]>([])
 const [total, setTotal] = useState(0)
 const [detailsOpen, setDetailsOpen] = useState(false)
 const [resultFilter, setResultFilter] = useState('all')
 const qc = useQueryClient()
 const active = useRef<AbortController | null>(null)
 const identities = useRef(new Map<string, { revision: number; requestId: string }>())
 useEffect(() => () => { active.current?.abort() }, [])
 const compile = async (ids: string[], retry = false) => {
  if (active.current || deleting || !ids.length) return
  const controller = new AbortController()
  active.current = controller
  const epoch = accountEpoch()
  const current = () => !controller.signal.aborted && epoch === accountEpoch()
  setBusy(true)
  setResultFilter('all')
  const next = retry ? results.filter(result => !ids.includes(result.id)) : []
  setTotal(next.length + ids.length)
  setResults([...next])
  try {
   for (const id of ids) {
    if (!current()) break
    const url = caseBase(projectId, id)
    try {
     const chain = unwrapOne<{ expected_revision: number }>(await request({ url: `${url}/version-chain`, method: 'get', signal: controller.signal }))
     if (!current()) break
     if (!chain || !Number.isInteger(chain.expected_revision)) throw new Error('未能读取用例原文版本')
     let identity = identities.current.get(id)
     if (!identity || identity.revision !== chain.expected_revision) {
      identity = { revision: chain.expected_revision, requestId: createUUID() }
      identities.current.set(id, identity)
     }
     const job = unwrapOne<{ job_id: string; status: string }>(await request({ url: `${url}/compile-jobs`, method: 'post', signal: controller.signal,
      data: { expected_revision: identity.revision, client_request_id: identity.requestId } }))
     if (!job?.job_id || !job.status) throw new Error('编译任务回执不完整，请重试确认提交结果')
     if (!current()) break
     identities.current.delete(id)
     next.push({ id, jobId: job.job_id, status: job.status })
    } catch (error) {
     if (!current()) break
     next.push({ id, error: errText(error) })
    }
    setResults([...next])
    for (const prefix of ['case-version-chain', 'case-review', 'v5-preview']) {
     void qc.invalidateQueries({ queryKey: [prefix, owner, projectId, id] })
    }
   }
  } finally {
   active.current = null
   if (current()) {
    setBusy(false)
    void qc.invalidateQueries({ queryKey: ['cases', projectId, owner] })
   }
  }
 }
 if (!selected.length && !results.length && !busy) return null
 const hidden = selected.filter(id => !currentPageIds.includes(id)).length
 const failed = results.filter(result => result.error)
 const disabled = deleting || busy
 const accepted = results.length - failed.length
 const visibleResults = resultFilter === 'failed' ? failed : results
 const summaryTitle = busy ? '正在提交编译任务' : failed.length ? accepted ? '部分任务提交失败' : '编译任务提交失败' : '编译任务已提交'
 const dismissResults = () => { setResults([]); setDetailsOpen(false); setResultFilter('all') }
 return <>
 <div className={`w-run-bar ${styles.dock}`}>
  {selected.length > 0 && <div className={styles.toolbar}>
   <div className={styles.selection}>
    <span className={styles.selectionIcon} aria-hidden="true"><Check size={16} /></span>
    <div>已选 <strong>{selected.length}</strong> 条用例{hidden > 0 && <small>{hidden} 条不在当前页</small>}</div>
   </div>
   <div className={styles.actions}>
    <Button disabled={disabled} loading={busy} icon={<RefreshCw size={14} />} onClick={() => void compile([...new Set(selected)])}>重新编译</Button>
    <Button type="primary" disabled={disabled} icon={<Play size={14} />} onClick={() => setOpen(true)}>配置并执行</Button>
    {onDelete && <Button danger disabled={busy} loading={deleting} icon={<Trash2 size={14} />} onClick={onDelete}>删除</Button>}
    <Button type="text" disabled={disabled} icon={<X size={14} />} aria-label="取消选择" onClick={onClear} />
   </div>
  </div>}
  {(busy || results.length > 0) && <section className={styles.summary} data-tone={busy ? 'running' : failed.length ? 'warn' : 'accepted'} aria-label="批量重新编译结果">
   <div className={styles.summaryContent}>
    <span className={styles.summaryIcon} aria-hidden="true">{busy ? <LoaderCircle size={18} className={styles.spinning} /> : failed.length ? <TriangleAlert size={18} /> : <CircleCheck size={18} />}</span>
    <div className={styles.summaryCopy}>
     <div className={styles.summaryTitle} role="status"><strong>{summaryTitle}</strong><span>{busy ? `${results.length} / ${total} 条已处理` : `${accepted} 条已提交${failed.length ? ` · ${failed.length} 条提交失败` : ''}`}</span></div>
     <p>提交不代表编译完成，最新状态请查看用例详情。</p>
    </div>
    <div className={styles.actions}>
     {failed.length > 0 && <Button size="small" disabled={disabled} onClick={() => void compile(failed.map(result => result.id), true)}>重试失败项</Button>}
     <Button size="small" type="text" onClick={() => setDetailsOpen(true)}>查看详情<ChevronRight size={14} /></Button>
     <Button size="small" type="text" disabled={busy} icon={<X size={14} />} aria-label="关闭编译结果" onClick={dismissResults} />
    </div>
   </div>
   {busy && <div className={styles.progress} role="progressbar" aria-label="编译任务提交进度" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length}><span style={{ width: `${total ? results.length / total * 100 : 0}%` }} /></div>}
  </section>}
 </div>
 <Drawer title="重新编译 · 提交详情" width="min(640px, 100vw)" open={detailsOpen} onClose={() => setDetailsOpen(false)}>
  <div className={styles.detailHeader}>
   <div className={styles.counts}><span>共 <strong>{total}</strong> 条</span><StatusPill status="muted">已提交 {accepted}</StatusPill>{failed.length > 0 && <StatusPill status="fail">提交失败 {failed.length}</StatusPill>}{busy && <span>待提交 {total - results.length}</span>}</div>
   <p className={styles.notice}><Info size={15} aria-hidden="true" />以下为提交时状态，实际编译进度请在用例详情查看。</p>
   <div className={styles.detailTools}>
    <Segmented aria-label="提交结果筛选" value={resultFilter} onChange={value => setResultFilter(String(value))} options={[{ label: `全部 ${results.length}`, value: 'all' }, { label: `仅失败 ${failed.length}`, value: 'failed' }]} />
    {failed.length > 0 && <Button size="small" disabled={disabled} icon={<RefreshCw size={13} />} onClick={() => void compile(failed.map(result => result.id), true)}>重试失败项</Button>}
   </div>
  </div>
  {visibleResults.length ? <ol className={styles.resultList}>{visibleResults.map(result => <li key={result.id} className={styles.result} data-failed={!!result.error}>
   <span className={styles.resultIcon} aria-hidden="true">{result.error ? <CircleX size={18} /> : <CircleCheck size={18} />}</span>
   <div className={styles.resultBody}>
    <div className={styles.resultHeading}><strong>{labels[result.id] || result.id}</strong><StatusPill status={result.error ? 'fail' : 'muted'}>{result.error ? '提交失败' : '已提交'}</StatusPill></div>
    {result.error ? <p className={styles.error}>{result.error}</p> : <>
     <p className={styles.jobStatus}>提交时：{compileStatus[result.status!] || result.status}</p>
     <details className={styles.receipt}><summary>任务编号</summary><code>{result.jobId}</code></details>
    </>}
   </div>
  </li>)}</ol> : <div className={styles.empty}>{busy ? '正在提交，请稍候…' : '没有提交失败的用例'}</div>}
 </Drawer>
 <CreateTaskDialog open={open} appId={appId} projectId={projectId} initialCaseIds={selected} onClose={() => setOpen(false)} onStarted={(runId) => { setOpen(false); onDispatched({ runId, caseCount: selected.length }) }} /></>
}
