import { ListChecks, MousePointer2, ShieldCheck } from 'lucide-react'
import { fieldPresentation, originalLines, type ScriptKind } from './caseUnderstanding'
import { ScriptField, type ScriptInteraction } from './ScriptField'

export function CasePreviewLegend() {
  return <div className="case-preview-note"><span>原文完整展示，彩色标注紧随对应片段；数字表示任务顺序；解析摘要、原文推断单独标明。</span><span className="case-preview-legend" data-tone="action">操作 / 逻辑</span><span className="case-preview-legend" data-tone="check">校验</span><span className="case-preview-legend" data-tone="advisory">说明 / 人工</span><span className="case-preview-legend" data-tone="attention">待处理</span></div>
}

export function CaseScriptSections({ row, status = 'ready', onRetry, interactionOf, emptyResultText }: { row: Record<string, unknown>; onRetry?: () => void; interactionOf?: (kind: ScriptKind) => ScriptInteraction; emptyResultText?: string; status?: 'ready' | 'loading' | 'pending' | 'error' | 'cancelled' | 'incomplete' }) {
  return <div className="case-script-grid">{(['pre', 'op', 'ex'] as ScriptKind[]).map((kind) => {
    const presentation = fieldPresentation(row, kind)
    const Icon = kind === 'pre' ? ListChecks : kind === 'op' ? MousePointer2 : ShieldCheck
    return <section key={kind} className="case-script-card" aria-label={kind === 'pre' ? '前置条件' : kind === 'op' ? '操作步骤' : '预期结果'}>
      <div className="case-script-card-header"><h2><Icon size={14} />{kind === 'pre' ? '前置条件' : kind === 'op' ? '操作步骤' : '预期结果'}</h2><span>{originalLines(presentation.value).length} {kind === 'pre' ? '项' : '步'}</span></div>
      <ScriptField {...presentation} kind={kind} status={status} onRetry={onRetry} interaction={interactionOf?.(kind)} emptyResultText={emptyResultText} />
    </section>
  })}</div>
}
