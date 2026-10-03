import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleSlash, ExternalLink, Search, TriangleAlert } from 'lucide-react'
import {
  Button, DataTable, EmptyState, Input, Segmented, Skeleton, StatusPill, errText,
  type DataColumn,
} from '@/ui'
import type { CaseRow } from '@/api/projectCases'
import { ModuleFilter } from './ModuleFilter'
import { RunBar, type DispatchedRun } from './RunBar'
import { useLastResults, useProjectCases, useRunDevices, type LastResult } from './queries'

type ResultFilter = 'all' | 'failed' | 'never'

const EMPTY_RESULTS: Record<string, LastResult> = {}

/**
 * 用例面板 —— 产品的主动作入口。
 *
 * 设计见 docs/交互设计.md §二。与原实现的三处关键差异：
 * 1. 选择即准备下发，主动作常驻视野（RunBar）
 * 2. 模块树降级为筛选器，不当导航
 * 3. 下发后**不跳页**，就地出现执行条
 */
export function CasesPanel({ appId }: { appId: string }) {
  const [params] = useSearchParams()
  const projectId = params.get('projectId') || ''

  const cases = useProjectCases(projectId)
  const devices = useRunDevices()
  const lastResults = useLastResults(appId)

  const [moduleKey, setModuleKey] = useState('')
  const [filterCollapsed, setFilterCollapsed] = useState(false)
  const [kw, setKw] = useState('')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [selected, setSelected] = useState<React.Key[]>([])
  const [dispatched, setDispatched] = useState<DispatchedRun | null>(null)

  // 每次渲染都写 `data || {}` 会造出新对象，下面三个 useMemo 的依赖就永远在变，
  // 缓存等于没做。用一个模块级常量兜底。
  const results = lastResults.data ?? EMPTY_RESULTS

  const rows = useMemo(() => {
    const kwLower = kw.trim().toLowerCase()
    return (cases.data || []).filter((c) => {
      if (moduleKey) {
        const m = String(c.module || '').trim() || '未分组'
        if (m !== moduleKey) return false
      }
      if (resultFilter === 'failed' && results[c.case_id]?.status !== 'fail') return false
      if (resultFilter === 'never' && results[c.case_id]) return false
      if (kwLower) {
        const hay = `${c.case_id} ${c.title || ''} ${c.module || ''} ${c.precondition || ''}`.toLowerCase()
        if (!hay.includes(kwLower)) return false
      }
      return true
    })
  }, [cases.data, moduleKey, resultFilter, results, kw])

  const failedCount = useMemo(
    () => (cases.data || []).filter((c) => results[c.case_id]?.status === 'fail').length,
    [cases.data, results],
  )

  const columns = useMemo<DataColumn<CaseRow>[]>(() => [
    {
      key: 'title',
      title: '用例',
      alwaysVisible: true,
      render: (_: unknown, row) => {
        const last = results[row.case_id] as LastResult | undefined
        return (
          <div
            className="min-w-0"
            style={{
              /* 上次失败的用例左侧加红条：选哪些用例跑，依据就是"哪些在挂" */
              borderLeft: last?.status === 'fail' ? '2px solid var(--w-fail)' : '2px solid transparent',
              paddingLeft: 8,
            }}
          >
            <div className="truncate" style={{ fontWeight: 650, color: 'var(--w-text)' }} title={row.title}>
              {row.title || row.case_id}
            </div>
            <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
              <span className="w-mono" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                {row.case_id}
              </span>
              {last?.status === 'fail' && last.reason && (
                <span
                  className="truncate"
                  style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-fail)' }}
                  title={last.reason}
                >
                  {last.reason}
                </span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      key: 'module',
      title: '模块',
      dataIndex: 'module',
      width: 140,
      render: (v: string) => v || '未分组',
    },
    {
      key: 'last',
      title: '上次结果',
      width: 110,
      render: (_: unknown, row) => {
        const last = results[row.case_id] as LastResult | undefined
        if (!last) return <span style={{ color: 'var(--w-text-quaternary)' }}>未跑过</span>
        if (last.status === 'pass') return <StatusPill status="pass">通过</StatusPill>
        if (last.status === 'fail') return <StatusPill status="fail">失败</StatusPill>
        return <StatusPill status="muted">其他</StatusPill>
      },
    },
    {
      key: 'precondition',
      title: '前置条件',
      dataIndex: 'precondition',
      ellipsis: true,
      render: (v: string) => v || '—',
    },
  ], [results])

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

  if (!(cases.data || []).length) {
    return (
      <Card>
        <EmptyState
          icon={<CircleSlash size={28} strokeWidth={1.5} />}
          title="这个项目还没有用例"
          hint="用例可以从表格导入，或由需求流程生成。导入功能排在后续阶段。"
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 0, height: '100%' }}>
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
          cases={cases.data || []}
          value={moduleKey}
          onChange={setModuleKey}
          collapsed={filterCollapsed}
          onToggle={() => setFilterCollapsed((v) => !v)}
        />

        <div className="flex flex-col flex-1 min-w-0" style={{ gap: 'var(--w-space-2)' }}>
          <DataTable<CaseRow>
            viewId="testing.cases"
            columns={columns}
            dataSource={rows}
            rowKey="case_id"
            loading={cases.isFetching && !cases.data}
            scrollY="calc(100vh - 320px)"
            toolbar={
              <>
                <Input
                  allowClear
                  size="small"
                  prefix={<Search size={13} style={{ color: 'var(--w-text-quaternary)' }} />}
                  placeholder="搜索用例"
                  value={kw}
                  onChange={(e) => setKw(e.target.value)}
                  style={{ width: 200 }}
                />
                <Segmented
                  size="small"
                  value={resultFilter}
                  onChange={(v) => setResultFilter(v as ResultFilter)}
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'failed', label: failedCount ? `上次失败 ${failedCount}` : '上次失败' },
                    { value: 'never', label: '未跑过' },
                  ]}
                />
                <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                  {rows.length} / {(cases.data || []).length}
                </span>
              </>
            }
            selection={{
              selectedKeys: selected,
              onChange: setSelected,
              actions: null,
            }}
            emptyTitle="没有匹配的用例"
            emptyHint="调整模块、搜索或结果筛选试试。"
          />

          <RunBar
            appId={appId}
            selected={selected.map(String)}
            devices={devices.data || []}
            devicesLoading={devices.isLoading}
            onClear={() => setSelected([])}
            onDispatched={(run) => { setDispatched(run); setSelected([]) }}
          />
        </div>
      </div>
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
