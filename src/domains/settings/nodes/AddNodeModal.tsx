import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/session'
import { copyToClipboard } from '@/lib/clipboard'
import { Link } from 'react-router-dom'
import { Copy, RefreshCw } from 'lucide-react'
import { detectScoutSystem, type ScoutSystem } from '@/api/nodes'
import { Alert, Button, Input, Modal, Segmented, Skeleton, errText, useFeedback } from '@/ui'
import { useCreateNodeInstallation, useNodeInstallationStatus } from './queries'

const SYSTEMS: { value: ScoutSystem; label: string }[] = [
  { value: 'darwin', label: 'macOS' },
  { value: 'win32', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
]
const installationKey = () => `mino.nodes.installation.${useSession.getState().user?.user_id || 'unknown'}`

const readInstallation = (): string => {
  try { return sessionStorage.getItem(installationKey()) || '' } catch { return '' }
}

export function AddNodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feedback = useFeedback()
  const [system, setSystem] = useState<ScoutSystem | undefined>(detectScoutSystem)
  const [installId, setInstallId] = useState(readInstallation)
  const create = useCreateNodeInstallation()
  const status = useNodeInstallationStatus(installId, open)
  const requested = useRef(false)
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (!open) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [open])
  const data = create.data
  const supported = !!(system && data?.targets[system]?.length)
  const command = system && supported ? data?.commands[system] || '' : ''
  const expired = status.data?.status === 'expired' || !!(data && data.expires_at <= now / 1000)
  const registered = status.data?.status === 'registered'
  const revoked = status.data?.status === 'revoked'
  const connected = registered && status.data?.online
  const usable = supported && !!command && !expired && !registered && !revoked && !create.isPending

  const mutate = create.mutate
  const generate = useCallback(() => {
    requested.current = true
    setInstallId('')
    mutate(undefined, {
      onSuccess: (installation) => {
        setInstallId(installation.install_id)
        try { sessionStorage.setItem(installationKey(), installation.install_id) } catch { return }
      },
    })
  }, [mutate])

  useEffect(() => {
    if (open && !requested.current && !installId) {
      requested.current = true
      generate()
    }
  }, [open, installId, generate])

  const copy = async () => {
    if (!usable) return
    try {
      await copyToClipboard(command)
      feedback.ok('已复制')
    } catch {
      feedback.warn('复制失败，请选中下方命令文本手动复制')
    }
  }

  return (
    <Modal title="添加 Scout 节点" open={open} onCancel={onClose} footer={<Button onClick={onClose}>稍后回来查看</Button>} width={820}>
      <div className="w-workspace flex flex-col gap-4">
        <ol className="w-install-steps" aria-label="节点接入步骤">
          {['选择目标平台', '获取并执行安装命令', '确认节点接入'].map((label, index) => <li key={label} aria-current={index === (registered ? 2 : command ? 1 : 0) ? 'step' : undefined}><span className="w-install-step-no">{index + 1}</span>{label}</li>)}
        </ol>
        <p style={{ margin: 0, color: 'var(--w-text-secondary)' }}>在需要部署 Scout 的电脑上执行；可切换为其他电脑的系统。每台新电脑生成一条命令。</p>
        <Segmented
          options={SYSTEMS}
          value={system || ''}
          onChange={(value) => setSystem(value as ScoutSystem)}
          aria-label="目标电脑系统"
        />
        {installId && !data && <Alert type="info" message="已恢复本账号的安装状态引用。安装命令仅在生成时显示，刷新后不保留；请核对接入状态后再按需生成新命令。" />}
        {!system ? <Alert type="info" showIcon message="未识别到桌面系统，请选择目标电脑的操作系统" /> : null}
        {create.isPending ? <Skeleton active paragraph={{ rows: 3 }} title={false} /> : null}
        {create.isError ? (
          <Alert type="error" showIcon message="获取安装命令失败" description={errText(create.error)} action={<Button size="small" onClick={generate}>重试</Button>} />
        ) : null}
        {data && system && !data.targets[system]?.length ? <Alert type="warning" showIcon message="当前发布没有此系统的安装包，请选择受支持的电脑或等待发布" /> : null}
        {data && command ? (
          <div className="w-install-command">
            <div className="flex items-center justify-between gap-2">
              <strong>安装命令 · {system === 'win32' ? 'PowerShell' : '终端'}</strong>
              <Button icon={<Copy size={14} />} disabled={!usable} onClick={() => void copy()}>复制命令</Button>
            </div>
            <Input.TextArea aria-label="Scout 安装命令" readOnly value={command} autoSize={{ minRows: 4, maxRows: 8 }} style={{ fontFamily: 'monospace' }} />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--w-text-secondary)' }}>
              有效期 {Math.round(data.ttl_sec / 60)} 分钟，截止 {new Date(data.expires_at * 1000).toLocaleTimeString()}。CPU 架构由安装脚本检测；没有对应安装包会明确报错。
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--w-text-secondary)' }}>
              Nexus：{data.nexus_url}。mino.local 仅适用于能解析它的局域网；跨网络需要可达域名或 VPN。
            </p>
          </div>
        ) : null}
        {status.isError ? <Alert type="warning" showIcon message="读取接入状态失败" description={errText(status.error)} action={<Button size="small" onClick={() => void status.refetch()}>重试状态</Button>} /> : null}
        {connected ? (
          <Alert type="success" showIcon message={`已接入：${status.data?.hostname || status.data?.node_id}`} description={<Link to={`/settings/runtime?node=${encodeURIComponent(status.data?.node_id || '')}&pane=overview`} onClick={onClose}>查看这台节点</Link>} />
        ) : registered ? (
          <Alert type="info" showIcon message="已完成账号绑定，节点当前离线；请检查目标电脑上的 Scout 服务" />
        ) : revoked ? (
          <Alert type="warning" showIcon message="本次安装的节点凭证已吊销或归属已变更，请重新生成命令" />
        ) : expired ? (
          <Alert type="warning" showIcon message="安装凭证已过期，请重新生成命令" />
        ) : installId ? (
          <p role="status" style={{ margin: 0, color: 'var(--w-text-secondary)' }}>等待本次安装的节点接入……</p>
        ) : null}
        {installId && !data && !create.isPending ? <p style={{ margin: 0 }}>已恢复上次安装记录；需要给另一台电脑安装时请重新生成。</p> : null}
        {!create.isPending && !create.isError && (expired || revoked || registered || (installId && !data)) && <Button icon={<RefreshCw size={14} />} onClick={generate}>{expired || revoked ? '生成新的安装命令' : '为新电脑生成安装命令'}</Button>}
        <p className="w-form-hint" style={{ margin: 0 }}>复制命令只代表复制成功；节点接入以本次安装记录为准。关闭窗口不会停止电脑上已经开始的安装。</p>
      </div>
    </Modal>
  )
}
