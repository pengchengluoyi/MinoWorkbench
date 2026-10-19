import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { CaseRow } from '@/api/projectCases'
import { projectCaseOptions } from './queries'
import { hasSavedUnderstanding } from './caseUnderstanding'
import { CaseReadingView } from './CaseReadingView'

/** Each list row owns its complete preview. Only fetch missing detail near the viewport. */
export function SavedCaseReadingView({ projectId, row }: { projectId: string; row: CaseRow }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const supplied = hasSavedUnderstanding(row)
  useEffect(() => {
    const element = ref.current
    if (!element || supplied) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '100px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [supplied, row.case_id])
  const detail = useQuery({ ...projectCaseOptions(projectId, row.case_id), enabled: !supplied && visible && !!projectId && !!row.case_id })
  return <div ref={ref} data-case-preview={row.case_id}>
    <CaseReadingView row={detail.data || row} status={supplied || detail.isSuccess ? 'ready' : detail.isError ? 'error' : 'loading'} onRetry={() => void detail.refetch()} />
  </div>
}
