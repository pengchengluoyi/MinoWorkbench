import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderPlus, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react'
import {
  Badge, Button, EmptyState, Input, PageHeader, Skeleton, StatusPill, Tooltip,
  errText, toStatusKind,
} from '@/ui'
import { formatPlatformTags, getPlatformIcon } from '@/constants/appPlatforms'
import { useUrlState } from '@/hooks/useUrlState'
import type { AppRow, ProjectRow } from '@/types/project'
import { useAppTaskStats, useProjects, type AppTaskStat } from './queries'
import { CreateDialog, type CreateKind } from './CreateDialog'

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

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return projects.data || []
    return (projects.data || [])
      .map((p) => ({
        ...p,
        apps: (p.apps || []).filter((a) =>
          `${a.name || ''} ${a.description || ''}`.toLowerCase().includes(kw),
        ),
      }))
      .filter((p) => (p.apps || []).length > 0 || (p.name || '').toLowerCase().includes(kw))
  }, [projects.data, q])

  const totalApps = appIds.length

  if (projects.isLoading) {
    return (
      <div>
        <PageHeader title="应用" />
        <Skeleton active paragraph={{ rows: 8 }} title={{ width: 200 }} />
      </div>
    )
  }

  if (projects.isError) {
    return (
      <div>
        <PageHeader title="应用" />
        <div style={cardStyle}>
          <EmptyState
            icon={<TriangleAlert size={30} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
            title="读取项目列表失败"
            hint={errText(projects.error, '确认 Nexus 是否已启动，以及当前账号是否已登录。')}
            action={<Button size="small" onClick={() => void projects.refetch()}>重试</Button>}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <PageHeader
        title="应用"
        count={totalApps ? `${totalApps} 个应用` : undefined}
        extra={
          <>
            <Input
              allowClear
              size="small"
              prefix={<Search size={13} style={{ color: 'var(--w-text-quaternary)' }} />}
              placeholder="搜索应用"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ width: 180 }}
            />
            <Tooltip title="刷新">
              <Button
                size="small"
                icon={<RefreshCw size={13} />}
                loading={projects.isFetching}
                onClick={() => void projects.refetch()}
              />
            </Tooltip>
            <Button size="small" icon={<FolderPlus size={13} />} onClick={() => setCreating({ kind: 'project' })}>
              新建项目
            </Button>
          </>
        }
      />

      {!(projects.data || []).length ? (
        <div style={cardStyle}>
          <EmptyState
            title="还没有项目"
            hint="项目是应用的容器。先建一个项目，再在它下面创建应用。"
            action={
              <Button type="primary" size="small" icon={<FolderPlus size={13} />} onClick={() => setCreating({ kind: 'project' })}>
                新建项目
              </Button>
            }
          />
        </div>
      ) : !filtered.length ? (
        <div style={cardStyle}>
          <EmptyState title="没有匹配的应用" hint={`换个关键字试试，当前搜索「${q}」。`} />
        </div>
      ) : (
        <div className="flex flex-col" style={{ gap: 'var(--w-gap-lg)' }}>
          {filtered.map((project) => (
            <ProjectSection
              key={project.id}
              project={project}
              stats={stats.data || {}}
              onOpenApp={(app) => navigate(`/testing/${app.id}?appName=${encodeURIComponent(app.name || '')}`)}
              onCreateApp={() =>
                setCreating({ kind: 'app', projectId: project.id, projectName: project.name || '未命名项目' })
              }
            />
          ))}
        </div>
      )}

      <CreateDialog target={creating} onClose={() => setCreating(null)} />
    </div>
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
      <div className="flex items-center justify-between gap-3" style={{ marginBottom: 'var(--w-space-3)' }}>
        <div className="flex items-baseline gap-2 min-w-0">
          <strong
            className="truncate"
            style={{ fontSize: 'var(--w-font-title)', fontWeight: 700, color: 'var(--w-text)' }}
          >
            {project.name || '未命名项目'}
          </strong>
          <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
            {apps.length} 个应用
          </span>
        </div>
        <Button size="small" type="text" icon={<Plus size={13} />} onClick={onCreateApp}>
          新建应用
        </Button>
      </div>

      {!apps.length ? (
        <div
          style={{
            ...cardStyle,
            borderStyle: 'dashed',
            padding: '20px',
            textAlign: 'center',
            fontSize: 'var(--w-font-sm)',
            color: 'var(--w-text-quaternary)',
          }}
        >
          这个项目还没有应用
        </div>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 'var(--w-space-3)' }}
        >
          {apps.map((app) => (
            <AppCard key={app.id} app={app} stat={stats[app.id]} onClick={() => onOpenApp(app)} />
          ))}
        </div>
      )}
    </section>
  )
}

function AppCard({ app, stat, onClick }: { app: AppRow; stat?: AppTaskStat; onClick: () => void }) {
  const tags = formatPlatformTags(app.platforms)
  const running = stat?.runningCount || 0

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left"
      style={{
        ...cardStyle,
        padding: 'var(--w-card-padding)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--w-space-2)',
        transition: 'border-color .12s, box-shadow .12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--w-primary)'
        e.currentTarget.style.boxShadow = 'var(--w-shadow-sm)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--w-border)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span style={{ fontSize: 16, lineHeight: 1 }}>{getPlatformIcon(app.platforms)}</span>
          <strong
            className="truncate"
            style={{ fontSize: 'var(--w-font-base)', fontWeight: 700, color: 'var(--w-text)' }}
            title={app.name}
          >
            {app.name || '未命名应用'}
          </strong>
        </div>
        {running > 0 && (
          <Tooltip title={`${running} 个批次执行中`}>
            <Badge count={running} color="var(--w-running)" />
          </Tooltip>
        )}
      </div>

      {app.description && (
        <span
          className="truncate"
          style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}
          title={app.description}
        >
          {app.description}
        </span>
      )}

      <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 'auto' }}>
        {tags.map((t) => (
          <span
            key={t}
            style={{
              fontSize: 'var(--w-font-meta)',
              fontWeight: 650,
              color: 'var(--w-text-tertiary)',
              background: 'var(--w-fill)',
              padding: '2px 7px',
              borderRadius: 'var(--w-radius-pill)',
            }}
          >
            {t}
          </span>
        ))}
        {stat?.status && <StatusPill status={toStatusKind(stat.status)}>{stat.status}</StatusPill>}
      </div>
    </button>
  )
}

const cardStyle: React.CSSProperties = {
  background: 'var(--w-surface)',
  border: '1px solid var(--w-border)',
  borderRadius: 'var(--w-radius-lg)',
  minWidth: 0,
}
