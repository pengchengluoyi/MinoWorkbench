import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle, RefreshCw } from 'lucide-react'
import { type ScoutNode, type ScoutUpdateTarget, nodeIsOnline } from '@/api/nodes'
import type { NodeTool } from '@/api/nodeTools'
import { createUUID } from '@/lib/uuid'
import { nexusOrigin } from '@/lib/config'
import { Alert, Button, Tooltip, errText } from '@/ui'
import { nodeKeys, useNodeCommand, useScoutRelease, useScoutUpdateStatus } from './queries'
import { scoutReleaseState } from './releaseState'

const terminal = new Set(['succeeded', 'failed', 'rolled_back', 'cancelled', 'expired'])
const labels: Record<string, string> = { waiting_idle: '等待节点空闲', installing: '正在下载与安装', restarting: '正在重启', verifying: '正在核验运行版本', needs_operator: '升级结果需要核对', succeeded: '升级完成，运行版本已核验', failed: '升级失败', rolled_back: '升级失败，已恢复原版本', cancelled: '升级已取消', expired: '等待空闲超时，未执行升级' }
type Pending = ScoutUpdateTarget & { version: string }

function remember(key: string, pending: Pending | null) {
  try {
    if (pending) sessionStorage.setItem(key, JSON.stringify(pending))
    else sessionStorage.removeItem(key)
    return true
  } catch { return false }
}

export function ScoutUpdateControl({ node, tool, refreshing, onRefresh }: { node: ScoutNode; tool: NodeTool; refreshing: boolean; onRefresh: () => void }) {
  if (tool.runtime_environment === 'development' || node.runtime_environment === 'development') {
    const running = tool.running_version || tool.version || node.scout_version || '未上报'
    const source = tool.source_version
    const restart = tool.restart_required || !!source && source !== running
    return <div className="w-scout-update" aria-label="Scout 源码版本">
      <div className="w-scout-update-actions"><span className="w-download-badge" data-tone="neutral">源码运行</span><Button type="text" size="small" icon={<RefreshCw size={13} />} loading={refreshing} onClick={onRefresh}>刷新版本</Button></div>
      <p className="w-download-state-note" role="status">正在运行 {running}{source ? ` · 本地源码 ${source}` : ' · 本地源码版本尚未上报'}</p>
      <p className="w-download-state-note">{restart ? '源码已有变更，重启此节点后生效。' : '通过同步源码并重启此节点更新。'}{!source && '重启后可读取源码版本详情。'}</p>
    </div>
  }
  return <InstalledScoutUpdateControl node={node} />
}

