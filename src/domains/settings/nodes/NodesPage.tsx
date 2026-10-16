import { usesDesktopExecutor } from '@/constants/platformContract'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Cpu, PanelLeftClose, PanelLeftOpen, Plus, Power, RefreshCw, RotateCw, TriangleAlert, Upload } from 'lucide-react'
import { Alert, Button, EmptyState, FormSection, Input, Skeleton, StatusPill, Tooltip, errText, useFeedback } from '@/ui'
import { usePersistedFlag } from '@/hooks/usePersistedFlag'
import { connectedNodeDevices, compareVersion, executableDevices, heldChannels, releaseTargetOf, nodeIsAsleep, nodeIsOnline, type NodeCommand, type ScoutNode } from '@/api/nodes'
import { EMPTY_ARRAY } from '@/lib/unwrap'
import { useNodeCommand, useNodes, useScoutRelease, useClaimLegacyNode } from './queries'
import { useSession } from '@/lib/session'
import { NodeLogs } from './NodeLogs'
import { NodePlugins, PLUGIN_PANES, type PluginPane } from './NodePlugins'
import { AddNodeModal } from './AddNodeModal'
import { scoutReleaseState } from './releaseState'

type Pane = 'overview' | 'connect' | 'logs'

const PANES: { id: Pane; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'connect', label: '接入' },
  { id: 'logs', label: '日志' },
]

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
  const accountId = useSession(state => state.user?.user_id || '')
  const [addingNode, setAddingNode] = useState(false)
  const [params, setParams] = useSearchParams()
  const [listCollapsed, setListCollapsed] = usePersistedFlag('mino.nodes.rail', false)
  const picked = params.get('node') || ''
  const [nodeOrder, setNodeOrder] = useState<string[]>([])
  useEffect(() => {
    if (!nodes.data) return
    setNodeOrder(previous => {
      const ids = new Set(nodes.data.map(n => n.node_id))
      const old = previous.filter(id => ids.has(id))
      const fresh = [...nodes.data].sort((a, b) => Number(nodeIsOnline(b)) - Number(nodeIsOnline(a)) || String(a.hostname || a.node_id).localeCompare(String(b.hostname || b.node_id), 'zh-Hans-CN')).map(n => n.node_id)
      const next = [...old, ...fresh.filter(id => !old.includes(id))]
      return previous.join('\0') === next.join('\0') ? previous : next
    })
  }, [nodes.data])

  const list: ScoutNode[] = useMemo(() => {
    const raw = nodes.data ?? EMPTY_ARRAY
    const ranks = new Map(nodeOrder.map((id, index) => [id, index]))
    return [...raw].sort((a, b) => (ranks.get(a.node_id) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.node_id) ?? Number.MAX_SAFE_INTEGER) || Number(nodeIsOnline(b)) - Number(nodeIsOnline(a)) || String(a.hostname || a.node_id).localeCompare(String(b.hostname || b.node_id), 'zh-Hans-CN'))
  }, [nodes.data, nodeOrder])
  const activeId = (picked ? (list.some((n) => n.node_id === picked) ? picked : '') : list[0]?.node_id) || ''
  const active = list.find((n) => n.node_id === activeId)

  const totals = useMemo(() => {
    let online = 0
    let devices = 0
    let holders = 0
    for (const n of list) {
      if (nodeIsOnline(n)) online += 1
      devices += executableDevices(n).length
      if (heldChannels(n).length) holders += 1
    }
    return { online, devices, holders }
  }, [list])

  const emptyContent = nodes.isLoading && !nodes.data ? <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
    : nodes.isError && !nodes.data ? (
      <Card>
        <EmptyState
          icon={<TriangleAlert size={28} strokeWidth={1.5} style={{ color: 'var(--w-fail)' }} />}
          title="读取节点失败"
          hint={errText(nodes.error, '确认 Nexus 可达。')}
          action={<Button size="small" onClick={() => void nodes.refetch()}>重试</Button>}
        />
      </Card>
    ) : !list.length ? (
      <Card>
        <EmptyState
          icon={<Cpu size={28} strokeWidth={1.5} />}
          title="还没有节点接入"
          hint="点击添加节点，将安装命令复制到目标电脑执行。Scout 接入后会出现在这里。"
          action={<Button onClick={() => setAddingNode(true)}>添加节点</Button>}
        />
      </Card>
    ) : picked && !active ? <Card><EmptyState title="该节点不可见或已移除" hint={`节点 ${picked} 未出现在当前账号目录中，请从列表明确选择另一个节点。`} /></Card> : null

  const selectNode = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('node', id)
    setParams(next, { replace: false })
  }

  return (
    <div className="w-workspace flex flex-col" style={{ height: '100%', minHeight: 0, gap: 'var(--w-space-3)' }}>
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--w-text)' }}>
          Scout 节点
        </h1>
        <span className="flex items-center gap-3" style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: 'var(--w-text-tertiary)' }}>
          <span>在线 <strong style={{ color: 'var(--w-text)' }}>{totals.online}</strong> / {list.length}</span>
          <span className="inline-flex items-center gap-1">
            可执行设备 <strong style={{ color: totals.devices ? 'var(--w-pass)' : 'var(--w-warn)' }}>{totals.devices}</strong>
          </span>
          {totals.holders ? (
            <Tooltip title="持有任一对话渠道（如微信）的节点需要常驻，不要休眠或关机">
              <span>对话持有节点 <strong style={{ color: 'var(--w-text)' }}>{totals.holders}</strong></span>
            </Tooltip>
          ) : null}
        </span>
        <span style={{ flex: 1 }} />
        <Button icon={<Plus size={14} />} onClick={() => setAddingNode(true)}>添加节点</Button>
        <Tooltip title="刷新">
          <Button size="small" icon={<RefreshCw size={13} />} loading={nodes.isFetching} onClick={() => { setNodeOrder([]); void nodes.refetch() }} aria-label="刷新" />
        </Tooltip>
      </div>

      {nodes.isError && nodes.data && <Alert type="warning" showIcon message="节点刷新失败，以下保留上次读取信息" description={errText(nodes.error)} />}
              {active?.owner_user_id ? (
          <NodeToolbar key={active.node_id}
            node={active}
            pane={paneOf(params.get('pane'))}
            onPane={(id) => {
              const next = new URLSearchParams(params)
              next.set('node', active.node_id)
              next.set('pane', id)
              setParams(next, { replace: false })
            }}
          />
        ) : null}

      {emptyContent ? emptyContent : <>
      {active && !nodeIsOnline(active) ? (
        <div role="status" style={{ padding: '8px 12px', borderRadius: 'var(--w-radius-sm)', background: 'var(--w-warn-bg)', color: 'var(--w-warn)', fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>
          当前节点离线，无法配置插件或下发指令。仍可添加其他电脑的节点。
        </div>
      ) : null}

      <div className="w-nodes-body">
        <NodeRail
          list={list}
          activeId={activeId}
          collapsed={listCollapsed}
          onToggle={() => setListCollapsed((v) => !v)}
          onSelect={selectNode}
        />

        {active ? <NodeDetail node={active} pane={active.owner_user_id ? paneOf(params.get('pane')) : 'overview'} pluginPane={pluginPaneOf(params.get('pane'))} /> : null}
      </div>
      </>}
      <AddNodeModal key={accountId} open={addingNode} onClose={() => setAddingNode(false)} />
    </div>
  )
}

