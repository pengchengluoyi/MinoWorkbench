import { ArrowUpRight, Check, Download, Link2 } from 'lucide-react'
import { SetupSteps } from './SetupSteps'
import { channelFilled } from './pluginCatalog'
import { Button } from '@/ui'
import type { ItemDef } from './pluginCatalog'
import type { NodePluginStatus } from '@/api/nodes'

export function connectionType(kind: string, item: ItemDef) {
  if (kind === 'cli') return item.id === 'case_api' ? 'API' : 'CLI'
  if (item.wechat) return 'iLink'
  if (kind === 'bot') return 'Webhook'
  if (kind === 'im') return 'LangBot'
  return '邮件'
}
export function PluginSetupGuide({ item, kind, status, known, disabled, installing, onInstall, onDownloads }: {
  item: ItemDef; kind: string; status?: NodePluginStatus; known: boolean; disabled: boolean; installing: boolean
  onInstall: () => void; onDownloads: () => void
}) {
  const cli = kind === 'cli' && ['feishu', 'meego'].includes(item.id)
  const sharedHost = kind === 'im' && !item.wechat
  const configured = known && (item.groupId ? channelFilled(status, item.fields) : !!status?.configured)
  const installedHost = known && status?.installed === true
  if (!cli) return <section className="w-setup-card">
    <header className="w-setup-card-header"><div><h3>{item.wechat ? '连接微信' : sharedHost ? '连接对话渠道' : kind === 'bot' ? '接入群通知' : kind === 'mail' ? '连接邮箱' : '连接服务'}</h3>
      <p>{sharedHost ? '各渠道共用 LangBot 宿主，凭据分别保存。' : item.wechat ? '通过 iLink 扫码登录，不依赖 CLI 或 LangBot。' : kind === 'bot' ? '使用群机器人 Webhook 发送通知，无需安装 CLI。' : '配置当前节点的接入信息，无需下载组件。'}</p></div><span className="w-setup-tag">{connectionType(kind, item)}</span></header>
    <SetupSteps current={!known ? -1 : sharedHost && !installedHost ? 0 : configured ? (sharedHost ? 3 : 2) : sharedHost ? 1 : 0} steps={[
      ...(sharedHost ? [{ title: '安装宿主', description: '下载中心统一管理' }] : []),
      { title: item.wechat ? '扫码登录' : '填写信息', description: item.wechat ? '使用微信确认身份' : '凭据仅保存在节点' },
      { title: item.wechat ? '登录完成' : '保存配置', description: item.wechat ? '确认登录结果' : '连接状态另行核对' },
    ]} />
    {sharedHost && <footer className="w-setup-card-footer"><Link2 size={15} aria-hidden /><span className="w-plugin-relation-note">{installedHost ? 'LangBot 已安装' : '请先安装 LangBot 共享宿主'}</span><Button type="link" size="small" onClick={onDownloads}>前往下载中心 <ArrowUpRight size={13} aria-hidden /></Button></footer>}
  </section>
  const installed = known && status?.installed === true
  return <div className="w-plugin-setup w-setup-card">
    <div className="w-plugin-install-step">
      <span className="w-plugin-step-number" data-complete={installed || undefined}>{installed ? <Check size={16} aria-hidden /> : '1'}</span>
      <div className="w-plugin-step-copy"><strong>{installed ? `${item.label} 已安装` : `安装 ${item.label}`}</strong><p>CLI 是运行在 Scout 上的命令行工具，与下载中心中的同名组件对应。安装不需要应用密钥。</p></div>
      <div className="w-plugin-step-actions">
        {!installed && <Button type="primary" icon={<Download size={14} aria-hidden />} disabled={disabled || !known || !status} loading={installing} onClick={onInstall}>安装工具</Button>}
        <Button type="link" size="small" onClick={onDownloads}>下载中心 <ArrowUpRight size={13} aria-hidden /></Button>
      </div>
    </div>
    {item.id !== 'feishu' && <SetupSteps current={!known ? -1 : !installed ? 0 : configured ? 3 : 1} busy={installing} steps={[
      { title: '安装工具', description: '与下载中心同步' },
      { title: '应用接入', description: '填写应用凭据' },
      { title: '保存配置', description: '鉴权可单独测试' },
    ]} />}
  </div>
}
