import { QRCode } from '@/ui'
import { heldChannels, type ScoutNode, type NodePluginStatus, type NodePluginJob } from '@/api/nodes'
import { fmtAgo } from '@/lib/timeText'
import type { ItemDef } from './pluginCatalog'
export function ConnLine({ st }: { st: NodePluginStatus | undefined }) {
  const s = st?.status
  const known = s && typeof s.connected === 'boolean'
  return (
    <div className="flex flex-wrap items-center gap-3" style={{ margin: '-8px 0 14px', fontSize: 'var(--w-font-sm)' }}>
      <span style={{ fontWeight: 700, color: !known ? 'var(--w-text-tertiary)' : s.connected ? 'var(--w-pass)' : 'var(--w-warn)' }}>
        {!known ? '连接状态：未知' : s.connected ? '● 已连接' : '○ 未连接'}
      </span>
      {known ? <span style={{ color: 'var(--w-text-tertiary)' }}>最后收到消息 {fmtAgo(s.last_message_at)}</span> : null}
      {s?.error ? <span style={{ color: 'var(--w-fail)' }}>{s.error}</span> : null}
    </div>
  )
}

export function ImNotes({ node, hasDynamic }: { node: ScoutNode; hasDynamic: boolean }) {
  const held = heldChannels(node)
  const box = { marginTop: 20, padding: '10px 12px', borderRadius: 'var(--w-radius-sm)', border: '1px solid var(--w-border)', fontSize: 'var(--w-font-sm)', color: 'var(--w-text-secondary)' } as const
  return (
    <>
      <div style={{ ...box, background: held.length ? 'var(--w-warn-bg)' : 'var(--w-surface-subtle)' }}>
          <strong>这台机器上的机器人</strong>
        <div style={{ marginTop: 2 }}>
          这里只让机器人登录到这台 Scout。谁的微信账号可以指挥它，在「我的助手」里用绑定码认领，两步都要做，不是二选一。
          {held.length
            ? ` 本节点正连着「${held.join('、')}」，需要常驻。`
            : ' 本节点当前没有连着对话渠道。'}
        </div>
      </div>
      {!hasDynamic ? (
        <div style={{ ...box, background: 'var(--w-surface-subtle)' }}>
          <strong>LangBot 渠道层</strong>
          <div style={{ marginTop: 2 }}>飞书 / 企业微信 / 钉钉等渠道由 LangBot 提供，将在节点安装后出现在这里。当前节点还没有上报这类条目。</div>
        </div>
      ) : null}
    </>
  )
}


export const HINT: Record<string, string> = {
  feishu: '拉需求，把结果写回去',
  meego: '读写工作项',
  wechat: '让机器人登录到这台机器。登录态只留在这里。个人账号的认领在「我的助手」，不要在这里填绑定码。',
  feishu_bot: '往群里发一条消息',
  wecom: '往群里发一条消息',
  gmail: '收验证码',
}

/** 微信返回的常常是登录链接，不是图片。已经是图就直接显示，否则画成二维码。 */
export function WechatQr({ raw }: { raw: string }) {
  const text = raw.trim()
  if (!text) return null
  const compact = text.replace(/\s/g, '')
  const image = text.startsWith('data:image')
    || compact.startsWith('/9j/')
    || compact.startsWith('iVBORw0K')
    || /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(text)
    || (/^[A-Za-z0-9+/=]+$/.test(compact) && compact.length > 80)
  if (image) {
    const src = text.startsWith('data:image') || text.startsWith('http')
      ? text
      : `data:${compact.startsWith('/9j/') ? 'image/jpeg' : 'image/png'};base64,${compact}`
    return (
      <img
        src={src}
        alt="微信登录二维码"
        width={220}
        height={220}
        style={{ width: 220, height: 220, objectFit: 'contain', alignSelf: 'center', background: 'var(--w-surface)' }}
      />
    )
  }
  return <QRCode value={text} size={220} style={{ alignSelf: 'center' }} />
}

export function wechatHint(state: { error: string; logged_in: boolean; status: string; qrcode_img: string }) {
  if (state.error) return state.error
  if (state.logged_in) return '这台机器已登录微信'
  if (state.status === 'expired') return '二维码过期了，重新拿一张。'
  if (state.status === 'scaned' || state.status === 'scanned') return '已扫码，在手机上确认。'
  if (state.qrcode_img) return '用将要作为机器人的微信号扫这一张。扫完后，每个人再到「我的助手」生成绑定码。'
  return '点显示二维码，让机器人微信号登录这台机器。'
}

export function testLabel(item: ItemDef) {
  if (item.id === 'feishu') return '测试鉴权'
  if (item.id === 'meego') return '测试换票'
  if (item.id === 'feishu_bot' || item.id === 'wecom') return '发测试消息'
  return ''
}

export function testExplain(item: ItemDef) {
  if (item.id === 'feishu') return '用已保存的 App ID 和 Secret 向飞书换访问凭证，不改文档。'
  if (item.id === 'meego') return '用已保存的插件 ID 和密钥向 Meego 换访问凭证，不改工作项。'
  if (item.id === 'feishu_bot' || item.id === 'wecom') return '往已保存的 Webhook 发一条「Mino 测试消息」。'
  return ''
}

export function jobMatches(job: NodePluginJob | undefined, kind: string, id: string) {
  return !!job?.active && job.class === kind && job.id === id
}

export function JobBar({ job }: { job: NodePluginJob | undefined }) {
  const percent = Math.max(0, Math.min(100, Number(job?.percent) || 0))
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--w-muted-bg)', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: 'var(--w-primary)' }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>
        {job?.label || job?.stage || '安装中'}
      </div>
    </div>
  )
}
