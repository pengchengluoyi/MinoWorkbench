import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Select, useFeedback, errText } from '@/ui'
import { getAssistantRequestModules, reviseAssistantRequestScope, type PendingAssistantRequest, type MinoCard } from '@/api/assistant'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { assistantKeys } from './queries'
import { QueryProblem } from './AssistantNotReady'

export function ScopeEditor({ item, onResult, disabled }: { item: PendingAssistantRequest; onResult: (card: MinoCard) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<string[]>(Array.isArray(item.args.modules) ? item.args.modules.filter((v): v is string => typeof v === 'string') : typeof item.args.module === 'string' ? [item.args.module] : [])
  const incoming = useMemo(() => Array.isArray(item.args.modules) ? item.args.modules.filter((value): value is string => typeof value === 'string') : typeof item.args.module === 'string' ? [item.args.module] : [], [item.args])
  const [baseRevision, setBaseRevision] = useState(item.revision)
  const [baseSelection, setBaseSelection] = useState(JSON.stringify(incoming))
  const dirty = JSON.stringify(selected) !== baseSelection
  const stale = baseRevision !== item.revision
  useUnsavedChanges(open && dirty)
  useEffect(() => { if (dirty) return; setSelected(incoming); setBaseSelection(JSON.stringify(incoming)); setBaseRevision(item.revision) }, [item.id, item.revision, dirty, incoming])
  const qc = useQueryClient()
  const feedback = useFeedback()
  const modules = useQuery({ queryKey: [...assistantKeys.all, 'modules', item.id, item.revision], queryFn: () => getAssistantRequestModules(item.id), enabled: open })
  const change = useMutation({
    mutationFn: () => reviseAssistantRequestScope(item.id, baseRevision, selected),
    onSuccess: (data) => { onResult(data.card); setOpen(false); void qc.invalidateQueries({ queryKey: assistantKeys.all }) },
    onError: (error) => { feedback.fail(errText(error)); void qc.invalidateQueries({ queryKey: assistantKeys.all }) },
  })
  if (item.tool_id !== 'case.run' || !item.args.app_id) return null
  return <div style={{ marginTop: 12 }}>
    <Button size="small" disabled={disabled || change.isPending} onClick={() => setOpen(!open)}>调整测试范围</Button>
    {open ? <div style={{ marginTop: 12 }}>
      {stale && <p role="alert">请求范围已有新版本，旧草稿保留，不能直接提交。<Button onClick={() => { setSelected(incoming); setBaseSelection(JSON.stringify(incoming)); setBaseRevision(item.revision) }}>放弃草稿并读取新范围</Button></p>}
      <p style={{ fontSize: 13 }}>选择当前项目的一个或多个模块，合并范围后继续原请求。旧选项会失效，已提交的任务不受影响。</p>
      {modules.isError ? <QueryProblem error={modules.error} what="测试模块" onRetry={() => void modules.refetch()} /> : <Select aria-label="测试模块范围" disabled={disabled || change.isPending} mode="multiple" style={{ width: '100%' }} value={selected} loading={modules.isLoading} options={(modules.data?.items || []).map((m) => ({ value: m.name, label: `${m.name}（${m.count} 条）` }))} onChange={setSelected} />}
      <div className="flex gap-2" style={{ marginTop: 12 }}><Button type="primary" disabled={disabled || stale || !selected.length || !modules.data} loading={change.isPending} onClick={() => change.mutate()}>调整并继续</Button><Button onClick={() => setOpen(false)}>关闭范围编辑</Button></div>
    </div> : null}
  </div>
}
