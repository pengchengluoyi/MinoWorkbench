import type { CSSProperties, ReactNode } from 'react'
import { Button, Input, Select } from '@/ui'
import {
  channelConfigVar, channelKindText, channelTitle, usesGmailAlias, usesPhone,
  type EnvChannel, type EnvSecrets, type SeqSlot,
} from './envModel'

const OTP_OPTIONS = [
  { value: 'auto', label: '自动（账号码、固定码、Gmail、问人）' },
  { value: 'fixed', label: '只用固定码' },
  { value: 'gmail', label: 'Gmail 收信' },
  { value: 'hitl', label: '每次问人' },
]
const LOGIN_OPTIONS = [
  { value: 'auto', label: '自动（账号管理、问人）' },
  { value: 'pool', label: '只用账号管理' },
  { value: 'hitl', label: '真实号 / 问人' },
]
const KIND_OPTIONS = [
  { value: 'phone', label: '手机号（号池 phone）' },
  { value: 'email', label: '邮箱（号池 email / +别名）' },
]

export function AppEnvCard({
  channel,
  value,
  inheritHint,
  secrets,
  phone,
  gmail,
  onValue,
  onSecrets,
  onPhoneStart,
  onGmailStart,
  onRemove,
  onCopy,
}: {
  channel: EnvChannel
  value: string
  inheritHint: string
  secrets: EnvSecrets
  phone: SeqSlot
  gmail: SeqSlot
  onValue: (v: string) => void
  onSecrets: (next: EnvSecrets) => void
  onPhoneStart: (v: string) => void
  onGmailStart: (v: string) => void
  onRemove: () => void
  onCopy: () => void
}) {
  const patch = (next: EnvSecrets) => onSecrets(next)
  return (
    <article style={{
      border: '1px solid var(--w-border)',
      borderRadius: 'var(--w-radius-lg)',
      background: 'var(--w-surface)',
      padding: 'var(--w-space-4)',
      minWidth: 0,
      maxWidth: '100%',
    }}
    >
      <header className="flex items-start gap-2" style={{ marginBottom: 12 }}>
        <div className="min-w-0 flex-1">
          <div style={{ fontWeight: 700, color: 'var(--w-text)' }}>{channelTitle(channel)}</div>
          <div style={{ fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)', marginTop: 2 }}>
            {channelKindText(channel)} · {channel.id}
          </div>
        </div>
        <button type="button" className="w-hit" onClick={onCopy} style={chip}>{channelConfigVar(channel)}</button>
        <Button size="small" type="text" danger onClick={onRemove}>删除</Button>
      </header>

      <Field label="启动标识" hint={channel.field}>
        <Input
          value={value}
          placeholder={channel.placeholder || channel.field}
          spellCheck={false}
          onChange={(e) => onValue(e.target.value)}
          style={{ fontFamily: 'var(--w-font-mono)' }}
        />
        {inheritHint ? <p style={note}>{inheritHint}</p> : null}
      </Field>

      <Field label="一次性口令">
        <Select
          value={secrets.otp.mode}
          options={OTP_OPTIONS}
          onChange={(v) => patch({ ...secrets, otp: { ...secrets.otp, mode: v } })}
          style={{ width: '100%' }}
        />
        {(secrets.otp.mode === 'fixed' || secrets.otp.mode === 'auto') && (
          <Input
            style={{ marginTop: 8 }}
            value={secrets.otp.fixed}
            placeholder="固定验证码，可空。账号上的 otp 优先"
            onChange={(e) => patch({ ...secrets, otp: { ...secrets.otp, fixed: e.target.value } })}
          />
        )}
        {(secrets.otp.mode === 'gmail' || secrets.otp.mode === 'auto') && (
          <>
            <Input
              style={{ marginTop: 8 }}
              value={secrets.otp.from_allowlist.join(', ')}
              placeholder="发件人白名单，逗号分隔"
              onChange={(e) => patch({
                ...secrets,
                otp: {
                  ...secrets.otp,
                  from_allowlist: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                },
              })}
            />
            <Input
              style={{ marginTop: 8 }}
              value={secrets.otp.subject_contains}
              placeholder="主题包含的关键字"
              onChange={(e) => patch({ ...secrets, otp: { ...secrets.otp, subject_contains: e.target.value } })}
            />
          </>
        )}
      </Field>

      <Field label="登录号">
        <Select
          value={secrets.login.mode}
          options={LOGIN_OPTIONS}
          onChange={(v) => patch({ ...secrets, login: { ...secrets.login, mode: v }, phone: { mode: v } })}
          style={{ width: '100%' }}
        />
        <Select
          value={secrets.login.kind}
          options={KIND_OPTIONS}
          onChange={(v) => patch({ ...secrets, login: { ...secrets.login, kind: v } })}
          style={{ width: '100%', marginTop: 8 }}
        />
      </Field>

      {usesPhone(secrets) && (
        <Field label="手机号起始位" hint="自动开号时每次 +1，写入号池">
          <Input value={phone.start} placeholder="17000000000" onChange={(e) => onPhoneStart(e.target.value)} />
          <p style={note}>下一号码：{phone.next || phone.start || '未设置'}</p>
        </Field>
      )}
      {usesGmailAlias(secrets) && (
        <Field label="Gmail 别名起始位" hint="租号时从该位往后取别名">
          <Input value={gmail.start} placeholder="10000" onChange={(e) => onGmailStart(e.target.value)} />
          <p style={note}>下一别名：{gmail.next || gmail.start || '未设置'}</p>
        </Field>
      )}
    </article>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col" style={{ gap: 6, marginTop: 12 }}>
      <span style={{ fontSize: 'var(--w-font-sm)', fontWeight: 650, color: 'var(--w-text)' }}>
        {label}
        {hint ? <span style={{ marginLeft: 8, fontWeight: 500, color: 'var(--w-text-quaternary)' }}>{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}

const chip: CSSProperties = {
  border: '1px solid var(--w-border)',
  background: 'var(--w-fill)',
  color: 'var(--w-text-secondary)',
  borderRadius: 'var(--w-radius-sm)',
  padding: '4px 8px',
  fontFamily: 'var(--w-font-mono)',
  fontSize: 'var(--w-font-meta)',
  cursor: 'pointer',
}

const note: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 'var(--w-font-meta)',
  color: 'var(--w-text-quaternary)',
}
