import type { CSSProperties } from 'react'
import { Button, FormField, FormSection, Input, Select } from '@/ui'
import { channelConfigVar, usesGmailAlias, usesPhone, type EnvChannel, type EnvSecrets, type SeqSlot } from './envModel'

const OTP_OPTIONS = [{ value: 'auto', label: '自动（账号码、固定码、Gmail、问人）' }, { value: 'fixed', label: '只用固定码' }, { value: 'gmail', label: 'Gmail 收信' }, { value: 'hitl', label: '每次问人' }]
const LOGIN_OPTIONS = [{ value: 'auto', label: '自动（账号管理、问人）' }, { value: 'pool', label: '只用账号管理' }, { value: 'hitl', label: '真实号 / 问人' }]
const KIND_OPTIONS = [{ value: 'phone', label: '手机号' }, { value: 'email', label: '邮箱（支持别名）' }]

export function AppEnvCard({ channel, value, inheritHint, secrets, phone, gmail, onValue, onSecrets, onPhoneStart, onGmailStart, onRemove, onCopy, disabled = false }: {
  channel: EnvChannel; value: string; inheritHint: string; secrets: EnvSecrets; phone: SeqSlot; gmail: SeqSlot
  onValue: (v: string) => void; onSecrets: (next: EnvSecrets) => void; onPhoneStart: (v: string) => void; onGmailStart: (v: string) => void; onRemove?: () => void; onCopy: () => void; disabled?: boolean
}) {
  const patch = (next: EnvSecrets) => onSecrets(next)
  return <article className="w-surface-card" style={{ minWidth: 0 }}>
    <fieldset disabled={disabled} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <FormSection title="启动配置" description="本环境下的启动目标。修改仅在保存后生效。">
        <FormField label="启动标识 / 地址" hint={inheritHint || '填写应用在当前环境下的启动地址或标识。'}>
          <Input aria-label="当前渠道启动标识" disabled={disabled} value={value} placeholder={channel.placeholder || channel.field} spellCheck={false} onChange={e => onValue(e.target.value)} style={{ fontFamily: 'var(--w-font-mono)' }} />
        </FormField>
      </FormSection>
      <FormSection title="登录策略" description="选择账号来源与类型，保持各环境独立配置。">
        <div className="w-form-grid">
          <FormField label="账号来源"><Select aria-label="登录账号来源" disabled={disabled} value={secrets.login.mode} options={LOGIN_OPTIONS} onChange={v => patch({ ...secrets, login: { ...secrets.login, mode: v } })} style={full} /></FormField>
          <FormField label="账号类型"><Select aria-label="登录账号类型" disabled={disabled} value={secrets.login.kind} options={KIND_OPTIONS} onChange={v => patch({ ...secrets, login: { ...secrets.login, kind: v } })} style={full} /></FormField>
          {usesPhone(secrets) && <FormField label="手机号起始位" hint={`自动开号时每次 +1，写入号池。下一号码：${phone.next || phone.start || '未设置'}`}><Input aria-label="手机号起始位" disabled={disabled} value={phone.start} placeholder="17000000000" onChange={e => onPhoneStart(e.target.value)} /></FormField>}
          {usesGmailAlias(secrets) && <FormField label="Gmail 别名起始位" hint={`租号时从该位往后取别名。下一别名：${gmail.next || gmail.start || '未设置'}`}><Input aria-label="Gmail 别名起始位" disabled={disabled} value={gmail.start} placeholder="10000" onChange={e => onGmailStart(e.target.value)} /></FormField>}
        </div>
      </FormSection>
      <FormSection title="验证码策略" description="仅显示当前策略适用的字段；切换策略保留已填写配置。">
        <div className="w-form-grid">
          <FormField label="验证码来源" wide><Select aria-label="验证码来源" disabled={disabled} value={secrets.otp.mode} options={OTP_OPTIONS} onChange={v => patch({ ...secrets, otp: { ...secrets.otp, mode: v } })} style={full} /></FormField>
          {(secrets.otp.mode === 'fixed' || secrets.otp.mode === 'auto') && <FormField label="固定验证码" hint="可留空；优先使用账号配置的验证码。"><Input aria-label="固定验证码" disabled={disabled} value={secrets.otp.fixed} onChange={e => patch({ ...secrets, otp: { ...secrets.otp, fixed: e.target.value } })} /></FormField>}
          {(secrets.otp.mode === 'gmail' || secrets.otp.mode === 'auto') && <>
            <FormField label="发件人白名单" hint="多个发件人使用逗号分隔。"><Input aria-label="验证码发件人白名单" disabled={disabled} value={secrets.otp.from_allowlist.join(', ')} onChange={e => patch({ ...secrets, otp: { ...secrets.otp, from_allowlist: e.target.value.split(',').map(s => s.trim()).filter(Boolean) } })} /></FormField>
            <FormField label="邮件主题关键词"><Input aria-label="验证码邮件主题关键词" disabled={disabled} value={secrets.otp.subject_contains} onChange={e => patch({ ...secrets, otp: { ...secrets.otp, subject_contains: e.target.value } })} /></FormField>
          </>}
        </div>
      </FormSection>
    </fieldset>
    <footer className="flex flex-wrap items-center gap-3" style={{ padding: '16px 24px', borderTop: '1px solid var(--w-border)' }}>
      <details className="w-env-advanced"><summary>参数引用</summary><div className="flex flex-wrap items-center gap-3"><code style={{ overflowWrap: 'anywhere' }}>{channelConfigVar(channel)}</code><Button onClick={onCopy}>复制参数引用</Button></div></details>
      {onRemove && <Button danger type="text" disabled={disabled} onClick={onRemove}>移除渠道</Button>}
    </footer>
  </article>
}
const full: CSSProperties = { width: '100%' }
