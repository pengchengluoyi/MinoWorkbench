import { Button } from '@/ui'
import type { CaseRow } from '@/api/projectCases'
import { CasePreviewLegend, CaseScriptSections } from './CaseScriptSections'
import { V5Publication } from './V5Publication'

/** 点开一条用例。三栏从左到右是前置、操作、预期，和列表同一套原文/预览。 */
export function CasePreview({ row, projectId, onBack }: { row: CaseRow; projectId: string; onBack: () => void }) {
  const meta = [row.module, row.platform].filter(Boolean).join(' · ')
  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 12 }}>
      <div className="case-preview-header shrink-0">
        <Button size="small" onClick={onBack}>返回列表</Button>
        <strong >{row.title || row.case_id}</strong>
        <span className="w-mono" style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>{row.case_id}</span>
        {meta ? <span style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{meta}</span> : null}
      </div>
      <CasePreviewLegend />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <CaseScriptSections row={row} />
        <V5Publication projectId={projectId} row={row} />
      </div>
    </div>
  )
}
