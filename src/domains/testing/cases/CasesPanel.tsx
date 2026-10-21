import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PlatformInput } from '@/constants/appPlatforms'
import { useSession } from '@/lib/session'
import { useSearchParams } from 'react-router-dom'
import { CircleSlash, ExternalLink, Search, TriangleAlert, Upload } from 'lucide-react'
import {
  Button, Drawer, DataTable, EmptyState, Input, Modal, PageHeader, Select, Segmented, Skeleton, StatusPill, errText, useFeedback,
  type DataColumn,
} from '@/ui'
import { deleteProjectCases, type CaseRow } from '@/api/projectCases'
import { SavedCaseReadingView } from './SavedCaseReadingView'
import { CasePreviewLegend } from './CaseScriptSections'
import { CaseAutomationBadge } from './CaseAutomationBadge'
import { RunBar, type DispatchedRun } from './RunBar'
import { CasePreview } from './CasePreview'
import { caseKeys, useCaseModules, useCasePage, useLastResults, useProjectCase, type LastResult } from './queries'
import { beginListNavigation, useListPerformance } from '../workbench/performance'

const CaseImportDialog = lazy(() => import('./CaseImportDialog').then(module => ({ default: module.CaseImportDialog })))

type ResultFilter = 'all' | 'failed' | 'never'

const EMPTY_RESULTS: Record<string, LastResult> = {}
const EMPTY_CASES: CaseRow[] = []

/**
 * 用例面板 —— 产品的主动作入口。
 *
 * 设计见 docs/交互设计.md §二。与原实现的三处关键差异：
 * 1. 选择即准备下发，主动作常驻视野（RunBar）
 * 2. 模块树降级为筛选器，不当导航
 * 3. 下发后**不跳页**，就地出现执行条
 */
