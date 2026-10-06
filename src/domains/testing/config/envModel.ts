/** 项目环境文档。应用（channel）不是写死的三列，每个环境各自有启动标识和登录配置。 */

export interface EnvChannel {
  id: string
  kind: string
  platform: string
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
  phone: { mode: string }
}

export interface SeqSlot { start: string; next: string }

export interface EnvEntry { key: string; label: string }

export interface EnvDocument {
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
  { id: 'ios', label: 'iOS', field: 'bundle', placeholder: 'com.example.app' },
  { id: 'pc', label: 'PC', field: 'path', placeholder: '安装路径或启动命令' },
  { id: 'mac', label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
]

const PRESETS: EnvChannel[] = [
  { id: 'android', kind: 'app', platform: 'android', alias: '', app_identifier: '', third_party: false, label: '安卓', field: 'package', placeholder: 'com.example.app' },
  { id: 'ios', kind: 'app', platform: 'ios', alias: '', app_identifier: '', third_party: false, label: 'iOS', field: 'bundle', placeholder: 'com.example.app' },
  { id: 'web', kind: 'web', platform: 'web', alias: '', app_identifier: '', third_party: false, label: 'Web', field: 'base_url', placeholder: 'https://test.example.com' },
  { id: 'pc', kind: 'app', platform: 'pc', alias: '', app_identifier: '', third_party: false, label: 'PC', field: 'path', placeholder: '安装路径或启动命令' },
  { id: 'mac', kind: 'app', platform: 'mac', alias: '', app_identifier: '', third_party: false, label: 'Mac', field: 'bundle', placeholder: 'com.example.desktop' },
  { id: 'server', kind: 'server', platform: 'server', alias: '', app_identifier: '', third_party: false, label: 'Server', field: 'base_url', placeholder: 'https://api.example.com' },
]

const PRESET_BY_ID = Object.fromEntries(PRESETS.map((c) => [c.id, c]))
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
    phone: { mode: 'auto' },
  }
}

export function normalizeSecrets(raw: unknown): EnvSecrets {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const otp = (src.otp && typeof src.otp === 'object' ? src.otp : {}) as Record<string, unknown>
  const loginSrc = (src.login && typeof src.login === 'object' ? src.login : {}) as Record<string, unknown>
  const phone = (src.phone && typeof src.phone === 'object' ? src.phone : {}) as Record<string, unknown>
  const modeOf = (value: unknown, allowed: Set<string>, fallback: string) => {
    const m = String(value || '').trim().toLowerCase()
    if (m === 'adapter') return 'hitl'
    return allowed.has(m) ? m : fallback
  }
  let allow = otp.from_allowlist
  if (typeof allow === 'string') allow = allow.split(',').map((s) => s.trim()).filter(Boolean)
  if (!Array.isArray(allow)) allow = []
  const loginMode = modeOf(loginSrc.mode ?? phone.mode, LOGIN_MODES, 'auto')
  const kind = LOGIN_KINDS.has(String(loginSrc.kind || '').toLowerCase()) ? String(loginSrc.kind).toLowerCase() : 'phone'
  return {
    otp: {
      mode: modeOf(otp.mode, OTP_MODES, 'auto'),
      fixed: String(otp.fixed || '').slice(0, 32),
      from_allowlist: (allow as unknown[]).slice(0, 20).map((s) => String(s).slice(0, 120)),
      subject_contains: String(otp.subject_contains || '').slice(0, 120),
      poll_interval_ms: Math.min(30000, Math.max(1000, Number(otp.poll_interval_ms) || 3000)),
      max_wait_ms: Math.min(180000, Math.max(5000, Number(otp.max_wait_ms) || 90000)),
    },
    login: { mode: loginMode, kind },
    phone: { mode: loginMode },
  }
}

const digits = (s: unknown) => String(s || '').replace(/\D/g, '').slice(0, 16)

export function normalizeSlot(raw: unknown, fallback = ''): SeqSlot {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  let start = digits(src.start)
  let next = digits(src.next)
  if (!start && fallback) start = fallback
  if (!next && start) next = start
  return { start, next }
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
  let id = slugEnvKey(String(src.id || src.key || ''), '')
  const preset = PRESET_BY_ID[String(src.platform || id || '')] || PRESET_BY_ID[id]
  const kind = String(src.kind || preset?.kind || 'web')
  const platform = String(src.platform || preset?.platform || (kind === 'app' ? 'android' : kind))
  if (!id && preset && !seen.has(preset.id)) id = preset.id
  if (!id) {
    const stem = slugEnvKey(alias, platform)
    id = stem === platform ? platform : `${platform}.${stem}`
    let n = 2
    const base = id
    while (seen.has(id)) { id = `${base}${n}`; n += 1 }
  }
  if (!id || seen.has(id)) return null
  seen.add(id)
  const field = slugEnvKey(String(src.field || preset?.field || 'value'), 'value')
  return {
    id,
    kind,
    platform,
    alias,
    app_identifier: String(src.app_identifier || '').trim() || (alias ? appIdentifierFromAlias(alias) : ''),
    third_party: src.third_party == null ? Boolean(alias) : Boolean(src.third_party),
    label: alias || String(src.label || preset?.label || id),
    field,
    placeholder: String(src.placeholder || preset?.placeholder || ''),
  }
}

