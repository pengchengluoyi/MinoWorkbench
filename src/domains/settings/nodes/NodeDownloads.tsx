import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { removeNodePlugin } from '@/api/nodes'
import { nodeKeys } from './queries'
import { Cpu, Download, Globe2, Info, MessagesSquare, RefreshCw, Smartphone, Terminal } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { Alert, Button, errText, useFeedback } from '@/ui'
import type { ScoutNode } from '@/api/nodes'
import type { NodeTool, NodeToolTask } from '@/api/nodeTools'
import { useNodeTools } from './useNodeTools'
import { ScoutUpdateControl } from './ScoutUpdateControl'
import './NodeDownloads.css'

const STATE: Record<string, string> = {
  unknown: '状态未知', installed: '已安装', matched: '已匹配', missing: '未安装',
  cached: '电脑已缓存', missing_python: '缺少 Python 3.11+',
}
const TASK: Record<string, string> = { pending: '排队中', running: '安装中', unknown: '结果待确认', succeeded: '安装完成', failed: '安装失败', interrupted: '安装中断' }
const APK_TASK: Record<string, string> = { pending: '等待下载', running: '下载中', unknown: '结果待确认', succeeded: '缓存已就绪', failed: '下载失败', interrupted: '下载中断' }
const ICONS = { 'scout.core': Cpu, chromium: Globe2, 'adb.keyboard': Smartphone, 'cli.feishu': Terminal, 'cli.meego': Terminal, langbot: MessagesSquare }
function tone(state: string) {
  if (['installed', 'matched', 'cached', 'succeeded'].includes(state)) return 'success'
  if (['pending', 'running'].includes(state)) return 'progress'
  if (['unknown', 'missing_python', 'interrupted'].includes(state)) return 'warning'
  return state === 'failed' ? 'error' : 'neutral'
}
function status(tool: NodeTool) {
  if (tool.tool_id === 'adb.keyboard') return tool.state === 'missing' ? 'APK 未缓存（可选）' : tool.state === 'cached' ? 'APK 已缓存' : STATE[tool.state] || '状态未知'
  if (tool.tool_id === 'chromium' && tool.state === 'missing') return '未就绪'
  return STATE[tool.state] || '状态未知'
}
function bytes(value: number) {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`
}
function InstallProgress({ task, label, apk = false }: { task?: NodeToolTask; label: string; apk?: boolean }) {
  const updating = task?.action === 'update'
  const current = task?.state === 'running' ? 1 : task?.state === 'pending' ? 0 : -1
  const total = task?.bytes_total || 0
  const received = task?.bytes_received || 0
  return <div className="w-download-inline-progress" role="status">
    <ol className="w-download-inline-steps" aria-label={`${label} 安装步骤`}>
      {(apk ? ['受理下载', '下载 APK', '缓存完成'] : updating ? ['受理更新', '安装新版本', '更新完成'] : ['受理任务', '执行安装', '安装完成']).map((title, index) => <li key={title} data-state={index < current ? 'done' : index === current ? 'current' : 'pending'} aria-current={index === current ? 'step' : undefined}><span aria-hidden>{index < current ? '✓' : index + 1}</span>{title}</li>)}
    </ol>
    {task && task.state !== 'succeeded' && <>
      <span className="w-download-inline-label">{(apk ? APK_TASK : TASK)[task.state]}{task.label ? ` · ${task.label}` : ''}</span>
      {total > 0 && task.state === 'running' && <div className="w-download-progress"><progress value={Math.min(received, total)} max={total} aria-label={`${label} 下载进度`} /><span>{bytes(received)} / {bytes(total)}</span></div>}
      {task.error && <span className="w-download-task-error">{task.error}</span>}
      <details className="w-download-details"><summary>任务详情</summary><span className="w-download-task-id">{task.task_id} · {new Date(task.created_at * 1000).toLocaleString()}</span></details>
    </>}
  </div>
}
export function NodeDownloads({ node }: { node: ScoutNode }) {
  const tools = useNodeTools(node.node_id)
  const [params, setParams] = useSearchParams()
  const fb = useFeedback()
  const qc = useQueryClient()
  const [removing, setRemoving] = useState('')
  const [queueing, setQueueing] = useState(false)
  const queueGuard = useRef(false)
  const data = tools.data
  const installableCount = data?.items.filter(tool => tool.installable).length || 0
  const install = async (toolId: string, operationId?: string, action: 'install' | 'update' = 'install') => {
    try {
      const task = await tools.install(toolId, operationId, action)
      if (task) { if (task.state === 'succeeded') fb.ok(task.label || '操作完成'); else if (['failed', 'interrupted', 'unknown'].includes(task.state)) fb.warn(task.error || task.label || '操作结果需要核对'); else fb.ok('已受理，请以任务最终结果为准') }
    } catch (error) {
      fb.fail(errText(error, '请求结果未确认；刷新只查询状态，再次点击会使用原请求编号'))
    }
  }
  const required = data?.items.filter(tool => tool.required_by_config && tool.state !== 'installed') || []
  const queueRequired = async () => {
    if (queueGuard.current || !data || data.stale || !data.online || !data.supported) return
    queueGuard.current = true
    setQueueing(true)
    try {
      // Submit sequentially; Scout owns the durable receipts and one-worker FIFO.
      // It continues after navigating away, never overlaps dependency installations.
      for (const tool of required) {
        if (!tool.installable || data.tasks.some(t => t.tool_id === tool.tool_id && t.active)) continue
        const task = await tools.install(tool.tool_id)
        if (!task || ['unknown', 'failed', 'interrupted'].includes(task.state)) throw new Error('安装请求尚未确认或已失败，请先核对任务；未继续提交后续项目')
      }
      fb.ok('所需插件已加入安装队列，将依次安装；完成后请回配置页手动启用')
    } catch (error) { fb.fail(errText(error)) }
    finally { queueGuard.current = false; setQueueing(false) }
  }
  const uninstall = async (tool: NodeTool) => {
    const langbot = tool.tool_id === 'langbot'
    const confirmed = await fb.confirm({ title: `卸载 ${tool.label}？`, content: langbot ? '将停止飞书、钉钉和企业微信对话，并清除当前节点上这些渠道的配置和凭据。' : `将卸载 ${tool.label}，停止相关服务，并清除当前节点上该组件的配置、登录授权和凭据。需要时可重新安装。`, okText: '卸载', danger: true })
    if (!confirmed) return
    setRemoving(tool.tool_id)
    try {
      await removeNodePlugin(node.node_id, { kind: tool.plugin_class || (langbot ? 'im' : 'cli'), plugin_id: tool.plugin_id || (langbot ? 'langbot' : tool.tool_id.split('.')[1]) })
      fb.ok(`${tool.label} 已卸载`)
      await Promise.all([tools.refetch(), qc.invalidateQueries({ queryKey: nodeKeys.all })])
    } catch (error) { fb.fail(errText(error, '卸载失败，请刷新状态核对')) }
    finally { setRemoving('') }
  }
  const configure = (tool: NodeTool) => {
    const next = new URLSearchParams(params)
    next.set('pane', 'connect')
    next.set('plugin', tool.config_key || '')
    setParams(next)
  }
  return <section className="w-downloads" aria-labelledby="node-downloads-title">
    <header className="w-download-header">
      <div><h2 id="node-downloads-title">下载中心</h2><p>统一安装与升级节点组件，查看当前版本和执行进度。</p></div>
      <div className="w-download-refresh">
        <Button icon={<RefreshCw size={14} aria-hidden />} loading={tools.isFetching} onClick={() => void tools.refetch()}>刷新状态</Button>
        {data?.reported_at && <span>{data.stale ? '上次上报' : '更新于'} {new Date(data.reported_at * 1000).toLocaleTimeString()}</span>}
      </div>
    </header>
    {!!required.length && <Alert type="warning" message={`已保存的配置需要安装：${required.map(t => t.label).join('、')}`} description="仅安装配置需要的插件，按队列逐个执行。未安装时保持停用，安装完成后回配置页手动启用。缺少 Python 的项目需先准备运行环境。" action={<Button disabled={!data?.online || !data.supported || data.stale || !!tools.busy || !!removing || queueing || !required.some(t => t.installable && !data.tasks.some(task => task.tool_id === t.tool_id && task.active))} loading={queueing} onClick={() => void queueRequired()}>按序安装所需插件</Button>} />}
    {tools.isError && <Alert type="error" message={errText(tools.error, '无法读取下载中心')} />}
    {data?.stale && <Alert type="warning" message={`当前显示最后已知状态${data.reported_at ? `（${new Date(data.reported_at * 1000).toLocaleString()}）` : ''}；不能据此安装。`} />}
    {data && !data.supported && <Alert type="info" message="当前 Scout 尚不支持下载中心安装，请手动升级。此处仅展示状态。" />}
    {tools.isPending && <div className="w-download-loading" role="status">正在读取节点组件…</div>}
    {data && <div className="w-download-components">
      <div className="w-download-section-heading"><h3>节点组件 <span>{data.items.length}</span></h3><span>{data.online && data.supported && !data.stale ? `${installableCount} 项可安装` : '仅查看状态'}</span></div>
      <table className="w-download-table">
        <caption className="w-download-sr-only">当前 Scout 的组件、状态与可用操作</caption>
        <thead><tr><th scope="col">组件 / 用途</th><th scope="col">当前状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{data.items.map(tool => {
          const tasks = data.tasks.filter(task => task.tool_id === tool.tool_id).sort((a, b) => b.created_at - a.created_at)
          const active = tasks.find(task => task.active)
          const latest = active || tasks[0]
          const cli = ['cli.feishu', 'cli.meego'].includes(tool.tool_id)
          const apk = tool.tool_id === 'adb.keyboard'
          const managed = tool.removable === true || cli || tool.tool_id === 'langbot'
          const installed = ['installed', 'matched', 'cached'].includes(tool.state)
          const dependency = ['chromium', 'adb.keyboard'].includes(tool.tool_id)
          const actionable = managed || dependency
          const removable = tool.removable ?? (managed && installed)
          const configured = tool.configured ?? node.plugins?.find(p => p.class === (tool.plugin_class || (tool.tool_id === 'langbot' ? 'im' : 'cli')) && p.id === (tool.plugin_id || (tool.tool_id === 'langbot' ? 'langbot' : tool.tool_id.split('.')[1])))?.configured
          const blocked = !data.online || !data.supported || data.stale || !!tools.busy || queueing || !!removing || node.plugins_ready !== true
          const Icon = ICONS[tool.tool_id as keyof typeof ICONS] || Download
          return <tr key={tool.tool_id} data-highlight={params.get('tool') === tool.tool_id || undefined}>
            <td><div className="w-download-component">
              <span className="w-download-icon" data-accent={cli || undefined}><Icon size={20} strokeWidth={1.7} aria-hidden /></span>
              <div className="w-download-component-copy"><strong>{tool.label}</strong><p>{tool.tool_id === 'langbot' ? '飞书、钉钉、企业微信对话' : tool.purpose}</p></div>
            </div></td>
            <td><div className="w-download-state-line">
              <span className="w-download-badge" data-tone={tone(active?.state || tool.state)}>{active ? (apk ? APK_TASK : TASK)[active.state] : status(tool)}</span>
              {tool.version && <span className="w-download-version">{tool.tool_id === 'chromium' ? `Revision ${tool.version}` : tool.tool_id === 'scout.core' ? `运行 v${tool.version}` : `v${tool.version}`}</span>}
              {cli && tool.state === 'installed' && !tool.version && <span className="w-download-version">版本未知</span>}
            </div>
              {cli && tool.state === 'installed' && <p className="w-download-state-note">{tool.configured === true ? '已配置 · 连通性需单独测试' : tool.configured === false ? '待配置接入信息' : '配置状态未知'}</p>}
              {apk && tool.state === 'missing' && <p className="w-download-state-note">{tool.devices?.some(device => device.state === 'installed') ? '已安装的设备可直接使用，无需重复下载。' : '仅给设备安装输入法时需要 APK。'}</p>}
              {tool.devices?.length ? <div className="w-download-devices">{tool.devices.map(device => <span key={device.sn} title={device.checked_at ? `最近自检：${new Date(device.checked_at * 1000).toLocaleString()}` : '尚无自检时间'}><Smartphone size={12} aria-hidden /><code>{device.sn}</code><span>{STATE[device.state] || '状态未知'}</span></span>)}</div> : null}
              {tool.detail && <details className="w-download-details"><summary>{tool.tool_id === 'adb.keyboard' ? '缓存与设备说明' : '组件说明'}</summary><p>{tool.detail}</p></details>}
            </td>
            <td><div className="w-download-actions">
              {tool.tool_id === 'scout.core' && <ScoutUpdateControl key={node.node_id} node={node} tool={tool} refreshing={tools.isFetching} onRefresh={() => void tools.refetch()} />}
              {actionable && latest && latest.state !== 'succeeded' && <InstallProgress task={latest} label={tool.label} apk={apk} />}
              {managed && installed && !active && (configured === true
                ? <Button type="text" className="w-download-in-use" title="已配置；具体连接状态可在配置页查看" onClick={() => configure(tool)}>{data.stale || !data.online ? '已配置（状态待刷新）' : '正在使用'}</Button>
                : <Button onClick={() => configure(tool)}>去配置</Button>)}
              {actionable && !installed && tool.installable && !active && <Button type={apk ? 'default' : 'primary'} icon={<Download size={14} aria-hidden />} disabled={blocked} loading={tools.busy === tool.tool_id} onClick={() => void install(tool.tool_id)}>{latest && ['failed', 'interrupted'].includes(latest.state) ? apk ? '重试下载 APK' : '重试安装' : apk ? '下载 APK' : '安装'}</Button>}
              {active?.state === 'unknown' && <Button disabled={blocked} onClick={() => void install(tool.tool_id, active.operation_id, active.action)}>核对原请求</Button>}
              {actionable && installed && (tool.updatable ?? true) && !active && <Button icon={<RefreshCw size={14} />} disabled={blocked || (data.contract_version || node.tool_tasks_version || 0) < 2} title={(data.contract_version || node.tool_tasks_version || 0) < 2 ? '此旧版 Scout 仅支持首次安装，升级 Scout 后即可更新组件' : tool.detail} loading={tools.busy === tool.tool_id} onClick={() => void install(tool.tool_id, undefined, 'update')}>{apk ? '更新 APK 缓存' : '检查并更新'}</Button>}
              {actionable && latest?.state === 'succeeded' && !active && <span className="w-download-state-note" role="status">{latest.label || (latest.action === 'update' ? '更新完成' : '安装完成')}</span>}
              {managed && installed && removable && <Button danger loading={removing === tool.tool_id} disabled={blocked || !!active} onClick={() => void uninstall(tool)}>卸载</Button>}
              {actionable && !installed && !tool.installable && !active && <span className="w-download-readonly">{tool.state === 'missing_python' ? '请先准备 Python 3.11+' : '等待节点上报安装能力'}</span>}
              {!actionable && tool.tool_id !== 'scout.core' && <span className="w-download-readonly">仅查看</span>}
            </div></td>
          </tr>
        })}</tbody>
      </table>
      <div className="w-download-note"><Info size={15} aria-hidden /><span>安装后前往「配置」完成接入。升级保留配置、数据和授权；Chromium 匹配 Scout 运行时，ADB Keyboard 的电脑缓存与设备状态分开显示。</span></div>
    </div>}

  </section>
}
