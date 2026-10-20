import { environmentChannel } from '@/constants/platformContract'
/** 项目环境文档。应用（channel）不是写死的三列，每个环境各自有启动标识和登录配置。 */

export interface EnvChannel {
  id: string
  app_id?: string
  kind: string
  platform?: string
  alias: string
  app_identifier: string
  third_party: boolean
  label: string
  field: string
  placeholder: string
}

export interface EnvSecrets {
  otp: {
    mode: string
    fixed: string
    from_allowlist: string[]
    subject_contains: string
    poll_interval_ms: number
    max_wait_ms: number
  }
  login: { mode: string; kind: string }
}

export interface SeqSlot { start: string; next: string }

export interface EnvEntry { key: string; label: string; secrets?: EnvSecrets }

export interface EnvDocument {
  [key: string]: unknown
  default_profile: string
  environments: EnvEntry[]
  channels: EnvChannel[]
  pipeline: string[]
  profiles: Record<string, Record<string, Record<string, string>>>
  channel_secrets: Record<string, Record<string, EnvSecrets>>
  channel_gmail_alias: Record<string, Record<string, SeqSlot>>
  channel_phone_seq: Record<string, Record<string, SeqSlot>>
}

export const CHANNEL_KINDS = [
  { id: 'app', label: 'App' },
  { id: 'web', label: 'Web' },
  { id: 'server', label: 'Server' },
] as const

