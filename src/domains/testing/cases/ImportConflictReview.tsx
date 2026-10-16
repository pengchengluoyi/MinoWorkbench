import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button, Select, errText } from '@/ui'
import type { ImportPreviewRow } from '@/api/projectCases'
import { projectCaseOptions } from './queries'
import { recordOf } from './caseUnderstanding'
import { CaseScriptSections } from './CaseScriptSections'

export function ImportConflictReview({ projectId, row, busy, onChange }: { projectId: string; row: ImportPreviewRow; busy: boolean; onChange: (value: string) => void }) {
  const conflict = recordOf(row.conflict)
  const target = typeof conflict.existing_case_id === 'string' ? conflict.existing_case_id.trim() : ''
  const previous = useQuery({ ...projectCaseOptions(projectId, target), enabled: !!target })
  const verified = previous.isSuccess && previous.data?.case_id === target
  useEffect(() => {
    if (row.on_conflict === 'overwrite' && (!target || previous.isError || previous.data && !verified)) onChange('skip')
  }, [row.on_conflict, target, previous.isError, previous.data, verified, onChange])
  return <section className="case-import-conflict-review" aria-label="覆盖目标核对">
    <div className="case-import-conflict"><div><strong>{conflict.content_match ? '服务端报告内容匹配' : '服务端报告用例冲突'}</strong><span>{target ? `覆盖目标：${target} · ${String(conflict.existing_name || previous.data?.title || '名称未返回')}` : '服务端未提供目标编号，本次仅支持跳过。'}</span>{conflict.existing_requirement_title ? <span>现有需求：{String(conflict.existing_requirement_title)}</span> : null}{conflict.requirement_changed ? <span>覆盖还会改变需求分组，请核对目标。</span> : null}</div><Select aria-label="冲突处理" size="small" disabled={busy} value={String(row.on_conflict || 'skip')} options={[{value:'skip',label:'跳过，保留现有用例'},{value:'overwrite',label:'覆盖此编号的用例',disabled:!target || !verified}]} onChange={value => { if (value !== 'overwrite' || target && verified) onChange(value) }} /></div>
    {target && previous.isPending ? <p role="status">正在读取覆盖目标的现有原文…</p> : null}
    {previous.isError ? <div role="alert" className="case-import-error">覆盖目标读取失败：{errText(previous.error)}<Button size="small" onClick={() => void previous.refetch()}>重新读取目标</Button></div> : null}
    {previous.data && previous.data.case_id !== target ? <p role="alert" className="case-import-error">返回的用例编号与覆盖目标不一致，请重新读取目标；本次仅支持跳过。</p> : null}
    {previous.data && previous.data.case_id === target ? <div className="case-import-existing-source"><h3>现有用例原文 · {target}</h3><CaseScriptSections row={previous.data} /><p>覆盖将更新原文与本次解析；执行资格需要重新核对。当前内容用于人工比对，不代表服务端并发版本锁。</p></div> : null}
    <h3 className="case-import-incoming-label">本次导入原文与理解</h3>
  </section>
}
