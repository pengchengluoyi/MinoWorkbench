import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { Alert, Button, errText, useFeedback } from '@/ui'
import { requestData } from '@/lib/request'
import type { ScoutNode } from '@/api/nodes'

const MAX_BYTES = 2 * 1024 * 1024
const NAMES: Record<string, string> = { 'cli.feishu': '飞书 CLI', 'cli.meego': 'Meego CLI', langbot: 'LangBot' }
interface ImportResult { count: number; missing_tools: string[]; warnings: string[] }

export function NodeConfigTransfer({ node, disabled, onImported, onBusyChange }: { node: ScoutNode; disabled: boolean; onImported: () => void; onBusyChange: (busy: boolean) => void }) {
  const fb = useFeedback()
  const qc = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [params, setParams] = useSearchParams()
  const base = `/runtime/nodes/${encodeURIComponent(node.node_id)}/configuration`
  const exportConfig = async () => {
    setBusy(true)
    onBusyChange(true)
    try {
      const response = await requestData<{ archive: string }>({ url: `${base}/export`, method: 'post', timeout: 95_000 })
      const bytes = Uint8Array.from(atob(response.archive), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `scout-config-${node.node_id.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      fb.ok('配置文件已导出，包含凭据，请妥善保管')
    } catch (error) { fb.fail(errText(error, '导出失败，请确认 Scout 已升级')) }
    finally { setBusy(false); onBusyChange(false) }
  }
  const importConfig = async (file: File) => {
    setBusy(true)
    onBusyChange(true)
    try {
      if (file.size > MAX_BYTES) throw new Error('配置文件不能超过 2 MB')
      const bytes = new Uint8Array(await file.arrayBuffer())
      const raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
      if (raw?.format !== 'mino-scout-config' || raw.version !== 1 || !Array.isArray(raw.items) || !raw.items.length) throw new Error('请选择支持的 Scout 配置文件')
      const confirmed = await fb.confirm({ title: '覆盖导入配置？', content: `将用文件中的 ${raw.items.length} 项配置覆盖「${node.hostname || node.node_id}」的对应配置和凭据。未安装的插件只保存、不启用；当前未保存的表单修改会清除。`, okText: '覆盖导入', danger: true })
      if (!confirmed) return
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      const imported = await requestData<ImportResult>({ url: `${base}/import`, method: 'post', timeout: 95_000, data: { archive: btoa(binary), overwrite: true } })
      setResult(imported)
      onImported()
      void qc.invalidateQueries({ predicate: q => q.queryKey.includes('node-tools') && q.queryKey.includes(node.node_id) })
      fb.ok(imported.missing_tools.length ? '配置已保存，缺失插件保持停用，请前往下载中心' : '配置已导入')
    } catch (error) { fb.fail(errText(error, '导入失败；请求超时时请先刷新节点状态核对，不会自动重复导入')) }
    finally { setBusy(false); onBusyChange(false); if (input.current) input.current.value = '' }
  }
  return <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--w-border)' }}>
    <div className="flex flex-wrap items-center gap-2">
      <Button icon={<Download size={14} />} disabled={disabled || busy} onClick={() => void exportConfig()}>导出全部配置</Button>
      <Button icon={<Upload size={14} />} disabled={disabled || busy} onClick={() => input.current?.click()}>导入配置</Button>
      <input ref={input} type="file" accept=".json,application/json" hidden onChange={e => { const file = e.target.files?.[0]; if (file) void importConfig(file) }} />
      <span className="w-form-hint">配置文件包含密码和令牌，请仅传给可信设备。飞书 CLI 登录授权需在目标设备重新扫码。</span>
    </div>
    {result && <Alert type={result.missing_tools.length ? 'warning' : 'success'} message={`已导入 ${result.count} 项配置${result.missing_tools.length ? `；待安装：${result.missing_tools.map(id => NAMES[id] || id).join('、')}` : ''}`} description={result.warnings.join(' ')} action={result.missing_tools.length ? <Button onClick={() => { const next = new URLSearchParams(params); next.set('pane', 'downloads'); setParams(next) }}>前往下载中心</Button> : undefined} />}
  </div>
}
