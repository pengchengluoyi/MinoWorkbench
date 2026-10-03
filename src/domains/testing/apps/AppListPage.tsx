import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Boxes, FolderPlus, FolderTree, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, Skeleton, Tooltip, errText } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import type { AppRow as App, ProjectRow } from '@/types/project'
import { useAppTaskStats, useProjects, type AppTaskStat } from './queries'
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
 * 应用列表 —— 登录后的落地页。
 *
 * 设计见 docs/交互设计.md §一：
 * 单列表而非按项目分组的网格（大多数项目只有一个应用，分组纯属开销），
 * 排序按「执行中 → 最近打开 → 名称」，全程键盘可达。
 */
export function AppListPage() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [q, setQ] = useUrlState('q', '')
  const [creating, setCreating] = useState<CreateKind | null>(null)
  const [cursor, setCursor] = useState(0)
  const searchRef = useRef<any>(null)

  const appIds = useMemo(
    () => (projects.data || []).flatMap((p) => (p.apps || []).map((a) => a.id)).filter(Boolean),
    [projects.data],
  )
  const stats = useAppTaskStats(appIds)

  const runningTotal = useMemo(
    () => Object.values(stats.data || {}).reduce((n, s) => n + (s.runningCount || 0), 0),
    [stats.data],
  )

  // 拍平成一维列表并排序：执行中 → 最近打开 → 名称
  const rows = useMemo<Flat[]>(() => {
    const recents = recentAppIds()
    const statMap = stats.data || {}
    const flat: Flat[] = []
    for (const p of projects.data || []) {
      for (const app of p.apps || []) {
        if (!app?.id) continue
        flat.push({
          app,
          projectId: p.id,
          projectName: p.name || '',
          running: statMap[app.id]?.runningCount || 0,
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
  }, [projects.data, stats.data])

  const kw = q.trim().toLowerCase()
  const visible = useMemo(
    () => (!kw
      ? rows
      : rows.filter((r) =>
          `${r.app.name || ''} ${r.app.description || ''} ${r.projectName}`.toLowerCase().includes(kw))),
    [rows, kw],
  )

  const open = useCallback((row: Flat) => {
    markAppOpened(row.app.id)
    const qs = new URLSearchParams({
      appName: row.app.name || '',
      projectName: row.projectName,
      projectId: row.projectId,
    })
    navigate(`/testing/${row.app.id}?${qs}`)
  }, [navigate])

  // 键盘：/ 聚焦搜索，↑↓ 移动，Enter 进入。高频导航页不该强制用鼠标。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA)$/.test((e.target as HTMLElement)?.tagName || '')
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus?.()
        return
      }
      if (!visible.length) return
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, visible.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)) }
      else if (e.key === 'Enter' && !typing) { e.preventDefault(); open(visible[cursor] || visible[0]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, cursor, open])

  useEffect(() => { setCursor(0) }, [kw])

  if (projects.isLoading) {
    return (
      <Page>
        <Skeleton active title={{ width: 100 }} paragraph={{ rows: 1 }} />
        <Skeleton active title={false} paragraph={{ rows: 8 }} style={{ marginTop: 24 }} />
      </Page>
    )
  }

  if (projects.isError) {
    return (
      <Page>
        <Surface>
          <EmptyState
            icon={<TriangleAlert size={30} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
            title="读取项目列表失败"
            hint={errText(projects.error, '确认 Nexus 是否已启动，以及当前账号是否已登录。')}
            action={<Button size="small" onClick={() => void projects.refetch()}>重试</Button>}
          />
        </Surface>
      </Page>
    )
  }

  const projectCount = (projects.data || []).length

  return (
    <Page>
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 'var(--w-space-4)' }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--w-text)' }}>
          应用
        </h1>
        {/* 概览压成一条细横条，不占卡片高度 */}
        <div
          className="flex items-center gap-3"
          style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)', fontWeight: 650 }}
        >
          <Metric icon={<FolderTree size={12} />} label="项目" value={projectCount} />
          <Dot />
          <Metric icon={<Boxes size={12} />} label="应用" value={appIds.length} />
          {runningTotal > 0 && (
            <>
              <Dot />
              <Metric
                icon={<Activity size={12} strokeWidth={2.4} />}
                label="执行中"
                value={runningTotal}
                color="var(--w-running)"
              />
            </>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <Input
          ref={searchRef}
          allowClear
          size="small"
          prefix={<Search size={13} style={{ color: 'var(--w-text-quaternary)' }} />}
          placeholder="搜索应用  /"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: 220 }}
        />
        <Tooltip title="刷新">
          <Button
            size="small"
            icon={<RefreshCw size={13} />}
            loading={projects.isFetching}
            onClick={() => void projects.refetch()}
            aria-label="刷新"
          />
        </Tooltip>
        <Button size="small" icon={<FolderPlus size={13} />} onClick={() => setCreating({ kind: 'project' })}>
          新建项目
        </Button>
      </div>

      {!projectCount ? (
        <Surface>
          <EmptyState
            title="还没有项目"
            hint="项目是应用的容器。先建一个项目，再在它下面创建应用。"
            action={
              <Button type="primary" icon={<FolderPlus size={14} />} onClick={() => setCreating({ kind: 'project' })}>
                新建项目
              </Button>
            }
          />
        </Surface>
      ) : !rows.length ? (
        <Surface>
          <EmptyState
            title="还没有应用"
            hint="项目已经建好了，下一步在项目下创建应用。"
            action={<ProjectPicker projects={projects.data || []} onPick={(p) => setCreating({ kind: 'app', projectId: p.id, projectName: p.name || '未命名项目' })} />}
          />
        </Surface>
      ) : !visible.length ? (
        <Surface>
          <EmptyState title="没有匹配的应用" hint={`换个关键字试试，当前搜索「${q}」。`} />
        </Surface>
      ) : (
        <>
          <Surface>
            {visible.map((row, i) => (
              <AppRow
                key={row.app.id}
                app={row.app}
                projectName={row.projectName}
                stat={stats.data?.[row.app.id] as AppTaskStat | undefined}
                recent={row.recentRank >= 0}
                focused={i === cursor}
                onOpen={() => open(row)}
                onHover={() => setCursor(i)}
              />
            ))}
          </Surface>
          <div
            className="flex items-center justify-between"
            style={{ marginTop: 'var(--w-space-3)', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}
          >
            <span>
              {kw ? `${visible.length} / ${rows.length} 个应用` : `${rows.length} 个应用`}
              <span style={{ marginLeft: 10 }}>↑↓ 选择 · Enter 进入 · / 搜索</span>
            </span>
            <ProjectPicker
              projects={projects.data || []}
              onPick={(p) => setCreating({ kind: 'app', projectId: p.id, projectName: p.name || '未命名项目' })}
            />
          </div>
        </>
      )}

      <CreateDialog target={creating} onClose={() => setCreating(null)} />
    </Page>
  )
}

