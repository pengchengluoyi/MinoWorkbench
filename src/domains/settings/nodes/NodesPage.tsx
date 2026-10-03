import { useMemo, useState } from 'react'
import { Cpu, Power, RefreshCw, RotateCw, Smartphone, TriangleAlert, Upload } from 'lucide-react'
import { Button, EmptyState, Skeleton, StatusPill, Tooltip, errText, useFeedback } from '@/ui'
import { executableDevices, nodeIsOnline, type NodeCommand, type ScoutNode } from '@/api/nodes'
import { EMPTY_ARRAY } from '@/lib/unwrap'
import { useNodeCommand, useNodes } from './queries'
import { NodeLogs } from './NodeLogs'

/**
 * Scout 节点。
 *
 * 用户目标：① 我的设备在不在线、能不能跑用例 ② 跑不动时为什么 ③ 重启 / 看日志。
 * 所以列表第一眼给的是「可执行设备数」而不是节点元信息 ——
 * 用户关心的是"有几台能跑"，不是 node_id 长什么样。
 *
 * 停止 / 重启 / 升级 / 日志全部走 Nexus 现成的 /runtime/nodes/:id/* 接口，
 * 纯 Web 完全可用，不需要任何 Electron 能力。
 */
export function NodesPage() {
  const nodes = useNodes()
  const [picked, setPicked] = useState<string>('')

  const list: ScoutNode[] = nodes.data ?? EMPTY_ARRAY
  const activeId = picked || list[0]?.node_id || ''
  const active = list.find((n) => n.node_id === activeId)

  const totals = useMemo(() => {
    let online = 0
    let devices = 0
    for (const n of list) {
      if (nodeIsOnline(n)) online += 1
      devices += executableDevices(n).length
    }
    return { online, devices }
  }, [list])

  if (nodes.isLoading) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />

  if (nodes.isError) {
    return (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取节点失败"
          hint={errText(nodes.error, '确认 Nexus 可达。')}
          action={<Button size="small" onClick={() => void nodes.refetch()}>重试</Button>}
        />
      </Card>
    )
  }

  if (!list.length) {
    return (
      <Card>
        <EmptyState
          icon={<Cpu size={28} strokeWidth={1.5} />}
          title="还没有节点接入"
          hint="在要跑用例的设备机上安装并启动 Scout，它会自己拨号到 Nexus 并出现在这里。前端不负责安装 Scout。"
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col" style={{ height: '100%', minHeight: 0, gap: 'var(--w-space-3)' }}>
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h2 style={{ margin: 0, fontSize: 'var(--w-font-h2)', fontWeight: 800, color: 'var(--w-text)' }}>
          Scout 节点
        </h2>
        <span className="flex items-center gap-3" style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: 'var(--w-text-tertiary)' }}>
          <span>在线 <strong style={{ color: 'var(--w-text)' }}>{totals.online}</strong> / {list.length}</span>
          <span aria-hidden style={{ color: 'var(--w-border-strong)' }}>·</span>
          <span className="inline-flex items-center gap-1">
            <Smartphone size={12} />可执行设备 <strong style={{ color: totals.devices ? 'var(--w-pass)' : 'var(--w-warn)' }}>{totals.devices}</strong>
          </span>
        </span>
        <span style={{ flex: 1 }} />
        <Tooltip title="刷新">
          <Button size="small" icon={<RefreshCw size={13} />} loading={nodes.isFetching} onClick={() => void nodes.refetch()} aria-label="刷新" />
        </Tooltip>
      </div>

      <div className="flex flex-1 min-h-0" style={{ gap: 'var(--w-space-3)' }}>
        <aside
          className="shrink-0 overflow-y-auto"
          style={{
            width: 250,
            background: 'var(--w-surface)',
            border: '1px solid var(--w-border)',
            borderRadius: 'var(--w-radius-lg)',
            minHeight: 0,
          }}
        >
          {list.map((n) => {
            const on = nodeIsOnline(n)
            const devs = executableDevices(n).length
            const act = n.node_id === activeId
            return (
              <button
                key={n.node_id}
                type="button"
                onClick={() => setPicked(n.node_id)}
                className="flex w-full flex-col text-left"
                style={{
                  gap: 4,
                  padding: '10px 12px',
                  border: 'none',
                  borderLeft: `2px solid ${act ? 'var(--w-primary)' : 'transparent'}`,
                  borderBottom: '1px solid var(--w-border)',
                  background: act ? 'var(--w-primary-soft)' : 'transparent',
                  cursor: 'pointer',
                  minWidth: 0,
                }}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {on ? <StatusPill status="pass">在线</StatusPill> : <StatusPill status="muted">离线</StatusPill>}
                  <span className="truncate" style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: act ? 'var(--w-primary)' : 'var(--w-text)' }}>
                    {n.hostname || n.node_id.slice(0, 10)}
                  </span>
                </span>
                {/* 第一眼给"有几台能跑"，而不是节点元信息 */}
                <span className="flex items-center gap-1" style={{ fontSize: 'var(--w-font-meta)', fontWeight: 650, color: devs ? 'var(--w-pass)' : 'var(--w-text-quaternary)' }}>
                  <Smartphone size={11} />
                  {devs ? `${devs} 台可执行` : '无可执行设备'}
                </span>
                <span style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                  {n.platform || '—'} · {n.scout_version ? `v${n.scout_version}` : '版本未知'}
                </span>
              </button>
            )
          })}
        </aside>

        {active ? <NodeDetail node={active} /> : null}
      </div>
    </div>
  )
}

