import { Button, DataTable, PageHeader, StatusPill, toStatusKind, errText, type DataColumn } from '@/ui'
import { RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { nexusOrigin, usesDevProxy } from '@/lib/config'
import { healthKeys, useHealth, useRuntimeStatus, useServerInfo } from './queries'

import type { RuntimeEndpoint } from '@/types/auth'

const columns: DataColumn<RuntimeEndpoint>[] = [
  {
    key: 'name',
    title: '端点',
    dataIndex: 'name',
    alwaysVisible: true,
    width: 220,
    render: (v: string) => <strong style={{ fontWeight: 650 }}>{v || '—'}</strong>,
  },
  {
    key: 'url',
    title: '地址',
    dataIndex: 'url',
    render: (v: string) => <span className="w-mono" style={{ fontSize: 'var(--w-font-sm)' }}>{v || '—'}</span>,
  },
  {
    key: 'status',
    title: '状态',
    width: 120,
    // /sys/runtime 的端点给的是 online 布尔，不是 status 字符串
    render: (_: unknown, row) =>
      row.online === undefined
        ? <StatusPill status={toStatusKind(row.status)}>{row.status || '未知'}</StatusPill>
        : <StatusPill status={row.online ? 'pass' : 'fail'}>{row.online ? '在线' : '离线'}</StatusPill>,
  },
]

/**
 * 运行状态。合并了 MinoConsole 的 SystemPage 与 MinoStudio 的 RuntimeStatusPage 的只读部分。
 * 这页是阶段 0 的链路验收点：真实读 Nexus 的三个接口。
 */
export function HealthPage() {
  const qc = useQueryClient()
  const info = useServerInfo()
  const health = useHealth()
  const runtime = useRuntimeStatus()

  const origin = usesDevProxy() ? window.location.origin : nexusOrigin()
  const reachable = info.isSuccess || health.isSuccess
  const checking = !reachable && (info.isPending || health.isPending)
  const connectionLabel = reachable ? (info.isError || health.isError ? '部分连接正常' : '已连接') : checking ? '正在连接' : '无法连接'
  const version = info.data?.data?.version || health.data?.nexus_version || '—'
  const service = info.data?.data?.service || 'MinoNexus'

  const rt = runtime.data?.data
  const endpoints: RuntimeEndpoint[] = rt?.endpoints || []
  // nodes_alive 实测在 rt.node 里，顶层没有；两处都兜一下再退回 /health
  const nodeTotal = rt?.node_count ?? rt?.node?.node_count ?? health.data?.nodes ?? '—'
  const nodeAlive = rt?.nodes_alive ?? rt?.node?.nodes_alive ?? health.data?.nodes_alive ?? '—'

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: healthKeys.serverInfo })
    void qc.invalidateQueries({ queryKey: healthKeys.health })
    void qc.invalidateQueries({ queryKey: healthKeys.runtime })
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 0 }}>
      <PageHeader
        title="运行状态"
        subtitle={origin}
        extra={
          <Button
            size="small"
            icon={<RefreshCw size={13} />}
            loading={info.isFetching || health.isFetching || runtime.isFetching}
            onClick={refreshAll}
          >
            刷新
          </Button>
        }
      />

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 'var(--w-space-3)',
          marginBottom: 'var(--w-gap)',
        }}
      >
        <StatCard label="连通性" value={connectionLabel} kind={reachable ? 'pass' : checking ? undefined : 'fail'} />
        <StatCard label="服务" value={service} />
        <StatCard label="版本" value={version} />
        <StatCard label="节点" value={`${nodeAlive} / ${nodeTotal}`} note="在线 / 总数" />
      </div>

      {info.isError || health.isError ? <div role="alert" style={{ marginBottom: 12, padding: '10px 14px', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)', background: 'var(--w-warn-bg)', color: 'var(--w-warn)', overflowWrap: 'anywhere' }}>
        {info.isError ? <div>服务信息读取失败：{errText(info.error)}</div> : null}
        {health.isError ? <div>健康检查失败：{errText(health.error)}</div> : null}
        <Button size="small" onClick={refreshAll}>重试连接检查</Button>
      </div> : null}
      <DataTable<RuntimeEndpoint>
        viewId="admin.health.endpoints"
        columns={columns}
        dataSource={endpoints}
        rowKey={(r) => `${r.name}-${r.url}`}
        loading={runtime.isLoading}
        error={runtime.isError ? runtime.error : undefined}
        emptyTitle="没有端点信息"
        emptyHint="Nexus 的 /sys/runtime 没有返回 endpoints 字段。"
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  note,
  kind,
}: {
  label: string
  value: React.ReactNode
  note?: string
  kind?: 'pass' | 'fail'
}) {
  const color =
    kind === 'pass' ? 'var(--w-pass)' : kind === 'fail' ? 'var(--w-fail)' : 'var(--w-text)'
  return (
    <div
      style={{
        padding: 'var(--w-card-padding)',
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-xl)',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 'var(--w-font-sm)',
          fontWeight: 650,
          color: 'var(--w-text-tertiary)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        className="truncate"
        style={{ fontSize: 'var(--w-font-h2)', fontWeight: 800, color, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      {note && (
        <div style={{ marginTop: 6, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
          {note}
        </div>
      )}
    </div>
  )
}