export function normalizeEnvDoc(raw: unknown): EnvDocument {
  const outer = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const src = (outer.env && typeof outer.env === 'object' ? outer.env : outer) as Record<string, unknown>
  const profilesIn = (src.profiles && typeof src.profiles === 'object' ? src.profiles : src) as Record<string, unknown>
  const looksWrapped = !!(src.profiles || src.environments || src.channels || src.pipeline)
  const profileMap = (looksWrapped ? (src.profiles || {}) : profilesIn) as Record<string, Record<string, Record<string, string>>>

  const seen = new Set<string>()
  let channels: EnvChannel[] = []
  for (const row of (Array.isArray(src.channels) ? src.channels : [])) {
    const ch = normalizeChannel(row, seen)
    if (ch) channels.push(ch)
  }
  if (!channels.length) {
    const inferred = new Set<string>()
    Object.values(profileMap || {}).forEach((snap) => {
      if (snap && typeof snap === 'object') Object.keys(snap).forEach((k) => inferred.add(k))
    })
    const want = inferred.size ? [...inferred] : ['android', 'ios', 'web']
    channels = want.map((id) => normalizeChannel(PRESET_BY_ID[id] || { id, label: id, field: 'value' }, seen)).filter(Boolean) as EnvChannel[]
  }

  let environments: EnvEntry[] = (Array.isArray(src.environments) ? src.environments : [])
    .map((e) => {
      const row = e as Record<string, unknown>
      const key = slugEnvKey(String(row?.key || row?.id || row?.label || ''), '')
      return { key, label: String(row?.label || ENV_LABELS[key] || key) }
    })
    .filter((e) => e.key)
  if (!environments.length) {
    const keys = Object.keys(profileMap || {})
    const list = keys.length ? keys : ['test', 'pre', 'prod']
    environments = list.map((key) => ({ key, label: ENV_LABELS[key] || key }))
  }
  const envKeys = environments.map((e) => e.key)
  const envSet = new Set(envKeys)
  let pipeline = (Array.isArray(src.pipeline) ? src.pipeline : []).map((k) => slugEnvKey(String(k), '')).filter((k) => envSet.has(k))
  if (!pipeline.length) pipeline = ['test', 'pre', 'prod'].filter((k) => envSet.has(k))
  if (!pipeline.length) pipeline = envKeys
  const ordered = [
    ...pipeline.map((k) => environments.find((e) => e.key === k)).filter(Boolean) as EnvEntry[],
    ...environments.filter((e) => !pipeline.includes(e.key)),
  ]

  const profiles: EnvDocument['profiles'] = {}
  for (const env of ordered) {
    const snap = (profileMap?.[env.key] && typeof profileMap[env.key] === 'object' ? profileMap[env.key] : {}) as Record<string, Record<string, string>>
    profiles[env.key] = {}
    for (const ch of channels) {
      const block = (snap[ch.id] && typeof snap[ch.id] === 'object' ? snap[ch.id] : {}) as Record<string, string>
      profiles[env.key][ch.id] = {
        [ch.field]: String(block[ch.field] || block.value || block.package || block.bundle || block.base_url || block.path || '').trim(),
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
    default_profile: ordered[0]?.key || 'test',
    environments: ordered,
    channels,
    pipeline: ordered.map((e) => e.key),
    profiles,
    channel_secrets: takeNested(src.channel_secrets, normalizeSecrets),
    channel_gmail_alias: takeNested(src.channel_gmail_alias, (s) => normalizeSlot(s)),
    channel_phone_seq: takeNested(src.channel_phone_seq, (s) => normalizeSlot(s)),
  }
}

export function buildPayload(doc: EnvDocument): EnvDocument {
  const keys = doc.environments.map((e) => e.key)
  const profiles: EnvDocument['profiles'] = {}
  for (const env of doc.environments) {
    profiles[env.key] = {}
    for (const ch of doc.channels) {
      profiles[env.key][ch.id] = { [ch.field]: String(doc.profiles[env.key]?.[ch.id]?.[ch.field] || '').trim() }
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
    default_profile: keys[0] || 'test',
    environments: doc.environments.map((e) => ({ key: e.key, label: e.label || e.key })),
    channels: doc.channels,
    pipeline: keys,
    profiles,
    channel_secrets: secrets,
    channel_gmail_alias: gmail,
    channel_phone_seq: phone,
  }
}
