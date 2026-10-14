import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'
import { useSearchParams } from 'react-router-dom'
import { CircleSlash, ExternalLink, Search, TriangleAlert, Upload } from 'lucide-react'
import {
  Button, DataTable, EmptyState, Input, Segmented, Skeleton, StatusPill, errText, useFeedback,
  type DataColumn,
} from '@/ui'
import { deleteProjectCases, type CaseRow } from '@/api/projectCases'
import { ModuleFilter } from './ModuleFilter'
import { SavedScriptField } from './SavedScriptField'
import { RunBar, type DispatchedRun } from './RunBar'
import { CaseImportDialog } from './CaseImportDialog'
import { CasePreview } from './CasePreview'
import { caseKeys, useCaseModules, useCasePage, useLastResults, useProjectCase, type LastResult } from './queries'
import { beginListNavigation, useListPerformance } from '../workbench/performance'

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
export function CasesPanel({ appId, projectId }: { appId: string; projectId: string }) {
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
  const cases = useCasePage(projectId, { appId, page, size, search: kw, module: moduleKey, result: resultFilter })
  const modules = useCaseModules(projectId)
  const rows = cases.data?.items ?? EMPTY_CASES
  useListPerformance(appId, 'cases', cases.isSuccess && !params.get('case'), cases.isError, !!cases.data,
    JSON.stringify([page, size, kw, moduleKey, resultFilter]))
  const lastResults = useLastResults(appId, rows.map((row) => row.case_id))

  const [filterCollapsed, setFilterCollapsed] = usePersistedFlag('mino.cases.modules', false)
  const updateFilters = (patch: Record<string, string>, resetPage = true) => {
    beginListNavigation(appId, 'cases')
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (resetPage) next.delete('casePage')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    if (cases.isSuccess && page > 1 && !rows.length && cases.data.total > 0) {
      const next = new URLSearchParams(params)
      next.set('casePage', String(Math.ceil(cases.data.total / size)))
      setParams(next, { replace: true })
    }
  }, [cases.isSuccess, cases.data, page, rows.length, size, params, setParams])
  const [selected, setSelected] = useState<React.Key[]>([])
  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteProjectCases(projectId, ids),
    onSuccess: (_res, ids) => {
      setSelected([])
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
      content: '删除后不能从这里恢复。',
      okText: '删除',
      danger: true,
    })
    if (ok) remove.mutate(ids)
  }
  const [dispatched, setDispatched] = useState<DispatchedRun | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const previewId = params.get('case') || ''
  const preview = useProjectCase(projectId, previewId)

  // 每次渲染都写 `data || {}` 会造出新对象，下面三个 useMemo 的依赖就永远在变，
  // 缓存等于没做。用一个模块级常量兜底。
  const results = lastResults.data ?? EMPTY_RESULTS

  const columns = useMemo<DataColumn<CaseRow>[]>(() => [
    {
      key: 'title', title: '用例信息', width: '16%', alwaysVisible: true,
      render: (_: unknown, row) => {
        const last = results[row.case_id] as LastResult | undefined
        const result = lastResults.isError ? '暂不可用' : !lastResults.isSuccess ? '读取中' : !last ? '未跑过' : null
        return <div className={`case-identity${last?.status === 'fail' ? ' is-failed' : ''}`}>
          <div className="case-identity-title">{row.title || row.case_id}</div>
          <div className="case-identity-id w-mono">{row.case_id}</div>
          <div className="case-identity-meta"><span>{row.module || '未分组'}</span>{row.platform ? <span>{row.platform}</span> : null}</div>
          <div className="case-identity-result">{result || <StatusPill status={last?.status === 'pass' ? 'pass' : last?.status === 'fail' ? 'fail' : 'muted'}>{last?.status === 'pass' ? '通过' : last?.status === 'fail' ? '失败' : '其他'}</StatusPill>}</div>
          {last?.status === 'fail' && last.reason ? <div className="case-identity-reason">{last.reason}</div> : null}
        </div>
      },
    },
    {
      key: 'precondition', title: '前置条件', width: '22%',
      render: (_: unknown, row) => <SavedScriptField projectId={projectId} row={row} kind="pre" />,
      onCell: () => ({ style: scriptCell }),
    },
    {
      key: 'steps', title: '操作步骤', width: '31%',
      render: (_: unknown, row) => <SavedScriptField projectId={projectId} row={row} kind="op" />,
      onCell: () => ({ style: scriptCell }),
    },
    {
      key: 'expected', title: '预期结果', width: '31%',
      render: (_: unknown, row) => <SavedScriptField projectId={projectId} row={row} kind="ex" />,
      onCell: () => ({ style: scriptCell }),
    },
  ], [projectId, results, lastResults.isError, lastResults.isSuccess])

  if (!projectId) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-warn)' }} />}
          title="缺少项目信息"
          hint="用例挂在项目下，这个链接里没有 projectId。从应用列表重新进入即可。"
        />
      </Card>
    )
  }

  if (cases.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />

  if (cases.isError) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取用例失败"
          hint={errText(cases.error, '确认 Nexus 可达，以及这个项目下确实有用例。')}
          action={<Button size="small" onClick={() => void cases.refetch()}>重试</Button>}
        />
      </Card>
    )
  }

  if (previewId) {
    if (preview.isPending) return <Skeleton active paragraph={{ rows: 8 }} />
    if (preview.isError) return <Card><EmptyState title="用例详情读取失败" hint={errText(preview.error)} action={<>
      <Button onClick={() => void preview.refetch()}>重试</Button>
      <Button onClick={() => {
        const next = new URLSearchParams(params)
        next.delete('case')
        setParams(next, { replace: true })
      }}>返回列表</Button>
    </>} /></Card>
    return <CasePreview row={preview.data!} projectId={projectId} onBack={() => {
      const next = new URLSearchParams(params)
      next.delete('case')
      setParams(next, { replace: true })
    }} />
  }

  if (!cases.data?.total && !kw && !moduleKey && resultFilter === 'all') {
    return (
      <>
        <Card>
          <EmptyState
            icon={<CircleSlash size={28} strokeWidth={1.5} />}
            title="这个项目还没有用例"
            hint="从表格导入。导入前会先预览，冲突的行默认跳过。"
            action={<Button size="small" icon={<Upload size={13} />} onClick={() => setImportOpen(true)}>导入用例</Button>}
          />
        </Card>
        <CaseImportDialog key={projectId} projectId={projectId} open={importOpen} onClose={() => setImportOpen(false)} />
      </>
    )
  }

  return (
    <div className="case-library flex flex-col" style={{ minHeight: 0, height: '100%' }}>
      {/* 下发后就地展示，不跳页 —— 用户不丢上下文 */}
      {dispatched && (
        <div
          className="flex items-center gap-3"
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
          <span className="w-mono" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>
            {dispatched.runId}
          </span>
          <span style={{ flex: 1 }} />
          <Button
            size="small"
            icon={<ExternalLink size={13} />}
            href={`?tab=tasks&run=${encodeURIComponent(dispatched.runId)}&projectId=${projectId}`}
          >
            查看执行详情
          </Button>
          <Button size="small" type="text" onClick={() => setDispatched(null)}>知道了</Button>
        </div>
      )}

      <div className="flex flex-1 min-h-0" style={{ gap: 'var(--w-space-3)' }}>
        <ModuleFilter
          modules={modules.data?.items || []}
          total={modules.data?.total ?? cases.data?.total ?? 0}
          value={moduleKey}
          onChange={(value) => updateFilters({ caseModule: value })}
          collapsed={filterCollapsed}
          onToggle={() => setFilterCollapsed((v) => !v)}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col" style={{ gap: 'var(--w-space-2)' }}>
          <DataTable<CaseRow>
            viewId="testing.cases"
            columns={columns}
            dataSource={rows}
            rowKey="case_id"
            loading={cases.isFetching && !cases.data}
            pagination={{ page, pageSize: size, total: cases.data?.total || 0,
              onChange: (next, nextSize) => updateFilters({ casePage: String(next), caseSize: String(nextSize) }, false) }}
            fill
            toolbar={
              <>
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
                <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                  {rows.length} / {cases.data?.total || 0}
                </span>
                <Button size="small" icon={<Upload size={13} />} onClick={() => setImportOpen(true)}>导入</Button>
              </>
            }
            selection={{
              selectedKeys: selected,
              onChange: setSelected,
              actions: null,
            }}
            emptyTitle="没有匹配的用例"
            emptyHint="调整模块、搜索或结果筛选试试。点一行可预览步骤和预期。"
            onRowClick={(row) => {
              const next = new URLSearchParams(params)
              next.set('case', row.case_id)
              setParams(next, { replace: true })
            }}
          />
          {lastResults.isError ? <span role="alert" style={{ color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)' }}>上次结果读取失败。<Button size="small" type="text" onClick={() => void lastResults.refetch()}>重试</Button></span> : null}
          {modules.isError ? <span role="alert" style={{ color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)' }}>模块统计读取失败。<Button size="small" type="text" onClick={() => void modules.refetch()}>重试</Button></span> : null}

          <RunBar
            appId={appId}
            projectId={projectId}
            selected={selected.map(String)}
            onClear={() => setSelected([])}
            deleting={remove.isPending}
            onDelete={() => void removeSelected()}
            onDispatched={(run) => { setDispatched(run); setSelected([]) }}
          />
        </div>
      </div>
      <CaseImportDialog key={projectId} projectId={projectId} open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

const scriptCell: CSSProperties = {
  verticalAlign: 'top',
  minWidth: 0,
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
