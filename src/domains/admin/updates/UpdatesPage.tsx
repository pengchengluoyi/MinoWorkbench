import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, Button, Input, Space, Tag } from 'antd'
import { installation, checkUpdate, prepareUpdate, startUpdate, updateStatus, cancelUpdate, type Component, type UpdateInfo } from '@/api/updates'
import { getServerInfo } from '@/api/me'
import { nexusOrigin } from '@/lib/config'
import { errText, useFeedback } from '@/ui/feedback'

const terminal = new Set(['succeeded', 'failed', 'rolled_back', 'cancelled', 'expired'])
const labels: Record<string, string> = { requested: '等待升级', waiting_idle: '等待任务结束', installing: '正在安装', prepared: '准备完成', stopping: '正在停止服务', switching: '正在切换版本', restarting: '正在启动服务', verifying: '正在验证', restoring: '正在恢复旧版', succeeded: '升级成功', failed: '升级失败', rolled_back: '已恢复旧版', cancelled: '已取消', expired: '等待超时', needs_operator: '需要人工恢复' }
function UpdateRow({ component }: { component: Component }) {
  const name = component === 'nexus' ? 'Nexus' : 'Workbench'
  const feedback = useFeedback()
  const queryClient = useQueryClient()
  const installed = useQuery({ queryKey: ['updates', component, 'installation'], queryFn: () => installation(component), retry: false })
  const server = useQuery({ queryKey: ['sys', 'server_info'], queryFn: getServerInfo, enabled: component === 'nexus', retry: false })
  const installationId = installed.data?.installation_id
  const key = `mino:updates:${nexusOrigin()}:${component}:${installationId || 'nexus'}`
  const [saved, setSaved] = useState<{ key: string; id: string }>()
  const [release, setRelease] = useState<UpdateInfo>()
  const [prepared, setPrepared] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [manual, setManual] = useState('')
  const operationId = saved?.key === key ? saved.id : installed.data?.operation_id || ''
  const status = useQuery({ queryKey: ['updates', component, installationId, operationId], queryFn: () => updateStatus(component, operationId, installationId), enabled: !!operationId && installed.isSuccess, retry: false, refetchInterval: q => terminal.has(q.state.data?.state || '') || q.state.data?.state === 'needs_operator' ? false : 4000 })
  const state = status.data?.state || (installed.data?.operation_id === operationId ? installed.data.state : '')
  const blocked = !!operationId && !terminal.has(state || '')
  useEffect(() => {
    try { const id = localStorage.getItem(key); if (id) setSaved({ key, id }) } catch { /* Manual operation lookup remains available. */ }
  }, [key])
  const remember = (id: string) => {
    // Persist before POST: a lost response must never create a second operation.
    localStorage.setItem(key, id)
    setSaved({ key, id })
  }
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setError('')
    try { await fn() } catch (e) { setError(errText(e)) } finally { setBusy('') }
  }
  const check = () => run('检查中', async () => { setPrepared(false); setRelease(undefined); setRelease(await checkUpdate(component, installationId)) })
  const prepare = () => run('下载中', async () => {
    if (!release?.release_tag || !release.target_build_id) throw new Error('请先检查版本')
    const result = await prepareUpdate(component, { ...(installationId ? { installation_id: installationId } : {}), release_tag: release.release_tag, build_id: release.target_build_id })
    if (!result.package_verified) throw new Error('更新包尚未确认校验通过，请重新检查版本')
    setPrepared(true)
  })
  const upgrade = () => run('提交中', async () => {
    if (!await feedback.confirm({ title: `升级 ${name}`, content: `将升级到 ${release?.target_version || release?.target_build_id}。${component === 'nexus' ? '升级会等待任务结束并短暂停止服务，期间页面可能断开连接。' : '更新可能重启 Workbench，完成后请刷新页面。'}兼容性不满足时将拒绝升级。`, okText: '确认升级' })) return
    const id = `web-${crypto.randomUUID()}`
    remember(id)
    try {
      const result = await startUpdate(component, { ...(installationId ? { installation_id: installationId } : {}), operation_id: id, build_id: release?.target_build_id })
      setPrepared(false)
      queryClient.setQueryData(['updates', component, installationId, id], result)
    } catch (e) {
      // Admission rejections have no new operation. Transport failures remain unknown.
      const code = (e as { response?: { status?: number } }).response?.status
      if (code && [403, 409, 422].includes(code)) {
        localStorage.removeItem(key)
        setSaved({ key, id: '' })
      }
      throw e
    }
  })
  return <section aria-label={name} style={{ padding: '24px 0', borderBottom: '1px solid var(--w-border)' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ minWidth: 180, flex: 1, overflowWrap: 'anywhere' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>{name} <Tag>{component === 'nexus' ? '服务端' : '管理与测试界面'}</Tag></h2>
        <div>当前版本：{release?.current_version || release?.current_build_id || installed.data?.current_build_id || (component === 'nexus' ? server.data?.data?.version : undefined) || (installed.isPending ? '读取中…' : '尚未获取')}</div>
        {release && <div style={{ marginTop: 6 }}>{release.update_available ? `可用版本：${release.target_version || release.target_build_id}` : '当前没有可升级的稳定版本'}</div>}
      </div>
      <Space wrap>
        <Button disabled={!installed.isSuccess || !!busy || blocked} loading={busy === '检查中'} onClick={check}>检查更新</Button>
        {release?.update_available && <Button type="primary" disabled={!!busy || blocked} loading={busy === '下载中' || busy === '提交中'} onClick={prepared ? upgrade : prepare}>{prepared ? '升级到此版本' : '下载更新'}</Button>}
      </Space>
    </div>
    {installed.isError && <Alert style={{ marginTop: 16 }} type="warning" showIcon message="此安装暂不能通过页面升级" description={<>{errText(installed.error)}<div>源码 / PyCharm 运行请更新源码并重新构建、启动。正式安装需完成维护登记，Workbench 还需绑定到 Nexus。</div><Button style={{ marginTop: 8 }} onClick={() => void installed.refetch()}>重新读取安装状态</Button></>} />}
    {prepared && !blocked && <Alert style={{ marginTop: 16 }} type="info" message="更新包已下载并校验，尚未升级。提交时仍会检查版本兼容性。" />}
    {error && <Alert style={{ marginTop: 16 }} type="error" showIcon message={error} />}
    {operationId && <div style={{ marginTop: 16, padding: 16, borderRadius: 8, background: 'var(--w-bg)', overflowWrap: 'anywhere' }}>
      <strong>{labels[state || ''] || '正在查询原升级操作'}</strong>
      <p style={{ margin: '8px 0' }}>操作编号：{operationId}</p>
      {status.isError && <p>暂时无法确认结果：{errText(status.error)}。保留此编号，连接恢复后继续查询，请勿重复提交升级。</p>}
      {(status.data?.error || status.data?.recovery_error) && <p>{status.data.error || status.data.recovery_error}</p>}
      {(state === 'needs_operator' || status.data?.helper_started === false) && <p>需要在安装机器使用维护命令处理原操作。{status.data?.recovery}</p>}
      <Space wrap><Button onClick={() => void status.refetch()} loading={status.isFetching}>刷新升级状态</Button>
      {(component === 'nexus' ? ['requested', 'waiting_idle'] : ['requested']).includes(state || '') && <Button disabled={!!busy} onClick={() => void run('取消中', async () => { await cancelUpdate(component, operationId, installationId); await status.refetch() })}>取消等待</Button>}
      {state === 'succeeded' && <Button onClick={() => window.location.reload()}>刷新页面使用新版</Button>}</Space>
    </div>}
    <details style={{ marginTop: 16, color: 'var(--w-text-secondary)' }}><summary style={{ cursor: 'pointer' }}>查询已有升级操作</summary><p>换浏览器后，可输入之前的操作编号查询。这里只查询，不会再次执行升级。</p><Space.Compact style={{ maxWidth: 480, width: '100%' }}><Input aria-label={`${name} 操作编号`} value={manual} onChange={e => setManual(e.target.value)} placeholder="粘贴操作编号" /><Button disabled={!installed.isSuccess || !!busy || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(manual)} onClick={() => void run('查询中', async () => { await updateStatus(component, manual, installationId); remember(manual) })}>查询</Button></Space.Compact></details>
  </section>
}
export function UpdatesPage() {
  return <div style={{ maxWidth: 1080, margin: '0 auto', color: 'var(--w-text)' }}>
    <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>版本与升级</h1>
    <p style={{ color: 'var(--w-text-secondary)', marginBottom: 24 }}>统一管理本机 Nexus 与 Workbench。检查版本 → 下载更新 → 确认升级。</p>
    <Alert type="info" showIcon message="适用于 macOS 正式独立安装" description="只使用已发布的稳定版本，并检查 Nexus 与 Workbench 的兼容性。源码开发环境请通过源码更新。" />
    <UpdateRow component="nexus" /><UpdateRow component="workbench" />
  </div>
}
