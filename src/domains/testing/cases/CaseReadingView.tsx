import type { ComponentProps, ReactNode } from 'react'
import { CasePreviewLegend, CaseScriptSections } from './CaseScriptSections'
import './CaseReadingView.css'

/** UI contract: docs/contracts/case-preview-consistency.md. No summary/plain alternative. */
export function CaseReadingView({ showLegend = true, ...props }: ComponentProps<typeof CaseScriptSections> & { showLegend?: boolean }) {
  return <div className="case-reading-view">{showLegend ? <CasePreviewLegend /> : null}<CaseScriptSections {...props} /></div>
}

export function CaseReadingLayout({ list, children, listLabel, detailLabel, className = '' }: {
  list: ReactNode; children: ReactNode; listLabel: string; detailLabel: string; className?: string
}) {
  return <div className={`case-reading-layout ${className}`}>
    <aside className="case-reading-list" aria-label={listLabel}>{list}</aside>
    <section className="case-reading-detail" aria-label={detailLabel} tabIndex={0}>{children}</section>
  </div>
}