/** 新建应用要先选项目。项目只有一个时直接用它，不让用户多点一下。 */
function ProjectPicker({ projects, onPick }: { projects: ProjectRow[]; onPick: (p: ProjectRow) => void }) {
  if (!projects.length) return null
  if (projects.length === 1) {
    return (
      <Button size="small" type="text" icon={<Plus size={13} />} onClick={() => onPick(projects[0])}>
        新建应用
      </Button>
    )
  }
  return (
    <Tooltip title="选项目后新建应用">
      <span>
        <select
          onChange={(e) => {
            const hit = projects.find((p) => p.id === e.target.value)
            if (hit) onPick(hit)
            e.currentTarget.selectedIndex = 0
          }}
          style={{
            fontSize: 'var(--w-font-sm)',
            fontWeight: 650,
            color: 'var(--w-text-secondary)',
            background: 'transparent',
            border: '1px solid var(--w-border-strong)',
            borderRadius: 'var(--w-radius-sm)',
            padding: '3px 6px',
            cursor: 'pointer',
          }}
        >
          <option value="">+ 新建应用…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name || '未命名项目'}</option>
          ))}
        </select>
      </span>
    </Tooltip>
  )
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1" style={{ color }}>
      {icon}
      <span>{label}</span>
      <strong style={{ fontWeight: 800, color: color || 'var(--w-text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </strong>
    </span>
  )
}

const Dot = () => <span aria-hidden style={{ color: 'var(--w-border-strong)' }}>·</span>

function Page({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-lg)',
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  )
}
