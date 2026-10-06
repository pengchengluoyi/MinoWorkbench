import { cloneElement, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Boxes, ChevronDown, FolderTree, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { Button, Dropdown, EmptyState, Input, Tooltip, errText } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import type { AppRow as App } from '@/types/project'
import { useAppTaskStats, useProjects } from './queries'
import { CreateDialog, type CreateKind } from './CreateDialog'
import { AppRow } from './AppRow'
import { markAppOpened, recentAppIds } from './recent'

interface Flat {
  app: App
  projectId: string
  projectName: string
  running: number
  recentRank: number
}

/**
 * 应用列表，登录后的落地页。
 *
 * 单列表，不按项目分组。排序：执行中 → 最近打开 → 名称。
 * 新建收成一个入口：主按钮是新建应用，新建项目在菜单里。
 */
export function AppListPage() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [q, setQ] = useUrlState('q', '')
  const [creating, setCreating] = useState<CreateKind | null>(null)
  const [cursor, setCursor] = useState(0)
  const searchRef = useRef<any>(null)

  const projectList = projects.data || []
  const appIds = useMemo(
    () => projectList.flatMap((p) => (p.apps || []).map((a) => a.id)).filter(Boolean),
    [projectList],
  )
  const stats = useAppTaskStats(appIds)
  const statMap = stats.data?.byId
  const degraded = !!stats.data?.degraded

  const runningTotal = useMemo(
    () => Object.values(statMap || {}).reduce((n, s) => n + (s.runningCount || 0), 0),
    [statMap],
  )

  const rows = useMemo<Flat[]>(() => {
    const recents = recentAppIds()
    const flat: Flat[] = []
    for (const p of projectList) {
      for (const app of p.apps || []) {
        if (!app?.id) continue
        flat.push({
          app,
          projectId: p.id,
          projectName: p.name || '',
          running: degraded ? 0 : statMap?.[app.id]?.runningCount || 0,
          recentRank: recents.indexOf(app.id),
        })
      }
    }
    return flat.sort((a, b) => {
      if ((b.running > 0 ? 1 : 0) !== (a.running > 0 ? 1 : 0)) return (b.running > 0 ? 1 : 0) - (a.running > 0 ? 1 : 0)
      const ar = a.recentRank < 0 ? 9_999 : a.recentRank
      const br = b.recentRank < 0 ? 9_999 : b.recentRank
      if (ar !== br) return ar - br
      return String(a.app.name || '').localeCompare(String(b.app.name || ''), 'zh-Hans-CN')
    })
  }, [projectList, statMap, degraded])

  const kw = q.trim().toLowerCase()
  const visible = useMemo(
    () => (!kw
      ? rows
      : rows.filter((r) =>
          `${r.app.name || ''} ${r.app.description || ''} ${r.projectName}`.toLowerCase().includes(kw))),
    [rows, kw],
  )

  const hrefOf = (row: Flat) => {
    const qs = new URLSearchParams({
      appName: row.app.name || '',
      projectName: row.projectName,
      projectId: row.projectId,
    })
    return `/testing/${row.app.id}?${qs}`
  }

  const open = useCallback((row: Flat) => {
    markAppOpened(row.app.id)
    navigate(hrefOf(row))
  }, [navigate])

  const openAppDialog = () => {
    setCreating({
      kind: 'app',
      projects: projectList.map((p) => ({ id: p.id, name: p.name || '未命名项目' })),
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName || ''
      const inField = /^(INPUT|TEXTAREA)$/.test(tag)
      const inControl = /^(BUTTON|A|SELECT)$/.test(tag) || !!el?.closest?.('[role="menu"]')
      if (e.key === '/' && !inField) {
        e.preventDefault()
        searchRef.current?.focus?.()
        return
      }
      if (inControl) return
      if (!visible.length) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && !inField) { e.preventDefault(); open(visible[cursor] || visible[0]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, cursor, open])

  useEffect(() => { setCursor(0) }, [kw])

  useEffect(() => {
    document.querySelector('[data-focus="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [cursor, visible])

  const projectCount = projectList.length
  const showSearch = projectCount > 0 && !projects.isError && !projects.isLoading

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 'var(--w-space-3)' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--w-text)' }}>
          应用
        </h1>
        {!projects.isLoading && !projects.isError && projectCount > 0 && (
          <div className="flex items-center gap-3" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)', fontWeight: 650 }}>
            <Metric icon={<FolderTree size={12} />} label="项目" value={projectCount} />
            <Metric icon={<Boxes size={12} />} label="应用" value={appIds.length} />
            {!degraded && runningTotal > 0 && (
              <Metric icon={<Activity size={12} strokeWidth={2.4} />} label="执行中" value={runningTotal} color="var(--w-pass)" />
            )}
          </div>
        )}
        <div className="flex items-center gap-2 shrink-0" style={{ marginLeft: 'auto' }}>
        {showSearch && (
          <Input
            ref={searchRef}
            allowClear
            size="small"
            prefix={<Search size={13} style={{ color: 'var(--w-text-tertiary)' }} />}
            suffix={!q ? <kbd className="w-kbd">/</kbd> : <span />}
            placeholder="搜索应用…"
            aria-label="搜索应用"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
            autoComplete="off"
            spellCheck={false}
          />
        )}
        <Tooltip title="刷新">
          <Button
            size="small"
            icon={<RefreshCw size={13} />}
            loading={projects.isFetching}
            onClick={() => void projects.refetch()}
            aria-label="刷新"
          />
        </Tooltip>
        {!projects.isLoading && !projects.isError && (projectCount > 0 ? (
          <Dropdown.Button
            size="small"
            icon={<ChevronDown size={12} />}
            buttonsRender={([left, right]) => [
              left,
              cloneElement(right as ReactElement<{ 'aria-label'?: string }>, { 'aria-label': '更多新建方式' }),
            ]}
            menu={{
              items: [{ key: 'project', label: '新建项目' }],
              onClick: () => setCreating({ kind: 'project' }),
            }}
            onClick={openAppDialog}
          >
            新建应用
          </Dropdown.Button>
        ) : (
          <Button size="small" type="primary" onClick={() => setCreating({ kind: 'project' })}>
            新建项目
          </Button>
        ))}
        </div>
      </div>

      {degraded && rows.length > 0 && (
        <div
          role="status"
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 'var(--w-radius-sm)',
            background: 'var(--w-warn-bg)',
            color: 'var(--w-warn)',
            fontSize: 'var(--w-font-sm)',
            fontWeight: 650,
          }}
        >
          执行计数暂时不可用。列表仍可进入。
        </div>
      )}

      {projects.isLoading ? (
        <div className="w-surface-card" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} style={{ height: 'var(--w-row-height)', borderBottom: '1px solid var(--w-border)', padding: '16px 14px' }}>
              <div style={{ height: 10, width: i % 3 === 0 ? '46%' : '32%', borderRadius: 99, background: 'var(--w-fill)' }} />
            </div>
          ))}
        </div>
      ) : projects.isError ? (
        <div className="w-surface-card">
          <EmptyState
            icon={<TriangleAlert size={30} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
            title="读取项目列表失败"
            hint={errText(projects.error, '确认 Nexus 是否已启动，以及当前账号是否已登录。')}
            action={<Button size="small" type="primary" onClick={() => void projects.refetch()}>重试</Button>}
          />
        </div>
      ) : !projectCount ? (
        <div className="w-surface-card">
          <EmptyState
            title="还没有项目"
            hint="项目是应用的容器。先建一个项目，再在它下面创建应用。"
            action={<Button type="primary" onClick={() => setCreating({ kind: 'project' })}>新建项目</Button>}
          />
        </div>
      ) : !rows.length ? (
        <div className="w-surface-card">
          <EmptyState
            title="还没有应用"
            hint="项目已经建好。下一步在项目下创建应用。"
            action={<Button type="primary" onClick={openAppDialog}>新建应用</Button>}
          />
        </div>
      ) : !visible.length ? (
        <div className="w-surface-card">
          <EmptyState title="没有匹配的应用" hint={`换个关键字试试。当前搜索「${q}」。`} />
        </div>
      ) : (
        <>
          <div className="w-surface-card" role="list">
            <RowGroup rows={visible} kw={kw} cursor={cursor} hrefOf={hrefOf} onHover={setCursor} />
          </div>
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 'var(--w-space-3)', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}
          >
            <span className="flex items-center gap-3">
              <span><kbd className="w-kbd">/</kbd> 搜索</span>
              <span><kbd className="w-kbd">↑</kbd> <kbd className="w-kbd">↓</kbd> 选择</span>
              <span><kbd className="w-kbd">Enter</kbd> 进入</span>
            </span>
            <span>
              {kw ? `${visible.length} / ${rows.length} 个应用` : `${rows.length} 个应用`}
              {visible[cursor] && (
                <strong style={{ marginLeft: 8, fontWeight: 700, color: 'var(--w-text)' }}>
                  {visible[cursor].app.name || '未命名应用'}
                </strong>
              )}
            </span>
          </div>
        </>
      )}

      <CreateDialog target={creating} onClose={() => setCreating(null)} />
    </div>
  )
}

function RowGroup({
  rows,
  kw,
  cursor,
  hrefOf,
  onHover,
}: {
  rows: Flat[]
  kw: string
  cursor: number
  hrefOf: (row: Flat) => string
  onHover: (index: number) => void
}) {
  const showBand = !kw && rows.some((r) => r.running > 0)
  const running = showBand ? rows.filter((r) => r.running > 0) : []
  const rest = showBand ? rows.filter((r) => r.running === 0) : rows
  const render = (list: Flat[]) => list.map((row) => {
    const index = rows.indexOf(row)
    return (
      <AppRow
        key={row.app.id}
        app={row.app}
        projectName={row.projectName}
        running={row.running}
        recent={row.recentRank >= 0}
        focused={index === cursor}
        href={hrefOf(row)}
        onHover={() => onHover(index)}
        onOpen={() => markAppOpened(row.app.id)}
      />
    )
  })

  return (
    <>
      {showBand && (
        <div className="w-run-group">
          <div className="w-band">正在执行</div>
          {render(running)}
        </div>
      )}
      {render(rest)}
    </>
  )
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      {icon}
      <span>{label}</span>
      <strong style={{ fontWeight: 800, color: color || 'var(--w-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
    </span>
  )
}