function NodeRail({
  list,
  activeId,
  collapsed,
  onToggle,
  onSelect,
}: {
  list: ScoutNode[]
  activeId: string
  collapsed: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const visibleList = list.filter(n => `${n.hostname || ''} ${n.node_id} ${n.platform || ''}`.toLowerCase().includes(search.toLowerCase()))

  return (
    <aside
      className="w-rail w-node-col shrink-0 overflow-y-auto flex flex-col"
      style={{
        width: collapsed ? 56 : 272,
        background: 'var(--w-surface)',
        border: '1px solid var(--w-border)',
        borderRadius: 'var(--w-radius-lg)',
        minHeight: 0,
      }}
    >
      <div
        className="flex items-center shrink-0"
        style={{
          height: 40,
          padding: collapsed ? 0 : '0 8px 0 12px',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--w-border)',
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700, color: 'var(--w-text-secondary)' }}>节点</span>
        )}
        <Tooltip title={collapsed ? '展开节点列表' : '折叠节点列表'} placement="right">
          <Button
            size="small"
            type="text"
            icon={collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            onClick={onToggle}
            aria-label={collapsed ? '展开节点列表' : '折叠节点列表'}
            aria-expanded={!collapsed}
          />
        </Tooltip>
      </div>

      {!collapsed && <div style={{ padding: 12 }}><Input aria-label="搜索节点" placeholder="搜索名称、编号或系统" allowClear value={search} onChange={e => setSearch(e.target.value)} /></div>}
      {collapsed ? (
        list.map((n) => {
          const on = nodeIsOnline(n)
          const asleep = nodeIsAsleep(n)
          const name = n.hostname || n.node_id.slice(0, 8)
          const act = n.node_id === activeId
          const stateLabel = asleep ? '已休眠' : on ? '在线' : '离线'
          return (
            <Tooltip key={n.node_id} title={`${stateLabel} ${name}`} placement="right">
              <button
                type="button"
                onClick={() => onSelect(n.node_id)}
                aria-label={`${stateLabel} ${name}`}
                aria-current={act ? 'true' : undefined}
                data-active={act ? 'true' : 'false'}
                className="w-hit"
                style={{
                  height: 40,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: asleep ? 'var(--w-warn)' : on ? 'var(--w-pass)' : 'var(--w-text-quaternary)',
                    boxShadow: act ? '0 0 0 3px var(--w-primary-soft)' : 'none',
                  }}
                />
              </button>
            </Tooltip>
          )
        })
      ) : (
        <>
          {visibleList.map(n => <NodeRow key={n.node_id} node={n} active={n.node_id === activeId} onSelect={onSelect} />)}
          {!visibleList.length && <p style={{ padding: 16 }}>没有匹配的节点</p>}
        </>
      )}
    </aside>
  )
}

