import { appRuntimeChannels } from './appRuntimeChannels'
import { AccountFactsPanel } from './AccountFactsPanel'
import { ExecutionResourcesPanel } from './ExecutionResourcesPanel'
import { ProjectAppsPanel } from './ProjectAppsPanel'
import type { AppRow } from '@/types/project'
import { useProjects } from '../apps/queries'
import { Link } from 'react-router-dom'
import { projectHref } from '../workbench/projectNavigation'
import { recordAudit } from '@/domains/admin/audit/auditLog'
import { useEffect, useMemo, useState, useRef } from 'react'
import { useUrlState } from '@/hooks/useUrlState'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, TriangleAlert } from 'lucide-react'
import { Alert, Button, EmptyState, Input, Modal, Select, Skeleton, errText, useFeedback } from '@/ui'
import { ControlRegistry } from './ControlRegistry'
import { MaintainersPanel } from './MaintainersPanel'
import { getProjectEnv, updateProjectEnv } from '@/api/projectEnv'
import { unwrapOne } from '@/lib/unwrap'
import { copyToClipboard } from '@/lib/clipboard'
import { AppEnvCard } from './AppEnvCard'
import {
  buildPayload, buildWritePayload, environmentWriteIssues, channelConfigVar, channelKindText, channelTitle,
  emptySecrets, normalizeEnvDoc, normalizeSecrets, normalizeSlot, slugEnvKey,
  type EnvDocument,
} from './envModel'

/** 配置分类由工作台导航统一承载，应用内只保留环境与平台选择。 */
export function EnvConfigPanel({ projectId, appId }: { projectId: string; appId: string }) {
  const [view] = useUrlState<string>('configView', 'apps', ['apps', 'environment', 'development', 'login-evidence', 'controls', 'maintainers', 'account-facts', 'execution-resources'])
  return <div className="w-config-host">
    {['apps', 'environment', 'development', 'login-evidence'].includes(view) && <ProjectAppsPanel projectId={projectId} legacySection={view === 'environment' ? 'environment' : view === 'development' ? 'development' : view === 'login-evidence' ? 'login' : undefined} />}
    {view === 'controls' && <ControlRegistry projectId={projectId} appId={appId} />}
    {view === 'account-facts' && <AccountFactsPanel projectId={projectId} />}
    {view === 'execution-resources' && <ExecutionResourcesPanel projectId={projectId} />}
    {view === 'maintainers' && <MaintainersPanel projectId={projectId} />}
  </div>
}