export const APP_PLATFORMS = [
  { id: 'android', label: '安卓', field: 'package', placeholder: 'com.example.app' },
  { id: 'win', label: 'Windows', field: 'path', placeholder: '完整 EXE 路径或 AUMID' },
  { id: 'mac', label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
]

const PRESETS: EnvChannel[] = [
  { id: 'android', kind: 'app', platform: 'android', alias: '', app_identifier: '', third_party: false, label: '安卓', field: 'package', placeholder: 'com.example.app' },
  { id: 'web', kind: 'web', platform: 'web', alias: '', app_identifier: '', third_party: false, label: 'Web', field: 'base_url', placeholder: 'https://test.example.com' },
  { id: 'win', kind: 'app', platform: 'win', alias: '', app_identifier: '', third_party: false, label: 'Windows', field: 'path', placeholder: '完整 EXE 路径或 AUMID' },
  { id: 'mac', kind: 'app', platform: 'mac', alias: '', app_identifier: '', third_party: false, label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
  { id: 'server', kind: 'server', alias: '', app_identifier: '', third_party: false, label: 'Server', field: 'base_url', placeholder: 'https://api.example.com' },
]

const PRESET_BY_ID: Record<string, Partial<EnvChannel>> = {
  ...Object.fromEntries(PRESETS.map((c) => [c.id, c])),
}
const ENV_LABELS: Record<string, string> = { dev: '开发', test: '测试', pre: '预发', prod: '正式' }
const OTP_MODES = new Set(['auto', 'fixed', 'gmail', 'hitl'])
const LOGIN_MODES = new Set(['auto', 'pool', 'hitl'])
const LOGIN_KINDS = new Set(['phone', 'email'])

export const slugEnvKey = (text: string, fallback = 'env') => {
  const s = String(text || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '').slice(0, 24)
  return s || fallback
}

export const appIdentifierFromAlias = (text: string) =>
  String(text || '').trim()
    .replace(/[\s\-·]+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .slice(0, 32)

export function emptySecrets(): EnvSecrets {
  return {
    otp: { mode: 'auto', fixed: '', from_allowlist: [], subject_contains: '', poll_interval_ms: 3000, max_wait_ms: 90000 },
    login: { mode: 'auto', kind: 'phone' },
  }
}

export function normalizeSecrets(raw: unknown): EnvSecrets {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const otp = (src.otp && typeof src.otp === 'object' ? src.otp : {}) as Record<string, unknown>
  const loginSrc = (src.login && typeof src.login === 'object' ? src.login : {}) as Record<string, unknown>
  if ('phone' in src || 'login_kind' in src) throw new Error('obsolete_login_fields')
  const modeOf = (value: unknown, allowed: Set<string>, fallback: string) => {
    const m = value == null ? fallback : String(value)
    if (!allowed.has(m)) throw new Error('login_or_otp_mode_invalid')
    return m
  }
  let allow = otp.from_allowlist
  if (typeof allow === 'string') allow = allow.split(',').map((s) => s.trim()).filter(Boolean)
  if (!Array.isArray(allow)) allow = []
  const loginMode = modeOf(loginSrc.mode, LOGIN_MODES, 'auto')
  const kind = loginSrc.kind == null ? 'phone' : String(loginSrc.kind)
  if (!LOGIN_KINDS.has(kind)) throw new Error('login_kind_invalid')
  return {
    ...src,
    otp: {
      ...otp,
      mode: modeOf(otp.mode, OTP_MODES, 'auto'),
      fixed: String(otp.fixed || '').slice(0, 32),
      from_allowlist: (allow as unknown[]).slice(0, 20).map((s) => String(s).slice(0, 120)),
      subject_contains: String(otp.subject_contains || '').slice(0, 120),
      poll_interval_ms: Math.min(30000, Math.max(1000, Number(otp.poll_interval_ms) || 3000)),
      max_wait_ms: Math.min(180000, Math.max(5000, Number(otp.max_wait_ms) || 90000)),
    },
    login: { ...loginSrc, mode: loginMode, kind },
  }
}

const digits = (s: unknown) => String(s || '').replace(/\D/g, '').slice(0, 16)

export function normalizeSlot(raw: unknown, fallback = ''): SeqSlot {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let start = digits(src.start)
  let next = digits(src.next)
  if (!start && fallback) start = fallback
  if (!next && start) next = start
  return { ...src, start, next }
}

export const usesPhone = (s: EnvSecrets) => s.login.kind === 'phone'
export const usesGmailAlias = (s: EnvSecrets) =>
  s.login.kind === 'email' && (s.otp.mode === 'gmail' || s.otp.mode === 'auto')

export function channelTitle(ch: EnvChannel) {
  return String(ch.alias || ch.label || ch.id).trim()
}

export function channelKindText(ch: EnvChannel) {
  const kind = CHANNEL_KINDS.find((k) => k.id === ch.kind)?.label
  const plat = APP_PLATFORMS.find((p) => p.id === ch.platform)?.label
  const bits = []
  if (ch.third_party || ch.alias) bits.push('三方')
  if (kind) bits.push(kind)
  if (ch.kind === 'app' && plat) bits.push(plat)
  return bits.join(' · ')
}

export function channelConfigVar(ch: EnvChannel) {
  const field = ch.field || 'value'
  const plat = String(ch.platform || ch.kind || 'web').toLowerCase()
  const ident = ch.app_identifier || (ch.id.includes('.') ? ch.id.split('.').slice(1).join('.') : '')
  if (!ch.alias && !ch.third_party && PRESET_BY_ID[ch.id]) return `{{${ch.id}.${field}}}`
  if (!ident) return `{{${plat}.${field}}}`
  return `{{${plat}.${ident}.${field}}}`
}

function normalizeChannel(raw: unknown, seen: Set<string>): EnvChannel | null {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const alias = String(src.alias || '').trim().slice(0, 24)
  const id = String(src.id || '')
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(id) || seen.has(id)) throw new Error('channel_identity_invalid_or_duplicate')
  const { kind, platform } = environmentChannel(src)
  const field = String(src.field || '')
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) throw new Error('channel_field_required')
  seen.add(id)
  return {
    id,
    ...(src.app_id ? { app_id: String(src.app_id) } : {}),
    kind,
    ...(kind !== 'server' || Object.hasOwn(src, 'platform') ? { platform } : {}),
    alias,
    app_identifier: String(src.app_identifier || '').trim() || (alias ? appIdentifierFromAlias(alias) : ''),
    third_party: src.third_party == null ? Boolean(alias) : Boolean(src.third_party),
    label: alias || String(src.label || id),
    field,
    placeholder: String(src.placeholder || ''),
  }
}

export function normalizeEnvDoc(raw: unknown): EnvDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('environment_document_required')
  const src = raw as Record<string, unknown>
  if (['env','android','ios','web','test_accounts'].some(k => k in src)) throw new Error('obsolete_environment_fields')
  if (!Array.isArray(src.channels) || !src.channels.length || !Array.isArray(src.environments) || !src.environments.length) throw new Error('environment_structure_required')
  const seen = new Set<string>()
  const channels = src.channels.map(row => normalizeChannel(row, seen)!)
  const envSet = new Set<string>()
  const ordered = src.environments.map(rawEnv => {
    const row = rawEnv as Record<string, unknown>
    const key = String(row.key || '')
    if (!/^[a-zA-Z0-9_-]{1,24}$/.test(key) || envSet.has(key)) throw new Error('environment_identity_invalid_or_duplicate')
    envSet.add(key)
    return { key, label: String(row.label || ENV_LABELS[key] || key), ...(row.secrets ? { secrets: normalizeSecrets(row.secrets) } : {}) }
  })
  if (!envSet.has(String(src.default_profile))) throw new Error('default_profile_invalid')
  const pipeline = src.pipeline
  if (!Array.isArray(pipeline) || pipeline.some(k => typeof k !== 'string' || !envSet.has(k)) || new Set(pipeline).size !== pipeline.length) throw new Error('environment_pipeline_invalid')
  if (!src.profiles || typeof src.profiles !== 'object' || Array.isArray(src.profiles)) throw new Error('environment_profiles_required')
  const profileMap = src.profiles as EnvDocument['profiles']
  if (Object.keys(profileMap).length !== envSet.size || Object.keys(profileMap).some(k => !envSet.has(k))) throw new Error('environment_profiles_mismatch')
  const profiles: EnvDocument['profiles'] = {}
  for (const env of ordered) {
    const snap = (profileMap?.[env.key] && typeof profileMap[env.key] === 'object' ? profileMap[env.key] : {}) as Record<string, Record<string, string>>
    profiles[env.key] = { ...snap }
    for (const ch of channels) {
      const block = (snap[ch.id] && typeof snap[ch.id] === 'object' ? snap[ch.id] : {}) as Record<string, string>
      profiles[env.key][ch.id] = {
        ...block,
        [ch.field]: String(block[ch.field] ?? '').trim(),
      }
    }
  }

  const takeNested = <T>(rawMap: unknown, mapSlot: (slot: unknown) => T) => {
    const srcMap = (rawMap && typeof rawMap === 'object' ? rawMap : {}) as Record<string, Record<string, unknown>>
    const out: Record<string, Record<string, T>> = {}
    for (const ch of channels) {
      const per = srcMap[ch.id]
      if (!per || typeof per !== 'object') continue
      const row: Record<string, T> = {}
      for (const env of ordered) {
        if (per[env.key] != null) row[env.key] = mapSlot(per[env.key])
      }
      if (Object.keys(row).length) out[ch.id] = row
    }
    return out
  }

  return {
    ...src,
    default_profile: String(src.default_profile),
    environments: ordered,
    channels,
    pipeline: pipeline as string[],
    profiles,
    channel_secrets: takeNested(src.channel_secrets, normalizeSecrets),
    channel_gmail_alias: takeNested(src.channel_gmail_alias, (s) => normalizeSlot(s)),
    channel_phone_seq: takeNested(src.channel_phone_seq, (s) => normalizeSlot(s)),
  }
}

