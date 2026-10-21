import { SetupSteps } from './SetupSteps'
import { CircleCheck, ExternalLink, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react'
import './FeishuAuthorization.css'
import { useEffect, useState } from 'react'
import { Alert, Button, QRCode } from '@/ui'
import { callNodePlugin } from '@/api/nodes'
import { unwrapOne } from '@/lib/unwrap'
type State = { state?: string; summary?: string; warning?: string; last_stage?: string; authorization_url?: string }
const activeStates = ['starting', 'creating_app', 'authorizing', 'verifying', 'cancelling']
export function FeishuAuthorization({ nodeId, disabled, onReady }: { nodeId: string; disabled: boolean; onReady: () => void }) {
  const [state, setState] = useState<State>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (disabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = unwrapOne(await callNodePlugin(nodeId, { capability_id: 'plugin.cli.feishu', params: { action: 'auth_status' } }, 20_000))
        const next = ((result as { data?: State }).data || result) as State
        if (stopped) return
        setState(next)
        setError('')
        if (next.state === 'authorized') onReady()
        if (activeStates.includes(next.state || '')) timer = setTimeout(poll, 2000)
      } catch {
        if (!stopped) {
          setError('连接暂时中断，正在自动重新获取授权状态…')
          timer = setTimeout(poll, 5000)
        }
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
    // Callback only invalidates node queries; a new callback must not restart polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, disabled, retry])
  const act = async (action: string) => {
    setBusy(true); setError('')
    try {
      const result = unwrapOne(await callNodePlugin(nodeId, { capability_id: 'plugin.cli.feishu', params: { action } }, 20_000))
      setState(((result as { data?: State }).data || result) as State)
    } catch {
      setError('请求结果未确认，正在自动核对授权状态，请勿重复创建应用。')
    } finally { setBusy(false); setRetry(n => n + 1) }
  }
  const active = activeStates.includes(state.state || '')
  const authorized = state.state === 'authorized'
  const confirming = state.state === 'verifying'
  const currentStep = authorized ? 3 : confirming ? 2 : state.state === 'authorizing' || state.last_stage === 'authorizing' ? 1 : 0
  const warning = ['failed', 'interrupted', 'cancelled'].includes(state.state || '')
  let url = ''
  try {
    const parsed = new URL(state.authorization_url || '')
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && /(^|\.)(feishu\.cn|larksuite\.com)$/.test(parsed.hostname)) url = parsed.href
  } catch { /* No authorization URL yet. */ }
  return <section className="w-feishu-auth" aria-label="飞书扫码授权">
    <header className="w-feishu-auth-header">
      <div><h3>连接飞书</h3><p>扫码完成应用创建与访问授权，无需填写应用密钥。</p></div>
      <span className="w-feishu-auth-tag"><ShieldCheck size={13} aria-hidden />凭据仅保存在 Scout</span>
    </header>
    <SetupSteps label="授权进度" current={currentStep} busy={active && !url} steps={[
      { title: '创建应用', description: '自动创建并保存凭据' },
      { title: '授权访问', description: '确认 CLI 的访问权限' },
      { title: '验证连接', description: '自动检查授权结果' },
    ]} />
    <div className="w-feishu-auth-body">
      {authorized && state.warning && <Alert type="warning" message={state.warning} />}
      {warning && state.summary && <Alert type="warning" message={state.summary} />}
      {error && <Alert type="error" message={error} />}
      {url && active && !disabled && !error ? <div className="w-feishu-scan">
        <div className="w-feishu-qr"><QRCode value={url} size={168} color="#182238" bgColor="#ffffff" /></div>
        <div className="w-feishu-scan-copy">
          <span className="w-feishu-scan-eyebrow"><QrCode size={14} aria-hidden />使用飞书 App 扫一扫</span>
          <h4>{state.state === 'creating_app' ? '用飞书扫码创建应用' : '应用已创建，请扫描此新二维码授权访问'}</h4>
          <p>在手机上确认后将自动进入下一步。<br />请使用当前二维码，无需刷新页面。</p>
          <a href={url} target="_blank" rel="noreferrer">在浏览器打开授权页 <ExternalLink size={12} aria-hidden /></a>
        </div>
      </div> : !error && !warning && <div className="w-feishu-auth-message" data-success={authorized || undefined} role="status">
        {authorized ? <CircleCheck size={26} aria-hidden /> : active ? <LoaderCircle className="w-feishu-auth-spin" size={22} aria-hidden /> : <QrCode size={26} aria-hidden />}
        <span>{disabled ? '节点当前不可用，恢复连接后可继续授权。' : state.summary || '准备好飞书 App，点击下方按钮开始连接。'}</span>
      </div>}
    </div>
    {(!authorized || active) && <footer className="w-feishu-auth-footer">
      {!active && <Button type="primary" disabled={disabled || busy || !!error} loading={busy} onClick={() => void act('auth_start')}>{warning ? '继续授权' : '开始扫码授权'}</Button>}
      {active && <span className="w-feishu-auto-status" role="status">{confirming ? '正在验证连接…' : '授权状态自动更新中…'}</span>}
      {active && <Button type="text" disabled={disabled || busy} onClick={() => void act('auth_cancel')}>取消授权</Button>}
    </footer>}
  </section>
}