export function EnvironmentSettings({ projectId, application }: { projectId: string; application?: AppRow }) {
  const projects = useProjects()
  const fb = useFeedback()
  const qc = useQueryClient()
  const [doc, setDoc] = useState<EnvDocument | null>(null)
  const [active, setActive] = useState('')
  const [appId, setAppId] = useState('')
  const [saved, setSaved] = useState('')
  const [incomingChanged, setIncomingChanged] = useState(false)
  const [addEnv, setAddEnv] = useState(false)
  const [envLabel, setEnvLabel] = useState('')


  const query = useQuery({
    queryKey: ['project', projectId, 'env'],
    enabled: !!projectId,
    queryFn: async () => normalizeEnvDoc(unwrapOne(await getProjectEnv(projectId))),
  })

  const draftSnapshot = useRef({ doc, saved })
  draftSnapshot.current = { doc, saved }
  useEffect(() => {
    const { doc, saved } = draftSnapshot.current
    if (!query.data) return
    const incoming = JSON.stringify(buildPayload(query.data))
    if (doc && JSON.stringify(buildPayload(doc)) !== saved) { setIncomingChanged(incoming !== saved); return }
    setDoc(query.data)
    setActive(current => query.data.environments.some(row => row.key === current) ? current : query.data.default_profile)
    setSaved(incoming)
    setIncomingChanged(false)
  }, [query.data])

  const dirty = useMemo(() => (doc ? JSON.stringify(buildPayload(doc)) !== saved : false), [doc, saved])
  useUnsavedChanges(dirty)
  const platformIssues = doc ? environmentWriteIssues(doc) : []
  const env = doc?.environments.find((e) => e.key === active) || doc?.environments[0]
  const runtime = appRuntimeChannels(doc, application, projects.data?.find(p => p.id === projectId)?.apps || [])
  const { channels } = runtime
  const channel = channels.find(c => c.id === appId) || (!runtime.needsSelection ? channels[0] : undefined)

  const save = useMutation({
    mutationFn: (snapshot: EnvDocument) => updateProjectEnv(projectId, snapshot),
    onSuccess: (_response, snapshot) => {
      setSaved(JSON.stringify(snapshot))
      void qc.invalidateQueries({ queryKey: ['project', projectId, 'env'] })
      recordAudit('环境配置保存')
      fb.ok('环境配置已保存')
    },
    onError: (e) => fb.fail(errText(e, '保存失败')),
  })

  const patch = (next: EnvDocument) => { if (save.isPending) return; setDoc({ ...next, pipeline: next.environments.map((e) => e.key), default_profile: next.environments.some(row => row.key === next.default_profile) ? next.default_profile : next.environments[0]?.key || 'test' }) }

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

  if (!projectId) {
    return <EmptyState icon={<TriangleAlert size={28} />} title="缺少项目信息" hint="从项目列表重新进入，链接里需要带 projectId。" />
  }
  if (query.isError && !doc) {
    return <EmptyState title="读取环境配置失败" hint={errText(query.error)} action={<Button size="small" onClick={() => void query.refetch()}>重试</Button>} />
  }
  if (query.isLoading || !doc || !env) return <Skeleton active paragraph={{ rows: 8 }} title={{ width: 160 }} />

  return (
    <div className={application ? "w-app-env" : "w-env-layout"}>
      {!application && <aside className="w-env-nav">
        {!application && <label className="w-form-field" style={{ marginBottom: 24 }}>默认运行环境<Select aria-label="默认运行环境" value={doc.default_profile} disabled={save.isPending} onChange={value => patch({ ...doc, default_profile: value })} options={doc.environments.map(row => ({ value: row.key, label: row.label }))} /></label>}
        <div style={{ fontSize: 'var(--w-font-sm)', fontWeight: 700, marginBottom: 4 }}>{application ? '运行环境' : '环境顺序'}</div>
        <p className="w-form-hint">{application ? '仅编辑当前应用在所选环境下的运行参数' : '环境由项目统一管理，应用配置复用这些环境'}</p>
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
              <span className="min-w-0" style={{ overflowWrap: 'anywhere', fontWeight: row.key === env.key ? 700 : 600 }}>{row.label}{row.key === doc.default_profile && <span className="w-form-hint"> · 默认</span>}</span>
            </button>
            {!application && <Button size="small" type="text" disabled={save.isPending || index === 0} onClick={() => move(index, -1)} aria-label="上移">↑</Button>}
            {!application && <Button size="small" type="text" disabled={save.isPending || index === doc.environments.length - 1} onClick={() => move(index, 1)} aria-label="下移">↓</Button>}
          </div>
        ))}
        {!application && <Button size="small" icon={<Plus size={13} />} onClick={() => setAddEnv(true)}>新增环境</Button>}
      </aside>}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" style={{ gap: 12 }}>
        {query.isError && <p role="alert">环境刷新失败，当前草稿已保留。{errText(query.error)}<Button disabled={save.isPending} onClick={() => void query.refetch()}>重试读取</Button></p>}
        {incomingChanged && <p role="alert">服务端配置已更新，未覆盖你的草稿。<Button disabled={save.isPending} onClick={() => { if (query.data) { setDoc(query.data); setSaved(JSON.stringify(buildPayload(query.data))); setIncomingChanged(false) } }}>放弃草稿并读取新配置</Button></p>}
        <div className="w-env-toolbar">
          {application ? <>
            <label className="w-env-choice">运行环境<Select aria-label="应用运行环境" value={env.key} options={doc.environments.map(row => ({ value: row.key, label: row.label + (row.key === doc.default_profile ? '（默认）' : '') }))} onChange={setActive} /></label>
            <label className="w-env-choice">运行平台<Select aria-label="应用运行平台" value={channel?.id} placeholder="选择运行平台" options={channels.map(row => ({ value: row.id, label: runtime.legacy ? `${channelKindText(row)} · ${channelTitle(row)}` : channelKindText(row) }))} onChange={setAppId} /></label>
          </> : <Input
            value={env.label}
            onChange={(e) => patch({
              ...doc,
              environments: doc.environments.map((row) => row.key === env.key ? { ...row, label: e.target.value } : row),
            })}
            style={{ width: 180 }}
            aria-label="环境名称"
          />}
          {!application && <span className="w-form-hint">顺序 {doc.environments.findIndex((e) => e.key === env.key) + 1} · {env.key}</span>}
          <span style={{ flex: 1 }} />
          {dirty && <span style={{ fontSize: 'var(--w-font-meta)', fontWeight: 700, color: 'var(--w-warn)' }}>有未保存修改</span>}
          {!application && <Button size="small" danger disabled={save.isPending || doc.environments.length <= 1} onClick={() => {
            void fb.confirm({ title: `删除环境「${env.label}」？`, content: '各应用在这个环境下的配置会一起丢掉。', danger: true, okText: '删除' }).then((ok) => {
              if (!ok) return
              const environments = doc.environments.filter((row) => row.key !== env.key)
              patch({ ...doc, environments })
              setActive(environments[0]?.key || '')
            })
          }}
          >删除环境</Button>}
          <Button size="small" disabled={save.isPending || query.isFetching} onClick={() => void query.refetch()}>检查新配置</Button>
          <Button type="primary" size="small" icon={<Save size={13} />} disabled={!dirty || incomingChanged || query.isError || platformIssues.length > 0} loading={save.isPending} onClick={() => { try { save.mutate(buildWritePayload(doc!)) } catch (e) { fb.fail(errText(e)) } }}>保存全部配置</Button>
        </div>

        {platformIssues.length > 0 && <Alert type="warning" showIcon message="历史平台配置需要迁移确认，暂不可保存" description={platformIssues.join("；")} />}
        {application && runtime.legacy && <Alert type="info" showIcon message={runtime.needsSelection ? '已有运行配置尚未明确归属，请从列表选择要编辑的配置。' : '已读取现有运行配置，无需重新填写。'} description="修改会保存到所选的原配置；启动地址、登录策略与其他环境参数继续沿用。" />}
        {save.isError && <Alert type="error" showIcon message="保存失败，所有环境草稿均已保留" description={errText(save.error)} />}
        {!application ? <div className="w-surface-card p-5 overflow-auto"><h2>项目环境</h2><p>这里统一管理环境名称、顺序和默认项。启动地址、登录策略和开发配置在应用中维护。</p>
          {projects.isError ? <Alert type="error" message="应用列表读取失败" /> : (projects.data?.find(p => p.id === projectId)?.apps || []).map(app => <div key={app.id} className="flex flex-wrap items-center justify-between gap-3 py-3" style={{ borderBottom: '1px solid var(--w-border)' }}><strong>{app.name}</strong><Link to={projectHref(projectId, { tab: 'config', configView: 'apps', appId: app.id, appConfig: 'runtime' })}>配置应用</Link></div>)}
          <Link to={projectHref(projectId, { tab: 'config', configView: 'apps' })}>管理项目应用</Link>
        </div> : <div className="w-env-form" role="region" aria-label="应用运行配置" tabIndex={0}>
            {channel?.app_id && doc.channels.some(c => !c.app_id && c.platform === channel.platform) && <div className="w-surface-card p-4 mb-3">
              <p>此平台存在尚未关联的历史配置。可选择复用，原地址、登录策略及其他环境参数会一并保留。</p>
              <Select aria-label="复用已有运行配置" placeholder="选择已有配置（可选）" style={{ width: '100%' }} value={undefined} disabled={save.isPending} options={doc.channels.filter(c => !c.app_id && c.platform === channel.platform).map(c => ({ value: c.id, label: channelTitle(c) }))} onChange={id => {
                patch({ ...doc, channels: doc.channels.map(c => c.id === id ? { ...c, app_id: application.id } : c.id === channel.id ? { ...c, app_id: undefined } : c) })
                setAppId(id)
              }} />
            </div>}
            {channel ? (
              <AppEnvCard
                disabled={save.isPending}
                channel={{ ...channel, label: application.name || channel.label, alias: '' }}
                value={doc.profiles[env.key]?.[channel.id]?.[channel.field] || ''}
                inheritHint=""
                secrets={normalizeSecrets(doc.channel_secrets[channel.id]?.[env.key])}
                phone={normalizeSlot(doc.channel_phone_seq[channel.id]?.[env.key], '17000000000')}
                gmail={normalizeSlot(doc.channel_gmail_alias[channel.id]?.[env.key], '10000')}
                onValue={(v) => {
                  const profiles = { ...doc.profiles, [env.key]: { ...doc.profiles[env.key], [channel.id]: { ...doc.profiles[env.key]?.[channel.id], [channel.field]: v } } }
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
                onCopy={() => {
                  const text = channelConfigVar(channel)
                  void copyToClipboard(text).then(() => fb.ok('已复制占位符')).catch(() => fb.info(text))
                }}
              />
            ) : (
              <EmptyState title={channels.length ? "请选择已有运行配置" : "未找到匹配当前应用平台的配置"} hint={channels.length ? "选择上方运行平台后即可查看和编辑已有配置。" : "请重新读取配置；已有数据不会在此删除或覆盖。"} action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>重新读取配置</Button>} />
            )}
        </div>}
      </section>

      <Modal title="新增环境" open={addEnv} onCancel={() => setAddEnv(false)} onOk={confirmEnv} okText="添加">
        <Input value={envLabel} placeholder="例如：灰度" onChange={(e) => setEnvLabel(e.target.value)} onPressEnter={confirmEnv} />
      </Modal>

    </div>
  )
}
