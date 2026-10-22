import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CaseRow } from '@/api/projectCases'
import { projectCaseOptions } from './queries'
import { caseCompilePhase, casePreviewSnapshot, hasStructuredPrograms } from './caseUnderstanding'
import { CaseReadingView } from './CaseReadingView'

/** 列表接口会截断正文；完整预览必须拉详情。懒加载仅控制何时请求。 */
export function SavedCaseReadingView({ projectId, row }: { projectId: string; row: CaseRow }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [row.case_id])
  const detail = useQuery({ ...projectCaseOptions(projectId, row.case_id), enabled: visible && !!projectId && !!row.case_id })
  const snapshot = casePreviewSnapshot(row)
  const previousSnapshot = useRef(snapshot)
  const { refetch } = detail
  useEffect(() => {
    if (!visible || previousSnapshot.current === snapshot) return
    previousSnapshot.current = snapshot
    void refetch()
  }, [visible, snapshot, refetch])
  const newerSource = Number(row.source_revision || 0) > Number(detail.data?.source_revision || 0)
  const merged = newerSource ? row : detail.data || row
  const compilePhase = caseCompilePhase(merged)
  const programsReady = hasStructuredPrograms(merged)
  const status = !detail.isSuccess && !detail.isError ? 'loading' : detail.isError ? 'error' : compilePhase === 'pending' && !programsReady ? 'pending' : 'ready'
  const emptyResultText = compilePhase === 'pending' && !programsReady
    ? '编译任务排队或执行中，完成后显示事件标注'
    : compilePhase === 'failed' && !programsReady
      ? '编译未成功，请在「用例操作 → 更多操作 → 编译状态」重试'
      : undefined
  return <div ref={ref} data-case-preview={row.case_id}>
    <CaseReadingView showLegend={false} row={merged} status={status} emptyResultText={emptyResultText} onRetry={() => void detail.refetch()} />
  </div>
}