function InstalledScoutUpdateControl({ node }: { node: ScoutNode }) {
  const key = `mino:scout-update:${nexusOrigin()}:${node.owner_user_id || ''}:${node.node_id}`
  const [pending, setPending] = useState<Pending | null>(() => {
    try { const value = JSON.parse(sessionStorage.getItem(key) || 'null'); return value?.operation_id && value.build_id && value.release_tag ? value : null } catch { return null }
  })
  const [error, setError] = useState('')
  const sending = useRef(false)
  const queryClient = useQueryClient()
  const release = useScoutRelease(node)
  const status = useScoutUpdateStatus(node.node_id, pending?.operation_id || '', !!pending)
  const command = useNodeCommand()
  const operation = status.data?.operation
  const state = scoutReleaseState(node, release)
  const verified = operation?.state === 'succeeded' && operation.running_version_verified === true
  const active = !!node.update_job?.active || !!operation && (!terminal.has(operation.state) || operation.state === 'succeeded' && !verified) || !!pending && !(operation?.operation_id === pending.operation_id && terminal.has(operation.state) && (operation.state !== 'succeeded' || verified))
  const supportsUpdate = Array.isArray(node.runtime_capabilities) && node.runtime_capabilities.some(capability => capability.id === 'node.update' && capability.contract_version === 1)
  const blocked = !nodeIsOnline(node) ? '节点离线，恢复连接后即可升级' : node.runtime_environment === 'development' ? '源码 Scout 请更新源码并重启；安装包更新用于正式节点' : !supportsUpdate ? '此旧版 Scout 已关闭远程更新；先用添加节点的安装命令更新一次，之后即可在线升级' : active ? '正在处理原升级请求，请等待运行版本核验' : command.isPending ? '升级请求正在提交' : status.isPending || status.isError ? '请先读取原升级状态' : !release.data?.build_id || !release.data.release_tag ? '尚未取得完整的固定版本发布信息' : !state.canUpgrade ? state.detail : ''
  useEffect(() => {
    if (!pending || operation?.operation_id !== pending.operation_id || !terminal.has(operation.state) || operation.state === 'succeeded' && !verified) return
    setPending(null)
    remember(key, null)
    void queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['account', node.owner_user_id || '', nexusOrigin(), 'node-tools', node.node_id] })
  }, [operation, verified, pending, key, queryClient, node.node_id, node.owner_user_id])
  const submit = async (original?: Pending) => {
    if (sending.current || !original && blocked) return
    sending.current = true
    setError('')
    try {
      const target = original || { operation_id: createUUID(), build_id: release.data!.build_id!, release_tag: release.data!.release_tag!, version: release.data!.version || '' }
      setPending(target)
      remember(key, target)
      await command.mutateAsync({ nodeId: node.node_id, command: 'update', update: target })
    } catch (failure) {
      const httpStatus = (failure as { response?: { status?: number } }).response?.status
      if (httpStatus && [400, 401, 403, 404, 409, 410, 422].includes(httpStatus)) {
        setPending(null)
        remember(key, null)
      }
      setError(errText(failure, '升级请求结果未确认，请核对原请求'))
    } finally {
      sending.current = false
      void queryClient.invalidateQueries({ queryKey: nodeKeys.all })
    }
  }
  const phase = verified ? 3 : operation?.state === 'verifying' || operation?.state === 'restarting' ? 2 : operation?.state === 'installing' ? 1 : 0
  const operationFailed = !!operation && ['failed', 'rolled_back', 'cancelled', 'expired', 'needs_operator'].includes(operation.state)
  return <div className="w-scout-update" aria-label="Scout 在线升级">
    <div className="w-scout-update-actions">
      <Tooltip title={blocked || state.detail}><span><Button type="primary" icon={<ArrowUpCircle size={14} />} disabled={!!blocked} loading={command.isPending} onClick={() => void submit()}>{active ? '升级处理中' : state.canUpgrade ? state.label : '升级 Scout'}</Button></span></Tooltip>
      <Button type="text" size="small" icon={<RefreshCw size={13} />} loading={release.isFetching || status.isFetching} onClick={() => { void release.refetch(); void status.refetch() }}>检查更新</Button>
    </div>
    {active && <ol className="w-download-inline-steps" aria-label="Scout 升级步骤">{['等待空闲', '下载安装', '重启核验'].map((title, index) => <li key={title} data-state={index < phase ? 'done' : index === phase ? 'current' : 'pending'} aria-current={index === phase ? 'step' : undefined}><span>{index < phase ? '✓' : index + 1}</span>{title}</li>)}</ol>}
    <p className="w-download-state-note" role="status">{operation ? operation.state === 'succeeded' && !verified ? '等待运行版本核验，尚未确认升级成功' : labels[operation.state] || operation.state : active ? '正在核对原升级请求，请勿重复提交' : release.isError ? '版本检查失败，请重试；不代表已是最新' : !supportsUpdate ? blocked : state.detail}</p>
    {release.data?.version && <span className="w-download-version">当前 {node.scout_version || '未上报'} → 可安装 {release.data.version}</span>}
    {(error || status.isError || operationFailed) && <Alert type="warning" showIcon message={error || (status.isError ? '原升级状态未确认' : labels[operation!.state])} description={operation?.result?.reason || (status.isError ? errText(status.error) : undefined)} />}
    {pending && !command.isPending && (!operation || operation.operation_id !== pending.operation_id) && <Button size="small" onClick={() => void submit(pending)}>重试原升级请求</Button>}
  </div>
}
