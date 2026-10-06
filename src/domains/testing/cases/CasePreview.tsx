import type { CSSProperties } from 'react'
import { Button } from '@/ui'
import type { CaseRow } from '@/api/projectCases'
import { ScriptField } from './ScriptField'

/** 点开一条用例。三栏从左到右是前置、操作、预期，和列表同一套原文/预览。 */
export function CasePreview({ row, onBack }: { row: CaseRow; onBack: () => void }) {
  const meta = [row.module, row.platform].filter(Boolean).join(' · ')
  return (
    <div className="flex h-full min-h-0 flex-col" style={{ gap: 12 }}>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="small" onClick={onBack}>返回列表</Button>
        <strong className="truncate" style={{ fontSize: 18 }}>{row.title || row.case_id}</strong>
        <span className="w-mono" style={{ color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-sm)' }}>{row.case_id}</span>
        {meta ? <span style={{ color: 'var(--w-text-tertiary)', fontSize: 12 }}>{meta}</span> : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.8fr) minmax(220px, 1.1fr) minmax(220px, 1.1fr)', gap: 12, alignContent: 'start' }}>
        <section style={card}>
          <h2 style={heading}>前置条件</h2>
          <ScriptField kind="pre" value={row.precondition} max={80} />
        </section>
        <section style={card}>
          <h2 style={heading}>操作步骤</h2>
          <ScriptField kind="op" value={row.steps || row.steps_raw} max={80} />
        </section>
        <section style={card}>
          <h2 style={heading}>预期结果</h2>
          <ScriptField kind="ex" value={row.expected || row.expected_raw} max={80} />
        </section>
      </div>
    </div>
  )
}

const card: CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  padding: 14,
}
const heading: CSSProperties = { margin: '0 0 8px', fontSize: 14, fontWeight: 700 }
