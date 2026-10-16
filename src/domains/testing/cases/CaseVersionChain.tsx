import { CaseCompileJobs, compileStatus } from './CaseCompileJobs'
import { useQuery } from '@tanstack/react-query'
import { getV5Preview, type V5Preview } from '@/api/v5'
import { useSession } from '@/lib/session'
import { unwrapOne } from '@/lib/unwrap'
import { Button, StatusPill, errText } from '@/ui'
import { caseVersionSummary, compareCaseSources, revisionLabel } from './caseVersions'
import './CaseVersionChain.css'

export function CaseVersionStatus({ row }: { row: Record<string, unknown> }) {
  const version = caseVersionSummary(row)
  return <div className="case-version-status"><span>{row.compile_state ? compileStatus[String(row.compile_state)] || String(row.compile_state) : version.understood ? '已保存理解' : '理解状态见详情'}</span>{version.frozenRevision ? <StatusPill status={version.match === 'changed' ? 'warn' : 'muted'}>发布 {version.frozenRevision}{version.match === 'changed' ? ' · 原文有变化' : ''}</StatusPill> : null}</div>
}

export function CaseVersionChain({ row, projectId, strictWeb = false, execution = false, context }: { row: Record<string, unknown>; projectId?: string; strictWeb?: boolean; execution?: boolean; context?: Record<string, unknown> }) {
  const owner = useSession(state => state.user?.user_id || '')
  const preview = useQuery({
    queryKey: ['v5-preview', owner, projectId, row.case_id],
    enabled: !execution && strictWeb && !!projectId && !!row.case_id,
    queryFn: async () => unwrapOne<V5Preview>(await getV5Preview(projectId!, String(row.case_id))),
  })
  const version = caseVersionSummary(row)
  const historicalRevision = revisionLabel(context?.frozen_revision)
  const draftRevision = revisionLabel(preview.data?.draft_revision)
  const draftMatch = preview.data ? compareCaseSources(row, preview.data.source || {}) : 'unknown'
  return <section className="case-version-chain" aria-label={execution ? '本次执行版本来源' : '用例版本与理解来源'}>
    <div className="case-version-heading"><strong>{execution ? '本次执行的来源' : '原文、理解与发布'}</strong><span>{execution ? '仅使用执行返回的记录，当前编辑不改写历史。' : '普通解析用于理解展示；严格 Web 运行使用已冻结发布的计划。'}</span></div>
    <ol>
      <li><span className="case-version-number">1</span><div><strong>{execution ? '执行返回的原文' : '当前原文'}</strong><p>{version.sourceRevision || '原文版本号未返回'}；原文完整展示。</p></div></li>
      <li><span className="case-version-number">2</span><div><strong>{version.understood ? '已保存的普通理解' : '普通理解未返回'}</strong><p>{version.understood ? (row.effective_artifact ? `已保存产物关联原文 r${String((row.effective_artifact as Record<string, unknown>).source_revision)}；最新任务状态见下方。` : '尚无当前有效编译产物；历史理解不代表最新原文可执行。') : '保留原文，不将缺少解析解释为未编译。'}</p></div></li>
      <li><span className="case-version-number">3</span><div><strong>{execution ? `本次冻结计划 ${historicalRevision || '版本未返回'}` : `已发布计划 ${version.frozenRevision || '记录未返回'}`}</strong><p>{execution ? `执行模式：${context?.execution_mode === 'v5' ? '严格 Web' : context?.execution_mode === 'legacy' ? '普通执行' : '未返回'}；以本次核验证据为准。` : version.match === 'changed' ? '已发布原文与当前原文不同，需要重新审阅；旧执行仍使用当时的计划。' : version.match === 'same' ? '已发布原文与当前三段原文一致；其他配置变更仍需核对。' : '缺少完整发布原文，暂不能确认与当前原文一致。'}</p></div></li>
    </ol>
    {!execution && projectId && row.case_id ? <CaseCompileJobs projectId={projectId} caseId={String(row.case_id)} /> : null}
    {!execution && strictWeb ? <div className="case-version-draft">{preview.isPending ? <span role="status">正在读取严格草稿版本…</span> : preview.isError ? <span role="alert">草稿读取失败：{errText(preview.error)} <Button size="small" onClick={() => void preview.refetch()}>重试版本读取</Button></span> : <span>严格草稿 {draftRevision || '版本未返回'} · {draftMatch === 'changed' ? '草稿原文与当前记录不同，请重新读取或编译' : draftMatch === 'same' ? '草稿原文与当前记录一致' : '原文关联未能确认'} · {preview.data?.eligible === true ? '结构资格已通过，仍需人工审阅并发布' : '资格尚未通过或未返回，见下方原因'}</span>}</div> : null}
  </section>
}
