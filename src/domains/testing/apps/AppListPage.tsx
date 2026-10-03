import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, Skeleton, Tooltip, errText } from '@/ui'
import { useUrlState } from '@/hooks/useUrlState'
import type { AppRow, ProjectRow } from '@/types/project'
import { useAppTaskStats, useProjects, type AppTaskStat } from './queries'
import { CreateDialog, type CreateKind } from './CreateDialog'
import { StatRow } from './StatRow'
import { AppCard } from './AppCard'

/**
 * 应用列表 —— 登录后的落地页。
 *
 * 这页会长期作为首屏，所以结构是：概览数字 → 搜索与新建 → 项目分组 → 应用卡片。
 * 不复用上一版的紧凑表格式布局（见 contracts/testing-app-list.md）。
 */
export function AppListPage() {
  const navigate = useNavigate()
  const projects = useProjects()
  const [q, setQ] = useUrlState('q', '')
  const [creating, setCreating] = useState<CreateKind | null>(null)

  const appIds = useMemo(
    () => (projects.data || []).flatMap((p) => (p.apps || []).map((a) => a.id)).filter(Boolean),
    [projects.data],
  )
  const stats = useAppTaskStats(appIds)

  const runningTotal = useMemo(
    () => Object.values(stats.data || {}).reduce((sum, s) => sum + (s.runningCount || 0), 0),
    [stats.data],
  )

  const kw = q.trim().toLowerCase()
  // 显式标注：展开 {...p, apps} 会丢掉 ProjectRow 的索引签名，
  // 不标注的话 filtered 变成联合类型，后面的 reduce 推不出累加器
  const filtered = useMemo<ProjectRow[]>(() => {
    if (!kw) return projects.data || []
    return (projects.data || [])
      .map((p) => ({
        ...p,
        apps: (p.apps || []).filter((a) =>
          `${a.name || ''} ${a.description || ''}`.toLowerCase().includes(kw),
        ),
      }))
      .filter((p) => (p.apps || []).length > 0 || (p.name || '').toLowerCase().includes(kw))
  }, [projects.data, kw])

  const matchCount = useMemo(
    () => filtered.reduce((n, p) => n + (p.apps || []).length, 0),
    [filtered],
  )

  if (projects.isLoading) {
    return (
      <Page>
        <Skeleton active paragraph={{ rows: 2 }} title={{ width: 120 }} />
        <Skeleton active paragraph={{ rows: 6 }} title={false} style={{ marginTop: 28 }} />
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

  const all = projects.data || []

  return (
    <Page>
      <header style={{ marginBottom: 'var(--w-space-5)' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '-0.025em',
            color: 'var(--w-text)',
          }}
        >
          应用
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--w-font-base)', color: 'var(--w-text-quaternary)' }}>
          选一个应用进入测试工作台
        </p>
      </header>

      <div style={{ marginBottom: 'var(--w-space-5)' }}>
        <StatRow projects={all.length} apps={appIds.length} running={runningTotal} />
      </div>

      <div
        className="flex flex-wrap items-center gap-2"
        style={{ marginBottom: 'var(--w-space-4)' }}
      >
        <Input
          allowClear
          prefix={<Search size={14} style={{ color: 'var(--w-text-quaternary)' }} />}
          placeholder="搜索应用名称或说明"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320, flex: '1 1 220px' }}
        />
        {kw && (
          <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>
            {matchCount} 个匹配
          </span>
        )}
        <span style={{ flex: 1 }} />
        <Tooltip title="刷新">
          <Button
            icon={<RefreshCw size={14} />}
            loading={projects.isFetching}
            onClick={() => void projects.refetch()}
            aria-label="刷新"
          />
        </Tooltip>
        <Button type="primary" icon={<FolderPlus size={14} />} onClick={() => setCreating({ kind: 'project' })}>
          新建项目
        </Button>
      </div>

      {!all.length ? (
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
      ) : !filtered.length ? (
        <Surface>
          <EmptyState title="没有匹配的应用" hint={`换个关键字试试，当前搜索「${q}」。`} />
        </Surface>
      ) : (
        <div className="flex flex-col" style={{ gap: 28 }}>
          {filtered.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              stats={stats.data || {}}
              onOpenApp={(app) =>
                navigate(`/testing/${app.id}?appName=${encodeURIComponent(app.name || '')}&projectName=${encodeURIComponent(project.name || '')}`)
              }
              onCreateApp={() =>
                setCreating({ kind: 'app', projectId: project.id, projectName: project.name || '未命名项目' })
              }
            />
          ))}
        </div>
      )}

      <CreateDialog target={creating} onClose={() => setCreating(null)} />
    </Page>
  )
}

function ProjectSection({
  project,
  stats,
  onOpenApp,
  onCreateApp,
}: {
  project: ProjectRow
  stats: Record<string, AppTaskStat>
  onOpenApp: (app: AppRow) => void
  onCreateApp: () => void
}) {
  const apps = project.apps || []

  return (
    <section>
      <div
        className="flex items-center justify-between gap-3"
        style={{ marginBottom: 'var(--w-space-3)' }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {/* 竖条锚点，让分组边界一眼可辨，不靠额外的卡片边框 */}
          <span
            aria-hidden
            style={{
              width: 3,
              height: 16,
              borderRadius: 2,
              background: 'var(--w-primary)',
              flexShrink: 0,
            }}
          />
          <strong
            className="truncate"
            style={{ fontSize: 'var(--w-font-h2)', fontWeight: 700, color: 'var(--w-text)' }}
            title={project.name}
          >
            {project.name || '未命名项目'}
          </strong>
          <span
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 650,
              color: 'var(--w-text-tertiary)',
              background: 'var(--w-fill)',
              padding: '2px 8px',
              borderRadius: 'var(--w-radius-pill)',
            }}
          >
            {apps.length}
          </span>
        </div>
        <Button size="small" type="text" icon={<Plus size={14} />} onClick={onCreateApp}>
          新建应用
        </Button>
      </div>

      {!apps.length ? (
        <div
          style={{
            padding: '24px 20px',
            textAlign: 'center',
            fontSize: 'var(--w-font-sm)',
            color: 'var(--w-text-quaternary)',
            background: 'var(--w-surface-subtle)',
            border: '1px dashed var(--w-border-strong)',
            borderRadius: 'var(--w-radius-lg)',
          }}
        >
          这个项目还没有应用
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))', gap: 'var(--w-space-3)' }}
        >
          {apps.map((app) => (
            <AppCard key={app.id} app={app} stat={stats[app.id]} onClick={() => onOpenApp(app)} />
          ))}
        </div>
      )}
    </section>
  )
}

/** 落地页给一个最大宽度，超宽屏下卡片不要拉成长条。 */
function Page({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
}

function Surface({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-xl)',
      }}
    >
      {children}
    </div>
  )
}