function NodeDetail({ node }: { node: ScoutNode }) {
  const fb = useFeedback()
  const cmd = useNodeCommand()
  const online = nodeIsOnline(node)
  const devices = node.devices || []

  const run = async (command: NodeCommand, label: string, danger = false) => {
    const ok = await fb.confirm({
      title: `确定${label}这个节点？`,
      content: danger
        ? `${node.hostname || node.node_id} 上正在执行的用例会被中断。`
        : `命令会下发给 ${node.hostname || node.node_id}。`,
      danger,
      okText: label,
    })
    if (!ok) return
    try {
      await cmd.mutateAsync({ nodeId: node.node_id, command })
      fb.ok(`${label}命令已下发`)
    } catch (e) {
      fb.fail(errText(e, `${label}失败`))
    }
  }

  return (
    <section
      className="flex-1 min-w-0 overflow-y-auto"
      style={{
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-lg)',
        padding: 'var(--w-space-4)',
        minHeight: 0,
      }}
    >
      <div className="flex flex-wrap items-center gap-2" style={{ marginBottom: 'var(--w-space-4)' }}>
        <strong style={{ fontSize: 'var(--w-font-title)', fontWeight: 700, color: 'var(--w-text)' }}>
          {node.hostname || node.node_id}
        </strong>
        {online ? <StatusPill status="pass">在线</StatusPill> : <StatusPill status="muted">离线</StatusPill>}
        {node.busy && <StatusPill status="running">忙</StatusPill>}
        {node.draining && <StatusPill status="warn">排空中</StatusPill>}
        <span style={{ flex: 1 }} />

        {/* 冷启动做不到：进程没在跑就没有接收方。所以这里只有停止 / 重启 / 升级 */}
        <Tooltip title={online ? '' : '节点离线，命令没有接收方。需要在设备机上手动启动 Scout。'}>
          <span className="flex items-center gap-2">
            <Button size="small" icon={<RotateCw size={13} />} disabled={!online} loading={cmd.isPending} onClick={() => run('restart', '重启')}>
              重启
            </Button>
            <Button size="small" icon={<Upload size={13} />} disabled={!online} loading={cmd.isPending} onClick={() => run('update', '升级')}>
              升级
            </Button>
            <Button size="small" danger icon={<Power size={13} />} disabled={!online} loading={cmd.isPending} onClick={() => run('stop', '停止', true)}>
              停止
            </Button>
          </span>
        </Tooltip>
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--w-space-3)', marginBottom: 'var(--w-space-4)' }}
      >
        <Field label="Scout 版本" value={node.scout_version ? `v${node.scout_version}` : '—'} />
        <Field label="平台" value={`${node.platform || '—'}${node.arch ? ` · ${node.arch}` : ''}`} />
        <Field label="归属" value={node.owner_name || '—'} />
        <Field label="心跳" value={node.last_seen_ago_sec != null ? `${Math.round(node.last_seen_ago_sec)} 秒前` : (node.last_heartbeat || '—')} />
        {node.host?.cpu_percent != null && <Field label="CPU" value={`${node.host.cpu_percent}%`} />}
        {node.host?.battery_percent != null && (
          <Field label="电量" value={`${node.host.battery_percent}%${node.host.power_source === 'battery' ? ' · 电池' : ''}`} />
        )}
      </div>

      <Block title={`执行器能力`}>
        {Object.keys(node.executors || {}).length ? (
          <div className="flex flex-wrap gap-2">
            {Object.entries(node.executors || {}).map(([name, ex]) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5"
                style={{
                  padding: '3px 9px',
                  borderRadius: 'var(--w-radius-pill)',
                  fontSize: 'var(--w-font-meta)',
                  fontWeight: 650,
                  background: ex?.available ? 'var(--w-pass-bg)' : 'var(--w-muted-bg)',
                  color: ex?.available ? 'var(--w-pass)' : 'var(--w-text-tertiary)',
                }}
                title={ex?.reason || ''}
              >
                {name}
                <span style={{ opacity: 0.75 }}>{ex?.available ? `${ex.provides ?? 0} 项` : '不可用'}</span>
              </span>
            ))}
          </div>
        ) : (
          <Muted>没有上报执行器能力</Muted>
        )}
      </Block>

      <Block title={`设备 · ${devices.length}`}>
        {!devices.length ? (
          <Muted>这个节点下没有设备。Android 设备需要 adb 可见，Web 执行器会自带一台虚拟设备。</Muted>
        ) : (
          devices.map((d) => {
            const on = String(d.status || '').toLowerCase() === 'online'
            return (
              <div
                key={d.sn}
                className="flex items-center gap-3"
                style={{ padding: '7px 0', borderBottom: '1px solid var(--w-border)', minWidth: 0 }}
              >
                <span style={{ width: 56, flexShrink: 0 }}>
                  {on ? <StatusPill status="pass">在线</StatusPill> : <StatusPill status="muted">离线</StatusPill>}
                </span>
                <span className="truncate" style={{ flex: 1, fontSize: 'var(--w-font-sm)', fontWeight: 650, color: 'var(--w-text)' }}>
                  {d.model || d.type || '设备'}
                </span>
                <span className="w-mono shrink-0" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>
                  {d.sn}
                </span>
                <span className="shrink-0" style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', width: 64, textAlign: 'right' }}>
                  {d.platform || d.type || ''}
                </span>
              </div>
            )
          })
        )}
      </Block>

      <Block title="日志">
        <NodeLogs nodeId={node.node_id} />
      </Block>
    </section>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="w-field" style={{ minWidth: 0 }}>
      <em>{label}</em>
      <span className="truncate" title={String(value)}>{value}</span>
    </div>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 'var(--w-space-5)' }}>
      <div
        style={{
          fontSize: 'var(--w-font-meta)',
          fontWeight: 700,
          color: 'var(--w-text-quaternary)',
          letterSpacing: '.04em',
          marginBottom: 'var(--w-space-2)',
        }}
      >
        {title}
      </div>
      {children}
    </section>
  )
}

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>{children}</div>
)

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
