import { useState } from 'react'
import { Play, Trash2, X } from 'lucide-react'
import { Button, Drawer } from '@/ui'
import { CreateTaskDialog } from '../tasks/CreateTaskDialog'
export interface DispatchedRun { runId: string; caseCount: number }
interface RunBarProps {
 appId: string; projectId: string; selected: string[]; labels: Record<string, string>; currentPageIds: string[]
 onClear: () => void; onRemove: (id: string) => void; onDispatched: (run: DispatchedRun) => void
 onDelete?: () => void; deleting?: boolean
}
export function RunBar({ appId, projectId, selected, labels, currentPageIds, onClear, onRemove, onDispatched, onDelete, deleting }: RunBarProps) {
 const [open, setOpen] = useState(false)
 const [review, setReview] = useState(false)
 if (!selected.length) return null
 const hidden = selected.filter(id => !currentPageIds.includes(id)).length
 return <><div className="w-run-bar"><strong>已选 {selected.length} 条{hidden > 0 ? ` · ${hidden} 条不在当前页` : ''}</strong>
  <Button disabled={deleting} onClick={() => setReview(true)}>核对所选</Button>
  <Button type="primary" disabled={deleting} icon={<Play size={14} />} onClick={() => setOpen(true)}>配置并执行</Button>
  {onDelete && <Button danger loading={deleting} icon={<Trash2 size={14} />} onClick={onDelete}>删除</Button>}
  <Button type="text" disabled={deleting} icon={<X size={14} />} aria-label="取消选择" onClick={onClear} />
 </div>
 <Drawer open={review} title={`全部所选 · ${selected.length} 条`} onClose={() => setReview(false)} width={560}>
  <p>翻页或改变筛选会保留选择；执行和删除针对这份完整清单。</p>
  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{selected.map(id => <li key={id} className="flex items-start justify-between gap-3" style={{ padding: '10px 0', borderBottom: '1px solid var(--w-border)' }}>
   <div className="min-w-0"><strong style={{ overflowWrap: 'anywhere' }}>{labels[id] || '名称未在本页读取'}</strong><div className="w-mono" style={{ overflowWrap: 'anywhere' }}>{id}</div><small>{currentPageIds.includes(id) ? '当前页' : '不在当前页，请核对编号'}</small></div>
   <Button disabled={deleting} size="small" aria-label={`移除所选 ${id}`} onClick={() => onRemove(id)}>移除</Button>
  </li>)}</ul>
 </Drawer>
 <CreateTaskDialog open={open} appId={appId} projectId={projectId} initialCaseIds={selected} onClose={() => setOpen(false)} onStarted={(runId) => { setOpen(false); onDispatched({ runId, caseCount: selected.length }) }} /></>
}
