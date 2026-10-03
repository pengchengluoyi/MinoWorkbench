import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plug, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Segmented, Skeleton, StatusPill, Tooltip, errText } from '@/ui'
import { listPlugins, type Plugin } from '@/api/plugins'
import { EMPTY_ARRAY, unwrapList } from '@/lib/unwrap'
import { PLUGIN_CATEGORIES, categoryLabel, pluginCategories, pluginInCategory } from '@/constants/pluginCategories'
import { useUrlState } from '@/hooks/useUrlState'

/**
 * 插件（外部系统接入）。
 *
 * 用户目标：① 哪些外部系统已经接上了 ② 没接上的是缺什么 ③ 配凭证。
 * 所以列表第一眼给**连接状态**，而不是插件名字排排坐。
 *
 * 凭证表单是每个插件一套（飞书 / Figma / 禅道各自字段不同，没有通用 schema），
 * 按插件逐个实现，不在这页硬塞一个万能表单。
 */
export function PluginsPage() {
  const [cat, setCat] = useUrlState('cat', 'all')

  const plugins = useQuery({
    queryKey: ['settings', 'plugins'],
    queryFn: async () =>
      unwrapList<Plugin>(await listPlugins(), { keys: ['plugins'], label: 'GET /settings/plugins' }),
  })

  const all: Plugin[] = plugins.data ?? EMPTY_ARRAY
  const rows = useMemo(() => all.filter((p) => pluginInCategory(p, cat)), [all, cat])

  const connectedCount = useMemo(
    () => all.filter((p) => isConnected(p)).length,
    [all],
  )

  if (plugins.isLoading) return <Skeleton active paragraph={{ rows: 7 }} title={{ width: 140 }} />

  if (plugins.isError) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取插件失败"
          hint={errText(plugins.error, '确认 Nexus 可达。')}
          action={<Button size="small" onClick={() => void plugins.refetch()}>重试</Button>}
        />
      </Card>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 'var(--w-space-4)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)' }}>插件</h2>
        <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: 'var(--w-text-tertiary)' }}>
          已接入 <strong style={{ color: connectedCount ? 'var(--w-pass)' : 'var(--w-text)' }}>{connectedCount}</strong> / {all.length}
        </span>
        <span style={{ flex: 1 }} />
        <Tooltip title="刷新">
          <Button size="small" icon={<RefreshCw size={13} />} loading={plugins.isFetching} onClick={() => void plugins.refetch()} aria-label="刷新" />
        </Tooltip>
      </div>

      <Segmented
        size="small"
        value={cat}
        onChange={(v) => setCat(String(v))}
        options={PLUGIN_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
        style={{ marginBottom: 'var(--w-space-3)' }}
      />

      {!all.length ? (
        <Card>
          <EmptyState
            icon={<Plug size={28} strokeWidth={1.5} />}
            title="没有可用插件"
            hint="Nexus 没有返回任何插件。插件由 Nexus 侧提供，前端只负责配置和展示。"
          />
        </Card>
      ) : !rows.length ? (
        <Card>
          <EmptyState title={`「${categoryLabel(cat)}」分类下没有插件`} hint="切到「全部」看看其他分类。" />
        </Card>
      ) : (
        <Card>
          {rows.map((p) => (
            <PluginRow key={p.id} plugin={p} />
          ))}
        </Card>
      )}
    </div>
  )
}

/** 连接状态在不同插件上字段不一致，统一收口。 */
function isConnected(p: Plugin): boolean {
  if (typeof p.connected === 'boolean') return p.connected
  if (typeof p.enabled === 'boolean') return p.enabled
  return /ok|connected|ready|enabled/i.test(String(p.status || ''))
}

function PluginRow({ plugin }: { plugin: Plugin }) {
  const connected = isConnected(plugin)
  const cats = pluginCategories(plugin)
  const caps = plugin.capabilities || []

  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: 'var(--w-space-3)',
        borderBottom: '1px solid var(--w-border)',
        minWidth: 0,
      }}
    >
      <span style={{ width: 62, flexShrink: 0, paddingTop: 1 }}>
        {connected ? <StatusPill status="pass">已接入</StatusPill> : <StatusPill status="muted">未配置</StatusPill>}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <strong className="truncate" style={{ fontSize: 'var(--w-font-base)', fontWeight: 650, color: 'var(--w-text)' }}>
            {plugin.name || plugin.id}
          </strong>
          {cats.map((c) => (
            <span
              key={c}
              style={{
                fontSize: 'var(--w-font-meta)',
                fontWeight: 650,
                color: 'var(--w-text-tertiary)',
                background: 'var(--w-fill)',
                padding: '1px 7px',
                borderRadius: 'var(--w-radius-pill)',
                flexShrink: 0,
              }}
            >
              {categoryLabel(c)}
            </span>
          ))}
        </div>

        {plugin.description && (
          <div style={{ marginTop: 3, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>
            {plugin.description}
          </div>
        )}

        {caps.length > 0 && (
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 6 }}>
            {caps.map((c) => (
              <span
                key={c.id}
                style={{
                  fontSize: 'var(--w-font-meta)',
                  color: 'var(--w-text-tertiary)',
                  border: '1px solid var(--w-border-strong)',
                  padding: '0 6px',
                  borderRadius: 'var(--w-radius-sm)',
                }}
              >
                {c.label || c.id}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="w-mono shrink-0" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', paddingTop: 3 }}>
        {plugin.id}
      </span>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
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
