import { CaseCompileJobs, compileStatus } from './CaseCompileJobs'
import './CaseVersionChain.css'

export function CaseVersionStatus({ row }: { row: Record<string, unknown> }) {
  return <span>{compileStatus[String(row.compile_state)] || '查看编译状态'}</span>
}

export function CaseVersionChain({ row, projectId, execution = false }: { row: Record<string, unknown>; projectId?: string; strictWeb?: boolean; execution?: boolean; context?: Record<string, unknown> }) {
  return <section className="case-version-chain" aria-label="编译与执行来源">
    <p>{execution ? '展示本次执行记录，当前编辑不会改写历史结果。' : '保存用例后自动编译，执行使用当前原文对应的最新有效产物，无需审批或发布。'}</p>
    {!execution && projectId && row.case_id ? <CaseCompileJobs projectId={projectId} caseId={String(row.case_id)} /> : null}
  </section>
}
