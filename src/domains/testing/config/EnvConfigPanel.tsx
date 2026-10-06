import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, TriangleAlert } from 'lucide-react'
import { Button, EmptyState, Input, Modal, Select, Skeleton, errText, useFeedback } from '@/ui'
import { getProjectEnv, updateProjectEnv } from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'
import { AppEnvCard } from './AppEnvCard'
import {
  APP_PLATFORMS, CHANNEL_KINDS, appIdentifierFromAlias, buildPayload, channelConfigVar, channelTitle,
  emptySecrets, normalizeEnvDoc, normalizeSecrets, normalizeSlot, slugEnvKey,
  type EnvChannel, type EnvDocument, type EnvSecrets,
} from './envModel'

/**
 * 环境配置。
 * 左边是上线顺序。中间是这个环境下的应用清单，一行看清启动地址和登录方式。
 * 右边只编辑当前选中的应用，避免两张完整表单叠在一起上下翻。
 */
export function EnvConfigPanel() {
  const [params] = useSearchParams()
  const projectId = params.get('projectId') || ''
  const fb = useFeedback()
  const qc = useQueryClient()
  const [doc, setDoc] = useState<EnvDocument | null>(null)
  const [active, setActive] = useState('')
  const [appId, setAppId] = useState('')
  const [saved, setSaved] = useState('')
  const [addEnv, setAddEnv] = useState(false)
  const [envLabel, setEnvLabel] = useState('')
  const [addApp, setAddApp] = useState(false)
  const [kind, setKind] = useState('web')
  const [platform, setPlatform] = useState('android')
  const [alias, setAlias] = useState('')
  const [ident, setIdent] = useState('')

  const query = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: !!projectId,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })

  useEffect(() => {
    if (!query.data) return
    setDoc(query.data)
    setActive(query.data.environments[0]?.key || '')
    setSaved(JSON.stringify(buildPayload(query.data)))
  }, [query.data])

  const dirty = useMemo(() => (doc ? JSON.stringify(buildPayload(doc)) !== saved : false), [doc, saved])
  const env = doc?.environments.find((e) => e.key === active) || doc?.environments[0]
  const channel = doc?.channels.find((c) => c.id === appId) || doc?.channels[0]

  const save = useMutation({
    mutationFn: () => updateProjectEnv(projectId, buildPayload(doc!)),
    onSuccess: () => {
      setSaved(JSON.stringify(buildPayload(doc!)))
      void qc.invalidateQueries({ queryKey: ['project', projectId, 'env'] })
      fb.ok('环境配置已保存')
    },
    onError: (e) => fb.fail(errText(e, '保存失败')),
  })

  const patch = (next: EnvDocument) => setDoc({ ...next, pipeline: next.environments.map((e) => e.key), default_profile: next.environments[0]?.key || 'test' })

  const move = (index: number, dir: number) => {
    if (!doc) return
    const j = index + dir
    if (j < 0 || j >= doc.environments.length) return
    const environments = [...doc.environments]
    const [row] = environments.splice(index, 1)
    environments.splice(j, 0, row)
    patch({ ...doc, environments })
  }

  const confirmEnv = () => {
    if (!doc) return
    const label = envLabel.trim()
    if (!label) return fb.warn('请填写环境名称')
    let key = slugEnvKey(label, 'env')
    if (doc.environments.some((e) => e.key === key)) key = `${key}${doc.environments.length + 1}`
    const profiles = { ...doc.profiles, [key]: {} }
    const channel_secrets = { ...doc.channel_secrets }
    for (const ch of doc.channels) {
      profiles[key][ch.id] = { [ch.field]: '' }
      channel_secrets[ch.id] = { ...(channel_secrets[ch.id] || {}), [key]: emptySecrets() }
    }
    patch({ ...doc, environments: [...doc.environments, { key, label }], profiles, channel_secrets })
    setActive(key)
    setEnvLabel('')
    setAddEnv(false)
  }

  const confirmApp = () => {
    if (!doc) return
    const name = alias.trim()
    if (!name) return fb.warn('请填写简称')
    const appIdent = appIdentifierFromAlias(ident || name)
    if (!appIdent) return fb.warn('应用标识需要英文字母或数字')
    const plat = kind === 'app' ? platform : kind
    const preset = [...APP_PLATFORMS, { id: 'web', field: 'base_url', placeholder: 'https://' }, { id: 'server', field: 'base_url', placeholder: 'https://' }]
      .find((p) => p.id === plat)
    let id = appIdent === plat ? plat : `${plat}.${appIdent}`
    if (doc.channels.some((c) => c.id === id)) id = `${id}${doc.channels.length + 1}`
    const ch: EnvChannel = {
      id, kind, platform: plat, alias: name, app_identifier: appIdent, third_party: true,
      label: name, field: preset && 'field' in preset ? preset.field : 'value',
      placeholder: preset && 'placeholder' in preset ? String(preset.placeholder || '') : '',
    }
    const profiles = { ...doc.profiles }
    const channel_secrets = { ...doc.channel_secrets, [id]: {} as Record<string, EnvSecrets> }
    for (const row of doc.environments) {
      profiles[row.key] = { ...(profiles[row.key] || {}), [id]: { [ch.field]: '' } }
      channel_secrets[id][row.key] = emptySecrets()
    }
    patch({ ...doc, channels: [...doc.channels, ch], profiles, channel_secrets })
    setAppId(id)
    setAddApp(false)
    setAlias('')
    setIdent('')
  }

  const removeApp = async (id: string) => {
    if (!doc || doc.channels.length <= 1) return
    const ch = doc.channels.find((c) => c.id === id)
    const ok = await fb.confirm({ title: `删除应用「${channelTitle(ch!)}」？`, content: '所有环境下这项配置都会丢掉。', danger: true, okText: '删除' })
    if (!ok) return
    const profiles = { ...doc.profiles }
    for (const row of doc.environments) {
      const snap = { ...(profiles[row.key] || {}) }
      delete snap[id]
      profiles[row.key] = snap
    }
    const channel_secrets = { ...doc.channel_secrets }
    delete channel_secrets[id]
    patch({ ...doc, channels: doc.channels.filter((c) => c.id !== id), profiles, channel_secrets })
  }

  if (!projectId) {
    return <EmptyState icon={<TriangleAlert size={28} />} title="缺少项目信息" hint="从应用列表重新进入，链接里需要带 projectId。" />
  }
  if (query.isLoading || !doc || !env) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />
  if (query.isError) {
    return <EmptyState title="读取环境配置失败" hint={errText(query.error)} action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>} />
  }

  return (
    <div className="flex h-full min-h-0" style={{ gap: 'var(--w-space-3)' }}>
      <aside className="shrink-0 overflow-y-auto" style={{ width: 'clamp(148px, 16%, 220px)' }}>
        <div style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700, marginBottom: 4 }}>上线顺序</div>
        <p style={{ margin: '0 0 8px', fontSize: 'var(--w-font-meta)', color: 'var(--w-text-quaternary)' }}>从上到下依次上线</p>
        {doc.environments.map((row, index) => (
          <div key={row.key} className="flex items-center" style={{ marginBottom: 4 }}>
            <button
              type="button"
              data-active={row.key === env.key ? 'true' : 'false'}
              className="w-hit flex flex-1 items-center gap-2"
              onClick={() => setActive(row.key)}
              style={{ border: 'none', cursor: 'pointer', borderRadius: 'var(--w-radius-sm)', padding: '8px 8px', textAlign: 'left', color: 'var(--w-text)' }}
            >
              <span style={{ width: 18, color: 'var(--w-text-quaternary)', fontSize: 'var(--w-font-meta)' }}>{index + 1}</span>
              <span className="truncate" style={{ fontWeight: row.key === env.key ? 700 : 600 }}>{row.label}</span>
            </button>
            <Button size="small" type="text" disabled={index === 0} onClick={() => move(index, -1)} aria-label="上移">↑</Button>
            <Button size="small" type="text" disabled={index === doc.environments.length - 1} onClick={() => move(index, 1)} aria-label="下移">↓</Button>
          </div>
        ))}
        <Button size="small" icon={<Plus size={13} />} onClick={() => setAddEnv(true)}>新增环境</Button>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ gap: 12 }}>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={env.label}
            onChange={(e) => patch({
              ...doc,
              environments: doc.environments.map((row) => row.key === env.key ? { ...row, label: e.target.value } : row),
            })}
            style={{ width: 180 }}
            aria-label="环境名称"
          />
          <span style={{ fontSize: 'var(--w-font-sm)', color: 'var(--w-text-quaternary)' }}>第 {doc.environments.findIndex((e) => e.key === env.key) + 1} 步 · {env.key}</span>
          <span style={{ flex: 1 }} />
          {dirty && <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}>有未保存的改动</span>}
          <Button size="small" danger disabled={doc.environments.length <= 1} onClick={() => {
            void fb.confirm({ title: `删除环境「${env.label}」？`, content: '各应用在这个环境下的配置会一起丢掉。', danger: true, okText: '删除' }).then((ok) => {
              if (!ok) return
              const environments = doc.environments.filter((row) => row.key !== env.key)
              patch({ ...doc, environments })
              setActive(environments[0]?.key || '')
            })
          }}
          >删除环境</Button>
          <Button type="primary" size="small" icon={<Save size={13} />} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate()}>保存</Button>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-wrap content-start overflow-y-auto" style={{ gap: 12 }}>
          <aside className="flex flex-col" style={{ flex: '1 1 240px', maxWidth: 300, gap: 6 }}>
            <div className="flex items-center gap-2">
              <strong style={{ fontSize: 'var(--w-font-sm)' }}>应用</strong>
              <span style={{ flex: 1 }} />
              <Button size="small" icon={<Plus size={13} />} onClick={() => setAddApp(true)}>新增</Button>
            </div>
            {doc.channels.map((ch) => {
              const fact = appFacts(doc, env.key, ch)
              const on = (channel?.id || '') === ch.id
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setAppId(ch.id)}
                  className="w-hit text-left"
                  style={{
                    border: `1px solid ${on ? 'var(--w-primary)' : 'var(--w-border)'}`,
                    borderRadius: 'var(--w-radius)',
                    background: on ? 'var(--w-primary-soft)' : 'var(--w-surface)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div className="truncate" style={{ fontWeight: 700 }}>{channelTitle(ch)}</div>
                  <div className="truncate" style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: fact.launch ? 'var(--w-text-secondary)' : 'var(--w-warn)' }}>
                    {fact.launch || '未填启动地址'}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 'var(--w-font-meta)', color: 'var(--w-text-tertiary)' }}>
                    {fact.login} · {fact.otp}
                  </div>
                </button>
              )
            })}
          </aside>
          <div className="min-w-0" style={{ flex: '3 1 420px', paddingBottom: 28 }}>
            {channel ? (
              <AppEnvCard
                channel={channel}
                value={doc.profiles[env.key]?.[channel.id]?.[channel.field] || ''}
                inheritHint=""
                secrets={normalizeSecrets(doc.channel_secrets[channel.id]?.[env.key])}
                phone={normalizeSlot(doc.channel_phone_seq[channel.id]?.[env.key], '17000000000')}
                gmail={normalizeSlot(doc.channel_gmail_alias[channel.id]?.[env.key], '10000')}
                onValue={(v) => {
                  const profiles = { ...doc.profiles, [env.key]: { ...doc.profiles[env.key], [channel.id]: { [channel.field]: v } } }
                  patch({ ...doc, profiles })
                }}
                onSecrets={(next) => {
                  const channel_secrets = { ...doc.channel_secrets, [channel.id]: { ...(doc.channel_secrets[channel.id] || {}), [env.key]: next } }
                  patch({ ...doc, channel_secrets })
                }}
                onPhoneStart={(v) => {
                  const slot = normalizeSlot({ start: v, next: doc.channel_phone_seq[channel.id]?.[env.key]?.next || v })
                  const channel_phone_seq = { ...doc.channel_phone_seq, [channel.id]: { ...(doc.channel_phone_seq[channel.id] || {}), [env.key]: slot } }
                  patch({ ...doc, channel_phone_seq })
                }}
                onGmailStart={(v) => {
                  const slot = normalizeSlot({ start: v, next: doc.channel_gmail_alias[channel.id]?.[env.key]?.next || v })
                  const channel_gmail_alias = { ...doc.channel_gmail_alias, [channel.id]: { ...(doc.channel_gmail_alias[channel.id] || {}), [env.key]: slot } }
                  patch({ ...doc, channel_gmail_alias })
                }}
                onRemove={() => void removeApp(channel.id)}
                onCopy={() => {
                  const text = channelConfigVar(channel)
                  void navigator.clipboard.writeText(text).then(() => fb.ok('已复制占位符')).catch(() => fb.info(text))
                }}
              />
            ) : (
              <EmptyState title="还没有应用" hint="先新增一个应用，再填这个环境下的启动地址和登录方式。" />
            )}
          </div>
        </div>
      </section>

      <Modal title="新增环境" open={addEnv} onCancel={() => setAddEnv(false)} onOk={confirmEnv} okText="添加">
        <Input value={envLabel} placeholder="例如：灰度" onChange={(e) => setEnvLabel(e.target.value)} onPressEnter={confirmEnv} />
      </Modal>
      <Modal title="新增应用" open={addApp} onCancel={() => setAddApp(false)} onOk={confirmApp} okText="添加">
        <div className="flex flex-col" style={{ gap: 10 }}>
          <Select value={kind} options={CHANNEL_KINDS.map((k) => ({ value: k.id, label: k.label }))} onChange={setKind} />
          {kind === 'app' && <Select value={platform} options={APP_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} onChange={setPlatform} />}
          <Input value={alias} placeholder="简称，例如 Hi3D、管理后台" onChange={(e) => { setAlias(e.target.value); setIdent(appIdentifierFromAlias(e.target.value)) }} />
          <Input value={ident} placeholder="应用标识，英文、数字与下划线" onChange={(e) => setIdent(e.target.value)} />
        </div>
      </Modal>
    </div>
  )
}

const OTP_TEXT: Record<string, string> = {
  auto: '验证码自动',
  fixed: '固定码',
  gmail: 'Gmail 收信',
  hitl: '验证码问人',
}
const LOGIN_TEXT: Record<string, string> = {
  auto: '登录自动',
  pool: '账号管理',
  hitl: '登录问人',
}

function appFacts(doc: EnvDocument, envKey: string, ch: EnvChannel) {
  const secrets = normalizeSecrets(doc.channel_secrets[ch.id]?.[envKey])
  return {
    launch: String(doc.profiles[envKey]?.[ch.id]?.[ch.field] || '').trim(),
    otp: OTP_TEXT[secrets.otp.mode] || secrets.otp.mode,
    login: LOGIN_TEXT[secrets.login.mode] || secrets.login.mode,
  }
}