export function buildPayload(doc: EnvDocument): EnvDocument {
  const profiles: EnvDocument['profiles'] = {}
  for (const env of doc.environments) {
    profiles[env.key] = { ...doc.profiles[env.key] }
    for (const ch of doc.channels) {
      profiles[env.key][ch.id] = { ...doc.profiles[env.key]?.[ch.id], [ch.field]: String(doc.profiles[env.key]?.[ch.id]?.[ch.field] || '').trim() }
    }
  }
  const secrets: EnvDocument['channel_secrets'] = {}
  const gmail: EnvDocument['channel_gmail_alias'] = {}
  const phone: EnvDocument['channel_phone_seq'] = {}
  for (const ch of doc.channels) {
    for (const env of doc.environments) {
      const sec = normalizeSecrets(doc.channel_secrets[ch.id]?.[env.key])
      if (!secrets[ch.id]) secrets[ch.id] = {}
      secrets[ch.id][env.key] = sec
      if (usesGmailAlias(sec)) {
        if (!gmail[ch.id]) gmail[ch.id] = {}
        gmail[ch.id][env.key] = normalizeSlot(doc.channel_gmail_alias[ch.id]?.[env.key], '10000')
      }
      if (usesPhone(sec)) {
        if (!phone[ch.id]) phone[ch.id] = {}
        phone[ch.id][env.key] = normalizeSlot(doc.channel_phone_seq[ch.id]?.[env.key], '17000000000')
      }
    }
  }
  return {
    ...doc,
    default_profile: doc.default_profile,
    environments: doc.environments.map((e) => ({ key: e.key, label: e.label || e.key, ...(e.secrets ? { secrets: e.secrets } : {}) })),
    channels: doc.channels,
    pipeline: [...doc.pipeline],
    profiles,
    channel_secrets: secrets,
    channel_gmail_alias: gmail,
    channel_phone_seq: phone,
  }
}


export function environmentWriteIssues(doc: EnvDocument): string[] {
  const seen = new Set<string>()
  const issues: string[] = []
  if (!doc.channels.length) issues.push('至少需要一个渠道')
  for (const ch of doc.channels) {
    if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(ch.id) || seen.has(ch.id)) issues.push(`渠道 ID 无效或重复：${ch.id}`)
    seen.add(ch.id)
    try { environmentChannel({ ...ch }) } catch {
      issues.push(`渠道「${channelTitle(ch)}」的平台需迁移确认（${ch.platform ?? '未设置'}）；目标平台限 mac / win / android / web，服务渠道不设平台`)
    }
  }
  return issues
}

export function buildWritePayload(doc: EnvDocument): EnvDocument {
  normalizeEnvDoc(doc)
  const issues = environmentWriteIssues(doc)
  if (issues.length) throw new Error(issues.join('；'))
  return buildPayload(doc)
}