type CasesPanelProps = { appId: string; projectId: string; platforms?: PlatformInput }
export function CasesPanel(props: CasesPanelProps) {
  const accountId = useSession(state => state.user?.user_id || '')
  const [importOpen, setImportOpen] = useState(false)
  const [importLoaded, setImportLoaded] = useState(false)
  const [importSession, setImportSession] = useState(0)
  useEffect(() => { setImportOpen(false); setImportLoaded(false) }, [props.projectId, accountId])
  return <>
    <CasesPanelContent {...props} onImport={() => { setImportSession(value => value + 1); setImportLoaded(true); setImportOpen(true) }} />
    {importLoaded && <Suspense fallback={importOpen ? <Modal open title="正在打开用例导入" footer={null} onCancel={() => setImportOpen(false)}><Skeleton active paragraph={{ rows: 3 }} /></Modal> : null}>
      <CaseImportDialog key={`${props.projectId}:${props.appId}:${accountId}:${importSession}`} projectId={props.projectId} appId={props.appId} open={importOpen} onClose={() => setImportOpen(false)} />
    </Suspense>}
  </>
}
function CasesPanelContent({ appId, projectId, platforms, onImport }: CasesPanelProps & { onImport: () => void }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()

  const moduleKey = params.get('caseModule') || ''
  const kw = params.get('caseSearch') || ''
  const resultValue = params.get('caseResult') || 'all'
  const resultFilter: ResultFilter = resultValue === 'failed' || resultValue === 'never' ? resultValue : 'all'
  const pageValue = Number(params.get('casePage'))
  const page = Number.isFinite(pageValue) ? Math.max(1, Math.trunc(pageValue) || 1) : 1
  const sizeValue = Number(params.get('caseSize'))
  const size = [20, 50, 100, 200].includes(sizeValue) ? sizeValue : 50
  const settledSearch = useDebouncedValue(kw)
  const cases = useCasePage(projectId, { appId, page, size, search: settledSearch, module: moduleKey, result: resultFilter })
  const modules = useCaseModules(projectId)
  const rows = cases.data?.items ?? EMPTY_CASES
  useListPerformance(appId, 'cases', cases.isSuccess && !params.get('case'), cases.isError, !!cases.data,
    JSON.stringify([page, size, kw, moduleKey, resultFilter]))
  const lastResults = useLastResults(appId, rows.map((row) => row.case_id))

  const updateFilters = (patch: Record<string, string>, resetPage = true) => {
    beginListNavigation(appId, 'cases')
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    next.delete('case')
    if (resetPage) next.delete('casePage')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    if (cases.isSuccess && !cases.isFetching && page > Math.max(1, Math.ceil(cases.data.total / size))) {
      const next = new URLSearchParams(params)
      next.set('casePage', String(Math.max(1, Math.ceil(cases.data.total / size))))
      setParams(next, { replace: true })
    }
  }, [cases.isSuccess, cases.isFetching, cases.data, page, size, params, setParams])
  const [selected, setSelected] = useState<React.Key[]>([])
  const [selectionLabels, setSelectionLabels] = useState<Record<string, string>>({})
  useEffect(() => { if (rows.length) setSelectionLabels(prev => ({ ...prev, ...Object.fromEntries(rows.map(row => [row.case_id, row.title || row.case_id])) })) }, [rows])
  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteProjectCases(projectId, ids),
    onSuccess: (_res, ids) => {
      setSelected(prev => prev.filter(id => !ids.includes(String(id))))
      if (ids.includes(params.get('case') || '')) {
        const next = new URLSearchParams(params)
        next.delete('case')
        setParams(next, { replace: true })
      }
      void qc.invalidateQueries({ queryKey: caseKeys.list(projectId) })
      fb.ok(`已删除 ${ids.length} 条用例`)
    },
    onError: (error) => fb.fail(errText(error, '删除失败')),
  })
  const removeSelected = async () => {
    const ids = selected.map(String)
    if (!ids.length) return
    const ok = await fb.confirm({
      title: `删除选中的 ${ids.length} 条用例？`,
      content: <div><p>删除后不能从这里恢复。包含不在当前页的已选用例，请核对完整清单。</p><ul style={{ maxHeight: 280, overflow: 'auto', paddingLeft: 20 }}>{ids.map(id => <li key={id} style={{ overflowWrap: 'anywhere' }}>{selectionLabels[id] || '名称未读取'} · {id}</li>)}</ul></div>,
      okText: '删除',
      danger: true,
    })
    if (ok) remove.mutate(ids)
  }
  const [dispatched, setDispatched] = useState<DispatchedRun | null>(null)
  const previewId = params.get('case') || ''
  const preview = useProjectCase(projectId, previewId)

  // 使用稳定空对象，避免列表列配置在每次渲染时重建。
  const results = lastResults.data ?? EMPTY_RESULTS

  const columns = useMemo<DataColumn<CaseRow>[]>(() => [
    {
      key: 'title', title: '用例', width: '18%', alwaysVisible: true,
      render: (_: unknown, row) => {
        const last = results[row.case_id]
        return <div className="case-identity">
          <div className="case-identity-title">{row.title || '未命名用例'}</div>
          <div className="case-identity-meta">{row.module || '未分组'} · {row.platform || '未指定'}</div>
          <div className="case-identity-badges">
            <CaseAutomationBadge row={row} />
            <StatusPill status={last?.status === 'pass' ? 'pass' : last?.status === 'fail' ? 'fail' : 'muted'}>{lastResults.isError ? '结果暂不可用' : !lastResults.isSuccess ? '读取结果中' : !last ? '未跑过' : last.status === 'pass' ? '通过' : last.status === 'fail' ? '失败' : '其他'}</StatusPill>
          </div>
          {last?.status === 'fail' && last.reason ? <div className="case-identity-reason">{last.reason}</div> : null}
          <div><Button size="small" onClick={() => {
            const next = new URLSearchParams(params)
            next.set('case', row.case_id)
            setParams(next)
          }}>用例操作</Button></div>
        </div>
      },
    },
    {
      key: 'preview', title: '原文与解析', width: '82%', alwaysVisible: true,
      render: (_: unknown, row) => <SavedCaseReadingView key={row.case_id} projectId={projectId} row={row} />,
    },
  ], [projectId, params, setParams, results, lastResults.isError, lastResults.isSuccess])

  if (!projectId) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-warn)' }} />}
          title="缺少项目信息"
          hint="用例挂在项目下，这个链接里没有 projectId。从项目列表重新进入即可。"
        />
      </Card>
    )
  }

  if (cases.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />


  if (cases.isSuccess && !cases.data?.total && !params.get('case') && !kw && !moduleKey && resultFilter === 'all') {
    return (
      <section className="w-content-page">
        <PageHeader title="用例" />
        <Card>
          <EmptyState
            icon={<CircleSlash size={28} strokeWidth={1.5} />}
            title="这个项目还没有用例"
            hint="从表格导入。导入前会先预览，冲突的行默认跳过。"
            action={<Button size="small" icon={<Upload size={13} />} onClick={onImport}>导入用例</Button>}
          />
        </Card>
      </section>
    )
  }

  return (
    <div className="case-library flex flex-col" style={{ minHeight: 0, height: '100%' }}>
      <PageHeader title="用例" count={cases.data?.total} extra={<Button icon={<Upload size={14} />} onClick={onImport}>导入用例</Button>} />
      {/* 下发后就地展示，不跳页 —— 用户不丢上下文 */}
      {dispatched && (
        <div
          className="flex flex-wrap items-center gap-3"
          style={{
            marginBottom: 'var(--w-space-3)',
            padding: '10px 14px',
            borderRadius: 'var(--w-radius-lg)',
            background: 'var(--w-running-bg)',
            border: '1px solid var(--w-running)',
          }}
        >
          <StatusPill status="running">执行中</StatusPill>
          <span style={{ fontSize: 'var(--w-font-base)', fontWeight: 650, color: 'var(--w-text)' }}>
            已下发 {dispatched.caseCount} 条用例
          </span>
          <span style={{ flex: 1 }} />
          <Button
            size="small"
            icon={<ExternalLink size={13} />}
            href={`?tab=tasks&run=${encodeURIComponent(dispatched.runId)}&appId=${encodeURIComponent(appId)}`}
          >
            查看执行详情
          </Button>
          <Button size="small" type="text" onClick={() => setDispatched(null)}>知道了</Button>
        </div>
      )}

      <div className="case-library-filters">
        <Select aria-label="模块筛选" value={moduleKey} onChange={value => updateFilters({ caseModule: value })} options={[{ value: '', label: '全部模块' }, ...(modules.data?.items || []).map(item => ({ value: item.name, label: item.name }))]} />
        <Input
          allowClear
          size="small"
          prefix={<Search size={13} style={{ color: 'var(--w-text-quaternary)' }} />}
          placeholder="搜索用例"
          value={kw}
          onChange={(e) => updateFilters({ caseSearch: e.target.value })}
          style={{ width: 200 }}
        />
        <Segmented
          size="small"
          value={resultFilter}
          onChange={(value) => updateFilters({ caseResult: String(value) })}
          options={[
            { value: 'all', label: '全部' },
            { value: 'failed', label: '上次失败' },
            { value: 'never', label: '未跑过' },
          ]}
        />
      </div>
          <DataTable<CaseRow>
            viewId="testing.cases"
            toolbar={<div className="case-library-toolbar"><CasePreviewLegend /><strong>用例清单 · {rows.length}</strong></div>}
            columns={columns}
            dataSource={rows}
            rowKey="case_id"
            rowLabel={row => row.title || '未命名用例'}
            renderCard={row => {
              const last = results[row.case_id]
              return <><strong className="w-record-title">{row.title || '未命名用例'}</strong><div className="w-record-meta">{row.module || '未分组'}{row.platform ? ` · ${row.platform}` : ''}</div><StatusPill status={last?.status === 'pass' ? 'pass' : last?.status === 'fail' ? 'fail' : 'muted'}>{lastResults.isError ? '结果暂不可用' : !lastResults.isSuccess ? '读取结果中' : !last ? '未跑过' : last.status === 'pass' ? '通过' : last.status === 'fail' ? '失败' : '其他'}</StatusPill><Button size="small" onClick={() => { const next = new URLSearchParams(params); next.set('case', row.case_id); setParams(next) }}>用例操作</Button><SavedCaseReadingView key={row.case_id} projectId={projectId} row={row} /></>
            }}
            loading={cases.isFetching && !cases.data}
            error={cases.isError ? cases.error : undefined}
            onRetry={() => void cases.refetch()}
            pagination={{ page, pageSize: size, total: cases.data?.total || 0,
              onChange: (next, nextSize) => updateFilters({ casePage: String(next), caseSize: String(nextSize) }, false) }}
            fill
            virtualThreshold={Infinity}
            selection={{
              selectedKeys: selected,
              onChange: setSelected,
              actions: null,
            }}
            emptyTitle="没有匹配的用例"
            emptyHint="调整模块、搜索或结果筛选试试。原文与解析直接显示在对应行内。"
          />
      <Drawer title="用例操作" width="min(1080px, 100vw)" open={!!previewId} onClose={() => { const next = new URLSearchParams(params); next.delete('case'); setParams(next, { replace: true }) }} destroyOnHidden>
        {previewId && (preview.isPending ? <Skeleton active paragraph={{ rows: 8 }} /> : preview.isError ? <EmptyState title="用例详情读取失败" hint={errText(preview.error)} action={<Button onClick={() => void preview.refetch()}>重试</Button>} /> : <CasePreview key={previewId} row={preview.data!} projectId={projectId} appId={appId} platforms={platforms} />)}
      </Drawer>
      {lastResults.isError ? <span role="alert" style={{ color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)' }}>上次结果读取失败。<Button size="small" type="text" onClick={() => void lastResults.refetch()}>重试</Button></span> : null}
      {modules.isError ? <span role="alert" style={{ color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)' }}>模块统计读取失败。<Button size="small" type="text" onClick={() => void modules.refetch()}>重试</Button></span> : null}

      <RunBar
        appId={appId}
        projectId={projectId}
        selected={selected.map(String)}
        labels={selectionLabels}
        currentPageIds={rows.map(row => row.case_id)}
        onClear={() => setSelected([])}
        deleting={remove.isPending}
        onDelete={() => void removeSelected()}
        onDispatched={(run) => { setDispatched(run); setSelected([]) }}
      />
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
