import { normalizePlatforms, type PlatformInput } from '@/constants/appPlatforms'
import { useState } from 'react'
import { Button, Drawer, Dropdown, Space } from '@/ui'
import type { CaseRow } from '@/api/projectCases'
import { CasePreviewLegend, CaseScriptSections } from './CaseScriptSections'
import { V5Publication } from './V5Publication'
import { CaseVersionChain } from './CaseVersionChain'
import { CaseReview } from './CaseReview'

/** 点开一条用例。三栏从左到右是前置、操作、预期，和列表同一套原文/预览。 */
export function CasePreview({ row, projectId, platforms, onBack }: { row: CaseRow; projectId: string; platforms?: PlatformInput; onBack: () => void }) {
  const scope = normalizePlatforms(row.platform || platforms).map(value => value.toLowerCase())
  const strictWeb = scope.length > 0 && scope.every(value => value === 'web')
  const [panel, setPanel] = useState('')
  const meta = [row.module, row.platform].filter(Boolean).join(' · ')
  const titles: Record<string, string> = { versions: '版本与编译', review: '问题复核', parsing: '解析详情', plan: '执行计划审阅', info: '用例信息' }
  return (
    <section className="task-detail">
      <header className="case-detail-heading">
        <div className="min-w-0"><h1>{row.title || '未命名用例'}</h1>{meta && <p className="w-record-meta">{meta}</p>}</div>
        <Space wrap><Button onClick={onBack}>返回用例</Button><Dropdown trigger={['click']} menu={{ items: ['versions', 'review', 'parsing', ...(strictWeb ? ['plan'] : []), 'info'].map(key => ({ key, label: titles[key] })), onClick: ({ key }) => setPanel(key) }}><Button>更多操作</Button></Dropdown></Space>
      </header>
      <div className="w-page-scroll" role="region" aria-label="用例内容" tabIndex={0}><CaseScriptSections row={row} plain /></div>
      <Drawer title={titles[panel]} width="min(1080px, 100vw)" open={!!panel} onClose={() => setPanel('')} destroyOnHidden>
        {panel === 'versions' && <CaseVersionChain row={row} projectId={projectId} strictWeb={strictWeb} />}
        {panel === 'review' && <CaseReview projectId={projectId} caseId={row.case_id} />}
        {panel === 'parsing' && <><CasePreviewLegend /><CaseScriptSections row={row} /></>}
        {panel === 'plan' && <V5Publication projectId={projectId} row={row} enabled={strictWeb} />}
        {panel === 'info' && <dl className="task-info"><div><dt>用例编号</dt><dd>{row.case_id}</dd></div><div><dt>模块</dt><dd>{row.module || '未分组'}</dd></div><div><dt>平台</dt><dd>{row.platform || '未指定'}</dd></div></dl>}
      </Drawer>
    </section>
  )
}