function NodeRow({ node, active, onSelect }: { node: ScoutNode; active: boolean; onSelect: (id: string) => void }) {
  const devs = executableDevices(node).length
  const on = nodeIsOnline(node)
  const asleep = nodeIsAsleep(node)
  const label = asleep ? '已休眠' : on ? '在线' : '离线'
  const held = heldChannels(node)
  const platform = String(node.platform || '').toLowerCase()
  const system = /darwin|mac/.test(platform) ? 'macOS' : /win/.test(platform) ? 'Windows' : /linux/.test(platform) ? 'Linux' : node.platform || '未知系统'
  const heartbeat = node.last_heartbeat ? new Date(node.last_heartbeat) : undefined
  const lastHeartbeat = heartbeat && !Number.isNaN(heartbeat.getTime()) ? heartbeat.toLocaleString() : '暂无心跳'
  return (
    <button
      type="button"
      onClick={() => onSelect(node.node_id)}
      data-active={active ? 'true' : 'false'}
      className="w-scout-row w-hit"
    >
      <span className="min-w-0 flex flex-col gap-1">
        <strong className="w-node-name" title={node.hostname || node.node_id} style={{ color: active ? 'var(--w-primary)' : 'var(--w-text)' }}>{node.hostname || node.node_id}</strong>
        <span className="w-node-list-meta">{system} · 可执行 {devs} 台 · {node.scout_version ? `v${node.scout_version.replace(/^v/i, '')}` : '版本未上报'}</span>
        <span className="w-node-list-meta" title={`最后心跳：${lastHeartbeat}`}>心跳 {lastHeartbeat}</span>
        {!!held.length && <span className="w-node-list-meta" style={{ color: 'var(--w-primary)' }}>对话 · {held.join('、')}</span>}
      </span>
      <span style={{ textAlign: 'right', fontSize: 'var(--w-font-sm)', fontWeight: 700, color: asleep ? 'var(--w-warn)' : on ? 'var(--w-pass)' : 'var(--w-text-tertiary)' }}>
        {label}
      </span>
    </button>
  )
}

function pluginPaneOf(raw: string | null): PluginPane | undefined {
  return PLUGIN_PANES.find((p) => p === raw)
}

function paneOf(raw: string | null): Pane {
  if (raw === 'logs') return 'logs'
  if (raw === 'connect' || pluginPaneOf(raw)) return 'connect'
  return 'overview'
}

