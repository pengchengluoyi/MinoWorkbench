import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import { detectScoutSystem, type ScoutSystem } from '@/api/nodes'
import { Alert, Button, Input, Modal, Segmented, Skeleton, errText, useFeedback } from '@/ui'
import { useCreateNodeInstallation, useNodeInstallationStatus } from './queries'

const SYSTEMS: { value: ScoutSystem; label: string }[] = [
  { value: 'darwin', label: 'macOS' },
  { value: 'win32', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
]
const INSTALL_RECORD = 'mino.nodes.installation'

const readInstallation = (): string => {
  try { return sessionStorage.getItem(INSTALL_RECORD) || '' } catch { return '' }
}

export function AddNodeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feedback = useFeedback()
  const [system, setSystem] = useState<ScoutSystem | undefined>(detectScoutSystem)
  const [installId, setInstallId] = useState(readInstallation)
  const create = useCreateNodeInstallation()
  const status = useNodeInstallationStatus(installId, open)
  const requested = useRef(false)
  const data = create.data
  const command = system ? data?.commands[system] || '' : ''
  const expired = status.data?.status === 'expired' || !!(data && data.expires_at <= Date.now() / 1000)
  const registered = status.data?.status === 'registered'
  const revoked = status.data?.status === 'revoked'
  const connected = registered && status.data?.online
  const usable = !!command && !expired && !registered && !revoked && !create.isPending

  const mutate = create.mutate
  const generate = useCallback(() => {
    requested.current = true
    setInstallId('')
    mutate(undefined, {
      onSuccess: (installation) => {
        setInstallId(installation.install_id)
        try { sessionStorage.setItem(INSTALL_RECORD, installation.install_id) } catch { return }
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
      if (!navigator.clipboard?.writeText) throw new Error('剪贴板不可用')
      await navigator.clipboard.writeText(command)
      feedback.ok('已复制')
    } catch {
      feedback.warn('复制失败，请选中下方命令文本手动复制')
    }
  }

  return (
    <Modal title="添加 Scout 节点" open={open} onCancel={onClose} footer={<Button onClick={onClose}>稍后回来查看</Button>} width={680}>
      <div className="flex flex-col gap-4">
        <p style={{ margin: 0, color: 'var(--w-text-secondary)' }}>在需要部署 Scout 的电脑上执行；可切换为其他电脑的系统。每台新电脑生成一条命令。</p>
        <Segmented
          options={SYSTEMS}
          value={system || ''}
          onChange={(value) => setSystem(value as ScoutSystem)}
          aria-label="目标电脑系统"
        />
        {!system ? <Alert type="info" showIcon message="未识别到桌面系统，请选择目标电脑的操作系统" /> : null}
        {create.isPending ? <Skeleton active paragraph={{ rows: 3 }} title={false} /> : null}
        {create.isError ? (
          <Alert type="error" showIcon message="获取安装命令失败" description={errText(create.error)} action={<Button size="small" onClick={generate}>重试</Button>} />
        ) : null}
        {data && system && !data.targets[system]?.length ? <Alert type="warning" showIcon message="当前发布没有此系统的安装包，请选择受支持的电脑或等待发布" /> : null}
        {data && command ? (
          <>
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
          </>
        ) : null}
        {status.isError ? <Alert type="warning" showIcon message="读取接入状态失败" description={errText(status.error)} action={<Button size="small" onClick={() => void status.refetch()}>重试状态</Button>} /> : null}
        {connected ? (
          <Alert type="success" showIcon message={`已接入：${status.data?.hostname || status.data?.node_id}`} />
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
        <Button icon={<RefreshCw size={14} />} loading={create.isPending} onClick={generate}>重新生成</Button>
      </div>
    </Modal>
  )
}