function NodeToolbar({ node, pane, onPane }: { node: ScoutNode; pane: Pane; onPane: (id: Pane) => void }) {
  const fb = useFeedback()
  const cmd = useNodeCommand()
  const release = useScoutRelease(node)
  const online = nodeIsOnline(node)
  const asleep = nodeIsAsleep(node)
  const current = String(node.scout_version || '')
  const latest = String(release.data?.version || '')
  const releaseTarget = releaseTargetOf(node)
  const updateKey = `mino.nodes.update.${node.owner_user_id || ''}.${node.node_id}`
  const [pendingVersion, setPendingVersion] = useState(() => { try { return sessionStorage.getItem(updateKey) || '' } catch { return '' } })
  const [commandError, setCommandError] = useState('')
  const state = scoutReleaseState(node, release)
  const downloading = !!node.update_job?.active
  const versionConfirmed = pendingVersion && compareVersion(current, pendingVersion) != null && compareVersion(current, pendingVersion)! >= 0
  const waiting = !!pendingVersion && !versionConfirmed
  const upgradeLabel = downloading ? (node.update_job?.label || '正在升级') : waiting ? '等待节点版本确认' : state.label
  const upgradeBlocked = !online ? '节点离线，无法接收升级命令。' : waiting ? '升级结果待确认，请读取同一节点状态，避免重复下发。' : state.canUpgrade ? '' : state.detail
  useEffect(() => {
    if (!versionConfirmed || !pendingVersion) return
    setPendingVersion('')
    try { sessionStorage.removeItem(updateKey) } catch { /* 不影响版本展示 */ }
  }, [versionConfirmed, pendingVersion, updateKey])

  const run = async (command: NodeCommand, label: string, danger = false) => {
    const ok = await fb.confirm({
      title: `确定${label}节点 ${node.node_id}？`,
      content: danger
        ? `${node.hostname || node.node_id} 上正在执行的用例会被中断。`
        : `命令会下发给 ${node.hostname || node.node_id}，节点编号 ${node.node_id}，账号归属 ${node.owner_user_id || '未报告'}。`,
      danger,
      okText: label,
    })
    if (!ok) return
    if (command === 'update') {
      if (upgradeBlocked || downloading || cmd.isPending) return
      setPendingVersion(latest)
      try { sessionStorage.setItem(updateKey, latest) } catch { /* 页面内仍保留待确认状态 */ }
    }
    setCommandError('')
    try {
      await cmd.mutateAsync({ nodeId: node.node_id, command })
      fb.ok(`${label}命令已下发`)
    } catch (e) {
      if (command === 'update' && requestDropped(e)) {
        fb.warn('页面连接中断，下载可能仍在进行。请先查看同一节点的升级任务状态，避免重复下发。')
        return
      }
      const text = errText(e, `${label}失败`)
      setCommandError(text)
      if (command === 'update' && !requestDropped(e)) { setPendingVersion(''); try { sessionStorage.removeItem(updateKey) } catch { /* 可再次检查状态 */ } }
      fb.fail(text)
    }
  }

  return <div className="flex shrink-0 flex-col gap-3">
    <div className="w-node-version" role="status">
      <div className="min-w-0"><strong className="w-node-name">{node.hostname || node.node_id}</strong><span className="w-form-hint">运行版本：{current || '未上报'} · {node.host?.os || node.platform || '系统未上报'} / {node.arch || node.host?.arch || '架构未上报'}</span></div>
      <StatusPill status={waiting ? 'warn' : state.kind === 'available' ? 'pass' : state.kind === 'failed' ? 'warn' : 'muted'}>{upgradeLabel}</StatusPill>
      <span className="w-form-hint" style={{ flex: 1 }}>{waiting ? '升级已触发，等待心跳确认运行版本。请勿重复下发。' : state.detail}</span>
      <Button disabled={release.isFetching || !releaseTarget.os || !releaseTarget.arch} loading={release.isFetching} onClick={() => void release.refetch()}>检查更新</Button>
      <Tooltip title={upgradeBlocked || state.detail}><span><Button icon={<Upload size={14} />} disabled={!!upgradeBlocked || downloading || cmd.isPending} loading={cmd.isPending && cmd.variables?.command === 'update'} onClick={() => void run('update', `升级至 ${latest}`)}>升级</Button></span></Tooltip>
      {downloading && typeof node.update_job?.percent === 'number' && <span>{Math.round(Math.max(0, Math.min(100, node.update_job.percent)))}%</span>}
      {release.dataUpdatedAt > 0 && <span className="w-form-hint">检查于 {new Date(release.dataUpdatedAt).toLocaleTimeString()}</span>}
    </div>
    {(commandError || node.update_job?.error) && <Alert type="warning" message="节点操作需要核对" description={commandError || node.update_job?.error} />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="w-node-tabs" role="group" aria-label="节点内容">
        {PANES.map(item => <button key={item.id} type="button" aria-pressed={pane === item.id} data-active={pane === item.id ? 'true' : 'false'} className="w-hit" onClick={() => onPane(item.id)}>{item.label}</button>)}
      </div>
      <div className="w-node-actions">
        <Tooltip title={online ? '持有对话渠道的节点休眠会影响渠道服务' : '节点离线，命令没有接收方'}><span><Button icon={<Power size={14} />} disabled={!online || cmd.isPending || waiting || downloading} onClick={() => void run(asleep ? 'wake' : 'sleep', asleep ? '唤醒' : '休眠')}>{asleep ? '唤醒' : '休眠'}</Button></span></Tooltip>
        <Button icon={<RotateCw size={14} />} disabled={!online || cmd.isPending || waiting || downloading} onClick={() => void run('restart', '重启', true)}>重启</Button>
      </div>
    </div>
  </div>
}

function NodeDetail({ node, pane, pluginPane }: { node: ScoutNode; pane: Pane; pluginPane?: PluginPane }) {
  const role = useSession((state) => state.role)
  const claim = useClaimLegacyNode()
  const fb = useFeedback()
  const [permissionsOpen, setPermissionsOpen] = useState(false)
  const devices = connectedNodeDevices(node)

  const beat = node.last_seen_ago_sec != null ? `心跳 ${Math.round(node.last_seen_ago_sec)} 秒前` : ''
  const runnable = devices.filter((d) => d.executable === true).length
  const batteryPct = node.host?.battery_percent
  const batteryLow = batteryPct != null && batteryPct < 20
  const stale = node.last_seen_ago_sec != null && node.last_seen_ago_sec > 60
  const executors = Object.entries(node.executors || {})
  const execText = executors.length
    ? executors.map(([name, ex]) => (ex?.available ? `${name} ${ex.provides ?? '数量未上报'} 项` : `${name} 不可用`)).join(' · ')
    : '没有上报'

  return (
    <section
      className="w-surface-card flex min-h-0 min-w-0 flex-1 flex-col"
      style={{ minHeight: 0, overflow: pane === 'connect' ? 'hidden' : 'auto', paddingBottom: pane === 'connect' ? 0 : 28 }}
    >
      {pane === 'overview' ? (
        <>
          <div style={{ padding: '16px 14px 12px', borderBottom: '1px solid var(--w-border)' }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: runnable ? 'var(--w-pass)' : 'var(--w-warn)' }}>
              {runnable} 台可执行
            </div>
            <div style={{ marginTop: 4, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
              {nodeIsOnline(node) ? '节点在线，执行取决于设备状态' : '节点离线，不能下发'}
              {batteryPct != null ? ` · 电量 ${batteryPct}%${batteryLow ? '，偏低' : ''}` : ''}
              {beat ? ` · ${beat}${stale ? '，心跳偏旧' : ''}` : ''}

            </div>
          </div>
          <div style={{ padding: 14, borderBottom: '1px solid var(--w-border)' }}>
            <strong>宿主电脑 · {({ darwin: 'macOS', macos: 'macOS', windows: 'Windows', linux: 'Linux' } as Record<string, string>)[node.host?.os || node.platform || ''] || '系统未知'}</strong>
            <p style={{ margin: '6px 0', color: 'var(--w-text-tertiary)' }}>{node.hostname || '主机名未上报'} · {node.arch || node.host?.arch || '架构未上报'}</p>
            <span role="status">{nodeIsOnline(node) ? '节点在线' : '节点离线'}</span>
            {!node.owner_user_id && role === 'admin' ? <div style={{ marginTop: 8 }}><Button size="small" loading={claim.isPending} onClick={() => claim.mutate(node.node_id, { onError: (error) => fb.fail(errText(error, '认领失败')) })}>认领历史节点到当前账号</Button></div> : null}
          </div>
          <FormSection title="节点信息" description="来自当前节点上报；未提供的字段不会按默认值补齐。">
            <dl className="w-facts-grid">
              <div><dt>节点编号</dt><dd className="w-mono">{node.node_id}</dd></div>
              <div><dt>运行版本</dt><dd>{node.scout_version || '未上报'}</dd></div>
              <div><dt>归属账号</dt><dd>{node.owner_name || node.owner_user_id || '未归属'}</dd></div>
              <div><dt>主机架构</dt><dd>{node.arch || node.host?.arch || '未上报'}</dd></div>
              <div><dt>运行状态</dt><dd>{node.draining ? '停止接收新任务' : node.busy === true ? '忙碌' : node.busy === false ? '空闲' : '未上报'}</dd></div>
              <div><dt>桌面状态</dt><dd>{node.host?.desktop?.blocked_reason || ({ ready: '已就绪', permission_required: '需要系统授权', blocked: '暂不可执行' } as Record<string, string>)[node.host?.desktop?.state || ''] || node.host?.desktop?.state || '未上报'}</dd></div>
              <div><dt>CPU 使用率</dt><dd>{typeof node.host?.cpu_percent === 'number' ? `${node.host.cpu_percent}%` : '未上报'}</dd></div>
              <div><dt>内存用量</dt><dd>{typeof node.host?.rss_mb === 'number' ? `${node.host.rss_mb} MB` : '未上报'}</dd></div>
            </dl>
          </FormSection>
          <div className="w-band" data-tone="quiet">当前节点设备 · {devices.length} 台 · 执行器 · {execText}</div>
          {!devices.length ? (
            <div style={{ padding: 14, fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>
              {nodeIsOnline(node)
                ? '这台 Scout 暂未上报已连接设备。请将设备连接到这台电脑；其他节点和已断开的历史设备不会显示在这里。'
                : '节点离线，暂无实时设备。恢复 Scout 连接后，这里会显示该节点当前连接的设备。'}
            </div>
          ) : devices.map((d) => {
            const on = d.executable === true
            return (
              <Fragment key={d.sn}>
              <Link to={`/settings/runtime/device/${encodeURIComponent(d.sn)}?node=${encodeURIComponent(node.node_id)}&device=${encodeURIComponent(d.sn)}&pane=overview`} className="w-scout-row w-hit">
                <span className="min-w-0 flex flex-col gap-1">
                  <strong className="truncate" style={{ fontSize: 'var(--w-font-base)', fontWeight: 650 }}>{d.model || d.type || '设备'}</strong>
                  <span className="w-mono truncate" style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-tertiary)' }}>{d.sn}</span>
                </span>
                <span style={{ textAlign: 'right', fontSize: 'var(--w-font-sm)', fontWeight: 700, color: on ? 'var(--w-pass)' : 'var(--w-text-tertiary)' }}>
                  {on ? '可执行' : d.blocked_reason || d.desktop_state || d.status || '执行状态未上报'}
                </span>
                <span className="w-scout-go" style={{ color: 'var(--w-text-tertiary)', fontSize: 'var(--w-font-sm)', fontWeight: 650 }}>
                  {usesDesktopExecutor(d.platform) ? `PC 桌面 · ${d.platform === 'mac' ? 'mac' : d.platform === 'win' ? 'win' : d.os || '系统未知'}` : d.platform === 'web' ? 'Web 浏览器' : d.platform || d.type || ''}
                </span>
              </Link>
              {usesDesktopExecutor(d.platform) && node.host?.desktop?.state === 'permission_required' ? (
                <div style={{ padding: '4px 14px 10px' }}>
                  <Button size="small" type="link" onClick={() => setPermissionsOpen((value) => !value)}>处理权限</Button>
                  {permissionsOpen ? <p>macOS：打开系统设置 → 隐私与安全性，为运行 Scout 的程序授予屏幕录制和辅助功能权限；按系统提示重启该程序，心跳会自动更新状态。</p> : null}
                </div>
              ) : null}
              </Fragment>
            )
          })}
        </>
      ) : null}
      {pane === 'connect' ? <div className="flex min-h-0 flex-1 flex-col"><NodePlugins key={node.node_id} node={node} initialPane={pluginPane} /></div> : null}
      {pane === 'logs' ? <div style={{ padding: 'var(--w-space-3)' }}><NodeLogs nodeId={node.node_id} embedded /></div> : null}
    </section>
  )
}

function requestDropped(e: unknown): boolean {
  const any = e as { response?: unknown; code?: string; message?: string }
  if (any?.response) return false
  const msg = String(any?.message || any?.code || '')
  return /network error|timeout|ECONNABORTED|ECONNRESET/i.test(msg)
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--w-surface)', border: '1px solid var(--w-border)', borderRadius: 'var(--w-radius-lg)' }}>
      {children}
    </div>
  )
}
